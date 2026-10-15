const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,199}$/;

export const INFERENCE_PROFILES = Object.freeze({
  fast: Object.freeze({
    id: "fast",
    maxLatencyP95Ms: 1_200,
    maxRequestCostUsd: 0.0025,
    minQualityScore: 0.65,
    inputTokenBudget: 1_000,
    outputTokenBudget: 500,
  }),
  balanced: Object.freeze({
    id: "balanced",
    maxLatencyP95Ms: 4_000,
    maxRequestCostUsd: 0.01,
    minQualityScore: 0.8,
    inputTokenBudget: 2_000,
    outputTokenBudget: 1_000,
  }),
  maximum_quality: Object.freeze({
    id: "maximum_quality",
    maxLatencyP95Ms: 20_000,
    maxRequestCostUsd: 0.05,
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

/** Validate and freeze reproducible model/version/evaluation metadata. */
export function createModelRecord(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Model metadata must be an object.");
  const id = requireText(input.id, "Model id");
  if (!MODEL_ID_PATTERN.test(id)) throw new TypeError("Model id has an unsupported format.");
  const revision = requireText(input.revision, "Immutable model revision");
  if (/^(main|master|latest|stable)$/i.test(revision)) throw new TypeError("Model revision must be immutable, not a moving tag.");
  const license = requireText(input.license, "Model license");
  const sourceUrl = new URL(requireText(input.sourceUrl, "Model source URL"));
  if (sourceUrl.protocol !== "https:") throw new TypeError("Model source URL must use HTTPS.");
  const evaluation = input.evaluation;
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
    weightSha256: requireHash(input.weightSha256, "Weight artifact hash"),
    tokenizerRevision: requireText(input.tokenizerRevision, "Tokenizer revision"),
    runtimeCompatibility: Object.freeze([...(input.runtimeCompatibility || [])].map((item) => requireText(item, "Runtime compatibility entry"))),
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
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Adapter manifest must be an object.");
  if (!new Set(["lora", "qlora"]).has(input.method)) throw new TypeError("Adapter method must be lora or qlora.");
  const manifest = {
    schemaVersion: 1,
    method: input.method,
    baseModelId: requireText(input.baseModelId, "Base model id"),
    baseModelRevision: requireText(input.baseModelRevision, "Immutable base model revision"),
    adapterArtifactSha256: requireHash(input.adapterArtifactSha256, "Adapter artifact hash"),
    adapterConfigSha256: requireHash(input.adapterConfigSha256, "Adapter config hash"),
    trainingCodeRevision: requireText(input.trainingCodeRevision, "Training code revision"),
    datasetManifestSha256: requireHash(input.datasetManifestSha256, "Dataset manifest hash"),
    datasetLicenseReview: requireText(input.datasetLicenseReview, "Dataset license review id"),
    framework: requireText(input.framework, "Training framework"),
    frameworkVersion: requireText(input.frameworkVersion, "Training framework version"),
    quantization: input.method === "qlora" ? requireText(input.quantization, "QLoRA quantization configuration") : null,
    serving: Object.freeze({
      format: requireText(input.serving?.format, "Adapter serving format"),
      protocol: requireText(input.serving?.protocol, "Inference protocol"),
      runtimes: Object.freeze([...(input.serving?.runtimes || [])].map((runtime) => requireText(runtime, "Supported inference runtime"))),
    }),
    evaluationRunId: requireText(input.evaluationRunId, "Adapter evaluation run id"),
  };
  if (manifest.baseModelRevision === "main" || manifest.baseModelRevision === "latest") throw new TypeError("Base model revision must be immutable.");
  if (!manifest.serving.runtimes.length) throw new TypeError("At least one compatible inference runtime is required.");
  return Object.freeze(manifest);
}

/** Build a constrained request for the existing OpenAI-compatible serving seam. */
export function createInferenceRequest({ model, messages, profile = "balanced", privacyMode = "allow_cloud", budgetUsd } = {}) {
  if (!model || typeof model.id !== "string") throw new TypeError("A selected model is required.");
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
  if (evidence.latencyP95Ms > profilePolicy.maxLatencyP95Ms || evidence.qualityScore < profilePolicy.minQualityScore) {
    throw new Error("Model does not meet the selected profile constraints.");
  }
  const estimatedCostUsd = (profilePolicy.inputTokenBudget * evidence.inputUsdPerMillion + profilePolicy.outputTokenBudget * evidence.outputUsdPerMillion) / 1_000_000;
  if (estimatedCostUsd > Math.min(profilePolicy.maxRequestCostUsd, budgetUsd ?? Infinity)) throw new Error("Model exceeds the selected inference budget.");
  return Object.freeze({
    model: model.id,
    messages: structuredClone(messages),
    metadata: Object.freeze({
      heyProfile: profile,
      maxLatencyP95Ms: profilePolicy.maxLatencyP95Ms,
      maxRequestCostUsd: Math.min(profilePolicy.maxRequestCostUsd, budgetUsd ?? Infinity),
      estimatedCostUsd,
      privacyMode,
    }),
  });
}
