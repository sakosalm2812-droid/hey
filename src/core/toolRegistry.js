import { recordAudit } from "./auditLog.js";
import { executeWithPermission, authorizeExecution } from "./permissionManager.js";

const tools = new Map();

function validateInput(input, schema) {
  if (!schema) return null;
  if (schema.type === "object" && (!input || typeof input !== "object" || Array.isArray(input))) {
    return "Tool input must be an object.";
  }

  for (const key of schema.required || []) {
    if (input?.[key] === undefined || input?.[key] === null) return `Missing required input: ${key}`;
  }

  for (const [key, definition] of Object.entries(schema.properties || {})) {
    if (input?.[key] === undefined || !definition.type) continue;
    const typeMatches = definition.type === "array"
      ? Array.isArray(input[key])
      : typeof input[key] === definition.type;
    if (!typeMatches) return `Invalid input type for ${key}. Expected ${definition.type}.`;
  }

  return null;
}

export function registerTool(name, handler, metadata = {}) {
  if (!name || typeof handler !== "function") {
    throw new TypeError("A tool name and function are required.");
  }

  tools.set(name, {
    name,
    handler,
    metadata: {
      capabilities: [],
      permissions: [],
      riskLevel: "low",
      requiresConfirmation: false,
      supportedPlatforms: ["web", "desktop", "mobile"],
      maxRetries: 0,
      ...metadata,
    },
  });
  return tools.get(name);
}

export function unregisterTool(name) {
  return tools.delete(name);
}

export function getTool(name) {
  return tools.get(name) || null;
}

export function listTools() {
  return Array.from(tools.values()).map((tool) =>
    Object.fromEntries(
      Object.entries(tool).filter(([key]) => key !== "handler")
    )
  );
}

export async function executeTool(name, input, context = {}) {
  const tool = getTool(name);
  const requestId = context.requestId || crypto.randomUUID();
  if (!tool) {
    return { success: false, result: null, error: `Tool not found: ${name}`, metadata: { requestId } };
  }

  const metadata = tool.metadata;
  const inputError = validateInput(input, metadata.inputSchema);
  if (inputError) {
    recordAudit({ action: "tool.rejected", tool: name, status: "failed", requestId, metadata: { reason: inputError } });
    return { success: false, result: null, error: inputError, metadata: { requestId, source: "tool_registry" } };
  }

  const permission = metadata.permission || metadata.permissions?.[0];
  const authorizationContext = {
    user: context.user || context.session?.user || context.account || null,
    capability: metadata.capabilities?.[0] || permission,
    permission,
    riskLevel: metadata.riskLevel || "low",
    requiresConfirmation: metadata.requiresConfirmation === true,
    confirmed: context.confirmed === true,
    clientPlan: context.clientPlan || context.plan,
    clientEntitlements: context.clientEntitlements || context.entitlements,
  };

  const authResult = authorizeExecution(authorizationContext);

  if (!authResult.authorized) {
    recordAudit({
      action: "tool.authorization_blocked",
      tool: name,
      riskLevel: metadata.riskLevel || "low",
      status: authResult.requiresConfirmation ? "awaiting_confirmation" : "denied",
      requestId,
      metadata: { reason: authResult.reason, decision: authResult.decision, capability: authResult.capability },
    });
    return {
      success: false,
      result: null,
      error: authResult.reason,
      requiresConfirmation: authResult.requiresConfirmation || false,
      requiresPermission: authResult.requiresConfirmation || false,
      status: authResult.requiresConfirmation ? "permission_required" : "denied",
      authorization: authResult,
      metadata: { requestId, source: metadata.source || "tool_registry", confidence: 0 },
    };
  }

  if (permission) {
    const permissionResult = await executeWithPermission({
      permission,
      scope: context.permissionScope || "account",
      riskLevel: metadata.riskLevel,
      reason: metadata.confirmationReason || `Execute ${name}`,
      confirmed: context.confirmed === true,
      user: context.user || context.session?.user || context.account || null,
      capability: metadata.capabilities?.[0] || permission,
      clientPlan: context.clientPlan || context.plan,
      clientEntitlements: context.clientEntitlements || context.entitlements,
    }, () => runWithRetries(tool, input, { ...context, requestId }));

    if (permissionResult.result && typeof permissionResult.result === "object") {
      return {
        ...permissionResult.result,
        request: permissionResult.request,
        authorization: authResult,
        metadata: { ...permissionResult.result.metadata, requestId, source: metadata.source || "tool_registry" },
      };
    }

    return {
      success: permissionResult.success,
      result: null,
      error: permissionResult.error || null,
      requiresConfirmation: permissionResult.requiresConfirmation || false,
      request: permissionResult.request,
      authorization: authResult,
      metadata: { requestId, source: metadata.source || "tool_registry", confidence: 0 },
    };
  }

  return runWithRetries(tool, input, { ...context, requestId });
}

async function runWithRetries(tool, input, context) {
  const maxRetries = Math.max(0, Math.min(3, Number(tool.metadata.maxRetries) || 0));
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const result = await tool.handler(input, context);
      if (result?.success === false) {
        const retryable = isTransientFailure(result);
        recordAudit({ action: "tool.failed", tool: tool.name, status: "failed", requestId: context.requestId, metadata: { attempt, error: result.error || "Tool reported failure.", verified: Boolean(result.verified), retryable } });
        if (retryable && attempt < maxRetries) continue;
        return {
          success: false,
          result: null,
          error: result.error || "Tool reported failure.",
          metadata: { requestId: context.requestId, attempts: attempt + 1, source: tool.metadata.source || "tool_registry", confidence: 0, verified: Boolean(result.verified), retryable },
        };
      }
      recordAudit({ action: "tool.executed", tool: tool.name, status: "completed", requestId: context.requestId, metadata: { attempt } });
      return {
        success: true,
        result,
        error: null,
        metadata: { requestId: context.requestId, attempt: attempt + 1, source: tool.metadata.source || "tool_registry", confidence: 1 },
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (!isTransientFailure(error) || attempt >= maxRetries) break;
    }
  }

  recordAudit({ action: "tool.failed", tool: tool.name, status: "failed", requestId: context.requestId, metadata: { attempts: maxRetries + 1, error: lastError } });
  return {
    success: false,
    result: null,
    error: lastError,
    metadata: { requestId: context.requestId, attempts: maxRetries + 1, source: tool.metadata.source || "tool_registry", confidence: 0 },
  };
}

function isTransientFailure(value) {
  if (!value) return false;
  if (value.transient === true || value.retryable === true) return true;
  const status = Number(value.status || value.statusCode || value.code);
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export default {
  registerTool,
  unregisterTool,
  getTool,
  listTools,
  executeTool,
};
