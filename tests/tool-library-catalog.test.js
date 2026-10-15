import assert from "node:assert/strict";
import test from "node:test";
import { CAPABILITY_STATUS, registerCapability } from "../src/core/capabilityRegistry.js";
import { listToolCatalog, registerTool, unregisterTool, searchToolCatalog, runToolLibraryEntry } from "../src/core/toolRegistry.js";
import { seedPermissions, clearPermissions } from "../src/core/permissionManager.js";

test("Tool Library catalog derives availability from capability policy without exposing handlers", () => {
  const availableCapability = "test.tool_library.available";
  const restrictedCapability = "test.tool_library.restricted";
  registerCapability({
    id: availableCapability,
    name: "Available test capability",
    platforms: ["ios"],
    platformSupport: { ios: CAPABILITY_STATUS.supported },
  });
  registerCapability({
    id: restrictedCapability,
    name: "Restricted test capability",
    platforms: ["ios"],
    platformSupport: { ios: CAPABILITY_STATUS.restricted },
  });

  const names = ["test.tool_library.available_tool", "test.tool_library.restricted_tool"];
  try {
    registerTool(names[0], async () => ({ success: true }), {
      capabilities: [availableCapability],
      permissions: ["browser.open_url"],
      riskLevel: "medium",
      requiresConfirmation: true,
    });
    registerTool(names[1], async () => ({ success: true }), {
      capabilities: [restrictedCapability],
      permission: "browser.open_url",
    });

    let adapterExecutions = 0;
    const adapter = {
      platform: "ios",
      capabilities: [availableCapability, restrictedCapability],
      execute() { adapterExecutions += 1; },
    };
    const catalog = listToolCatalog({ platform: "ios", adapter });
    const supported = catalog.find((tool) => tool.name === names[0]);
    const restricted = catalog.find((tool) => tool.name === names[1]);

    assert.deepEqual({ status: supported.status, available: supported.available }, {
      status: CAPABILITY_STATUS.supported,
      available: true,
    });
    assert.equal(supported.lifecycle, "registered");
    assert.equal(supported.riskLevel, "medium");
    assert.equal(supported.requiresConfirmation, true);
    assert.deepEqual(supported.permissions, ["browser.open_url"]);
    assert.equal(Object.hasOwn(supported, "handler"), false);
    assert.equal(Object.hasOwn(supported, "execute"), false);
    assert.equal(restricted.status, CAPABILITY_STATUS.restricted);
    assert.equal(restricted.available, false);
    assert.equal(adapterExecutions, 0);
    assert.throws(() => { supported.permissions.push("terminal.execute"); }, TypeError);
  } finally {
    names.forEach(unregisterTool);
  }
});

test("unknown or malformed declared capabilities remain unsupported in discovery", () => {
  const name = "test.tool_library.unknown_capability";
  try {
    registerTool(name, async () => ({ success: true }), {
      // A malformed declaration must never be interpreted as platform support.
      capabilities: [{ id: "test.tool_library.unknown" }],
      permission: "browser.open_url",
    });

    const [descriptor] = listToolCatalog({ platform: "web" }).filter((tool) => tool.name === name);
    assert.equal(descriptor.status, CAPABILITY_STATUS.unsupported);
    assert.equal(descriptor.available, false);
    assert.deepEqual(descriptor.capabilities[0], {
      capability: null,
      platform: "web",
      status: CAPABILITY_STATUS.unsupported,
      available: false,
      error: "Tool capability declaration is invalid.",
    });
  } finally {
    unregisterTool(name);
  }
});

test("catalog discovery is account-independent and cannot be steered by caller permission claims", () => {
  const name = "test.tool_library.account_neutral";
  registerCapability({
    id: "test.tool_library.account_neutral_capability",
    name: "Account neutral test capability",
    platforms: ["web"],
    platformSupport: { web: CAPABILITY_STATUS.permissionRequired },
  });
  try {
    registerTool(name, async () => ({ success: true }), {
      capabilities: ["test.tool_library.account_neutral_capability"],
      permission: "browser.open_url",
    });
    const normal = listToolCatalog({ platform: "web" }).find((tool) => tool.name === name);
    const forgedCaller = listToolCatalog({
      platform: "web",
      user: { id: "attacker", permissions: ["*"] },
      permissionScope: "global",
      confirmed: true,
    }).find((tool) => tool.name === name);

    assert.equal(normal.status, CAPABILITY_STATUS.permissionRequired);
    assert.equal(forgedCaller.status, normal.status);
    assert.equal(forgedCaller.available, false);
  } finally {
    unregisterTool(name);
  }
});

