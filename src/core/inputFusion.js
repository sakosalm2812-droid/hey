import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";
import { getContext } from "./contextManager.js";
import { searchMemory } from "./memoryEngine.js";
import { analyzeMessage } from "./messageRouter.js";
import { routeToAgent } from "./agentRouter.js";
import { parseNaturalCommand } from "./commandParser.js";
import { createProviderPlan } from "./providerRouter.js";
import { selectResponseStyle } from "./responseStyleEngine.js";
import { buildQualityInstruction } from "./qualityEngine.js";
import { heyPersonality } from "./personality.js";

const MODALITIES = Object.freeze({
  TEXT: "text",
  VOICE: "voice",
  IMAGE: "image",
  SCREEN: "screen",
  GESTURE: "gesture",
  FILE: "file",
  SELECTION: "selection",
  SHORTCUT: "shortcut",
  SCHEDULE: "schedule",
  WEBHOOK: "webhook",
  DEVICE_EVENT: "device_event",
  FILE_EVENT: "file_event",
  INTEGRATION_EVENT: "integration_event",
  AGENT_RESULT: "agent_result",
});

const INPUT_STAGES = Object.freeze({
  RECEIVED: "received",
  NORMALIZED: "normalized",
  CONTEXT_BOUND: "context_bound",
  INTENT_RESOLVED: "intent_resolved",
  RISK_ASSESSED: "risk_assessed",
  ROUTE_READY: "route_ready",
  MISSING_CONTEXT: "missing_context",
  AMBIGUOUS: "ambiguous",
  PRIVACY_BLOCKED: "privacy_blocked",
  UNSUPPORTED: "unsupported",
});

