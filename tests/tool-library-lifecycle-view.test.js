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
