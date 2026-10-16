import test from "node:test";
import assert from "node:assert/strict";
import { attachEvaluationReport, clearProviders, listModels, registerProvider } from "../src/core/providerRegistry.js";
import { selectModel, selectModelFromSnapshot, createProviderPlan } from "../src/core/providerRouter.js";
import { clearPermissions, isProviderPermissionSnapshotCurrent, revokePermission, seedPermissions } from "../src/core/permissionManager.js";
import { setAccountScope } from "../src/core/accountScope.js";
import { createAdapterManifest, createAdapterServingTarget, createInferenceRequest, createEvaluationReport, createModelRecord, verifyEvaluationReport, INFERENCE_PROFILES, OPEN_MODEL_CANDIDATES } from "../src/core/modelPlatform.js";
import { HEY } from "../src/core/index.js";

test("HEY exposes the validated model serving target contract", () => {
  assert.equal(HEY.modelPlatform.createAdapterServingTarget, createAdapterServingTarget);
  assert.equal(HEY.modelPlatform.createEvaluationReport, createEvaluationReport);
  assert.equal(HEY.modelPlatform.verifyEvaluationReport, verifyEvaluationReport);
  assert.equal(typeof HEY.providers.attachEvaluationReport, "function");
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
    runtime: "vllm-openai-compatible",
    runtimeVersion: "0.9.2",
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

function modelEvaluation(modelRecord, { quality = 0.9, latencyP95Ms = 800, inputUsdPerMillion = 1, outputUsdPerMillion = 2, ageMs = 60_000 } = {}) {
  const sampleCount = 100;
  return {
    model: { id: modelRecord.id, revision: modelRecord.revision, weightSha256: modelRecord.weightSha256 },
    suite: "hey-conformance-v1",
    suiteRevision: "suite-7a1c",
    datasetSha256: "b".repeat(64),
    evaluatedAt: new Date(Date.now() - ageMs).toISOString(),
    hardware: "fixture host; no model execution asserted",
    runtime: "fixture-runtime",
    runtimeVersion: "1.2.3",
    runId: `run-${modelRecord.id}`,
    pricing: { inputUsdPerMillion, outputUsdPerMillion },
    samples: Array.from({ length: sampleCount }, (_, index) => ({
      caseId: `case-${index}`,
      passed: index < quality * sampleCount,
      latencyMs: latencyP95Ms,
      inputTokens: 100,
      outputTokens: 50,
    })),
  };
}

test("evaluation reports derive content-free model quality, p95 latency, and measured token cost", async () => {
  const report = await createEvaluationReport(validEvaluationRun());
  assert.equal(report.modelId, "hey/qwen-candidate");
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.measurementEvidenceStatus, "caller_supplied_unattested");
  assert.equal(report.evaluation.qualityScore, 0.9);
  assert.equal(report.evaluation.latencyP95Ms, 190);
  assert.equal(report.evaluation.runtime, "vllm-openai-compatible");
  assert.equal(report.evaluation.runtimeVersion, "0.9.2");
  assert.equal(report.latencyP50Ms, 100);
  assert.equal(report.latencyP99Ms, 200);
  assert.equal(report.inputTokens, 2_000);
  assert.equal(report.outputTokens, 1_000);
  assert.equal(report.totalCostUsd, 0.004);
  assert.match(report.evaluation.measurementsDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(report.reportDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(await verifyEvaluationReport(report), true);
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

test("evaluation report rejects mutable, duplicate, incomplete, and oversized measurement inputs", async () => {
  const getterRun = validEvaluationRun();
  let getterCalls = 0;
  Object.defineProperty(getterRun.samples[0], "latencyMs", { enumerable: true, get() { getterCalls += 1; return 10; } });
  await assert.rejects(createEvaluationReport(getterRun), /accessor/i);
  assert.equal(getterCalls, 0);

  const duplicate = validEvaluationRun();
  duplicate.samples[1].caseId = duplicate.samples[0].caseId;
  await assert.rejects(createEvaluationReport(duplicate), /unique/i);

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
    await assert.rejects(createEvaluationReport(invalid), pattern);
  }

  const tooMany = validEvaluationRun();
  tooMany.samples = Array.from({ length: 1_001 }, (_, index) => ({
    caseId: `case-${index}`, passed: true, latencyMs: 1, inputTokens: 0, outputTokens: 0,
  }));
  await assert.rejects(createEvaluationReport(tooMany), /between 1 and 1000/i);

  const overflowingCost = validEvaluationRun();
  overflowingCost.pricing.outputUsdPerMillion = Number.MAX_VALUE;
  await assert.rejects(createEvaluationReport(overflowingCost), /numeric range/i);
});

test("evaluation report digests bind provenance and exact measurement values without exposing cases", async () => {
  const original = await createEvaluationReport(validEvaluationRun());
  const reorderedInput = validEvaluationRun();
  reorderedInput.samples.reverse();
  const reordered = await createEvaluationReport(reorderedInput);
  assert.equal(reordered.reportDigest, original.reportDigest, "input ordering does not alter canonical evidence");

  const mutations = [
    (run) => { run.model.revision = "different-pinned-revision"; },
    (run) => { run.model.weightSha256 = "c".repeat(64); },
    (run) => { run.datasetSha256 = "d".repeat(64); },
    (run) => { run.hardware = "other-host"; },
    (run) => { run.runtime = "other-runtime"; },
    (run) => { run.runtimeVersion = "0.9.3"; },
    (run) => { run.runId = "other-run"; },
    (run) => { run.evaluatedAt = "2026-10-15T12:00:01.000Z"; },
    (run) => { run.samples[0].latencyMs = 11; },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const input = validEvaluationRun();
    mutate(input);
    const changed = await createEvaluationReport(input);
    assert.notEqual(changed.reportDigest, original.reportDigest);
    if (index === mutations.length - 1) assert.notEqual(changed.evaluation.measurementsDigest, original.evaluation.measurementsDigest);
  }

  const tampered = structuredClone(original);
  tampered.evaluation.runtimeVersion = "0.9.99";
  assert.equal(await verifyEvaluationReport(tampered), false);
  const extended = { ...original, unboundField: "forged" };
  assert.equal(await verifyEvaluationReport(extended), false);
  const forgedAttestation = structuredClone(original);
  forgedAttestation.measurementEvidenceStatus = "independently_attested";
  const canonicalJson = (value) => value === null || typeof value !== "object"
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? `[${value.map(canonicalJson).join(",")}]`
      : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  const forgedBody = Object.fromEntries(Object.entries(forgedAttestation).filter(([key]) => key !== "reportDigest"));
  const forgedDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(forgedBody)));
  forgedAttestation.reportDigest = `sha256:${Array.from(new Uint8Array(forgedDigest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  assert.equal(await verifyEvaluationReport(forgedAttestation), false, "recomputing an unkeyed digest cannot promote caller input to attested evidence");
  let getterCalls = 0;
  const hostile = Object.defineProperty({ ...original }, "reportDigest", {
    enumerable: true,
    get() { getterCalls += 1; return original.reportDigest; },
  });
  assert.equal(await verifyEvaluationReport(hostile), false);
  assert.equal(getterCalls, 0);
});

test("provider registry attaches digest-valid evaluation metadata without treating it as attested routing evidence", async () => {
  clearProviders();
  setAccountScope("evaluation-fixture-account");
  seedPermissions([
    { permission: "provider.remote", status: "granted", scope: "account" },
    { permission: "provider:evaluation-fixture", status: "granted", scope: "account" },
  ], "evaluation-fixture-account");
  const input = validEvaluationRun();
  input.evaluatedAt = new Date(Date.now() - 60_000).toISOString();
  const provider = registerProvider({
    id: "evaluation-fixture",
    name: "Evaluation Fixture",
    capabilities: ["chat"],
    models: [{ id: input.model.id, revision: input.model.revision, weightSha256: input.model.weightSha256, priority: 1 }],
  });
  try {
    const report = await createEvaluationReport(input);
    const attached = await attachEvaluationReport(provider.id, input.model.id, report);
    assert.equal(attached.routingEvidence.evaluationReportDigest, report.reportDigest);
    assert.equal(listModels()[0].routingEvidence.qualityScore, report.evaluation.qualityScore);
    assert.equal(selectModel({ profile: "fast", allowedProviders: [provider.id] }).selected, null,
      "digest-valid caller observations do not authorize model routing without independent attestation");

    const mismatched = await createEvaluationReport({ ...validEvaluationRun(), model: { ...input.model, revision: "other-pinned-revision" } });
    await assert.rejects(attachEvaluationReport(provider.id, input.model.id, mismatched), /does not match/i);
    const tampered = structuredClone(report);
    tampered.evaluation.datasetSha256 = "e".repeat(64);
    await assert.rejects(attachEvaluationReport(provider.id, input.model.id, tampered), /digest verification/i);

    const pending = attachEvaluationReport(provider.id, input.model.id, report);
    provider.models[0] = { ...provider.models[0], revision: "swapped-during-verification" };
    await assert.rejects(pending, /changed while/i);

    let getterCalls = 0;
    const hostileProvider = registerProvider({
      id: "hostile-model-fixture",
      name: "Hostile Model Fixture",
      models: [Object.defineProperty({}, "id", { enumerable: true, get() { getterCalls += 1; return input.model.id; } })],
    });
    await assert.rejects(attachEvaluationReport(hostileProvider.id, input.model.id, report), /not registered/i);
    assert.equal(getterCalls, 0);
  } finally {
    clearProviders();
    clearPermissions();
    setAccountScope(null);
  }
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
  assert.ok(Object.values(INFERENCE_PROFILES).every((profile) => profile.maxEvaluationAgeMs === 30 * 24 * 60 * 60 * 1_000));
  assert.ok(OPEN_MODEL_CANDIDATES.every((candidate) => candidate.status === "candidate_not_selected"));
  assert.ok(OPEN_MODEL_CANDIDATES.every((candidate) => candidate.licenseUrl.startsWith("https://")));
});

test("canonical provider router refuses caller-supplied evaluation measurements as routing evidence", async () => {
  clearProviders();
  setAccountScope("model-fixture-account");
  try {
    const candidates = [
      { id: "too-costly", quality: 0.78, latencyP95Ms: 800, inputUsdPerMillion: 5, outputUsdPerMillion: 5 },
      { id: "too-slow", quality: 0.78, latencyP95Ms: 1_500, inputUsdPerMillion: 0.4, outputUsdPerMillion: 0.8 },
      { id: "selected", quality: 0.78, latencyP95Ms: 800, inputUsdPerMillion: 0.4, outputUsdPerMillion: 0.8 },
      { id: "fallback", quality: 0.7, latencyP95Ms: 900, inputUsdPerMillion: 0.4, outputUsdPerMillion: 0.8 },
      { id: "local", quality: 0.71, latencyP95Ms: 900, inputUsdPerMillion: 0.4, outputUsdPerMillion: 0.8, local: true },
    ].map((candidate, index) => ({
      ...candidate,
      revision: `revision-${candidate.id}`,
      weightSha256: String(index + 1).repeat(64),
    }));
    registerProvider({
      id: "fixture", name: "Fixture", capabilities: ["chat"],
      models: candidates.map(({ id, revision, weightSha256, local }) => ({ id, revision, weightSha256, local })),
    });
    seedPermissions([
      { permission: "provider.remote", status: "granted", scope: "account" },
      { permission: "provider.local", status: "granted", scope: "account" },
      ...["fixture", "stale-provider", "missing-provider"].map((providerId) => ({ permission: `provider:${providerId}`, status: "granted", scope: "account" })),
    ], "model-fixture-account");
    for (const candidate of candidates) {
      const report = await createEvaluationReport(modelEvaluation(candidate, candidate));
      await attachEvaluationReport("fixture", candidate.id, report);
    }

    const plan = createProviderPlan({ profile: "fast", budgetUsd: 0.002, allowedProviders: ["fixture"] });
    assert.equal(plan.selected, null, "caller-supplied measurements never authorize a profiled model");
    assert.deepEqual(plan.fallbacks, []);
    assert.deepEqual(plan.attempts, [], "unattested reports cannot enter the provider dispatch plan");
    assert.equal(plan.policy.profile, "fast");
    assert.equal(selectModel({ profile: "fast", budgetUsd: 0.0001, allowedProviders: ["fixture"] }).selected, null);
    assert.equal(selectModel({ profile: "fast", privacyMode: "local_only", allowedProviders: ["fixture"] }).selected, null);
    assert.equal(selectModel({ profile: "fast", privacyMode: "local_only", allowedProviders: ["fixture"] }).fallbacks.length, 0);
    assert.equal(selectModel({ profile: "maximum_quality", allowedProviders: ["fixture"] }).selected, null, "models without measured quality above the profile floor fail closed");
    assert.equal(selectModel({ profile: "fast", privacyMode: "no_cloud", allowedProviders: ["fixture"] }).selected, null);
    assert.equal(selectModel({ profile: "fast" }).selected, null, "a profile requires explicit provider permission");
    const spoofedProvider = { id: "spoofed", revision: "revision-spoofed", weightSha256: "9".repeat(64) };
    registerProvider({ id: "rogue-provider", name: "Rogue", capabilities: ["chat"], models: [spoofedProvider] });
    await attachEvaluationReport("rogue-provider", spoofedProvider.id, await createEvaluationReport(modelEvaluation(spoofedProvider)));
    assert.equal(selectModel({ profile: "fast", allowedProviders: ["rogue-provider"] }).selected, null,
      "a caller preference cannot grant a provider without a trusted account grant");
    assert.throws(() => selectModelFromSnapshot([], { profile: "fast", allowedProviders: [" fixture"] }), /non-empty strings/i);
    const hostileAllowlist = Object.defineProperty([], "0", { enumerable: true, get() { throw new Error("must not run"); } });
    assert.throws(() => selectModelFromSnapshot([], { profile: "fast", allowedProviders: hostileAllowlist }), /accessors/i);
    const unregistered = { ...listModels()[0], providerId: "rogue-provider" };
    assert.equal(selectModelFromSnapshot([unregistered], { profile: "fast", allowedProviders: ["rogue-provider"] }).selected, null,
      "an allowlist cannot make an unregistered provider eligible");

    const staleModel = { id: "stale", revision: "revision-stale", weightSha256: "f".repeat(64) };
    registerProvider({ id: "stale-provider", name: "Stale", capabilities: ["chat"], models: [staleModel] });
    await attachEvaluationReport("stale-provider", staleModel.id, await createEvaluationReport(modelEvaluation(staleModel, { quality: 0.95, ageMs: INFERENCE_PROFILES.fast.maxEvaluationAgeMs + 1 })));
    assert.equal(selectModel({ profile: "fast", allowedProviders: ["stale-provider"] }).selected, null, "expired evaluation evidence is not routed");

    const missingModel = { id: "missing-report", revision: "revision-missing", weightSha256: "e".repeat(64), routingEvidence: fastEvidence };
    registerProvider({ id: "missing-provider", name: "Missing", capabilities: ["chat"], models: [missingModel] });
    assert.equal(selectModel({ profile: "fast", allowedProviders: ["missing-provider"] }).selected, null, "unverified caller evidence is not routed");

    const failedFallback = createProviderPlan({ profile: "fast", allowedProviders: ["stale-provider", "missing-provider"] });
    assert.equal(failedFallback.selected, null);
    assert.deepEqual(failedFallback.attempts, [], "no fallback is planned when every candidate fails its evidence gates");
    const planned = createProviderPlan({ profile: "fast", allowedProviders: ["fixture"] });
    assert.equal(isProviderPermissionSnapshotCurrent(planned.permissionSnapshot), true);
    revokePermission("provider:fixture", "account");
    assert.equal(isProviderPermissionSnapshotCurrent(planned.permissionSnapshot), false, "a plan cannot outlive its provider permission epoch");
  } finally {
    clearProviders();
    clearPermissions();
    setAccountScope(null);
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
