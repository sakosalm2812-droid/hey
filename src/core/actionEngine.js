import { recordAudit } from "./auditLog.js";
import { authorizeExecution } from "./permissionManager.js";
import { publish } from "./eventBus.js";
import { verifyAndConsumeMandate } from "./actionMandate.js";

const actions = new Map();

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
    return await verifyAndConsumeMandate(options.mandate, {
      accountId: options.user?.id || options.user?.userId || options.user?.accountId,
      action: action.tool || action.permission,
      resource: options.resource || action.permission,
      idempotencyKey: options.idempotencyKey || action.id,
      currentRevocationEpoch: options.currentRevocationEpoch,
    }, {
      trustedKeys: options.trustedMandateKeys,
      store: options.mandateStore,
      now: options.now,
      online: options.online,
    });
  } catch {
    return { authorized: false, reason: "Mandate verification failed; execution was denied." };
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
  const mandate = await verifyActionMandate(action, options);
  if (!mandate.authorized) return { success: false, error: mandate.reason, action, mandate };
  // Mandate verification is asynchronous; reserve the action only after it
  // completes, then re-check admission to prevent concurrent double dispatch.
  if (action.status !== "queued" && action.status !== "approved") {
    return { success: false, error: `Action cannot execute from ${action.status} state.`, action };
  }
  if (typeof handler !== "function") return { success: false, error: "No action handler registered." };
  action.status = "running";
  action.updatedAt = new Date();
  publish("action.updated", action);
  try {
    action.result = await handler(action.input, action);
    if (!action.result || action.result.success !== true || action.result.verified !== true) {
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
    const result = await handler(action.undo, action);
    if (!result || result.success !== true || result.verified !== true) {
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
