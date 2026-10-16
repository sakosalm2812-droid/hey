import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(fileURLToPath(new URL(
  "../supabase/migrations/20261016000100_teacher_artifact_rls.sql",
  import.meta.url,
)), "utf8").toLowerCase();
const activityHandoutMigration = readFileSync(fileURLToPath(new URL(
  "../supabase/migrations/20261016000200_teacher_activity_handout_rls.sql",
  import.meta.url,
)), "utf8").toLowerCase();

test("Teacher artifact RLS derives identity and class access from signed claims", () => {
  assert.match(migration, /alter table public\.hey_artifacts enable row level security/);
  assert.match(migration, /alter table public\.hey_artifact_versions enable row level security/);
  assert.match(migration, /v_uid uuid := auth\.uid\(\)/);
  assert.match(migration, /auth\.jwt\(\) -> 'app_metadata'/);
  assert.match(migration, /p_metadata ->> 'accountscope' is distinct from v_claims ->> 'hey_account_scope'/);
  assert.match(migration, /v_claims -> 'hey_class_ids'\) @> jsonb_build_array\(v_class_id\)/);
  assert.match(migration, /p_created_by = v_uid/);
  assert.match(migration, /v_role in \('teacher', 'student'\)/, "worksheet reads support both authorized class roles");
  assert.match(migration, /if p_write then\s+return v_role = 'teacher'/, "student worksheet access is read-only");
});

test("restrictive policies fence broader existing grants and cover artifact CRUD plus version paths", () => {
  for (const operation of ["select", "insert", "update", "delete"]) {
    assert.match(migration, new RegExp(`as restrictive for ${operation} to public`), `${operation} has an OR-resistant restrictive fence`);
    assert.match(migration, new RegExp(`hey_teacher_artifact_${operation}_fence on public\\.hey_artifacts`));
    assert.match(migration, new RegExp(`hey_teacher_artifact_version_${operation}_fence on public\\.hey_artifact_versions`));
  }
  assert.match(migration, /where a\.id = artifact_id/);
  assert.match(migration, /a\.created_by, true/);
  assert.match(migration, /a\.created_by, false/);
});

test("legacy private markers are recognized and updates cannot erase creator or scope boundaries", () => {
  assert.match(migration, /jsonb_path_exists\(coalesce\(p_content, '\{\}'::jsonb\), '\$\.\*\*\.teacheranswer'\)/);
  assert.match(migration, /'hey\.teacher\.assessment\.v1', 'hey\.teacher\.lesson\.v1'/);
  assert.match(migration, /'hey\.teacher\.worksheet\.v1'/);
  assert.match(migration, /p_metadata ->> 'workflow' = 'teacher_worksheet'/);
  assert.match(migration, /create trigger hey_preserve_teacher_artifact_scope/);
  assert.match(migration, /new\.created_by is distinct from old\.created_by/);
  assert.match(migration, /new\.metadata ->> 'accountscope' is distinct from old\.metadata ->> 'accountscope'/);
  assert.match(migration, /new\.metadata ->> 'classid' is distinct from old\.metadata ->> 'classid'/);
  assert.match(migration, /raise exception 'teacher artifact privacy scope cannot be removed or changed'/);
});

test("migration fails explicitly when either artifact table is missing", () => {
  assert.match(migration, /to_regclass\('public\.hey_artifacts'\) is null/);
  assert.match(migration, /to_regclass\('public\.hey_artifact_versions'\) is null/);
  assert.match(migration, /teacher artifact rls requires hey_artifacts and hey_artifact_versions tables/);
});

test("activity handouts join the existing class-scoped student artifact boundary", () => {
  assert.match(activityHandoutMigration, /'teacher_activity_handout'/);
  assert.match(activityHandoutMigration, /'hey\.teacher\.activity_handout\.v1'/);
  assert.match(activityHandoutMigration, /v_is_student_facing/);
  assert.match(activityHandoutMigration, /v_role in \('teacher', 'student'\)/);
  assert.match(activityHandoutMigration, /if p_write then\s+return v_role = 'teacher' and p_created_by = v_uid/);
  assert.match(activityHandoutMigration, /teacher artifact privacy scope cannot be removed or changed/);
  assert.match(activityHandoutMigration, /new\.metadata ->> 'classid' is distinct from old\.metadata ->> 'classid'/);
});