function generateInputId() {
  return `input_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeText(text) {
  if (typeof text !== "string") return "";
  return text.replace(/\s+/g, " ").trim();
}

function createInputPacket(modality, content, metadata = {}) {
  return {
    id: generateInputId(),
    modality,
    content,
    sourceRef: metadata.sourceRef || null,
    captureTime: metadata.captureTime || new Date().toISOString(),
    accountId: metadata.accountId || null,
    projectId: metadata.projectId || null,
    deviceId: metadata.deviceId || null,
    selectionRevision: metadata.selectionRevision || null,
    confidence: metadata.confidence ?? 1.0,
    isUserInstruction: metadata.isUserInstruction !== false,
    isUntrustedSource: metadata.isUntrustedSource || false,
    rawData: metadata.rawData || null,
    stage: INPUT_STAGES.RECEIVED,
    correlationId: metadata.correlationId || null,
  };
}

async function normalizeInput(packet) {
  const normalized = { ...packet };

  switch (packet.modality) {
    case MODALITIES.TEXT:
      normalized.content = normalizeText(packet.content);
      break;
    case MODALITIES.VOICE:
      normalized.content = normalizeText(packet.content);
      normalized.metadata = {
        ...packet.metadata,
        transcript: packet.content,
        confidence: packet.confidence,
        language: packet.metadata?.language,
        duration: packet.metadata?.duration,
      };
      break;
    case MODALITIES.IMAGE:
      normalized.content = packet.content;
      normalized.metadata = {
        ...packet.metadata,
        mimeType: packet.metadata?.mimeType,
        dimensions: packet.metadata?.dimensions,
        source: packet.metadata?.source,
      };
      break;
    case MODALITIES.SCREEN:
      normalized.content = packet.content;
      normalized.metadata = {
        ...packet.metadata,
        sourceType: packet.metadata?.sourceType,
        region: packet.metadata?.region,
        windowId: packet.metadata?.windowId,
        monitorId: packet.metadata?.monitorId,
      };
      break;
    case MODALITIES.GESTURE:
      normalized.content = packet.content;
      normalized.metadata = {
        ...packet.metadata,
        gestureId: packet.metadata?.gestureId,
        target: packet.metadata?.target,
        coordinates: packet.metadata?.coordinates,
        hand: packet.metadata?.hand,
      };
      break;
    case MODALITIES.FILE:
      normalized.content = packet.content;
      normalized.metadata = {
        ...packet.metadata,
        fileId: packet.metadata?.fileId,
        fileName: packet.metadata?.fileName,
        mimeType: packet.metadata?.mimeType,
        size: packet.metadata?.size,
        path: packet.metadata?.path,
      };
      break;
    case MODALITIES.SELECTION:
      normalized.content = packet.content;
      normalized.metadata = {
        ...packet.metadata,
        selectedText: packet.metadata?.selectedText,
        selectedElement: packet.metadata?.selectedElement,
        sourceApp: packet.metadata?.sourceApp,
      };
      break;
    default:
      normalized.content = typeof packet.content === "string" ? normalizeText(packet.content) : packet.content;
  }

  normalized.stage = INPUT_STAGES.NORMALIZED;
  return normalized;
}

async function bindContext(packet) {
  const context = getContext();
  const bound = { ...packet, stage: INPUT_STAGES.CONTEXT_BOUND };

  if (packet.accountId) {
    bound.context = {
      user: context.user,
      project: context.projects?.find(p => p.id === packet.projectId) || null,
      device: context.devices?.find(d => d.id === packet.deviceId) || null,
      activeAgent: context.intelligence?.activeAgent || null,
      activeMode: context.intelligence?.activeMode || null,
      permissions: context.permissions || [],
    };
  }

  return bound;
}

async function resolveIntent(packet) {
  const { content, modality, metadata } = packet;
  let analysis;
  let command = null;

  if (modality === MODALITIES.TEXT || modality === MODALITIES.VOICE) {
    analysis = analyzeMessage(content);
    command = parseNaturalCommand(content);
  } else if (modality === MODALITIES.IMAGE || modality === MODALITIES.SCREEN) {
    analysis = {
      intent: "visual_analysis",
      confidence: 0.8,
      normalizedMessage: content,
      shouldExecute: false,
      requiresConfirmation: false,
      riskLevel: "low",
    };
  } else if (modality === MODALITIES.GESTURE) {
    analysis = {
      intent: "gesture_action",
      confidence: metadata.confidence || 0.9,
      normalizedMessage: `Gesture: ${metadata.gestureId}`,
      shouldExecute: true,
      requiresConfirmation: false,
      riskLevel: "low",
    };
  } else if (modality === MODALITIES.FILE) {
    analysis = {
      intent: "file_processing",
      confidence: 0.85,
      normalizedMessage: `File: ${metadata.fileName}`,
      shouldExecute: true,
      requiresConfirmation: false,
      riskLevel: "low",
    };
  } else if (modality === MODALITIES.SELECTION) {
    analysis = {
      intent: "selection_action",
      confidence: 0.9,
      normalizedMessage: `Selection: ${metadata.selectedText?.slice(0, 100) || "content"}`,
      shouldExecute: false,
      requiresConfirmation: false,
      riskLevel: "low",
    };
  } else {
    analysis = {
      intent: "system_event",
      confidence: 1.0,
      normalizedMessage: `Event: ${modality}`,
      shouldExecute: false,
      requiresConfirmation: false,
      riskLevel: "low",
    };
  }

  const agentResult = routeToAgent(analysis.normalizedMessage || content, analysis);

  return {
    ...packet,
    analysis,
    command,
    agent: agentResult?.agent || null,
    agents: agentResult?.agents || [],
    tools: agentResult?.tools || [],
    intent: agentResult?.intent || analysis.intent,
    stage: INPUT_STAGES.INTENT_RESOLVED,
  };
}

async function assessRisk(packet) {
  const { analysis, command, modality } = packet;
  let riskLevel = analysis?.riskLevel || "low";
  let requiresConfirmation = analysis?.requiresConfirmation || false;
  let requiredPermission = analysis?.requiredPermission || null;

  if (command && command.kind === "workflow") {
    riskLevel = "medium";
    requiresConfirmation = true;
  }

  if (modality === MODALITIES.GESTURE && packet.metadata?.gestureId) {
    const highRiskGestures = ["G13", "G15", "G16"];
    if (highRiskGestures.includes(packet.metadata.gestureId)) {
      riskLevel = "high";
      requiresConfirmation = true;
    }
  }

  if (packet.isUntrustedSource) {
    riskLevel = "high";
    requiredPermission = "untrusted_content_processing";
  }

  return {
    ...packet,
    riskLevel,
    requiresConfirmation,
    requiredPermission,
    stage: INPUT_STAGES.RISK_ASSESSED,
  };
}

async function selectRoute(packet) {
  const { analysis, intent, command, requiresConfirmation } = packet;

  const providerPlan = createProviderPlan({ intent });

  const responseStyle = selectResponseStyle(
    analysis?.normalizedMessage || "",
    intent,
    analysis,
  );

  const clarification = buildClarification(analysis, command);

  const plan = analysis?.shouldExecute && !clarification.required
    ? await createPlan(analysis.normalizedMessage || "")
    : null;

  return {
    ...packet,
    providerPlan,
    responseStyle,
    clarification,
    plan,
    routeReady: !clarification.required && !requiresConfirmation,
    stage: INPUT_STAGES.ROUTE_READY,
  };
}

function buildClarification(analysis, command) {
  if (command?.needsClarification) {
    return {
      required: true,
      reason: command.kind === "reminder"
        ? "A reminder needs both what to remember and when."
        : "More information is needed before this action can be prepared.",
      stage: INPUT_STAGES.AMBIGUOUS,
    };
  }

  if (analysis?.confidence !== undefined && analysis.confidence < 0.7) {
    return {
      required: true,
      reason: "The request is ambiguous enough that guessing could change the result.",
      stage: INPUT_STAGES.AMBIGUOUS,
    };
  }

  return {
    required: false,
    reason: null,
    stage: INPUT_STAGES.ROUTE_READY,
  };
}

async function createPlan(input) {
  const { createPlan: createPlanFn } = await import("./planner.js");
  return createPlanFn(input);
}

export async function processInputFusion(input) {
  const {
    modality = MODALITIES.TEXT,
    content = "",
    ...metadata
  } = input;

  const packet = createInputPacket(modality, content, metadata);

  publish("input.received", packet);
  recordAudit({
    action: "input.received",
    status: "completed",
    metadata: { modality, inputId: packet.id },
  });

  try {
    const normalized = await normalizeInput(packet);
    publish("input.normalized", normalized);

    const contextBound = await bindContext(normalized);
    publish("input.context_bound", contextBound);

    const intentResolved = await resolveIntent(contextBound);
    publish("input.intent_resolved", intentResolved);

    const riskAssessed = await assessRisk(intentResolved);
    publish("input.risk_assessed", riskAssessed);

    const routeReady = await selectRoute(riskAssessed);
    publish("input.route_ready", routeReady);

    recordAudit({
      action: "input.processed",
      status: "completed",
      metadata: {
        inputId: packet.id,
        modality,
        intent: routeReady.intent,
        routeReady: routeReady.routeReady,
        clarificationRequired: routeReady.clarification?.required,
      },
    });

    return buildInstruction(routeReady);
  } catch (error) {
    const errorPacket = {
      ...packet,
      error: error.message,
      stage: "error",
    };
    publish("input.error", errorPacket);
    recordAudit({
      action: "input.error",
      status: "failed",
      metadata: { inputId: packet.id, error: error.message },
    });
    throw error;
  }
}

function buildInstruction(packet) {
  const {
    agent,
    analysis,
    responseStyle,
    providerPlan,
    clarification,
    plan,
    agents: agentTeam,
    intent,
    normalizedInput: content = packet.content,
  } = packet;

  const agentCapabilities = Array.isArray(agent?.capabilities)
    ? agent.capabilities.join(", ")
    : "none";

  return {
    input: packet.content,
    normalizedInput: content,
    analysis,
    agent: agent || null,
    agents: agentTeam,
    tools: packet.tools,
    primaryTools: packet.primaryTools,
    intent,
    memory: searchMemory(content),
    context: getContext(),
    responseStyle,
    plan,
    providerPlan,
    command: packet.command,
    clarification,
    pipeline: [
      "receive",
      "normalize",
      "understand",
      "gather_context",
      "check_memory",
      "determine_intent",
      ...(clarification.required ? ["clarify"] : []),
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
    ],
    safety: {
      riskLevel: packet.riskLevel,
      requiresConfirmation: packet.requiresConfirmation,
      requiredPermission: packet.requiredPermission,
    },
    execution: {
      shouldExecute: analysis?.shouldExecute && !clarification.required,
      blockedByClarification: clarification.required,
      readyForExecution: analysis?.shouldExecute && !clarification.required,
    },
    instruction: [
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
      `User request: ${content}`,
      `Detected intent: ${analysis?.intent ?? "unknown"}`,
      `Normalized request: ${analysis?.normalizedMessage ?? content}`,
      `Confidence: ${analysis?.confidence ?? "unknown"}`,
      "",
      `Relevant memory: ${JSON.stringify(searchMemory(content))}`,
      `Current context: ${JSON.stringify(getContext())}`,
      `Agent team: ${JSON.stringify(agentTeam ?? [])}`,
      `Task plan: ${JSON.stringify(plan ?? null)}`,
      `Provider plan: ${JSON.stringify(providerPlan ?? null)}`,
      `Clarification: ${JSON.stringify(clarification)}`,
      `Safety requirements: ${JSON.stringify({ riskLevel: packet.riskLevel, requiresConfirmation: packet.requiresConfirmation, requiredPermission: packet.requiredPermission })}`,
      `Execution state: ${JSON.stringify({ shouldExecute: analysis?.shouldExecute && !clarification.required, blockedByClarification: clarification.required, readyForExecution: analysis?.shouldExecute && !clarification.required })}`,
      "",
      buildQualityInstruction({
        mode: responseStyle?.primary || responseStyle?.mode,
        riskLevel: packet.riskLevel,
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
    ].join("\n"),
  };
}

export function createTextInput(text, metadata = {}) {
  return processInputFusion({ modality: MODALITIES.TEXT, content: text, ...metadata });
}

export function createVoiceInput(transcript, metadata = {}) {
  return processInputFusion({ modality: MODALITIES.VOICE, content: transcript, ...metadata });
}

export function createImageInput(imageData, metadata = {}) {
  return processInputFusion({ modality: MODALITIES.IMAGE, content: imageData, ...metadata });
}

export function createScreenInput(screenData, metadata = {}) {
  return processInputFusion({ modality: MODALITIES.SCREEN, content: screenData, ...metadata });
}

export function createGestureInput(gestureId, metadata = {}) {
  return processInputFusion({ modality: MODALITIES.GESTURE, content: gestureId, ...metadata });
}

export function createFileInput(fileData, metadata = {}) {
  return processInputFusion({ modality: MODALITIES.FILE, content: fileData, ...metadata });
}

export function createSelectionInput(selectionData, metadata = {}) {
  return processInputFusion({ modality: MODALITIES.SELECTION, content: selectionData, ...metadata });
}

export function createEventInput(eventType, eventData, metadata = {}) {
  return processInputFusion({ modality: eventType, content: eventData, ...metadata });
}

export { MODALITIES, INPUT_STAGES };

export default {
  processInputFusion,
  createTextInput,
  createVoiceInput,
  createImageInput,
  createScreenInput,
  createGestureInput,
  createFileInput,
  createSelectionInput,
  createEventInput,
  MODALITIES,
  INPUT_STAGES,
};