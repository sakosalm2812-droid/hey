import assert from "node:assert/strict";
import test from "node:test";
import HEY from "../src/core/index.js";
import { CAPABILITY_STATUS, registerCapability } from "../src/core/capabilityRegistry.js";
import { listToolCatalog, registerTool, unregisterTool, searchToolCatalog, runToolLibraryEntry, startToolLibraryEntry, stopToolLibraryEntry, retryToolLibraryEntry, getToolLifecycleContract, getToolLifecycleActivity } from "../src/core/toolRegistry.js";
import { seedPermissions, clearPermissions, revokePermission } from "../src/core/permissionManager.js";
import { setAccountScope } from "../src/core/accountScope.js";
import { publish } from "../src/core/eventBus.js";

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

test("catalog availability denies a tool whose capability dependency is missing", () => {
  const name = "test.tool_library.missing_dependency";
  const capability = "test.tool_library.missing_dependency_capability";
  registerCapability({
    id: capability,
    name: "Capability with an unavailable prerequisite",
    supportedPlatforms: ["web"],
    platformSupport: { web: CAPABILITY_STATUS.supported },
    dependencies: ["test.tool_library.not_registered_prerequisite"],
  });
  try {
    registerTool(name, async () => ({ success: true }), {
      capabilities: [capability],
      permission: "filesystem.read",
    });
    const entry = listToolCatalog({ platform: "web" }).find((tool) => tool.name === name);
    assert.equal(entry.status, CAPABILITY_STATUS.unsupported);
    assert.equal(entry.available, false);
    assert.match(entry.capabilities[0].error, /missing dependency/);
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
    assert.deepEqual(contract.actions, { start: false, stop: false, retry: false, status: true, permissions: true, help: true, activity: true });
    assert.equal(contract.permissions.granted, false);
    assert.equal(contract.status, "registered");
    assert.equal(stopToolLibraryEntry(name, "not-a-session", { user: { id: "contract-account" } }).status, "unsupported");
  } finally {
    unregisterTool(name);
    setAccountScope(null);
  }
});

test("lifecycle status reports bounded platform and dependency availability without invoking tools", () => {
  const capability = "test.tool_library.lifecycle_availability";
  const missingDependencyCapability = "test.tool_library.lifecycle_missing_dependency";
  const names = ["test.tool_library.lifecycle_availability_tool", "test.tool_library.lifecycle_missing_dependency_tool"];
  registerCapability({ id: capability, name: "Lifecycle availability capability", platformSupport: { web: CAPABILITY_STATUS.supported } });
  registerCapability({
    id: missingDependencyCapability,
    name: "Capability with missing lifecycle prerequisite",
    platformSupport: { web: CAPABILITY_STATUS.supported },
    dependencies: ["test.tool_library.lifecycle_prerequisite_not_registered"],
  });
  setAccountScope("lifecycle-availability-account");
  let executions = 0;
  try {
    for (const [name, declaredCapability] of [[names[0], capability], [names[1], missingDependencyCapability]]) {
      registerTool(name, async () => { executions += 1; return { success: true, verified: true }; }, {
        capabilities: [declaredCapability],
        permission: "filesystem.read",
      });
    }
    const user = { id: "lifecycle-availability-account" };
    const unsupported = getToolLifecycleContract(names[0], { user, platform: "ios" });
    assert.equal(unsupported.status, "registered", "execution lifecycle remains distinct from platform readiness");
    assert.equal(unsupported.readiness, "unavailable");
    assert.deepEqual(unsupported.availability, {
      platform: "ios",
      status: CAPABILITY_STATUS.unsupported,
      available: false,
      reason: "Platform support or a required runtime dependency is unavailable.",
      capabilities: [{ capability, status: CAPABILITY_STATUS.unsupported, available: false }],
    });

    const missingDependency = getToolLifecycleContract(names[1], { user, platform: "web" });
    assert.equal(missingDependency.availability.status, CAPABILITY_STATUS.unsupported);
    assert.equal(missingDependency.availability.available, false);
    assert.equal(missingDependency.availability.capabilities[0].available, false);
    assert.equal(missingDependency.readiness, "unavailable");

    const supported = getToolLifecycleContract(names[0], { user, platform: "web" });
    assert.equal(supported.availability.available, true);
    assert.equal(supported.readiness, "permission_required");
    seedPermissions([{ permission: "filesystem.read", status: "granted", scope: "account" }], user.id);
    assert.equal(getToolLifecycleContract(names[0], { user, platform: "web" }).readiness, "ready");
    assert.equal(executions, 0, "status inspection must not dispatch the registered handler");

    let getterCalls = 0;
    const hostileContext = { user };
    Object.defineProperty(hostileContext, "platform", { get() { getterCalls += 1; return "web"; } });
    const hostile = getToolLifecycleContract(names[0], hostileContext);
    assert.equal(hostile.status, "invalid_context");
    assert.equal(getterCalls, 0, "hostile context accessors must not run during status inspection");
    assert.equal(executions, 0);
  } finally {
    names.forEach(unregisterTool);
    clearPermissions();
    setAccountScope(null);
  }
});

