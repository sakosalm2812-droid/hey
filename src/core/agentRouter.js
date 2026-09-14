import agents, {
  getAgentById,
  getAllAgents,
  getActivatedAgentIds,
  isAgentAvailable,
} from "../../agents/agents.js";
import { analyzeMessage } from "./messageRouter.js";
import {
  setActiveAgent,
  setActiveMode,
} from "./contextManager.js";
import { getRealToolsForAgent } from "./agentToolMap.js";

const DEFAULT_AGENT_ID = "architect";

const COLLABORATION_RULES = [
  {
    test: /\b(research|compare|best|which|investigate|find|lookup)\b/i,
    ids: ["researcher", "analyst", "strategist"],
  },
  {
    test: /\b(build|website|app|code|program|develop|implement|software)\b/i,
    ids: ["architect", "builder", "tester"],
  },
  {
    test: /\b(design|ui|ux|brand|visual|interface|layout)\b/i,
    ids: ["designer", "ux", "builder"],
  },
  {
    test: /\b(write|content|story|video|script|copy|article)\b/i,
    ids: ["writer", "creator", "editor"],
  },
];

function uniqueAgents(agentList) {
  const seen = new Set();

  return agentList.filter((agent) => {
    if (!agent?.id || seen.has(agent.id)) {
      return false;
    }

    seen.add(agent.id);
    return true;
  });
}

/**
 * The pool of agents the brain may route to.
 *
 * If the user explicitly activated specialists,
 * only those participate. When nothing is
 * activated the full available workforce is
 * used. Activation is a routing preference,
 * not a security boundary.
 */
function getCandidateAgents() {
  const pool = getAllAgents().filter(
    (agent) => isAgentAvailable(agent.id),
  );

  const activated = getActivatedAgentIds();

  if (!activated.length) {
    return pool;
  }

  const preferred = pool.filter((agent) =>
    activated.includes(agent.id),
  );

  return preferred.length ? preferred : pool;
}

function resolvePrimaryAgent(analysis) {
  const requestedId =
    analysis?.agentId || DEFAULT_AGENT_ID;

  const pool = getCandidateAgents();

  return (
    pool.find((agent) => agent.id === requestedId) ||
    pool.find((agent) => agent.id === DEFAULT_AGENT_ID) ||
    pool[0] ||
    agents?.[0] ||
    null
  );
}

function getAgentTeam(message, primaryAgent, analysis) {
  if (!primaryAgent) {
    return [];
  }

  const text = String(message || "");

  const matchingRules = COLLABORATION_RULES.filter(
    (rule) => rule.test.test(text),
  );

  const ruleAgentIds = matchingRules.flatMap(
    (rule) => rule.ids,
  );

  /*
   * The primary agent always participates.
   * Matching multiple domains allows HEY to
   * form a real multidisciplinary team.
   */
  const requestedIds = [
    primaryAgent.id,
    ...ruleAgentIds,
    ...(Array.isArray(analysis?.agentTeam)
      ? analysis.agentTeam
      : []),
  ];

  const resolved = requestedIds
    .map((id) =>
      typeof id === "string"
        ? getAgentById(id)
        : null,
    )
    .filter(Boolean);

  const poolIds = new Set(
    getCandidateAgents().map(
      (agent) => agent.id,
    ),
  );

  return uniqueAgents([
    primaryAgent,
    ...resolved.filter((agent) =>
      poolIds.has(agent.id),
    ),
  ]);
}

function scoreAgent(agent, message, analysis) {
  if (!agent) {
    return 0;
  }

  let score = 0;

  const text = String(message || "").toLowerCase();

  if (
    analysis?.agentId &&
    agent.id === analysis.agentId
  ) {
    score += 100;
  }

  if (
    analysis?.intent &&
    Array.isArray(agent.intents) &&
    agent.intents.some(
      (intent) =>
        String(intent).toLowerCase() ===
        String(analysis.intent).toLowerCase(),
    )
  ) {
    score += 40;
  }

  if (Array.isArray(agent.keywords)) {
    for (const keyword of agent.keywords) {
      if (
        text.includes(
          String(keyword).toLowerCase(),
        )
      ) {
        score += 10;
      }
    }
  }

  if (Array.isArray(agent.capabilities)) {
    for (const capability of agent.capabilities) {
      if (
        text.includes(
          String(capability).toLowerCase(),
        )
      ) {
        score += 3;
      }
    }
  }

  return score;
}

