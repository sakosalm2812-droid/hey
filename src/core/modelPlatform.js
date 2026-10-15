const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,199}$/;
const MAX_EVALUATION_CASES = 1_000;
const MAX_CASE_LATENCY_MS = 3_600_000;
const verifiedEvaluationReports = new WeakSet();

export const INFERENCE_PROFILES = Object.freeze({
  fast: Object.freeze({
    id: "fast",
    maxLatencyP95Ms: 1_200,
    maxRequestCostUsd: 0.0025,
    maxEvaluationAgeMs: 30 * 24 * 60 * 60 * 1_000,
    minQualityScore: 0.65,
    inputTokenBudget: 1_000,
    outputTokenBudget: 500,
  }),
  balanced: Object.freeze({
    id: "balanced",
    maxLatencyP95Ms: 4_000,
    maxRequestCostUsd: 0.01,
    maxEvaluationAgeMs: 30 * 24 * 60 * 60 * 1_000,
    minQualityScore: 0.8,
    inputTokenBudget: 2_000,
    outputTokenBudget: 1_000,
  }),
  maximum_quality: Object.freeze({
    id: "maximum_quality",
    maxLatencyP95Ms: 20_000,
    maxRequestCostUsd: 0.05,
    maxEvaluationAgeMs: 30 * 24 * 60 * 60 * 1_000,
    minQualityScore: 0.9,
    inputTokenBudget: 4_000,
    outputTokenBudget: 2_000,
  }),
});

// Candidate research is deliberately not a routing recommendation: HEY has no
// locally reproduced benchmark or hardware inventory to justify a winner.
export const OPEN_MODEL_CANDIDATES = Object.freeze([
  Object.freeze({
    id: "Qwen/Qwen3-4B",
    revision: "main (pin an immutable commit before deployment)",
    license: "Apache-2.0",
    licenseUrl: "https://huggingface.co/Qwen/Qwen3-4B/blob/main/LICENSE",
    sourceUrl: "https://huggingface.co/Qwen/Qwen3-4B",
    parameterCount: 4_000_000_000,
    hardwareAssumption: "At bf16, weights alone are approximately 8 GB decimal; runtime, KV cache, and context add memory. This is a theoretical floor, not a tested device requirement.",
    status: "candidate_not_selected",
  }),
  Object.freeze({
    id: "mistralai/Mistral-Small-3.1-24B-Instruct-2503",
    revision: "main (pin an immutable commit before deployment)",
    license: "Apache-2.0",
    licenseUrl: "https://huggingface.co/mistralai/Mistral-Small-3.1-24B-Instruct-2503/blob/main/LICENSE",
    sourceUrl: "https://huggingface.co/mistralai/Mistral-Small-3.1-24B-Instruct-2503",
    parameterCount: 24_000_000_000,
    hardwareAssumption: "The publisher reports about 55 GB GPU RAM at bf16/fp16 and quantized operation on a 32 GB MacBook; reproduce against intended serving stack before adopting.",
    status: "candidate_not_selected",
  }),
]);

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required.`);
  return value.trim();
}

function requireHash(value, label) {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) throw new TypeError(`${label} must be a SHA-256 hex digest.`);
  return value.toLowerCase();
}

function snapshotData(value, label, active = new WeakSet(), depth = 0, budget = { properties: 0 }) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object") throw new TypeError(`${label} must contain only JSON-compatible data.`);
  if (depth > 32) throw new TypeError(`${label} exceeds the maximum nesting depth.`);
  if (active.has(value)) throw new TypeError(`${label} cannot contain cycles.`);
  active.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError(`${label} cannot contain array subclasses.`);
      const keys = Reflect.ownKeys(value);
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
      const length = lengthDescriptor?.value;
      if (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1) throw new TypeError(`${label} arrays must be dense and have no extra properties.`);
      const copy = [];
      for (let index = 0; index < length; index += 1) {
        budget.properties += 1;
        if (budget.properties > 10_000) throw new TypeError(`${label} exceeds the maximum property count.`);
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label} arrays cannot be sparse or contain accessors.`);
        copy.push(snapshotData(descriptor.value, label, active, depth + 1, budget));
      }
      return Object.freeze(copy);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must use plain objects, not mutable class containers.`);
    const keys = Reflect.ownKeys(value);
    const copy = {};
    for (const key of keys) {
      if (typeof key !== "string") throw new TypeError(`${label} cannot contain symbol properties.`);
      budget.properties += 1;
      if (budget.properties > 10_000) throw new TypeError(`${label} exceeds the maximum property count.`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label} cannot contain accessors or hidden properties.`);
      Object.defineProperty(copy, key, {
        configurable: false,
        enumerable: true,
        writable: false,
        value: snapshotData(descriptor.value, label, active, depth + 1, budget),
      });
    }
    return Object.freeze(copy);
  } finally {
    active.delete(value);
  }
}

