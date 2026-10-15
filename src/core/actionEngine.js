import { recordAudit } from "./auditLog.js";
import { authorizeExecution } from "./permissionManager.js";
import { publish } from "./eventBus.js";
import supabaseClient from "../lib/supabase.js";

const actions = new Map();

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

export function clearActions() {
  for (const action of actions.values()) action.status = "cancelled";
  actions.clear();
}

export function createAction(input = {}) {
  const action = { id: crypto.randomUUID(), title: String(input.title || "Untitled action"), tool: input.tool || null, input: input.input || {}, permission: input.permission || input.tool || "general", riskLevel: input.riskLevel || "medium", status: "queued", undo: input.undo || null, createdAt: new Date(), updatedAt: new Date() };
  actions.set(action.id, action);
  publish("action.updated", action);
  recordAudit({ action: "action.created", tool: action.tool, riskLevel: action.riskLevel, status: "queued", metadata: { actionId: action.id } });
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
        action: action.tool || action.permission,
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
  const requiresIndependentVerification = options.requireIndependentVerification === true;
  if (requiresIndependentVerification) {
    if (!options.requireMandate || typeof options.verifyTargetBinding !== "function" || typeof options.verifyPostcondition !== "function" || typeof options.resource !== "string" || !options.resource.trim()) {
      return { success: false, error: "Target binding, independent verification, a signed mandate, and an exact resource target are required." };
    }
  }
  // Snapshot before mandate verification yields to asynchronous storage/network
  // work; callers cannot retarget an admitted action while authority is checked.
  let executionInput = action.input;
  if (requiresIndependentVerification) {
    try { executionInput = freezePlainJson(copyPlainJson(action.input)); }
    catch { return { success: false, error: "Strict computer action input must be bounded plain JSON data.", action }; }
  }
  const executionContext = requiresIndependentVerification
    ? Object.freeze({ id: action.id, tool: action.tool, permission: action.permission, resource: options.resource, input: executionInput })
    : action;
  if (requiresIndependentVerification) {
    let binding;
    try {
      binding = await options.verifyTargetBinding({ actionId: executionContext.id, capability: executionContext.tool || executionContext.permission, resource: executionContext.resource, input: executionContext.input });
    } catch {
      return { success: false, error: "The exact computer-control target could not be independently bound.", action };
    }
    if (binding?.verified !== true) {
      return { success: false, error: binding?.reason || "The exact computer-control target could not be independently bound.", action };
    }
  }
  if (action.status !== "queued" && action.status !== "approved") {
    return { success: false, error: `Action cannot execute from ${action.status} state.`, action };
  }
  const mandate = await verifyActionMandate(action, options);
  if (!mandate.authorized) return { success: false, error: mandate.reason, action, mandate };
  // Mandate verification is asynchronous; reserve the action only after it
  // completes, then re-check admission to prevent concurrent double dispatch.
  if (action.status !== "queued" && action.status !== "approved") {
    return { success: false, error: `Action cannot execute from ${action.status} state.`, action };
  }
  action.status = "running";
  action.updatedAt = new Date();
  publish("action.updated", action);
  try {
    action.result = await handler(executionInput, executionContext);
    if (requiresIndependentVerification) {
      const verification = await options.verifyPostcondition({
        actionId: action.id,
        capability: executionContext.tool || executionContext.permission,
        resource: options.resource,
        input: executionInput,
        result: action.result,
      });
      if (verification?.verified !== true) {
        throw new Error(verification?.reason || "Independent postcondition verification failed.");
      }
      action.verification = { verified: true, resource: options.resource, evidence: copyPlainJson(verification.evidence ?? null) };
    } else if (!action.result || action.result.success !== true || action.result.verified !== true) {
      throw new Error(action.result?.error || "The action could not be verified.");
    }
    action.status = "completed";
    action.updatedAt = new Date();
    publish("action.updated", action);
    recordAudit({ action: "action.executed", tool: action.tool, riskLevel: action.riskLevel, status: "completed", metadata: { actionId } });
    return { success: true, action };
  } catch (error) {
    action.status = "failed";
    action.error = error instanceof Error ? error.message : String(error);
    publish("action.updated", action);
    recordAudit({ action: "action.executed", tool: action.tool, riskLevel: action.riskLevel, status: "failed", metadata: { actionId, error: action.error } });
    return { success: false, error: action.error, action };
  }
}

