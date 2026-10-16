-- Extend the existing Teacher artifact boundary for student-facing activity handouts.
-- Keep the earlier migration immutable so already-migrated databases receive this change.

create or replace function public.hey_is_teacher_artifact(p_content jsonb, p_metadata jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog, public
as $$
  select coalesce(
    jsonb_path_exists(coalesce(p_content, '{}'::jsonb), '$.**.teacherAnswer')
    or p_content ->> 'type' in ('teacher_assessment', 'teacher_activity_handout')
    or p_metadata ->> 'workflow' in ('teacher_assessment', 'teacher_lesson_plan', 'teacher_worksheet', 'teacher_activity_handout')
    or p_metadata ->> 'artifactContract' in (
      'hey.teacher.assessment.v1', 'hey.teacher.lesson.v1', 'hey.teacher.worksheet.v1', 'hey.teacher.activity_handout.v1'
    )
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
  v_is_student_facing boolean := p_content ->> 'type' in ('teacher_worksheet', 'teacher_activity_handout')
    or p_metadata ->> 'workflow' in ('teacher_worksheet', 'teacher_activity_handout')
    or p_metadata ->> 'artifactContract' in ('hey.teacher.worksheet.v1', 'hey.teacher.activity_handout.v1');
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

  if v_is_student_facing then
    return v_role in ('teacher', 'student');
  end if;

  return v_role = 'teacher' and p_created_by = v_uid;
end;
$$;

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
      or (old.content ->> 'type' in ('teacher_worksheet', 'teacher_activity_handout'))
        is distinct from (new.content ->> 'type' in ('teacher_worksheet', 'teacher_activity_handout')) then
      raise exception 'Teacher artifact privacy scope cannot be removed or changed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.hey_teacher_artifact_row_allowed(jsonb, jsonb, uuid, boolean) is
  'RLS helper for Teacher artifact creator, account, class and student worksheet/activity-handout access. Requires trusted app_metadata claims.';
