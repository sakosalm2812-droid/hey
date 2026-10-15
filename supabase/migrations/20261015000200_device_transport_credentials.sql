-- Device pollers receive a random per-device secret once. Only its SHA-256
-- digest is stored. These RPCs never expose the service-role client to devices.
create table if not exists public.hey_device_credentials (
  account_id uuid not null,
  device_id uuid not null,
  secret_hash text not null unique check (secret_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  primary key (device_id),
  foreign key (device_id, account_id) references public.hey_devices(id, user_id) on delete cascade
);

alter table public.hey_device_credentials enable row level security;
revoke all on public.hey_device_credentials from public, anon, authenticated, service_role;

create or replace function public.rotate_hey_device_credential(p_account_id uuid, p_device_id uuid, p_secret_hash text)
returns boolean
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_device public.hey_devices%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted device credential service required.' using errcode = '42501';
  end if;
  if p_account_id is null or p_device_id is null or p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid device credential.' using errcode = '22023';
  end if;
  select * into v_device from public.hey_devices d
    where d.id = p_device_id and d.user_id = p_account_id and d.status <> 'revoked'
    for update;
  if not found then return false; end if;
  insert into public.hey_device_credentials(account_id, device_id, secret_hash, revoked_at)
    values (p_account_id, p_device_id, p_secret_hash, null)
  on conflict (device_id) do update set secret_hash = excluded.secret_hash, created_at = clock_timestamp(), revoked_at = null
    where public.hey_device_credentials.account_id = excluded.account_id;
  return found;
end;
$$;

create or replace function public.authenticate_hey_device_credential(p_secret_hash text)
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_identity jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted device credential service required.' using errcode = '42501';
  end if;
  if p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select jsonb_build_object('accountId', c.account_id, 'deviceId', c.device_id, 'active', true) into v_identity
    from public.hey_device_credentials c join public.hey_devices d on d.id = c.device_id and d.user_id = c.account_id
    where c.secret_hash = p_secret_hash and c.revoked_at is null and d.status <> 'revoked';
  return v_identity;
end;
$$;

create or replace function public.revoke_hey_device_credential_on_device_revoke()
returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.status = 'revoked' and old.status is distinct from 'revoked' then
    update public.hey_device_credentials set revoked_at = clock_timestamp()
      where account_id = new.user_id and device_id = new.id and revoked_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists hey_devices_revoke_command_credential on public.hey_devices;
create trigger hey_devices_revoke_command_credential
  after update of status on public.hey_devices
  for each row execute function public.revoke_hey_device_credential_on_device_revoke();

revoke all on function public.rotate_hey_device_credential(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.authenticate_hey_device_credential(text) from public, anon, authenticated;
revoke all on function public.revoke_hey_device_credential_on_device_revoke() from public, anon, authenticated, service_role;
grant execute on function public.rotate_hey_device_credential(uuid, uuid, text) to service_role;
grant execute on function public.authenticate_hey_device_credential(text) to service_role;

-- Authenticated-account Edge callers can request a stop. The service-role RPC
-- locks the owner-bound device row and atomically revokes it, its credential,
-- and every still-pending (including leased but unacknowledged) command.
create or replace function public.revoke_hey_device_transport(p_account_id uuid, p_device_id uuid)
returns boolean
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_device public.hey_devices%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted device revocation service required.' using errcode = '42501';
  end if;
  if p_account_id is null or p_device_id is null then
    raise exception 'Invalid device revocation request.' using errcode = '22023';
  end if;
  select * into v_device from public.hey_devices d
    where d.id = p_device_id and d.user_id = p_account_id
    for update;
  if not found then return false; end if;

  update public.hey_devices set status = 'revoked', updated_at = clock_timestamp()
    where id = p_device_id and user_id = p_account_id;
  update public.hey_device_credentials set revoked_at = coalesce(revoked_at, clock_timestamp())
    where account_id = p_account_id and device_id = p_device_id;
  update public.hey_device_commands set state = 'cancelled', lease_token = null, lease_until = null
    where account_id = p_account_id and device_id = p_device_id and state = 'pending';
  return true;
end;
$$;

revoke all on function public.revoke_hey_device_transport(uuid, uuid) from public, anon, authenticated;
grant execute on function public.revoke_hey_device_transport(uuid, uuid) to service_role;

-- Permission revocation is an emergency stop for commands that have not been
-- acknowledged. Clearing leases prevents a later ack/retry from reviving them.
create or replace function public.cancel_hey_device_commands_on_permission_revoke()
returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_account_id uuid;
  v_permission text;
  v_scope text;
  v_was_granted boolean;
begin
  if tg_op = 'DELETE' then
    v_account_id := old.user_id;
    v_permission := old.permission;
    v_scope := old.scope;
    v_was_granted := old.status = 'granted';
  else
    v_account_id := new.user_id;
    v_permission := new.permission;
    v_scope := new.scope;
    v_was_granted := old.status = 'granted' and new.status is distinct from 'granted';
  end if;
  if v_was_granted and v_scope = 'account' then
    update public.hey_device_commands c
      set state = 'cancelled', lease_token = null, lease_until = null
      where c.account_id = v_account_id and c.envelope->>'action' = v_permission and c.state = 'pending';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists hey_permissions_cancel_device_commands on public.hey_permissions;
create trigger hey_permissions_cancel_device_commands
  after update of status or delete on public.hey_permissions
  for each row execute function public.cancel_hey_device_commands_on_permission_revoke();

create or replace function public.cancel_hey_device_commands_on_capability_change()
returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
begin
  update public.hey_device_commands c
    set state = 'cancelled', lease_token = null, lease_until = null
    where c.account_id = new.user_id and c.device_id = new.id and c.state = 'pending'
      and not (new.capabilities @> jsonb_build_array(c.envelope->>'action'));
  return new;
end;
$$;

drop trigger if exists hey_devices_cancel_unsupported_commands on public.hey_devices;
create trigger hey_devices_cancel_unsupported_commands
  after update of capabilities on public.hey_devices
  for each row execute function public.cancel_hey_device_commands_on_capability_change();

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

  update public.hey_device_commands c
    set state = 'cancelled', lease_token = null, lease_until = null
    where c.account_id = p_account_id and c.device_id = p_device_id and c.state = 'pending'
      and not exists (select 1 from public.hey_permissions p where p.user_id = c.account_id
        and p.permission = c.envelope->>'action' and p.scope = 'account' and p.status = 'granted');
  update public.hey_device_commands c
    set state = 'failed', lease_token = null, lease_until = null, last_error = 'delivery_failed'
    where c.account_id = p_account_id and c.device_id = p_device_id and c.state = 'pending'
      and c.attempts >= 5 and (c.lease_until is null or c.lease_until <= clock_timestamp());

  select * into v_command from public.hey_device_commands c
    where c.account_id = p_account_id and c.device_id = p_device_id and c.state = 'pending'
      and c.attempts < 5 and c.available_at <= clock_timestamp()
      and (c.lease_until is null or c.lease_until <= clock_timestamp())
      and exists (select 1 from public.hey_permissions p where p.user_id = c.account_id
        and p.permission = c.envelope->>'action' and p.scope = 'account' and p.status = 'granted')
      and exists (select 1 from public.hey_devices d where d.id = c.device_id and d.user_id = c.account_id
        and d.status <> 'revoked' and d.capabilities @> jsonb_build_array(c.envelope->>'action'))
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
      and exists (select 1 from public.hey_devices d where d.id = p_device_id and d.user_id = p_account_id and d.status <> 'revoked')
      and exists (select 1 from public.hey_permissions p where p.user_id = c.account_id
        and p.permission = c.envelope->>'action' and p.scope = 'account' and p.status = 'granted')
      and exists (select 1 from public.hey_devices d where d.id = c.device_id and d.user_id = c.account_id
        and d.capabilities @> jsonb_build_array(c.envelope->>'action'));
  return found;
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
      and exists (select 1 from public.hey_devices d where d.id = p_device_id and d.user_id = p_account_id and d.status <> 'revoked')
      and exists (select 1 from public.hey_permissions p where p.user_id = c.account_id
        and p.permission = c.envelope->>'action' and p.scope = 'account' and p.status = 'granted')
      and exists (select 1 from public.hey_devices d where d.id = c.device_id and d.user_id = c.account_id
        and d.capabilities @> jsonb_build_array(c.envelope->>'action'));
  return found;
end;
$$;

revoke all on function public.cancel_hey_device_commands_on_permission_revoke() from public, anon, authenticated, service_role;
revoke all on function public.cancel_hey_device_commands_on_capability_change() from public, anon, authenticated, service_role;
revoke all on function public.claim_hey_device_command(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.ack_hey_device_command(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_hey_device_command(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_hey_device_command(uuid, uuid, integer) to service_role;
grant execute on function public.ack_hey_device_command(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.fail_hey_device_command(uuid, uuid, uuid, uuid) to service_role;
