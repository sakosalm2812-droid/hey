import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isSpaceRecoverySnapshotFailure } from "../src/spacePageRecoveryStatus.js";

const page = await readFile(new URL("../src/SpacesPage.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/SpacesPage.css", import.meta.url), "utf8");

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

test("Spaces page surfaces recovery snapshot write failure and explains the retry", () => {
  assert.match(page, /isSpaceRecoverySnapshotFailure\(event, payload, accountId, getAccountScope\(\)\)/);
  assert.match(page, /recoverySnapshotWarningAccountId === accountId && accountIsCurrent/);
  assert.match(page, /A Space change was saved, but its recovery snapshot could not be updated/);
  assert.match(page, /Reload this page to retry/);
  assert.match(page, /setRecoverySnapshotWarningAccountId\(""\)/);
  assert.match(styles, /\.spaces-page__recovery-snapshot-warning/);
});
