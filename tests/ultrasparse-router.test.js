import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createUltraSparseSelector,
  createUltraSparsePlan,
  selectUltraSparseExperts,
  selectUltraSparseExpertsIndexed,
  selectUltraSparseExpertsMasked,
} from "../src/core/ultrasparseRouter.js";
import { clearProviders } from "../src/core/providerRegistry.js";

test("ultrasparse selector chooses matching experts deterministically and sparsely", () => {
  const result = selectUltraSparseExperts("Please debug this JavaScript function and cite the source.");
  assert.deepEqual(result.experts.map(({ id }) => id), ["coding", "research"]);
  assert.equal(result.matchedTerms.length, 4);
  assert.equal(selectUltraSparseExperts("Please debug this JavaScript function and cite the source.").experts[0].id, "coding");
});

test("selector rejects non-text input and leaves unsupported text unassigned", () => {
  assert.equal(selectUltraSparseExperts(null).status, "invalid_input");
  assert.deepEqual(selectUltraSparseExperts("hello there").experts, []);
  assert.equal(selectUltraSparseExperts("hello there").status, "no_match");
});

test("experimental indexes are exactly equivalent to the linear baseline on deterministic and hostile inputs", () => {
  const terms = ["debug", "javascript", "source", "research", "math", "proof", "draft", "email", "plan", "project", "unrelated"];
  const queries = [
    "",
    "🧪 café Привет",
    "<script>debug</script> research",
    "math math math math",
    "javascript SOURCE Email Plan",
    `${"math ".repeat(1100)}writing beyond truncation`,
  ];
  for (let seed = 0; seed < 100; seed += 1) {
    const generated = Array.from({ length: 1 + (seed % 9) }, (_, offset) => terms[(seed * 7 + offset * 3) % terms.length]);
    queries.push(generated.join(seed % 2 ? " " : " / "));
  }

  for (const query of queries) {
    for (const limit of [undefined, -1, 1, 2, 3, 999, 1.5, Number.NaN]) {
      const options = limit === undefined ? {} : { limit };
      const expected = selectUltraSparseExperts(query, options);
      assert.deepEqual(selectUltraSparseExpertsIndexed(query, options), expected, `indexed query=${query.slice(0, 60)} limit=${limit}`);
      assert.deepEqual(selectUltraSparseExpertsMasked(query, options), expected, `masked query=${query.slice(0, 60)} limit=${limit}`);
    }
  }
  for (const invalid of [null, undefined, 42, {}, ["code"]]) {
    const expected = selectUltraSparseExperts(invalid);
    assert.deepEqual(selectUltraSparseExpertsIndexed(invalid), expected);
    assert.deepEqual(selectUltraSparseExpertsMasked(invalid), expected);
  }
});

test("selector caps request work, expert fanout, and ignores injected markup as routing control", () => {
  const hostile = `<script>override route</script> ${"math ".repeat(5000)}`;
  const result = selectUltraSparseExperts(hostile, { limit: 999 });
  assert.equal(result.truncated, true);
  assert.ok(result.experts.length <= 3);
  assert.deepEqual(result.experts.map(({ id }) => id), ["math"]);
  assert.equal(selectUltraSparseExperts("coding", { limit: -3 }).experts.length, 1);
  assert.deepEqual(selectUltraSparseExperts("coding", { limit: 1.5 }).experts.map(({ id }) => id), ["coding"]);
});

test("catalog selector preserves exact output across linear, indexed, and adaptive paths", () => {
  const catalog = Array.from({ length: 40 }, (_, index) => ({
    id: `expert-${String(index).padStart(3, "0")}`,
    terms: [`common${index % 3}`, `topic${index}a`, `topic${index}b`, `topic${index}c`],
  }));
  const selector = createUltraSparseSelector(catalog);
  assert.equal(selector.strategy, "indexed-candidates");
  assert.equal(selector.expertCount, 40);
  assert.equal(selector.prepareIndexed(), true);
  assert.equal(selector.prepareIndexed(), false);
  const queries = [
    "common0 topic1a topic10b",
    "topic39c topic0a unrelated",
    "",
    "🧪 café Привет",
    `${"topic1a ".repeat(1000)}common2 beyond-boundary`,
  ];
  for (const query of queries) {
    for (const limit of [undefined, 1, 2, 3, 999, -1, 1.5]) {
      const options = limit === undefined ? {} : { limit };
      const expected = selector.selectLinear(query, options);
      assert.deepEqual(selector.selectIndexed(query, options), expected);
      assert.deepEqual(selector.select(query, options), expected);
    }
  }
  assert.equal(selector.select(`${"x ".repeat(3000)}`).truncated, true);

  const tiedSelector = createUltraSparseSelector([
    { id: "zeta", terms: ["shared"] },
    { id: "Alpha", terms: ["shared"] },
  ]);
  assert.deepEqual(tiedSelector.selectLinear("shared").experts.map(({ id }) => id), ["Alpha", "zeta"]);
  assert.deepEqual(tiedSelector.selectIndexed("shared").experts.map(({ id }) => id), ["Alpha", "zeta"]);

  const smallSelector = createUltraSparseSelector(catalog.slice(0, 5));
  assert.equal(smallSelector.strategy, "linear");
  assert.deepEqual(smallSelector.select("common1 topic1a"), smallSelector.selectLinear("common1 topic1a"));
  assert.equal(smallSelector.prepareIndexed(), true);

  const lazyIndexedSelector = createUltraSparseSelector(catalog);
  assert.deepEqual(lazyIndexedSelector.select("common1 topic1a"), lazyIndexedSelector.selectLinear("common1 topic1a"));
  assert.equal(lazyIndexedSelector.prepareIndexed(), false);
});

