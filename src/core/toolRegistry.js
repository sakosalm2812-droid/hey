import { recordAudit } from "./auditLog.js";
import { executeWithPermission, authorizeExecution, hasPermission } from "./permissionManager.js";
import { CAPABILITY_STATUS, getCapabilityAvailability } from "./capabilityRegistry.js";
import { getAccountScope, subscribeAccountScope } from "./accountScope.js";
import { createToolLibraryPreferenceStore } from "./toolLibraryPreferences.js";
import { normalizeToolSchema, snapshotToolData, validateToolValue } from "./toolSchemas.js";

const tools = new Map();
const activeToolSessions = new Map();
const toolSessionActivity = new Map();
const MAX_TOOL_ACTIVITY = 50;
const MAX_ACTIVITY_ACCOUNTS = 64;
const LIFECYCLE_START_CALLBACK = Symbol("lifecycleStartCallback");
const invocationPlans = new WeakMap();
export const toolLibraryPreferenceStore = createToolLibraryPreferenceStore({
  isToolRegistered: (name) => tools.has(name),
});

subscribeAccountScope((previousScope) => {
  const previousAccountId = typeof previousScope === "string" && previousScope.startsWith("account:")
    ? previousScope.slice("account:".length)
    : null;
  if (!previousAccountId) return;
  for (const [key, session] of activeToolSessions) {
    if (session.accountId !== previousAccountId) continue;
    session.controller.abort(new Error("Account scope changed."));
    activeToolSessions.delete(key);
  }
  toolSessionActivity.delete(previousAccountId);
});

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

function registerToolWithOwner(name, handler, metadata, ownerToken = null) {
  if (!name || typeof handler !== "function") {
    throw new TypeError("A tool name and function are required.");
  }
  const existing = tools.get(name);
  if (existing) {
    if (ownerToken && existing.ownerToken === ownerToken && existing.handler === handler) {
      return describeTool(existing);
    }
    throw new Error(`Tool is already registered: ${name}. Unregister it before registering a replacement.`);
  }

  const safeMetadata = cloneMetadata(metadata);
  if (safeMetadata.inputSchema !== undefined) safeMetadata.inputSchema = normalizeToolSchema(safeMetadata.inputSchema);
  if (safeMetadata.outputSchema !== undefined) safeMetadata.outputSchema = normalizeToolSchema(safeMetadata.outputSchema);
  const lifecycle = safeMetadata.lifecycle;
  if (lifecycle !== undefined && (!lifecycle || typeof lifecycle !== "object" || Array.isArray(lifecycle))) {
    throw new TypeError("Tool lifecycle metadata must be a plain object.");
  }
  if (lifecycle && Object.keys(lifecycle).some((key) => !["start", "stop"].includes(key))) {
    throw new TypeError("Tool lifecycle metadata contains an unsupported action.");
  }
  if (lifecycle?.stop === true && lifecycle.start !== true) {
    throw new TypeError("A stoppable tool must also declare start support.");
  }
  if (lifecycle && Object.values(lifecycle).some((supported) => typeof supported !== "boolean")) {
    throw new TypeError("Tool lifecycle support declarations must be booleans.");
  }

  const registered = Object.freeze({
    name,
    handler,
    ownerToken,
    metadata: freezeRecursively({
      capabilities: [],
      permissions: [],
      riskLevel: "low",
      requiresConfirmation: false,
      supportedPlatforms: ["web", "desktop", "mobile"],
      maxRetries: 0,
      ...safeMetadata,
    }),
  });
  tools.set(name, registered);
  return describeTool(registered);
}

export function registerTool(name, handler, metadata = {}) {
  return registerToolWithOwner(name, handler, metadata);
}

/** Register a module-owned tool idempotently without adopting a colliding registration. */
export function registerOwnedTool(name, handler, metadata, ownerToken) {
  if (!ownerToken || (typeof ownerToken !== "object" && typeof ownerToken !== "function")) {
    throw new TypeError("An opaque tool owner token is required.");
  }
  return registerToolWithOwner(name, handler, metadata, ownerToken);
}

export function unregisterTool(name) {
  for (const [key, session] of activeToolSessions) {
    if (session.name === name) {
      session.controller.abort(new Error("Tool was unregistered."));
      activeToolSessions.delete(key);
    }
  }
  return tools.delete(name);
}

