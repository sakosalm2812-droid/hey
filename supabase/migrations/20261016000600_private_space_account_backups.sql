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

-- JavaScript counts UTF-16 code units. Keep the direct RPC contract aligned for
-- supplementary Unicode characters as well as ordinary BMP text.
create or replace function public.hey_private_space_backup_utf16_length(p_value text)
returns integer
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select coalesce(sum(case when ascii(substr(p_value, positions.position, 1)) > 65535 then 2 else 1 end), 0)::integer
  from generate_series(1, char_length(p_value)) as positions(position)
$$;

create or replace function public.hey_private_space_backup_layout_preferences_valid(p_preferences jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_field text;
  v_max_count integer;
  v_values jsonb;
  v_item jsonb;
  v_value text;
  v_distinct_count integer;
begin
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object'
    or not (p_preferences ?& array['contractVersion', 'revision', 'favoriteToolIds', 'widgetIds', 'shortcutIds', 'toolIds'])
    or exists (
      select 1 from jsonb_object_keys(p_preferences) as keys(key_name)
      where key_name not in ('contractVersion', 'revision', 'favoriteToolIds', 'widgetIds', 'shortcutIds', 'toolIds')
    )
    or p_preferences ->> 'contractVersion' <> '1'
    or coalesce(p_preferences ->> 'revision', '') !~ '^(0|[1-9][0-9]*)$'
    or case when coalesce(p_preferences ->> 'revision', '') ~ '^(0|[1-9][0-9]*)$'
      then (p_preferences ->> 'revision')::numeric > 9007199254740991 else false end then
    return false;
  end if;

  foreach v_field in array array['favoriteToolIds', 'widgetIds', 'shortcutIds', 'toolIds'] loop
    v_max_count := case when v_field = 'toolIds' then 64 else 32 end;
    v_values := p_preferences -> v_field;
    if jsonb_typeof(v_values) <> 'array' or jsonb_array_length(v_values) > v_max_count then
      return false;
    end if;

    for v_item in select value from jsonb_array_elements(v_values) as items(value) loop
      if jsonb_typeof(v_item) <> 'string' then return false; end if;
      v_value := v_item #>> '{}';
      if v_field = 'toolIds' then
        if v_value = ''
          or public.hey_private_space_backup_utf16_length(v_value) > 160
          or v_value ~ '[[:cntrl:]]'
          or v_value ~ '^\s|\s$' then
          return false;
        end if;
      elsif public.hey_private_space_backup_utf16_length(v_value) > 64
        or v_value !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$' then
        return false;
      end if;
    end loop;

    select count(distinct value)::integer into v_distinct_count
      from jsonb_array_elements_text(v_values) as ids(value);
    if v_distinct_count <> jsonb_array_length(v_values) then return false; end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.hey_private_space_backup_utf16_length(text) from public, anon, authenticated;
revoke all on function public.hey_private_space_backup_layout_preferences_valid(jsonb) from public, anon, authenticated;

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
        or coalesce(item ->> 'name', '') !~ $space_name$^[[:alnum:]][[:alnum:] ._’'()-]{0,79}$space_name$
        or public.hey_private_space_backup_utf16_length(item ->> 'name') > 80
        or jsonb_typeof(item -> 'description') <> 'string'
        or public.hey_private_space_backup_utf16_length(item ->> 'description') > 240
        or item ->> 'description' ~ '[[:cntrl:]]'
        or item ->> 'templateId' not in ('empty', 'planning', 'research', 'custom')
        or coalesce(item ->> 'detailsRevision', '') !~ '^(0|[1-9][0-9]*)$'
        or case when coalesce(item ->> 'detailsRevision', '') ~ '^(0|[1-9][0-9]*)$'
          then (item ->> 'detailsRevision')::numeric > 9007199254740991 else false end
        or item ->> 'status' not in ('active', 'archived')
        or coalesce(item ->> 'lifecycleRevision', '') !~ '^(0|[1-9][0-9]*)$'
        or case when coalesce(item ->> 'lifecycleRevision', '') ~ '^(0|[1-9][0-9]*)$'
          then (item ->> 'lifecycleRevision')::numeric > 9007199254740991 else false end
        or item ->> 'visibility' <> 'private'
        or item ->> 'sharing' <> 'off'
        or (item -> 'createdAt' <> 'null'::jsonb and jsonb_typeof(item -> 'createdAt') <> 'string')
        or not public.hey_private_space_backup_layout_preferences_valid(item -> 'layoutPreferences')
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
