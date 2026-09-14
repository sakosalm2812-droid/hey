import heyPersonality from "./personality.js";
import {
  getContext,
  addConversationMessage,
  buildPromptContext,
  updateConversationState,
} from "./contextManager.js";
import {
  storeMemory,
  searchMemory,
} from "./memoryEngine.js";
import { analyzeMessage } from "./messageRouter.js";
import { routeToAgent } from "./agentRouter.js";
import { createPlan } from "./planner.js";
import {
  buildResponseStylePrompt,
  selectResponseStyle,
} from "./responseStyleEngine.js";
import { buildQualityInstruction } from "./qualityEngine.js";
import { createProviderPlan } from "./providerRouter.js";
import { parseNaturalCommand } from "./commandParser.js";
import { registerComputerTools } from "./computerTools.js";
import { registerGenerationTools } from "./generationTools.js";

const CONFIDENCE_THRESHOLD = 0.7;

function normalizeInput(message) {
  if (typeof message !== "string") {
    return "";
  }

  return message.replace(/\s+/g, " ").trim();
}

function buildClarification(analysis, command) {
  if (command?.needsClarification) {
    return {
      required: true,
      reason:
        command.kind === "reminder"
          ? "A reminder needs both what to remember and when."
          : "More information is needed before this action can be prepared.",
    };
  }

  if (
    typeof analysis?.confidence === "number" &&
    analysis.confidence < CONFIDENCE_THRESHOLD
  ) {
    return {
      required: true,
      reason:
        "The request is ambiguous enough that guessing could change the result.",
    };
  }

  return {
    required: false,
    reason: null,
  };
}

function buildPipeline(clarificationRequired) {
  return [
    "receive",
    "normalize",
    "understand",
    "gather_context",
    "check_memory",
    "determine_intent",
    ...(clarificationRequired ? ["clarify"] : []),
    "select_response_style",
    "select_provider",
    "plan",
    "route",
    "authorize",
    "execute_or_respond",
    "observe",
    "verify",
    "recover_if_needed",
    "update_memory",
    "respond",
  ];
}

function buildSafetyState(analysis) {
  return {
    riskLevel: analysis?.riskLevel ?? "unknown",
    requiresConfirmation: Boolean(analysis?.requiresConfirmation),
    requiredPermission: analysis?.requiredPermission ?? null,
  };
}

function buildExecutionState(analysis, clarification) {
  return {
    shouldExecute: Boolean(analysis?.shouldExecute),
    blockedByClarification: clarification.required,
    readyForExecution:
      Boolean(analysis?.shouldExecute) && !clarification.required,
  };
}

function generateInstruction({
  agent,
  message,
  analysis,
  responseStyle,
  promptContext,
  relevantMemory,
  plan,
  agentTeam,
  providerPlan,
  clarification,
}) {
  const agentCapabilities = Array.isArray(agent?.capabilities)
    ? agent.capabilities.join(", ")
    : "none";

  const safety = buildSafetyState(analysis);
  const execution = buildExecutionState(analysis, clarification);

  return [
    "You are HEY, a personal intelligence system.",
    "",
    "Operate as the user's intelligence layer: understand the request, use available context and memory, reason about the task, select the appropriate capability, respect authorization and safety requirements, and produce the best useful response.",
    "",
    `Primary capability: ${agent?.name ?? "general intelligence"}`,
    `Role: ${agent?.role ?? "general assistant"}`,
    `Purpose: ${agent?.description ?? "Assist the user."}`,
    `Capabilities: ${agentCapabilities}`,
    `Personality: ${agent?.personality ?? heyPersonality?.identity?.name ?? "HEY"}`,
    "",
    `User request: ${message}`,
    `Detected intent: ${analysis?.intent ?? "unknown"}`,
    `Normalized request: ${analysis?.normalizedMessage ?? message}`,
    `Confidence: ${analysis?.confidence ?? "unknown"}`,
    "",
    `Relevant memory: ${JSON.stringify(relevantMemory ?? [])}`,
    `Current context: ${JSON.stringify(promptContext ?? {})}`,
    `Agent team: ${JSON.stringify(agentTeam ?? [])}`,
    `Task plan: ${JSON.stringify(plan ?? null)}`,
    `Provider plan: ${JSON.stringify(providerPlan ?? null)}`,
    `Clarification: ${JSON.stringify(clarification)}`,
    `Safety requirements: ${JSON.stringify(safety)}`,
    `Execution state: ${JSON.stringify(execution)}`,
    "",
    buildResponseStylePrompt(responseStyle),
    buildQualityInstruction({
      mode: responseStyle?.primary || responseStyle?.mode,
      riskLevel: analysis?.riskLevel,
    }),
    "",
    "HEY principles:",
    "- Be useful.",
    "- Be clear.",
    "- Think strategically.",
    "- Preserve relevant context.",
    "- Do not invent capabilities, results, permissions, or completed actions.",
    "- Do not claim an action happened unless the execution layer confirms it.",
    "- Ask for clarification when ambiguity materially affects the result.",
    "- Respect authorization, confirmation, and safety requirements.",
    "- Protect user trust.",
    "- Never expose internal routing, provider selection, or implementation details unless explicitly requested.",
    "- Treat provider selection as execution guidance only.",
    "- Never expose provider credentials.",
  ].join("\n");
}