const MAX_INVOCATION_STEPS = 8;
const MAX_INVOCATION_BINDINGS = 16;

/** Capture a bounded, typed multi-tool plan. Execution always uses the canonical library path. */
export function createToolInvocationPlan(steps) {
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > MAX_INVOCATION_STEPS) {
    throw new TypeError(`A plan must contain between 1 and ${MAX_INVOCATION_STEPS} steps.`);
  }
  steps = snapshotToolData(steps, "Invocation plan");
  const stepIds = new Set();
  const snapshots = [];
  let bindingCount = 0;
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (!step || typeof step !== "object" || Array.isArray(step) ||
        Object.keys(step).some((key) => !["id", "toolName", "input", "bindings"].includes(key))) {
      throw new TypeError("Plan steps must contain only id, toolName, input, and bindings.");
    }
    const { id, toolName } = step;
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/u.test(id) || stepIds.has(id)) throw new TypeError("Plan step ids must be unique bounded identifiers.");
    if (typeof toolName !== "string" || !tools.has(toolName)) throw new TypeError(`Plan tool is not registered: ${toolName}.`);
    const tool = tools.get(toolName);
    const schema = tool.metadata.inputSchema;
    if (!schema) throw new TypeError(`Tool ${toolName} does not declare a typed input schema.`);
    const input = snapshotToolData(step.input, `Input for ${toolName}`);
    const bindings = step.bindings === undefined ? [] : step.bindings;
    if (!Array.isArray(bindings)) throw new TypeError("Plan bindings must be an array.");
    bindingCount += bindings.length;
    if (bindingCount > MAX_INVOCATION_BINDINGS) throw new TypeError("Plan contains too many bindings.");
    const safeBindings = bindings.map((binding) => {
      if (!binding || typeof binding !== "object" || Array.isArray(binding) ||
          Object.keys(binding).some((key) => !["fromStepId", "fromField", "toField"].includes(key))) {
        throw new TypeError("Bindings must contain only fromStepId, fromField, and toField.");
      }
      const sourceIndex = snapshots.findIndex((candidate) => candidate.id === binding.fromStepId);
      if (sourceIndex < 0 || typeof binding.fromField !== "string" || typeof binding.toField !== "string") {
        throw new TypeError("Bindings must reference an earlier step and declared fields.");
      }
      const sourceSchema = snapshots[sourceIndex].tool.metadata.outputSchema;
      const sourceField = sourceSchema?.type === "object" ? sourceSchema.properties[binding.fromField] : null;
      const targetField = schema.type === "object" ? schema.properties[binding.toField] : null;
      if (!sourceField || !targetField || !["string", "number", "integer", "boolean", "null"].includes(sourceField.type) ||
          sourceField.type !== targetField.type || Object.hasOwn(input, binding.toField)) {
        throw new TypeError("Binding fields must be unset scalar fields with matching declared types.");
      }
      return Object.freeze({ fromStepId: binding.fromStepId, fromField: binding.fromField, toField: binding.toField });
    });
    const boundFields = new Set(safeBindings.map(({ toField }) => toField));
    if (boundFields.size !== safeBindings.length) throw new TypeError("Each destination field can have only one binding.");
    const validationSchema = boundFields.size && schema.type === "object"
      ? { ...schema, required: schema.required.filter((key) => !boundFields.has(key)) }
      : schema;
    const inputError = validateToolValue(input, validationSchema, `Input for ${toolName}`);
    if (inputError) throw new TypeError(inputError);
    stepIds.add(id);
    snapshots.push({ id, toolName, tool, input, bindings: safeBindings });
  }
  const plan = Object.freeze({ stepCount: snapshots.length, stepIds: Object.freeze(snapshots.map(({ id }) => id)) });
  invocationPlans.set(plan, snapshots);
  return plan;
}

