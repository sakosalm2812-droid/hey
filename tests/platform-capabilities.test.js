import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPABILITY_STATUS,
  executeCapability,
  getCapabilityAvailability,
  getCapability,
  listCapabilities,
  registerCapability,
} from "../src/core/capabilityRegistry.js";
import { parseNaturalCommand } from "../src/core/commandParser.js";
import { createNativeAdapter } from "../src/core/osAdapter.js";
import { createTauriAdapter, isTauriRuntime } from "../src/lib/tauriAdapter.js";
import { getDevice, getDeviceCapabilities, executeOnDevice, registerDevice, registerDeviceAdapter, unregisterDeviceAdapter, unregisterDevice, revokeDevice } from "../src/core/deviceGateway.js";
import { VOICE_STATES, createVoiceState } from "../src/core/voiceState.js";
import { executeRequest } from "../src/core/executionController.js";
import { computerControlEngine, CONTROL_MODES, COMPUTER_CAPABILITIES } from "../src/core/computerControl.js";
import { computerControlEngine as legacyComputerControlEngine, CONTROL_MODES as LEGACY_CONTROL_MODES } from "../src/core/computerControlEngine.js";
import { createVoiceSession } from "../src/lib/voiceProviders.js";
import { understandImage, validateImageInput } from "../src/core/visionEngine.js";
import { setAccountScope } from "../src/core/accountScope.js";

const deviceTestStorage = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem(key) { return deviceTestStorage.get(key) ?? null; },
    setItem(key, value) { deviceTestStorage.set(key, String(value)); },
    removeItem(key) { deviceTestStorage.delete(key); },
  },
});

test("registered capabilities expose honest platform availability", () => {
  const capabilityId = "test.camera";
  registerCapability({
    id: capabilityId,
    name: "Test camera",
    platformSupport: {
      web: CAPABILITY_STATUS.permissionRequired,
      android: CAPABILITY_STATUS.supported,
      ios: CAPABILITY_STATUS.restricted,
    },
  });

  assert.deepEqual(getCapabilityAvailability(capabilityId, "web"), {
    capability: capabilityId,
    platform: "web",
    status: CAPABILITY_STATUS.permissionRequired,
    available: false,
    requiresPermission: true,
    restricted: false,
  });
  assert.equal(getCapabilityAvailability(capabilityId, "ios").status, CAPABILITY_STATUS.restricted);
  assert.equal(getCapabilityAvailability(capabilityId, "windows").status, CAPABILITY_STATUS.unsupported);
});

test("capability policy cannot be mutated through registration inputs or returned objects", () => {
  const capabilityId = "test.capability.snapshot";
  const platformSupport = { web: CAPABILITY_STATUS.restricted };
  const input = {
    id: capabilityId,
    name: "Snapshot protected capability",
    platforms: ["web"],
    platformSupport,
  };
  const registered = registerCapability(input);

  platformSupport.web = CAPABILITY_STATUS.supported;
  registered.platformSupport.web = CAPABILITY_STATUS.supported;
  registered.platforms.push("android");
  const fetched = getCapability(capabilityId);
  fetched.platformSupport.web = CAPABILITY_STATUS.supported;
  const listed = listCapabilities().find((capability) => capability.id === capabilityId);
  listed.platformSupport.web = CAPABILITY_STATUS.supported;

  assert.equal(getCapabilityAvailability(capabilityId, "web").status, CAPABILITY_STATUS.restricted);
  assert.equal(getCapabilityAvailability(capabilityId, "android").status, CAPABILITY_STATUS.unsupported);
  assert.throws(() => registerCapability({ id: capabilityId, name: "Replacement", platformSupport: { web: CAPABILITY_STATUS.supported } }), /already registered/i);
  assert.equal(getCapabilityAvailability(capabilityId, "web").status, CAPABILITY_STATUS.restricted);
});

test("an adapter can make only its declared capability executable", () => {
  const capabilityId = "test.mobile.files";
  registerCapability({ id: capabilityId, name: "Test mobile files", platforms: ["android"] });
  const adapter = createNativeAdapter("android", {
    capabilities: [capabilityId],
    [capabilityId]: () => ({ success: true, verified: true }),
  });

  const availability = getCapabilityAvailability(capabilityId, "android", adapter);
  assert.equal(availability.status, CAPABILITY_STATUS.supported);
  assert.equal(availability.available, true);
  assert.equal(getCapability(capabilityId).platforms.includes("android"), true);
});

