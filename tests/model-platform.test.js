import test from "node:test";
import assert from "node:assert/strict";
import { clearProviders, registerProvider } from "../src/core/providerRegistry.js";
import { selectModel, createProviderPlan } from "../src/core/providerRouter.js";
import { createAdapterManifest, createAdapterServingTarget, createInferenceRequest, createEvaluationReport, createModelRecord, INFERENCE_PROFILES, OPEN_MODEL_CANDIDATES } from "../src/core/modelPlatform.js";
import { HEY } from "../src/core/index.js";

test("HEY exposes the validated model serving target contract", () => {
  assert.equal(HEY.modelPlatform.createAdapterServingTarget, createAdapterServingTarget);
  assert.equal(HEY.modelPlatform.createEvaluationReport, createEvaluationReport);
});

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

function validEvaluationRun() {
  return {
    model: { id: "hey/qwen-candidate", revision: "9b".repeat(20), weightSha256: HASH },
    suite: "hey-conformance-v1",
    suiteRevision: "suite-7a1c",
    datasetSha256: "b".repeat(64),
    evaluatedAt: "2026-10-15T12:00:00.000Z",
    hardware: "fixture host; no model execution asserted",
    runId: "run-2026-10-15-1",
    pricing: { inputUsdPerMillion: 1, outputUsdPerMillion: 2 },
    samples: Array.from({ length: 20 }, (_, index) => ({
      caseId: `case-${index + 1}`,
      passed: index !== 2 && index !== 12,
      latencyMs: (index + 1) * 10,
      inputTokens: 100,
      outputTokens: 50,
    })),
  };
}

test("evaluation reports derive content-free model quality, p95 latency, and measured token cost", () => {
  const report = createEvaluationReport(validEvaluationRun());
  assert.equal(report.modelId, "hey/qwen-candidate");
  assert.equal(report.evaluation.qualityScore, 0.9);
  assert.equal(report.evaluation.latencyP95Ms, 190);
  assert.equal(report.latencyP50Ms, 100);
  assert.equal(report.latencyP99Ms, 200);
  assert.equal(report.inputTokens, 2_000);
  assert.equal(report.outputTokens, 1_000);
  assert.equal(report.totalCostUsd, 0.004);
  assert.equal(report.sampleCount, 20);
  assert.equal(report.passedCount, 18);
  assert.equal(report.failedCount, 2);
  assert.equal(Object.hasOwn(report, "samples"), false, "sample identifiers and content are not persisted in the report");
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.evaluation));

  const modelRecord = createModelRecord({
    ...VALID_MODEL,
    revision: report.modelRevision,
    weightSha256: report.modelWeightSha256,
    evaluation: report.evaluation,
  });
  assert.equal(modelRecord.evaluation.runId, report.evaluation.runId);
  assert.equal(modelRecord.evaluation.qualityScore, 0.9);
});

test("evaluation report rejects mutable, duplicate, incomplete, and oversized measurement inputs", () => {
  const getterRun = validEvaluationRun();
  let getterCalls = 0;
  Object.defineProperty(getterRun.samples[0], "latencyMs", { enumerable: true, get() { getterCalls += 1; return 10; } });
  assert.throws(() => createEvaluationReport(getterRun), /accessor/i);
  assert.equal(getterCalls, 0);

  const duplicate = validEvaluationRun();
  duplicate.samples[1].caseId = duplicate.samples[0].caseId;
  assert.throws(() => createEvaluationReport(duplicate), /unique/i);

  for (const [change, pattern] of [
    [(run) => { run.samples[0].latencyMs = 0; }, /latencyMs/i],
    [(run) => { run.samples[0].inputTokens = 1.5; }, /safe integer/i],
    [(run) => { run.samples[0].passed = "yes"; }, /boolean verdict/i],
    [(run) => { run.model.revision = "latest"; }, /immutable/i],
    [(run) => { run.evaluatedAt = "October 15 2026"; }, /canonical ISO-8601/i],
    [(run) => { run.samples = []; }, /between 1 and/i],
    [(run) => { run.samples = Array(20_001); }, /dense|sparse/i],
  ]) {
    const invalid = validEvaluationRun();
    change(invalid);
    assert.throws(() => createEvaluationReport(invalid), pattern);
  }

  const tooMany = validEvaluationRun();
  tooMany.samples = Array.from({ length: 1_001 }, (_, index) => ({
    caseId: `case-${index}`, passed: true, latencyMs: 1, inputTokens: 0, outputTokens: 0,
  }));
  assert.throws(() => createEvaluationReport(tooMany), /between 1 and 1000/i);

  const overflowingCost = validEvaluationRun();
  overflowingCost.pricing.outputUsdPerMillion = Number.MAX_VALUE;
  assert.throws(() => createEvaluationReport(overflowingCost), /numeric range/i);
});

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
  const adapterInput = {
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
  };
  const manifest = createAdapterManifest(adapterInput);
  assert.equal(manifest.method, "qlora");
  assert.deepEqual(manifest.serving.runtimes, ["vLLM", "Transformers"]);
  assert.ok(Object.isFrozen(manifest.serving));

  const servingTarget = createAdapterServingTarget(manifest, {
    runtime: "vLLM",
    runtimeVersion: "0.9.2",
    protocol: "OpenAI-compatible chat completions",
    baseModelId: "Qwen/Qwen3-4B",
    baseModelRevision: "9b".repeat(20),
  });
  assert.equal(servingTarget.adapterArtifactSha256, HASH);
  assert.equal(servingTarget.runtimeVersion, "0.9.2");
  assert.ok(Object.isFrozen(servingTarget));
  assert.throws(() => createAdapterServingTarget(manifest, {
    runtime: "llama.cpp", runtimeVersion: "b5000", protocol: "OpenAI-compatible chat completions",
    baseModelId: "Qwen/Qwen3-4B", baseModelRevision: "9b".repeat(20),
  }), /does not declare compatibility/i);
  assert.throws(() => createAdapterServingTarget(manifest, {
    runtime: "vLLM", runtimeVersion: "latest", protocol: "OpenAI-compatible chat completions",
    baseModelId: "Qwen/Qwen3-4B", baseModelRevision: "9b".repeat(20),
  }), /pinned/i);
  assert.throws(() => createAdapterServingTarget(manifest, {
    runtime: "vLLM", runtimeVersion: "0.9.2", protocol: "custom endpoint",
    baseModelId: "Qwen/Qwen3-4B", baseModelRevision: "9b".repeat(20),
  }), /protocol does not match/i);
  assert.throws(() => createAdapterServingTarget(manifest, {
    runtime: "vLLM", runtimeVersion: "0.9.2", protocol: "OpenAI-compatible chat completions",
    baseModelId: "Qwen/Qwen3-4B", baseModelRevision: "different-immutable-revision",
  }), /base model does not match/i);
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

