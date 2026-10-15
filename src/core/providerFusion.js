import { createProviderPlan, selectModel, selectModelFromSnapshot } from "./providerRouter.js";

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
const MAX_CONFLICTS = 16;
const MAX_PROVIDER_TIMEOUT_MS = 20_000;
const MAX_REQUEST_DURATION_MS = 40_000;

function result(status, details = {}) {
  return { status, ...details };
}

function strictDataRecord(value, allowedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowedKeys.includes(key))) return null;
  const result = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
    result[key] = descriptor.value;
  }
  return result;
}

function strictDataArray(value, maxItems) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maxItems) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys.some((key) => key !== "length" && !/^(0|[1-9]\d*)$/.test(key))) return null;
  const items = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
    items.push(descriptor.value);
  }
  return items;
}

function parseProviderOutput(output, maxCostUsd) {
  try {
    const record = strictDataRecord(output, ["text", "confidence", "evidence", "costUsd", "latencyMs"]);
    if (!record || typeof record.text !== "string" || !record.text.trim() || record.text.length > MAX_OUTPUT_CHARS) return null;
    if (!Number.isFinite(record.confidence) || record.confidence < 0 || record.confidence > 1) return null;
    if (record.costUsd !== undefined && (!Number.isFinite(record.costUsd) || record.costUsd < 0 || record.costUsd > maxCostUsd)) return null;
    if (record.latencyMs !== undefined && (!Number.isFinite(record.latencyMs) || record.latencyMs < 0)) return null;

    let evidence = [];
    if (record.evidence !== undefined) {
      const items = strictDataArray(record.evidence, 32);
      if (!items) return null;
      evidence = [];
      for (const item of items) {
        const evidenceRecord = strictDataRecord(item, ["claimId", "statement", "value", "source"]);
        if (!evidenceRecord || typeof evidenceRecord.claimId !== "string" || !evidenceRecord.claimId.trim() || evidenceRecord.claimId.length > 120) return null;
        if (typeof evidenceRecord.statement !== "string" || !evidenceRecord.statement.trim() || evidenceRecord.statement.length > 500) return null;
        if (!(typeof evidenceRecord.value === "string" || typeof evidenceRecord.value === "number" || typeof evidenceRecord.value === "boolean" || evidenceRecord.value === null)) return null;
        if (typeof evidenceRecord.value === "number" && !Number.isFinite(evidenceRecord.value)) return null;
        if (evidenceRecord.source !== undefined && evidenceRecord.source !== null && (typeof evidenceRecord.source !== "string" || evidenceRecord.source.length > 200)) return null;
        evidence.push(Object.freeze({
          claimId: evidenceRecord.claimId,
          statement: evidenceRecord.statement,
          value: evidenceRecord.value,
          source: typeof evidenceRecord.source === "string" ? evidenceRecord.source : null,
        }));
      }
    }
    return {
      text: record.text,
      confidence: record.confidence,
      evidence: Object.freeze(evidence),
      costUsd: record.costUsd ?? maxCostUsd,
      latencyMs: record.latencyMs ?? null,
    };
  } catch {
    return null;
  }
}

function hasBoundAnswerEvidence(output) {
  if (output.text !== output.text.trim()) return false;
  const answerClaims = output.evidence.filter((item) => item.claimId.toLocaleLowerCase("en-US") === "answer");
  return answerClaims.length === 1 && typeof answerClaims[0].value === "string" && answerClaims[0].value === output.text;
}