test("an adapter cannot override explicit restriction or permission policy at availability or execution", async () => {
  const restrictedId = "test.camera.restricted";
  const permissionId = "test.camera.permission";
  let executions = 0;
  registerCapability({
    id: restrictedId,
    name: "Restricted camera",
    platforms: ["ios"],
    platformSupport: { ios: CAPABILITY_STATUS.restricted },
  });
  registerCapability({
    id: permissionId,
    name: "Permission gated camera",
    platforms: ["ios"],
    platformSupport: { ios: CAPABILITY_STATUS.permissionRequired },
  });
  const adapter = createNativeAdapter("ios", {
    capabilities: [restrictedId, permissionId],
    [restrictedId]: () => { executions += 1; return { success: true, verified: true }; },
    [permissionId]: () => { executions += 1; return { success: true, verified: true }; },
  });

  assert.equal(getCapabilityAvailability(restrictedId, "ios", adapter).status, CAPABILITY_STATUS.restricted);
  assert.equal(getCapabilityAvailability(permissionId, "ios", adapter).status, CAPABILITY_STATUS.permissionRequired);
  const restrictedResult = await executeCapability(restrictedId, {}, adapter);
  const permissionResult = await executeCapability(permissionId, {}, adapter);
  assert.equal(restrictedResult.success, false);
  assert.equal(restrictedResult.status, CAPABILITY_STATUS.restricted);
  assert.equal(permissionResult.success, false);
  assert.equal(permissionResult.status, CAPABILITY_STATUS.permissionRequired);
  assert.equal(executions, 0);
});

test("capability execution rejects an adapter platform or capability mismatch", async () => {
  const capabilityId = "test.android.camera";
  let executions = 0;
  registerCapability({
    id: capabilityId,
    name: "Android camera",
    platforms: ["android"],
    platformSupport: { android: CAPABILITY_STATUS.supported },
  });
  const wrongPlatform = createNativeAdapter("ios", {
    capabilities: [capabilityId],
    [capabilityId]: () => { executions += 1; return { success: true, verified: true }; },
  });
  const wrongCapability = createNativeAdapter("android", {
    capabilities: [],
    [capabilityId]: () => { executions += 1; return { success: true, verified: true }; },
  });

  assert.equal((await executeCapability(capabilityId, {}, wrongPlatform)).success, false);
  assert.equal((await executeCapability(capabilityId, {}, wrongCapability)).success, false);
  assert.equal(executions, 0);
});

test("unknown capabilities remain unsupported", () => {
  const result = getCapabilityAvailability("test.missing", "ios");
  assert.equal(result.status, CAPABILITY_STATUS.unsupported);
  assert.equal(result.available, false);
});

test("capability registration validates supported platforms and semantic versions while preserving legacy fields", () => {
  const legacy = registerCapability({ id: "test.metadata.legacy", name: "Legacy metadata", platforms: ["web"] });
  assert.deepEqual(legacy.platforms, ["web"]);
  assert.deepEqual(legacy.supportedPlatforms, ["web"]);
  assert.equal(legacy.version, "1.0.0");
  assert.deepEqual(legacy.dependencies, []);
  assert.deepEqual(legacy.runtimeRequirements, { features: [] });
  assert.equal(getCapabilityAvailability(legacy.id, "ios").status, CAPABILITY_STATUS.unsupported);

  assert.throws(() => registerCapability({ id: "test.metadata.bad_platform", name: "Bad platform", supportedPlatforms: ["web", "unknown"] }), /platforms/i);
  assert.throws(() => registerCapability({ id: "test.metadata.platform_mismatch", name: "Platform mismatch", platforms: ["web"], supportedPlatforms: ["ios"] }), /must match/i);
  assert.throws(() => registerCapability({ id: "test.metadata.bad_version", name: "Bad version", version: "latest" }), /semantic version/i);
  assert.throws(() => registerCapability({ id: "test.metadata.null_version", name: "Null version", version: null }), /semantic version/i);

  let getterReads = 0;
  const hostile = { id: "test.metadata.accessor", name: "Accessor metadata" };
  Object.defineProperty(hostile, "version", { enumerable: true, get() { getterReads += 1; return "1.0.0"; } });
  assert.throws(() => registerCapability(hostile), /accessors/i);
  assert.equal(getterReads, 0);
  const cyclic = { id: "test.metadata.cycle", name: "Cyclic metadata" };
  cyclic.runtimeRequirements = { nested: cyclic };
  assert.throws(() => registerCapability(cyclic), /cycles/i);
  assert.equal(getCapability("test.metadata.accessor"), null);
  assert.equal(getCapability("test.metadata.cycle"), null);
});