export function initializeHEY() {
  registerComputerTools();
  registerGenerationTools();

  return {
    name: heyPersonality.identity.name,
    status: "online",
    initializedAt: new Date(),
  };
}

export function processInput(message) {
  const normalizedInput = normalizeInput(message);

  if (!normalizedInput) {
    return {
      input: message,
      normalizedInput: "",
      analysis: null,
      agent: null,
      agents: [],
      intent: null,
      memory: [],
      context: buildPromptContext(),
      responseStyle: null,
      plan: null,
      providerPlan: null,
      command: null,
      clarification: {
        required: true,
        reason: "HEY needs a request before it can determine what to do.",
      },
      pipeline: buildPipeline(true),
      safety: {
        riskLevel: "unknown",
        requiresConfirmation: false,
        requiredPermission: null,
      },
      execution: {
        shouldExecute: false,
        blockedByClarification: true,
        readyForExecution: false,
      },
      instruction:
        "The user did not provide a usable request. Ask them what they would like HEY to do.",
    };
  }

  const analysis = analyzeMessage(normalizedInput);
  const agentResult = routeToAgent(
    normalizedInput,
    analysis,
  );

  const responseStyle = selectResponseStyle(
    normalizedInput,
    analysis.intent,
    analysis,
  );

  const command = parseNaturalCommand(
    analysis.normalizedMessage || normalizedInput,
  );

  const clarification = buildClarification(
    analysis,
    command,
  );

  const plan =
    analysis.shouldExecute && !clarification.required
      ? createPlan(
          analysis.normalizedMessage || normalizedInput,
        )
      : null;

  const providerPlan = createProviderPlan({
    intent: analysis.intent,
  });

  addConversationMessage({
    role: "user",
    content: normalizedInput,
  });

  updateConversationState({
    topic:
      analysis.currentTopic ||
      analysis.normalizedMessage ||
      normalizedInput,
    intent: analysis.intent,
  });

  const relevantMemory = searchMemory(normalizedInput);
  const context = buildPromptContext();

  const safety = buildSafetyState(analysis);
  const execution = buildExecutionState(
    analysis,
    clarification,
  );

  const pipeline = buildPipeline(
    clarification.required,
  );

  return {
    input: message,
    normalizedInput,
    analysis,

    agent: agentResult?.agent ?? null,
    agents: agentResult?.agents ?? [],
    tools: agentResult?.tools ?? [],
    primaryTools: agentResult?.primaryTools ?? [],
    intent: agentResult?.intent ?? analysis.intent,

    memory: relevantMemory,
    context,

    responseStyle,
    plan,
    providerPlan,
    command,
    clarification,

    pipeline,
    safety,
    execution,

    instruction: generateInstruction({
      agent: agentResult?.agent,
      message: normalizedInput,
      analysis,
      responseStyle,
      promptContext: context,
      relevantMemory,
      plan,
      agentTeam: agentResult?.agents,
      providerPlan,
      clarification,
    }),
  };
}

export function rememberUserInformation(information) {
  if (!information) {
    return null;
  }

  return storeMemory(
    information,
    "important",
  );
}

export function getHEYState() {
  return getContext();
}

export function createAgentTask(task) {
  const normalizedTask = normalizeInput(task);

  if (!normalizedTask) {
    return {
      task,
      assignedAgent: null,
      createdAt: new Date(),
      status: "invalid",
    };
  }

  const routing = routeToAgent(normalizedTask);

  return {
    task: normalizedTask,
    assignedAgent: routing?.agent ?? null,
    agents: routing?.agents ?? [],
    createdAt: new Date(),
    status: "pending",
  };
}

export function getSystemStatus() {
  const context = getContext();

  return {
    online: true,
    activeAgent:
      context?.intelligence?.activeAgent ?? null,
    mode:
      context?.intelligence?.activeMode ?? null,
    memoryCount:
      context?.memory?.importantFacts?.length ?? 0,
  };
}

export default {
  initializeHEY,
  processInput,
  rememberUserInformation,
  getHEYState,
  createAgentTask,
  getSystemStatus,
};