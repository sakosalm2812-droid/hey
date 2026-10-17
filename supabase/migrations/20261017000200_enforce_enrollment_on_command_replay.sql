-- Require a currently enrolled device before even replaying a prior idempotency result. The insert trigger alone cannot guard the existing-command return path.

create or replace function public.enqueue_hey_device_command_authorized(
  p_account_id uuid, p_device_id uuid, p_idempotency_key text, p_envelope jsonb,
  p_mandate_ids uuid[], p_mandate_expires_at timestamptz, p_mandate_revocation_epoch bigint
) returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_command public.hey_device_commands%rowtype;
  v_device public.hey_devices%rowtype;
  v_current_epoch bigint;
  v_pending_count bigint;
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
    or octet_length(p_envelope::text) > 65536
    or p_mandate_ids is null or cardinality(p_mandate_ids) not between 1 and 5
    or p_mandate_revocation_epoch is null or p_mandate_revocation_epoch < 0 then
    raise exception 'Invalid authorized device command.' using errcode = '22023';
  end if;

  select * into v_device from public.hey_devices d
    where d.id = p_device_id and d.user_id = p_account_id and d.status in ('online', 'offline')
    for update;
  if not found then raise exception 'Device command unavailable.' using errcode = '42501'; end if;
  perform 1 from public.hey_permissions p
    where p.user_id = p_account_id and p.permission = p_envelope->>'action'
      and p.scope = 'account' and p.status = 'granted'
    for share;
  if not found then
    raise exception 'Device command authorization changed.' using errcode = '42501';
  end if;
  if not (v_device.capabilities @> jsonb_build_array(p_envelope->>'action')) then
    raise exception 'Device command authorization changed.' using errcode = '42501';
  end if;

  insert into public.hey_action_mandate_epochs(account_id) values (p_account_id) on conflict do nothing;
  select revocation_epoch into v_current_epoch from public.hey_action_mandate_epochs
    where account_id = p_account_id for share;
  if v_current_epoch <> p_mandate_revocation_epoch then
    raise exception 'Device command mandate is stale.' using errcode = '42501';
  end if;
  perform 1 from public.hey_action_mandates m
    where m.account_id = p_account_id and m.mandate_id = any(p_mandate_ids) for share;
  if not public.hey_device_command_mandate_is_current(p_account_id, p_mandate_ids, p_mandate_expires_at, p_mandate_revocation_epoch) then
    raise exception 'Device command mandate is unavailable.' using errcode = '42501';
  end if;

  select * into v_command from public.hey_device_commands
    where account_id = p_account_id and device_id = p_device_id and idempotency_key = trim(p_idempotency_key)
    for update;
  if found then
    if v_command.envelope is distinct from p_envelope
      or v_command.mandate_ids is distinct from p_mandate_ids
      or v_command.mandate_expires_at is distinct from p_mandate_expires_at
      or v_command.mandate_revocation_epoch is distinct from p_mandate_revocation_epoch then
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
  if v_pending_count >= 100 then raise exception 'Device command queue is full.' using errcode = '54000'; end if;
  insert into public.hey_device_commands(
    account_id, device_id, idempotency_key, envelope, mandate_ids, mandate_expires_at, mandate_revocation_epoch
  ) values (
    p_account_id, p_device_id, trim(p_idempotency_key), p_envelope, p_mandate_ids, p_mandate_expires_at, p_mandate_revocation_epoch
  ) returning * into v_command;
  return jsonb_build_object('created', true, 'command', jsonb_build_object(
    'commandId', v_command.id, 'deviceId', v_command.device_id, 'envelope', v_command.envelope,
    'state', v_command.state, 'attempts', v_command.attempts, 'createdAt', v_command.created_at,
    'lastError', v_command.last_error
  ));
end;
$$;

revoke all on function public.enqueue_hey_device_command_authorized(uuid, uuid, text, jsonb, uuid[], timestamptz, bigint) from public, anon, authenticated;
grant execute on function public.enqueue_hey_device_command_authorized(uuid, uuid, text, jsonb, uuid[], timestamptz, bigint) to service_role;
