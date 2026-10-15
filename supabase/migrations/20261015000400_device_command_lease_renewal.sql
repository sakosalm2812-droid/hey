-- Preserve the verified mandate chain with each queued command so delivery and
-- lease changes can fail closed after mandate expiry or revocation.
alter table public.hey_device_commands
  add column if not exists mandate_ids uuid[] not null default array[]::uuid[],
  add column if not exists mandate_expires_at timestamptz,
  add column if not exists mandate_revocation_epoch bigint,
  add column if not exists lease_renewals integer not null default 0;

alter table public.hey_device_commands
  drop constraint if exists hey_device_commands_mandate_scope_check;
alter table public.hey_device_commands
  add constraint hey_device_commands_mandate_scope_check check (
    (cardinality(mandate_ids) = 0 and mandate_expires_at is null and mandate_revocation_epoch is null)
    or (cardinality(mandate_ids) between 1 and 5 and mandate_expires_at is not null and mandate_revocation_epoch >= 0)
  );
alter table public.hey_device_commands
  drop constraint if exists hey_device_commands_lease_renewals_check;
alter table public.hey_device_commands
  add constraint hey_device_commands_lease_renewals_check check (lease_renewals between 0 and 5);

create unique index if not exists hey_device_commands_identity_uidx
  on public.hey_device_commands(id, account_id, device_id);

create table if not exists public.hey_device_command_lease_renewals (
  account_id uuid not null,
  device_id uuid not null,
  command_id uuid not null,
  lease_token uuid not null,
  idempotency_key text not null check (length(trim(idempotency_key)) between 1 and 128 and idempotency_key !~ '[[:cntrl:]]'),
  renewed_until timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (account_id, device_id, command_id, lease_token, idempotency_key),
  foreign key (command_id, account_id, device_id)
    references public.hey_device_commands(id, account_id, device_id) on delete cascade
);
alter table public.hey_device_command_lease_renewals enable row level security;
revoke all on public.hey_device_command_lease_renewals from public, anon, authenticated, service_role;

create or replace function public.hey_device_command_mandate_is_current(
  p_account_id uuid, p_mandate_ids uuid[], p_expires_at timestamptz, p_revocation_epoch bigint
) returns boolean
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_current_epoch bigint;
  v_valid_count bigint;
  v_distinct_count bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then return false; end if;
  if p_account_id is null or p_mandate_ids is null or cardinality(p_mandate_ids) not between 1 and 5
    or p_expires_at is null or p_expires_at <= clock_timestamp()
    or p_revocation_epoch is null or p_revocation_epoch < 0 then return false; end if;
  select coalesce((select e.revocation_epoch from public.hey_action_mandate_epochs e where e.account_id = p_account_id), 0)
    into v_current_epoch;
  if v_current_epoch <> p_revocation_epoch then return false; end if;
  select count(*), count(distinct requested.mandate_id)
    into v_valid_count, v_distinct_count
    from unnest(p_mandate_ids) as requested(mandate_id)
    join public.hey_action_mandates m on m.account_id = p_account_id and m.mandate_id = requested.mandate_id
    where m.revoked_at is null and m.revocation_epoch = p_revocation_epoch and m.used_count > 0;
  return v_valid_count = cardinality(p_mandate_ids) and v_distinct_count = cardinality(p_mandate_ids);
end;
$$;
revoke all on function public.hey_device_command_mandate_is_current(uuid, uuid[], timestamptz, bigint) from public, anon, authenticated, service_role;

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
    where d.id = p_device_id and d.user_id = p_account_id and d.status <> 'revoked'
    for update;
  if not found then raise exception 'Device command unavailable.' using errcode = '42501'; end if;
  if not (v_device.capabilities @> jsonb_build_array(p_envelope->>'action'))
    or not exists (select 1 from public.hey_permissions p where p.user_id = p_account_id
      and p.permission = p_envelope->>'action' and p.scope = 'account' and p.status = 'granted') then
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

