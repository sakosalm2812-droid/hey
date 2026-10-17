import assert from "node:assert/strict";
import test from "node:test";
import { getToolLibraryLifecycleView } from "../src/lib/toolLibraryLifecycleView.js";

function contract(overrides = {}) {
  return {
    accountId: "account-a",
    actions: { start: true, stop: true },
    status: "registered",
    readiness: "ready",
    sessionId: null,
    ...overrides,
  };
}

test("lifecycle controls are visible only in the matching active account scope", () => {
  for (const [accountId, scope] of [["account-b", "account:account-b"], ["account-a", "anonymous"], [null, "account:account-a"]]) {
    const view = getToolLibraryLifecycleView(contract(), accountId, scope, "supported");
    assert.equal(view.visible, false);
    assert.equal(view.canStart, false);
    assert.equal(view.canStop, false);
  }
  assert.equal(getToolLibraryLifecycleView(contract(), "account-a", "account:account-a", "supported").canStart, true);
});

test("controls require declared actions, supported capability, and usable session state", () => {
  const noActions = getToolLibraryLifecycleView(contract({ actions: { start: false, stop: false } }), "account-a", "account:account-a", "supported");
  assert.equal(noActions.startDeclared, false);
  assert.equal(noActions.stopDeclared, false);
  assert.equal(noActions.canStart, false);
  assert.equal(noActions.canStop, false);

  assert.equal(getToolLibraryLifecycleView(contract({ readiness: "unavailable" }), "account-a", "account:account-a", "supported").canStart, false);
  assert.equal(getToolLibraryLifecycleView(contract(), "account-a", "account:account-a", "unsupported").canStart, false);
  assert.equal(getToolLibraryLifecycleView(contract({ status: "running", sessionId: "session-a" }), "account-a", "account:account-a", "supported").canStart, false);
  assert.equal(getToolLibraryLifecycleView(contract({ status: "starting", sessionId: "session-a" }), "account-a", "account:account-a", "supported").canStop, true);
  assert.equal(getToolLibraryLifecycleView(contract({ status: "running" }), "account-a", "account:account-a", "supported").canStop, false);
  assert.equal(getToolLibraryLifecycleView(contract({ status: "completed", sessionId: "session-a" }), "account-a", "account:account-a", "supported").canStop, false);
});

test("retry is exposed only for a declared retry action on the current failed session", () => {
  const failed = contract({ actions: { start: true, stop: false, retry: true }, status: "failed", sessionId: "failed-session" });
  const view = getToolLibraryLifecycleView(failed, "account-a", "account:account-a", "supported");
  assert.equal(view.retryDeclared, true);
  assert.equal(view.canRetry, true);
  assert.equal(getToolLibraryLifecycleView(contract({ actions: { retry: true }, status: "running", sessionId: "session-a" }), "account-a", "account:account-a", "supported").canRetry, false);
  assert.equal(getToolLibraryLifecycleView(contract({ actions: { retry: false }, status: "failed", sessionId: "failed-session" }), "account-a", "account:account-a", "supported").canRetry, false);
  assert.equal(getToolLibraryLifecycleView(contract({ actions: { retry: true }, status: "failed" }), "account-a", "account:account-a", "supported").canRetry, false);
  assert.equal(getToolLibraryLifecycleView(failed, "account-b", "account:account-b", "supported").canRetry, false);
  assert.equal(getToolLibraryLifecycleView(contract({ actions: { retry: true }, status: "failed", sessionId: "failed-session", readiness: "unavailable" }), "account-a", "account:account-a", "supported").canRetry, false);
});

test("removal is exposed only for a declared action on a settled current-account session", () => {
  const completed = contract({ actions: { start: true, remove: true }, status: "completed", sessionId: "session-a" });
  assert.equal(getToolLibraryLifecycleView(completed, "account-a", "account:account-a", "supported").canRemove, true);
  for (const status of ["starting", "running", "stopping", "registered", "removed"]) {
    assert.equal(getToolLibraryLifecycleView(contract({ actions: { remove: true }, status, sessionId: "session-a" }), "account-a", "account:account-a", "supported").canRemove, false);
  }
  assert.equal(getToolLibraryLifecycleView(contract({ actions: {}, status: "failed", sessionId: "session-a" }), "account-a", "account:account-a", "supported").canRemove, false);
  assert.equal(getToolLibraryLifecycleView(contract({ actions: { remove: true }, status: "failed", sessionId: "session-a", readiness: "permission_required" }), "account-a", "account:account-a", "supported").canRemove, false);
  assert.equal(getToolLibraryLifecycleView(completed, "account-b", "account:account-b", "supported").canRemove, false);
});

test("hostile accessors on lifecycle contracts are never invoked", () => {
  let getterCalls = 0;
  const hostile = { accountId: "account-a" };
  for (const key of ["actions", "status", "readiness", "sessionId"]) {
    Object.defineProperty(hostile, key, { enumerable: true, get() { getterCalls += 1; throw new Error("hostile accessor"); } });
  }
  const view = getToolLibraryLifecycleView(hostile, "account-a", "account:account-a", "supported");
  assert.equal(getterCalls, 0);
  assert.equal(view.canStart, false);
  assert.equal(view.canStop, false);
  assert.equal(view.status, "registered");
  assert.equal(view.readiness, "unavailable");

  const hostileIdentity = {};
  Object.defineProperty(hostileIdentity, "accountId", { get() { getterCalls += 1; return "account-a"; } });
  assert.equal(getToolLibraryLifecycleView(hostileIdentity, "account-a", "account:account-a", "supported").visible, false);
  assert.equal(getterCalls, 0);
});
