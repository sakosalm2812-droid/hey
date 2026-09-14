import assert from "node:assert/strict";
import test from "node:test";

import { createAction, executeAction, clearActions } from "../src/core/actionEngine.js";
import { authorizeExecution, clearPermissions, seedPermissions } from "../src/core/permissionManager.js";
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
