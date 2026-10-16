import assert from "node:assert/strict";
import test from "node:test";
import { runLocalBackupRestoreDrill } from "../scripts/local-backup-restore-drill.mjs";

test("local backup/restore drill verifies all synthetic files and their hashes", async () => {
  const result = await runLocalBackupRestoreDrill();
  assert.equal(result.status, "passed");
  assert.equal(result.scope, "synthetic_local_files_only");
  assert.equal(result.fileCount, 3);
  assert.equal(result.restoredFileCount, 3);
  assert.deepEqual(result.verifiedSha256.map(({ path }) => path), [
    "account/preferences.json",
    "account/profile.json",
    "records/note.txt",
  ]);
  assert.ok(result.verifiedSha256.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256)));
});

for (const [fault, reason] of [
  ["corrupt", "integrity_mismatch"],
  ["missing", "payload_mismatch"],
  ["extra", "payload_mismatch"],
  ["traversal", "manifest_invalid"],
]) {
  test(`local backup/restore drill fails closed for ${fault} input`, async () => {
    const result = await runLocalBackupRestoreDrill({ testFault: fault });
    assert.deepEqual(result, { status: "failed", reason, restoredFileCount: 0 });
  });
}

test("local backup/restore drill rejects unknown test fault names", async () => {
  await assert.rejects(() => runLocalBackupRestoreDrill({ testFault: "delete-production-data" }), /Unknown drill fault/);
});
