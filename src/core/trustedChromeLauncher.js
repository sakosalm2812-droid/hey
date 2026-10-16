import { approveAction, createAction, executeAction, getAction } from "./actionEngine.js";
import { createTauriAdapter, isTauriRuntime } from "../lib/tauriAdapter.js";

const CHROME_RESOURCE = "app://chrome";
const CHROME_INPUT = Object.freeze({ target: "chrome", url: "about:blank" });
const PREVIEW_LIFETIME_MS = 60_000;

function accountIdOf(user) {
  return typeof user?.id === "string" && user.id.trim() ? user.id.trim() : null;
}

function ownDataValue(object, key) {
  if (!object || typeof object !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function isChromeLaunchAction(action) {
  try {
    const lifecycle = ownDataValue(action, "lifecycle");
    const input = ownDataValue(action, "input");
    return Object.getPrototypeOf(action) === Object.prototype
      && Object.getPrototypeOf(lifecycle) === Object.prototype
      && Object.getPrototypeOf(input) === Object.prototype
      && ownDataValue(action, "tool") === "computer.app.open"
      && ownDataValue(action, "permission") === "app.open"
      && ownDataValue(action, "riskLevel") === "high"
      && ownDataValue(lifecycle, "resource") === CHROME_RESOURCE
      && ownDataValue(input, "target") === CHROME_INPUT.target
      && ownDataValue(input, "url") === CHROME_INPUT.url;
  } catch {
    return false;
  }
}

function exactObservation(request, verified, evidence = null) {
  return {
    verified,
    actionId: request.actionId,
    operationId: request.operationId,
    accountId: request.accountId,
    deviceId: request.deviceId,
    authorizationEpoch: request.authorizationEpoch,
    lifecycleExpiresAt: request.lifecycleExpiresAt,
    capability: request.capability,
    permission: request.permission,
    resource: request.resource,
    operation: request.operation,
    inputDigest: request.inputDigest,
    observerId: "tauri.chrome-process-observer.v1",
    observationId: crypto.randomUUID(),
    observedAt: new Date().toISOString(),
    evidence,
  };
}

function nativeObservationMatches(result, processId = null) {
  const data = result?.data;
  return result?.success === true
    && result?.capability === "app.open"
    && data?.appId === "chrome"
    && (processId === null
      ? data.installed === true && typeof data.executablePath === "string" && data.executablePath.length > 0
      : data.running === true
        && data.processId === processId
        && data.targetArgumentPresent === true
        && data.requestedUrl === CHROME_INPUT.url
        && typeof data.executablePath === "string" && data.executablePath.length > 0);
}

export function createChromeLaunchAction({ user, deviceId, authorizationEpoch, expiresAt = Date.now() + PREVIEW_LIFETIME_MS } = {}) {
  const accountId = accountIdOf(user);
  if (!accountId || typeof deviceId !== "string" || !deviceId.trim()
    || !(Number.isSafeInteger(authorizationEpoch) && authorizationEpoch >= 0)
    || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + PREVIEW_LIFETIME_MS) {
    throw new TypeError("An authenticated account, trusted device, current authorization epoch, and short expiry are required.");
  }

  return createAction({
    title: "Open Google Chrome to a blank page",
    tool: "computer.app.open",
    permission: "app.open",
    riskLevel: "high",
    input: { ...CHROME_INPUT },
    lifecycle: {
      accountId,
      deviceId: deviceId.trim(),
      resource: CHROME_RESOURCE,
      authorizationEpoch,
      expiresAt,
    },
  });
}

export function approveChromeLaunchAction(actionId) {
  const action = getAction(actionId);
  if (!isChromeLaunchAction(action) || ownDataValue(action, "status") !== "queued") {
    return { success: false, status: "approval_unavailable", error: "This exact Chrome launch preview is no longer awaiting approval." };
  }
  const approved = approveAction(actionId);
  return approved
    ? { success: true, status: "approved", action: approved }
    : { success: false, status: "approval_unavailable", error: "The Chrome launch preview could not be approved." };
}

export async function executeChromeLaunchAction(actionId, { user, deviceId, authorizationEpoch, mandate, signal } = {}) {
  const action = getAction(actionId);
  if (!isChromeLaunchAction(action) || ownDataValue(action, "status") !== "approved") {
    return { success: false, status: "approval_required", error: "Explicit approval of the exact Chrome launch preview is required." };
  }
  if (!isTauriRuntime()) {
    return { success: false, status: "unsupported_platform", error: "Opening desktop applications is available only in the trusted HEY desktop runtime." };
  }
  if (signal?.aborted) {
    return { success: false, status: "cancelled", error: "Chrome launch was cancelled before dispatch." };
  }

  const adapter = createTauriAdapter();
  if (!adapter?.capabilities.includes("app.open") || typeof adapter.observeApplication !== "function") {
    return { success: false, status: "unavailable", error: "The desktop runtime does not expose the verified Chrome launch capability." };
  }

  const resource = CHROME_RESOURCE;
  const strictOptions = {
    user,
    deviceId,
    authorizationEpoch,
    resource,
    mandate,
    requireMandate: true,
    requireIndependentVerification: true,
    // This flag is derived from the approved action state above. The signed,
    // one-use Trust Kernel mandate remains the execution authority.
    confirmed: ownDataValue(action, "status") === "approved",
    verifyTargetBinding: async (request) => {
      const inputMatches = request.capability === action.tool
        && request.permission === action.permission
        && request.resource === CHROME_RESOURCE
        && request.input?.target === CHROME_INPUT.target
        && request.input?.url === CHROME_INPUT.url;
      if (!inputMatches) return exactObservation(request, false, { reason: "target_mismatch" });
      const observation = await adapter.observeApplication({ appId: "chrome" });
      return exactObservation(request, nativeObservationMatches(observation), observation?.data || null);
    },
    verifyPostcondition: async (request) => {
      const processId = request.result?.data?.processId;
      const requestMatches = request.capability === action.tool
        && request.permission === action.permission
        && request.resource === CHROME_RESOURCE
        && request.input?.target === CHROME_INPUT.target
        && request.input?.url === CHROME_INPUT.url
        && Number.isSafeInteger(processId) && processId > 0;
      if (!requestMatches) return exactObservation(request, false, { reason: "launch_result_mismatch" });
      const observation = await adapter.observeApplication({ appId: "chrome", processId, expectedUrl: CHROME_INPUT.url });
      return exactObservation(request, nativeObservationMatches(observation, processId), observation?.data || null);
    },
  };

  const result = await executeAction(actionId, async (_input, context) => {
    if (signal?.aborted) return { success: false, cancelledBeforeDispatch: true };
    if (context?.input?.target !== CHROME_INPUT.target || context?.input?.url !== CHROME_INPUT.url) {
      return { success: false, error: "The Chrome target changed before dispatch." };
    }
    return adapter.execute({ capability: "app.open", input: CHROME_INPUT });
  }, strictOptions);
  if (signal?.aborted && action.result?.cancelledBeforeDispatch === true) {
    return { success: false, status: "cancelled", error: "Chrome launch was cancelled before dispatch.", action };
  }
  return result;
}

export default {
  createChromeLaunchAction,
  approveChromeLaunchAction,
  executeChromeLaunchAction,
};
