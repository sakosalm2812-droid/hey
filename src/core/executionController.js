import { parseNaturalCommand } from "./commandParser.js";
import { executeTool, getTool } from "./toolRegistry.js";
import { recordAudit } from "./auditLog.js";
import { registerComputerTools } from "./computerTools.js";
import { publish } from "./eventBus.js";
import { storeMemory } from "./memoryEngine.js";

const COMMAND_TO_TOOL = {
  open_url: "computer.open_url",
  screen_inspection: "computer.capture_screen",
  web_search: "computer.navigate_browser",
  read: "computer.read_file",
  run: "computer.execute_terminal",
  execute: "computer.execute_terminal",
  create: "computer.create_directory",
  organize: "computer.organize_files",
  open: "computer.open_app",
  close: "computer.close_app",
  quit: "computer.close_app",
  take: "computer.capture_screen",
  navigate_browser: "computer.navigate_browser",
};

function failure(message, details = {}) {
  return {
    success: false,
    verified: false,
    status: details.status || "failed",
    code: details.code || "EXECUTION_FAILED",
    message,
    retryable: Boolean(details.retryable),
    requiresPermission: Boolean(details.requiresPermission),
    requiresConfirmation: Boolean(details.requiresConfirmation),
    capability: details.capability || null,
    provider: details.provider || null,
    tool: details.tool || null,
  };
}

function commandInput(command) {
  if (command.kind === "open_url") return { url: command.url };
  if (command.kind === "screen_inspection") return {};
  if (command.kind === "web_search") return { target: command.query };
  if (command.kind === "computer" && command.operation === "navigate_browser") {
    const target = command.target.toLowerCase() === "youtube" ? "https://www.youtube.com" : command.target;
    return { target: command.target, url: target };
  }
  if (command.kind === "read") return { path: command.target, target: command.target };
  if (command.kind === "create") return { path: command.target, target: command.target };
  if (["run", "execute"].includes(command.operation)) {
    const [program, ...args] = command.target.split(/\s+/);
    return { program, args };
  }
  return { target: command.target };
}

function resolveCommand(command) {
  if (!command || command.needsClarification) return null;
  if (command.kind === "workflow") return null;
  const toolName = command.kind === "computer"
    ? COMMAND_TO_TOOL[command.operation]
    : COMMAND_TO_TOOL[command.kind];
  if (!toolName) return null;
  return { toolName, input: commandInput(command), capability: toolName.replace(/^computer\./, "") };
}

function isVerified(result) {
  return result?.verified === true || result?.result?.verified === true;
}

async function executeStep(step, options) {
  const resolved = resolveCommand(step);
  if (!resolved) return failure("HEY could not map that request to an executable tool.", { status: "unsupported", code: "NO_TOOL_MAPPING" });
  if (!getTool(resolved.toolName)) return failure(`Tool ${resolved.toolName} is not registered.`, { status: "unavailable", code: "TOOL_UNAVAILABLE", tool: resolved.toolName, capability: resolved.capability });

  const availableTools = options.availableTools || [];
  if (availableTools.length > 0 && !availableTools.includes(resolved.toolName)) {
    return failure(`Tool ${resolved.toolName} is not available for this agent.`, { status: "unauthorized", code: "TOOL_NOT_AUTHORIZED", tool: resolved.toolName, capability: resolved.capability });
  }

  publish("execution.step.started", { requestId: options.requestId, tool: resolved.toolName, capability: resolved.capability });

  const result = await (options.executeTool || executeTool)(resolved.toolName, resolved.input, {
    requestId: options.requestId,
    permissionScope: options.permissionScope,
    confirmed: options.confirmed === true,
    user: options.user || options.session?.user || null,
    plan: options.plan,
    entitlements: options.entitlements,
    clientPlan: options.clientPlan,
    clientEntitlements: options.clientEntitlements,
  });
  if (result.requiresConfirmation || result.requiresPermission) {
    publish("execution.step.permission_required", { requestId: options.requestId, tool: resolved.toolName, capability: resolved.capability });
    return failure(result.error || `HEY needs permission to use ${resolved.toolName}.`, {
      status: "permission_required",
      code: "CONFIRMATION_REQUIRED",
      requiresPermission: true,
      requiresConfirmation: true,
      capability: resolved.capability,
      tool: resolved.toolName,
    });
  }
  if (!result.success) {
    publish("execution.step.failed", { requestId: options.requestId, tool: resolved.toolName, capability: resolved.capability, error: result.error });
    return failure(result.error || `Tool ${resolved.toolName} failed.`, {
      status: result.status || "failed",
      code: "TOOL_FAILED",
      retryable: Boolean(result.retryable || result.metadata?.retryable),
      capability: resolved.capability,
      tool: resolved.toolName,
    });
  }
  if (!isVerified(result)) {
    publish("execution.step.verification_failed", { requestId: options.requestId, tool: resolved.toolName, capability: resolved.capability });
    return failure(`Tool ${resolved.toolName} returned without a verified result.`, {
      status: "verification_failed",
      code: "UNVERIFIED_RESULT",
      capability: resolved.capability,
      tool: resolved.toolName,
    });
  }

  const completed = {
    success: true,
    verified: true,
    status: "completed",
    code: "OK",
    message: `HEY completed ${resolved.toolName}.`,
    result: result.result,
    capability: resolved.capability,
    tool: resolved.toolName,
    metadata: result.metadata || {},
  };
  publish("execution.step.completed", completed);
  return completed;
}

export async function executeRequest(request = {}, options = {}) {
  const input = String(request.input || "").trim();
  const command = request.command || parseNaturalCommand(input);
  const requestId = options.requestId || crypto.randomUUID();
  const availableTools = request.tools || [];
  if (!command) return { handled: false, requestId, result: null };
  publish("execution.request.started", { requestId, input, command });
  registerComputerTools();
  if (command.needsClarification) {
    return { handled: true, requestId, result: failure("More information is required before HEY can execute this request.", { status: "clarification_required", code: "MISSING_INPUT" }) };
  }

  const steps = command.kind === "workflow" ? command.steps : [command];
  const results = [];
  for (const step of steps) {
    const result = await executeStep(step, { ...options, requestId, availableTools });
    results.push(result);
    if (!result.success) {
      recordAudit({ action: "execution.request", status: "failed", requestId, metadata: { results } });
      publish("execution.request.failed", { requestId, result, results });
      return { handled: true, requestId, success: false, verified: false, status: result.status, results, result };
    }
  }

  recordAudit({ action: "execution.request", status: "completed", requestId, metadata: { stepCount: results.length } });
  const memory = options.rememberExecution === false ? null : storeMemory({ kind: "verified_action", tools: results.map((item) => item.tool), status: "completed", input }, "pattern");
  publish("execution.request.completed", { requestId, results, memory });
  return { handled: true, requestId, success: true, verified: true, status: "completed", results, result: results.at(-1), memory };
}

export function getToolForCommand(command) {
  return resolveCommand(command)?.toolName || null;
}

export default { executeRequest, getToolForCommand };