test("capability dependencies fail closed when missing or cyclic and are enforced by discovery", () => {
  const missingParent = "test.dependencies.missing_parent";
  const missingDependency = "test.dependencies.missing_leaf";
  registerCapability({
    id: missingParent,
    name: "Missing dependency parent",
    supportedPlatforms: ["web"],
    platformSupport: { web: CAPABILITY_STATUS.supported },
    dependencies: [missingDependency],
  });
  const missing = getCapabilityAvailability(missingParent, "web");
  assert.equal(missing.status, CAPABILITY_STATUS.unsupported);
  assert.match(missing.error, /missing dependency/);

  registerCapability({
    id: missingDependency,
    name: "Dependency leaf",
    supportedPlatforms: ["web"],
    platformSupport: { web: CAPABILITY_STATUS.supported },
  });
  assert.equal(getCapabilityAvailability(missingParent, "web").status, CAPABILITY_STATUS.supported);

  const cycleA = "test.dependencies.cycle_a";
  const cycleB = "test.dependencies.cycle_b";
  registerCapability({ id: cycleA, name: "Cycle A", dependencies: [cycleB] });
  assert.throws(() => registerCapability({ id: cycleB, name: "Cycle B", dependencies: [cycleA] }), /cannot contain cycles/i);
  assert.equal(getCapability(cycleB), null);
  assert.throws(() => registerCapability({ id: "test.dependencies.self", name: "Self dependency", dependencies: ["test.dependencies.self"] }), /itself/i);
  assert.throws(() => registerCapability({ id: "test.dependencies.duplicate", name: "Duplicate dependencies", dependencies: ["test.dependencies.one", "test.dependencies.one"] }), /duplicates/i);

  let previous = null;
  for (let index = 0; index <= 33; index += 1) {
    const id = `test.dependencies.depth_${index}`;
    const input = { id, name: `Dependency depth ${index}`, dependencies: previous ? [previous] : [] };
    if (index === 33) assert.throws(() => registerCapability(input), /exceeds the supported depth/i);
    else registerCapability(input);
    previous = id;
  }
});

test("runtime version and feature requirements are checked before capability execution", async () => {
  const capabilityId = "test.runtime.requirement";
  let executions = 0;
  registerCapability({
    id: capabilityId,
    name: "Runtime constrained capability",
    version: "2.4.0-rc.1+metadata.3",
    supportedPlatforms: ["web"],
    platformSupport: { web: CAPABILITY_STATUS.supported },
    runtimeRequirements: { minVersion: "1.2.3", features: ["runtime.feature"] },
  });
  const adapter = {
    platform: "web",
    capabilities: [capabilityId],
    runtimeVersion: "1.2.3-rc.1",
    runtimeFeatures: ["runtime.feature"],
    execute() { executions += 1; return { success: true }; },
  };
  assert.equal(getCapability(capabilityId).version, "2.4.0-rc.1+metadata.3");
  assert.equal(getCapabilityAvailability(capabilityId, "web", adapter).status, CAPABILITY_STATUS.unsupported);
  assert.match(getCapabilityAvailability(capabilityId, "web", adapter).error, /requires runtime/);
  assert.equal((await executeCapability(capabilityId, {}, adapter)).success, false);
  assert.equal(executions, 0);

  adapter.runtimeVersion = "1.2.3";
  assert.equal(getCapabilityAvailability(capabilityId, "web", adapter).status, CAPABILITY_STATUS.supported);
  assert.equal((await executeCapability(capabilityId, {}, adapter)).success, true);
  adapter.runtimeFeatures = [];
  assert.equal(getCapabilityAvailability(capabilityId, "web", adapter).status, CAPABILITY_STATUS.unsupported);
  assert.match(getCapabilityAvailability(capabilityId, "web", adapter).error, /runtime feature/);
  assert.equal(executions, 1);

  let getterReads = 0;
  const hostileAdapter = { platform: "web", capabilities: [capabilityId], execute() { executions += 1; } };
  Object.defineProperty(hostileAdapter, "runtimeVersion", { get() { getterReads += 1; return "9.0.0"; } });
  assert.equal(getCapabilityAvailability(capabilityId, "web", hostileAdapter).status, CAPABILITY_STATUS.unsupported);
  assert.equal(getterReads, 0);

  assert.throws(() => registerCapability({
    id: "test.runtime.bad_requirement",
    name: "Bad runtime requirement",
    runtimeRequirements: { minVersion: "stable" },
  }), /semantic version/i);
  assert.throws(() => registerCapability({
    id: "test.runtime.unknown_requirement",
    name: "Unknown runtime requirement",
    runtimeRequirements: { minVersion: "1.0.0", vendorRuntime: true },
  }), /unsupported field/i);
  assert.throws(() => registerCapability({
    id: "test.runtime.null_features",
    name: "Null runtime features",
    runtimeRequirements: { features: null },
  }), /bounded plain array/i);
});

test("Tauri bridge stays inactive in a normal web runtime", () => {
  assert.equal(isTauriRuntime(), false);
  assert.equal(createTauriAdapter(), null);
});

test("device registry exposes capabilities without allowing fake remote execution", async () => {
  const deviceId = "remote-test-device";
  registerDevice({
    id: deviceId,
    name: "Test phone",
    platform: "android",
    deviceType: "phone",
    capabilities: ["computer.camera"],
    status: "online",
    trusted: true,
  });

  assert.equal(getDevice(deviceId).deviceType, "phone");
  assert.deepEqual(getDeviceCapabilities(deviceId), ["computer.camera"]);
  const result = await executeOnDevice(deviceId, "computer.camera");
  assert.equal(result.status, "permission_denied");
  assert.equal(result.verified, false);
});

