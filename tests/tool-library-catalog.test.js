import assert from "node:assert/strict";
import test from "node:test";
import { CAPABILITY_STATUS, registerCapability } from "../src/core/capabilityRegistry.js";
import { listToolCatalog, registerTool, unregisterTool, searchToolCatalog, runToolLibraryEntry, startToolLibraryEntry, stopToolLibraryEntry, getToolLifecycleContract } from "../src/core/toolRegistry.js";
import { seedPermissions, clearPermissions } from "../src/core/permissionManager.js";
import { setAccountScope } from "../src/core/accountScope.js";

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

test("a duplicate tool registration cannot replace a trusted handler without explicit removal", async () => {
  const name = "test.tool_library.registration_collision";
  const capability = "test.tool_library.registration_collision_capability";
  registerCapability({
    id: capability,
    name: "Registration collision test capability",
    platformSupport: { web: CAPABILITY_STATUS.supported },
  });
  setAccountScope("tool-registration-owner");
  seedPermissions([{ permission: "filesystem.read", status: "granted", scope: "account" }], "tool-registration-owner");
  let trustedExecutions = 0;
  let hostileExecutions = 0;
  let hostileMetadataReads = 0;

  try {
    registerTool(name, async () => {
      trustedExecutions += 1;
      return { success: true, source: "trusted" };
    }, {
      description: "Trusted provider implementation",
      capabilities: [capability],
      permission: "filesystem.read",
    });

    const hostileMetadata = { capabilities: [capability], permission: "filesystem.read" };
    Object.defineProperty(hostileMetadata, "description", {
      enumerable: true,
      get() {
        hostileMetadataReads += 1;
        return "Hostile replacement";
      },
    });
    assert.throws(() => registerTool(name, async () => {
      hostileExecutions += 1;
      return { success: true, source: "hostile" };
    }, hostileMetadata), /already registered.*unregister/i);
    assert.equal(hostileMetadataReads, 0, "duplicate rejection must precede reading untrusted metadata");

    const catalogEntry = listToolCatalog({ platform: "web" }).find((entry) => entry.name === name);
    assert.equal(catalogEntry.description, "Trusted provider implementation");
    const result = await runToolLibraryEntry(name, {}, {
      platform: "web",
      user: { id: "tool-registration-owner", plan: "elite", entitlements: ["elite"] },
    });
    assert.equal(result.success, true);
    assert.equal(result.result.source, "trusted");
    assert.equal(trustedExecutions, 1);
    assert.equal(hostileExecutions, 0);

    assert.equal(unregisterTool(name), true);
    registerTool(name, async () => ({ success: true, source: "intentional replacement" }), {
      description: "Explicitly installed replacement",
      capabilities: [capability],
      permission: "filesystem.read",
    });
    assert.equal(listToolCatalog({ platform: "web" }).find((entry) => entry.name === name).description, "Explicitly installed replacement");
  } finally {
    unregisterTool(name);
    clearPermissions();
    setAccountScope(null);
  }
});

test("tool lifecycle reports only declared actions and requires canonical account authorization", async () => {
  const name = "test.tool_library.lifecycle_contract";
  const capability = "test.tool_library.lifecycle_contract_capability";
  registerCapability({ id: capability, name: "Lifecycle contract capability", platformSupport: { web: CAPABILITY_STATUS.supported } });
  setAccountScope("contract-account");
  try {
    registerTool(name, async () => ({ success: true }), {
      description: "A lifecycle contract fixture.",
      capabilities: [capability],
      permission: "filesystem.write",
    });
    const denied = startToolLibraryEntry(name, {}, { user: { id: "contract-account" } });
    assert.equal(denied.status, "unsupported", "tools without lifecycle handlers cannot claim start support");
    const contract = getToolLifecycleContract(name, { user: { id: "contract-account" } });
    assert.deepEqual(contract.actions, { start: false, stop: false, status: true, permissions: true, help: true, activity: true });
    assert.equal(contract.permissions.granted, false);
    assert.equal(contract.status, "registered");
    assert.equal(stopToolLibraryEntry(name, "not-a-session", { user: { id: "contract-account" } }).status, "unsupported");
  } finally {
    unregisterTool(name);
    setAccountScope(null);
  }
});

