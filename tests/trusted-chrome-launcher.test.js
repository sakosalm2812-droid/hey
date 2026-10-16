import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";

import {
  approveChromeLaunchAction,
  createChromeLaunchAction,
  executeChromeLaunchAction,
} from "../src/core/trustedChromeLauncher.js";
import { clearActions } from "../src/core/actionEngine.js";
import HEY from "../src/core/index.js";
import supabaseClient from "../src/lib/supabase.js";

globalThis.crypto ??= webcrypto;

const user = { id: "chrome-launch-user", plan: "elite", permissions: ["app.open"] };
const deviceId = "trusted-desktop-test-device";
const authorizationEpoch = 3;
const mandate = { payload: { id: "chrome-launch-mandate" }, signature: { keyId: "test-key" } };
const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function installTauriRuntime(t, invoke) {
  const previousWindow = globalThis.window;
  globalThis.window = {
    location: { protocol: "tauri:" },
    __TAURI_INTERNALS__: { invoke },
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
}

function installMandateVerifier(t, authorized = true) {
  const previousFunctions = supabaseClient.functions;
  supabaseClient.functions = {
    async invoke(name, { body }) {
      assert.equal(name, "hey-mandate");
      assert.equal(body.action, "computer.app.open");
      assert.equal(body.resource, "app://chrome");
      return {
        data: authorized
          ? { authorized: true, mandateId: body.mandate.payload.id, remainingUses: 0 }
          : { authorized: false, reason: "mandate_revoked" },
        error: null,
      };
    },
  };
  t.after(() => {
    if (previousFunctions === undefined) delete supabaseClient.functions;
    else supabaseClient.functions = previousFunctions;
    clearActions();
  });
}

test("the canonical HEY API exposes the narrow VoiceOS Chrome launch entrypoint", () => {
  assert.equal(HEY.voiceOS.chrome.createLaunchPreview, createChromeLaunchAction);
  assert.equal(HEY.voiceOS.chrome.approveLaunch, approveChromeLaunchAction);
  assert.equal(HEY.voiceOS.chrome.executeLaunch, executeChromeLaunchAction);
});

function nativeObservation(processId = null, overrides = {}) {
  return {
    success: true,
    capability: "app.open",
    verified: true,
    data: processId === null
      ? { appId: "chrome", installed: true, executablePath, ...overrides }
      : {
        appId: "chrome",
        processId,
        running: true,
        targetArgumentPresent: true,
        requestedUrl: "about:blank",
        executablePath,
        ...overrides,
      },
    error: null,
  };
}

test("Chrome launch preview is exact-target and must be explicitly approved; web runtime stays unsupported", async (t) => {
  clearActions();
  const previousWindow = globalThis.window;
  globalThis.window = { location: { protocol: "https:" } };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    clearActions();
  });

  const action = createChromeLaunchAction({ user, deviceId, authorizationEpoch });
  assert.equal(action.status, "queued");
  assert.equal(action.tool, "computer.app.open");
  assert.equal(action.permission, "app.open");
  assert.equal(action.riskLevel, "high");
  assert.equal(action.lifecycle.resource, "app://chrome");
  assert.deepEqual(action.input, { target: "chrome", url: "about:blank" });

  const beforeApproval = await executeChromeLaunchAction(action.id, { user, deviceId, authorizationEpoch, mandate });
  assert.equal(beforeApproval.status, "approval_required");
  assert.equal(approveChromeLaunchAction(action.id).success, true);

  const unsupported = await executeChromeLaunchAction(action.id, { user, deviceId, authorizationEpoch, mandate });
  assert.equal(unsupported.status, "unsupported_platform");
  assert.equal(action.status, "approved");

  const changed = createChromeLaunchAction({ user, deviceId, authorizationEpoch });
  changed.input.target = "settings";
  assert.equal(approveChromeLaunchAction(changed.id).success, false);

  const retargeted = createChromeLaunchAction({ user, deviceId, authorizationEpoch });
  assert.equal(approveChromeLaunchAction(retargeted.id).success, true);
  retargeted.input.url = "https://example.com";
  const changedTarget = await executeChromeLaunchAction(retargeted.id, { user, deviceId, authorizationEpoch, mandate });
  assert.equal(changedTarget.status, "approval_required");

  const accessorTarget = createChromeLaunchAction({ user, deviceId, authorizationEpoch });
  let getterCalls = 0;
  Object.defineProperty(accessorTarget.input, "target", {
    configurable: true,
    get() { getterCalls += 1; throw new Error("target getter must not run"); },
  });
  assert.equal(approveChromeLaunchAction(accessorTarget.id).success, false);
  assert.equal(getterCalls, 0);
});

