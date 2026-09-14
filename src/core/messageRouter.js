import { getContext } from "./contextManager.js";
import { getMode } from "./modeRegistry.js";

const patterns = {
  task: [
    /\b(build|create|make|develop|implement|fix|code|program|deploy|set up|configure|automate|delete|remove|send|open|close|schedule|lock|unlock|buy|purchase)\b/i,
  ],

  learning: [
    /^(what|why|how|when|where|who|which)\b/i,
    /\b(explain|teach|learn|understand|meaning|difference|how does|what does)\b/i,
  ],

  design: [
    /\b(design|designer|ui|ux|interface|visual|brand|layout|landing page)\b/i,
  ],

  business: [
    /\b(business|company|startup|money|market|pricing|strategy|decision|invest|profit)\b/i,
  ],

  research: [
    /\b(research|compare|comparison|best|recommend|review|specs|laptop|phone)\b/i,
  ],

  debate: [
    /\b(opinion|argue|debate|agree|disagree|is it true)\b/i,
  ],

  creative: [
    /\b(idea|ideas|story|content|video|creative|concept|name|brainstorm)\b/i,
  ],

  supportive: [
    /\b(overwhelmed|stressed|struggling|sad|upset|lost|tired|frustrated|confused|help me)\b/i,
  ],

  motivational: [
    /\b(motivat|discipline|habit|routine|goal|push me|keep me going)\b/i,
  ],

  reminder: [
    /\b(remind me|set (?:a )?reminder|alarm)\b/i,
  ],

  finance: [
    /\b(spent|paid|expense|budget|budgeting|saving|savings)\b/i,
  ],

  travel: [
    /\b(trip|travel|flight|hotel|itinerary|packing)\b/i,
  ],

  health: [
    /\b(medication|medicine|doctor|appointment|health tracker)\b/i,
  ],

  writing: [
    /\b(email|message|reply|rewrite|essay|grammar|proofread)\b/i,
  ],

  documents: [
    /\b(document|pdf|form|contract|agreement)\b/i,
  ],

  cooking: [
    /\b(recipe|cook|meal plan|ingredients|grocery)\b/i,
  ],

  decision: [
    /\b(should i|decide|decision|trade-?off|pros and cons|which one)\b/i,
  ],
};

const agentAssignments = {
  task: "builder",
  learning: "teacher",
  design: "designer",
  business: "strategist",
  research: "researcher",
  debate: "analyst",
  creative: "creator",
  supportive: "coach",
  motivational: "coach",
  reminder: "taskmaster",
  finance: "finance",
  travel: "planner",
  health: "taskmaster",
  writing: "writer",
  documents: "documentation",
  cooking: "knowledge",
  decision: "strategist",
  conversation: "architect",
};

export function normalizeMessage(message) {
  return String(message ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function getFollowUpTopic(text, context) {
  const isFollowUp = /^(why|what about|how about|do that|the (first|second|last) one|make it|explain that|what if|okay|ok|yeah|nah|never mind)\b/i.test(text);
  if (!isFollowUp) return { isFollowUp: false, topic: null };

  const previousUserMessage = [...context.conversation.history]
    .reverse()
    .find((item) => item.role === "user");

  return {
    isFollowUp: true,
    topic: context.conversation.currentTopic || previousUserMessage?.content || null,
  };
}

function detectIntent(message, context = getContext()) {
  const text = normalizeMessage(message);
  const followUp = getFollowUpTopic(text, context);

  if (!text) return { intent: "conversation", followUp };

  if (followUp.isFollowUp && context.conversation.lastIntent) {
    return { intent: context.conversation.lastIntent, followUp };
  }

  // Explicit emotional/support needs take priority.
  if (patterns.supportive.some((p) => p.test(text)) && !/\b(discipl|motivat|routine|goal)\w*/i.test(text)) {
    return { intent: "supportive", followUp };
  }

  if (patterns.motivational.some((p) => p.test(text))) {
    return { intent: "motivational", followUp };
  }

  if (patterns.reminder.some((p) => p.test(text))) {
    return { intent: "reminder", followUp };
  }

  // Explicit actions take priority over questions.
  if (patterns.task.some((p) => p.test(text))) {
    return { intent: "task", followUp };
  }

  for (const intent of ["finance", "travel", "health", "documents", "cooking", "writing", "decision"]) {
    if (patterns[intent].some((pattern) => pattern.test(text))) {
      return { intent, followUp };
    }
  }

  if (patterns.design.some((p) => p.test(text))) {
    return { intent: "design", followUp };
  }

  if (patterns.business.some((p) => p.test(text))) {
    return { intent: "business", followUp };
  }

  if (patterns.research.some((p) => p.test(text))) {
    return { intent: "research", followUp };
  }

  if (patterns.debate.some((p) => p.test(text))) {
    return { intent: "debate", followUp };
  }

  if (patterns.creative.some((p) => p.test(text))) {
    return { intent: "creative", followUp };
  }

  if (patterns.learning.some((p) => p.test(text))) {
    return { intent: "learning", followUp };
  }

  return { intent: "conversation", followUp };
}

export function analyzeMessage(message) {
  const context = getContext();
  const normalizedMessage = normalizeMessage(message);
  const detection = detectIntent(normalizedMessage, context);
  const intent = detection.intent;

  const modeMap = {
    task: "strategic",
    reminder: "daily_assistant",
    learning: "teacher",
    design: "creative",
    business: "strategic",
    research: "strategic",
    debate: "strategic",
    creative: "creative",
    supportive: "supportive",
    motivational: "motivational",
    finance: "finance",
    travel: "travel",
    health: "health",
    documents: "documents",
    cooking: "cooking",
    writing: "writing",
    decision: "decision",
    conversation: "strategic",
  };

  const mode = modeMap[intent];
  const highImpactAction = /\b(send|delete|buy|purchase|unlock|open the door|turn off|disable|publish|post|join|record|transfer|pay|share publicly)\b/i.test(normalizedMessage);
  const riskLevel = highImpactAction ? "high" : intent === "task" ? "medium" : "low";

  return {
    message: normalizedMessage,
    normalizedMessage,
    type:
      intent === "task"
        ? "task"
        : intent === "conversation"
          ? "conversation"
          : intent,
    intent,
    mode,
    confidence: intent === "conversation" ? 0.6 : 0.9,
    modeDefinition: getMode(mode),
    shouldExecute: intent === "task" || intent === "reminder",
    riskLevel,
    requiresConfirmation: highImpactAction,
    requiredPermission: intent === "task" ? "task.execute" : null,
    agentId: agentAssignments[intent],
    complexity:
      normalizedMessage.split(/\s+/).filter(Boolean).length > 18 ||
      /\b(and|then|also|compare|research|step by step|in depth)\b/i.test(normalizedMessage)
        ? "complex"
        : "simple",
    isFollowUp: detection.followUp.isFollowUp,
    currentTopic: detection.followUp.topic || normalizedMessage || context.conversation.currentTopic,
    requestedOutcome: intent === "task" ? "execution" : "response",
  };
}

export default {
  normalizeMessage,
  analyzeMessage,
};
