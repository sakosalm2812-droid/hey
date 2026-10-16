-- Database row-security boundary for Teacher artifacts and their versions.
-- Claims must be provisioned by a trusted auth/admin path; client metadata never grants access.

create or replace function public.hey_is_teacher_artifact(p_content jsonb, p_metadata jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog, public
as $$
  select coalesce(
    jsonb_path_exists(coalesce(p_content, '{}'::jsonb), '$.**.teacherAnswer')
    or p_content ->> 'type' = 'teacher_assessment'
    or p_metadata ->> 'workflow' in ('teacher_assessment', 'teacher_lesson_plan', 'teacher_worksheet')
    or p_metadata ->> 'artifactContract' in ('hey.teacher.assessment.v1', 'hey.teacher.lesson.v1', 'hey.teacher.worksheet.v1')
    or (jsonb_typeof(p_content -> 'learningObjectives') = 'array'
      and jsonb_typeof(p_content -> 'activities') = 'array'
      and jsonb_typeof(p_content -> 'assessment') = 'object'
      and jsonb_typeof(p_content -> 'durationMinutes') = 'number')
    or p_content ->> 'type' = 'teacher_worksheet',
    false
  );
$$;

create or replace function public.hey_teacher_artifact_row_allowed(
  p_content jsonb,
  p_metadata jsonb,
  p_created_by uuid,
  p_write boolean default false
)
returns boolean
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  v_claims jsonb := coalesce(auth.jwt() -> 'app_metadata', '{}'::jsonb);
  v_role text := v_claims ->> 'hey_role';
  v_uid uuid := auth.uid();
  v_class_id text := p_metadata ->> 'classId';
  v_is_worksheet boolean := p_content ->> 'type' = 'teacher_worksheet'
    or p_metadata ->> 'workflow' = 'teacher_worksheet'
    or p_metadata ->> 'artifactContract' = 'hey.teacher.worksheet.v1';
begin
  if not public.hey_is_teacher_artifact(p_content, p_metadata) then
    return true;
  end if;

  if v_uid is null
    or v_role is null
    or coalesce(v_claims ->> 'hey_account_scope', '') = ''
    or p_metadata ->> 'accountScope' is distinct from v_claims ->> 'hey_account_scope'
    or coalesce(v_class_id, '') = ''
    or jsonb_typeof(v_claims -> 'hey_class_ids') is distinct from 'array'
    or not ((v_claims -> 'hey_class_ids') @> jsonb_build_array(v_class_id)) then
    return false;
  end if;

  if p_write then
    return v_role = 'teacher' and p_created_by = v_uid;
  end if;

  if v_is_worksheet then
    return v_role in ('teacher', 'student');
  end if;

  return v_role = 'teacher' and p_created_by = v_uid;
end;
$$;

-- Keep protected rows protected through UPDATE, even if a caller tries to erase
-- the marker fields that make an answer key or lesson recognizable.
create or replace function public.hey_preserve_teacher_artifact_scope()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if public.hey_is_teacher_artifact(old.content, old.metadata) then
    if not public.hey_is_teacher_artifact(new.content, new.metadata)
      or new.created_by is distinct from old.created_by
      or new.metadata ->> 'accountScope' is distinct from old.metadata ->> 'accountScope'
      or new.metadata ->> 'classId' is distinct from old.metadata ->> 'classId'
      or (old.content ->> 'type' = 'teacher_worksheet') is distinct from (new.content ->> 'type' = 'teacher_worksheet') then
      raise exception 'Teacher artifact privacy scope cannot be removed or changed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.hey_artifacts') is null or to_regclass('public.hey_artifact_versions') is null then
    raise exception 'Teacher artifact RLS requires hey_artifacts and hey_artifact_versions tables';
  end if;
end;
$$;

alter table public.hey_artifacts enable row level security;
alter table public.hey_artifact_versions enable row level security;

drop trigger if exists hey_preserve_teacher_artifact_scope on public.hey_artifacts;
create trigger hey_preserve_teacher_artifact_scope
  before update on public.hey_artifacts
  for each row execute function public.hey_preserve_teacher_artifact_scope();

drop policy if exists hey_teacher_artifact_select on public.hey_artifacts;
create policy hey_teacher_artifact_select on public.hey_artifacts
  as permissive for select to authenticated
  using (public.hey_teacher_artifact_row_allowed(content, metadata, created_by, false));
drop policy if exists hey_teacher_artifact_select_fence on public.hey_artifacts;
create policy hey_teacher_artifact_select_fence on public.hey_artifacts
  as restrictive for select to public
  using (public.hey_teacher_artifact_row_allowed(content, metadata, created_by, false));

drop policy if exists hey_teacher_artifact_insert on public.hey_artifacts;
create policy hey_teacher_artifact_insert on public.hey_artifacts
  as permissive for insert to authenticated
  with check (public.hey_teacher_artifact_row_allowed(content, metadata, created_by, true));
drop policy if exists hey_teacher_artifact_insert_fence on public.hey_artifacts;
create policy hey_teacher_artifact_insert_fence on public.hey_artifacts
  as restrictive for insert to public
  with check (public.hey_teacher_artifact_row_allowed(content, metadata, created_by, true));

drop policy if exists hey_teacher_artifact_update on public.hey_artifacts;
create policy hey_teacher_artifact_update on public.hey_artifacts
  as permissive for update to authenticated
  using (public.hey_teacher_artifact_row_allowed(content, metadata, created_by, true))
  with check (public.hey_teacher_artifact_row_allowed(content, metadata, created_by, true));
