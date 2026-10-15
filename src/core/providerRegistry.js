import { getVerifiedEvaluationReport } from "./modelPlatform.js";

const providers = new Map();

function ownDataValue(value, key) {
  if (!value || typeof value !== "object") return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor?.enumerable && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

export const PROVIDER_CAPABILITIES = {
  chat: "chat",
  reasoning: "reasoning",
  coding: "coding",
  vision: "vision",
  longContext: "long_context",
  image: "image",
};

function normalizeProvider(provider) {
  if (!provider?.id || !provider?.name) {
    throw new TypeError("A provider id and name are required.");
  }

  return {
    ...provider,
    capabilities: [...new Set(provider.capabilities || [PROVIDER_CAPABILITIES.chat])],
    models: Array.isArray(provider.models) ? provider.models : [],
    enabled: provider.enabled !== false,
  };
}

export function registerProvider(provider) {
  const normalized = normalizeProvider(provider);
  providers.set(normalized.id, normalized);
  return normalized;
}

/** Attach routing evidence only after a report digest and pinned model identity verify. */
export async function attachEvaluationReport(providerId, modelId, reportInput) {
  if (typeof providerId !== "string" || !providerId.trim() || typeof modelId !== "string" || !modelId.trim()) {
    throw new TypeError("Provider and model ids are required.");
  }
  const provider = providers.get(providerId);
  if (!provider) throw new Error("Provider is not registered.");
  const model = provider.models.find((candidate) => ownDataValue(candidate, "id") === modelId);
  if (!model) throw new Error("Model is not registered with this provider.");
  const revision = ownDataValue(model, "revision");
  const weightSha256 = ownDataValue(model, "weightSha256");
  if (typeof revision !== "string" || !revision.trim() || typeof weightSha256 !== "string" || !weightSha256.trim()) {
    throw new Error("Registered model must pin its revision and weight digest before evaluation can be attached.");
  }

  const report = await getVerifiedEvaluationReport(reportInput);
  if (!report) throw new Error("Evaluation report failed canonical digest verification.");
  if (report.modelId !== modelId || report.modelRevision !== revision || report.modelWeightSha256 !== weightSha256.toLowerCase()) {
    throw new Error("Evaluation report does not match the registered model revision and weight digest.");
  }
  if (providers.get(providerId) !== provider || !provider.models.includes(model)
    || ownDataValue(model, "revision") !== revision || ownDataValue(model, "weightSha256") !== weightSha256) {
    throw new Error("Provider model changed while the evaluation report was being verified.");
  }

  const evaluatedModel = Object.freeze({
    ...model,
    evaluationReport: report,
    routingEvidence: Object.freeze({
      latencyP95Ms: report.evaluation.latencyP95Ms,
      qualityScore: report.evaluation.qualityScore,
      inputUsdPerMillion: report.inputUsdPerMillion,
      outputUsdPerMillion: report.outputUsdPerMillion,
      evaluationRunId: report.evaluation.runId,
      evaluationReportDigest: report.reportDigest,
    }),
  });
  provider.models = provider.models.map((candidate) => candidate === model ? evaluatedModel : candidate);
  return evaluatedModel;
}

export function unregisterProvider(providerId) {
  return providers.delete(providerId);
}

export function getProvider(providerId) {
  return providers.get(providerId) || null;
}

export function listProviders({ enabledOnly = false } = {}) {
  return Array.from(providers.values()).filter((provider) => !enabledOnly || provider.enabled);
}

export function listModels({ capability, enabledOnly = true } = {}) {
  return listProviders({ enabledOnly })
    .filter((provider) => !capability || provider.capabilities.includes(capability))
    .flatMap((provider) => provider.models.map((model) => ({
      ...model,
      providerId: provider.id,
      providerName: provider.name,
      capabilities: model.capabilities || provider.capabilities,
    })));
}

export function clearProviders() {
  providers.clear();
}

export default {
  registerProvider,
  attachEvaluationReport,
  unregisterProvider,
  getProvider,
  listProviders,
  listModels,
  clearProviders,
  PROVIDER_CAPABILITIES,
};