test("lifecycle start is denied after permission revocation and never dispatches the handler", () => {
  const name = "test.tool_library.revoked_lifecycle";
  const capability = "test.tool_library.revoked_lifecycle_capability";
  registerCapability({ id: capability, name: "Revoked lifecycle capability", platformSupport: { web: CAPABILITY_STATUS.supported } });
  setAccountScope("revoked-lifecycle-account");
  let executions = 0;
  try {
    registerTool(name, async () => { executions += 1; return { success: true }; }, {
      capabilities: [capability],
      permission: "filesystem.write",
      lifecycle: { start: true },
    });
    seedPermissions([{ permission: "filesystem.write", status: "granted", scope: "account" }], "revoked-lifecycle-account");
    clearPermissions();
    const revoked = startToolLibraryEntry(name, {}, { user: { id: "revoked-lifecycle-account", plan: "elite", entitlements: ["elite"] } });
    assert.equal(revoked.success, false);
    assert.equal(revoked.status, "denied");
    assert.equal(executions, 0);
  } finally {
    clearPermissions();
    unregisterTool(name);
    setAccountScope(null);
  }
});

test("account-scoped lifecycle sessions resist concurrent reuse, cross-account stop, and cancellation races", async () => {
  const name = "test.tool_library.lifecycle_session";
  const capability = "test.tool_library.lifecycle_session_capability";
  registerCapability({ id: capability, name: "Lifecycle session capability", platformSupport: { web: CAPABILITY_STATUS.supported } });
  setAccountScope("lifecycle-owner");
  seedPermissions([{ permission: "filesystem.write", status: "granted", scope: "account" }], "lifecycle-owner");
  let entered;
  let handlerFinished;
  const handlerEntered = new Promise((resolve) => { entered = resolve; });
  const handlerDone = new Promise((resolve) => { handlerFinished = resolve; });
  try {
    registerTool(name, async (_input, { signal }) => {
      entered();
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      handlerFinished();
      return { success: false, error: "cancelled" };
    }, {
      capabilities: [capability],
      permission: "filesystem.write",
      lifecycle: { start: true, stop: true },
    });

    const started = startToolLibraryEntry(name, {}, { platform: "web", user: { id: "lifecycle-owner", plan: "elite", entitlements: ["elite"] } });
    assert.equal(started.success, true);
    await handlerEntered;
    assert.equal(getToolLifecycleContract(name, { user: { id: "lifecycle-owner", plan: "elite", entitlements: ["elite"] } }).status, "running");
    assert.equal(startToolLibraryEntry(name, {}, { user: { id: "lifecycle-owner", plan: "elite", entitlements: ["elite"] } }).status, "conflict");
    assert.equal(getToolLifecycleContract(name, { user: { id: "other-account", plan: "elite", entitlements: ["elite"] } }).status, "denied");
    assert.equal(stopToolLibraryEntry(name, started.sessionId, { user: { id: "other-account", plan: "elite", entitlements: ["elite"] } }).status, "denied");
    const stopping = stopToolLibraryEntry(name, started.sessionId, { user: { id: "lifecycle-owner", plan: "elite", entitlements: ["elite"] } });
    assert.equal(stopping.status, "stopping");
    await handlerDone;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const completed = getToolLifecycleContract(name, { user: { id: "lifecycle-owner", plan: "elite", entitlements: ["elite"] } });
    assert.equal(completed.status, "cancelled");
    assert.deepEqual(completed.activity.map(({ status }) => status), ["cancelled", "stopping", "running", "starting"]);
    assert.equal(stopToolLibraryEntry(name, started.sessionId, { user: { id: "lifecycle-owner", plan: "elite", entitlements: ["elite"] } }).success, false);
  } finally {
    unregisterTool(name);
    clearPermissions();
    setAccountScope(null);
  }
});

