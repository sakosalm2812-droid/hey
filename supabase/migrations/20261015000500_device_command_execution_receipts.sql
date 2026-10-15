-- Persist the execution boundary on the command row. A restarted worker can
-- acknowledge an already verified result or fail closed after an ambiguous run.
alter table public.hey_device_commands
  add column if not exists execution_state text not null default 'not_started',
  add column if not exists execution_lease_token uuid,
  add column if not exists execution_started_at timestamptz,
  add column if not exists execution_verified_at timestamptz;

alter table public.hey_device_commands
  drop constraint if exists hey_device_commands_execution_state_check;
alter table public.hey_device_commands
  add constraint hey_device_commands_execution_state_check check (
    execution_state in ('not_started', 'executing', 'verified')
    and (execution_state <> 'verified' or execution_verified_at is not null)
  );

create or replace function public.begin_hey_device_command_execution(
  p_account_id uuid, p_device_id uuid, p_command_id uuid, p_lease_token uuid
) returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_device public.hey_devices%rowtype;
  v_command public.hey_device_commands%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted device command service required.' using errcode = '42501';
  end if;
  if p_account_id is null or p_device_id is null or p_command_id is null or p_lease_token is null then
    raise exception 'Invalid device command execution reservation.' using errcode = '22023';
  end if;
  select * into v_device from public.hey_devices d
    where d.id = p_device_id and d.user_id = p_account_id and d.status <> 'revoked' for update;
  if not found then return jsonb_build_object('execute', false, 'alreadyVerified', false, 'ambiguous', false); end if;
  select * into v_command from public.hey_device_commands c
    where c.id = p_command_id and c.account_id = p_account_id and c.device_id = p_device_id for update;
  if not found or v_command.state <> 'pending' or v_command.lease_token is distinct from p_lease_token
    or v_command.lease_until is null or v_command.lease_until <= clock_timestamp()
    or not public.hey_device_command_mandate_is_current(v_command.account_id, v_command.mandate_ids, v_command.mandate_expires_at, v_command.mandate_revocation_epoch)
    or not (v_device.capabilities @> jsonb_build_array(v_command.envelope->>'action'))
    or not exists (select 1 from public.hey_permissions p where p.user_id = p_account_id
      and p.permission = v_command.envelope->>'action' and p.scope = 'account' and p.status = 'granted') then
    return jsonb_build_object('execute', false, 'alreadyVerified', false, 'ambiguous', false);
  end if;

  if v_command.execution_state = 'verified' then
    return jsonb_build_object('execute', false, 'alreadyVerified', true, 'ambiguous', false);
  end if;
  if v_command.execution_state = 'executing' then
    return jsonb_build_object('execute', false, 'alreadyVerified', false, 'ambiguous', true);
  end if;
  update public.hey_device_commands
    set execution_state = 'executing', execution_lease_token = p_lease_token, execution_started_at = clock_timestamp()
    where id = p_command_id and account_id = p_account_id and device_id = p_device_id;
  insert into public.hey_audit_log(user_id, action, tool, risk_level, status, request_id, metadata)
    values (p_account_id, 'device.command.execution_started', 'hey-device-transport', 'low', 'started', p_command_id::text,
      jsonb_build_object('deviceId', p_device_id, 'commandId', p_command_id));
  return jsonb_build_object('execute', true, 'alreadyVerified', false, 'ambiguous', false);
end;
$$;

