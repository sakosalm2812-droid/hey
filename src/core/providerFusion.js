import { createProviderPlan, selectModel } from "./providerRouter.js";

export const FUSION_MODES = Object.freeze({
  AUTO: "auto",
  LOCAL_ONLY: "local_only",
  HYBRID: "hybrid",
  FUSION: "fusion",
  MANUAL: "manual",
});

const MAX_MODELS = 2;
const MAX_PROMPT_CHARS = 20_000;
const MAX_OUTPUT_CHARS = 8_000;

function result(status, details = {}) {
  return { status, ...details };
}

function normalizeEvidence(evidence) {
  if (!Array.isArray(evidence)) return [];
  return evidence.slice(0, 32).flatMap((item) => {
    if (!item || typeof item.claimId !== "string" || !item.claimId.trim()) return [];
    if (typeof item.statement !== "string" || !item.statement.trim()) return [];
    if (!(typeof item.value === "string" || typeof item.value === "number" || typeof item.value === "boolean" || item.value === null)) return [];
    return [{
      claimId: item.claimId.slice(0, 120),
      statement: item.statement.slice(0, 500),
      value: item.value,
      source: typeof item.source === "string" ? item.source.slice(0, 200) : null,
    }];
  });
}

function validProviderOutput(output) {
  return output && typeof output === "object" &&
    typeof output.text === "string" && output.text.length > 0 &&
    output.text.length <= MAX_OUTPUT_CHARS &&
    Number.isFinite(output.confidence) && output.confidence >= 0 && output.confidence <= 1;
}

function findConflicts(outputs) {
  const claims = new Map();
  const conflicts = [];
  for (const { providerId, evidence } of outputs) {
    for (const item of evidence) {
      const key = item.claimId.toLocaleLowerCase("en-US");
      const previous = claims.get(key);
      if (previous && !Object.is(previous.value, item.value)) {
        conflicts.push({
          claimId: item.claimId,
          first: { providerId: previous.providerId, value: previous.value, source: previous.source },
          second: { providerId, value: item.value, source: item.source },
        });
      } else if (!previous) {
        claims.set(key, { providerId, value: item.value, source: item.source });
      }
    }
  }
  return conflicts;
}

function eligibleModels(mode, models, { manualProvider, permissions, sensitive }) {
  const allowed = models.filter((model) => {
    const isLocal = model.local === true;
    if (!permissions.includes(isLocal ? "provider.local" : "provider.remote")) return false;
    if (!permissions.includes(`provider:${model.providerId}`)) return false;
    if (sensitive && !isLocal) return false;
    if (mode === FUSION_MODES.LOCAL_ONLY && !isLocal) return false;
    if (mode === FUSION_MODES.MANUAL && model.providerId !== manualProvider) return false;
    return true;
  });

  if (mode === FUSION_MODES.HYBRID) {
    const local = allowed.find((model) => model.local === true);
    const remote = allowed.find((model) => model.local !== true);
    return local && remote ? [local, remote] : [];
  }
  return allowed;
}

/**
 * Execute a bounded, sequential primary/checker collaboration using the existing
 * provider registry and router. Provider adapters are injected so this API never
 * invents a real model connection or bypasses the server-side credential boundary.
 */