test("device execution requires an explicit device and matching adapter capability grant", async () => {
  setAccountScope("edge-account");
  const action = "test.edge.read";
  const executions = [];
  const declaredCapabilities = [action];
  registerDeviceAdapter("android", {
    platform: "android",
    capabilities: declaredCapabilities,
    execute: async (request) => { executions.push(request); return { success: true, verified: true, value: "ok" }; },
  });
  declaredCapabilities.push("test.edge.other");
  const account = { id: "edge-account" };
  registerDevice({ id: "edge-empty-grant", platform: "android", status: "online", trusted: true, transport: "local", capabilities: [] }, { user: account });
  registerDevice({ id: "edge-adapter-denied", platform: "android", status: "online", trusted: true, transport: "local", capabilities: ["test.edge.other"] }, { user: account });
  registerDevice({ id: "edge-approved", platform: "android", status: "online", trusted: true, transport: "local", capabilities: [action], metadata: { label: "original" } }, { user: account });

  const noDeviceGrant = await executeOnDevice("edge-empty-grant", action, {}, { user: { id: "edge-account" } });
  const noAdapterGrant = await executeOnDevice("edge-adapter-denied", "test.edge.other", {}, { user: { id: "edge-account" } });
  assert.equal(noDeviceGrant.status, "unsupported");
  assert.equal(noAdapterGrant.status, "unsupported");
  assert.equal(executions.length, 0);

  const leaked = getDevice("edge-approved");
  leaked.trusted = false;
  leaked.capabilities.push("test.edge.admin");
  leaked.metadata.label = "tampered";
  const registered = registerDevice({ id: "edge-copied-input", platform: "android", capabilities: [action], metadata: { label: "caller" } });
  registered.capabilities.push("test.edge.admin");
  registered.metadata.label = "tampered";
  assert.deepEqual(getDeviceCapabilities("edge-approved"), [action]);
  assert.equal(getDevice("edge-approved").metadata.label, "original");
  assert.deepEqual(getDeviceCapabilities("edge-copied-input"), [action]);

  const allowed = await executeOnDevice("edge-approved", action, { value: "input" }, {
    permission: "device.control",
    riskLevel: "low",
    confirmed: true,
    user: { id: "edge-account", plan: "pro", permissions: ["device.control"] },
  });
  assert.equal(allowed.success, true);
  assert.equal(allowed.verified, true);
  assert.equal(allowed.value, "ok");
  assert.equal(executions.length, 1);
  assert.equal(executions[0].device.metadata.label, "original");
  unregisterDeviceAdapter("android");
  for (const id of ["edge-empty-grant", "edge-adapter-denied", "edge-approved"]) unregisterDevice(id, { id: "edge-account" });
  unregisterDevice("edge-copied-input");
});

test("device execution rejects platform mismatches and adapters without verified postconditions", async () => {
  setAccountScope("edge-account");
  let executions = 0;
  registerDeviceAdapter("ios", {
    platform: "ios",
    capabilities: ["test.edge.unverified"],
    execute: async () => { executions += 1; return { success: true, verified: false }; },
  });
  const user = { id: "edge-account", plan: "pro", permissions: ["device.control"] };
  registerDevice({ id: "edge-platform-mismatch", platform: "android", status: "online", trusted: true, transport: "local", capabilities: ["test.edge.unverified"] }, { user });
  registerDevice({ id: "edge-unverified", platform: "ios", status: "online", trusted: true, transport: "local", capabilities: ["test.edge.unverified"] }, { user });

  const mismatch = await executeOnDevice("edge-platform-mismatch", "test.edge.unverified", {}, { permission: "device.control", riskLevel: "low", confirmed: true, user });
  const unverified = await executeOnDevice("edge-unverified", "test.edge.unverified", {}, { permission: "device.control", riskLevel: "low", confirmed: true, user });
  assert.equal(mismatch.status, "unsupported");
  assert.equal(unverified.status, "verification_failed");
  assert.equal(unverified.success, false);
  assert.equal(unverified.verified, false);
  assert.equal(executions, 1);
  unregisterDeviceAdapter("ios");
  unregisterDevice("edge-platform-mismatch", user);
  unregisterDevice("edge-unverified", user);
});