test("lifecycle permission readiness requires every declared permission and keeps its public shape", () => {
  const capability = "test.tool_library.multiple_permission_readiness";
  const names = ["test.tool_library.multiple_permission_tool", "test.tool_library.no_permission_tool"];
  registerCapability({ id: capability, name: "Multi-permission readiness capability", platformSupport: { web: CAPABILITY_STATUS.supported } });
  setAccountScope("multiple-permission-account");
  try {
    registerTool(names[0], async () => ({ success: true }), {
      capabilities: [capability],
      permissions: ["filesystem.read", "browser.read"],
    });
    registerTool(names[1], async () => ({ success: true }), { capabilities: [capability] });
    const context = { user: { id: "multiple-permission-account" }, platform: "web" };

    const noneGranted = getToolLifecycleContract(names[0], context);
    assert.deepEqual(noneGranted.permissions, { required: "filesystem.read", granted: false });
    assert.equal(noneGranted.readiness, "permission_required");

    seedPermissions([{ permission: "filesystem.read", status: "granted", scope: "account" }], context.user.id);
    const oneGranted = getToolLifecycleContract(names[0], context);
    assert.deepEqual(oneGranted.permissions, { required: "filesystem.read", granted: false });
    assert.equal(oneGranted.readiness, "permission_required");

    seedPermissions([
      { permission: "filesystem.read", status: "granted", scope: "account" },
      { permission: "browser.read", status: "granted", scope: "account" },
    ], context.user.id);
    const allGranted = getToolLifecycleContract(names[0], context);
    assert.deepEqual(allGranted.permissions, { required: "filesystem.read", granted: true });
    assert.deepEqual(Object.keys(allGranted.permissions).sort(), ["granted", "required"]);
    assert.equal(allGranted.readiness, "ready");

    const noPermission = getToolLifecycleContract(names[1], context);
    assert.equal(noPermission.permissions, null);
    assert.equal(noPermission.readiness, "unavailable");
  } finally {
    names.forEach(unregisterTool);
    clearPermissions();
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
    const deniedActivity = getToolLifecycleContract(name, { user: { id: "revoked-lifecycle-account" } }).activity;
    assert.deepEqual(deniedActivity.map(({ status }) => status), ["denied"], "permission failures remain visible in account-scoped activity");
    const forged = startToolLibraryEntry(name, {}, { user: { id: "another-account", plan: "elite", entitlements: ["elite"] } });
    assert.equal(forged.status, "denied");
    assert.deepEqual(getToolLifecycleContract(name, { user: { id: "revoked-lifecycle-account" } }).activity.map(({ status }) => status), ["denied"], "a mismatched account cannot add lifecycle history");
    assert.equal(executions, 0);
  } finally {
    clearPermissions();
    unregisterTool(name);
    setAccountScope(null);
  }
});