test("model-platform inputs reject accessors without executing them", () => {
  let getterCalls = 0;
  const withGetter = (base, key, getter) => Object.defineProperty({ ...base }, key, { enumerable: true, get: getter });
  const accessorModel = withGetter(VALID_MODEL, "id", () => { getterCalls += 1; return "forged/model"; });
  assert.throws(() => createModelRecord(accessorModel), /accessor/i);

  const manifest = {
    method: "lora", baseModelId: "base", baseModelRevision: "r1", adapterArtifactSha256: HASH,
    adapterConfigSha256: HASH, trainingCodeRevision: "r2", datasetManifestSha256: HASH,
    datasetLicenseReview: "review", framework: "peft", frameworkVersion: "1",
    serving: withGetter({ format: "PEFT", runtimes: ["vLLM"] }, "protocol", () => { getterCalls += 1; return "OpenAI"; }),
    evaluationRunId: "eval-1",
  };
  assert.throws(() => createAdapterManifest(manifest), /accessor/i);

  const options = withGetter({ messages: [{ role: "user", content: "x" }] }, "model", () => { getterCalls += 1; return { id: "forged", routingEvidence: fastEvidence }; });
  assert.throws(() => createInferenceRequest(options), /accessor/i);
  assert.equal(getterCalls, 0);
});

test("model-platform inputs reject cycles, sparse arrays, and mutable class containers", () => {
  const cyclicModel = { ...VALID_MODEL };
  cyclicModel.extra = cyclicModel;
  assert.throws(() => createModelRecord(cyclicModel), /cycles/i);

  assert.throws(() => createModelRecord({ ...VALID_MODEL, runtimeCompatibility: Array(1) }), /dense|sparse/i);
  class RuntimeArray extends Array {}
  assert.throws(() => createModelRecord({ ...VALID_MODEL, runtimeCompatibility: new RuntimeArray("vLLM") }), /subclasses/i);
  assert.throws(() => createModelRecord({ ...VALID_MODEL, extra: new Date() }), /plain objects/i);
  class InputRecord { constructor() { Object.assign(this, VALID_MODEL); } }
  assert.throws(() => createModelRecord(new InputRecord()), /plain objects/i);

  const cyclicMessages = [];
  cyclicMessages.push(cyclicMessages);
  assert.throws(() => createInferenceRequest({ model: model("m", fastEvidence), profile: "fast", messages: cyclicMessages }), /cycles/i);
  assert.throws(() => createInferenceRequest({ model: model("m", fastEvidence), profile: "fast", messages: Array(1) }), /dense|sparse/i);
});

test("inference requests are deep immutable snapshots detached from caller-owned inputs", () => {
  const sourceModel = model("fixture/remote", { ...fastEvidence });
  const sourceMessages = [{ role: "user", content: "private prompt", annotations: { tags: ["private"] } }];
  const request = createInferenceRequest({ model: sourceModel, messages: sourceMessages, profile: "fast", privacyMode: "allow_cloud", budgetUsd: 0.002 });

  sourceModel.id = "fixture/other";
  sourceModel.routingEvidence.qualityScore = 0;
  sourceMessages[0].content = "changed";
  sourceMessages[0].annotations.tags.push("changed");

  assert.equal(request.model, "fixture/remote");
  assert.equal(request.messages[0].content, "private prompt");
  assert.deepEqual(request.messages[0].annotations.tags, ["private"]);
  assert.ok(Object.isFrozen(request));
  assert.ok(Object.isFrozen(request.metadata));
  assert.ok(Object.isFrozen(request.messages));
  assert.ok(Object.isFrozen(request.messages[0]));
  assert.ok(Object.isFrozen(request.messages[0].annotations.tags));
  assert.throws(() => { request.messages[0].annotations.tags[0] = "tampered"; }, TypeError);
});
