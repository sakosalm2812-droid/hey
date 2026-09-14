import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPABILITY_STATUS,
  getCapabilityAvailability,
  getCapability,
  registerCapability,
} from "../src/core/capabilityRegistry.js";
import { parseNaturalCommand } from "../src/core/commandParser.js";
import { createNativeAdapter } from "../src/core/osAdapter.js";
import { createTauriAdapter, isTauriRuntime } from "../src/lib/tauriAdapter.js";
import { getDevice, getDeviceCapabilities, executeOnDevice, registerDevice } from "../src/core/deviceGateway.js";
import { VOICE_STATES, createVoiceState } from "../src/core/voiceState.js";
import { executeRequest } from "../src/core/executionController.js";
import { subscribe, clearEventListeners } from "../src/core/eventBus.js";
import { createVoiceSession } from "../src/lib/voiceProviders.js";
import { understandImage, validateImageInput } from "../src/core/visionEngine.js";

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

test("unknown capabilities remain unsupported", () => {
  const result = getCapabilityAvailability("test.missing", "ios");
  assert.equal(result.status, CAPABILITY_STATUS.unsupported);
  assert.equal(result.available, false);
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
  assert.equal(result.status, "unavailable");
  assert.equal(result.verified, false);
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

test("execution controller accepts only verified tool results", async () => {
  const events = [];
  const unsubscribe = subscribe("execution.request.completed", (event) => events.push(event));
  const success = await executeRequest(
    { input: "open https://example.com" },
    { executeTool: async () => ({ success: true, result: { verified: true, url: "https://example.com" } }) },
  );
  assert.equal(success.success, true);
  assert.equal(success.verified, true);
  assert.equal(success.memory.type, "pattern");
  assert.equal(events.length, 1);
  unsubscribe();

  const unverified = await executeRequest(
    { input: "open https://example.com" },
    { executeTool: async () => ({ success: true, result: { verified: false } }) },
  );
  assert.equal(unverified.status, "verification_failed");
  assert.equal(unverified.verified, false);
  clearEventListeners("execution.request.completed");
});

test("natural commands reach permission gates instead of self-approving", async () => {
  const result = await executeRequest({ input: "Open Chrome." });
  assert.equal(result.handled, true);
  assert.equal(result.status, "permission_required");
  assert.equal(result.result.requiresConfirmation, true);
});

test("Chrome and YouTube request becomes an executable workflow", () => {
  const command = parseNaturalCommand("Open Chrome and go to YouTube.");
  assert.equal(command.kind, "workflow");
  assert.deepEqual(command.steps.map((step) => [step.kind, step.operation, step.target]), [
    ["computer", "open", "Chrome"],
    ["computer", "navigate_browser", "YouTube"],
  ]);
});

test("Chrome navigation maps YouTube to a validated URL", async () => {
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
  assert.equal(result.success, true);
  assert.deepEqual(calls[1], ["computer.navigate_browser", { target: "YouTube", url: "https://www.youtube.com" }]);
});

test("workflow execution stops after the first failed step", async () => {
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
  assert.equal(result.success, false);
  assert.equal(result.results.length, 1);
  assert.equal(calls, 1);
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
