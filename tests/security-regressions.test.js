import assert from "node:assert/strict";
import test from "node:test";

import { createAction, executeAction, undoAction, clearActions } from "../src/core/actionEngine.js";
import { authorizeExecution, clearPermissions, revokePermission, seedPermissions } from "../src/core/permissionManager.js";
import { runVerifiedWorkflow } from "../src/core/executionLoop.js";

test("hydrated permissions cannot cross account boundaries", () => {
  clearPermissions();
  seedPermissions([{ permission: "browser.open_url", status: "granted", scope: "account" }], "account-a");

  const otherAccount = authorizeExecution({
    user: { id: "account-b", plan: "pro", entitlements: ["pro"], permissions: [] },
    capability: "browser.open_url",
    permission: "browser.open_url",
    riskLevel: "medium",
    confirmed: true,
  });

  assert.equal(otherAccount.authorized, false);
  clearPermissions();
});

test("queued actions require identity, permission, consent, and verified results", async () => {
  clearActions();
  const denied = createAction({ title: "Open site", tool: "browser.open_url", permission: "browser.open_url", riskLevel: "medium" });
  assert.equal((await executeAction(denied.id, async () => ({ success: true, verified: true }), { confirmed: true })).success, false);

  const user = { id: "release-user", plan: "pro", entitlements: ["pro"], permissions: ["browser.open_url"] };
  const unverified = createAction({ title: "Open site", tool: "browser.open_url", permission: "browser.open_url", riskLevel: "medium" });
  assert.equal((await executeAction(unverified.id, async () => ({ success: true, verified: false }), { confirmed: true, user })).success, false);

  const verified = createAction({ title: "Open site", tool: "browser.open_url", permission: "browser.open_url", riskLevel: "medium" });
  assert.equal((await executeAction(verified.id, async () => ({ success: true, verified: true }), { confirmed: true, user })).success, true);
});

test("verified workflows stop on reported failure and respect cancellation", async () => {
  let calls = 0;
  const failed = await runVerifiedWorkflow([{ tool: "one" }, { tool: "two" }], async () => {
    calls += 1;
    return { success: false, verified: false, error: "not completed" };
  }, { maxAttempts: 1 });
  assert.equal(failed.success, false);
  assert.equal(calls, 1);

  const controller = new AbortController();
  controller.abort();
  const cancelled = await runVerifiedWorkflow([{ tool: "one" }], async () => ({ success: true, verified: true }), { signal: controller.signal });
  assert.equal(cancelled.status, "cancelled");
});


function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("an action can only execute once, including concurrent attempts", async () => {
  clearActions();
  const user = { id: "concurrent-user", plan: "pro", permissions: ["browser.open_url"] };
  const action = createAction({ title: "Open site", tool: "browser.open_url", permission: "browser.open_url" });
  const gate = deferred();
  let calls = 0;
  const handler = async () => {
    calls += 1;
    await gate.promise;
    return { success: true, verified: true };
  };

  const first = executeAction(action.id, handler, { confirmed: true, user });
  const second = await executeAction(action.id, handler, { confirmed: true, user });
  assert.equal(second.success, false);
  assert.match(second.error, /running/);
  gate.resolve();
  assert.equal((await first).success, true);
  assert.equal((await executeAction(action.id, handler, { confirmed: true, user })).success, false);
  assert.equal(calls, 1);
  assert.equal(action.status, "completed");
  clearActions();
});

test("failed action executions are terminal and cannot be retried implicitly", async () => {
  clearActions();
  const user = { id: "failed-user", plan: "pro", permissions: ["browser.open_url"] };
  const action = createAction({ title: "Open site", tool: "browser.open_url", permission: "browser.open_url" });
  let calls = 0;
  const handler = async () => {
    calls += 1;
    throw new Error("provider failed after dispatch");
  };
  assert.equal((await executeAction(action.id, handler, { confirmed: true, user })).success, false);
  assert.equal((await executeAction(action.id, handler, { confirmed: true, user })).success, false);
  assert.equal(calls, 1);
  assert.equal(action.status, "failed");
  clearActions();
});

