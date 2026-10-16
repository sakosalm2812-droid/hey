-- Explicit, revision-checked account backups for private Spaces. The client can
-- read only its own snapshot; all writes go through the authenticated CAS RPC.
create table if not exists public.hey_private_space_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  document jsonb not null,
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default clock_timestamp(),
  constraint hey_private_space_backups_document_size check (octet_length(document::text) <= 1016384),
  constraint hey_private_space_backups_document_kind check (
    jsonb_typeof(document) = 'object'
    and document ->> 'kind' = 'hey-private-spaces-export'
    and document ->> 'contractVersion' = '1'
  )
);

alter table public.hey_private_space_backups enable row level security;
revoke all on public.hey_private_space_backups from public, anon, authenticated;
grant select on public.hey_private_space_backups to authenticated;
create policy hey_private_space_backups_select_own
  on public.hey_private_space_backups for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.save_hey_private_space_backup(
  p_document jsonb,
  p_expected_revision integer
) returns table(success boolean, revision integer, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_revision integer := 0;
  v_updated_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Signed-in account required.' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 2147483647 then
    raise exception 'Invalid Space backup revision.' using errcode = '22023';
  end if;
  if p_document is null or jsonb_typeof(p_document) <> 'object'
    or p_document ->> 'kind' <> 'hey-private-spaces-export'
    or p_document ->> 'contractVersion' <> '1'
    or octet_length(p_document::text) > 1016384
    or jsonb_typeof(p_document -> 'spaces') <> 'array'
    or coalesce(p_document ->> 'spaceCount', '') !~ '^(0|[1-9][0-9]{0,3})$'
    or jsonb_array_length(p_document -> 'spaces') > 1000
    or jsonb_array_length(p_document -> 'spaces') <> (p_document ->> 'spaceCount')::integer
    or exists (
      select 1 from jsonb_object_keys(p_document) as keys(key_name)
      where key_name not in ('kind', 'contractVersion', 'exportedAt', 'spaceCount', 'spaces')
    )
    or jsonb_typeof(p_document -> 'exportedAt') <> 'string'
    or p_document ->> 'exportedAt' = ''
    or exists (
      select 1 from jsonb_array_elements(p_document -> 'spaces') as spaces(item)
      where jsonb_typeof(item) <> 'object'
        or not (item ?& array['id', 'name', 'description', 'templateId', 'detailsRevision', 'status', 'lifecycleRevision', 'visibility', 'sharing', 'createdAt', 'layoutPreferences'])
        or exists (
          select 1 from jsonb_object_keys(item) as keys(key_name)
          where key_name not in ('id', 'name', 'description', 'templateId', 'detailsRevision', 'status', 'lifecycleRevision', 'visibility', 'sharing', 'createdAt', 'layoutPreferences')
        )
        or jsonb_typeof(item -> 'id') <> 'string'
        or coalesce(item ->> 'id', '') = ''
        or length(item ->> 'id') > 100
        or jsonb_typeof(item -> 'name') <> 'string'
        or coalesce(item ->> 'name', '') = ''
        or length(item ->> 'name') > 80
        or jsonb_typeof(item -> 'description') <> 'string'
        or length(item ->> 'description') > 240
        or item ->> 'templateId' not in ('empty', 'planning', 'research', 'custom')
        or coalesce(item ->> 'detailsRevision', '') !~ '^(0|[1-9][0-9]*)$'
        or item ->> 'status' not in ('active', 'archived')
        or coalesce(item ->> 'lifecycleRevision', '') !~ '^(0|[1-9][0-9]*)$'
        or item ->> 'visibility' <> 'private'
        or item ->> 'sharing' <> 'off'
        or (item -> 'createdAt' <> 'null'::jsonb and jsonb_typeof(item -> 'createdAt') <> 'string')
        or jsonb_typeof(item -> 'layoutPreferences') <> 'object'
        or not ((item -> 'layoutPreferences') ?& array['contractVersion', 'revision', 'favoriteToolIds', 'widgetIds', 'shortcutIds', 'toolIds'])
        or exists (
          select 1 from jsonb_object_keys(item -> 'layoutPreferences') as keys(key_name)
          where key_name not in ('contractVersion', 'revision', 'favoriteToolIds', 'widgetIds', 'shortcutIds', 'toolIds')
        )
        or item -> 'layoutPreferences' ->> 'contractVersion' <> '1'
        or coalesce(item -> 'layoutPreferences' ->> 'revision', '') !~ '^(0|[1-9][0-9]*)$'
        or jsonb_typeof(item -> 'layoutPreferences' -> 'favoriteToolIds') <> 'array'
        or jsonb_typeof(item -> 'layoutPreferences' -> 'widgetIds') <> 'array'
        or jsonb_typeof(item -> 'layoutPreferences' -> 'shortcutIds') <> 'array'
        or jsonb_typeof(item -> 'layoutPreferences' -> 'toolIds') <> 'array'
        or jsonb_array_length(item -> 'layoutPreferences' -> 'favoriteToolIds') > 32
        or jsonb_array_length(item -> 'layoutPreferences' -> 'widgetIds') > 32
        or jsonb_array_length(item -> 'layoutPreferences' -> 'shortcutIds') > 32
        or jsonb_array_length(item -> 'layoutPreferences' -> 'toolIds') > 64
        or exists (
          select 1
          from jsonb_array_elements(item -> 'layoutPreferences' -> 'favoriteToolIds') as preference_ids(preference_id)
          where jsonb_typeof(preference_id) <> 'string'
        )
        or exists (
          select 1
          from jsonb_array_elements(item -> 'layoutPreferences' -> 'widgetIds') as preference_ids(preference_id)
          where jsonb_typeof(preference_id) <> 'string'
        )
        or exists (
          select 1
          from jsonb_array_elements(item -> 'layoutPreferences' -> 'shortcutIds') as preference_ids(preference_id)
          where jsonb_typeof(preference_id) <> 'string'
        )
        or exists (
          select 1
          from jsonb_array_elements(item -> 'layoutPreferences' -> 'toolIds') as preference_ids(preference_id)
          where jsonb_typeof(preference_id) <> 'string'
        )
    ) then
    raise exception 'Invalid private Space backup document.' using errcode = '22023';
  end if;

  -- Serialize first creation as well as updates so two devices cannot both
  -- overwrite a snapshot after observing the same revision.
  perform pg_advisory_xact_lock(hashtextextended('hey-private-space-backup:' || v_user_id::text, 0));
  select backup.revision, backup.updated_at
    into v_revision, v_updated_at
    from public.hey_private_space_backups as backup
    where backup.user_id = v_user_id
    for update;

  if not found then
    v_revision := 0;
    v_updated_at := null;
  end if;
  if v_revision <> p_expected_revision then
    return query select false, v_revision, v_updated_at;
    return;
  end if;

  insert into public.hey_private_space_backups as backup (user_id, document, revision, updated_at)
    values (v_user_id, p_document, v_revision + 1, clock_timestamp())
    on conflict (user_id) do update
      set document = excluded.document,
          revision = backup.revision + 1,
          updated_at = excluded.updated_at
    returning backup.revision, backup.updated_at into v_revision, v_updated_at;

  return query select true, v_revision, v_updated_at;
end;
$$;

revoke all on function public.save_hey_private_space_backup(jsonb, integer) from public, anon;
grant execute on function public.save_hey_private_space_backup(jsonb, integer) to authenticated;
