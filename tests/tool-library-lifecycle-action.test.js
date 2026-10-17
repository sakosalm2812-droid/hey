import assert from "node:assert/strict";
import test from "node:test";
import { invokeToolLibraryLifecycleAction } from "../src/lib/toolLibraryLifecycleAction.js";

test("lifecycle responses are copied to immutable UI-safe fields", () => {
  const result = invokeToolLibraryLifecycleAction(() => ({
    success: true,
    status: "starting",
    sessionId: "session-a",
    actions: { start: true, stop: false, retry: true, remove: false, ignored: true },
    readiness: "ready",
    availability: { reason: null, details: "ignored" },
    ignored: "not copied",
  }));
  assert.deepEqual(result, {
    success: true,
    status: "starting",
    error: null,
    sessionId: "session-a",
    readiness: "ready",
    actions: { start: true, stop: false, retry: true, remove: false },
    availability: { reason: null },
  });
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.actions));
  assert.ok(Object.isFrozen(result.availability));
});

test("thrown lifecycle API failures become safe error results", () => {
  const result = invokeToolLibraryLifecycleAction(() => { throw new Error("secret=private-value"); });
  assert.deepEqual(result, {
    success: false,
    status: "error",
    error: "HEY could not complete this session action safely.",
  });
});

test("accessors and hostile proxies fail closed without running getters", () => {
  let getterCalls = 0;
  const response = { success: true, status: "starting" };
  Object.defineProperty(response, "sessionId", { get() { getterCalls += 1; throw new Error("hostile"); } });
  assert.equal(invokeToolLibraryLifecycleAction(() => response).status, "error");
  assert.equal(getterCalls, 0);

  const actions = {};
  Object.defineProperty(actions, "start", { get() { getterCalls += 1; return true; } });
  assert.equal(invokeToolLibraryLifecycleAction(() => ({ success: true, status: "registered", actions })).status, "error");
  assert.equal(getterCalls, 0);

  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  assert.equal(invokeToolLibraryLifecycleAction(() => revoked.proxy).status, "error");
  assert.equal(invokeToolLibraryLifecycleAction(() => null).status, "error");
});
