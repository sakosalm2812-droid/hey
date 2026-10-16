import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../.github/workflows/ci.yml", import.meta.url);

test("CI runs the local recovery drill and built SPA smoke in the ordinary verification job", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const verifyJob = workflow.split("\n  migrations:")[0];
  assert.match(verifyJob, /- name: Run isolated backup and restore drill\s+run: npm run drill:backup-restore/);
  assert.ok(verifyJob.indexOf("run: npm run drill:backup-restore") < verifyJob.indexOf("run: npm run build"));
  assert.match(verifyJob, /- name: Smoke-test built SPA route and entry asset delivery\s+run: npm run smoke:spa/);
  assert.ok(verifyJob.indexOf("run: npm run build") < verifyJob.indexOf("run: npm run smoke:spa"));
});

test("CI remains secret-free and read-only for pull requests while local services always stop", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  assert.match(workflow, /^permissions:\s+contents:[ ]read$/m);
  assert.match(workflow, /^[ ]{2}pull_request:\s*$/m);
  assert.match(workflow, /- name: Stop local Supabase services\s+if: always\(\)\s+run: supabase stop --no-backup/);
  assert.doesNotMatch(workflow, /\bsecrets\.[A-Z0-9_]+/);
});
