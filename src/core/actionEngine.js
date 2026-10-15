import { recordAudit } from "./auditLog.js";
import { authorizeExecution } from "./permissionManager.js";
import { evaluateApprovalPolicy } from "./trustKernelPolicy.js";
import { publish } from "./eventBus.js";
import { subscribeAccountScope } from "./accountScope.js";
import { authorizeWithTrustKernel } from "./trustKernelPolicy.js";
import supabaseClient from "../lib/supabase.js";

const actions = new Map();
const undoReservations = new Map();
const OBSERVATION_MAX_AGE_MS = 30_000;
const OBSERVATION_CLOCK_SKEW_MS = 2_000;
const ACTION_PREVIEW_MAX_LIFETIME_MS = 5 * 60_000;

function copyPlainJson(value, ancestors = new WeakSet(), depth = 0) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Mandate envelope must not contain non-finite numbers.");
    return value;
  }
  if (!value || typeof value !== "object" || depth > 12 || ancestors.has(value)) throw new TypeError("Mandate envelope must be bounded plain JSON data.");
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(value);
    if (keys.length !== value.length || keys.some((key, index) => key !== String(index))
      || Reflect.ownKeys(value).length !== value.length + 1
      || keys.some((key) => !Object.hasOwn(descriptors[key], "value"))) throw new TypeError("Mandate arrays must contain only dense data values.");
    ancestors.add(value);
    try { return keys.map((key) => copyPlainJson(descriptors[key].value, ancestors, depth + 1)); }
    finally { ancestors.delete(value); }
  }
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Mandate envelope must contain plain objects only.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !Object.hasOwn(descriptors[key], "value") || !descriptors[key].enumerable)) {
    throw new TypeError("Mandate envelope cannot contain symbols, accessors, or hidden properties.");
  }
  ancestors.add(value);
  try {
    const result = Object.create(null);
    for (const key of keys) result[key] = copyPlainJson(descriptors[key].value, ancestors, depth + 1);
    return result;
  } finally { ancestors.delete(value); }
}

function freezePlainJson(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezePlainJson(child);
    Object.freeze(value);
  }
  return value;
}