test("unavailable runtime start is recorded as activity without invoking the tool", () => {
  const name = "test.tool_library.unavailable_lifecycle";
  const capability = "test.tool_library.unavailable_lifecycle_capability";
  registerCapability({ id: capability, name: "Web-only lifecycle capability", supportedPlatforms: ["web"], platformSupport: { web: CAPABILITY_STATUS.supported } });
  setAccountScope("unavailable-lifecycle-account");
  seedPermissions([{ permission: "filesystem.read", status: "granted", scope: "account" }], "unavailable-lifecycle-account");
  let executions = 0;
  try {
    registerTool(name, async () => { executions += 1; return { success: true }; }, {
      capabilities: [capability],
      permission: "filesystem.read",
      lifecycle: { start: true },
    });
    const context = { platform: "ios", user: { id: "unavailable-lifecycle-account" } };
    const result = startToolLibraryEntry(name, {}, context);
    assert.equal(result.success, false);
    assert.equal(result.status, CAPABILITY_STATUS.unsupported);
    assert.equal(executions, 0);
    const status = getToolLifecycleContract(name, context);
    assert.equal(status.status, "registered");
    assert.equal(status.availability.available, false);
    assert.deepEqual(status.activity.map(({ status: activityStatus }) => activityStatus), [CAPABILITY_STATUS.unsupported]);
  } finally {
    unregisterTool(name);
    clearPermissions();
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
    assert.deepEqual(completed.activity.map(({ status }) => status), ["cancelled", "stopping", "conflict", "running", "starting"]);
    assert.equal(stopToolLibraryEntry(name, started.sessionId, { user: { id: "lifecycle-owner", plan: "elite", entitlements: ["elite"] } }).success, false);
  } finally {
    unregisterTool(name);
    clearPermissions();
    setAccountScope(null);
  }
});

test("public lifecycle start enforces an account-scoped active session limit and recovers capacity", async () => {
  const capability = "test.tool_library.lifecycle_capacity_capability";
  const names = Array.from({ length: 17 }, (_, index) => `test.tool_library.lifecycle_capacity_${index}`);
  registerCapability({ id: capability, name: "Lifecycle capacity capability", platformSupport: { web: CAPABILITY_STATUS.supported } });
  setAccountScope("lifecycle-capacity-owner");
  seedPermissions([{ permission: "filesystem.write", status: "granted", scope: "account" }], "lifecycle-capacity-owner");
  const owner = { user: { id: "lifecycle-capacity-owner", plan: "elite", entitlements: ["elite"] } };
  try {
    for (const name of names) {
      registerTool(name, async (_input, { signal }) => {
        await new Promise((resolve) => {
          if (signal.aborted) resolve();
          else signal.addEventListener("abort", resolve, { once: true });
        });
        return { success: false, error: "cancelled" };
      }, {
        capabilities: [capability],
        permission: "filesystem.write",
        lifecycle: { start: true, stop: true },
      });
    }

    assert.equal(HEY.tools.start, startToolLibraryEntry);
    assert.equal(HEY.tools.start(names[0], {}, { user: { id: "attacker", plan: "elite", entitlements: ["elite"] } }).status, "denied");
    const starts = await Promise.all(names.map(async (name) => HEY.tools.start(name, {}, owner)));
    assert.equal(starts.filter(({ success }) => success).length, 16);
    assert.equal(starts[16].status, "capacity");
    assert.deepEqual(HEY.tools.lifecycleActivity(names[16], owner).activity.map(({ status }) => status), ["capacity"]);

    const stopped = HEY.tools.stop(names[0], starts[0].sessionId, owner);
    assert.equal(stopped.status, "stopping");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(HEY.tools.lifecycle(names[0], owner).status, "cancelled");
    const recovered = HEY.tools.start(names[16], {}, owner);
    assert.equal(recovered.success, true, "settling a run frees a slot for the account");
  } finally {
    for (const name of names) unregisterTool(name);
    clearPermissions();
    setAccountScope(null);
  }
});

