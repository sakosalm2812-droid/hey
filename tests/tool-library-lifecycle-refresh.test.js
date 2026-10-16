import assert from "node:assert/strict";
import test from "node:test";
import { refreshToolLibraryLifecycleSnapshot } from "../src/lib/toolLibraryLifecycleRefresh.js";

function makeOptions(overrides = {}) {
  return {
    accountId: "account-a",
    getActiveScope: () => "account:account-a",
    isCurrentRequest: () => true,
    readActivity: () => ({ success: true, activity: [{ id: "event-1", status: "stopped", at: "2026-10-16T12:00:00.000Z" }] }),
    readLifecycle: () => ({ success: true, status: "stopped", readiness: "ready", sessionId: "session-1", actions: { stop: true } }),
    ...overrides,
  };
}

test("lifecycle refresh reads account-scoped session and bounded activity data", async () => {
  const result = await refreshToolLibraryLifecycleSnapshot(makeOptions());
  assert.equal(result.status, "ready");
  assert.deepEqual(result.activity, [{ id: "event-1", status: "stopped", at: "2026-10-16T12:00:00.000Z" }]);
  assert.deepEqual(result.lifecycle, {
    success: true, status: "stopped", readiness: "ready", sessionId: "session-1",
    actions: { start: false, stop: true, retry: false },
  });
});

test("account mismatch prevents reads and malformed results fail closed", async () => {
  let reads = 0;
  const mismatch = await refreshToolLibraryLifecycleSnapshot(makeOptions({
    getActiveScope: () => "account:account-b",
    readActivity: () => { reads += 1; },
    readLifecycle: () => { reads += 1; },
  }));
  assert.equal(mismatch.status, "account_changed");
  assert.equal(reads, 0);

  const hostileActivity = {};
  Object.defineProperty(hostileActivity, "activity", { get() { throw new Error("must not run"); } });
  const malformed = await refreshToolLibraryLifecycleSnapshot(makeOptions({
    readActivity: () => hostileActivity,
    readLifecycle: () => ({ success: true, status: "running", actions: new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("hostile"); } }) }),
  }));
  assert.equal(malformed.status, "ready");
  assert.deepEqual(malformed.activity, []);
  assert.deepEqual(malformed.lifecycle.actions, { start: false, stop: false, retry: false });
});

test("late refresh responses are discarded after account switch or newer request", async () => {
  let resolveActivity;
  const pendingActivity = new Promise((resolve) => { resolveActivity = resolve; });
  let scope = "account:account-a";
  let current = true;
  const pending = refreshToolLibraryLifecycleSnapshot(makeOptions({
    getActiveScope: () => scope,
    isCurrentRequest: () => current,
    readActivity: () => pendingActivity,
  }));
  scope = "account:account-b";
  current = false;
  resolveActivity({ success: true, activity: [{ id: "late", status: "running", at: "2026-10-16T12:00:00.000Z" }] });
  assert.deepEqual(await pending, { status: "stale" });
});

test("thrown catalog reads resolve to empty activity and unavailable lifecycle", async () => {
  const result = await refreshToolLibraryLifecycleSnapshot(makeOptions({
    readActivity: () => { throw new Error("unavailable"); },
    readLifecycle: () => { throw new Error("unavailable"); },
  }));
  assert.equal(result.status, "ready");
  assert.deepEqual(result.activity, []);
  assert.equal(result.lifecycle, null);
});