export async function executeToolInvocationPlan(plan, context = {}) {
  const steps = invocationPlans.get(plan);
  if (!steps) return { success: false, status: "invalid_plan", error: "Invocation plan is invalid or was not created by this registry.", completed: [], results: [] };
  const byId = new Map();
  const results = [];
  for (const step of steps) {
    if (tools.get(step.toolName) !== step.tool) {
      return { success: false, status: "stale_registration", failedStepId: step.id, error: `Tool registration changed for ${step.toolName}.`, completed: results.map(({ stepId }) => stepId), results };
    }
    const input = snapshotToolData(step.input, `Input for ${step.toolName}`);
    for (const binding of step.bindings) {
      const source = byId.get(binding.fromStepId);
      if (!source || !source.output || !Object.hasOwn(source.output, binding.fromField)) {
        return { success: false, status: "binding_failed", failedStepId: step.id, error: "A declared output binding was unavailable.", completed: results.map(({ stepId }) => stepId), results };
      }
      input[binding.toField] = source.output[binding.fromField];
    }
    const inputError = validateToolValue(input, step.tool.metadata.inputSchema, `Input for ${step.toolName}`);
    if (inputError) return { success: false, status: "binding_failed", failedStepId: step.id, error: inputError, completed: results.map(({ stepId }) => stepId), results };
    const result = await runToolLibraryEntry(step.toolName, input, context);
    results.push({ stepId: step.id, success: result?.success === true, status: result?.status || (result?.success ? "completed" : "failed"), result: result?.result ?? null, error: result?.error || null });
    if (!result?.success) return { success: false, status: result?.status || "failed", failedStepId: step.id, error: result?.error || "Tool invocation failed.", completed: results.slice(0, -1).map(({ stepId }) => stepId), results };
    byId.set(step.id, { output: result.result });
  }
  return { success: true, status: "completed", completed: results.map(({ stepId }) => stepId), results };
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
      description: typeof tool.metadata.description === "string" ? tool.metadata.description : "",
      category: typeof tool.metadata.category === "string" ? tool.metadata.category : "general",
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

/** Search the handler-free Tool Library catalog. Search never executes tools. */
export function searchToolCatalog(query = "", options = {}) {
  if (typeof query !== "string") throw new TypeError("Tool Library search query must be a string.");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const category = typeof options.category === "string" ? options.category.trim().toLocaleLowerCase() : "";
  return listToolCatalog(options).filter((tool) => {
    const matchesCategory = !category || tool.category.toLocaleLowerCase() === category;
    if (!matchesCategory) return false;
    if (!normalizedQuery) return true;
    return `${tool.name} ${tool.description} ${tool.category}`.toLocaleLowerCase().includes(normalizedQuery);
  });
}

/**
 * Run a discovered tool through the existing permission and execution engine.
 * Catalog support is checked again at the action boundary to avoid trusting a
 * stale UI result, a tool handler alone, or caller-supplied permission claims.
 */
export async function runToolLibraryEntry(name, input, context = {}) {
  const tool = tools.get(name);
  const requestId = context.requestId || crypto.randomUUID();
  const fail = (error, status = "unavailable") => ({
    success: false,
    result: null,
    error,
    status,
    metadata: { requestId, source: "tool_library" },
  });
  if (!tool) return fail(`Tool not found: ${name}`, "not_found");

  const declaredCapabilities = tool.metadata.capabilities;
  const permission = tool.metadata.permission || tool.metadata.permissions?.[0];
  if (!Array.isArray(declaredCapabilities) || declaredCapabilities.length === 0) {
    return fail("Tool has no registered capability and cannot be run from the Tool Library.");
  }
  if (typeof permission !== "string" || !permission.trim()) {
    return fail("Tool has no account permission requirement and cannot be run from the Tool Library.");
  }

  const catalogEntry = listToolCatalog({ platform: context.platform || "web", adapter: context.adapter || null })
    .find((entry) => entry.name === name);
  if (!catalogEntry || catalogEntry.status !== CAPABILITY_STATUS.supported) {
    const status = catalogEntry?.status || CAPABILITY_STATUS.unsupported;
    const capabilityError = catalogEntry?.capabilities.find((item) => item.status !== CAPABILITY_STATUS.supported)?.error;
    return fail(capabilityError || `Tool ${name} is ${status} on ${context.platform || "web"}.`, status);
  }

  const user = context.user || context.session?.user || context.account || null;
  const accountId = user?.id || user?.userId || user?.accountId || null;
  if (!accountId || !hasPermission(permission, "account", accountId)) {
    return fail(`Missing canonical account permission: ${permission}.`, "denied");
  }

  // The single execution path owns identity, account permission, entitlement,
  // confirmation, audit, and handler invocation checks.
  const result = await executeTool(name, input, { ...context, permissionScope: "account" });
  if (result?.success) {
    // Recents are optional local preferences; a write failure must not change
    // the result of an already authorized tool execution.
    toolLibraryPreferenceStore.recordRecent(name, { accountId: String(accountId) });
  }
  return result;
}

function resolveToolAccount(context = {}) {
  const user = context.user || context.session?.user || context.account || null;
  const accountId = user?.id || user?.userId || user?.accountId || null;
  if (!accountId) return null;
  const normalizedAccountId = String(accountId);
  return getAccountScope() === `account:${normalizedAccountId}` ? { user, accountId: normalizedAccountId } : null;
}

function sessionKey(accountId, name) {
  return JSON.stringify([accountId, name]);
}

function appendToolActivity(accountId, activity) {
  const activityList = toolSessionActivity.get(accountId) || [];
  activityList.unshift(Object.freeze({ ...activity, accountId }));
  activityList.length = Math.min(activityList.length, MAX_TOOL_ACTIVITY);
  toolSessionActivity.delete(accountId);
  toolSessionActivity.set(accountId, activityList);
  while (toolSessionActivity.size > MAX_ACTIVITY_ACCOUNTS) {
    const oldestAccountId = toolSessionActivity.keys().next().value;
    toolSessionActivity.delete(oldestAccountId);
  }
}

/**
 * Start an explicitly lifecycle-enabled registered tool as an account-bound
 * run. The run still passes through the same capability and permission path
 * as `runToolLibraryEntry`; no package installation or background service is
 * implied by this operation.
 */
export function startToolLibraryEntry(name, input, context = {}) {
  const tool = tools.get(name);
  const identity = resolveToolAccount(context);
  if (!tool) return { success: false, status: "not_found", error: `Tool not found: ${name}` };
  if (tool.metadata.lifecycle?.start !== true) {
    return { success: false, status: "unsupported", error: `Tool ${name} does not supply start behavior.` };
  }
  if (!identity) return { success: false, status: "denied", error: "Authenticated account identity is required." };

  const permission = tool.metadata.permission || tool.metadata.permissions?.[0];
  if (!permission || !hasPermission(permission, "account", identity.accountId)) {
    return { success: false, status: "denied", error: "Canonical account permission is required to start this tool." };
  }
  const catalogEntry = listToolCatalog({ platform: context.platform || "web", adapter: context.adapter || null }).find((entry) => entry.name === name);
  if (catalogEntry?.status !== CAPABILITY_STATUS.supported) {
    return { success: false, status: catalogEntry?.status || CAPABILITY_STATUS.unsupported, error: `Tool ${name} is not supported on ${context.platform || "web"}.` };
  }

  const key = sessionKey(identity.accountId, name);
  const current = activeToolSessions.get(key);
  if (current && ["starting", "running", "stopping"].includes(current.status)) {
    return { success: false, status: "conflict", error: "This account already has an active run for this tool." };
  }

  const id = crypto.randomUUID();
  const controller = new AbortController();
  const session = { id, name, accountId: identity.accountId, status: "starting", startedAt: new Date().toISOString(), controller, result: null };
  activeToolSessions.set(key, session);
  appendToolActivity(identity.accountId, { id, name, status: "starting", at: session.startedAt });

  // Save the promise before yielding so concurrent starts see the active run.
  session.promise = runToolLibraryEntry(name, input, {
    ...context,
    signal: controller.signal,
    [LIFECYCLE_START_CALLBACK]: () => {
      if (activeToolSessions.get(key) === session && session.status === "starting" && !controller.signal.aborted) {
        session.status = "running";
        appendToolActivity(identity.accountId, { id, name, status: "running", at: new Date().toISOString() });
      }
    },
  });
  session.promise.then((result) => {
      // Ignore stale completions after unregister/re-register or replacement.
      if (activeToolSessions.get(key) !== session) return;
      session.result = result;
      const cancellationReported = result?.status === "cancelled" || /cancel|abort/i.test(result?.error || "");
      session.status = controller.signal.aborted
        ? result?.success ? "completed_after_stop" : cancellationReported ? "cancelled" : "failed_after_stop"
        : result?.success ? "completed" : "failed";
      session.finishedAt = new Date().toISOString();
      appendToolActivity(identity.accountId, { id, name, status: session.status, at: session.finishedAt });
    }, (error) => {
      if (activeToolSessions.get(key) !== session) return;
      const message = error instanceof Error ? error.message : String(error);
      session.status = controller.signal.aborted
        ? /cancel|abort/i.test(message) ? "cancelled" : "failed_after_stop"
        : "failed";
      session.result = { success: false, error: message };
      session.finishedAt = new Date().toISOString();
      appendToolActivity(identity.accountId, { id, name, status: session.status, at: session.finishedAt });
    });

  return { success: true, status: "starting", sessionId: id, name };
}

/** Stop a cooperative run owned by the authenticated account. A handler that
 * ignores AbortSignal remains `stopping` until it settles; it is never falsely
 * reported as stopped. */
export function stopToolLibraryEntry(name, sessionId, context = {}) {
  const tool = tools.get(name);
  const identity = resolveToolAccount(context);
  if (!tool) return { success: false, status: "not_found", error: `Tool not found: ${name}` };
  if (tool.metadata.lifecycle?.stop !== true) {
    return { success: false, status: "unsupported", error: `Tool ${name} does not supply stop behavior.` };
  }
  if (!identity) return { success: false, status: "denied", error: "Authenticated account identity is required." };
  const key = sessionKey(identity.accountId, name);
  const session = activeToolSessions.get(key);
  if (!session || session.id !== sessionId) return { success: false, status: "not_found", error: "Active tool run not found for this account." };
  if (!["starting", "running"].includes(session.status)) {
    return { success: false, status: session.status, error: "Tool run is no longer stoppable." };
  }
  session.status = "stopping";
  session.controller.abort(new Error("Tool run stopped by account request."));
  appendToolActivity(identity.accountId, { id: session.id, name, status: "stopping", at: new Date().toISOString() });
  return { success: true, status: "stopping", sessionId: session.id };
}

/** Status, Help, and Permissions are derived only from registered metadata;
 * Activity is account-filtered in-memory history from this registry. */
export function getToolLifecycleContract(name, context = {}) {
  const tool = tools.get(name);
  if (!tool) return { success: false, status: "not_found", error: `Tool not found: ${name}` };
  const identity = resolveToolAccount(context);
  if (!identity) return { success: false, status: "denied", error: "Authenticated account identity is required." };
  let platform = "web";
  try {
    const platformDescriptor = Object.getOwnPropertyDescriptor(context, "platform");
    if (platformDescriptor) {
      if (!Object.hasOwn(platformDescriptor, "value") || typeof platformDescriptor.value !== "string" || !platformDescriptor.value.trim() || platformDescriptor.value.length > 32) {
        return { success: false, status: "invalid_context", error: "A plain supported platform value is required." };
      }
      platform = platformDescriptor.value.trim();
    }
  } catch {
    return { success: false, status: "invalid_context", error: "Tool availability could not be read safely." };
  }
  const lifecycle = tool.metadata.lifecycle || {};
  const permission = tool.metadata.permission || tool.metadata.permissions?.[0] || null;
  const session = activeToolSessions.get(sessionKey(identity.accountId, name));
  const catalogEntry = listToolCatalog({ platform }).find((entry) => entry.name === name);
  const availabilityStatus = Object.values(CAPABILITY_STATUS).includes(catalogEntry?.status)
    ? catalogEntry.status
    : CAPABILITY_STATUS.unsupported;
  const requiredPermissions = declaredToolPermissions(tool.metadata);
  const permissionGranted = requiredPermissions.length === 1 && hasPermission(requiredPermissions[0], "account", identity.accountId);
  const readiness = availabilityStatus === CAPABILITY_STATUS.unsupported || availabilityStatus === CAPABILITY_STATUS.restricted || requiredPermissions.length !== 1
    ? "unavailable"
    : availabilityStatus === CAPABILITY_STATUS.permissionRequired || !permissionGranted
      ? "permission_required"
      : "ready";
  const availabilityReason = availabilityStatus === CAPABILITY_STATUS.supported
    ? null
    : availabilityStatus === CAPABILITY_STATUS.permissionRequired
      ? "A required platform permission has not been granted."
      : availabilityStatus === CAPABILITY_STATUS.restricted
        ? "This capability is restricted by current policy."
        : "Platform support or a required runtime dependency is unavailable.";
  return {
    success: true,
    name,
    actions: Object.freeze({
      start: lifecycle.start === true,
      stop: lifecycle.stop === true,
      status: true,
      permissions: Boolean(permission),
      help: typeof tool.metadata.description === "string" && tool.metadata.description.length > 0,
      activity: true,
    }),
    status: session?.status || "registered",
    readiness,
    availability: Object.freeze({
      platform,
      status: availabilityStatus,
      available: availabilityStatus === CAPABILITY_STATUS.supported,
      reason: availabilityReason,
      capabilities: Object.freeze((catalogEntry?.capabilities || []).map(({ capability, status, available }) => Object.freeze({
        capability,
        status,
        available: available === true,
      }))),
    }),
    permissions: permission ? Object.freeze({ required: permission, granted: permissionGranted }) : null,
    help: typeof tool.metadata.description === "string" ? tool.metadata.description : "",
    activity: Object.freeze((toolSessionActivity.get(identity.accountId) || []).filter((item) => item.name === name).map(({ id, name: toolName, status, at }) => Object.freeze({ id, name: toolName, status, at }))),
    sessionId: session?.id || null,
  };
}

export async function executeTool(name, input, context = {}) {
  const tool = tools.get(name) || null;
  const requestId = context.requestId || crypto.randomUUID();
  if (!tool) {
    return { success: false, result: null, error: `Tool not found: ${name}`, metadata: { requestId } };
  }

  if (context.signal?.aborted) {
    return { success: false, result: null, error: "Tool run was cancelled.", status: "cancelled", metadata: { requestId, source: "tool_registry" } };
  }

  const metadata = tool.metadata;
  let safeInput = input;
  let inputError = null;
  if (metadata.inputSchema) {
    try {
      safeInput = snapshotToolData(input, `Input for ${name}`);
      inputError = validateToolValue(safeInput, metadata.inputSchema, `Input for ${name}`);
    } catch (error) {
      inputError = error instanceof Error ? error.message : "Tool input is invalid.";
    }
  }
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
    }, () => runWithRetries(tool, safeInput, { ...context, requestId }));

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

  return runWithRetries(tool, safeInput, { ...context, requestId });
}

