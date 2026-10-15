import test from "node:test";
import assert from "node:assert/strict";
import { clearProviders, registerProvider } from "../src/core/providerRegistry.js";
import { selectModel, createProviderPlan } from "../src/core/providerRouter.js";
import { createAdapterManifest, createInferenceRequest, createModelRecord, INFERENCE_PROFILES, OPEN_MODEL_CANDIDATES } from "../src/core/modelPlatform.js";

const HASH = "a".repeat(64);
const VALID_MODEL = {
  id: "hey/qwen-candidate",
  revision: "9b".repeat(20),
  license: "Apache-2.0",
  sourceUrl: "https://models.example/hey/qwen-candidate",
  weightSha256: HASH,
  tokenizerRevision: "tokenizer-3f7c",
  runtimeCompatibility: ["vllm-openai-compatible", "transformers"],
  evaluation: {
    suite: "hey-conformance-v1",
    suiteRevision: "suite-7a1c",
    datasetSha256: "b".repeat(64),
    evaluatedAt: "2026-10-14T12:00:00.000Z",
    qualityScore: 0.82,
    latencyP95Ms: 850,
    hardware: "fixture only; no model was executed",
    runId: "fixture-run-1",
  },
};

function model(id, evidence, local = false) {
  return { id, label: id, capabilities: ["chat"], local, routingEvidence: evidence };
}

const fastEvidence = { latencyP95Ms: 800, qualityScore: 0.78, inputUsdPerMillion: 0.4, outputUsdPerMillion: 0.8, evaluationRunId: "eval-fast" };

test("model metadata binds immutable weights, tokenizer, license, runtime, and evaluation provenance", () => {
  const record = createModelRecord(VALID_MODEL);
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.weightSha256, HASH);
  assert.equal(record.evaluation.datasetSha256, "b".repeat(64));
  assert.ok(Object.isFrozen(record));
  assert.ok(Object.isFrozen(record.runtimeCompatibility));
  assert.throws(() => createModelRecord({ ...VALID_MODEL, revision: "main" }), /immutable/i);
  assert.throws(() => createModelRecord({ ...VALID_MODEL, weightSha256: "not-a-hash" }), /SHA-256/i);
  assert.throws(() => createModelRecord({ ...VALID_MODEL, evaluation: { ...VALID_MODEL.evaluation, qualityScore: 1.2 } }), /qualityScore/i);
  assert.throws(() => createModelRecord({ ...VALID_MODEL, evaluation: { ...VALID_MODEL.evaluation, latencyP95Ms: 0 } }), /latencyP95Ms/i);
});

test("LoRA and QLoRA adapter manifests record portable, content-addressed provenance", () => {
  const manifest = createAdapterManifest({
    method: "qlora",
    baseModelId: "Qwen/Qwen3-4B",
    baseModelRevision: "9b".repeat(20),
    adapterArtifactSha256: HASH,
    adapterConfigSha256: "c".repeat(64),
    trainingCodeRevision: "trainer-17f8",
    datasetManifestSha256: "d".repeat(64),
    datasetLicenseReview: "review-2026-10-01",
    framework: "peft",
    frameworkVersion: "fixture-version",
    quantization: "4-bit NF4, double quantization; configuration only",
    serving: { format: "PEFT", protocol: "OpenAI-compatible chat completions", runtimes: ["vLLM", "Transformers"] },
    evaluationRunId: "eval-not-run-fixture",
  });
  assert.equal(manifest.method, "qlora");
  assert.deepEqual(manifest.serving.runtimes, ["vLLM", "Transformers"]);
  assert.ok(Object.isFrozen(manifest.serving));
  assert.throws(() => createAdapterManifest({ method: "qlora", baseModelId: "x", baseModelRevision: "latest" }), /SHA-256/i);
  assert.throws(() => createAdapterManifest({
    method: "lora", baseModelId: "x", baseModelRevision: "r1", adapterArtifactSha256: HASH,
    adapterConfigSha256: HASH, trainingCodeRevision: "r2", datasetManifestSha256: HASH,
    datasetLicenseReview: "review", framework: "peft", frameworkVersion: "1",
    serving: { format: "PEFT", protocol: "OpenAI", runtimes: [] }, evaluationRunId: "e1",
  }), /runtime/i);
});

test("Fast, Balanced, and Maximum Quality profiles are measurable constraints, not model claims", () => {
  assert.deepEqual(Object.keys(INFERENCE_PROFILES), ["fast", "balanced", "maximum_quality"]);
  assert.ok(INFERENCE_PROFILES.fast.maxLatencyP95Ms < INFERENCE_PROFILES.balanced.maxLatencyP95Ms);
  assert.ok(INFERENCE_PROFILES.maximum_quality.minQualityScore > INFERENCE_PROFILES.balanced.minQualityScore);
  assert.ok(OPEN_MODEL_CANDIDATES.every((candidate) => candidate.status === "candidate_not_selected"));
  assert.ok(OPEN_MODEL_CANDIDATES.every((candidate) => candidate.licenseUrl.startsWith("https://")));
});

test("canonical provider router applies profile limits, request budgets, fallback, and local-only privacy", () => {
  clearProviders();
  try {
    registerProvider({ id: "fixture", name: "Fixture", capabilities: ["chat"], models: [
      model("too-costly", { ...fastEvidence, inputUsdPerMillion: 5, outputUsdPerMillion: 5 }),
      model("too-slow", { ...fastEvidence, latencyP95Ms: 1_500 }),
      model("selected", fastEvidence),
      model("fallback", { ...fastEvidence, latencyP95Ms: 900, qualityScore: 0.7 }),
      model("local", { ...fastEvidence, qualityScore: 0.71 }, true),
    ] });
    const plan = createProviderPlan({ profile: "fast", budgetUsd: 0.002 });
    assert.equal(plan.selected.id, "selected");
    assert.deepEqual(plan.fallbacks.map(({ id }) => id), ["fallback", "local"]);
    assert.equal(plan.policy.profile, "fast");
    assert.equal(selectModel({ profile: "fast", budgetUsd: 0.0001 }).selected, null);
    assert.equal(selectModel({ profile: "fast", privacyMode: "local_only" }).selected.id, "local");
    assert.equal(selectModel({ profile: "fast", privacyMode: "local_only" }).fallbacks.length, 0);
    assert.equal(selectModel({ profile: "maximum_quality" }).selected, null, "models without measured quality above the profile floor fail closed");
    assert.equal(selectModel({ profile: "fast", privacyMode: "no_cloud" }).selected.id, "local");
  } finally {
    clearProviders();
  }
});

test("inference request seam binds privacy/profile/budget and does not leak a remote route for local-only", () => {
  const selected = model("fixture/remote", fastEvidence);
  const request = createInferenceRequest({ model: selected, messages: [{ role: "user", content: "hello" }], profile: "fast", budgetUsd: 0.002 });
  assert.equal(request.model, "fixture/remote");
  assert.equal(request.metadata.privacyMode, "allow_cloud");
  assert.equal(request.metadata.estimatedCostUsd, 0.0008);
  assert.throws(() => createInferenceRequest({ model: selected, messages: [{ role: "user", content: "secret" }], privacyMode: "local_only" }), /forbids/i);
  assert.throws(() => createInferenceRequest({ model: selected, messages: [{ role: "user", content: "hello" }], profile: "fast", budgetUsd: 0.0001 }), /budget/i);
  assert.throws(() => createInferenceRequest({ model: { id: "unmeasured" }, messages: [{ role: "user", content: "hello" }] }), /evidence/i);
});
