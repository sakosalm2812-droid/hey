-- Persist a complete Teacher lesson journey in one PostgreSQL transaction.
-- The function is invoker-rights and independently checks signed app_metadata
-- claims; client artifact metadata is only compared with those claims.
create or replace function public.hey_create_teacher_artifacts_batch(p_artifacts jsonb)
returns setof public.hey_artifacts
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
declare
  v_claims jsonb := coalesce(auth.jwt() -> 'app_metadata', '{}'::jsonb);
  v_role text := v_claims ->> 'hey_role';
  v_account_scope text := v_claims ->> 'hey_account_scope';
  v_class_ids jsonb := v_claims -> 'hey_class_ids';
  v_project_id text;
  v_class_id text;
  v_count integer;
  v_written integer;
begin
  if auth.uid() is null or v_role is distinct from 'teacher' or v_account_scope is null then
    raise exception 'Authenticated teacher account is required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_artifacts) is distinct from 'array' or jsonb_array_length(p_artifacts) <> 3 then
    raise exception 'Teacher journey batch must contain exactly three artifacts' using errcode = '22023';
  end if;

  v_project_id := p_artifacts -> 0 ->> 'project_id';
  v_class_id := p_artifacts -> 0 -> 'metadata' ->> 'classId';
  if v_project_id is null or v_class_id is null or jsonb_typeof(v_class_ids) is distinct from 'array'
    or not (v_class_ids @> jsonb_build_array(v_class_id)) then
    raise exception 'Teacher journey workspace or class scope is not authorized' using errcode = '42501';
  end if;

  select count(*), count(distinct item ->> 'id')
    into v_count, v_written
    from jsonb_array_elements(p_artifacts) as batch(item);
  if v_count <> 3 or v_written <> 3 then
    raise exception 'Teacher journey artifact IDs must be unique' using errcode = '22023';
  end if;

  if (select array_agg(distinct item -> 'metadata' ->> 'artifactContract' order by item -> 'metadata' ->> 'artifactContract')
      from jsonb_array_elements(p_artifacts) as batch(item))
      is distinct from array['hey.teacher.assessment.v1', 'hey.teacher.lesson.v1', 'hey.teacher.worksheet.v1']::text[] then
    raise exception 'Teacher journey batch must contain one lesson, answer key, and worksheet' using errcode = '22023';
  end if;

  select count(*) into v_count
    from jsonb_array_elements(p_artifacts) as batch(item)
    where item ->> 'type' = 'document'
      and item ->> 'project_id' = v_project_id
      and item -> 'metadata' ->> 'accountScope' = v_account_scope
      and item -> 'metadata' ->> 'classId' = v_class_id
      and item -> 'metadata' ->> 'journeyId' = p_artifacts -> 0 -> 'metadata' ->> 'journeyId';
  if v_count <> 3 then
    raise exception 'Teacher journey batch artifacts must share the authenticated account, class, workspace, and journey' using errcode = '42501';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_artifacts) as batch(item)
    where (item -> 'metadata' ->> 'artifactContract' = 'hey.teacher.lesson.v1'
      and (item -> 'metadata' ->> 'workflow' is distinct from 'teacher_lesson_plan'
        or item -> 'content' ->> 'title' is null
        or jsonb_typeof(item -> 'content' -> 'learningObjectives') is distinct from 'array'
        or jsonb_typeof(item -> 'content' -> 'activities') is distinct from 'array'))
      or (item -> 'metadata' ->> 'artifactContract' = 'hey.teacher.assessment.v1'
        and (item -> 'metadata' ->> 'workflow' is distinct from 'teacher_assessment'
          or item -> 'metadata' ->> 'audience' is distinct from 'teacher_only'
          or item -> 'content' ->> 'type' is distinct from 'teacher_assessment'
          or jsonb_typeof(item -> 'content' -> 'questions') is distinct from 'array'
          or exists (
            select 1 from jsonb_array_elements(item -> 'content' -> 'questions') as question(value)
            where jsonb_typeof(question.value) is distinct from 'object'
              or not (question.value ?& array['objective', 'prompt', 'expectedLearning', 'teacherAnswer', 'points'])
              or question.value - array['objective', 'prompt', 'expectedLearning', 'teacherAnswer', 'points'] <> '{}'::jsonb
              or jsonb_typeof(question.value -> 'teacherAnswer') is distinct from 'string'
          )))
      or (item -> 'metadata' ->> 'artifactContract' = 'hey.teacher.worksheet.v1'
        and (item -> 'metadata' ->> 'workflow' is distinct from 'teacher_worksheet'
          or item -> 'metadata' ->> 'audience' is distinct from 'student'
          or item -> 'content' ->> 'type' is distinct from 'teacher_worksheet'
          or item -> 'content' - array['type', 'title', 'sourceAssessmentTitle', 'sourceAssessmentDigest',
            'parentSafetyReviewReasons', 'subject', 'gradeBand', 'directions', 'questions'] <> '{}'::jsonb
          or jsonb_typeof(item -> 'content' -> 'questions') is distinct from 'array'
          or exists (
            select 1 from jsonb_array_elements(item -> 'content' -> 'questions') as question(value)
            where jsonb_typeof(question.value) is distinct from 'object'
              or not (question.value ?& array['prompt', 'points'])
              or question.value - array['prompt', 'points'] <> '{}'::jsonb
          )))
  ) then
    raise exception 'Teacher journey content does not satisfy its audience contract' using errcode = '22023';
  end if;

  return query
    with inserted as (
      insert into public.hey_artifacts (
        id, project_id, type, title, description, content, metadata, status, version,
        parent_version_id, branch_name, created_at, updated_at, created_by, tags
      )
      select
        parsed.artifact.id,
        parsed.artifact.project_id,
        parsed.artifact.type,
        parsed.artifact.title,
        parsed.artifact.description,
        parsed.artifact.content,
        parsed.artifact.metadata,
        parsed.artifact.status,
        parsed.artifact.version,
        parsed.artifact.parent_version_id,
        parsed.artifact.branch_name,
        parsed.artifact.created_at,
        parsed.artifact.updated_at,
        parsed.artifact.created_by,
        parsed.artifact.tags
      from jsonb_array_elements(p_artifacts) as batch(item)
      cross join lateral (
        select jsonb_populate_record(null::public.hey_artifacts, item || jsonb_build_object(
          'status', 'draft', 'version', 1, 'parent_version_id', null, 'branch_name', 'main',
          'created_at', clock_timestamp(), 'updated_at', clock_timestamp(), 'created_by', auth.uid()
        )) as artifact
      ) as parsed
      on conflict (id) do update
        set id = excluded.id
        where public.hey_artifacts.created_by = auth.uid()
          and public.hey_artifacts.project_id = excluded.project_id
          and public.hey_artifacts.type = excluded.type
          and public.hey_artifacts.title = excluded.title
          and public.hey_artifacts.description is not distinct from excluded.description
          and public.hey_artifacts.content = excluded.content
          and public.hey_artifacts.metadata = excluded.metadata
          and public.hey_artifacts.tags = excluded.tags
      returning *
    )
    select inserted.* from inserted;

  get diagnostics v_written = row_count;
  if v_written <> 3 then
    raise exception 'Teacher journey batch conflicted with different existing artifact data' using errcode = '23505';
  end if;
end;
$$;

revoke all on function public.hey_create_teacher_artifacts_batch(jsonb) from public, anon, service_role;
grant execute on function public.hey_create_teacher_artifacts_batch(jsonb) to authenticated;
