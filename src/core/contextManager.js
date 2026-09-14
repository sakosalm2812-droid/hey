import { heyPersonality } from "./personality.js";

const MAX_HISTORY = 100;
const MAX_SHORT_TERM_MEMORY = 50;
const MAX_IMPORTANT_FACTS = 100;
const MAX_PATTERNS = 50;

function createEmptyContext() {
  return {
    user: {
      id: null,
      name: null,
      preferences: {},
      goals: [],
      interests: [],
      plan: null,
      entitlements: {},
    },

    conversation: {
      history: [],
      currentTopic: null,
      lastIntent: null,
      lastUserMessage: null,
      lastAssistantMessage: null,
      turnCount: 0,
    },

    environment: {
      time: new Date(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      location: null,
      device: null,
      platform: null,
      online: true,
    },

    task: {
      activeTaskId: null,
      activeTask: null,
      pendingTasks: [],
      recentTasks: [],
    },

    workflow: {
      activeWorkflowId: null,
      activeWorkflow: null,
    },

    memory: {
      shortTerm: [],
      importantFacts: [],
      patterns: [],
      relevant: [],
    },

    intelligence: {
      activeMode: "strategic",
      activeAgent: null,
      activeAgents: [],
      confidence: 0,
      lastDecision: null,
      lastPlan: null,
    },

    permissions: {
      authenticated: false,
      granted: [],
      pendingConfirmations: [],
      riskLevel: "low",
    },

    devices: {
      primary: null,
      connected: [],
      active: null,
    },

    workspace: {
      activeWidget: null,
      widgets: [],
      layout: null,
    },

    proactive: {
      lastSuggestion: null,
      suggestionsToday: 0,
      lastEvaluatedAt: null,
    },

    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

let heyContext = createEmptyContext();

function touchContext() {
  heyContext.metadata.updatedAt = new Date();
}

function trimArray(array, maximum) {
  if (array.length > maximum) {
    array.splice(0, array.length - maximum);
  }

  return array;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : value;
}

function mergeObject(current, incoming) {
  if (
    !incoming ||
    typeof incoming !== "object" ||
    Array.isArray(incoming)
  ) {
    return current;
  }

  return {
    ...current,
    ...incoming,
  };
}

export function getContext() {
  return heyContext;
}

export function getContextSnapshot() {
  return structuredClone
    ? structuredClone(heyContext)
    : JSON.parse(JSON.stringify(heyContext));
}

export function updateUserContext(data = {}) {
  heyContext.user = {
    ...heyContext.user,
    ...data,
    preferences: mergeObject(
      heyContext.user.preferences,
      data.preferences,
    ),
    entitlements: mergeObject(
      heyContext.user.entitlements,
      data.entitlements,
    ),
  };

  if (Array.isArray(data.goals)) {
    heyContext.user.goals = [...data.goals];
  }

  if (Array.isArray(data.interests)) {
    heyContext.user.interests = [...data.interests];
  }

  touchContext();

  return heyContext.user;
}

export function updateEnvironmentContext(data = {}) {
  heyContext.environment = {
    ...heyContext.environment,
    ...data,
    time: data.time
      ? new Date(data.time)
      : new Date(),
  };

  touchContext();

  return heyContext.environment;
}

export function addConversationMessage(message = {}) {
  const entry =
    typeof message === "string"
      ? {
          role: "user",
          content: message,
        }
      : {
          ...message,
        };

  entry.timestamp = new Date();

  heyContext.conversation.history.push(entry);

  if (entry.role === "user") {
    heyContext.conversation.lastUserMessage =
      entry.content ?? null;
  }

  if (entry.role === "assistant") {
    heyContext.conversation.lastAssistantMessage =
      entry.content ?? null;
  }

  heyContext.conversation.turnCount += 1;

  trimArray(
    heyContext.conversation.history,
    MAX_HISTORY,
  );

  touchContext();

  return heyContext.conversation.history;
}

export function updateConversationState({
  topic,
  intent,
  lastUserMessage,
  lastAssistantMessage,
} = {}) {
  if (topic !== undefined && topic !== null) {
    heyContext.conversation.currentTopic =
      normalizeString(topic);
  }

  if (intent !== undefined && intent !== null) {
    heyContext.conversation.lastIntent =
      normalizeString(intent);
  }

  if (lastUserMessage !== undefined) {
    heyContext.conversation.lastUserMessage =
      lastUserMessage;
  }

  if (lastAssistantMessage !== undefined) {
    heyContext.conversation.lastAssistantMessage =
      lastAssistantMessage;
  }

  touchContext();

  return heyContext.conversation;
}

export function setCurrentTopic(topic) {
  heyContext.conversation.currentTopic =
    normalizeString(topic);

  touchContext();

  return heyContext.conversation.currentTopic;
}

export function setActiveAgent(agent) {
  heyContext.intelligence.activeAgent =
    agent || null;

  touchContext();

  return heyContext.intelligence.activeAgent;
}

export function setActiveAgents(agents = []) {
  heyContext.intelligence.activeAgents =
    Array.isArray(agents)
      ? [...agents]
      : [];

  touchContext();

  return heyContext.intelligence.activeAgents;
}

export function setActiveMode(mode) {
  if (
    typeof mode === "string" &&
    heyPersonality?.modes?.[mode]
  ) {
    heyContext.intelligence.activeMode = mode;
  }

  touchContext();

  return heyContext.intelligence.activeMode;
}

export function setConfidence(confidence) {
  if (Number.isFinite(confidence)) {
    heyContext.intelligence.confidence =
      Math.min(1, Math.max(0, confidence));
  }

  touchContext();

  return heyContext.intelligence.confidence;
}

export function setLastDecision(decision) {
  heyContext.intelligence.lastDecision =
    decision ?? null;

  touchContext();

  return decision;
}

export function setLastPlan(plan) {
  heyContext.intelligence.lastPlan =
    plan ?? null;

  touchContext();

  return plan;
}

export function addMemory(memory, metadata = {}) {
  if (
    memory === undefined ||
    memory === null
  ) {
    return heyContext.memory.shortTerm;
  }

  heyContext.memory.shortTerm.push({
    value: memory,
    ...metadata,
    createdAt: new Date(),
  });

  trimArray(
    heyContext.memory.shortTerm,
    MAX_SHORT_TERM_MEMORY,
  );

  touchContext();

  return heyContext.memory.shortTerm;
}

export function addImportantFact(fact, metadata = {}) {
  if (
    fact === undefined ||
    fact === null
  ) {
    return heyContext.memory.importantFacts;
  }

  heyContext.memory.importantFacts.push({
    fact,
    ...metadata,
    createdAt: new Date(),
  });

  trimArray(
    heyContext.memory.importantFacts,
    MAX_IMPORTANT_FACTS,
  );

  touchContext();

  return heyContext.memory.importantFacts;
}

export function addPattern(pattern, metadata = {}) {
  if (!pattern) {
    return heyContext.memory.patterns;
  }

  heyContext.memory.patterns.push({
    pattern,
    ...metadata,
    createdAt: new Date(),
  });

  trimArray(
    heyContext.memory.patterns,
    MAX_PATTERNS,
  );

  touchContext();

  return heyContext.memory.patterns;
}

export function setRelevantMemory(memory = []) {
  heyContext.memory.relevant =
    Array.isArray(memory)
      ? [...memory]
      : [];

  touchContext();

  return heyContext.memory.relevant;
}

export function updateTaskContext(data = {}) {
  heyContext.task = {
    ...heyContext.task,
    ...data,
  };

  touchContext();

  return heyContext.task;
}

export function setActiveTask(task) {
  heyContext.task.activeTask =
    task || null;

  heyContext.task.activeTaskId =
    task?.id || null;

  touchContext();

  return heyContext.task;
}

export function setTaskLists({
  pending = [],
  recent = [],
} = {}) {
  heyContext.task.pendingTasks =
    Array.isArray(pending)
      ? [...pending]
      : [];

  heyContext.task.recentTasks =
    Array.isArray(recent)
      ? [...recent]
      : [];

  touchContext();

  return heyContext.task;
}

export function updateWorkflowContext(data = {}) {
  heyContext.workflow = {
    ...heyContext.workflow,
    ...data,
  };

  touchContext();

  return heyContext.workflow;
}

export function setActiveWorkflow(workflow) {
  heyContext.workflow.activeWorkflow =
    workflow || null;

  heyContext.workflow.activeWorkflowId =
    workflow?.id || null;

  touchContext();

  return heyContext.workflow;
}

export function updatePermissionContext(data = {}) {
  heyContext.permissions = {
    ...heyContext.permissions,
    ...data,
  };

  if (Array.isArray(data.granted)) {
    heyContext.permissions.granted = [
      ...data.granted,
    ];
  }

  if (Array.isArray(data.pendingConfirmations)) {
    heyContext.permissions.pendingConfirmations = [
      ...data.pendingConfirmations,
    ];
  }

  touchContext();

  return heyContext.permissions;
}

export function updateDeviceContext(data = {}) {
  heyContext.devices = {
    ...heyContext.devices,
    ...data,
  };

  if (Array.isArray(data.connected)) {
    heyContext.devices.connected = [
      ...data.connected,
    ];
  }

  touchContext();

  return heyContext.devices;
}

export function updateWorkspaceContext(data = {}) {
  heyContext.workspace = {
    ...heyContext.workspace,
    ...data,
  };

  if (Array.isArray(data.widgets)) {
    heyContext.workspace.widgets = [
      ...data.widgets,
    ];
  }

  touchContext();

  return heyContext.workspace;
}

export function updateProactiveContext(data = {}) {
  heyContext.proactive = {
    ...heyContext.proactive,
    ...data,
  };

  touchContext();

  return heyContext.proactive;
}

export function buildPromptContext(options = {}) {
  const includeHistory =
    options.includeHistory !== false;

  const includeMemory =
    options.includeMemory !== false;

  const includeEnvironment =
    options.includeEnvironment !== false;

  const includeTasks =
    options.includeTasks !== false;

  const includeDevices =
    options.includeDevices !== false;

  const includeWorkspace =
    options.includeWorkspace !== false;

  return {
    personality: heyPersonality,

    user: heyContext.user,

    conversation: {
      ...heyContext.conversation,
      history: includeHistory
        ? heyContext.conversation.history
        : [],
    },

    environment: includeEnvironment
      ? heyContext.environment
      : null,

    task: includeTasks
      ? heyContext.task
      : null,

    workflow: heyContext.workflow,

    memory: includeMemory
      ? heyContext.memory
      : null,

    intelligence: heyContext.intelligence,

    permissions: heyContext.permissions,

    devices: includeDevices
      ? heyContext.devices
      : null,

    workspace: includeWorkspace
      ? heyContext.workspace
      : null,

    proactive: heyContext.proactive,
  };
}

export function buildExecutionContext() {
  return {
    user: heyContext.user,
    environment: heyContext.environment,
    task: heyContext.task,
    workflow: heyContext.workflow,
    intelligence: heyContext.intelligence,
    permissions: heyContext.permissions,
    devices: heyContext.devices,
    workspace: heyContext.workspace,
  };
}

export function getConversationHistory(limit = MAX_HISTORY) {
  const safeLimit =
    Number.isInteger(limit) && limit > 0
      ? limit
      : MAX_HISTORY;

  return heyContext.conversation.history.slice(
    -safeLimit,
  );
}

export function getRelevantContext() {
  return {
    topic:
      heyContext.conversation.currentTopic,

    intent:
      heyContext.conversation.lastIntent,

    activeTask:
      heyContext.task.activeTask,

    activeWorkflow:
      heyContext.workflow.activeWorkflow,

    activeAgent:
      heyContext.intelligence.activeAgent,

    mode:
      heyContext.intelligence.activeMode,

    confidence:
      heyContext.intelligence.confidence,

    memory:
      heyContext.memory.relevant,

    device:
      heyContext.devices.active ||
      heyContext.devices.primary,

    workspace:
      heyContext.workspace,

    riskLevel:
      heyContext.permissions.riskLevel,
  };
}

export function resetConversation() {
  heyContext.conversation = {
    history: [],
    currentTopic: null,
    lastIntent: null,
    lastUserMessage: null,
    lastAssistantMessage: null,
    turnCount: 0,
  };

  touchContext();

  return heyContext.conversation;
}

export function resetContext() {
  heyContext = createEmptyContext();

  return heyContext;
}

export default {
  getContext,
  getContextSnapshot,

  updateUserContext,
  updateEnvironmentContext,

  addConversationMessage,
  updateConversationState,
  setCurrentTopic,

  setActiveAgent,
  setActiveAgents,
  setActiveMode,
  setConfidence,
  setLastDecision,
  setLastPlan,

  addMemory,
  addImportantFact,
  addPattern,
  setRelevantMemory,

  updateTaskContext,
  setActiveTask,
  setTaskLists,

  updateWorkflowContext,
  setActiveWorkflow,

  updatePermissionContext,
  updateDeviceContext,
  updateWorkspaceContext,
  updateProactiveContext,

  buildPromptContext,
  buildExecutionContext,
  getConversationHistory,
  getRelevantContext,

  resetConversation,
  resetContext,
};