test("unregister and account-scope cleanup retain capacity until noncooperative handlers settle", async () => {
  const capability = "test.tool_library.lifecycle_reservation_capability";
  const names = Array.from({ length: 17 }, (_, index) => `test.tool_library.lifecycle_reservation_${index}`);
  registerCapability({ id: capability, name: "Lifecycle reservation capability", platformSupport: { web: CAPABILITY_STATUS.supported } });
  setAccountScope("lifecycle-reservation-account-a");
  seedPermissions([{ permission: "filesystem.write", status: "granted", scope: "account" }], "lifecycle-reservation-account-a");
  const ownerA = { user: { id: "lifecycle-reservation-account-a", plan: "elite", entitlements: ["elite"] } };
  const ownerB = { user: { id: "lifecycle-reservation-account-b", plan: "elite", entitlements: ["elite"] } };
  let releaseHandlers;
  const handlersReleased = new Promise((resolve) => { releaseHandlers = resolve; });
  const enteredResolvers = [];
  const settledResolvers = [];
  const entered = names.map((_, index) => new Promise((resolve) => { enteredResolvers[index] = resolve; }));
  const settled = names.map((_, index) => new Promise((resolve) => { settledResolvers[index] = resolve; }));
  try {
    for (const [index, name] of names.entries()) {
      registerTool(name, async () => {
        enteredResolvers[index]();
        await handlersReleased;
        settledResolvers[index]();
        return { success: true };
      }, {
        capabilities: [capability],
        permission: "filesystem.write",
        lifecycle: { start: true },
      });
    }

    const startsA = await Promise.all(names.slice(0, 16).map(async (name) => HEY.tools.start(name, {}, ownerA)));
    assert.equal(startsA.filter(({ success }) => success).length, 16);
    await Promise.all(entered.slice(0, 16));

    for (const name of names.slice(0, 16)) assert.equal(unregisterTool(name), true);
    assert.equal(HEY.tools.start(names[16], {}, ownerA).status, "capacity", "unregistering a live noncooperative run does not release its reservation");

    setAccountScope("lifecycle-reservation-account-b");
    seedPermissions([{ permission: "filesystem.write", status: "granted", scope: "account" }], ownerB.user.id);
    const startB = HEY.tools.start(names[16], {}, ownerB);
    assert.equal(startB.success, true, "account A's reservations do not consume account B's quota");
    await entered[16];
    setAccountScope("lifecycle-reservation-account-a");
    assert.equal(HEY.tools.start(names[16], {}, ownerB).status, "denied", "a stale account identity cannot use account A's scope");
    seedPermissions([{ permission: "filesystem.write", status: "granted", scope: "account" }], ownerA.user.id);
    assert.equal(HEY.tools.start(names[16], {}, ownerA).status, "capacity", "switching back cannot reclaim unsettled account A reservations");

    releaseHandlers();
    await Promise.all(settled);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const recovered = HEY.tools.start(names[16], {}, ownerA);
    assert.equal(recovered.success, true, "settled handlers release their account reservations");
  } finally {
    releaseHandlers?.();
    for (const name of names) unregisterTool(name);
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

test("revoking a required account permission aborts its active lifecycle session", async () => {
  const name = "test.tool_library.lifecycle_permission_revoked";
  const capability = "test.tool_library.lifecycle_permission_revoked_capability";
  const accountId = "lifecycle-permission-revoked-owner";
  registerCapability({ id: capability, name: "Revocable lifecycle capability", platformSupport: { web: CAPABILITY_STATUS.supported } });
  setAccountScope(accountId);
  seedPermissions([{ permission: "filesystem.write", status: "granted", scope: "account" }], accountId);
  let entered;
  let release;
  let handlerSignal;
  const handlerEntered = new Promise((resolve) => { entered = resolve; });
  const releaseHandler = new Promise((resolve) => { release = resolve; });
  const owner = { user: { id: accountId, plan: "elite", entitlements: ["elite"] } };
  try {
    registerTool(name, async (_input, context) => {
      handlerSignal = context.signal;
      entered();
      await releaseHandler;
      return { success: true };
    }, {
      capabilities: [capability],
      permission: "filesystem.write",
      lifecycle: { start: true, stop: true },
    });
    const started = startToolLibraryEntry(name, {}, owner);
    assert.equal(started.status, "starting");
    await handlerEntered;
    assert.equal(handlerSignal.aborted, false);

    revokePermission("filesystem.write", "account");
    assert.equal(handlerSignal.aborted, true);
    assert.equal(getToolLifecycleContract(name, owner).status, "stopping");
    assert.equal(getToolLifecycleActivity(name, owner).activity[0].status, "stopping");

    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(getToolLifecycleContract(name, owner).status, "completed_after_stop");
  } finally {
    release?.();
    unregisterTool(name);
    clearPermissions();
    setAccountScope(null);
  }
});

test("lifecycle revocation notices are descriptor-safe and cannot override granted permission state", async () => {
  const name = "test.tool_library.lifecycle_forged_revoke";
  const capability = "test.tool_library.lifecycle_forged_revoke_capability";
  const accountId = "lifecycle-forged-revoke-owner";
  registerCapability({ id: capability, name: "Forged revocation capability", platformSupport: { web: CAPABILITY_STATUS.supported } });
  setAccountScope(accountId);
  seedPermissions([{ permission: "filesystem.write", status: "granted", scope: "account" }], accountId);
  let entered;
  let release;
  let handlerSignal;
  let getterCalls = 0;
  const handlerEntered = new Promise((resolve) => { entered = resolve; });
  const releaseHandler = new Promise((resolve) => { release = resolve; });
  const owner = { user: { id: accountId, plan: "elite", entitlements: ["elite"] } };
  try {
    registerTool(name, async (_input, context) => {
      handlerSignal = context.signal;
      entered();
      await releaseHandler;
      return { success: true };
    }, {
      capabilities: [capability],
      permission: "filesystem.write",
      lifecycle: { start: true, stop: true },
    });
    const started = startToolLibraryEntry(name, {}, owner);
    await handlerEntered;

    publish("permission.updated", {
      permission: "filesystem.write",
      scope: "account",
      status: "revoked",
    });
    const hostileNotice = {};
    for (const key of ["permission", "scope", "status"]) {
      Object.defineProperty(hostileNotice, key, { get() { getterCalls += 1; return key === "permission" ? "filesystem.write" : key === "scope" ? "account" : "revoked"; } });
    }
    publish("permission.updated", hostileNotice);
    assert.equal(getterCalls, 0);
    assert.equal(handlerSignal.aborted, false, "the authoritative grant, not an event payload, decides whether to abort");
    assert.equal(getToolLifecycleContract(name, owner).status, "running");

    assert.equal(stopToolLibraryEntry(name, started.sessionId, owner).status, "stopping");
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(getToolLifecycleContract(name, owner).status, "completed_after_stop");
  } finally {
    release?.();
    unregisterTool(name);
    clearPermissions();
    setAccountScope(null);
  }
});

test("unregister records an abort request and preserves account-scoped activity after removal", async () => {
  const name = "test.tool_library.lifecycle_unregistered_activity";
  const capability = "test.tool_library.lifecycle_unregistered_activity_capability";
  registerCapability({ id: capability, name: "Unregister activity capability", platformSupport: { web: CAPABILITY_STATUS.supported } });
  setAccountScope("lifecycle-unregister-owner");
  seedPermissions([{ permission: "filesystem.write", status: "granted", scope: "account" }], "lifecycle-unregister-owner");
  let entered;
  let release;
  const handlerEntered = new Promise((resolve) => { entered = resolve; });
  const releaseHandler = new Promise((resolve) => { release = resolve; });
  const owner = { user: { id: "lifecycle-unregister-owner", plan: "elite", entitlements: ["elite"] } };
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
    const started = startToolLibraryEntry(name, {}, owner);
    await handlerEntered;
    assert.equal(unregisterTool(name), true);
    assert.equal(getToolLifecycleContract(name, owner).status, "not_found");
    assert.equal(getToolLifecycleActivity(name, { user: { id: "attacker" } }).status, "denied");
    assert.equal(getToolLifecycleActivity(name, {}).status, "denied");
    const afterUnregister = getToolLifecycleActivity(name, owner);
    assert.equal(afterUnregister.success, true);
    assert.equal(HEY.tools.lifecycleActivity, getToolLifecycleActivity);
    assert.deepEqual(HEY.tools.lifecycleActivity(name, owner), afterUnregister);
    assert.equal(HEY.tools.lifecycleActivity(name, { user: { id: "attacker" } }).status, "denied");
    assert.ok(Object.isFrozen(afterUnregister.activity));
    assert.deepEqual(afterUnregister.activity.map(({ status }) => status), ["unregister_requested", "running", "starting"]);
    assert.equal(afterUnregister.activity[0].id, started.sessionId);

    // An ignored abort signal may let the handler finish, but the registry
    // keeps the accurate unregister request and does not claim it was stopped.
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const afterLateCompletion = getToolLifecycleActivity(name, owner);
    assert.deepEqual(afterLateCompletion.activity.map(({ status }) => status), ["unregister_requested", "running", "starting"]);
  } finally {
    unregisterTool(name);
    clearPermissions();
    setAccountScope(null);
  }
});

test("failed lifecycle runs can be retried only by the authorized account through current policy", async () => {
  const name = "test.tool_library.lifecycle_retry";
  const capability = "test.tool_library.lifecycle_retry_capability";
  registerCapability({ id: capability, name: "Retry capability", supportedPlatforms: ["web"], platformSupport: { web: CAPABILITY_STATUS.supported } });
  setAccountScope("lifecycle-retry-owner");
  seedPermissions([{ permission: "filesystem.write", status: "granted", scope: "account" }], "lifecycle-retry-owner");
  let attempts = 0;
  try {
    registerTool(name, async () => {
      attempts += 1;
      if (attempts === 1 || attempts === 3) throw new Error("temporary failure");
      return { success: true };
    }, {
      capabilities: [capability],
      permission: "filesystem.write",
      lifecycle: { start: true, retry: true },
    });
    const owner = { platform: "web", user: { id: "lifecycle-retry-owner", plan: "elite", entitlements: ["elite"] } };
    assert.equal(getToolLifecycleContract(name, owner).actions.retry, true);
    assert.equal(HEY.tools.retry, retryToolLibraryEntry, "the canonical public HEY API exposes lifecycle retry");
    assert.equal(retryToolLibraryEntry(name, {}, null, owner).status, "retry_unavailable", "retry cannot launch a tool without a failed run");

    const first = startToolLibraryEntry(name, {}, owner);
    assert.equal(first.success, true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(getToolLifecycleContract(name, owner).status, "failed");

    assert.equal(retryToolLibraryEntry(name, {}, first.sessionId, { ...owner, user: { ...owner.user, id: "attacker" } }).status, "denied");
    assert.equal(retryToolLibraryEntry(name, {}, first.sessionId, { ...owner, platform: "ios" }).status, CAPABILITY_STATUS.unsupported);
    clearPermissions();
    assert.equal(retryToolLibraryEntry(name, {}, first.sessionId, owner).status, "denied", "revoked canonical permission blocks retry");
    seedPermissions([{ permission: "filesystem.write", status: "granted", scope: "account" }], "lifecycle-retry-owner");

    const concurrent = [
      HEY.tools.retry(name, {}, first.sessionId, owner),
      retryToolLibraryEntry(name, {}, first.sessionId, owner),
    ];
    const recovered = concurrent.find(({ success }) => success);
    assert.equal(concurrent.filter(({ success }) => success).length, 1, "only one concurrent retry can consume a failed session");
    assert.equal(concurrent.find(({ status }) => status === "retry_stale")?.status, "retry_stale");
    assert.equal(recovered.success, true);
    assert.notEqual(recovered.sessionId, first.sessionId);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(attempts, 2);
    assert.equal(getToolLifecycleContract(name, owner).status, "completed");
    const recoveredActivity = getToolLifecycleContract(name, owner).activity.map(({ status }) => status);
    for (const status of ["completed", "running", "starting", "retry_stale", "denied", "unsupported", "failed", "retry_unavailable"]) {
      assert.ok(recoveredActivity.includes(status), `activity keeps the ${status} lifecycle outcome`);
    }

    const nextFailure = startToolLibraryEntry(name, {}, owner);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(getToolLifecycleContract(name, owner).status, "failed");
    setAccountScope("lifecycle-retry-other-account");
    assert.equal(retryToolLibraryEntry(name, {}, nextFailure.sessionId, owner).status, "denied", "switching accounts revokes access to the pending retry");
    setAccountScope("lifecycle-retry-owner");
    assert.equal(getToolLifecycleContract(name, owner).status, "registered", "switching away clears the old account session");
    assert.equal(retryToolLibraryEntry(name, {}, nextFailure.sessionId, owner).status, "retry_unavailable");
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
