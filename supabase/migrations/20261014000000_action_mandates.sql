-- Durable, account-scoped action-mandate replay, revocation, and use limits.
-- Tables are inaccessible to client roles; narrowly scoped SECURITY DEFINER RPCs
-- enforce caller ownership and serialize each account's authority decisions.

create table if not exists public.hey_action_mandate_epochs (
  account_id uuid primary key references auth.users(id) on delete cascade,
  revocation_epoch bigint not null default 0 check (revocation_epoch >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.hey_action_mandates (
  account_id uuid not null references auth.users(id) on delete cascade,
  mandate_id uuid not null,
  max_uses integer not null check (max_uses between 0 and 10000),
  used_count integer not null default 0 check (used_count >= 0),
  revocation_epoch bigint not null check (revocation_epoch >= 0),
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  primary key (account_id, mandate_id),
  check (used_count <= max_uses)
);

create table if not exists public.hey_action_mandate_replays (
  account_id uuid not null references auth.users(id) on delete cascade,
  mandate_id uuid not null,
  idempotency_key text not null check (length(idempotency_key) between 1 and 256),
  consumed_at timestamptz not null default now(),
  primary key (account_id, mandate_id, idempotency_key),
  foreign key (account_id, mandate_id)
    references public.hey_action_mandates(account_id, mandate_id) on delete cascade
);

alter table public.hey_action_mandate_epochs enable row level security;
alter table public.hey_action_mandates enable row level security;
alter table public.hey_action_mandate_replays enable row level security;
revoke all on public.hey_action_mandate_epochs from public, anon, authenticated;
revoke all on public.hey_action_mandates from public, anon, authenticated;
revoke all on public.hey_action_mandate_replays from public, anon, authenticated;

create or replace function public.get_hey_action_mandate_epoch(p_account_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_epoch bigint;
begin
  if auth.uid() is distinct from p_account_id and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Authenticated account does not own mandate state.' using errcode = '42501';
  end if;
  select revocation_epoch into v_epoch
    from public.hey_action_mandate_epochs where account_id = p_account_id;
  return coalesce(v_epoch, 0);
end;
$$;

create or replace function public.advance_hey_action_mandate_epoch(p_account_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_epoch bigint;
begin
  if auth.uid() is distinct from p_account_id and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Authenticated account does not own mandate state.' using errcode = '42501';
  end if;
  insert into public.hey_action_mandate_epochs (account_id, revocation_epoch)
  values (p_account_id, 1)
  on conflict (account_id) do update
    set revocation_epoch = public.hey_action_mandate_epochs.revocation_epoch + 1,
        updated_at = clock_timestamp()
  returning revocation_epoch into v_epoch;
  return v_epoch;
end;
$$;

create or replace function public.is_hey_action_mandate_revoked(p_account_id uuid, p_mandate_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is distinct from p_account_id and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Authenticated account does not own mandate state.' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.hey_action_mandates
    where account_id = p_account_id and mandate_id = p_mandate_id and revoked_at is not null
  );
end;
$$;

create or replace function public.revoke_hey_action_mandate(p_account_id uuid, p_mandate_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_epoch bigint;
begin
  if auth.uid() is distinct from p_account_id and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Authenticated account does not own mandate state.' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 500 then
    raise exception 'A bounded revocation reason is required.' using errcode = '22023';
  end if;
  insert into public.hey_action_mandate_epochs (account_id) values (p_account_id) on conflict do nothing;
  select revocation_epoch into v_epoch
    from public.hey_action_mandate_epochs where account_id = p_account_id for update;
  insert into public.hey_action_mandates (account_id, mandate_id, max_uses, used_count, revocation_epoch, revoked_at, revoked_reason)
  values (p_account_id, p_mandate_id, 1, 0, v_epoch, clock_timestamp(), left(trim(p_reason), 500))
  on conflict (account_id, mandate_id) do update
    set revoked_at = coalesce(public.hey_action_mandates.revoked_at, clock_timestamp()),
        revoked_reason = coalesce(public.hey_action_mandates.revoked_reason, left(trim(p_reason), 500));
  return true;
end;
$$;

create or replace function public.consume_hey_action_mandate_chain(
  p_account_id uuid,
  p_revocation_epoch bigint,
  p_mandates jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_current_epoch bigint;
  v_item jsonb;
  v_id uuid;
  v_max_uses integer;
  v_max_uses_numeric numeric;
  v_item_epoch bigint;
  v_item_epoch_numeric numeric;
  v_stored_max_uses integer;
  v_stored_uses integer;
  v_stored_epoch bigint;
  v_revoked_at timestamptz;
  v_index integer := 0;
  v_count integer;
  v_ids uuid[] := array[]::uuid[];
  v_remaining integer;
begin
  if auth.uid() is distinct from p_account_id and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Authenticated account does not own mandate state.' using errcode = '42501';
  end if;
  if p_revocation_epoch is null or p_revocation_epoch < 0
    or p_mandates is null
    or jsonb_typeof(p_mandates) is distinct from 'array' then
    return jsonb_build_object('consumed', false, 'reason', 'invalid_context');
  end if;
  if jsonb_array_length(p_mandates) not between 1 and 5
    or p_idempotency_key is null or length(trim(p_idempotency_key)) not between 1 and 256
    or p_idempotency_key ~ '[[:cntrl:]]' then
    return jsonb_build_object('consumed', false, 'reason', 'invalid_context');
  end if;

  insert into public.hey_action_mandate_epochs (account_id) values (p_account_id) on conflict do nothing;
  select revocation_epoch into v_current_epoch
    from public.hey_action_mandate_epochs where account_id = p_account_id for update;
  if v_current_epoch <> p_revocation_epoch then
    return jsonb_build_object('consumed', false, 'reason', 'stale_epoch');
  end if;

  v_count := jsonb_array_length(p_mandates);
  for v_item in select value from jsonb_array_elements(p_mandates)
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      return jsonb_build_object('consumed', false, 'reason', 'invalid_context');
    end if;
    if jsonb_object_length(v_item) <> 3
      or jsonb_typeof(v_item->'mandate_id') is distinct from 'string'
      or jsonb_typeof(v_item->'max_uses') is distinct from 'number'
      or jsonb_typeof(v_item->'revocation_epoch') is distinct from 'number' then
      return jsonb_build_object('consumed', false, 'reason', 'invalid_context');
    end if;
    begin
      v_id := (v_item->>'mandate_id')::uuid;
      v_max_uses_numeric := (v_item->>'max_uses')::numeric;
      v_item_epoch_numeric := (v_item->>'revocation_epoch')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      return jsonb_build_object('consumed', false, 'reason', 'invalid_context');
    end;
    if v_max_uses_numeric not between 1 and 10000
      or v_max_uses_numeric <> trunc(v_max_uses_numeric)
      or v_item_epoch_numeric < 0
      or v_item_epoch_numeric <> trunc(v_item_epoch_numeric)
      or v_item_epoch_numeric <> p_revocation_epoch
      or v_id = any(v_ids) then
      return jsonb_build_object('consumed', false, 'reason', 'invalid_context');
    end if;
    v_max_uses := v_max_uses_numeric::integer;
    v_item_epoch := v_item_epoch_numeric::bigint;
    v_ids := array_append(v_ids, v_id);
    v_index := v_index + 1;

    insert into public.hey_action_mandates (account_id, mandate_id, max_uses, used_count, revocation_epoch)
    values (p_account_id, v_id, v_max_uses, 0, v_item_epoch)
    on conflict (account_id, mandate_id) do nothing;
    select max_uses, used_count, revocation_epoch, revoked_at
      into v_stored_max_uses, v_stored_uses, v_stored_epoch, v_revoked_at
      from public.hey_action_mandates
      where account_id = p_account_id and mandate_id = v_id for update;
    if v_revoked_at is not null then
      return jsonb_build_object('consumed', false, 'reason', 'revoked');
    end if;
    if v_stored_epoch <> v_item_epoch then
      return jsonb_build_object('consumed', false, 'reason', 'stale_epoch');
    end if;
    if v_stored_max_uses <> v_max_uses then
      return jsonb_build_object('consumed', false, 'reason', 'invalid_context');
    end if;
    if exists (
      select 1 from public.hey_action_mandate_replays
      where account_id = p_account_id and mandate_id = v_id and idempotency_key = trim(p_idempotency_key)
    ) then
      return jsonb_build_object('consumed', false, 'reason', 'replay');
    end if;
    if v_stored_uses >= v_stored_max_uses then
      return jsonb_build_object('consumed', false, 'reason', 'max_uses');
    end if;
    if v_index = v_count then v_remaining := v_stored_max_uses - v_stored_uses - 1; end if;
  end loop;

  update public.hey_action_mandates
    set used_count = used_count + 1
    where account_id = p_account_id and mandate_id = any(v_ids);
  insert into public.hey_action_mandate_replays (account_id, mandate_id, idempotency_key)
    select p_account_id, ids.mandate_id, trim(p_idempotency_key)
      from unnest(v_ids) as ids(mandate_id);
  return jsonb_build_object('consumed', true, 'remainingUses', v_remaining);
end;
$$;

revoke all on function public.get_hey_action_mandate_epoch(uuid) from public, anon;
revoke all on function public.advance_hey_action_mandate_epoch(uuid) from public, anon;
revoke all on function public.is_hey_action_mandate_revoked(uuid, uuid) from public, anon;
revoke all on function public.revoke_hey_action_mandate(uuid, uuid, text) from public, anon;
revoke all on function public.consume_hey_action_mandate_chain(uuid, bigint, jsonb, text) from public, anon, authenticated;
grant execute on function public.get_hey_action_mandate_epoch(uuid) to authenticated, service_role;
grant execute on function public.advance_hey_action_mandate_epoch(uuid) to authenticated, service_role;
grant execute on function public.is_hey_action_mandate_revoked(uuid, uuid) to authenticated, service_role;
grant execute on function public.revoke_hey_action_mandate(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.consume_hey_action_mandate_chain(uuid, bigint, jsonb, text) to service_role;