function snapshotObject(value, label) {
  const snapshot = snapshotData(value, label);
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new TypeError(`${label} must be a plain object.`);
  return snapshot;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

async function sha256Canonical(value) {
  if (!globalThis.crypto?.subtle || typeof globalThis.TextEncoder !== "function") {
    throw new Error("Web Crypto is required to seal evaluation reports.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value)));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function requireExactKeys(value, expectedKeys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} contains missing or unsupported fields.`);
  }
}

function requireFiniteNonNegative(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a finite non-negative number.`);
  }
  return value;
}

function requireCanonicalTimestamp(value, label) {
  const timestamp = requireText(value, label);
  const date = Date.parse(timestamp);
  if (!Number.isFinite(date) || new Date(date).toISOString() !== timestamp) {
    throw new TypeError(`${label} must be canonical ISO-8601 UTC.`);
  }
  return timestamp;
}

function percentileNearestRank(sortedValues, percentile) {
  return sortedValues[Math.max(0, Math.ceil(percentile * sortedValues.length) - 1)];
}

/**
 * Derive content-free quality, latency, usage, and cost evidence from one
 * bounded evaluation run. The inputs are observations supplied by the caller;
 * this function does not execute a model or verify their external origin.
 */
export async function createEvaluationReport(input) {
  const source = snapshotObject(input, "Evaluation run");
  const model = snapshotObject(source.model, "Evaluation model");
  const modelId = requireText(model.id, "Evaluation model id");
  if (!MODEL_ID_PATTERN.test(modelId)) throw new TypeError("Evaluation model id has an unsupported format.");
  const modelRevision = requireText(model.revision, "Immutable evaluation model revision");
  if (/^(main|master|latest|stable)$/i.test(modelRevision)) throw new TypeError("Evaluation model revision must be immutable.");
  const modelWeightSha256 = requireHash(model.weightSha256, "Evaluation model weight hash");
  const suite = requireText(source.suite, "Evaluation suite");
  const suiteRevision = requireText(source.suiteRevision, "Evaluation suite revision");
  const datasetSha256 = requireHash(source.datasetSha256, "Evaluation dataset hash");
  const evaluatedAt = requireCanonicalTimestamp(source.evaluatedAt, "Evaluation timestamp");
  const hardware = requireText(source.hardware, "Evaluation hardware");
  const runtime = requireText(source.runtime, "Evaluation runtime");
  const runtimeVersion = requireText(source.runtimeVersion, "Evaluation runtime version");
  if (/^(main|master|latest|stable)$/i.test(runtimeVersion)) throw new TypeError("Evaluation runtime version must be pinned.");
  const runId = requireText(source.runId, "Evaluation run id");
  const pricing = snapshotObject(source.pricing, "Evaluation pricing");
  const inputUsdPerMillion = requireFiniteNonNegative(pricing.inputUsdPerMillion, "Input token price");
  const outputUsdPerMillion = requireFiniteNonNegative(pricing.outputUsdPerMillion, "Output token price");
  if (!Array.isArray(source.samples) || source.samples.length === 0 || source.samples.length > MAX_EVALUATION_CASES) {
    throw new TypeError(`Evaluation samples must contain between 1 and ${MAX_EVALUATION_CASES} cases.`);
  }

  const caseIds = new Set();
  const measuredRows = [];
  let passedCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const latencies = [];
  for (const sample of source.samples) {
    const entry = snapshotObject(sample, "Evaluation sample");
    const caseId = requireText(entry.caseId, "Evaluation case id");
    if (caseIds.has(caseId)) throw new TypeError("Evaluation case ids must be unique.");
    caseIds.add(caseId);
    if (typeof entry.passed !== "boolean") throw new TypeError("Evaluation case passed must be a boolean verdict.");
    if (entry.passed) passedCount += 1;
    if (typeof entry.latencyMs !== "number" || !Number.isFinite(entry.latencyMs) || entry.latencyMs <= 0 || entry.latencyMs > MAX_CASE_LATENCY_MS) {
      throw new TypeError("Evaluation case latencyMs must be positive, finite, and at most one hour.");
    }
    for (const [field, label] of [["inputTokens", "Input tokens"], ["outputTokens", "Output tokens"]]) {
      if (!Number.isSafeInteger(entry[field]) || entry[field] < 0) throw new TypeError(`${label} must be a non-negative safe integer.`);
    }
    inputTokens += entry.inputTokens;
    outputTokens += entry.outputTokens;
    if (!Number.isSafeInteger(inputTokens) || !Number.isSafeInteger(outputTokens)) throw new TypeError("Evaluation token totals exceed the safe integer range.");
    latencies.push(entry.latencyMs);
    measuredRows.push([entry.passed, entry.latencyMs, entry.inputTokens, entry.outputTokens]);
  }

  latencies.sort((left, right) => left - right);
  const totalCostUsd = (inputTokens * inputUsdPerMillion + outputTokens * outputUsdPerMillion) / 1_000_000;
  if (!Number.isFinite(totalCostUsd)) throw new TypeError("Evaluation cost is outside the supported numeric range.");
  const sampleCount = source.samples.length;
  const measurementsDigest = await sha256Canonical(measuredRows.sort((left, right) => {
    const leftKey = canonicalJson(left);
    const rightKey = canonicalJson(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  }));
  const evaluation = Object.freeze({
    suite,
    suiteRevision,
    datasetSha256,
    evaluatedAt,
    qualityScore: passedCount / sampleCount,
    latencyP95Ms: percentileNearestRank(latencies, 0.95),
    hardware,
    runtime,
    runtimeVersion,
    runId,
    measurementsDigest,
  });
  const report = {
    schemaVersion: 1,
    modelId,
    modelRevision,
    modelWeightSha256,
    evaluation,
    sampleCount,
    passedCount,
    failedCount: sampleCount - passedCount,
    latencyP50Ms: percentileNearestRank(latencies, 0.5),
    latencyP95Ms: evaluation.latencyP95Ms,
    latencyP99Ms: percentileNearestRank(latencies, 0.99),
    inputTokens,
    outputTokens,
    inputUsdPerMillion,
    outputUsdPerMillion,
    totalCostUsd,
    averageCostUsd: totalCostUsd / sampleCount,
  };
  report.reportDigest = await sha256Canonical(report);
  return Object.freeze(report);
}

/** Return a detached report snapshot only when its canonical digest is valid. */
export async function getVerifiedEvaluationReport(input) {
  try {
    const report = snapshotObject(input, "Evaluation report");
    requireExactKeys(report, [
      "schemaVersion", "modelId", "modelRevision", "modelWeightSha256", "evaluation", "sampleCount", "passedCount", "failedCount",
      "latencyP50Ms", "latencyP95Ms", "latencyP99Ms", "inputTokens", "outputTokens", "inputUsdPerMillion", "outputUsdPerMillion",
      "totalCostUsd", "averageCostUsd", "reportDigest",
    ], "Evaluation report");
    requireExactKeys(report.evaluation, [
      "suite", "suiteRevision", "datasetSha256", "evaluatedAt", "qualityScore", "latencyP95Ms", "hardware", "runtime", "runtimeVersion", "runId", "measurementsDigest",
    ], "Evaluation metadata");
    if (report.schemaVersion !== 1 || !MODEL_ID_PATTERN.test(requireText(report.modelId, "Model id"))) return null;
    requireText(report.modelRevision, "Model revision");
    if (/^(main|master|latest|stable)$/i.test(report.modelRevision)) return null;
    requireHash(report.modelWeightSha256, "Model weight hash");
    requireHash(report.evaluation.datasetSha256, "Dataset hash");
    if (typeof report.evaluation.measurementsDigest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(report.evaluation.measurementsDigest)) return null;
    requireCanonicalTimestamp(report.evaluation.evaluatedAt, "Evaluation timestamp");
    requireText(report.evaluation.suite, "Evaluation suite");
    requireText(report.evaluation.suiteRevision, "Evaluation suite revision");
    requireText(report.evaluation.hardware, "Evaluation hardware");
    requireText(report.evaluation.runtime, "Evaluation runtime");
    requireText(report.evaluation.runtimeVersion, "Evaluation runtime version");
    if (/^(main|master|latest|stable)$/i.test(report.evaluation.runtimeVersion)) return null;
    requireText(report.evaluation.runId, "Evaluation run id");
    if (!Number.isSafeInteger(report.sampleCount) || report.sampleCount < 1 || report.sampleCount > MAX_EVALUATION_CASES
      || !Number.isSafeInteger(report.passedCount) || report.passedCount < 0 || report.passedCount > report.sampleCount
      || report.failedCount !== report.sampleCount - report.passedCount
      || report.evaluation.qualityScore !== report.passedCount / report.sampleCount
      || report.evaluation.latencyP95Ms !== report.latencyP95Ms
      || ![report.latencyP50Ms, report.latencyP95Ms, report.latencyP99Ms].every((value) => Number.isFinite(value) && value > 0)
      || report.latencyP50Ms > report.latencyP95Ms || report.latencyP95Ms > report.latencyP99Ms
      || !Number.isSafeInteger(report.inputTokens) || report.inputTokens < 0
      || !Number.isSafeInteger(report.outputTokens) || report.outputTokens < 0) return null;
    const inputUsdPerMillion = requireFiniteNonNegative(report.inputUsdPerMillion, "Input token price");
    const outputUsdPerMillion = requireFiniteNonNegative(report.outputUsdPerMillion, "Output token price");
    const expectedCost = (report.inputTokens * inputUsdPerMillion + report.outputTokens * outputUsdPerMillion) / 1_000_000;
    if (!Number.isFinite(expectedCost) || report.totalCostUsd !== expectedCost || report.averageCostUsd !== expectedCost / report.sampleCount) return null;
    if (typeof report.reportDigest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(report.reportDigest)) return null;
    const { reportDigest, ...body } = report;
    if (await sha256Canonical(body) !== reportDigest) return null;
    verifiedEvaluationReports.add(report);
    return report;
  } catch {
    return null;
  }
}

/** Verify the canonical, content-free digest on a previously created report. */
export async function verifyEvaluationReport(input) {
  return Boolean(await getVerifiedEvaluationReport(input));
}

/** True only for detached reports accepted by the canonical verifier in this runtime. */
export function isVerifiedEvaluationReport(report) {
  return Boolean(report && typeof report === "object" && verifiedEvaluationReports.has(report));
}

/** Validate and freeze reproducible model/version/evaluation metadata. */
export function createModelRecord(input) {
  const source = snapshotObject(input, "Model metadata");
  const id = requireText(source.id, "Model id");
  if (!MODEL_ID_PATTERN.test(id)) throw new TypeError("Model id has an unsupported format.");
  const revision = requireText(source.revision, "Immutable model revision");
  if (/^(main|master|latest|stable)$/i.test(revision)) throw new TypeError("Model revision must be immutable, not a moving tag.");
  const license = requireText(source.license, "Model license");
  const sourceUrl = new URL(requireText(source.sourceUrl, "Model source URL"));
  if (sourceUrl.protocol !== "https:") throw new TypeError("Model source URL must use HTTPS.");
  const evaluation = source.evaluation;
  if (!evaluation || typeof evaluation !== "object") throw new TypeError("A reproducible evaluation record is required.");
  const qualityScore = evaluation.qualityScore;
  if (typeof qualityScore !== "number" || !Number.isFinite(qualityScore) || qualityScore < 0 || qualityScore > 1) {
    throw new TypeError("Evaluation qualityScore must be between 0 and 1.");
  }
  const record = {
    schemaVersion: 1,
    id,
    revision,
    license,
    sourceUrl: sourceUrl.href,
    weightSha256: requireHash(source.weightSha256, "Weight artifact hash"),
    tokenizerRevision: requireText(source.tokenizerRevision, "Tokenizer revision"),
    runtimeCompatibility: Object.freeze([...(source.runtimeCompatibility || [])].map((item) => requireText(item, "Runtime compatibility entry"))),
    evaluation: Object.freeze({
      suite: requireText(evaluation.suite, "Evaluation suite"),
      suiteRevision: requireText(evaluation.suiteRevision, "Evaluation suite revision"),
      datasetSha256: requireHash(evaluation.datasetSha256, "Evaluation dataset hash"),
      evaluatedAt: requireText(evaluation.evaluatedAt, "Evaluation timestamp"),
      qualityScore,
      latencyP95Ms: evaluation.latencyP95Ms,
      hardware: requireText(evaluation.hardware, "Evaluation hardware"),
      runId: requireText(evaluation.runId, "Evaluation run id"),
    }),
  };
  const date = Date.parse(record.evaluation.evaluatedAt);
  if (!Number.isFinite(date) || new Date(date).toISOString() !== record.evaluation.evaluatedAt) throw new TypeError("Evaluation timestamp must be canonical ISO-8601 UTC.");
  if (typeof record.evaluation.latencyP95Ms !== "number" || !Number.isFinite(record.evaluation.latencyP95Ms) || record.evaluation.latencyP95Ms <= 0) {
    throw new TypeError("Evaluation latencyP95Ms must be a positive measured value.");
  }
  return Object.freeze(record);
}

/**
 * Produce a portable PEFT artifact manifest. This records provenance and the
 * cross-runtime serving contract; it does not train, load, or claim an adapter.
 */
export function createAdapterManifest(input) {
  const source = snapshotObject(input, "Adapter manifest");
  if (!new Set(["lora", "qlora"]).has(source.method)) throw new TypeError("Adapter method must be lora or qlora.");
  const manifest = {
    schemaVersion: 1,
    method: source.method,
    baseModelId: requireText(source.baseModelId, "Base model id"),
    baseModelRevision: requireText(source.baseModelRevision, "Immutable base model revision"),
    adapterArtifactSha256: requireHash(source.adapterArtifactSha256, "Adapter artifact hash"),
    adapterConfigSha256: requireHash(source.adapterConfigSha256, "Adapter config hash"),
    trainingCodeRevision: requireText(source.trainingCodeRevision, "Training code revision"),
    datasetManifestSha256: requireHash(source.datasetManifestSha256, "Dataset manifest hash"),
    datasetLicenseReview: requireText(source.datasetLicenseReview, "Dataset license review id"),
    framework: requireText(source.framework, "Training framework"),
    frameworkVersion: requireText(source.frameworkVersion, "Training framework version"),
    quantization: source.method === "qlora" ? requireText(source.quantization, "QLoRA quantization configuration") : null,
    serving: Object.freeze({
      format: requireText(source.serving?.format, "Adapter serving format"),
      protocol: requireText(source.serving?.protocol, "Inference protocol"),
      runtimes: Object.freeze([...(source.serving?.runtimes || [])].map((runtime) => requireText(runtime, "Supported inference runtime"))),
    }),
    evaluationRunId: requireText(source.evaluationRunId, "Adapter evaluation run id"),
  };
  if (/^(main|master|latest|stable)$/i.test(manifest.baseModelRevision)) throw new TypeError("Base model revision must be immutable.");
  if (!manifest.serving.runtimes.length) throw new TypeError("At least one compatible inference runtime is required.");
  return Object.freeze(manifest);
}

/**
 * Validate a concrete serving target against adapter provenance before a
 * deployment is configured. This is a metadata check only; it does not probe
 * the server or claim that the adapter was trained or loaded successfully.
 */
export function createAdapterServingTarget(manifestInput, targetInput) {
  const manifest = createAdapterManifest(manifestInput);
  const target = snapshotObject(targetInput, "Adapter serving target");
  const runtime = requireText(target.runtime, "Serving runtime");
  const runtimeVersion = requireText(target.runtimeVersion, "Serving runtime version");
  const protocol = requireText(target.protocol, "Serving protocol");
  const baseModelId = requireText(target.baseModelId, "Serving base model id");
  const baseModelRevision = requireText(target.baseModelRevision, "Serving base model revision");
  if (/^(main|master|latest|stable)$/i.test(runtimeVersion)) throw new TypeError("Serving runtime version must be pinned, not a moving tag.");
  if (/^(main|master|latest|stable)$/i.test(baseModelRevision)) throw new TypeError("Serving base model revision must be immutable.");
  if (!manifest.serving.runtimes.includes(runtime)) throw new Error("Adapter does not declare compatibility with this serving runtime.");
  if (manifest.serving.protocol !== protocol) throw new Error("Serving protocol does not match the adapter portability contract.");
  if (manifest.baseModelId !== baseModelId || manifest.baseModelRevision !== baseModelRevision) {
    throw new Error("Serving base model does not match the adapter provenance.");
  }
  return Object.freeze({
    schemaVersion: 1,
    runtime,
    runtimeVersion,
    protocol,
    baseModelId,
    baseModelRevision,
    adapterArtifactSha256: manifest.adapterArtifactSha256,
    adapterConfigSha256: manifest.adapterConfigSha256,
  });
}

/** Build a constrained request for the existing OpenAI-compatible serving seam. */
export function createInferenceRequest(options = {}) {
  const source = snapshotObject(options, "Inference request options");
  const { model, messages, profile = "balanced", privacyMode = "allow_cloud", budgetUsd } = source;
  if (!model || typeof model.id !== "string" || !model.id.trim()) throw new TypeError("A selected model is required.");
  if (!Array.isArray(messages) || messages.length === 0) throw new TypeError("At least one inference message is required.");
  if (!new Set(["allow_cloud", "local_only", "no_cloud"]).has(privacyMode)) throw new TypeError("Unknown inference privacy mode.");
  if (privacyMode !== "allow_cloud" && model.local !== true) throw new Error("Local-only privacy policy forbids this remote model.");
  if (!Object.hasOwn(INFERENCE_PROFILES, profile)) throw new TypeError("Unknown inference profile.");
  const profilePolicy = INFERENCE_PROFILES[profile];
  if (budgetUsd !== undefined && (typeof budgetUsd !== "number" || !Number.isFinite(budgetUsd) || budgetUsd < 0)) {
    throw new TypeError("Inference budget must be a finite non-negative USD amount.");
  }
  const evidence = model.routingEvidence;
  if (!evidence || ![evidence.latencyP95Ms, evidence.qualityScore, evidence.inputUsdPerMillion, evidence.outputUsdPerMillion].every(Number.isFinite)) {
    throw new Error("Model lacks measured latency, quality, or pricing evidence for this profile.");
  }
  if (evidence.latencyP95Ms <= 0 || evidence.qualityScore < 0 || evidence.qualityScore > 1 || evidence.inputUsdPerMillion < 0 || evidence.outputUsdPerMillion < 0) {
    throw new Error("Model has invalid latency, quality, or pricing evidence.");
  }
  if (evidence.latencyP95Ms > profilePolicy.maxLatencyP95Ms || evidence.qualityScore < profilePolicy.minQualityScore) {
    throw new Error("Model does not meet the selected profile constraints.");
  }
  const estimatedCostUsd = (profilePolicy.inputTokenBudget * evidence.inputUsdPerMillion + profilePolicy.outputTokenBudget * evidence.outputUsdPerMillion) / 1_000_000;
  if (estimatedCostUsd > Math.min(profilePolicy.maxRequestCostUsd, budgetUsd ?? Infinity)) throw new Error("Model exceeds the selected inference budget.");
  return Object.freeze({
    model: model.id,
    messages,
    metadata: Object.freeze({
      heyProfile: profile,
      maxLatencyP95Ms: profilePolicy.maxLatencyP95Ms,
      maxRequestCostUsd: Math.min(profilePolicy.maxRequestCostUsd, budgetUsd ?? Infinity),
      estimatedCostUsd,
      privacyMode,
    }),
  });
}