test("device gateway rejects accessor-backed input before evaluating getters", async () => {
  setAccountScope("edge-account");
  let getterCalls = 0;
  registerDeviceAdapter("linux", {
    platform: "linux",
    capabilities: ["test.edge.input"],
    execute: async () => ({ success: true, verified: true }),
  });
  registerDevice({ id: "edge-input-guard", platform: "linux", status: "online", trusted: true, transport: "local", capabilities: ["test.edge.input"] }, { user: { id: "edge-account" } });
  const input = Object.defineProperty({}, "command", { enumerable: true, get() { getterCalls += 1; return "unauthorized"; } });

  assert.throws(() => registerDevice({ id: "edge-metadata-guard", platform: "linux", metadata: input }), /accessors/i);
  const result = await executeOnDevice("edge-input-guard", "test.edge.input", input, {
    permission: "device.control",
    riskLevel: "low",
    confirmed: true,
    user: { id: "edge-account", plan: "pro", permissions: ["device.control"] },
  });
  assert.equal(result.status, "invalid_input");
  assert.equal(getterCalls, 0);
  unregisterDeviceAdapter("linux");
  unregisterDevice("edge-input-guard", { id: "edge-account" });
});

test("device execution and revocation are bound to the registering account", async () => {
  setAccountScope("edge-owner");
  const action = "test.edge.account-bound";
  let executions = 0;
  const owner = { id: "edge-owner", plan: "pro", permissions: ["device.control"] };
  registerDeviceAdapter("windows", {
    platform: "windows",
    capabilities: [action],
    execute: async () => { executions += 1; return { success: true, verified: true }; },
  });
  registerDevice({ id: "edge-owned-device", accountId: "forged-account", platform: "windows", status: "online", trusted: true, transport: "local", capabilities: [action] }, { user: owner });
  assert.equal(getDevice("edge-owned-device").accountId, owner.id);
  assert.throws(() => registerDevice({ id: "edge-owned-device", platform: "windows", capabilities: [action] }, { user: { id: "other-account" } }), /already registered/i);

  const crossAccount = await executeOnDevice("edge-owned-device", action, {}, {
    permission: "device.control",
    riskLevel: "low",
    confirmed: true,
    user: { id: "other-account", plan: "pro", permissions: ["device.control"] },
  });
  assert.equal(crossAccount.status, "permission_denied");
  assert.equal(revokeDevice("edge-owned-device", { id: "other-account" }).success, false);
  assert.equal(unregisterDevice("edge-owned-device", { id: "other-account" }), false);
  assert.equal(getDevice("edge-owned-device").status, "online");
  assert.equal(executions, 0);

  const revoked = revokeDevice("edge-owned-device", owner);
  assert.equal(revoked.success, true);
  assert.equal(revoked.status, "revoked");
  assert.equal(revoked.device.trusted, false);
  const afterRevoke = await executeOnDevice("edge-owned-device", action, {}, { user: owner });
  assert.equal(afterRevoke.status, "unavailable");
  assert.equal(executions, 0);

  unregisterDeviceAdapter("windows");
  unregisterDevice("edge-owned-device", owner);
});

test("voice state rejects impossible transitions and preserves real states", () => {
  const voice = createVoiceState();
  assert.equal(voice.transition(VOICE_STATES.speaking).success, false);
  assert.equal(voice.state, VOICE_STATES.idle);
  assert.equal(voice.transition(VOICE_STATES.listening).success, true);
  assert.equal(voice.transition(VOICE_STATES.processing).state, VOICE_STATES.processing);
  assert.equal(voice.transition(VOICE_STATES.speaking).state, VOICE_STATES.speaking);
  assert.equal(voice.transition(VOICE_STATES.interrupted).state, VOICE_STATES.interrupted);
});

test("execution controller never lets a tool self-report authorize computer actions", async () => {
  let calls = 0;
  const result = await executeRequest(
    { input: "open https://example.com" },
    { executeTool: async () => { calls += 1; return { success: true, result: { verified: true, url: "https://example.com" } }; } },
  );
  assert.equal(result.status, "action_authority_unavailable");
  assert.equal(result.verified, false);
  assert.equal(calls, 0);
});

test("natural computer commands stop before dispatch when the trusted action lifecycle is unavailable", async () => {
  const result = await executeRequest({ input: "Open Chrome." });
  assert.equal(result.handled, true);
  assert.equal(result.status, "action_authority_unavailable");
  assert.equal(result.result.requiresConfirmation, false);
});

test("chat computer execution fails closed without the trusted action lifecycle even after replayed confirmation", async () => {
  let calls = 0;
  const result = await executeRequest(
    { input: "open https://example.com" },
    { confirmed: true, executeTool: async () => { calls += 1; return { success: true, result: { verified: true } }; } },
  );

  assert.equal(result.handled, true);
  assert.equal(result.status, "action_authority_unavailable");
  assert.equal(result.result.code, "ACTION_AUTHORITY_UNAVAILABLE");
  assert.match(result.result.message, /trusted mandate and independent verification adapter/i);
  assert.equal(calls, 0);
});

