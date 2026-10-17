import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isSpaceRecoverySnapshotFailure, isSpaceRecoverySnapshotUpdated } from "../src/spacePageRecoveryStatus.js";

const page = await readFile(new URL("../src/SpacesPage.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/SpacesPage.css", import.meta.url), "utf8");
const engine = await readFile(new URL("../src/core/spaceCreationEngine.js", import.meta.url), "utf8");

test("recovery snapshot failure status is accepted only for its current account scope", () => {
  assert.equal(isSpaceRecoverySnapshotFailure(
    "storage_recovery_snapshot_error",
    { accountScope: "account:owner-a", error: "Space recovery snapshot could not be updated" },
    "owner-a",
    "account:owner-a",
  ), true);
  assert.equal(isSpaceRecoverySnapshotFailure(
    "storage_recovery_snapshot_error",
    { accountScope: "account:owner-a" },
    "owner-b",
    "account:owner-b",
  ), false);
  assert.equal(isSpaceRecoverySnapshotFailure(
    "storage_recovery_snapshot_error",
    { accountScope: "account:owner-a" },
    "owner-a",
    "account:owner-b",
  ), false);
  assert.equal(isSpaceRecoverySnapshotFailure("storage_sync_error", { accountScope: "account:owner-a" }, "owner-a", "account:owner-a"), false);
  assert.equal(isSpaceRecoverySnapshotFailure("storage_recovery_snapshot_error", null, "owner-a", "account:owner-a"), false);
});

test("malformed recovery status payloads are ignored without running accessors", () => {
  let getterCalls = 0;
  const hostile = Object.defineProperty({}, "accountScope", {
    enumerable: true,
    get() { getterCalls += 1; throw new Error("must not run"); },
  });
  assert.equal(isSpaceRecoverySnapshotFailure("storage_recovery_snapshot_error", hostile, "owner-a", "account:owner-a"), false);
  assert.equal(getterCalls, 0);
  assert.equal(isSpaceRecoverySnapshotFailure("storage_recovery_snapshot_error", new Proxy({}, {
    getOwnPropertyDescriptor() { throw new Error("hostile payload"); },
  }), "owner-a", "account:owner-a"), false);
});

test("snapshot update events are accepted only for their current account scope", () => {
  assert.equal(isSpaceRecoverySnapshotUpdated("storage_recovery_snapshot_updated", { accountScope: "account:owner-a" }, "owner-a", "account:owner-a"), true);
  assert.equal(isSpaceRecoverySnapshotUpdated("storage_recovery_snapshot_updated", { accountScope: "account:owner-a" }, "owner-b", "account:owner-b"), false);
  const hostile = Object.defineProperty({}, "accountScope", { get() { throw new Error("must not run"); } });
  assert.equal(isSpaceRecoverySnapshotUpdated("storage_recovery_snapshot_updated", hostile, "owner-a", "account:owner-a"), false);
});

test("Spaces page retains the warning until the canonical retry reports verified success", () => {
  assert.match(page, /isSpaceRecoverySnapshotFailure\(event, payload, accountId, getAccountScope\(\)\)/);
  assert.match(page, /isSpaceRecoverySnapshotUpdated\(event, payload, accountId, getAccountScope\(\)\)/);
  assert.match(page, /HEY\.spaces\.getRecoverySnapshotStatus\(\{ accountScope: `account:\$\{accountId\}` \}\)/);
  assert.match(page, /HEY\.spaces\.retryRecoverySnapshot\(\{ accountScope: requestedScope \}\)/);
  assert.match(page, /const recoveryStatus = HEY\.spaces\.getRecoverySnapshotStatus\(\{ accountScope: requestedScope \}\);\s+if \(recoveryStatus\?\.success !== true \|\| recoveryStatus\.accountScope !== requestedScope \|\| recoveryStatus\.needsRefresh !== false\)/);
  assert.match(page, /isSpaceRecoverySnapshotUpdated\(event, payload, accountId, getAccountScope\(\)\)\) \{\s+const recoveryStatus = HEY\.spaces\.getRecoverySnapshotStatus/);
  assert.match(page, /recoverySnapshotWarningAccountId === accountId && accountIsCurrent/);
  assert.match(page, /The Space recovery snapshot could not be verified/);
  assert.match(page, /Retry recovery snapshot/);
  assert.match(engine, /getRecoverySnapshotStatus\(request\)/);
  assert.match(engine, /retryRecoverySnapshot\(request\)/);
  assert.match(engine, /const primary = readStorageItem\(getAccountStorageKey\(STORAGE_KEY, scope\)\);\s+let spaces;\s+if \(primary === null\)/);
  assert.match(engine, /parseRecoverySnapshot\(previousRecovery, scope\)\.spaces\.size > 0/);
  assert.match(engine, /if \(!serialized \|\| !this\.updateRecoverySnapshot\(scope, serialized\)\)/);
  assert.match(engine, /const serialized = serializeSpaces\(spaces, scope\);\s+if \(serialized\) this\.updateRecoverySnapshot\(scope, serialized, \{ notify: false \}\)/);
  assert.match(page, /setRecoverySnapshotWarningAccountId\(""\)/);
  assert.match(styles, /\.spaces-page__recovery-snapshot-warning/);
});
