-- Authenticated account-scoped storage for signed mission recovery checkpoints.
-- The owner may store only their own opaque checkpoint envelope; restore still
-- requires independent evidence verification in MissionCenter.

create table if not exists public.hey_mission_checkpoints (
  account_id uuid not null references auth.users(id) on delete cascade,
  mission_id text not null check (mission_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  revision bigint not null check (revision > 0),
  checkpoint jsonb not null check (jsonb_typeof(checkpoint) = 'object' and octet_length(checkpoint::text) <= 1048576),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (account_id, mission_id)
);

alter table public.hey_mission_checkpoints enable row level security;
revoke all on public.hey_mission_checkpoints from public, anon, authenticated, service_role;

create or replace function public.load_hey_mission_checkpoint(p_account_id uuid, p_mission_id text)
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_checkpoint public.hey_mission_checkpoints%rowtype;
begin
  if auth.uid() is distinct from p_account_id and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Authenticated account does not own mission checkpoint.' using errcode = '42501';
  end if;
  if p_mission_id is null or p_mission_id !~ '^[A-Za-z0-9_-]{1,128}$' then
    raise exception 'Invalid mission checkpoint identifier.' using errcode = '22023';
  end if;
  select * into v_checkpoint from public.hey_mission_checkpoints
    where account_id = p_account_id and mission_id = p_mission_id;
  if not found then return null; end if;
  return jsonb_build_object('revision', v_checkpoint.revision, 'checkpoint', v_checkpoint.checkpoint);
end;
$$;

create or replace function public.save_hey_mission_checkpoint(
  p_account_id uuid, p_mission_id text, p_checkpoint jsonb, p_expected_revision bigint default null
) returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_revision bigint;
begin
  if auth.uid() is distinct from p_account_id and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Authenticated account does not own mission checkpoint.' using errcode = '42501';
  end if;
  if p_mission_id is null or p_mission_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_checkpoint is null or jsonb_typeof(p_checkpoint) <> 'object'
    or octet_length(p_checkpoint::text) > 1048576
    or (p_expected_revision is not null and p_expected_revision < 1) then
    raise exception 'Invalid mission checkpoint input.' using errcode = '22023';
  end if;

  if p_expected_revision is null then
    insert into public.hey_mission_checkpoints(account_id, mission_id, revision, checkpoint)
      values (p_account_id, p_mission_id, 1, p_checkpoint)
      on conflict (account_id, mission_id) do nothing
      returning revision into v_revision;
  else
    update public.hey_mission_checkpoints
      set revision = revision + 1, checkpoint = p_checkpoint, updated_at = clock_timestamp()
      where account_id = p_account_id and mission_id = p_mission_id and revision = p_expected_revision
      returning revision into v_revision;
  end if;
  if not found then return jsonb_build_object('saved', false); end if;
  return jsonb_build_object('saved', true, 'revision', v_revision);
end;
$$;

revoke all on function public.load_hey_mission_checkpoint(uuid, text) from public, anon;
revoke all on function public.save_hey_mission_checkpoint(uuid, text, jsonb, bigint) from public, anon;
grant execute on function public.load_hey_mission_checkpoint(uuid, text) to authenticated, service_role;
grant execute on function public.save_hey_mission_checkpoint(uuid, text, jsonb, bigint) to authenticated, service_role;