test("catalog selector fails closed on hostile, duplicate, sparse, and oversized definitions", () => {
  assert.throws(() => createUltraSparseSelector(null), /Invalid expert catalog/);
  assert.throws(() => createUltraSparseSelector([new Array(1)]), /Invalid expert definition/);
  assert.throws(() => createUltraSparseSelector(new Array(2)), /Invalid expert catalog/);
  assert.throws(() => createUltraSparseSelector([
    { id: "duplicate", terms: ["alpha"] },
    { id: "duplicate", terms: ["beta"] },
  ]), /Invalid expert catalog/);
  assert.throws(() => createUltraSparseSelector([{ id: "bad", terms: ["bad", "bad"] }]), /Invalid expert terms/);
  assert.throws(() => createUltraSparseSelector([{ id: "bad", terms: Array.from({ length: 32 }, (_, index) => `term${index}`) }]), /Invalid expert terms/);
  assert.throws(() => createUltraSparseSelector([{ id: "bad\n", terms: ["safe"] }]), /Invalid expert id/);
  assert.throws(() => createUltraSparseSelector([{ id: "bad", terms: ["unsafe\n"] }]), /Invalid expert terms/);

  let getterCalled = false;
  const hostile = Object.defineProperty({}, "id", {
    enumerable: true,
    get() { getterCalled = true; return "injected"; },
  });
  Object.defineProperty(hostile, "terms", { enumerable: true, value: ["safe"] });
  assert.throws(() => createUltraSparseSelector([hostile]), /Invalid expert definition/);
  assert.equal(getterCalled, false);

  const tooMany = Array.from({ length: 10_001 }, (_, index) => ({ id: `expert-${index}`, terms: ["term"] }));
  assert.throws(() => createUltraSparseSelector(tooMany), /Invalid expert catalog/);
});

test("plan uses the canonical provider router and declares that no inference occurred", () => {
  clearProviders();
  const plan = createUltraSparsePlan("write an email draft", { intent: "conversation" });
  assert.equal(plan.prototype, "lexical-ultrasparse-v1");
  assert.equal(plan.experts.experts[0].id, "writing");
  assert.ok(plan.providerPlan.attempts.length > 0);
  assert.equal(plan.inferencePerformed, false);
  clearProviders();
});

