-- Persist the lease identity that completed the terminal acknowledgement so
-- the same device can safely retry after a lost HTTP response.
alter table public.hey_device_commands
  add column if not exists acknowledged_lease_token uuid;

create or replace function public.ack_hey_device_command(
  p_account_id uuid, p_device_id uuid, p_command_id uuid, p_lease_token uuid
) returns boolean
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_acknowledged boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted device command service required.' using errcode = '42501';
  end if;
  if p_account_id is null or p_device_id is null or p_command_id is null or p_lease_token is null then
    raise exception 'Invalid device command acknowledgement.' using errcode = '22023';
  end if;

  update public.hey_device_commands c
    set state = 'acknowledged', acknowledged_at = clock_timestamp(), acknowledged_lease_token = p_lease_token,
        lease_token = null, lease_until = null, last_error = null
    where c.id = p_command_id and c.account_id = p_account_id and c.device_id = p_device_id
      and c.state = 'pending' and c.lease_token = p_lease_token and c.lease_until > clock_timestamp()
      and exists (select 1 from public.hey_devices d where d.id = c.device_id and d.user_id = c.account_id
        and d.status <> 'revoked' and d.capabilities @> jsonb_build_array(c.envelope->>'action'))
      and exists (select 1 from public.hey_permissions p where p.user_id = c.account_id
        and p.permission = c.envelope->>'action' and p.scope = 'account' and p.status = 'granted');
  if found then
    -- Fixed identifiers and transition labels only; never persist command
    -- content, credentials, lease tokens, or provider/device error text.
    insert into public.hey_audit_log(user_id, action, tool, risk_level, status, request_id, metadata)
      values (p_account_id, 'device.command.acknowledged', 'hey-device-transport', 'low', 'acknowledged',
        p_command_id::text, jsonb_build_object(
          'deviceId', p_device_id, 'commandId', p_command_id, 'transition', 'pending_to_acknowledged'
        ));
    return true;
  end if;

  -- Idempotent retry is accepted only for the exact successful lease, while
  -- the account still owns an active device with the action permission.
  select exists (
    select 1 from public.hey_device_commands c
      join public.hey_devices d on d.id = c.device_id and d.user_id = c.account_id
      where c.id = p_command_id and c.account_id = p_account_id and c.device_id = p_device_id
        and c.state = 'acknowledged' and c.acknowledged_lease_token = p_lease_token
        and d.status <> 'revoked' and d.capabilities @> jsonb_build_array(c.envelope->>'action')
        and exists (select 1 from public.hey_permissions p where p.user_id = c.account_id
          and p.permission = c.envelope->>'action' and p.scope = 'account' and p.status = 'granted')
  ) into v_acknowledged;
  return v_acknowledged;
end;
$$;

revoke all on function public.ack_hey_device_command(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.ack_hey_device_command(uuid, uuid, uuid, uuid) to service_role;
