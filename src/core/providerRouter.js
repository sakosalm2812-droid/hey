import {
  listModels,
  PROVIDER_CAPABILITIES,
  registerProvider,
} from "./providerRegistry.js";
import { INFERENCE_PROFILES } from "./modelPlatform.js";

const taskCapabilities = {
  coding: PROVIDER_CAPABILITIES.coding,
  research: PROVIDER_CAPABILITIES.reasoning,
  vision: PROVIDER_CAPABILITIES.vision,
  image: PROVIDER_CAPABILITIES.image,
  conversation: PROVIDER_CAPABILITIES.chat,
};

function registerConfiguredProviders() {
  if (listModels({ enabledOnly: false }).length) return;

  registerProvider({
    id: "openrouter",
    name: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1",
    capabilities: ["chat", "reasoning", "coding", "vision", "long_context", "image"],
    models: [{ id: "configured", label: "Configured model", priority: 10 }],
  });
  registerProvider({
    id: "gemini",
    name: "Google Gemini",
    endpoint: "https://generativelanguage.googleapis.com",
    capabilities: ["chat", "reasoning", "vision", "long_context", "image"],
    models: [{ id: "configured", label: "Configured model", priority: 20 }],
  });
  registerProvider({
    id: "groq",
    name: "Groq",
    endpoint: "https://api.groq.com/openai/v1",
    capabilities: ["chat", "reasoning", "coding"],
    models: [{ id: "configured", label: "Configured model", priority: 30 }],
  });
}

function profileRejection(model, { policy, privacyMode, budgetUsd }) {
  if (privacyMode !== "allow_cloud" && model.local !== true) return "privacy_requires_local_model";
  if (!policy) return null;
  const evidence = model.routingEvidence;
  if (!evidence || typeof evidence !== "object") return "missing_routing_evidence";
  const { latencyP95Ms, qualityScore, inputUsdPerMillion, outputUsdPerMillion } = evidence;
  if (![latencyP95Ms, qualityScore, inputUsdPerMillion, outputUsdPerMillion].every(Number.isFinite)) return "incomplete_routing_evidence";
  if (latencyP95Ms <= 0 || qualityScore < 0 || qualityScore > 1 || inputUsdPerMillion < 0 || outputUsdPerMillion < 0) return "invalid_routing_evidence";
  if (latencyP95Ms > policy.maxLatencyP95Ms) return "latency_budget_exceeded";
  if (qualityScore < policy.minQualityScore) return "quality_floor_not_met";
  const estimatedCostUsd = (policy.inputTokenBudget * inputUsdPerMillion + policy.outputTokenBudget * outputUsdPerMillion) / 1_000_000;
  if (estimatedCostUsd > Math.min(policy.maxRequestCostUsd, budgetUsd ?? Infinity)) return "request_budget_exceeded";
  if (typeof evidence.evaluationRunId !== "string" || !evidence.evaluationRunId.trim()) return "missing_evaluation_provenance";
  return null;
}

export function selectModel({ intent = "conversation", capability, preferredProvider, excludedProviders = [], profile, privacyMode = "allow_cloud", budgetUsd } = {}) {
  registerConfiguredProviders();
  if (!new Set(["allow_cloud", "local_only", "no_cloud"]).has(privacyMode)) throw new TypeError("Unknown model privacy mode.");
  if (budgetUsd !== undefined && (typeof budgetUsd !== "number" || !Number.isFinite(budgetUsd) || budgetUsd < 0)) throw new TypeError("Model budget must be finite and non-negative.");
  if (profile !== undefined && !Object.hasOwn(INFERENCE_PROFILES, profile)) throw new TypeError("Unknown inference profile.");
  const profilePolicy = profile ? INFERENCE_PROFILES[profile] : null;
  const requestedCapability = capability || taskCapabilities[intent] || PROVIDER_CAPABILITIES.chat;
  const candidates = listModels({ capability: requestedCapability })
    .filter((model) => !excludedProviders.includes(model.providerId))
    .filter((model) => !profileRejection(model, { policy: profilePolicy, privacyMode, budgetUsd }))
    .sort((left, right) => {
      if (preferredProvider) {
        if (left.providerId === preferredProvider) return -1;
        if (right.providerId === preferredProvider) return 1;
      }
      return (left.priority || 100) - (right.priority || 100);
    });

  const selected = candidates[0] || null;
  return {
    selected,
    capability: requestedCapability,
    fallbacks: candidates.slice(1),
    requiresServerCredential: Boolean(selected),
    profile: profile || null,
    privacyMode,
    budgetUsd: budgetUsd ?? (profilePolicy ? profilePolicy.maxRequestCostUsd : null),
  };
}

export function createProviderPlan(options = {}) {
  const selection = selectModel(options);
  return {
    ...selection,
    attempts: [selection.selected, ...selection.fallbacks].filter(Boolean).map((model) => ({
      providerId: model.providerId,
      modelId: model.id,
    })),
    policy: {
      retryTransientFailures: true,
      maxAttempts: Math.min(3, selection.fallbacks.length + (selection.selected ? 1 : 0)),
      preserveConversation: true,
      profile: selection.profile,
      privacyMode: selection.privacyMode,
      budgetUsd: selection.budgetUsd,
    },
  };
}

export default { selectModel, createProviderPlan };
