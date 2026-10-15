import { recordAudit } from "./auditLog.js";
import { executeWithPermission, authorizeExecution } from "./permissionManager.js";
import { CAPABILITY_STATUS, getCapabilityAvailability } from "./capabilityRegistry.js";

const tools = new Map();

function cloneMetadata(metadata) {
  return cloneMetadataValue(metadata, new WeakSet());
}

function cloneMetadataValue(value, ancestors) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (typeof value !== "object") throw new TypeError("Tool metadata must contain only plain data values.");
  if (ancestors.has(value)) throw new TypeError("Tool metadata cannot contain cycles.");

  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) throw new TypeError("Tool metadata arrays must be plain arrays.");
    ancestors.add(value);
    const result = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor)) throw new TypeError("Tool metadata arrays cannot be sparse or use accessors.");
      result.push(cloneMetadataValue(descriptor.value, ancestors));
    }
    for (const key of Reflect.ownKeys(value)) {
      if (key !== "length" && !(typeof key === "string" && /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length)) {
        throw new TypeError("Tool metadata arrays cannot contain custom properties.");
      }
    }
    ancestors.delete(value);
    return result;
  }

  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Tool metadata must contain only plain objects and arrays.");
  }

  ancestors.add(value);
  const result = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new TypeError("Tool metadata cannot contain symbol keys.");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) throw new TypeError("Tool metadata cannot contain accessors.");
    Object.defineProperty(result, key, {
      value: cloneMetadataValue(descriptor.value, ancestors),
      enumerable: descriptor.enumerable,
      writable: true,
      configurable: true,
    });
  }
  ancestors.delete(value);
  return result;
}

function freezeRecursively(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((nested) => freezeRecursively(nested, seen));
  return Object.freeze(value);
}

function describeTool(tool) {
  if (!tool) return null;
  return Object.freeze({
    name: tool.name,
    metadata: freezeRecursively(cloneMetadata(tool.metadata)),
  });
}

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

  const registered = Object.freeze({
    name,
    handler,
    metadata: freezeRecursively({
      capabilities: [],
      permissions: [],
      riskLevel: "low",
      requiresConfirmation: false,
      supportedPlatforms: ["web", "desktop", "mobile"],
      maxRetries: 0,
      ...cloneMetadata(metadata),
    }),
  });
  tools.set(name, registered);
  return describeTool(registered);
}

export function unregisterTool(name) {
  return tools.delete(name);
}

export function getTool(name) {
  return describeTool(tools.get(name));
}

export function listTools() {
  return Array.from(tools.values(), describeTool);
}

/**
 * Return a handler-free, policy-derived view for Tool Library discovery.
 * A registered handler is not evidence that its declared capability is
 * available on the requested platform; only the capability registry (and an
 * explicitly supplied adapter) can establish that.
 */
export function listToolCatalog({ platform = "web", adapter = null } = {}) {
  return Array.from(tools.values(), (tool) => {
    const capabilities = Array.isArray(tool.metadata.capabilities)
      ? tool.metadata.capabilities
      : [];
    const capabilityAvailability = capabilities.map((capability) => {
      if (typeof capability !== "string" || !capability.trim()) {
        return {
          capability: null,
          platform,
          status: CAPABILITY_STATUS.unsupported,
          available: false,
          error: "Tool capability declaration is invalid.",
        };
      }
      return getCapabilityAvailability(capability, platform, adapter);
    });
    const statuses = capabilityAvailability.map(({ status }) => status);
    let status = "unsupported";
    if (statuses.length > 0) {
      if (statuses.includes(CAPABILITY_STATUS.restricted)) status = CAPABILITY_STATUS.restricted;
      else if (statuses.every((value) => value === CAPABILITY_STATUS.supported)) status = CAPABILITY_STATUS.supported;
      else if (statuses.every((value) => value === CAPABILITY_STATUS.supported || value === CAPABILITY_STATUS.permissionRequired)) status = CAPABILITY_STATUS.permissionRequired;
    }

    return Object.freeze({
      name: tool.name,
      status,
      available: status === CAPABILITY_STATUS.supported,
      platform,
      capabilities: Object.freeze(capabilityAvailability.map((availability) => Object.freeze({ ...availability }))),
      permissions: Object.freeze(Array.isArray(tool.metadata.permissions)
        ? [...tool.metadata.permissions]
        : tool.metadata.permission ? [tool.metadata.permission] : []),
      riskLevel: tool.metadata.riskLevel,
      requiresConfirmation: tool.metadata.requiresConfirmation === true,
      lifecycle: "registered",
    });
  });
}

export async function executeTool(name, input, context = {}) {
  const tool = tools.get(name) || null;
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
  listToolCatalog,
  executeTool,
};
