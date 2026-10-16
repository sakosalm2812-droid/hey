import assert from "node:assert/strict";
import test from "node:test";
import { clearEventListeners, subscribe } from "../src/core/eventBus.js";
import { setAccountScope } from "../src/core/accountScope.js";
import { clearPermissions, seedPermissions } from "../src/core/permissionManager.js";
import { executeRequest } from "../src/core/executionController.js";
import { getComputerCapabilityAvailability, registerComputerTools } from "../src/core/computerTools.js";
import { executeTool, listToolCatalog, runToolLibraryEntry } from "../src/core/toolRegistry.js";

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

test("Tool Library device-readiness check is read-only, permission-gated, schema-validated, and reports browser API failure", async () => {
  const accountId = "device-readiness-tool-account";
  const previousGlobals = Object.fromEntries(["navigator", "window", "screen"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let browserReads = 0;
  const browserNavigator = {
    get connection() { browserReads += 1; return { effectiveType: "4g", downlink: 12, rtt: 50 }; },
    get language() { browserReads += 1; return "en-US"; },
    get onLine() { browserReads += 1; return false; },
    get userAgent() { browserReads += 1; return "HEY test browser"; },
    get deviceMemory() { browserReads += 1; return 4; },
    get hardwareConcurrency() { browserReads += 1; return 8; },
    async getBattery() { throw new Error("Battery API unavailable"); },
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: browserNavigator });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { ontouchstart: null, PointerEvent: function PointerEvent() {}, devicePixelRatio: 2 } });
  Object.defineProperty(globalThis, "screen", { configurable: true, value: { width: 1366, height: 768, availWidth: 1366, availHeight: 728, orientation: { type: "landscape-primary" } } });
  setAccountScope(accountId);
  seedPermissions([], accountId);
  try {
    registerComputerTools();
    const entry = listToolCatalog({ platform: "web" }).find(({ name }) => name === "computer.system_info");
    assert.equal(entry.status, "supported");
    assert.match(entry.description, /device readiness/i);

    const denied = await runToolLibraryEntry("computer.system_info", {}, { platform: "web", user: { id: accountId, plan: "pro" } });
    assert.equal(denied.success, false);
    assert.equal(denied.status, "denied");
    assert.equal(browserReads, 0, "permission denial must happen before reading browser state");

    seedPermissions([{ permission: "system.info", status: "granted", scope: "account" }], accountId);
    const failed = await runToolLibraryEntry("computer.system_info", {}, { platform: "web", user: { id: accountId, plan: "pro" } });
    assert.equal(failed.success, false);
    assert.match(failed.error, /Battery API unavailable/);
    assert.notEqual(failed.metadata.verified, true, "a failed browser read must never carry verification evidence");

    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { ...browserNavigator, getBattery: undefined } });
    const checked = await runToolLibraryEntry("computer.system_info", {}, { platform: "web", user: { id: accountId, plan: "pro" } });
    assert.equal(checked.success, true);
    assert.equal(checked.result.verified, true);
    assert.equal(checked.result.platform, "web");
    assert.equal(checked.result.data.online, false, "the browser's offline hint is reported without claiming internet reachability");
    assert.equal(checked.result.data.screen.orientation, "landscape-primary");
  } finally {
    clearPermissions();
    setAccountScope(null);
    for (const key of ["navigator", "window", "screen"]) {
      if (previousGlobals[key]) Object.defineProperty(globalThis, key, previousGlobals[key]);
      else delete globalThis[key];
    }
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