export async function runProviderFusion({
  prompt,
  intent = "conversation",
  mode = FUSION_MODES.AUTO,
  manualProvider,
  accountScope,
  sensitive = false,
  permissions = [],
  requireIndependentCheck = false,
  synthesize,
  signal,
  isCurrent = () => true,
  invoke,
  maxCostUsd = 0.05,
  minConfidence = 0.72,
} = {}) {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT_CHARS) {
    return result("invalid_request", { reason: "prompt_invalid" });
  }
  if (typeof accountScope !== "string" || !accountScope.trim()) {
    return result("denied", { reason: "account_scope_required" });
  }
  if (!Object.values(FUSION_MODES).includes(mode)) {
    return result("unsupported_mode", { mode });
  }
  if (mode === FUSION_MODES.MANUAL && (!manualProvider || typeof manualProvider !== "string")) {
    return result("invalid_request", { reason: "manual_provider_required" });
  }
  if (mode === FUSION_MODES.HYBRID && sensitive) {
    return result("denied", { reason: "sensitive_prompt_cannot_leave_device" });
  }
  if (!Array.isArray(permissions) || typeof invoke !== "function") {
    return result("invalid_request", { reason: "provider_contract_required" });
  }
  if (!Number.isFinite(maxCostUsd) || maxCostUsd < 0 || !Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    return result("invalid_request", { reason: "budget_or_threshold_invalid" });
  }
  if (signal?.aborted) return result("cancelled");

  // Use the canonical selector to keep capability and preference semantics aligned
  // with normal HEY routing; then apply the extra fusion/privacy eligibility rules.
  const basePlan = mode === FUSION_MODES.MANUAL
    ? { ...selectModel({ intent, preferredProvider: manualProvider }), attempts: [] }
    : createProviderPlan({ intent });
  const candidates = eligibleModels(mode, basePlan.selected ? [basePlan.selected, ...basePlan.fallbacks] : [], {
    manualProvider,
    permissions,
    sensitive,
  }).filter((model, index, models) => models.findIndex((candidate) => candidate.providerId === model.providerId) === index);
  const selected = mode === FUSION_MODES.MANUAL
    ? candidates.slice(0, 1)
    : candidates.slice(0, MAX_MODELS);

  if (!selected.length && sensitive) {
    return result("denied", { reason: "sensitive_prompt_requires_permitted_local_provider" });
  }
  if (!selected.length) return result("unsupported_mode", { mode, reason: "no_permitted_provider" });
  if ((mode === FUSION_MODES.FUSION || mode === FUSION_MODES.HYBRID || requireIndependentCheck) && selected.length < 2) {
    return result("unsupported_mode", { mode, reason: "independent_provider_unavailable" });
  }
  const planned = selected;
  let reservedCostUsd = 0;
  let dispatchedCalls = 0;
  const outputs = [];
  let primaryFailed = false;
  for (let index = 0; index < planned.length; index += 1) {
    const model = planned[index];
    const shouldCall = index === 0 || (primaryFailed || (
      mode === FUSION_MODES.FUSION || requireIndependentCheck ||
      outputs[0]?.confidence < minConfidence || outputs[0]?.evidence.length === 0
    ));
    if (!shouldCall) break;
    if (signal?.aborted || !isCurrent(accountScope)) return result("cancelled");

    const estimate = model.maxCostUsd;
    if (!Number.isFinite(estimate) || estimate < 0) {
      return result("budget_unpriced", { calls: outputs.length, reservedCostUsd });
    }
    if (reservedCostUsd + estimate > maxCostUsd) {
      return result("budget_exhausted", { calls: outputs.length, reservedCostUsd });
    }
    reservedCostUsd += estimate;

    let raw;
    try {
      dispatchedCalls += 1;
      raw = await invoke({
        providerId: model.providerId,
        modelId: model.id,
        prompt,
        accountScope,
        signal,
        maxCostUsd: estimate,
        maxOutputChars: MAX_OUTPUT_CHARS,
      });
    } catch {
      if (signal?.aborted || !isCurrent(accountScope)) return result("cancelled");
      if (outputs.length) break;
      primaryFailed = true;
      continue;
    }
    if (signal?.aborted || !isCurrent(accountScope)) return result("cancelled");
    if (!validProviderOutput(raw) || (raw.costUsd !== undefined && (!Number.isFinite(raw.costUsd) || raw.costUsd < 0 || raw.costUsd > estimate))) {
      return result("provider_contract_invalid", { calls: outputs.length + 1, reservedCostUsd });
    }
    outputs.push({
      providerId: model.providerId,
      modelId: model.id,
      text: raw.text,
      confidence: raw.confidence,
      evidence: normalizeEvidence(raw.evidence),
      costUsd: raw.costUsd ?? estimate,
      latencyMs: Number.isFinite(raw.latencyMs) && raw.latencyMs >= 0 ? raw.latencyMs : null,
    });
  }

  if (!outputs.length) return result("provider_unavailable", { calls: dispatchedCalls, reservedCostUsd });
  const conflicts = findConflicts(outputs);
  const independentlyChecked = outputs.length > 1;
  if (conflicts.length) {
    return result("conflict", {
      answer: null,
      reason: "providers_disagree",
      evidence: outputs.flatMap(({ providerId, evidence }) => evidence.map((item) => ({ ...item, providerId }))),
      conflicts,
      confidence: Math.min(...outputs.map((output) => output.confidence)),
      independentlyChecked,
      providers: outputs.map(({ providerId, modelId }) => ({ providerId, modelId })),
      costUsd: outputs.reduce((total, output) => total + output.costUsd, 0),
      latencyMs: outputs.reduce((total, output) => total + (output.latencyMs || 0), 0),
    });
  }

  const primary = outputs[0];
  const verifier = outputs[1];
  let answer = primary.text;
  let synthesis = "primary_consensus";
  if (verifier && typeof synthesize === "function") {
    try {
      answer = await synthesize({
        primary: { text: primary.text, confidence: primary.confidence, evidence: primary.evidence },
        checker: { text: verifier.text, confidence: verifier.confidence, evidence: verifier.evidence },
      });
    } catch {
      return result("synthesis_failed", { reason: "local_synthesizer_failed", calls: outputs.length, reservedCostUsd });
    }
    if (signal?.aborted || !isCurrent(accountScope)) return result("cancelled");
    if (typeof answer !== "string" || !answer.trim() || answer.length > MAX_OUTPUT_CHARS) {
      return result("synthesis_invalid", { reason: "synthesized_answer_invalid", calls: outputs.length, reservedCostUsd });
    }
    synthesis = "local_synthesizer";
  }
  return result("complete", {
    answer,
    evidence: outputs.flatMap(({ providerId, evidence }) => evidence.map((item) => ({ ...item, providerId }))),
    confidence: verifier ? Math.min(primary.confidence, verifier.confidence) : primary.confidence,
    independentlyChecked,
    synthesis,
    providers: outputs.map(({ providerId, modelId }) => ({ providerId, modelId })),
    costUsd: outputs.reduce((total, output) => total + output.costUsd, 0),
    latencyMs: outputs.reduce((total, output) => total + (output.latencyMs || 0), 0),
    reservedCostUsd,
  });
}

export default { FUSION_MODES, runProviderFusion };