test("approved Chrome launch consumes its exact mandate and requires separate native process verification", async (t) => {
  clearActions();
  installMandateVerifier(t);
  const calls = [];
  installTauriRuntime(t, async (command, args) => {
    calls.push({ command, args });
    if (command === "native_observe_application" && args.processId === null) return nativeObservation();
    if (command === "native_execute") {
      assert.equal(args.capability, "app.open");
      assert.deepEqual(args.input, { target: "chrome", url: "about:blank" });
      return {
        success: true,
        capability: "app.open",
        verified: true,
        data: { application: "Google Chrome", processId: 4821, url: "about:blank" },
        error: null,
      };
    }
    if (command === "native_observe_application" && args.processId === 4821) {
      assert.equal(args.appId, "chrome");
      assert.equal(args.expectedUrl, "about:blank");
      return nativeObservation(4821);
    }
    throw new Error(`Unexpected native command: ${command}`);
  });

  const action = createChromeLaunchAction({ user, deviceId, authorizationEpoch });
  assert.equal(approveChromeLaunchAction(action.id).success, true);
  const result = await executeChromeLaunchAction(action.id, { user, deviceId, authorizationEpoch, mandate });

  assert.equal(result.success, true, result.error);
  assert.equal(action.status, "completed");
  assert.equal(action.verification.verified, true);
  assert.equal(action.verification.resource, "app://chrome");
  assert.equal(action.verification.evidence.appId, "chrome");
  assert.equal(action.verification.evidence.processId, 4821);
  assert.equal(calls.map(({ command }) => command).join(","), "native_observe_application,native_execute,native_observe_application");
});

test("a native postcondition for the wrong application cannot create a success receipt", async (t) => {
  clearActions();
  installMandateVerifier(t);
  let dispatches = 0;
  installTauriRuntime(t, async (command, args) => {
    if (command === "native_observe_application" && args.processId === null) return nativeObservation();
    if (command === "native_execute") {
      dispatches += 1;
      return {
        success: true,
        capability: "app.open",
        verified: true,
        data: { application: "Google Chrome", processId: 4822, url: "about:blank" },
        error: null,
      };
    }
    if (command === "native_observe_application" && args.processId === 4822) {
      return nativeObservation(4822, { appId: "edge" });
    }
    throw new Error(`Unexpected native command: ${command}`);
  });

  const action = createChromeLaunchAction({ user, deviceId, authorizationEpoch });
  approveChromeLaunchAction(action.id);
  const result = await executeChromeLaunchAction(action.id, { user, deviceId, authorizationEpoch, mandate });

  assert.equal(result.success, false);
  assert.equal(action.status, "failed");
  assert.equal(Object.hasOwn(action, "receipt"), false);
  assert.equal(dispatches, 1);
});

test("an already-aborted launch never invokes the native adapter", async (t) => {
  clearActions();
  let nativeCalls = 0;
  installTauriRuntime(t, async () => { nativeCalls += 1; throw new Error("should not dispatch"); });
  const action = createChromeLaunchAction({ user, deviceId, authorizationEpoch });
  approveChromeLaunchAction(action.id);
  const controller = new AbortController();
  controller.abort();

  const result = await executeChromeLaunchAction(action.id, {
    user,
    deviceId,
    authorizationEpoch,
    mandate,
    signal: controller.signal,
  });

  assert.equal(result.status, "cancelled");
  assert.equal(nativeCalls, 0);
});

test("Trust Kernel mandate denial blocks Chrome dispatch after target preflight", async (t) => {
  clearActions();
  installMandateVerifier(t, false);
  const calls = [];
  installTauriRuntime(t, async (command, args) => {
    calls.push(command);
    if (command === "native_observe_application" && args.processId === null) return nativeObservation();
    throw new Error(`Unexpected native command: ${command}`);
  });

  const action = createChromeLaunchAction({ user, deviceId, authorizationEpoch });
  approveChromeLaunchAction(action.id);
  const result = await executeChromeLaunchAction(action.id, { user, deviceId, authorizationEpoch, mandate });

  assert.equal(result.success, false);
  assert.match(result.error, /mandate_revoked/);
  assert.equal(action.status, "approved");
  assert.deepEqual(calls, ["native_observe_application"]);
});

test("cancellation while the signed mandate is checked prevents native dispatch", async (t) => {
  clearActions();
  let resolveMandate;
  let signalMandateRequest;
  const mandateStarted = new Promise((resolve) => { signalMandateRequest = resolve; });
  const mandateResponse = new Promise((resolve) => { resolveMandate = resolve; });
  const previousFunctions = supabaseClient.functions;
  supabaseClient.functions = {
    async invoke(name, { body }) {
      assert.equal(name, "hey-mandate");
      assert.equal(body.resource, "app://chrome");
      signalMandateRequest();
      return mandateResponse;
    },
  };
  t.after(() => {
    if (previousFunctions === undefined) delete supabaseClient.functions;
    else supabaseClient.functions = previousFunctions;
    clearActions();
  });
  const calls = [];
  installTauriRuntime(t, async (command, args) => {
    calls.push(command);
    if (command === "native_observe_application" && args.processId === null) return nativeObservation();
    throw new Error(`Unexpected native command: ${command}`);
  });

  const action = createChromeLaunchAction({ user, deviceId, authorizationEpoch });
  approveChromeLaunchAction(action.id);
  const controller = new AbortController();
  const execution = executeChromeLaunchAction(action.id, {
    user,
    deviceId,
    authorizationEpoch,
    mandate,
    signal: controller.signal,
  });
  await mandateStarted;
  controller.abort(new Error("user cancelled"));
  resolveMandate({ data: { authorized: true, mandateId: mandate.payload.id, remainingUses: 0 }, error: null });

  const result = await execution;
  assert.equal(result.success, false);
  assert.equal(result.status, "cancelled");
  assert.equal(action.result.cancelledBeforeDispatch, true);
  assert.deepEqual(calls, ["native_observe_application"]);
});