test("legacy Act mode cannot turn its mode flag into authority or bypass the Trust Kernel lifecycle", async () => {
  let calls = 0;
  const adapterName = "voiceos-act-mode-attack";
  computerControlEngine.registerAdapter(adapterName, {
    capabilities: [COMPUTER_CAPABILITIES.OPEN_APP],
    execute: async () => { calls += 1; return { success: true, verified: true }; },
  });

  try {
    const guide = await computerControlEngine.executeComputerCapability({
      capability: COMPUTER_CAPABILITIES.OPEN_APP,
      target: "Calculator",
      mode: CONTROL_MODES.GUIDE,
    });
    const direct = await computerControlEngine.executeComputerCapability({
      capability: COMPUTER_CAPABILITIES.OPEN_APP,
      target: "Calculator",
      mode: CONTROL_MODES.ACT,
    });
    const assist = await computerControlEngine.executeComputerCapability({
      capability: COMPUTER_CAPABILITIES.OPEN_APP,
      target: "Calculator",
      mode: CONTROL_MODES.ASSIST,
    });
    const legacy = await legacyComputerControlEngine.execute(
      "computer.app.open",
      { target: "Calculator" },
      { mode: LEGACY_CONTROL_MODES.ACT },
    );
    const legacyAssist = await legacyComputerControlEngine.execute(
      "computer.app.open",
      { target: "Calculator" },
      { mode: LEGACY_CONTROL_MODES.ASSIST, confirmed: true },
    );

    assert.equal(guide.status, "guide_only");
    assert.equal(guide.code, "NO_ACTION_IN_GUIDE_MODE");
    assert.equal(direct.status, "action_authority_unavailable");
    assert.equal(direct.code, "ACTION_AUTHORITY_UNAVAILABLE");
    assert.equal(assist.status, "preview_required");
    assert.equal(assist.requiresConfirmation, true);
    assert.equal(assist.preview.target, "Calculator");
    assert.equal(legacy.status, "action_authority_unavailable");
    assert.equal(legacy.code, "ACTION_AUTHORITY_UNAVAILABLE");
    assert.equal(legacyAssist.status, "preview_required");
    assert.equal(legacyAssist.requiresConfirmation, true);
    assert.equal(calls, 0);
  } finally {
    computerControlEngine.unregisterAdapter(adapterName);
  }
});

test("Chrome and YouTube request becomes an executable workflow", () => {
  const command = parseNaturalCommand("Open Chrome and go to YouTube.");
  assert.equal(command.kind, "workflow");
  assert.deepEqual(command.steps.map((step) => [step.kind, step.operation, step.target]), [
    ["computer", "open", "Chrome"],
    ["computer", "navigate_browser", "YouTube"],
  ]);
});

test("Chrome navigation cannot dispatch through direct tool injection", async () => {
  const calls = [];
  const result = await executeRequest(
    { input: "Open Chrome and go to YouTube." },
    {
      confirmed: true,
      executeTool: async (name, input) => {
        calls.push([name, input]);
        return { success: true, result: { verified: true } };
      },
    },
  );
  assert.equal(result.status, "action_authority_unavailable");
  assert.equal(calls.length, 0);
});

test("workflow execution stops before its first computer step without the trusted lifecycle", async () => {
  let calls = 0;
  const result = await executeRequest(
    { input: "open https://example.com, open https://example.org" },
    {
      executeTool: async () => {
        calls += 1;
        return { success: false, error: "blocked", retryable: false };
      },
    },
  );
  assert.equal(result.status, "action_authority_unavailable");
  assert.equal(result.results.length, 1);
  assert.equal(calls, 0);
});

test("voice session reports unavailable and permission states honestly", async () => {
  const unavailable = createVoiceSession({ environment: { navigator: { onLine: true } } });
  const unavailableResult = await unavailable.start();
  assert.equal(unavailableResult.success, false);
  assert.equal(unavailableResult.status, VOICE_STATES.error);

  const offline = createVoiceSession({ speechProvider: {}, environment: { navigator: { onLine: false } } });
  const offlineResult = await offline.start();
  assert.equal(offlineResult.success, false);
  assert.equal(offlineResult.status, VOICE_STATES.offline);

  const denied = createVoiceSession({
    speechProvider: {},
    environment: {
      navigator: { onLine: true, mediaDevices: { getUserMedia: async () => { throw new Error("denied"); } } },
    },
  });
  const deniedResult = await denied.start();
  assert.equal(deniedResult.success, false);
  assert.equal(deniedResult.status, VOICE_STATES.permissionRequired);
});

