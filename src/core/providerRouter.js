import {
  listModels,
  PROVIDER_CAPABILITIES,
  registerProvider,
  isProviderEnabled,
  isRegisteredModelSnapshot,
} from "./providerRegistry.js";
import { INFERENCE_PROFILES, isVerifiedEvaluationReport } from "./modelPlatform.js";
import { getProviderPermissionSnapshot, isProviderModelPermitted } from "./permissionManager.js";
import { getAccountScope } from "./accountScope.js";

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

function normalizeAllowedProviders(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError("Allowed provider ids must be a plain array.");
  }
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  const keys = Reflect.ownKeys(value);
  if (!Number.isSafeInteger(length) || length > 100 || keys.length !== length + 1) {
    throw new TypeError("Allowed provider ids must be dense and contain at most 100 entries.");
  }
  const ids = [];
  const seen = new Set();
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    const providerId = descriptor?.value;
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || typeof providerId !== "string"
      || !providerId.trim() || providerId !== providerId.trim() || providerId.length > 128
      || Array.from(providerId).some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) {
      throw new TypeError("Allowed provider ids must be dense, non-empty strings without accessors.");
    }
    if (seen.has(providerId)) throw new TypeError("Allowed provider ids must be unique.");
    seen.add(providerId);
    ids.push(providerId);
  }
  return Object.freeze(ids);
}

function profileRejection(model, { policy, privacyMode, budgetUsd, allowedProviders, permissionSnapshot }) {
  if (privacyMode !== "allow_cloud" && model.local !== true) return "privacy_requires_local_model";
  if (!policy) return null;
  if (!isProviderEnabled(model.providerId) || !isRegisteredModelSnapshot(model)) return "provider_not_registered_or_disabled";
  if (!allowedProviders.has(model.providerId)) return "provider_not_permitted";
  if (!isProviderModelPermitted(permissionSnapshot, model)) return "provider_permission_missing_or_stale";
  const evidence = model.routingEvidence;
  if (!evidence || typeof evidence !== "object") return "missing_routing_evidence";
  const report = model.evaluationReport;
  if (!isVerifiedEvaluationReport(report) || report.reportDigest !== evidence.evaluationReportDigest
    || report.evaluation.runId !== evidence.evaluationRunId || report.modelId !== model.id
    || report.modelRevision !== model.revision || report.modelWeightSha256 !== model.weightSha256?.toLowerCase()) return "missing_or_stale_evaluation_provenance";
  const { latencyP95Ms, qualityScore, inputUsdPerMillion, outputUsdPerMillion } = evidence;
  if (![latencyP95Ms, qualityScore, inputUsdPerMillion, outputUsdPerMillion].every(Number.isFinite)) return "incomplete_routing_evidence";
  if (latencyP95Ms <= 0 || qualityScore < 0 || qualityScore > 1 || inputUsdPerMillion < 0 || outputUsdPerMillion < 0) return "invalid_routing_evidence";
  if (latencyP95Ms > policy.maxLatencyP95Ms) return "latency_budget_exceeded";
  if (qualityScore < policy.minQualityScore) return "quality_floor_not_met";
  if (report.evaluation.latencyP95Ms !== latencyP95Ms || report.evaluation.qualityScore !== qualityScore
    || report.inputUsdPerMillion !== inputUsdPerMillion || report.outputUsdPerMillion !== outputUsdPerMillion) return "stale_evaluation_provenance";
  const evaluatedAt = Date.parse(report.evaluation.evaluatedAt);
  const ageMs = Date.now() - evaluatedAt;
  if (!Number.isFinite(evaluatedAt) || ageMs < 0 || ageMs > policy.maxEvaluationAgeMs) return "stale_evaluation_provenance";
  const estimatedCostUsd = (policy.inputTokenBudget * inputUsdPerMillion + policy.outputTokenBudget * outputUsdPerMillion) / 1_000_000;
  if (estimatedCostUsd > Math.min(policy.maxRequestCostUsd, budgetUsd ?? Infinity)) return "request_budget_exceeded";
  if (typeof evidence.evaluationRunId !== "string" || !evidence.evaluationRunId.trim()) return "missing_evaluation_provenance";
  return null;
}

export function selectModelFromSnapshot(models, { intent = "conversation", capability, preferredProvider, excludedProviders = [], allowedProviders = [], profile, privacyMode = "allow_cloud", budgetUsd } = {}) {
  if (!new Set(["allow_cloud", "local_only", "no_cloud"]).has(privacyMode)) throw new TypeError("Unknown model privacy mode.");
  if (budgetUsd !== undefined && (typeof budgetUsd !== "number" || !Number.isFinite(budgetUsd) || budgetUsd < 0)) throw new TypeError("Model budget must be finite and non-negative.");
  if (profile !== undefined && !Object.hasOwn(INFERENCE_PROFILES, profile)) throw new TypeError("Unknown inference profile.");
  const allowedProviderIds = normalizeAllowedProviders(allowedProviders);
  const profilePolicy = profile ? INFERENCE_PROFILES[profile] : null;
  const allowedProviderSet = new Set(allowedProviderIds);
  const permissionSnapshot = getProviderPermissionSnapshot(listModels(), getAccountScope());
  const requestedCapability = capability || taskCapabilities[intent] || PROVIDER_CAPABILITIES.chat;
  const candidates = (Array.isArray(models) ? models : [])
    .filter((model) => !Array.isArray(model.capabilities) || model.capabilities.includes(requestedCapability))
    .filter((model) => !excludedProviders.includes(model.providerId))
    .filter((model) => !profileRejection(model, { policy: profilePolicy, privacyMode, budgetUsd, allowedProviders: allowedProviderSet, permissionSnapshot }))
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
    allowedProviders: profile ? allowedProviderIds : Object.freeze([]),
    permissionSnapshot,
    budgetUsd: budgetUsd ?? (profilePolicy ? profilePolicy.maxRequestCostUsd : null),
  };
}

export function selectModel(options = {}) {
  registerConfiguredProviders();
  const requestedCapability = options.capability || taskCapabilities[options.intent || "conversation"] || PROVIDER_CAPABILITIES.chat;
  return selectModelFromSnapshot(listModels({ capability: requestedCapability }), options);
}

export function createProviderPlan(options = {}, providerModels) {
  const selection = Array.isArray(providerModels)
    ? selectModelFromSnapshot(providerModels, options)
    : selectModel(options);
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
      allowedProviders: selection.allowedProviders,
      permissionRevision: selection.permissionSnapshot?.permissionRevision ?? null,
    },
  };
}

export default { selectModel, createProviderPlan };