test("Tool Library search is read-only, useful by name or metadata, and category-aware", () => {
  const names = ["test.tool_library.search_files", "test.tool_library.search_mail"];
  try {
    registerTool(names[0], async () => ({ success: true }), {
      description: "Read and organize local files",
      category: "files",
      capabilities: ["test.tool_library.search_capability"],
      permission: "filesystem.read",
    });
    registerTool(names[1], async () => ({ success: true }), {
      description: "Search messages",
      category: "mail",
      capabilities: ["test.tool_library.search_capability"],
      permission: "mail.read",
    });
    registerCapability({
      id: "test.tool_library.search_capability",
      name: "Search test capability",
      platformSupport: { web: CAPABILITY_STATUS.supported },
    });

    const matches = searchToolCatalog("ORGANIZE", { platform: "web", category: "files" });
    assert.deepEqual(matches.map(({ name }) => name), [names[0]]);
    assert.equal(Object.hasOwn(matches[0], "handler"), false);
    assert.deepEqual(searchToolCatalog("no match", { platform: "web" }), []);
    assert.throws(() => searchToolCatalog({ query: "organize" }), /must be a string/);
  } finally {
    names.forEach(unregisterTool);
  }
});

test("Tool Library run rechecks platform policy and delegates account permission to canonical authority", async () => {
  const supported = "test.tool_library.runnable";
  const restricted = "test.tool_library.restricted_runnable";
  registerCapability({
    id: "test.tool_library.runnable_capability",
    name: "Runnable test capability",
    platformSupport: { web: CAPABILITY_STATUS.supported },
  });
  registerCapability({
    id: "test.tool_library.restricted_runnable_capability",
    name: "Restricted runnable test capability",
    platformSupport: { web: CAPABILITY_STATUS.restricted },
  });
  let executions = 0;
  try {
    registerTool(supported, async () => { executions += 1; return { success: true, verified: true }; }, {
      capabilities: ["test.tool_library.runnable_capability"],
      permission: "filesystem.write",
      riskLevel: "low",
    });
    registerTool(restricted, async () => { executions += 1; return { success: true, verified: true }; }, {
      capabilities: ["test.tool_library.restricted_runnable_capability"],
      permission: "filesystem.write",
      riskLevel: "low",
    });

    const wrongPlatform = await runToolLibraryEntry(supported, {}, { platform: "ios", user: { id: "account-b" } });
    assert.equal(wrongPlatform.success, false);
    assert.equal(wrongPlatform.status, CAPABILITY_STATUS.unsupported);
    assert.match(wrongPlatform.error, /unsupported/i);

    const restrictedResult = await runToolLibraryEntry(restricted, {}, { platform: "web", user: { id: "account-b" } });
    assert.equal(restrictedResult.success, false);
    assert.equal(restrictedResult.status, CAPABILITY_STATUS.restricted);
    assert.equal(executions, 0);

    // Permission state is seeded for account A; account B cannot borrow it.
    seedPermissions([{ permission: "filesystem.write", status: "granted", scope: "account" }], "account-a");
    const crossAccount = await runToolLibraryEntry(supported, {}, { platform: "web", permissionScope: "global", user: { id: "account-b", plan: "elite", entitlements: ["elite"], permissions: ["*"] } });
    assert.equal(crossAccount.success, false);
    assert.equal(crossAccount.status, "denied");
    assert.match(crossAccount.error, /canonical account permission/);
    assert.equal(executions, 0);

    const canonicalAccount = await runToolLibraryEntry(supported, {}, { platform: "web", user: { id: "account-a", plan: "elite", entitlements: ["elite"] } });
    assert.equal(canonicalAccount.success, true);
    assert.equal(canonicalAccount.authorization.authorized, true);
    assert.equal(executions, 1);

    const missing = await runToolLibraryEntry("test.tool_library.not_registered", {}, { platform: "web" });
    assert.equal(missing.success, false);
    assert.equal(missing.status, "not_found");
  } finally {
    clearPermissions();
    unregisterTool(supported);
    unregisterTool(restricted);
  }
});