-- Retire the unscoped legacy enqueue entry point; all new commands must carry
-- durable proof references from the already-verified Edge mandate check.
revoke all on function public.enqueue_hey_device_command(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.enqueue_hey_device_command_authorized(uuid, uuid, text, jsonb, uuid[], timestamptz, bigint) from public, anon, authenticated;
grant execute on function public.enqueue_hey_device_command_authorized(uuid, uuid, text, jsonb, uuid[], timestamptz, bigint) to service_role;

create or replace function public.cancel_hey_device_commands_on_mandate_change()
returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_account_id uuid;
  v_mandate_id uuid;
  v_cancel boolean := false;
begin
  if tg_op = 'DELETE' then
    v_account_id := old.account_id; v_mandate_id := old.mandate_id; v_cancel := true;
  elsif tg_op = 'INSERT' then
    v_account_id := new.account_id; v_mandate_id := new.mandate_id; v_cancel := new.revoked_at is not null;
  else
    v_account_id := new.account_id; v_mandate_id := new.mandate_id;
    v_cancel := old.revoked_at is null and new.revoked_at is not null;
  end if;
  if v_cancel then
    update public.hey_device_commands c set state = 'cancelled', lease_token = null, lease_until = null
      where c.account_id = v_account_id and c.mandate_ids @> array[v_mandate_id]::uuid[] and c.state = 'pending';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists hey_action_mandates_cancel_device_commands on public.hey_action_mandates;
create trigger hey_action_mandates_cancel_device_commands
  after insert or update or delete on public.hey_action_mandates
  for each row execute function public.cancel_hey_device_commands_on_mandate_change();

create or replace function public.cancel_hey_device_commands_on_mandate_epoch_change()
returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.revocation_epoch is distinct from old.revocation_epoch then
    update public.hey_device_commands c set state = 'cancelled', lease_token = null, lease_until = null
      where c.account_id = new.account_id and c.mandate_revocation_epoch is distinct from new.revocation_epoch and c.state = 'pending';
  end if;
  return new;
end;
$$;
drop trigger if exists hey_action_mandate_epochs_cancel_device_commands on public.hey_action_mandate_epochs;
create trigger hey_action_mandate_epochs_cancel_device_commands
  after update on public.hey_action_mandate_epochs
  for each row execute function public.cancel_hey_device_commands_on_mandate_epoch_change();
revoke all on function public.cancel_hey_device_commands_on_mandate_change() from public, anon, authenticated, service_role;
revoke all on function public.cancel_hey_device_commands_on_mandate_epoch_change() from public, anon, authenticated, service_role;

create or replace function public.claim_hey_device_command(p_account_id uuid, p_device_id uuid, p_lease_ms integer)
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_command public.hey_device_commands%rowtype;
  v_device public.hey_devices%rowtype;
  v_lease_until timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Trusted device command service required.' using errcode = '42501'; end if;
  if p_account_id is null or p_device_id is null or p_lease_ms is null or p_lease_ms not between 1 and 300000 then
    raise exception 'Invalid device command lease.' using errcode = '22023';
  end if;
  select * into v_device from public.hey_devices d
    where d.id = p_device_id and d.user_id = p_account_id and d.status <> 'revoked' for update;
  if not found then return null; end if;

  update public.hey_device_commands c set state = 'cancelled', lease_token = null, lease_until = null
    where c.account_id = p_account_id and c.device_id = p_device_id and c.state = 'pending'
      and (not public.hey_device_command_mandate_is_current(c.account_id, c.mandate_ids, c.mandate_expires_at, c.mandate_revocation_epoch)
        or not exists (select 1 from public.hey_permissions p where p.user_id = c.account_id and p.permission = c.envelope->>'action' and p.scope = 'account' and p.status = 'granted')
        or not exists (select 1 from public.hey_devices d where d.id = c.device_id and d.user_id = c.account_id and d.status <> 'revoked' and d.capabilities @> jsonb_build_array(c.envelope->>'action')));
  update public.hey_device_commands c set state = 'failed', lease_token = null, lease_until = null, last_error = 'delivery_failed'
    where c.account_id = p_account_id and c.device_id = p_device_id and c.state = 'pending'
      and c.attempts >= 5 and (c.lease_until is null or c.lease_until <= clock_timestamp());

  select * into v_command from public.hey_device_commands c
    where c.account_id = p_account_id and c.device_id = p_device_id and c.state = 'pending'
      and c.attempts < 5 and c.available_at <= clock_timestamp()
      and (c.lease_until is null or c.lease_until <= clock_timestamp())
      and public.hey_device_command_mandate_is_current(c.account_id, c.mandate_ids, c.mandate_expires_at, c.mandate_revocation_epoch)
      and exists (select 1 from public.hey_permissions p where p.user_id = c.account_id and p.permission = c.envelope->>'action' and p.scope = 'account' and p.status = 'granted')
      and v_device.capabilities @> jsonb_build_array(c.envelope->>'action')
    order by c.created_at, c.id limit 1 for update skip locked;
  if not found then return null; end if;
  v_lease_until := least(clock_timestamp() + (p_lease_ms * interval '1 millisecond'), v_command.mandate_expires_at);
  if v_lease_until <= clock_timestamp() then return null; end if;
  update public.hey_device_commands set lease_token = gen_random_uuid(), lease_until = v_lease_until, attempts = attempts + 1
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

create or replace function public.fail_hey_device_command(
  p_account_id uuid, p_device_id uuid, p_command_id uuid, p_lease_token uuid
) returns boolean
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Trusted device command service required.' using errcode = '42501'; end if;
  if p_account_id is null or p_device_id is null or p_command_id is null or p_lease_token is null then
    raise exception 'Invalid device command failure report.' using errcode = '22023';
  end if;
  update public.hey_device_commands c
    set state = case when c.attempts >= 5 then 'failed' else 'pending' end,
        available_at = case when c.attempts >= 5 then c.available_at else clock_timestamp() + make_interval(secs => least(60, power(2, greatest(0, c.attempts - 1))::integer)) end,
        lease_token = null, lease_until = null, last_error = 'delivery_failed'
    where c.id = p_command_id and c.account_id = p_account_id and c.device_id = p_device_id
      and c.state = 'pending' and c.lease_token = p_lease_token and c.lease_until > clock_timestamp()
      and public.hey_device_command_mandate_is_current(c.account_id, c.mandate_ids, c.mandate_expires_at, c.mandate_revocation_epoch)
      and exists (select 1 from public.hey_devices d where d.id = p_device_id and d.user_id = p_account_id and d.status <> 'revoked' and d.capabilities @> jsonb_build_array(c.envelope->>'action'))
      and exists (select 1 from public.hey_permissions p where p.user_id = c.account_id and p.permission = c.envelope->>'action' and p.scope = 'account' and p.status = 'granted');
  return found;
end;
$$;

create or replace function public.renew_hey_device_command_lease(
  p_account_id uuid, p_device_id uuid, p_command_id uuid, p_lease_token uuid, p_idempotency_key text, p_lease_ms integer
) returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_device public.hey_devices%rowtype;
  v_command public.hey_device_commands%rowtype;
  v_renewed_until timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Trusted device command service required.' using errcode = '42501'; end if;
  if p_account_id is null or p_device_id is null or p_command_id is null or p_lease_token is null
    or p_idempotency_key is null or length(trim(p_idempotency_key)) not between 1 and 128
    or p_idempotency_key ~ '[[:cntrl:]]' or p_lease_ms is null or p_lease_ms not between 1 and 300000 then
    raise exception 'Invalid device command lease renewal.' using errcode = '22023';
  end if;
  select * into v_device from public.hey_devices d where d.id = p_device_id and d.user_id = p_account_id and d.status <> 'revoked' for update;
  if not found then return jsonb_build_object('renewed', false); end if;
  select * into v_command from public.hey_device_commands c
    where c.id = p_command_id and c.account_id = p_account_id and c.device_id = p_device_id for update;
  if not found or v_command.state <> 'pending' or v_command.lease_token is distinct from p_lease_token
    or v_command.lease_until is null or v_command.lease_until <= clock_timestamp()
    or not public.hey_device_command_mandate_is_current(v_command.account_id, v_command.mandate_ids, v_command.mandate_expires_at, v_command.mandate_revocation_epoch)
    or not (v_device.capabilities @> jsonb_build_array(v_command.envelope->>'action'))
    or not exists (select 1 from public.hey_permissions p where p.user_id = p_account_id and p.permission = v_command.envelope->>'action' and p.scope = 'account' and p.status = 'granted') then
    return jsonb_build_object('renewed', false);
  end if;

  select renewed_until into v_renewed_until from public.hey_device_command_lease_renewals r
    where r.account_id = p_account_id and r.device_id = p_device_id and r.command_id = p_command_id
      and r.lease_token = p_lease_token and r.idempotency_key = trim(p_idempotency_key);
  if found then return jsonb_build_object('renewed', true, 'leaseUntil', v_renewed_until, 'idempotent', true); end if;
  if v_command.lease_renewals >= 5 then return jsonb_build_object('renewed', false); end if;

  v_renewed_until := least(clock_timestamp() + (p_lease_ms * interval '1 millisecond'), v_command.mandate_expires_at);
  if v_renewed_until <= clock_timestamp() then return jsonb_build_object('renewed', false); end if;
  update public.hey_device_commands set lease_until = v_renewed_until, lease_renewals = lease_renewals + 1 where id = p_command_id;
  insert into public.hey_device_command_lease_renewals(account_id, device_id, command_id, lease_token, idempotency_key, renewed_until)
    values (p_account_id, p_device_id, p_command_id, p_lease_token, trim(p_idempotency_key), v_renewed_until);
  insert into public.hey_audit_log(user_id, action, tool, risk_level, status, request_id, metadata)
    values (p_account_id, 'device.command.lease_renewed', 'hey-device-transport', 'low', 'renewed', p_command_id::text,
      jsonb_build_object('deviceId', p_device_id, 'commandId', p_command_id, 'leaseMs', p_lease_ms));
  return jsonb_build_object('renewed', true, 'leaseUntil', v_renewed_until, 'idempotent', false);
end;
$$;

revoke all on function public.renew_hey_device_command_lease(uuid, uuid, uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.renew_hey_device_command_lease(uuid, uuid, uuid, uuid, text, integer) to service_role;
revoke all on function public.claim_hey_device_command(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.ack_hey_device_command(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_hey_device_command(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_hey_device_command(uuid, uuid, integer) to service_role;
grant execute on function public.ack_hey_device_command(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.fail_hey_device_command(uuid, uuid, uuid, uuid) to service_role;