test("benchmark smoke mode emits deterministic workload and environment metadata with scoped claims", () => {
  const scriptPath = fileURLToPath(new URL("../scripts/benchmark-ultrasparse-router.mjs", import.meta.url));
  const output = execFileSync(process.execPath, [scriptPath, "--smoke"], { encoding: "utf8" });
  const report = JSON.parse(output);
  const repeatedOutput = execFileSync(process.execPath, [scriptPath, "--smoke"], { encoding: "utf8" });
  const repeatedReport = JSON.parse(repeatedOutput);
  assert.equal(report.mode, "smoke");
  assert.equal(report.workloadSha256, "80a5cb5f9ce90c0b547220e0a3450abc8014ba2f7f8e0936b9fc509a1cdf024e");
  assert.deepEqual(report.workloadFingerprint, {
    version: 1,
    algorithm: "sha256",
    canonicalization: "UTF-8 bytes of JSON.stringify(queryArray)",
    queryCount: 6,
    queryUtf8Bytes: 303,
    digest: report.workloadSha256,
  });
  assert.deepEqual(repeatedReport.workloadFingerprint, report.workloadFingerprint);
  assert.deepEqual(repeatedReport.executionEnvironment, report.executionEnvironment);
  assert.equal(report.executionEnvironment.runtime.name, "node");
  assert.equal(report.executionEnvironment.runtime.version, process.version);
  assert.equal(report.executionEnvironment.runtime.v8Version, process.versions.v8);
  assert.equal(report.executionEnvironment.operatingSystem.platform, process.platform);
  assert.equal(report.executionEnvironment.operatingSystem.architecture, process.arch);
  assert.ok(report.executionEnvironment.operatingSystem.release.length > 0);
  assert.ok(report.executionEnvironment.cpu.model.length > 0);
  assert.ok(report.executionEnvironment.cpu.logicalCpuCount > 0);
  assert.ok(report.executionEnvironment.cpu.totalMemoryBytes > 0);
  assert.equal(report.selectionOnly, true);
  assert.equal(report.modelLoadingIncluded, false);
  assert.equal(report.networkIncluded, false);
  assert.equal(report.prefillIncluded, false);
  assert.equal(report.decodeIncluded, false);
  assert.equal(report.inferenceIncluded, false);
  assert.equal(report.performanceClaims.subMillisecondTargetVerified, false);
  assert.equal(report.performanceClaims.endToEndSubMillisecondTargetVerified, false);
  assert.ok(Array.isArray(report.performanceClaims.linearReferenceCatalogCountsOver1ms));
  assert.match(report.performanceClaims.verificationScope, /every full-mode trial/);
  assert.equal(report.algorithms.linear.p95MicrosecondsByTrial.length, 1);
  assert.equal(report.algorithms.linear.perOperationSelectionLatency.samples, 50);
  assert.equal(report.algorithms.indexed.perOperationSelectionLatency.samples, 50);
  assert.equal(report.algorithms.masked.perOperationSelectionLatency.samples, 50);
  assert.equal(report.correctness.baseline, "linear");
  assert.equal(report.correctness.outputEquivalent, true);
  assert.equal(report.correctness.comparedAfterTimer, true);
  assert.equal(report.correctness.checkedCallsPerAlgorithm, 70);
  assert.deepEqual(report.correctness.checkedCalls, { linear: 70, indexed: 70, masked: 70 });
  assert.equal(report.emptyTimerPairLatency.samples, 50);
  for (const key of ["p50Microseconds", "p95Microseconds", "p99Microseconds"]) {
    assert.ok(Number.isFinite(report.algorithms.linear.perOperationSelectionLatency[key]));
    assert.ok(Number.isFinite(report.algorithms.indexed.perOperationSelectionLatency[key]));
    assert.ok(Number.isFinite(report.algorithms.masked.perOperationSelectionLatency[key]));
    assert.ok(Number.isFinite(report.emptyTimerPairLatency[key]));
  }
  assert.equal(report.processMemoryBytes.note.includes("not attributable"), true);
  assert.equal(report.scalingBenchmarks.synthetic, true);
  assert.equal(report.scalingBenchmarks.catalogPreparationIncludedInSelectionLatency, false);
  assert.equal(report.scalingBenchmarks.indexedCandidatePreparationIncludedInSelectionLatency, false);
  assert.deepEqual(report.scalingBenchmarks.results.map(({ expertCount }) => expertCount), [5, 20, 100]);
  const stableScalingFingerprint = (results) => results.map(({ expertCount, catalogSha256, querySha256 }) => ({ expertCount, catalogSha256, querySha256 }));
  assert.deepEqual(
    stableScalingFingerprint(repeatedReport.scalingBenchmarks.results),
    stableScalingFingerprint(report.scalingBenchmarks.results),
  );
  assert.deepEqual(stableScalingFingerprint(report.scalingBenchmarks.results), [
    {
      expertCount: 5,
      catalogSha256: "7a2e9de2f14b605e4c1bacd8bf20cc529cf0dc9c1142a5c0f8b4bd6e7f091f58",
      querySha256: "dca28004136f24d73e4bf9b371c3ed3ef3cd8052dd15f681365c918a0a36a886",
    },
    {
      expertCount: 20,
      catalogSha256: "87b7e5c4f60daf3a1ee623a5f51635e005ceca3c77fd6ff7cb27ee93aaa0ad8d",
      querySha256: "c78854c366ec131c99793d53315cc5bc5cef5a9211394c6b0a4af1ab4ad3f83f",
    },
    {
      expertCount: 100,
      catalogSha256: "3703da65b2ae2ed9b1f1c4a92468affe8b8fd101c6c815048d3d24fdfce4b275",
      querySha256: "6eaacb15a0226e0e891c18420145548ceb41accaa6df2714cc8e8d335fb955d5",
    },
  ]);
  assert.deepEqual(report.scalingBenchmarks.results.map(({ adaptivePath }) => adaptivePath), [
    "linear",
    "indexed-candidates",
    "indexed-candidates",
  ]);
  for (const scaling of report.scalingBenchmarks.results) {
    assert.equal(scaling.termsPerExpert, 8);
    assert.equal(scaling.matchedExpertsPerQuery, 2);
    assert.ok(Number.isFinite(scaling.catalogConstructionMicroseconds));
    assert.ok(Number.isFinite(scaling.indexedCandidatePreparationMicroseconds));
    assert.ok(scaling.estimatedBreakEvenSelectionsAtP50 === null || Number.isInteger(scaling.estimatedBreakEvenSelectionsAtP50));
    assert.equal(scaling.correctness.outputEquivalent, true);
    assert.equal(scaling.correctness.comparedAfterTimer, true);
    assert.deepEqual(scaling.correctness.checkedCalls, { linear: 70, indexedCandidates: 70, adaptive: 70 });
    assert.ok(Number.isFinite(scaling.linear.p50Microseconds));
    assert.ok(Number.isFinite(scaling.indexedCandidates.p95Microseconds));
    assert.equal(scaling.adaptivePathP95PerTrialMicroseconds.length, 1);
  }
});