create or replace function public.complete_hey_device_command_execution(
  p_account_id uuid, p_device_id uuid, p_command_id uuid, p_lease_token uuid
) returns boolean
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_completed boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted device command service required.' using errcode = '42501';
  end if;
  if p_account_id is null or p_device_id is null or p_command_id is null or p_lease_token is null then
    raise exception 'Invalid device command execution result.' using errcode = '22023';
  end if;
  update public.hey_device_commands c
    set execution_state = 'verified', execution_verified_at = clock_timestamp()
    where c.id = p_command_id and c.account_id = p_account_id and c.device_id = p_device_id
      and c.state = 'pending' and c.lease_token = p_lease_token and c.lease_until > clock_timestamp()
      and c.execution_state = 'executing' and c.execution_lease_token = p_lease_token
      and public.hey_device_command_mandate_is_current(c.account_id, c.mandate_ids, c.mandate_expires_at, c.mandate_revocation_epoch)
      and exists (select 1 from public.hey_devices d where d.id = p_device_id and d.user_id = p_account_id
        and d.status <> 'revoked' and d.capabilities @> jsonb_build_array(c.envelope->>'action'))
      and exists (select 1 from public.hey_permissions p where p.user_id = p_account_id
        and p.permission = c.envelope->>'action' and p.scope = 'account' and p.status = 'granted');
  if found then
    v_completed := true;
    insert into public.hey_audit_log(user_id, action, tool, risk_level, status, request_id, metadata)
      values (p_account_id, 'device.command.execution_verified', 'hey-device-transport', 'low', 'verified', p_command_id::text,
        jsonb_build_object('deviceId', p_device_id, 'commandId', p_command_id));
  end if;
  return v_completed;
end;
$$;

-- A command cannot be acknowledged until the worker has durably recorded its
-- verified local postcondition. Duplicate ack requests remain idempotent.
create or replace function public.ack_hey_device_command(
  p_account_id uuid, p_device_id uuid, p_command_id uuid, p_lease_token uuid
) returns boolean
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_acknowledged boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Trusted device command service required.' using errcode = '42501'; end if;
  if p_account_id is null or p_device_id is null or p_command_id is null or p_lease_token is null then
    raise exception 'Invalid device command acknowledgement.' using errcode = '22023';
  end if;
  update public.hey_device_commands c
    set state = 'acknowledged', acknowledged_at = clock_timestamp(), acknowledged_lease_token = p_lease_token,
        lease_token = null, lease_until = null, last_error = null
    where c.id = p_command_id and c.account_id = p_account_id and c.device_id = p_device_id
      and c.state = 'pending' and c.lease_token = p_lease_token and c.lease_until > clock_timestamp()
      and c.execution_state = 'verified'
      and public.hey_device_command_mandate_is_current(c.account_id, c.mandate_ids, c.mandate_expires_at, c.mandate_revocation_epoch)
      and exists (select 1 from public.hey_devices d where d.id = c.device_id and d.user_id = c.account_id and d.status <> 'revoked' and d.capabilities @> jsonb_build_array(c.envelope->>'action'))
      and exists (select 1 from public.hey_permissions p where p.user_id = c.account_id and p.permission = c.envelope->>'action' and p.scope = 'account' and p.status = 'granted');
  if found then
    insert into public.hey_audit_log(user_id, action, tool, risk_level, status, request_id, metadata)
      values (p_account_id, 'device.command.acknowledged', 'hey-device-transport', 'low', 'acknowledged', p_command_id::text,
        jsonb_build_object('deviceId', p_device_id, 'commandId', p_command_id, 'transition', 'pending_to_acknowledged'));
    return true;
  end if;
  select exists (select 1 from public.hey_device_commands c
    join public.hey_devices d on d.id = c.device_id and d.user_id = c.account_id
    where c.id = p_command_id and c.account_id = p_account_id and c.device_id = p_device_id
      and c.state = 'acknowledged' and c.acknowledged_lease_token = p_lease_token and d.status <> 'revoked'
      and d.capabilities @> jsonb_build_array(c.envelope->>'action')
      and exists (select 1 from public.hey_permissions p where p.user_id = c.account_id and p.permission = c.envelope->>'action' and p.scope = 'account' and p.status = 'granted')
  ) into v_acknowledged;
  return v_acknowledged;
end;
$$;

revoke all on function public.begin_hey_device_command_execution(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_hey_device_command_execution(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.ack_hey_device_command(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_hey_device_command_execution(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.complete_hey_device_command_execution(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.ack_hey_device_command(uuid, uuid, uuid, uuid) to service_role;
