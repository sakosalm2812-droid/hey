-- Durable command transport only. The trusted server endpoint must authenticate
-- the account, verify the applicable mandate, and authorize the target device
-- before it calls these service-role-only RPCs. This queue does not verify
-- mandates, deliver commands, or execute them.
-- A single device row lock serializes enqueue and caps pending commands at 100.
create unique index if not exists hey_devices_id_user_uidx on public.hey_devices(id, user_id);

create table if not exists public.hey_device_commands (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  idempotency_key text not null check (length(trim(idempotency_key)) between 1 and 256 and idempotency_key !~ '[[:cntrl:]]'),
  envelope jsonb not null check (coalesce((
    jsonb_typeof(envelope) = 'object'
    and envelope->>'version' = '1'
    and jsonb_typeof(envelope->'action') = 'string'
    and length(envelope->>'action') between 1 and 128
    and envelope->>'action' ~ '^[A-Za-z][A-Za-z0-9_.:-]*$'
    and jsonb_typeof(envelope->'resource') = 'string'
    and length(trim(envelope->>'resource')) between 1 and 256
    and envelope->>'resource' !~ '[[:cntrl:]]'
    and jsonb_typeof(envelope->'input') = 'object'
    and (envelope - array['version','action','resource','input']) = '{}'::jsonb
    and octet_length(envelope::text) <= 65536
  ), false)),
  state text not null default 'pending' check (state in ('pending', 'acknowledged', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default clock_timestamp(),
  acknowledged_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  last_error text check (last_error is null or last_error = 'delivery_failed'),
  unique (account_id, device_id, idempotency_key),
  foreign key (device_id, account_id) references public.hey_devices(id, user_id) on delete cascade,
  check ((lease_token is null) = (lease_until is null))
);

create index if not exists hey_device_commands_pending_idx
  on public.hey_device_commands(account_id, device_id, created_at, id)
  where state = 'pending';

alter table public.hey_device_commands enable row level security;
revoke all on public.hey_device_commands from public, anon, authenticated, service_role;

create or replace function public.enqueue_hey_device_command(
  p_account_id uuid, p_device_id uuid, p_idempotency_key text, p_envelope jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_command public.hey_device_commands%rowtype;
  v_device public.hey_devices%rowtype;
  v_pending_count bigint;
  v_created boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted device command service required.' using errcode = '42501';
  end if;
  if p_account_id is null or p_device_id is null
    or p_idempotency_key is null or length(trim(p_idempotency_key)) not between 1 and 256
    or p_idempotency_key ~ '[[:cntrl:]]'
    or p_envelope is null or jsonb_typeof(p_envelope) is distinct from 'object'
    or p_envelope->>'version' is distinct from '1'
    or jsonb_typeof(p_envelope->'action') is distinct from 'string'
    or length(p_envelope->>'action') not between 1 and 128
    or p_envelope->>'action' !~ '^[A-Za-z][A-Za-z0-9_.:-]*$'
    or jsonb_typeof(p_envelope->'resource') is distinct from 'string'
    or length(trim(p_envelope->>'resource')) not between 1 and 256
    or p_envelope->>'resource' ~ '[[:cntrl:]]'
    or jsonb_typeof(p_envelope->'input') is distinct from 'object'
    or (p_envelope - array['version','action','resource','input']) <> '{}'::jsonb
    or octet_length(p_envelope::text) > 65536 then
    raise exception 'Invalid device command.' using errcode = '22023';
  end if;
  select * into v_device from public.hey_devices d
    where d.id = p_device_id and d.user_id = p_account_id and d.status <> 'revoked'
    for update;
  if not found then
    raise exception 'Device command unavailable.' using errcode = '42501';
  end if;
  select * into v_command from public.hey_device_commands
    where account_id = p_account_id and device_id = p_device_id and idempotency_key = trim(p_idempotency_key)
    for update;
  if found then
    if v_command.envelope is distinct from p_envelope then
      raise exception 'Device command idempotency conflict.' using errcode = '23505';
    end if;
    return jsonb_build_object('created', false, 'command', jsonb_build_object(
      'commandId', v_command.id, 'deviceId', v_command.device_id, 'envelope', v_command.envelope,
      'state', v_command.state, 'attempts', v_command.attempts, 'createdAt', v_command.created_at,
      'lastError', v_command.last_error
    ));
  end if;
  select count(*) into v_pending_count from public.hey_device_commands
    where account_id = p_account_id and device_id = p_device_id and state = 'pending';
  if v_pending_count >= 100 then
    raise exception 'Device command queue is full.' using errcode = '54000';
  end if;
  insert into public.hey_device_commands(account_id, device_id, idempotency_key, envelope)
    values (p_account_id, p_device_id, trim(p_idempotency_key), p_envelope)
    returning * into v_command;
  if found then
    v_created := true;
  end if;
  return jsonb_build_object('created', v_created, 'command', jsonb_build_object(
    'commandId', v_command.id, 'deviceId', v_command.device_id, 'envelope', v_command.envelope,
    'state', v_command.state, 'attempts', v_command.attempts, 'createdAt', v_command.created_at,
    'lastError', v_command.last_error
  ));
end;
$$;

create or replace function public.claim_hey_device_command(p_account_id uuid, p_device_id uuid, p_lease_ms integer)
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_command public.hey_device_commands%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted device command service required.' using errcode = '42501';
  end if;
  if p_account_id is null or p_device_id is null or p_lease_ms is null or p_lease_ms not between 1 and 300000 then
    raise exception 'Invalid device command lease.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.hey_devices d where d.id = p_device_id and d.user_id = p_account_id and d.status <> 'revoked') then
    return null;
  end if;
  select * into v_command from public.hey_device_commands c
    where c.account_id = p_account_id and c.device_id = p_device_id and c.state = 'pending'
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

create or replace function public.ack_hey_device_command(
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
    raise exception 'Invalid device command acknowledgement.' using errcode = '22023';
  end if;
  update public.hey_device_commands c
    set state = 'acknowledged', acknowledged_at = clock_timestamp(), lease_token = null, lease_until = null, last_error = null
    where c.id = p_command_id and c.account_id = p_account_id and c.device_id = p_device_id
      and c.state = 'pending' and c.lease_token = p_lease_token and c.lease_until > clock_timestamp()
      and exists (select 1 from public.hey_devices d where d.id = p_device_id and d.user_id = p_account_id and d.status <> 'revoked');
  return found;
end;
$$;

-- A device revocation atomically invalidates pending and leased commands.
create or replace function public.cancel_hey_device_commands_on_revoke()
returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.status = 'revoked' and old.status is distinct from 'revoked' then
    update public.hey_device_commands set state = 'cancelled', lease_token = null, lease_until = null
      where account_id = new.user_id and device_id = new.id and state = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists hey_devices_cancel_commands_on_revoke on public.hey_devices;
create trigger hey_devices_cancel_commands_on_revoke
  after update of status on public.hey_devices
  for each row execute function public.cancel_hey_device_commands_on_revoke();

revoke all on function public.enqueue_hey_device_command(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.claim_hey_device_command(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.ack_hey_device_command(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancel_hey_device_commands_on_revoke() from public, anon, authenticated, service_role;
grant execute on function public.enqueue_hey_device_command(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.claim_hey_device_command(uuid, uuid, integer) to service_role;
grant execute on function public.ack_hey_device_command(uuid, uuid, uuid, uuid) to service_role;