function selectBestAgent(
  message,
  analysis,
  fallback,
) {
  const pool = getCandidateAgents();

  if (!pool.length) {
    return fallback;
  }

  const ranked = pool
    .map((agent) => ({
      agent,
      score: scoreAgent(
        agent,
        message,
        analysis,
      ),
    }))
    .sort(
      (a, b) => b.score - a.score,
    );

  return (
    ranked[0]?.score > 0
      ? ranked[0].agent
      : fallback
  );
}

function buildRoutingReason(
  agent,
  analysis,
  team,
) {
  const intent =
    analysis?.intent || "general";

  const teamNames = team
    .filter(
      (member) =>
        member?.id !== agent?.id,
    )
    .map(
      (member) => member.name,
    );

  const collaboration =
    teamNames.length
      ? ` Supporting agents: ${teamNames.join(", ")}.`
      : "";

  return (
    `Selected ${agent?.name || "general intelligence"} ` +
    `for the ${intent} intent with ` +
    `${Math.round(
      Number(analysis?.confidence || 0) * 100,
    )}% confidence.` +
    collaboration
  );
}

export function routeToAgent(
  message,
  existingAnalysis = null,
) {
  const analysis =
    existingAnalysis ||
    analyzeMessage(message);

  let primaryAgent =
    resolvePrimaryAgent(analysis);

  /*
   * If the analyzer did not provide a useful
   * agent, use capability-based ranking.
   */
  if (
    !analysis?.agentId ||
    !getAgentById(analysis.agentId)
  ) {
    primaryAgent = selectBestAgent(
      message,
      analysis,
      primaryAgent,
    );
  }

  if (!primaryAgent) {
    return {
      intent: analysis?.intent || "unknown",
      mode: analysis?.mode || "chat",
      confidence:
        analysis?.confidence ?? 0,
      agent: null,
      agents: [],
      reason:
        "No registered agent is currently available for this request.",
    };
  }

  const team = getAgentTeam(
    message,
    primaryAgent,
    analysis,
  );

  const primaryTools = getRealToolsForAgent(primaryAgent);
  const teamTools = team.flatMap(getRealToolsForAgent);
  const allTools = Array.from(new Set([...primaryTools, ...teamTools]));

  setActiveAgent(primaryAgent);

  if (analysis?.mode) {
    setActiveMode(analysis.mode);
  }

  return {
    intent: analysis?.intent,
    mode: analysis?.mode,
    confidence: analysis?.confidence,
    agent: primaryAgent,
    agents: team,
    tools: allTools,
    primaryTools,
    reason: buildRoutingReason(
      primaryAgent,
      analysis,
      team,
    ),
  };
}

export function getAvailableAgents() {
  const pool = getCandidateAgents();

  return Array.isArray(pool) ? [...pool] : [];
}

export function getAgentRecommendation(
  message,
) {
  const result =
    routeToAgent(message);

  return {
    agentName:
      result.agent?.name || null,
    agent:
      result.agent || null,
    agents:
      result.agents || [],
    role:
      result.agent?.role || null,
    capabilities:
      result.agent?.capabilities || [],
    tools: result.tools || [],
    primaryTools: result.primaryTools || [],
    confidence:
      result.confidence ?? 0,
    intent:
      result.intent || null,
    mode:
      result.mode || null,
    reason:
      result.reason || null,
  };
}

export function getAgentTeamForTask(
  message,
) {
  return routeToAgent(message).agents;
}

export function canAgentHandle(
  agentId,
  message,
) {
  const agent =
    getAgentById(agentId);

  if (!agent) {
    return false;
  }

  const analysis =
    analyzeMessage(message);

  return (
    scoreAgent(
      agent,
      message,
      analysis,
    ) > 0
  );
}

export default {
  routeToAgent,
  getAvailableAgents,
  getAgentRecommendation,
  getAgentTeamForTask,
  canAgentHandle,
  getRealToolsForAgent,
};