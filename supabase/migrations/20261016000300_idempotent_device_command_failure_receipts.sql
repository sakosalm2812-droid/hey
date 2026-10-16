-- A lost failure response must be retry-safe. Receipts bind the completed
-- failure transition to its exact command lease, without storing credentials,
-- command envelopes, or device-provided error details. Delivery has at most
-- five leases per command, so receipt growth is naturally bounded.
create table public.hey_device_command_failure_receipts (
  account_id uuid not null,
  device_id uuid not null,
  command_id uuid not null references public.hey_device_commands(id) on delete cascade,
  lease_token uuid not null,
  processed_at timestamptz not null default clock_timestamp(),
  primary key (command_id, lease_token),
  foreign key (device_id, account_id) references public.hey_devices(id, user_id) on delete cascade
);

alter table public.hey_device_command_failure_receipts enable row level security;
revoke all on public.hey_device_command_failure_receipts from public, anon, authenticated, service_role;

create or replace function public.fail_hey_device_command(
  p_account_id uuid, p_device_id uuid, p_command_id uuid, p_lease_token uuid
) returns boolean
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_updated_command_id uuid;
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
      and public.hey_device_command_mandate_is_current(c.account_id, c.mandate_ids, c.mandate_expires_at, c.mandate_revocation_epoch)
      and exists (select 1 from public.hey_devices d where d.id = p_device_id and d.user_id = p_account_id
        and d.status in ('online', 'offline') and d.capabilities @> jsonb_build_array(c.envelope->>'action'))
      and exists (select 1 from public.hey_permissions p where p.user_id = c.account_id
        and p.permission = c.envelope->>'action' and p.scope = 'account' and p.status = 'granted')
    returning c.id into v_updated_command_id;

  if found then
    insert into public.hey_device_command_failure_receipts(account_id, device_id, command_id, lease_token)
      values (p_account_id, p_device_id, v_updated_command_id, p_lease_token);
    return true;
  end if;

  -- Duplicate delivery of this exact failure is acknowledged without another
  -- attempt increment or backoff change. A current active device and authority
  -- are still required, and the credential-fenced wrapper remains the only
  -- callable path for device transport.
  return exists (
    select 1
      from public.hey_device_command_failure_receipts r
      join public.hey_device_commands c on c.id = r.command_id
        and c.account_id = r.account_id and c.device_id = r.device_id
      join public.hey_devices d on d.id = r.device_id and d.user_id = r.account_id
      where r.account_id = p_account_id and r.device_id = p_device_id
        and r.command_id = p_command_id and r.lease_token = p_lease_token
        and d.status in ('online', 'offline')
        and public.hey_device_command_mandate_is_current(c.account_id, c.mandate_ids, c.mandate_expires_at, c.mandate_revocation_epoch)
        and d.capabilities @> jsonb_build_array(c.envelope->>'action')
        and exists (select 1 from public.hey_permissions p where p.user_id = c.account_id
          and p.permission = c.envelope->>'action' and p.scope = 'account' and p.status = 'granted')
  );
end;
$$;

-- The legacy four-argument RPC is internal to the already credential-fenced
-- wrapper and is never directly callable by clients or the service role.
revoke all on function public.fail_hey_device_command(uuid, uuid, uuid, uuid) from public, anon, authenticated, service_role;
