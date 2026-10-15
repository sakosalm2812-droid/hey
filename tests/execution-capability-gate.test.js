import assert from "node:assert/strict";
import test from "node:test";
import { clearEventListeners, subscribe } from "../src/core/eventBus.js";
import { setAccountScope } from "../src/core/accountScope.js";
import { clearPermissions, grantPermission, requestPermission, seedPermissions } from "../src/core/permissionManager.js";
import { executeRequest } from "../src/core/executionController.js";
import { getComputerCapabilityAvailability, registerComputerTools } from "../src/core/computerTools.js";
import { executeTool, listToolCatalog, registerTool, runToolLibraryEntry, startToolLibraryEntry, unregisterTool } from "../src/core/toolRegistry.js";
import { createBrowserOSAdapter } from "../src/core/osAdapter.js";

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
    const urlTool = listToolCatalog({ platform: "web" }).find((tool) => tool.name === "computer.open_url");
    assert.equal(urlTool.status, "supported");
    assert.deepEqual(urlTool.permissions, ["browser.open_url"]);
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

test("browser popup denial returns a failed, unverified result instead of a success receipt", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { open: () => null },
  });
  try {
    const result = await createBrowserOSAdapter().openUrl({ url: "https://example.com" });
    assert.equal(result.success, false);
    assert.equal(result.verified, false);
    assert.match(result.error, /blocked/i);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
  }
});

test("browser open-url isolates an accepted tab and verifies only browser acceptance", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const opened = { opener: {}, closed: false };
  let argumentsSeen;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { open: (...args) => { argumentsSeen = args; return opened; } },
  });
  try {
    const result = await createBrowserOSAdapter().openUrl({ url: "https://example.com/path" });
    assert.deepEqual(argumentsSeen, ["https://example.com/path", "_blank"]);
    assert.equal(opened.opener, null);
    assert.equal(result.success, true);
    assert.equal(result.verified, true);
    assert.equal(result.url, "https://example.com/path");
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
  }
});

test("browser open-url does not claim verification when a new browsing context is already isolated", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { open: () => ({ opener: null, closed: true }) },
  });
  try {
    const result = await createBrowserOSAdapter().openUrl({ url: "https://example.com" });
    assert.equal(result.success, false);
    assert.equal(result.verified, false);
    assert.match(result.error, /check the browser before retrying/i);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
  }
});

test("Tool Library URL journey requests permission, waits for confirmation, then returns the verified browser receipt", async () => {
  const accountId = "tool-library-url-journey-account";
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const opened = { opener: {}, closed: false };
  let openCalls = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { open: () => { openCalls += 1; return opened; } },
  });
  setAccountScope(accountId);
  seedPermissions([], accountId);
  try {
    registerComputerTools();
    const request = requestPermission({
      permission: "browser.open_url", scope: "account", riskLevel: "medium", reason: "Open a web address from the Tool Library.",
    });
    assert.equal(request.requiresConfirmation, true);
    grantPermission("browser.open_url", "account", { source: "tool_library", accountId });

    const pending = await runToolLibraryEntry("computer.open_url", { url: "https://example.com/path" }, {
      platform: "web", user: { id: accountId, plan: "pro" }, requestId: "tool-library-url-journey", confirmed: false,
    });
    assert.equal(pending.success, false);
    assert.equal(pending.status, "permission_required");
    assert.equal(openCalls, 0);

    const result = await runToolLibraryEntry("computer.open_url", { url: "https://example.com/path" }, {
      platform: "web", user: { id: accountId, plan: "pro" }, requestId: "tool-library-url-journey", confirmed: true,
    });
    assert.equal(result.success, true);
    assert.equal(result.result.verified, true);
    assert.equal(opened.opener, null);
    assert.equal(openCalls, 1);
  } finally {
    clearPermissions();
    setAccountScope(null);
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
  }
});

test("a caller-supplied adapter cannot make an unavailable registered tool executable", async () => {
  registerComputerTools();
  let dispatches = 0;
  const result = await runToolLibraryEntry("computer.open_app", { target: "Calculator" }, {
    platform: "web",
    user: { id: "adapter-mismatch-account", plan: "elite" },
    adapter: {
      capabilities: ["app.open"],
      execute: async () => { dispatches += 1; return { success: true, verified: true }; },
    },
  });
  assert.equal(result.success, false);
  assert.equal(result.status, "unsupported");
  assert.equal(dispatches, 0);
});

test("a caller-supplied adapter cannot start a lifecycle tool on an unavailable runtime", () => {
  const accountId = "adapter-start-mismatch-account";
  const toolName = "test.adapter_mismatch.lifecycle";
  registerComputerTools();
  setAccountScope(accountId);
  seedPermissions([{ permission: "app.open", status: "granted", scope: "account" }], accountId);
  let dispatches = 0;
  try {
    registerTool(toolName, async () => { dispatches += 1; return { success: true }; }, {
      capabilities: ["app.open"], permission: "app.open", riskLevel: "low",
      lifecycle: { start: true, stop: true },
      inputSchema: { type: "object", properties: {}, required: [] },
    });
    const result = startToolLibraryEntry(toolName, {}, {
      platform: "web", user: { id: accountId, plan: "elite" },
      adapter: { capabilities: ["app.open"], execute: async () => ({ success: true }) },
    });
    assert.equal(result.success, false);
    assert.equal(result.status, "unsupported");
    assert.equal(dispatches, 0);
  } finally {
    unregisterTool(toolName);
    clearPermissions();
    setAccountScope(null);
  }
});

test("Tool Library fails closed for tools requiring multiple permissions", async () => {
  const toolName = "test.tool_library.multiple_permissions";
  let dispatches = 0;
  try {
    registerTool(toolName, async () => { dispatches += 1; return { success: true, verified: true }; }, {
      capabilities: ["browser.open_url"],
      permissions: ["browser.open_url", "filesystem.read"],
      inputSchema: { type: "object", properties: {}, required: [] },
    });
    const catalogEntry = listToolCatalog({ platform: "web" }).find((tool) => tool.name === toolName);
    assert.deepEqual(catalogEntry.permissions, ["browser.open_url", "filesystem.read"]);
    const result = await runToolLibraryEntry(toolName, {}, { platform: "web", user: { id: "multi-permission-account", plan: "elite" } });
    assert.equal(result.success, false);
    assert.equal(result.status, "unsupported_authorization");
    assert.equal(dispatches, 0);
  } finally {
    unregisterTool(toolName);
  }
});