async function runWithRetries(tool, input, context) {
  const maxRetries = Math.max(0, Math.min(3, Number(tool.metadata.maxRetries) || 0));
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      if (tools.get(tool.name) !== tool) return { success: false, result: null, error: "Tool registration changed before execution.", status: "stale_registration", metadata: { requestId: context.requestId, source: "tool_registry" } };
      if (context.signal?.aborted) {
        recordAudit({ action: "tool.cancelled", tool: tool.name, status: "cancelled", requestId: context.requestId });
        return { success: false, result: null, error: "Tool run was cancelled.", status: "cancelled", metadata: { requestId: context.requestId, attempts: attempt, source: tool.metadata.source || "tool_registry", confidence: 0 } };
      }
      const onLifecycleStart = context[LIFECYCLE_START_CALLBACK];
      if (typeof onLifecycleStart === "function") onLifecycleStart();
      const result = await tool.handler(input, context);
      if (tools.get(tool.name) !== tool) return { success: false, result: null, error: "Tool registration changed during execution.", status: "stale_registration", metadata: { requestId: context.requestId, source: "tool_registry" } };
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
      if (tool.metadata.outputSchema) {
        let output;
        let outputError;
        try {
          output = snapshotToolData(result, `Output from ${tool.name}`);
          outputError = validateToolValue(output, tool.metadata.outputSchema, `Output from ${tool.name}`);
        } catch (error) {
          outputError = error instanceof Error ? error.message : "Tool output is invalid.";
        }
        if (outputError) {
          recordAudit({ action: "tool.rejected", tool: tool.name, status: "failed", requestId: context.requestId, metadata: { reason: "output_contract" } });
          return { success: false, result: null, error: "Tool output did not match its declared schema.", status: "invalid_output", metadata: { requestId: context.requestId, attempts: attempt + 1, source: tool.metadata.source || "tool_registry", confidence: 0 } };
        }
        recordAudit({ action: "tool.executed", tool: tool.name, status: "completed", requestId: context.requestId, metadata: { attempt } });
        return { success: true, result: output, error: null, metadata: { requestId: context.requestId, attempt: attempt + 1, source: tool.metadata.source || "tool_registry", confidence: 1 } };
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
  registerOwnedTool,
  unregisterTool,
  getTool,
  listTools,
  listToolCatalog,
  searchToolCatalog,
  runToolLibraryEntry,
  startToolLibraryEntry,
  stopToolLibraryEntry,
  getToolLifecycleContract,
  toolLibraryPreferenceStore,
  executeTool,
  createToolInvocationPlan,
  executeToolInvocationPlan,
};