test("voice transcript uses HEY execution and real TTS provider contracts", async () => {
  let callbacks;
  let spoken = "";
  const updates = [];
  const session = createVoiceSession({
    speechProvider: {
      start(nextCallbacks) { callbacks = nextCallbacks; return { stop() {} }; },
      stop() {},
    },
    synthesisProvider: {
      speak(text) { spoken = text; return Promise.resolve({ success: true, verified: true }); },
      cancel() {},
    },
    ask: async (text) => `Handled: ${text}`,
    environment: { navigator: { onLine: true, mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } } },
    onStateChange: (update) => updates.push(update),
  });
  assert.equal((await session.start()).success, true);
  await callbacks.onTranscript("HEY, open Chrome");
  assert.equal(spoken, "Handled: open Chrome");
  assert.equal(session.snapshot().state, VOICE_STATES.idle);
  assert.equal(updates.some((update) => update.state === VOICE_STATES.processing), true);
});

test("vision rejects invalid input and missing providers without inventing observations", async () => {
  assert.equal(validateImageInput(null).valid, false);
  const result = await understandImage({ image: { data: "data:image/png;base64,abc", mimeType: "image/png" } });
  assert.equal(result.status, "unavailable");
  assert.equal(result.code, "VISION_PROVIDER_UNAVAILABLE");
  assert.equal(result.verified, false);
});

test("vision accepts only structured verified provider observations", async () => {
  const invalid = await understandImage({ image: { data: "encoded" }, provider: { analyze: async () => ({ observation: {} }) } });
  assert.equal(invalid.code, "UNVERIFIED_VISION_RESULT");
  const valid = await understandImage({ image: { data: "encoded" }, provider: { id: "test-vision", analyze: async () => ({ verified: true, observation: { text: ["Settings"] } }) } });
  assert.equal(valid.success, true);
  assert.equal(valid.observation.verified, true);
});

import { normalizePlan, getPlanFromEntitlements } from "../src/lib/accountRecords.js";
import { getPermissionPolicy, isPermissionAllowed } from "../src/lib/permissionPolicy.js";
import { authorizeExecution } from "../src/core/permissionManager.js";
import { listAuditEntries, clearAuditEntries } from "../src/core/auditLog.js";
import { getTool, listTools, registerTool, unregisterTool, executeTool } from "../src/core/toolRegistry.js";

test("account tier resolves from explicit plan and entitlements", () => {
  assert.equal(normalizePlan("Pro"), "pro");
  assert.equal(normalizePlan("elite"), "elite");
  assert.equal(normalizePlan("unknown"), "free");
  assert.equal(getPlanFromEntitlements([]), "free");
  assert.equal(getPlanFromEntitlements(["pro"]), "pro");
  assert.equal(getPlanFromEntitlements(["pro", "elite"]), "elite");
});

test("permission policy enforces account tier boundaries", () => {
  const freePolicy = getPermissionPolicy("free");
  const proPolicy = getPermissionPolicy("pro");
  const elitePolicy = getPermissionPolicy("elite");

  assert.equal(freePolicy.allowed.includes("web.search"), true);
  assert.equal(freePolicy.allowed.includes("device.control"), false);
  assert.equal(isPermissionAllowed({ plan: "free", permission: "device.control" }), false);
  assert.equal(isPermissionAllowed({ plan: "pro", permission: "device.control", granted: true }), true);
  assert.equal(isPermissionAllowed({ plan: "elite", permission: "terminal.execute", granted: true }), true);
  assert.equal(isPermissionAllowed({ plan: "pro", permission: "terminal.execute", granted: true }), false);
  assert.equal(proPolicy.allowed.includes("device.control"), true);
  assert.equal(elitePolicy.allowed.includes("terminal.execute"), true);
});

test("execution-time authorization enforces user identity, plan, permission, consent, and forged-client defenses", () => {
  clearAuditEntries();

  const allowed = authorizeExecution({
    user: { id: "user-1", role: "user", plan: "pro", entitlements: ["pro"], permissions: ["browser.open_url"] },
    capability: "browser.open_url",
    permission: "browser.open_url",
    riskLevel: "medium",
    confirmed: true,
  });

  assert.equal(allowed.authorized, true);
  assert.equal(allowed.decision, "allowed");
  assert.equal(allowed.plan, "pro");

  const denied = authorizeExecution({
    user: { id: "user-1", role: "user", plan: "free", entitlements: [], permissions: [] },
    capability: "terminal.execute",
    permission: "terminal.execute",
    riskLevel: "critical",
    confirmed: false,
  });

  assert.equal(denied.authorized, false);
  assert.equal(denied.requiresConfirmation, true);
  assert.equal(denied.decision, "confirmation_required");
  assert.match(denied.reason, /plan|permission|risk/i);

  const insufficientPlan = authorizeExecution({
    user: { id: "user-2", role: "user", plan: "pro", entitlements: ["pro"], permissions: ["device.control"] },
    capability: "terminal.execute",
    permission: "terminal.execute",
    riskLevel: "critical",
    confirmed: true,
  });

  assert.equal(insufficientPlan.authorized, false);
  assert.equal(insufficientPlan.decision, "denied");

  const missingPermission = authorizeExecution({
    user: { id: "user-3", role: "user", plan: "elite", entitlements: ["elite"], permissions: [] },
    capability: "filesystem.write",
    permission: "filesystem.write",
    riskLevel: "high",
    confirmed: true,
  });

  assert.equal(missingPermission.authorized, false);
  assert.equal(missingPermission.reason.includes("permission"), true);

  const forged = authorizeExecution({
    user: { id: "user-4", role: "user", plan: "free", entitlements: [], permissions: ["browser.navigate"] },
    capability: "browser.navigate",
    permission: "browser.navigate",
    riskLevel: "medium",
    clientPlan: "elite",
    clientEntitlements: ["elite"],
    confirmed: true,
  });

  assert.equal(forged.authorized, false);
  assert.equal(forged.plan, "free");
  assert.equal(forged.ignoredClientOverrides, true);

  const founder = authorizeExecution({
    user: { id: "founder-1", role: "founder", plan: "free", entitlements: [], permissions: ["system.info"] },
    capability: "terminal.execute",
    permission: "terminal.execute",
    riskLevel: "critical",
    confirmed: true,
  });

  assert.equal(founder.authorized, false);
  assert.equal(/security|restricted/i.test(founder.reason), true);

  const auditEntries = listAuditEntries(10);
  assert.equal(auditEntries.some((entry) => entry.action === "authorization.decision"), true);
});