async function invokeWithTimeout(invoke, request, parentSignal, timeoutMs) {
  const controller = new AbortController();
  if (parentSignal?.aborted) throw new Error("Provider request cancelled");
  let timeoutId;
  let rejectAbort;
  const abortPromise = new Promise((_, reject) => { rejectAbort = reject; });
  const abortParent = () => {
    controller.abort(parentSignal?.reason);
    rejectAbort(new Error("Provider request cancelled"));
  };
  parentSignal?.addEventListener("abort", abortParent, { once: true });
  if (parentSignal?.aborted) {
    controller.abort(parentSignal.reason);
    parentSignal?.removeEventListener("abort", abortParent);
    throw new Error("Provider request cancelled");
  }
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort(new Error("Provider timeout"));
      const error = new Error("Provider timeout");
      error.providerTimeout = true;
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => invoke({ ...request, signal: controller.signal })),
      abortPromise,
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timeoutId);
    parentSignal?.removeEventListener("abort", abortParent);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function findConflicts(outputs) {
  const claims = new Map();
  const conflicts = [];
  const reportedClaims = new Set();
  let truncated = false;
  for (const { providerId, evidence } of outputs) {
    for (const item of evidence) {
      const key = item.claimId.toLocaleLowerCase("en-US");
      let providerClaims = claims.get(key);
      if (!providerClaims) {
        providerClaims = new Map();
        claims.set(key, providerClaims);
      }
      // Repeated evidence from one provider is not independent corroboration and
      // must not multiply the conflict report for the same claim.
      if (providerClaims.has(providerId)) continue;
      const previous = Array.from(providerClaims.values())[0];
      providerClaims.set(providerId, { providerId, value: item.value, source: item.source });
      if (previous && !Object.is(previous.value, item.value) && !reportedClaims.has(key)) {
        reportedClaims.add(key);
        if (conflicts.length < MAX_CONFLICTS) {
          conflicts.push({
            claimId: item.claimId,
            first: { providerId: previous.providerId, value: previous.value, source: previous.source },
            second: { providerId, value: item.value, source: item.source },
          });
        } else {
          truncated = true;
        }
      }
    }
  }
  return { conflicts, truncated };
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
  providerModels,
  requireIndependentCheck = false,
  synthesize,
  signal,
  isCurrent = () => true,
  invoke,
  maxCostUsd = 0.05,
  minConfidence = 0.72,
  providerTimeoutMs = MAX_PROVIDER_TIMEOUT_MS,
  maxDurationMs = MAX_REQUEST_DURATION_MS,
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
  if (typeof isCurrent !== "function") return result("invalid_request", { reason: "scope_fence_required" });
  if (!Number.isFinite(maxCostUsd) || maxCostUsd < 0 || !Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    return result("invalid_request", { reason: "budget_or_threshold_invalid" });
  }
  if (!Number.isSafeInteger(providerTimeoutMs) || providerTimeoutMs < 1 || providerTimeoutMs > MAX_PROVIDER_TIMEOUT_MS ||
    !Number.isSafeInteger(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > MAX_REQUEST_DURATION_MS) {
    return result("invalid_request", { reason: "time_budget_invalid" });
  }
  if (signal?.aborted) return result("cancelled");

  const isScopeCurrent = () => {
    try {
      return isCurrent(accountScope) === true;
    } catch {
      return false;
    }
  };

  // Use the canonical selector to keep capability and preference semantics aligned
  // with normal HEY routing; then apply the extra fusion/privacy eligibility rules.
  const basePlan = mode === FUSION_MODES.MANUAL
    ? { ...(Array.isArray(providerModels)
      ? selectModelFromSnapshot(providerModels, { intent, preferredProvider: manualProvider })
      : selectModel({ intent, preferredProvider: manualProvider })), attempts: [] }
    : createProviderPlan({ intent }, providerModels);
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
  if (selected.some((model) => typeof model.providerId !== "string" || !model.providerId.trim() || typeof model.id !== "string" || !model.id.trim())) {
    return result("unsupported_mode", { mode, reason: "provider_provenance_unavailable" });
  }
  const planned = selected;
  const startedAt = performance.now();
  let reservedCostUsd = 0;
  let dispatchedCalls = 0;
  const outputs = [];
  let primaryFailed = false;
  let independentCheckRequired = mode === FUSION_MODES.FUSION || mode === FUSION_MODES.HYBRID || requireIndependentCheck;
  for (let index = 0; index < planned.length; index += 1) {
    const model = planned[index];
    const shouldCall = index === 0 || (primaryFailed || (
      mode === FUSION_MODES.FUSION || requireIndependentCheck ||
      mode === FUSION_MODES.HYBRID || outputs[0]?.confidence < minConfidence
    ));
    if (!shouldCall) break;
    if (signal?.aborted || !isScopeCurrent()) return result("cancelled");
    const elapsedMs = performance.now() - startedAt;
    const remainingMs = maxDurationMs - elapsedMs;
    if (remainingMs <= 0) {
      return independentCheckRequired && outputs.length ? result("verification_unavailable", { reason: "time_budget_exhausted", calls: dispatchedCalls, reservedCostUsd })
        : result("time_budget_exhausted", { calls: dispatchedCalls, reservedCostUsd });
    }

    const estimate = model.maxCostUsd;
    if (!Number.isFinite(estimate) || estimate < 0) {
      return result("budget_unpriced", { calls: dispatchedCalls, reservedCostUsd });
    }
    if (reservedCostUsd + estimate > maxCostUsd) {
      return result("budget_exhausted", { calls: dispatchedCalls, reservedCostUsd });
    }
    reservedCostUsd += estimate;

    let raw;
    try {
      dispatchedCalls += 1;
      raw = await invokeWithTimeout(invoke, {
        providerId: model.providerId,
        modelId: model.id,
        prompt,
        accountScope,
        maxCostUsd: estimate,
        maxOutputChars: MAX_OUTPUT_CHARS,
      }, signal, Math.min(providerTimeoutMs, remainingMs));
    } catch (error) {
      if (signal?.aborted || !isScopeCurrent()) return result("cancelled");
      if (error?.providerTimeout && outputs.length && independentCheckRequired) {
        return result("verification_unavailable", { reason: "provider_timeout", calls: dispatchedCalls, reservedCostUsd });
      }
      if (outputs.length) break;
      primaryFailed = true;
      continue;
    }
    if (signal?.aborted || !isScopeCurrent()) return result("cancelled");
    const parsedOutput = parseProviderOutput(raw, estimate);
    if (!parsedOutput) {
      return result("provider_contract_invalid", { calls: dispatchedCalls, reservedCostUsd });
    }
    if (!parsedOutput.evidence.length) {
      return result("inconclusive", { reason: "candidate_evidence_missing", calls: dispatchedCalls, reservedCostUsd });
    }
    if (index === 0 && !primaryFailed) {
      if (mode === FUSION_MODES.FUSION || mode === FUSION_MODES.HYBRID || requireIndependentCheck || parsedOutput.confidence < minConfidence) {
        independentCheckRequired = true;
        if (!hasBoundAnswerEvidence(parsedOutput)) {
          return result("provider_contract_invalid", { reason: "candidate_answer_not_bound_to_evidence", calls: dispatchedCalls, reservedCostUsd });
        }
      }
    } else if (independentCheckRequired && !hasBoundAnswerEvidence(parsedOutput)) {
      return result("provider_contract_invalid", { reason: "checker_answer_not_bound_to_evidence", calls: dispatchedCalls, reservedCostUsd });
    }
    outputs.push({
      providerId: model.providerId,
      modelId: model.id,
      ...parsedOutput,
    });
  }

  if (!outputs.length) return result("provider_unavailable", { calls: dispatchedCalls, reservedCostUsd });
  if (independentCheckRequired && outputs.length < 2) {
    return result("verification_unavailable", { reason: "independent_provider_failed", calls: dispatchedCalls, reservedCostUsd });
  }
  const { conflicts, truncated: conflictsTruncated } = findConflicts(outputs);
  const independentlyChecked = outputs.length > 1;
  if (conflicts.length) {
    return result("conflict", {
      answer: null,
      reason: "providers_disagree",
      evidence: outputs.flatMap(({ providerId, evidence }) => evidence.map((item) => ({ ...item, providerId }))),
      conflicts,
      conflictsTruncated,
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
      const remainingSynthesisMs = maxDurationMs - (performance.now() - startedAt);
      if (remainingSynthesisMs <= 0) return result("time_budget_exhausted", { calls: dispatchedCalls, reservedCostUsd });
      answer = await invokeWithTimeout(() => synthesize(deepFreeze({
        primary: { text: primary.text, confidence: primary.confidence, evidence: primary.evidence },
        checker: { text: verifier.text, confidence: verifier.confidence, evidence: verifier.evidence },
      })), {}, signal, Math.min(providerTimeoutMs, remainingSynthesisMs));
    } catch {
      return result("synthesis_failed", { reason: "local_synthesizer_failed", calls: outputs.length, reservedCostUsd });
    }
    if (signal?.aborted || !isScopeCurrent()) return result("cancelled");
    if (typeof answer !== "string" || !answer.trim() || answer.length > MAX_OUTPUT_CHARS) {
      return result("synthesis_invalid", { reason: "synthesized_answer_invalid", calls: outputs.length, reservedCostUsd });
    }
    if (independentCheckRequired && answer !== primary.text) {
      return result("synthesis_invalid", { reason: "synthesized_answer_not_bound_to_verified_claim", calls: outputs.length, reservedCostUsd });
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
