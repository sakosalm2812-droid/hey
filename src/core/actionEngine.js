import { recordAudit } from "./auditLog.js";
import { authorizeExecution } from "./permissionManager.js";
import { publish } from "./eventBus.js";

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

export function approveAction(actionId) {
  const action = getAction(actionId);
  if (!action) return null;
  action.status = "approved";
  action.updatedAt = new Date();
  publish("action.updated", action);
  return action;
}

export async function executeAction(actionId, handler, options = {}) {
  const action = getAction(actionId);
  if (!action) return { success: false, error: "Action not found." };
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
  action.status = "running";
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
  const result = await handler(action.undo, action);
  if (!result || result.success !== true || result.verified !== true) return { success: false, error: result?.error || "The undo operation could not be verified.", action };
  action.status = "undone";
  action.updatedAt = new Date();
  publish("action.updated", action);
  recordAudit({ action: "action.undone", tool: action.tool, status: "completed", metadata: { actionId } });
  return { success: true, action };
}

export default { createAction, listActions, getAction, approveAction, executeAction, undoAction, clearActions };