async function digestReceiptValue(value, name) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.byteLength > 64 * 1024) throw new TypeError(`${name} exceeds the receipt digest size limit.`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function authenticatedAccountId(user) {
  const value = user?.id || user?.userId || user?.accountId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isSensitiveComputerAction(action) {
  const capabilities = [action?.tool, action?.permission].filter((value) => typeof value === "string");
  return capabilities.some((value) => /^(?:computer(?:[.:/]|$)|window\.control$|input\.control$|screen\.capture$)/i.test(value));
}

function snapshotActionLifecycle(value, now = Date.now()) {
  try {
    const lifecycle = copyPlainJson(value);
    if (!lifecycle || typeof lifecycle !== "object" || Array.isArray(lifecycle)) return null;
    if (new TextEncoder().encode(JSON.stringify(lifecycle)).byteLength > 8 * 1024) return null;
    const expiresAt = typeof lifecycle.expiresAt === "string" ? Date.parse(lifecycle.expiresAt) : lifecycle.expiresAt;
    if (typeof lifecycle.accountId !== "string" || !lifecycle.accountId.trim() || lifecycle.accountId.length > 256
      || typeof lifecycle.deviceId !== "string" || !lifecycle.deviceId.trim() || lifecycle.deviceId.length > 512
      || typeof lifecycle.resource !== "string" || !lifecycle.resource.trim() || lifecycle.resource.length > 4096
      || !(typeof lifecycle.authorizationEpoch === "string" && lifecycle.authorizationEpoch.length > 0 && lifecycle.authorizationEpoch.length <= 256)
        && !(Number.isSafeInteger(lifecycle.authorizationEpoch) && lifecycle.authorizationEpoch >= 0)
      || !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + ACTION_PREVIEW_MAX_LIFETIME_MS) return null;
    return freezePlainJson({
      accountId: lifecycle.accountId.trim(),
      deviceId: lifecycle.deviceId.trim(),
      resource: lifecycle.resource.trim(),
      authorizationEpoch: lifecycle.authorizationEpoch,
      expiresAt,
    });
  } catch {
    return null;
  }
}

function actionLifecycleMatches(action, options, now = Date.now()) {
  const expected = action.lifecycle;
  const accountId = authenticatedAccountId(options?.user);
  return Boolean(expected)
    && expected.expiresAt > now
    && accountId === expected.accountId
    && options?.deviceId === expected.deviceId
    && options?.resource === expected.resource
    && options?.authorizationEpoch === expected.authorizationEpoch;
}

function invalidateAction(action, reason) {
  if (!action || actions.get(action.id) !== action) return;
  action.status = "invalidated";
  action.error = reason;
  action.updatedAt = new Date();
  undoReservations.delete(action.id);
  publish("action.updated", action);
}

function validateIndependentObservation(value, expected, requestedAt = Date.now()) {
  let snapshot;
  try {
    snapshot = copyPlainJson(value);
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return { valid: false, snapshot: null };
    if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > 64 * 1024) return { valid: false, snapshot: null };
  } catch {
    return { valid: false, snapshot: null };
  }
  const observedAtMs = typeof snapshot.observedAt === "string" ? Date.parse(snapshot.observedAt) : NaN;
  const age = Date.now() - observedAtMs;
  const contractMatches = snapshot.actionId === expected.actionId
    && snapshot.operationId === expected.operationId
    && snapshot.accountId === expected.accountId
    && snapshot.deviceId === expected.deviceId
    && snapshot.authorizationEpoch === expected.authorizationEpoch
    && snapshot.lifecycleExpiresAt === expected.lifecycleExpiresAt
    && snapshot.capability === expected.capability
    && snapshot.permission === expected.permission
    && snapshot.resource === expected.resource
    && snapshot.operation === expected.operation
    && snapshot.inputDigest === expected.inputDigest;
  const observationMetadataValid = typeof snapshot.observerId === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(snapshot.observerId)
    && typeof snapshot.observationId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(snapshot.observationId)
    && Number.isFinite(observedAtMs)
    && observedAtMs >= requestedAt - OBSERVATION_CLOCK_SKEW_MS
    && age <= OBSERVATION_MAX_AGE_MS
    && age >= -OBSERVATION_CLOCK_SKEW_MS
    && new Date(observedAtMs).toISOString() === snapshot.observedAt;
  return { valid: contractMatches && observationMetadataValid, snapshot };
}

export function clearActions() {
  for (const action of actions.values()) action.status = "cancelled";
  actions.clear();
  undoReservations.clear();
}

export function invalidateActionPreviews(currentContext = {}) {
  const now = Date.now();
  let invalidated = 0;
  for (const action of actions.values()) {
    if (!isSensitiveComputerAction(action) || !action.lifecycle) continue;
    const lifecycle = action.lifecycle;
    const matches = lifecycle.expiresAt > now
      && currentContext.accountId === lifecycle.accountId
      && currentContext.deviceId === lifecycle.deviceId
      && currentContext.resource === lifecycle.resource
      && currentContext.authorizationEpoch === lifecycle.authorizationEpoch;
    if (!matches) {
      invalidateAction(action, lifecycle.expiresAt <= now ? "Action preview expired." : "Action preview context changed.");
      invalidated += 1;
    }
  }
  return invalidated;
}

subscribeAccountScope((_previousScope, nextScope) => {
  const accountId = nextScope.startsWith("account:") ? nextScope.slice("account:".length) : null;
  invalidateActionPreviews({ accountId });
});

export function createAction(input = {}) {
  const base = { id: crypto.randomUUID(), title: String(input.title || "Untitled action"), tool: input.tool || null, input: input.input || {}, permission: input.permission || input.tool || "general", riskLevel: input.riskLevel || "medium", status: "queued", undo: input.undo || null, createdAt: new Date(), updatedAt: new Date() };
  const lifecycle = snapshotActionLifecycle(input.lifecycle);
  const action = { ...base, ...(lifecycle ? { lifecycle } : {}) };
  if (isSensitiveComputerAction(action) && !lifecycle) {
    action.status = "invalidated";
    action.error = "Sensitive action preview requires a valid bounded lifecycle context.";
  }
  actions.set(action.id, action);
  publish("action.updated", action);
  recordAudit({ action: "action.created", tool: action.tool, riskLevel: action.riskLevel, status: action.status, metadata: { actionId: action.id } });
  return action;
}

export function listActions(status) {
  return Array.from(actions.values()).filter((action) => !status || action.status === status);
}

export function getAction(actionId) {
  return actions.get(actionId) || null;
}

async function verifyActionMandate(action, options) {
  if (!options.mandate && !options.requireMandate) return { authorized: true };
  if (!options.mandate) return { authorized: false, reason: "A signed action mandate is required." };
  try {
    const mandate = copyPlainJson(options.mandate);
    const payload = mandate?.payload;
    if (!payload || typeof payload.id !== "string" || JSON.stringify(mandate).length > 64 * 1024) {
      return { authorized: false, reason: "Mandate envelope is invalid or too large." };
    }
    const invoke = supabaseClient?.functions?.invoke;
    if (typeof invoke !== "function") return { authorized: false, reason: "Trusted mandate verification service is unavailable." };
    const { data, error } = await invoke.call(supabaseClient.functions, "hey-mandate", {
      body: {
        mandate,
        action: options.authorizationAction || action.tool || action.permission,
        resource: options.resource || action.permission,
        idempotencyKey: options.idempotencyKey || action.id,
      },
    });
    if (error || !data || typeof data !== "object" || typeof data.authorized !== "boolean") {
      return { authorized: false, reason: "Trusted mandate verification service is unavailable." };
    }
    if (!data.authorized) {
      return { authorized: false, reason: typeof data.reason === "string" ? data.reason.slice(0, 300) : "Mandate authority denied execution." };
    }
    if (data.mandateId !== payload.id || !Number.isSafeInteger(data.remainingUses) || data.remainingUses < 0) {
      return { authorized: false, reason: "Trusted mandate verification response was malformed." };
    }
    return { authorized: true, mandateId: data.mandateId, remainingUses: data.remainingUses };
  } catch {
    return { authorized: false, reason: "Trusted mandate verification failed; execution was denied." };
  }
}

async function authorizeActionMandate(action, options) {
  const trustKernel = options.trustKernel;
  if (!trustKernel || typeof trustKernel !== "object") return verifyActionMandate(action, options);
  try {
    const accountId = authenticatedAccountId(options.user);
    const actionName = options.authorizationAction || action.tool || action.permission;
    const resource = options.resource || action.permission;
    const idempotencyKey = options.idempotencyKey || action.id;
    const suppliedContext = trustKernel.mandateContext || {};
    const context = {
      ...suppliedContext,
      accountId,
      action: actionName,
      resource,
      idempotencyKey,
    };
    const decision = await authorizeWithTrustKernel({
      authorization: {
        user: options.user,
        capability: action.tool || action.permission,
        permission: action.permission,
        riskLevel: action.riskLevel,
        requiresConfirmation: true,
        confirmed: options.confirmed === true,
      },
      input: {
        actorId: accountId,
        action: actionName,
        resource,
        risk: action.riskLevel,
        offline: options.offline === true,
        authStrength: options.authStrength,
      },
      policy: trustKernel.policy || options.policy,
      policyOptions: trustKernel.policyOptions,
      mandate: options.mandate,
      mandateContext: context,
      mandateOptions: trustKernel.mandateOptions,
    });
    if (!decision.authorized) return { authorized: false, reason: decision.reason, trustKernel: decision };
    return {
      authorized: true,
      mandateId: decision.mandateDecision?.mandateId,
      remainingUses: decision.mandateDecision?.remainingUses,
      policyDecision: decision.policyDecision,
      trustKernel: decision,
    };
  } catch {
    return { authorized: false, reason: "Trust Kernel authorization failed closed." };
  }
}

export function approveAction(actionId) {
  const action = getAction(actionId);
  if (!action || action.status !== "queued") return null;
  action.status = "approved";
  action.updatedAt = new Date();
  publish("action.updated", action);
  return action;
}

export async function executeAction(actionId, handler, options = {}) {
  const action = getAction(actionId);
  if (!action) return { success: false, error: "Action not found." };
  const requiresLifecycleFence = isSensitiveComputerAction(action);
  if (requiresLifecycleFence && !actionLifecycleMatches(action, options)) {
    invalidateAction(action, action?.lifecycle?.expiresAt <= Date.now() ? "Action preview expired." : "Action preview context changed.");
    return { success: false, error: action.error, action };
  }
  if (action.status !== "queued" && action.status !== "approved") {
    return { success: false, error: `Action cannot execute from ${action.status} state.`, action };
  }
  const authorization = authorizeExecution({
    user: options.user,
    capability: action.tool || action.permission,
    permission: action.permission,
    riskLevel: action.riskLevel,
    requiresConfirmation: true,
    confirmed: options.confirmed === true,
  });
  if (!authorization.authorized) return { success: false, requiresConfirmation: authorization.requiresConfirmation, error: authorization.reason, action, authorization };
  if (typeof handler !== "function") return { success: false, error: "No action handler registered." };
  const requiresIndependentVerification = options.requireIndependentVerification === true || isSensitiveComputerAction(action);
  const accountId = authenticatedAccountId(options.user);
  const lifecycleIsCurrent = () => {
    if (!requiresLifecycleFence || actionLifecycleMatches(action, options)) return true;
    invalidateAction(action, action?.lifecycle?.expiresAt <= Date.now() ? "Action preview expired." : "Action preview context changed.");
    return false;
  };
  const operationId = crypto.randomUUID();
  const strictResource = options.resource;
  const verifyTargetBinding = options.verifyTargetBinding;
  const verifyPostcondition = options.verifyPostcondition;
  if (requiresIndependentVerification) {
    if (!options.requireMandate || typeof verifyTargetBinding !== "function" || typeof verifyPostcondition !== "function"
      || verifyTargetBinding === handler || verifyPostcondition === handler || verifyTargetBinding === verifyPostcondition
      || !accountId || typeof strictResource !== "string" || !strictResource.trim()) {
      return { success: false, error: "A distinct bound observer, target binding, signed mandate, authenticated account, and exact resource target are required.", action };
    }
  }
  // Snapshot before mandate verification yields to asynchronous storage/network
  // work; callers cannot retarget an admitted action while authority is checked.
  let executionInput = action.input;
  let executionInputDigest;
  if (requiresIndependentVerification) {
    try { executionInput = freezePlainJson(copyPlainJson(action.input)); }
    catch { return { success: false, error: "Strict computer action input must be bounded plain JSON data.", action }; }
    try { executionInputDigest = await digestReceiptValue(executionInput, "Original action input"); }
    catch { return { success: false, error: "Strict computer action input exceeds the bounded verification digest size.", action }; }
    if (actions.get(actionId) !== action || (action.status !== "queued" && action.status !== "approved")) {
      return { success: false, error: "Action is no longer available for execution.", action };
    }
    if (!lifecycleIsCurrent()) return { success: false, error: action.error, action };
  }
  const strictAction = requiresIndependentVerification
    ? Object.freeze({ id: action.id, tool: action.tool, permission: action.permission, riskLevel: action.riskLevel, accountId, deviceId: action.lifecycle?.deviceId, authorizationEpoch: action.lifecycle?.authorizationEpoch, lifecycleExpiresAt: action.lifecycle?.expiresAt, operationId, operation: "execute" })
    : action;
  let strictMandate = options.mandate;
  if (requiresIndependentVerification && options.mandate !== undefined) {
    try { strictMandate = freezePlainJson(copyPlainJson(options.mandate)); }
    catch { return { success: false, error: "Strict computer action mandate must be bounded plain JSON data.", action }; }
  }
  const strictOptions = requiresIndependentVerification
    ? { ...options, mandate: strictMandate, resource: strictResource }
    : options;
  const executionContext = requiresIndependentVerification
    ? Object.freeze({ ...strictAction, resource: strictResource, input: executionInput })
    : action;
  if (requiresIndependentVerification) {
    let binding;
    const bindingContext = {
      actionId: executionContext.id,
      operationId,
      accountId,
      deviceId: action.lifecycle?.deviceId,
      authorizationEpoch: action.lifecycle?.authorizationEpoch,
      lifecycleExpiresAt: action.lifecycle?.expiresAt,
      capability: executionContext.tool || executionContext.permission,
      permission: executionContext.permission,
      resource: strictResource,
      operation: "execute",
      inputDigest: executionInputDigest,
      input: executionContext.input,
    };
    const bindingRequestedAt = Date.now();
    try {
      binding = await verifyTargetBinding(bindingContext);
    } catch {
      return { success: false, error: "The exact computer-control target could not be independently bound.", action };
    }
    const boundTarget = validateIndependentObservation(binding, bindingContext, bindingRequestedAt);
    if (actions.get(actionId) !== action || (action.status !== "queued" && action.status !== "approved") || authenticatedAccountId(options.user) !== accountId || !lifecycleIsCurrent()) {
      return { success: false, error: "Action or account is no longer available for execution.", action };
    }
    if (!boundTarget.valid || boundTarget.snapshot?.verified !== true) {
      return { success: false, error: typeof boundTarget.snapshot?.reason === "string" ? boundTarget.snapshot.reason.slice(0, 300) : "The exact computer-control target could not be independently bound.", action };
    }
  }
  if (action.status !== "queued" && action.status !== "approved") {
    return { success: false, error: `Action cannot execute from ${action.status} state.`, action };
  }
  const mandate = await authorizeActionMandate(strictAction, strictOptions);
  if (!lifecycleIsCurrent()) return { success: false, error: action.error, action };
  if (!mandate.authorized) return { success: false, error: mandate.reason, action, mandate };
  // Mandate verification is asynchronous; reserve the action only after it
  // completes, then re-check admission to prevent concurrent double dispatch.
  if (action.status !== "queued" && action.status !== "approved") {
    return { success: false, error: `Action cannot execute from ${action.status} state.`, action };
  }
  if (requiresIndependentVerification && authenticatedAccountId(options.user) !== accountId) {
    return { success: false, error: "Authenticated account changed during action authorization.", action };
  }
  if (!lifecycleIsCurrent()) return { success: false, error: action.error, action };
  action.status = "running";
  action.updatedAt = new Date();
  publish("action.updated", action);
  try {
    action.result = await handler(executionInput, executionContext);
    if (requiresIndependentVerification) {
      if (actions.get(actionId) !== action || action.status !== "running") {
        return { success: false, error: "Action is no longer available for execution.", action };
      }
      if (authenticatedAccountId(options.user) !== accountId || !lifecycleIsCurrent()) throw new Error(action.error || "Authenticated account changed during computer action execution.");
      const observationContext = {
        actionId: strictAction.id,
        operationId,
        accountId,
        deviceId: action.lifecycle?.deviceId,
        authorizationEpoch: action.lifecycle?.authorizationEpoch,
        lifecycleExpiresAt: action.lifecycle?.expiresAt,
        capability: executionContext.tool || executionContext.permission,
        permission: executionContext.permission,
        resource: strictResource,
        operation: "execute",
        inputDigest: executionInputDigest,
        input: executionInput,
        result: action.result,
      };
      const verificationRequestedAt = Date.now();
      const verification = await verifyPostcondition(observationContext);
      const checkedObservation = validateIndependentObservation(verification, observationContext, verificationRequestedAt);
      if (!checkedObservation.valid) throw new Error("Independent postcondition observation was stale or did not match the exact action context.");
      const verificationSnapshot = checkedObservation.snapshot;
      if (verificationSnapshot?.verified !== true) {
        throw new Error(typeof verificationSnapshot?.reason === "string" ? verificationSnapshot.reason.slice(0, 300) : "Independent postcondition verification failed.");
      }
      if (actions.get(actionId) !== action || action.status !== "running") {
        return { success: false, error: "Action is no longer available for execution.", action };
      }
      if (authenticatedAccountId(options.user) !== accountId || !lifecycleIsCurrent()) throw new Error(action.error || "Authenticated account changed during independent verification.");
      const verificationRecord = freezePlainJson({
        verified: true,
        capability: executionContext.tool || executionContext.permission,
        permission: executionContext.permission,
        riskLevel: executionContext.riskLevel,
        accountId,
        deviceId: action.lifecycle?.deviceId,
        authorizationEpoch: action.lifecycle?.authorizationEpoch,
        lifecycleExpiresAt: action.lifecycle?.expiresAt,
        operationId,
        operation: "execute",
        resource: strictResource,
        inputDigest: executionInputDigest,
        observerId: verificationSnapshot.observerId,
        observationId: verificationSnapshot.observationId,
        observedAt: verificationSnapshot.observedAt,
        evidence: verificationSnapshot.evidence ?? null,
      });
      Object.defineProperty(action, "verification", { value: verificationRecord, enumerable: true, writable: false, configurable: false });
    } else if (!action.result || action.result.success !== true || action.result.verified !== true) {
      throw new Error(action.result?.error || "The action could not be verified.");
    }
    action.status = "completed";
    action.updatedAt = new Date();
    publish("action.updated", action);
    recordAudit({ action: "action.executed", tool: action.tool, riskLevel: action.riskLevel, status: "completed", metadata: { actionId } });
    return { success: true, action };
  } catch (error) {
    if (requiresLifecycleFence && !actionLifecycleMatches(action, options)) {
      invalidateAction(action, action?.lifecycle?.expiresAt <= Date.now() ? "Action preview expired." : "Action preview context changed.");
      return { success: false, error: action.error, action };
    }
    if (requiresIndependentVerification && (actions.get(actionId) !== action || action.status !== "running")) {
      return { success: false, error: "Action or account is no longer available for execution.", action };
    }
    if (requiresIndependentVerification && authenticatedAccountId(options.user) !== accountId) {
      action.status = "failed";
      action.error = "Authenticated account changed during computer action execution.";
      action.updatedAt = new Date();
      publish("action.updated", action);
      recordAudit({ action: "action.executed", tool: action.tool, riskLevel: action.riskLevel, status: "failed", metadata: { actionId, error: action.error } });
      return { success: false, error: action.error, action };
    }
    action.status = "failed";
    action.error = error instanceof Error ? error.message : String(error);
    publish("action.updated", action);
    recordAudit({ action: "action.executed", tool: action.tool, riskLevel: action.riskLevel, status: "failed", metadata: { actionId, error: action.error } });
    return { success: false, error: action.error, action };
  }
}

export async function undoAction(actionId, handler, options = {}) {
  const action = getAction(actionId);
  if (!action || action.status !== "completed" || typeof handler !== "function" || undoReservations.has(actionId)) return { success: false, error: "Action cannot be undone." };
  const requiresIndependentVerification = options.requireIndependentVerification === true || isSensitiveComputerAction(action);
  const requiresLifecycleFence = isSensitiveComputerAction(action);
  const lifecycleIsCurrent = () => {
    if (!requiresLifecycleFence || actionLifecycleMatches(action, options)) return true;
    invalidateAction(action, action?.lifecycle?.expiresAt <= Date.now() ? "Action preview or undo receipt expired." : "Action preview or undo receipt context changed.");
    return false;
  };
  if (!lifecycleIsCurrent()) return { success: false, error: action.error, action };
  const accountId = authenticatedAccountId(options.user);
  const operationId = crypto.randomUUID();
  const strictResource = options.resource;
  const verifyTargetBinding = options.verifyTargetBinding;
  const verifyPostcondition = options.verifyPostcondition;
  const undoCapability = options.undoCapability;
  const undoPermission = options.undoPermission;
  const originalCapability = action.tool || action.permission;
  const originalPermission = action.permission;
  const originalRiskLevel = action.riskLevel;
  let originalVerificationSnapshot;
  let policyDecision;
  if (requiresIndependentVerification) {
    if (!options.requireMandate || typeof verifyTargetBinding !== "function" || typeof verifyPostcondition !== "function"
      || typeof strictResource !== "string" || !strictResource.trim()
      || typeof undoCapability !== "string" || !undoCapability.trim()
      || typeof undoPermission !== "string" || !undoPermission.trim()
      || typeof originalCapability !== "string" || !originalCapability.trim()
      || strictResource.length > 4096 || undoCapability.length > 512 || undoPermission.length > 512 || originalCapability.length > 512
      || !options.policy || !accountId || verifyTargetBinding === handler || verifyPostcondition === handler
      || verifyTargetBinding === verifyPostcondition) {
      return { success: false, error: "Strict undo requires a distinct bound observer, reverse capability, Trust Kernel policy, exact resource, mandate, and authenticated account.", action };
    }
    if (Object.hasOwn(action, "undoReceipt")) {
      return { success: false, error: "Strict undo receipt already exists or cannot be replaced.", action };
    }
    const verificationDescriptor = Object.getOwnPropertyDescriptor(action, "verification");
    if (!verificationDescriptor || !Object.hasOwn(verificationDescriptor, "value")
      || verificationDescriptor.writable !== false || verificationDescriptor.configurable !== false) {
      return { success: false, error: "Strict undo requires an immutable original action verification snapshot.", action };
    }
    try { originalVerificationSnapshot = freezePlainJson(copyPlainJson(verificationDescriptor.value)); }
    catch { return { success: false, error: "Strict undo original verification must be bounded plain JSON data.", action };
    }
    if (originalVerificationSnapshot?.verified !== true
      || originalVerificationSnapshot.capability !== originalCapability
      || originalVerificationSnapshot.permission !== originalPermission
      || originalVerificationSnapshot.riskLevel !== originalRiskLevel
      || originalVerificationSnapshot.accountId !== accountId
      || originalVerificationSnapshot.deviceId !== action.lifecycle.deviceId
      || originalVerificationSnapshot.authorizationEpoch !== action.lifecycle.authorizationEpoch
      || originalVerificationSnapshot.lifecycleExpiresAt !== action.lifecycle.expiresAt
      || originalVerificationSnapshot.operation !== "execute"
      || typeof originalVerificationSnapshot.operationId !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(originalVerificationSnapshot.operationId)
      || originalVerificationSnapshot.resource !== strictResource
      || typeof originalVerificationSnapshot.inputDigest !== "string"
      || !/^[a-f0-9]{64}$/.test(originalVerificationSnapshot.inputDigest)) {
      return { success: false, error: "Strict undo does not match the verified original action and exact resource.", action };
    }
    let strictPolicy;
    try { strictPolicy = freezePlainJson(copyPlainJson(options.policy)); }
    catch { return { success: false, error: "Strict undo Trust Kernel policy must be bounded plain JSON data.", action };
    }
    if (JSON.stringify(strictPolicy).length > 64 * 1024) {
      return { success: false, error: "Strict undo Trust Kernel policy exceeds the size limit.", action };
    }
    try {
      policyDecision = evaluateApprovalPolicy({
        actorId: accountId,
        action: undoCapability,
        resource: strictResource,
        risk: action.riskLevel,
        offline: options.offline === true,
        authStrength: options.authStrength,
      }, strictPolicy);
    } catch {
      return { success: false, error: "Trust Kernel denied strict undo because policy evaluation failed.", action };
    }
    if (policyDecision.decision !== "allow") {
      return { success: false, error: `Trust Kernel denied strict undo: ${policyDecision.reason || "policy_not_allowed"}.`, action, policyDecision };
    }
  }
  const authorization = authorizeExecution({
    user: options.user,
    capability: requiresIndependentVerification ? undoCapability : action.tool || action.permission,
    permission: requiresIndependentVerification ? undoPermission : action.permission,
    riskLevel: action.riskLevel,
    requiresConfirmation: true,
    confirmed: options.confirmed === true,
  });
  if (!authorization.authorized) return { success: false, requiresConfirmation: authorization.requiresConfirmation, error: authorization.reason, action, authorization };
  const strictAction = requiresIndependentVerification
    ? Object.freeze({ id: action.id, tool: undoCapability, permission: undoPermission, riskLevel: originalRiskLevel, originalCapability, originalPermission, accountId, deviceId: action.lifecycle?.deviceId, authorizationEpoch: action.lifecycle?.authorizationEpoch, lifecycleExpiresAt: action.lifecycle?.expiresAt, operationId, operation: "undo" })
    : action;
  let strictMandate = options.mandate;
  if (requiresIndependentVerification && options.mandate !== undefined) {
    try { strictMandate = freezePlainJson(copyPlainJson(options.mandate)); }
    catch { return { success: false, error: "Strict computer undo mandate must be bounded plain JSON data.", action }; }
  }
  const strictOptions = requiresIndependentVerification
    ? { ...options, authorizationAction: undoCapability, idempotencyKey: `${action.id}:undo`, mandate: strictMandate, resource: strictResource }
    : options;
  let undoInput = action.undo;
  let undoContext = action;
  if (requiresIndependentVerification) {
    try { undoInput = freezePlainJson(copyPlainJson(action.undo)); }
    catch { return { success: false, error: "Strict computer undo input must be bounded plain JSON data.", action }; }
    undoContext = Object.freeze({ ...strictAction, capability: undoCapability, resource: strictResource, input: undoInput });
  }
  // Reserve before yielding to target binding or mandate verification. This
  // lets only one strict undo proposal pass the execution boundary at a time.
  action.status = "undo_authorizing";
  action.updatedAt = new Date();
  const reservationToken = Object.freeze({});
  undoReservations.set(actionId, reservationToken);
  const releaseReservation = (error) => {
    if (undoReservations.get(actionId) === reservationToken) undoReservations.delete(actionId);
    if (actions.get(actionId) === action && action.status === "undo_authorizing") {
      action.status = "completed";
      action.updatedAt = new Date();
      try { publish("action.updated", action); } catch { /* Keep denial closed if an observer is faulty. */ }
    }
    return { success: false, error, action, policyDecision };
  };
  const staleReservation = () => {
    if (undoReservations.get(actionId) === reservationToken) {
      if (actions.get(actionId) === action && action.status !== "invalidated" && action.status !== "cancelled" && action.status !== "undone") {
        action.status = "undo_failed";
        action.error = "Undo proposal state changed during verification.";
        action.updatedAt = new Date();
      }
      undoReservations.delete(actionId);
    }
    return { success: false, error: "Action is no longer available for undo.", action };
  };
  try { publish("action.updated", action); }
  catch { return releaseReservation("Undo proposal could not be safely reserved."); }
  if (actions.get(actionId) !== action || undoReservations.get(actionId) !== reservationToken || action.status !== "undo_authorizing" || !lifecycleIsCurrent()) return staleReservation();
  let originalResourceDigest;
  let originalEvidenceDigest;
  let undoInputDigest;
  let deviceIdDigest;
  if (requiresIndependentVerification) {
    try {
      [originalResourceDigest, originalEvidenceDigest, undoInputDigest, deviceIdDigest] = await Promise.all([
        digestReceiptValue(strictResource, "Undo resource"),
        digestReceiptValue(originalVerificationSnapshot.evidence ?? null, "Original verification evidence"),
        digestReceiptValue(undoInput, "Undo target input"),
        digestReceiptValue(action.lifecycle.deviceId, "Undo device id"),
      ]);
    } catch {
      return releaseReservation("Strict undo receipt inputs must remain within the bounded digest size.");
    }
    if (actions.get(actionId) !== action || undoReservations.get(actionId) !== reservationToken || action.status !== "undo_authorizing" || authenticatedAccountId(options.user) !== accountId || !lifecycleIsCurrent()) return staleReservation();
  }
  if (requiresIndependentVerification) {
    let binding;
    const bindingContext = {
      actionId: undoContext.id,
      operationId,
      accountId,
      deviceId: action.lifecycle?.deviceId,
      authorizationEpoch: action.lifecycle?.authorizationEpoch,
      lifecycleExpiresAt: action.lifecycle?.expiresAt,
      capability: undoCapability,
      permission: undoPermission,
      resource: strictResource,
      inputDigest: undoInputDigest,
      input: undoContext.input,
      operation: "undo",
    };
    const bindingRequestedAt = Date.now();
    try {
      binding = await verifyTargetBinding(bindingContext);
    } catch {
      return releaseReservation("The exact computer undo target could not be independently bound.");
    }
    if (actions.get(actionId) !== action || undoReservations.get(actionId) !== reservationToken || action.status !== "undo_authorizing" || authenticatedAccountId(options.user) !== accountId || !lifecycleIsCurrent()) return staleReservation();
    const boundTarget = validateIndependentObservation(binding, bindingContext, bindingRequestedAt);
    if (!boundTarget.valid || boundTarget.snapshot?.verified !== true) {
      return releaseReservation(typeof boundTarget.snapshot?.reason === "string" ? boundTarget.snapshot.reason.slice(0, 300) : "The exact computer undo target could not be independently bound.");
    }
  }
  const mandate = await authorizeActionMandate(strictAction, strictOptions);
  if (!mandate.authorized) {
    return { ...releaseReservation(mandate.reason), mandate };
  }
  if (actions.get(actionId) !== action || undoReservations.get(actionId) !== reservationToken || action.status !== "undo_authorizing" || (requiresIndependentVerification && authenticatedAccountId(options.user) !== accountId) || !lifecycleIsCurrent()) return staleReservation();
  if (requiresIndependentVerification && (typeof mandate.mandateId !== "string" || mandate.mandateId.length > 512)) {
    return releaseReservation("Strict undo mandate result exceeds the receipt size limit.");
  }
  action.status = "undoing";
  action.updatedAt = new Date();
  try {
    publish("action.updated", action);
    if (actions.get(actionId) !== action || undoReservations.get(actionId) !== reservationToken || action.status !== "undoing" || (requiresIndependentVerification && authenticatedAccountId(options.user) !== accountId) || !lifecycleIsCurrent()) return staleReservation();
    const result = await handler(undoInput, undoContext);
    if (actions.get(actionId) !== action || undoReservations.get(actionId) !== reservationToken || action.status !== "undoing" || (requiresIndependentVerification && authenticatedAccountId(options.user) !== accountId) || !lifecycleIsCurrent()) return staleReservation();
    if (requiresIndependentVerification) {
      const observationContext = {
        actionId: strictAction.id,
        operationId,
        accountId,
        deviceId: action.lifecycle?.deviceId,
        authorizationEpoch: action.lifecycle?.authorizationEpoch,
        lifecycleExpiresAt: action.lifecycle?.expiresAt,
        capability: undoContext.tool || undoContext.permission,
        permission: undoPermission,
        resource: strictResource,
        inputDigest: undoInputDigest,
        input: undoInput,
        result,
        operation: "undo",
      };
      const verificationRequestedAt = Date.now();
      const verification = await verifyPostcondition(observationContext);
      const checkedObservation = validateIndependentObservation(verification, observationContext, verificationRequestedAt);
      if (!checkedObservation.valid) throw new Error("Independent undo observation was stale or did not match the exact action context.");
      const verificationSnapshot = checkedObservation.snapshot;
      if (verificationSnapshot?.verified !== true) throw new Error(verificationSnapshot?.reason || "Independent undo verification failed.");
      if (actions.get(actionId) !== action || undoReservations.get(actionId) !== reservationToken || action.status !== "undoing" || authenticatedAccountId(options.user) !== accountId || !lifecycleIsCurrent()) return staleReservation();
      const postconditionEvidenceDigest = await digestReceiptValue(verificationSnapshot.evidence ?? null, "Undo postcondition evidence");
      if (actions.get(actionId) !== action || undoReservations.get(actionId) !== reservationToken || action.status !== "undoing" || authenticatedAccountId(options.user) !== accountId || !lifecycleIsCurrent()) return staleReservation();
      const policyVersion = typeof policyDecision?.policyVersion === "string" && policyDecision.policyVersion.length <= 256
        ? policyDecision.policyVersion
        : null;
      const receipt = freezePlainJson({
        version: 1,
        id: crypto.randomUUID(),
        actionId: strictAction.id,
        accountId,
        deviceIdDigest,
        authorizationEpoch: action.lifecycle.authorizationEpoch,
        lifecycleExpiresAt: action.lifecycle.expiresAt,
        operationId,
        originalCapability,
        originalPermission,
        originalRiskLevel,
        originalAccountId: originalVerificationSnapshot.accountId,
        originalOperationId: originalVerificationSnapshot.operationId,
        originalObserverId: originalVerificationSnapshot.observerId,
        originalObservationId: originalVerificationSnapshot.observationId,
        originalObservedAt: originalVerificationSnapshot.observedAt,
        originalInputDigest: originalVerificationSnapshot.inputDigest,
        originalResourceDigest,
        originalVerificationEvidenceDigest: originalEvidenceDigest,
        originalPostconditionVerified: true,
        reverseCapability: undoCapability,
        reverseOperation: "undo",
        reverseResourceDigest: originalResourceDigest,
        reverseInputDigest: undoInputDigest,
        policyDecision: "allow",
        policyVersion,
        mandate: {
          authorized: true,
          mandateId: mandate.mandateId,
          remainingUses: mandate.remainingUses,
        },
        postcondition: {
          verified: true,
          observerId: verificationSnapshot.observerId,
          observationId: verificationSnapshot.observationId,
          observedAt: verificationSnapshot.observedAt,
          evidenceDigest: postconditionEvidenceDigest,
        },
        issuedAt: new Date().toISOString(),
      });
      if (JSON.stringify(receipt).length > 16 * 1024) throw new Error("Undo receipt exceeds the size limit.");
      Object.defineProperty(action, "undoReceipt", { value: receipt, enumerable: true, writable: false, configurable: false });
    } else if (!result || result.success !== true || result.verified !== true) {
      throw new Error(result?.error || "The undo operation could not be verified.");
    }
    action.status = "undone";
    action.updatedAt = new Date();
    if (undoReservations.get(actionId) === reservationToken) undoReservations.delete(actionId);
    publish("action.updated", action);
    if (actions.get(actionId) !== action || action.status !== "undone") return { success: false, error: "Action is no longer available for undo.", action };
    recordAudit({
      action: "action.undone",
      tool: action.tool,
      status: "completed",
      metadata: {
        actionId,
        receiptId: action.undoReceipt?.id || null,
        operationId: action.undoReceipt?.operationId || null,
        accountId: action.undoReceipt?.accountId || null,
        originalCapability: requiresIndependentVerification ? originalCapability : null,
        originalPermission: requiresIndependentVerification ? originalPermission : null,
        reverseCapability: requiresIndependentVerification ? undoCapability : null,
        resourceDigest: action.undoReceipt?.reverseResourceDigest || null,
        mandateId: action.undoReceipt?.mandate?.mandateId || null,
        originalInputDigest: action.undoReceipt?.originalInputDigest || null,
        originalVerificationEvidenceDigest: action.undoReceipt?.originalVerificationEvidenceDigest || null,
        postconditionEvidenceDigest: action.undoReceipt?.postcondition?.evidenceDigest || null,
        policyVersion: action.undoReceipt?.policyVersion || null,
      },
    });
    return { success: true, action, policyDecision, receipt: action.undoReceipt || null };
  } catch (error) {
    if (actions.get(actionId) !== action || undoReservations.get(actionId) !== reservationToken || action.status !== "undoing" || (requiresIndependentVerification && authenticatedAccountId(options.user) !== accountId) || !lifecycleIsCurrent()) return staleReservation();
    if (undoReservations.get(actionId) === reservationToken) undoReservations.delete(actionId);
    action.status = "undo_failed";
    action.error = error instanceof Error ? error.message : String(error);
    action.updatedAt = new Date();
    publish("action.updated", action);
    recordAudit({ action: "action.undone", tool: action.tool, status: "failed", metadata: { actionId, error: action.error } });
    return { success: false, error: action.error, action };
  }
}

export default { createAction, listActions, getAction, approveAction, executeAction, undoAction, invalidateActionPreviews, clearActions };