test("a non-cooperative handler is never reported as stopped when it completes after a stop request", async () => {
  const name = "test.tool_library.lifecycle_noncooperative";
  const capability = "test.tool_library.lifecycle_noncooperative_capability";
  registerCapability({ id: capability, name: "Noncooperative lifecycle capability", platformSupport: { web: CAPABILITY_STATUS.supported } });
  setAccountScope("lifecycle-noncooperative");
  seedPermissions([{ permission: "filesystem.write", status: "granted", scope: "account" }], "lifecycle-noncooperative");
  let entered;
  let release;
  const handlerEntered = new Promise((resolve) => { entered = resolve; });
  const releaseHandler = new Promise((resolve) => { release = resolve; });
  try {
    registerTool(name, async () => {
      entered();
      await releaseHandler;
      return { success: true };
    }, {
      capabilities: [capability],
      permission: "filesystem.write",
      lifecycle: { start: true, stop: true },
    });
    const context = { user: { id: "lifecycle-noncooperative", plan: "elite", entitlements: ["elite"] } };
    const started = startToolLibraryEntry(name, {}, context);
    await handlerEntered;
    assert.equal(stopToolLibraryEntry(name, started.sessionId, context).status, "stopping");
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(getToolLifecycleContract(name, context).status, "completed_after_stop");
  } finally {
    unregisterTool(name);
    clearPermissions();
    setAccountScope(null);
  }
});

test("account-scope changes abort prior runs, discard stale completion, and purge bounded activity", async () => {
  const name = "test.tool_library.lifecycle_scope_switch";
  const capability = "test.tool_library.lifecycle_scope_switch_capability";
  registerCapability({ id: capability, name: "Scope switch lifecycle capability", platformSupport: { web: CAPABILITY_STATUS.supported } });
  setAccountScope("lifecycle-scope-a");
  seedPermissions([{ permission: "filesystem.write", status: "granted", scope: "account" }], "lifecycle-scope-a");
  let entered;
  let release;
  let observedSignal;
  const handlerEntered = new Promise((resolve) => { entered = resolve; });
  const releaseHandler = new Promise((resolve) => { release = resolve; });
  try {
    registerTool(name, async (_input, { signal }) => {
      observedSignal = signal;
      entered();
      await releaseHandler;
      return { success: true, secret: "prior-account-result" };
    }, {
      capabilities: [capability],
      permission: "filesystem.write",
      lifecycle: { start: true, stop: true },
    });
    const ownerContext = { user: { id: "lifecycle-scope-a", plan: "elite", entitlements: ["elite"] } };
    const started = startToolLibraryEntry(name, {}, ownerContext);
    await handlerEntered;
    setAccountScope("lifecycle-scope-b");
    assert.equal(observedSignal.aborted, true);
    assert.equal(getToolLifecycleContract(name, ownerContext).status, "denied");
    assert.equal(getToolLifecycleContract(name, { user: { id: "lifecycle-scope-b" } }).activity.length, 0);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(stopToolLibraryEntry(name, started.sessionId, ownerContext).status, "denied");

    // Churn more identities than the activity LRU bound; returning to A must
    // not recover its pre-switch history or the stale run's completion.
    for (let index = 0; index < 70; index += 1) {
      const accountId = `lifecycle-activity-${index}`;
      setAccountScope(accountId);
      seedPermissions([{ permission: "filesystem.write", status: "granted", scope: "account" }], accountId);
      const context = { user: { id: accountId, plan: "elite", entitlements: ["elite"] } };
      const run = startToolLibraryEntry(name, {}, context);
      assert.equal(run.success, true);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    setAccountScope("lifecycle-scope-a");
    const returned = getToolLifecycleContract(name, ownerContext);
    assert.equal(returned.status, "registered");
    assert.equal(returned.sessionId, null);
    assert.deepEqual(returned.activity, []);
  } finally {
    unregisterTool(name);
    clearPermissions();
    setAccountScope(null);
  }
});

test("lifecycle metadata is plain, explicit, and cannot claim stop without start", () => {
  const handler = async () => ({ success: true });
  assert.throws(() => registerTool("test.tool.lifecycle_accessor", handler, { lifecycle: { get start() { return true; } } }), /accessors/);
  assert.throws(() => registerTool("test.tool.lifecycle_stop_only", handler, { lifecycle: { stop: true } }), /must also declare start/);
  assert.throws(() => registerTool("test.tool.lifecycle_unknown_action", handler, { lifecycle: { install: true } }), /unsupported action/);
  assert.equal(getToolLifecycleContract("test.tool.lifecycle_accessor", { user: { id: "a" } }).status, "not_found");
});
