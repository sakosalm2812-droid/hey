import assert from "node:assert/strict";
import test from "node:test";
import { reconcileToolLibraryLifecycleReceipt } from "../src/lib/toolLibraryLifecycleRecovery.js";

function receipt(overrides = {}) {
  return { accountId: "account-a", status: "starting", sessionId: "session-a", message: "Starting…", ...overrides };
}

function lifecycle(overrides = {}) {
  return { success: true, status: "running", sessionId: "session-a", ...overrides };
}

test("fresh lifecycle refresh advances a pending start receipt for the same session", () => {
  const next = reconcileToolLibraryLifecycleReceipt(receipt(), lifecycle(), "account-a", "account:account-a");
  assert.equal(next.status, "running");
  assert.equal(next.sessionId, "session-a");
  assert.match(next.message, /status is now: running/);
});

test("terminal async failure replaces stale starting or stopping copy with the real outcome", () => {
  const failedStart = reconcileToolLibraryLifecycleReceipt(receipt(), lifecycle({ status: "failed" }), "account-a", "account:account-a");
  assert.equal(failedStart.status, "failed");
  assert.match(failedStart.message, /finished with status: failed/);
  assert.equal(failedStart.retryable, false);

  const stopped = reconcileToolLibraryLifecycleReceipt(
    receipt({ status: "stopping" }),
    lifecycle({ status: "cancelled" }),
    "account-a",
    "account:account-a",
  );
  assert.equal(stopped.status, "cancelled");
  assert.match(stopped.message, /finished with status: cancelled/);

  const failedAfterRunning = reconcileToolLibraryLifecycleReceipt(
    receipt({ status: "running", message: "Session is running." }),
    lifecycle({ status: "failed_after_stop" }),
    "account-a",
    "account:account-a",
  );
  assert.equal(failedAfterRunning.status, "failed_after_stop");
  assert.match(failedAfterRunning.message, /finished with status: failed after stop/);
});

test("a replaced session invalidates the old transition receipt instead of implying success", () => {
  const next = reconcileToolLibraryLifecycleReceipt(
    receipt({ status: "stopping" }),
    lifecycle({ status: "running", sessionId: "session-b" }),
    "account-a",
    "account:account-a",
  );
  assert.equal(next.status, "stale_session");
  assert.equal(next.retryable, false);
  assert.match(next.message, /session changed/);
});

test("unavailable reads, account switches, and already-settled receipts cannot be overwritten", () => {
  const pending = receipt();
  assert.equal(reconcileToolLibraryLifecycleReceipt(pending, null, "account-a", "account:account-a"), null);
  assert.equal(reconcileToolLibraryLifecycleReceipt(pending, lifecycle(), "account-b", "account:account-b"), null);
  assert.equal(reconcileToolLibraryLifecycleReceipt(pending, lifecycle(), "account-a", "account:account-b"), null);
  assert.equal(reconcileToolLibraryLifecycleReceipt(receipt({ status: "failed" }), lifecycle(), "account-a", "account:account-a"), null);
  assert.equal(reconcileToolLibraryLifecycleReceipt(pending, lifecycle({ status: "unknown" }), "account-a", "account:account-a"), null);
});
