import assert from "node:assert/strict";
import test from "node:test";
import { clearEventListeners, subscribe } from "../src/core/eventBus.js";
import { setAccountScope } from "../src/core/accountScope.js";
import { clearPermissions, seedPermissions } from "../src/core/permissionManager.js";
import { executeRequest } from "../src/core/executionController.js";
import { getComputerCapabilityAvailability, registerComputerTools } from "../src/core/computerTools.js";
import { executeTool } from "../src/core/toolRegistry.js";

test("natural URL execution uses the configured capability, requires approval, and reports browser failure", async () => {
  const accountId = "browser-capability-account";
  assert.equal(getComputerCapabilityAvailability("browser.open_url").status, "supported");

  const permissionEvents = [];
  const failureEvents = [];
  const unsubscribers = [
    subscribe("execution.step.permission_required", (event) => permissionEvents.push(event)),
    subscribe("execution.step.failed", (event) => failureEvents.push(event)),
  ];
  setAccountScope(accountId);
  seedPermissions([{ permission: "browser.open_url", status: "granted", scope: "account" }], accountId);
  try {
    registerComputerTools();
    const pending = await executeRequest({ input: "open https://example.com" }, {
      user: { id: accountId, plan: "pro" },
      rememberExecution: false,
    });
    assert.equal(pending.status, "permission_required");
    assert.equal(pending.result.requiresConfirmation, true);
    assert.equal(permissionEvents.length, 1);

    const approved = await executeRequest({ input: "open https://example.com" }, {
      user: { id: accountId, plan: "pro" },
      confirmed: true,
      rememberExecution: false,
    });
    // The Node test host has no browser window. The real adapter is reached and
    // returns a failure instead of claiming that a tab opened.
    assert.equal(approved.success, false);
    assert.equal(approved.status, "failed");
    assert.match(approved.result.message, /browser could not open/i);
    assert.equal(failureEvents.length, 1);

    const unsafeScheme = await executeTool("computer.open_url", { url: "javascript:alert(1)" }, {
      user: { id: accountId, plan: "pro" },
      confirmed: true,
    });
    assert.equal(unsafeScheme.success, false);
    assert.match(unsafeScheme.error, /HTTP and HTTPS/i);
  } finally {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    clearEventListeners("execution.step.permission_required");
    clearEventListeners("execution.step.failed");
    clearPermissions();
    setAccountScope(null);
  }
});

test("execution refuses a browser capability absent from the configured adapter", async () => {
  let dispatched = 0;
  registerComputerTools();
  assert.equal(getComputerCapabilityAvailability("app.open").status, "unsupported");
  const result = await executeRequest({ input: "Open Chrome." }, {
    confirmed: true,
    executeTool: async () => { dispatched += 1; return { success: true, result: { verified: true } }; },
    rememberExecution: false,
  });
  assert.equal(result.success, false);
  assert.equal(result.status, "unsupported");
  assert.equal(result.result.code, "CAPABILITY_UNAVAILABLE");
  assert.equal(dispatched, 0);
});
