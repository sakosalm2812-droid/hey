import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationUrl = new URL("../supabase/migrations/20261015000500_teacher_artifact_batch.sql", import.meta.url);
const migration = readFileSync(fileURLToPath(migrationUrl), "utf8").toLowerCase();

test("teacher batch RPC runs as invoker and gates signed tenant and class claims", () => {
  assert.match(migration, /security invoker/);
  assert.doesNotMatch(migration, /security definer/);
  assert.match(migration, /auth\.uid\(\) is null/);
  assert.match(migration, /v_role is distinct from 'teacher'/);
  assert.match(migration, /v_account_scope text := v_claims ->> 'hey_account_scope'/);
  assert.match(migration, /v_class_ids jsonb := v_claims -> 'hey_class_ids'/);
  assert.match(migration, /item -> 'metadata' ->> 'accountscope' = v_account_scope/);
  assert.match(migration, /v_class_ids @> jsonb_build_array\(v_class_id\)/);
  assert.match(migration, /item ->> 'project_id' = v_project_id/);
});

test("teacher answer keys and student worksheets have distinct database content contracts", () => {
  assert.match(migration, /item -> 'metadata' ->> 'audience' is distinct from 'teacher_only'/);
  assert.match(migration, /'objective', 'prompt', 'expectedlearning', 'teacheranswer', 'points'/);
  assert.match(migration, /question\.value - array\['objective', 'prompt', 'expectedlearning', 'teacheranswer', 'points'\] <> '\{\}'::jsonb/);
  assert.match(migration, /item -> 'metadata' ->> 'audience' is distinct from 'student'/);
  assert.match(migration, /item -> 'content' - array\['type', 'title', 'sourceassessmenttitle', 'sourceassessmentdigest'/);
  assert.match(migration, /question\.value - array\['prompt', 'points'\] <> '\{\}'::jsonb/);
});

test("batch RPC is callable by authenticated sessions only, not public or service roles", () => {
  assert.match(migration, /revoke all on function public\.hey_create_teacher_artifacts_batch\(jsonb\) from public, anon, service_role/);
  assert.match(migration, /grant execute on function public\.hey_create_teacher_artifacts_batch\(jsonb\) to authenticated/);
});