test("agent-triggered execution is authorized at the execution boundary", async () => {
  const { registerTool, executeTool } = await import("../src/core/toolRegistry.js");

  registerTool("agent.permissioned_tool", async () => ({ success: true, verified: true, url: "https://example.com" }), {
    capabilities: ["browser.open_url"],
    permission: "browser.open_url",
    riskLevel: "medium",
    source: "agent_execution_test",
  });

  const result = await executeTool("agent.permissioned_tool", { url: "https://example.com" }, {
    user: { id: "agent-user", role: "user", plan: "pro", entitlements: ["pro"], permissions: ["browser.open_url"] },
    confirmed: true,
    requestId: "agent-auth-1",
  });

  assert.equal(result.success, true);
  assert.equal(result.authorization.authorized, true);
  assert.equal(result.authorization.decision, "allowed");
});

test("tool registry descriptors cannot expose or rewrite live execution policy", async () => {
  const name = "test.registry.immutable_policy";
  const suppliedMetadata = {
    capabilities: ["browser.open_url"],
    permission: "browser.open_url",
    permissions: ["browser.open_url"],
    riskLevel: "medium",
    requiresConfirmation: true,
  };
  let executions = 0;
  try {
    const registered = registerTool(name, async () => {
      executions += 1;
      return { success: true, verified: true };
    }, suppliedMetadata);

    suppliedMetadata.permission = null;
    suppliedMetadata.capabilities.length = 0;
    const lookup = getTool(name);
    const listed = listTools().find((tool) => tool.name === name);

    assert.equal(Object.hasOwn(registered, "handler"), false);
    assert.equal(Object.hasOwn(lookup, "handler"), false);
    assert.equal(lookup.metadata.permission, "browser.open_url");
    assert.deepEqual(lookup.metadata.capabilities, ["browser.open_url"]);
    assert.equal(listed.metadata.requiresConfirmation, true);
    assert.equal(Object.isFrozen(lookup.metadata), true);
    assert.equal(Object.isFrozen(lookup.metadata.capabilities), true);
    assert.throws(() => { lookup.metadata.permission = null; }, TypeError);
    assert.throws(() => { lookup.metadata.capabilities.push("terminal.execute"); }, TypeError);

    const denied = await executeTool(name, { url: "https://example.com" }, {
      user: { id: "registry-user", role: "user", plan: "pro", entitlements: ["pro"], permissions: [] },
      confirmed: true,
    });
    assert.equal(denied.success, false);
    assert.equal(denied.authorization.authorized, false);
    assert.equal(executions, 0);
  } finally {
    unregisterTool(name);
  }
});

test("tool registry rejects cyclic, accessor, and mutable-container policy metadata", async () => {
  const { registerTool, unregisterTool } = await import("../src/core/toolRegistry.js");
  const cyclic = {};
  cyclic.self = cyclic;
  const accessor = Object.defineProperty({}, "permission", {
    enumerable: true,
    get() { throw new Error("metadata getter executed"); },
  });

  assert.throws(() => registerTool("test.registry.cyclic", async () => ({}), cyclic), /cycles/);
  assert.throws(() => registerTool("test.registry.accessor", async () => ({}), accessor), /accessors/);
  assert.throws(() => registerTool("test.registry.map", async () => ({}), { policy: new Map() }), /plain objects and arrays/);
  assert.equal(unregisterTool("test.registry.cyclic"), false);
  assert.equal(unregisterTool("test.registry.accessor"), false);
  assert.equal(unregisterTool("test.registry.map"), false);
});
