import assert from "node:assert/strict";
import test from "node:test";
import { CAPABILITY_STATUS, registerCapability } from "../src/core/capabilityRegistry.js";
import { listToolCatalog, registerTool, unregisterTool } from "../src/core/toolRegistry.js";

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