export async function undoAction(actionId, handler, options = {}) {
  const action = getAction(actionId);
  if (!action || action.status !== "completed" || typeof handler !== "function") return { success: false, error: "Action cannot be undone." };
  const authorization = authorizeExecution({
    user: options.user,
    capability: action.tool || action.permission,
    permission: action.permission,
    riskLevel: action.riskLevel,
    requiresConfirmation: true,
    confirmed: options.confirmed === true,
  });
  if (!authorization.authorized) return { success: false, requiresConfirmation: authorization.requiresConfirmation, error: authorization.reason, action, authorization };
  if (options.requireIndependentVerification === true
    && (!options.requireMandate || typeof options.verifyTargetBinding !== "function" || typeof options.verifyPostcondition !== "function" || typeof options.resource !== "string" || !options.resource.trim())) {
    return { success: false, error: "Target binding, independent verification, a signed mandate, and an exact resource target are required.", action };
  }
  let undoInput = action.undo;
  let undoContext = action;
  if (options.requireIndependentVerification === true) {
    try { undoInput = freezePlainJson(copyPlainJson(action.undo)); }
    catch { return { success: false, error: "Strict computer undo input must be bounded plain JSON data.", action }; }
    undoContext = Object.freeze({ id: action.id, tool: action.tool, permission: action.permission, resource: options.resource, input: undoInput });
    let binding;
    try {
      binding = await options.verifyTargetBinding({ actionId: undoContext.id, capability: undoContext.tool || undoContext.permission, resource: undoContext.resource, input: undoContext.input, operation: "undo" });
    } catch {
      return { success: false, error: "The exact computer undo target could not be independently bound.", action };
    }
    if (binding?.verified !== true) {
      return { success: false, error: binding?.reason || "The exact computer undo target could not be independently bound.", action };
    }
  }
  action.status = "undo_authorizing";
  action.updatedAt = new Date();
  const mandate = await verifyActionMandate(action, options);
  if (!mandate.authorized) {
    action.status = "completed";
    action.updatedAt = new Date();
    return { success: false, error: mandate.reason, action, mandate };
  }
  action.status = "undoing";
  action.updatedAt = new Date();
  publish("action.updated", action);
  try {
    const result = await handler(undoInput, undoContext);
    if (options.requireIndependentVerification === true) {
      const verification = await options.verifyPostcondition({ actionId: action.id, capability: undoContext.tool || undoContext.permission, resource: options.resource, input: undoInput, result, operation: "undo" });
      if (verification?.verified !== true) throw new Error(verification?.reason || "Independent undo verification failed.");
    } else if (!result || result.success !== true || result.verified !== true) {
      throw new Error(result?.error || "The undo operation could not be verified.");
    }
    action.status = "undone";
    action.updatedAt = new Date();
    publish("action.updated", action);
    recordAudit({ action: "action.undone", tool: action.tool, status: "completed", metadata: { actionId } });
    return { success: true, action };
  } catch (error) {
    action.status = "undo_failed";
    action.error = error instanceof Error ? error.message : String(error);
    action.updatedAt = new Date();
    publish("action.updated", action);
    recordAudit({ action: "action.undone", tool: action.tool, status: "failed", metadata: { actionId, error: action.error } });
    return { success: false, error: action.error, action };
  }
}

export default { createAction, listActions, getAction, approveAction, executeAction, undoAction, clearActions };