drop policy if exists hey_teacher_artifact_update_fence on public.hey_artifacts;
create policy hey_teacher_artifact_update_fence on public.hey_artifacts
  as restrictive for update to public
  using (public.hey_teacher_artifact_row_allowed(content, metadata, created_by, true))
  with check (public.hey_teacher_artifact_row_allowed(content, metadata, created_by, true));

drop policy if exists hey_teacher_artifact_delete on public.hey_artifacts;
create policy hey_teacher_artifact_delete on public.hey_artifacts
  as permissive for delete to authenticated
  using (public.hey_teacher_artifact_row_allowed(content, metadata, created_by, true));
drop policy if exists hey_teacher_artifact_delete_fence on public.hey_artifacts;
create policy hey_teacher_artifact_delete_fence on public.hey_artifacts
  as restrictive for delete to public
  using (public.hey_teacher_artifact_row_allowed(content, metadata, created_by, true));

-- Version authorization always derives account, class, creator and artifact type
-- from the parent row. Version-local metadata/content cannot widen its scope.
drop policy if exists hey_teacher_artifact_version_select on public.hey_artifact_versions;
create policy hey_teacher_artifact_version_select on public.hey_artifact_versions
  as permissive for select to authenticated
  using (exists (
    select 1 from public.hey_artifacts a
    where a.id = artifact_id
      and public.hey_teacher_artifact_row_allowed(content, coalesce(metadata, '{}'::jsonb) || a.metadata, a.created_by, false)
  ));
drop policy if exists hey_teacher_artifact_version_select_fence on public.hey_artifact_versions;
create policy hey_teacher_artifact_version_select_fence on public.hey_artifact_versions
  as restrictive for select to public
  using (exists (
    select 1 from public.hey_artifacts a
    where a.id = artifact_id
      and public.hey_teacher_artifact_row_allowed(content, coalesce(metadata, '{}'::jsonb) || a.metadata, a.created_by, false)
  ));

drop policy if exists hey_teacher_artifact_version_insert on public.hey_artifact_versions;
create policy hey_teacher_artifact_version_insert on public.hey_artifact_versions
  as permissive for insert to authenticated
  with check (exists (
    select 1 from public.hey_artifacts a
    where a.id = artifact_id
      and public.hey_teacher_artifact_row_allowed(content, coalesce(metadata, '{}'::jsonb) || a.metadata, a.created_by, true)
  ));
drop policy if exists hey_teacher_artifact_version_insert_fence on public.hey_artifact_versions;
create policy hey_teacher_artifact_version_insert_fence on public.hey_artifact_versions
  as restrictive for insert to public
  with check (exists (
    select 1 from public.hey_artifacts a
    where a.id = artifact_id
      and public.hey_teacher_artifact_row_allowed(content, coalesce(metadata, '{}'::jsonb) || a.metadata, a.created_by, true)
  ));

drop policy if exists hey_teacher_artifact_version_update on public.hey_artifact_versions;
create policy hey_teacher_artifact_version_update on public.hey_artifact_versions
  as permissive for update to authenticated
  using (exists (
    select 1 from public.hey_artifacts a
    where a.id = artifact_id
      and public.hey_teacher_artifact_row_allowed(content, coalesce(metadata, '{}'::jsonb) || a.metadata, a.created_by, true)
  ))
  with check (exists (
    select 1 from public.hey_artifacts a
    where a.id = artifact_id
      and public.hey_teacher_artifact_row_allowed(content, coalesce(metadata, '{}'::jsonb) || a.metadata, a.created_by, true)
  ));
drop policy if exists hey_teacher_artifact_version_update_fence on public.hey_artifact_versions;
create policy hey_teacher_artifact_version_update_fence on public.hey_artifact_versions
  as restrictive for update to public
  using (exists (
    select 1 from public.hey_artifacts a
    where a.id = artifact_id
      and public.hey_teacher_artifact_row_allowed(content, coalesce(metadata, '{}'::jsonb) || a.metadata, a.created_by, true)
  ))
  with check (exists (
    select 1 from public.hey_artifacts a
    where a.id = artifact_id
      and public.hey_teacher_artifact_row_allowed(content, coalesce(metadata, '{}'::jsonb) || a.metadata, a.created_by, true)
  ));

drop policy if exists hey_teacher_artifact_version_delete on public.hey_artifact_versions;
create policy hey_teacher_artifact_version_delete on public.hey_artifact_versions
  as permissive for delete to authenticated
  using (exists (
    select 1 from public.hey_artifacts a
    where a.id = artifact_id
      and public.hey_teacher_artifact_row_allowed(content, coalesce(metadata, '{}'::jsonb) || a.metadata, a.created_by, true)
  ));
drop policy if exists hey_teacher_artifact_version_delete_fence on public.hey_artifact_versions;
create policy hey_teacher_artifact_version_delete_fence on public.hey_artifact_versions
  as restrictive for delete to public
  using (exists (
    select 1 from public.hey_artifacts a
    where a.id = artifact_id
      and public.hey_teacher_artifact_row_allowed(content, coalesce(metadata, '{}'::jsonb) || a.metadata, a.created_by, true)
  ));

comment on function public.hey_teacher_artifact_row_allowed(jsonb, jsonb, uuid, boolean) is
  'RLS helper for Teacher artifact creator, account, class and student worksheet access. Requires trusted app_metadata claims.';