test("undo is single-flight and handles thrown handlers without leaking rejections", async () => {
  clearActions();
  const user = { id: "undo-user", plan: "pro", permissions: ["browser.open_url"] };
  const action = createAction({ title: "Open site", tool: "browser.open_url", permission: "browser.open_url", undo: { url: "https://example.com" } });
  assert.equal((await executeAction(action.id, async () => ({ success: true, verified: true }), { confirmed: true, user })).success, true);
  const gate = deferred();
  let calls = 0;
  const handler = async () => {
    calls += 1;
    await gate.promise;
    return { success: true, verified: true };
  };
  const first = undoAction(action.id, handler, { confirmed: true, user });
  const second = await undoAction(action.id, handler, { confirmed: true, user });
  assert.equal(second.success, false);
  gate.resolve();
  assert.equal((await first).success, true);
  assert.equal(calls, 1);
  assert.equal(action.status, "undone");

  const failed = createAction({ title: "Open site", tool: "browser.open_url", permission: "browser.open_url" });
  assert.equal((await executeAction(failed.id, async () => ({ success: true, verified: true }), { confirmed: true, user })).success, true);
  const undone = await undoAction(failed.id, async () => { throw new Error("undo uncertain"); }, { confirmed: true, user });
  assert.equal(undone.success, false);
  assert.equal(undone.error, "undo uncertain");
  assert.equal(failed.status, "undo_failed");
  clearActions();
});


test("permission decisions require an authenticated identity and ignore client tier overrides", () => {
  clearPermissions();
  const anonymous = authorizeExecution({
    capability: "web.search",
    permission: "web.search",
    riskLevel: "low",
  });
  assert.equal(anonymous.authorized, false);

  const downgraded = authorizeExecution({
    user: { id: "free-user", plan: "free", permissions: ["device.control"] },
    capability: "device.control",
    permission: "device.control",
    riskLevel: "low",
    confirmed: true,
    clientPlan: "elite",
    clientEntitlements: ["elite"],
  });
  assert.equal(downgraded.authorized, false);
  assert.equal(downgraded.plan, "free");
  assert.equal(downgraded.ignoredClientOverrides, true);
  clearPermissions();
});

test("high-risk execution requires explicit confirmation even when permission is granted", () => {
  clearPermissions();
  const user = { id: "pro-user", plan: "pro", permissions: ["web.search"] };
  const needsConfirmation = authorizeExecution({
    user,
    capability: "web.search",
    permission: "web.search",
    riskLevel: "high",
  });
  assert.equal(needsConfirmation.authorized, false);
  assert.equal(needsConfirmation.requiresConfirmation, true);

  const confirmed = authorizeExecution({
    user,
    capability: "web.search",
    permission: "web.search",
    riskLevel: "high",
    confirmed: true,
  });
  assert.equal(confirmed.authorized, true);
  clearPermissions();
});

test("critical computer-control primitives remain blocked after user confirmation", () => {
  clearPermissions();
  const decision = authorizeExecution({
    user: { id: "elite-user", plan: "elite", permissions: ["terminal.execute"] },
    capability: "terminal.execute",
    permission: "terminal.execute",
    riskLevel: "critical",
    confirmed: true,
  });
  assert.equal(decision.authorized, false);
  assert.match(decision.reason, /dedicated verified execution path/);
  clearPermissions();
});

test("revoked permissions cannot be reused by the same account", () => {
  clearPermissions();
  seedPermissions([{ permission: "browser.open_url", status: "granted", scope: "account" }], "revoked-user");
  const input = {
    user: { id: "revoked-user", plan: "pro", permissions: [] },
    capability: "browser.open_url",
    permission: "browser.open_url",
    riskLevel: "low",
    confirmed: true,
  };
  assert.equal(authorizeExecution(input).authorized, true);
  revokePermission("browser.open_url", "account");
  assert.equal(authorizeExecution(input).authorized, false);
  clearPermissions();
});
