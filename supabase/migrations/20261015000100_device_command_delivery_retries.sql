-- Retriable delivery failures store a constant label only. Command envelopes,
-- failure details, and device execution results are never written here.
alter table public.hey_device_commands
  add column if not exists available_at timestamptz not null default clock_timestamp();

alter table public.hey_device_commands
  drop constraint if exists hey_device_commands_state_check;
alter table public.hey_device_commands
  add constraint hey_device_commands_state_check
  check (state in ('pending', 'acknowledged', 'cancelled', 'failed'));

create or replace function public.claim_hey_device_command(p_account_id uuid, p_device_id uuid, p_lease_ms integer)
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_command public.hey_device_commands%rowtype;
  v_device public.hey_devices%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted device command service required.' using errcode = '42501';
  end if;
  if p_account_id is null or p_device_id is null or p_lease_ms is null or p_lease_ms not between 1 and 300000 then
    raise exception 'Invalid device command lease.' using errcode = '22023';
  end if;
  select * into v_device from public.hey_devices d
    where d.id = p_device_id and d.user_id = p_account_id and d.status <> 'revoked'
    for update;
  if not found then return null; end if;

  -- A fifth claim that expires without an explicit failure report is terminal.
  update public.hey_device_commands c
    set state = 'failed', lease_token = null, lease_until = null, last_error = 'delivery_failed'
    where c.account_id = p_account_id and c.device_id = p_device_id and c.state = 'pending'
      and c.attempts >= 5 and (c.lease_until is null or c.lease_until <= clock_timestamp());

  select * into v_command from public.hey_device_commands c
    where c.account_id = p_account_id and c.device_id = p_device_id and c.state = 'pending'
      and c.attempts < 5 and c.available_at <= clock_timestamp()
      and (c.lease_until is null or c.lease_until <= clock_timestamp())
    order by c.created_at, c.id limit 1 for update skip locked;
  if not found then return null; end if;
  update public.hey_device_commands set lease_token = gen_random_uuid(),
      lease_until = clock_timestamp() + (p_lease_ms * interval '1 millisecond'), attempts = attempts + 1
    where id = v_command.id returning * into v_command;
  return jsonb_build_object('command', jsonb_build_object(
    'commandId', v_command.id, 'deviceId', v_command.device_id, 'envelope', v_command.envelope,
    'state', v_command.state, 'attempts', v_command.attempts, 'createdAt', v_command.created_at,
    'lastError', v_command.last_error
  ), 'leaseToken', v_command.lease_token);
end;
$$;

create or replace function public.fail_hey_device_command(
  p_account_id uuid, p_device_id uuid, p_command_id uuid, p_lease_token uuid
) returns boolean
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted device command service required.' using errcode = '42501';
  end if;
  if p_account_id is null or p_device_id is null or p_command_id is null or p_lease_token is null then
    raise exception 'Invalid device command failure report.' using errcode = '22023';
  end if;
  update public.hey_device_commands c
    set state = case when c.attempts >= 5 then 'failed' else 'pending' end,
        available_at = case when c.attempts >= 5 then c.available_at else
          clock_timestamp() + make_interval(secs => least(60, power(2, greatest(0, c.attempts - 1))::integer)) end,
        lease_token = null, lease_until = null, last_error = 'delivery_failed'
    where c.id = p_command_id and c.account_id = p_account_id and c.device_id = p_device_id
      and c.state = 'pending' and c.lease_token = p_lease_token and c.lease_until > clock_timestamp()
      and exists (select 1 from public.hey_devices d where d.id = p_device_id and d.user_id = p_account_id and d.status <> 'revoked');
  return found;
end;
$$;

revoke all on function public.claim_hey_device_command(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.fail_hey_device_command(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_hey_device_command(uuid, uuid, integer) to service_role;
grant execute on function public.fail_hey_device_command(uuid, uuid, uuid, uuid) to service_role;
