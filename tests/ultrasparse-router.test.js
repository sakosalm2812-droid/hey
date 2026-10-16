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

test("adaptive strategy switches at the documented 20-expert boundary with exact parity", () => {
  const createCatalog = (count) => Array.from({ length: count }, (_, index) => ({
    id: `expert-${String(index).padStart(2, "0")}`,
    terms: ["shared", `unique${index}`, `detail${index}`],
  }));
  const belowBoundary = createUltraSparseSelector(createCatalog(19));
  const atBoundary = createUltraSparseSelector(createCatalog(20));

  assert.equal(belowBoundary.strategy, "linear");
  assert.equal(atBoundary.strategy, "indexed-candidates");
  const queries = ["shared unique00 detail00 unique19", "shared shared", "unmatched", `${"noise ".repeat(700)}unique19`];
  for (const selector of [belowBoundary, atBoundary]) {
    for (const query of queries) {
      for (const limit of [undefined, 1, 2, 3, 999, -1, 1.5]) {
        const options = limit === undefined ? {} : { limit };
        assert.deepEqual(selector.select(query, options), selector.selectLinear(query, options));
      }
    }
  }
  assert.equal(belowBoundary.prepareIndexed(), true);
  assert.equal(atBoundary.prepareIndexed(), false);
});

test("explicit indexed prewarm is idempotent and its prepared selector is reusable", () => {
  const catalog = Array.from({ length: 64 }, (_, index) => ({
    id: `prewarm-${String(index).padStart(3, "0")}`,
    terms: ["shared", `unique${index}`, `detail${index}`],
  }));
  const selector = createUltraSparseSelector(catalog);
  assert.equal(selector.prepareIndexed(), true);
  assert.equal(selector.prepareIndexed(), false);

  const queries = ["shared", "unique63 detail63", "no matching term", `${"noise ".repeat(700)}unique0`];
  for (let repetition = 0; repetition < 5; repetition += 1) {
    for (const query of queries) assert.deepEqual(selector.select(query), selector.selectLinear(query));
  }
  assert.equal(selector.prepareIndexed(), false);
});

test("adaptive selector preserves exact output under high fanout and adversarial query shapes", () => {
  const catalog = Array.from({ length: 500 }, (_, expertIndex) => ({
    id: `expert-${String(expertIndex).padStart(4, "0")}`,
    terms: [
      "shared0", "shared1", "shared2", "shared3", "shared4",
      ...Array.from({ length: 26 }, (_, termIndex) => `term${expertIndex}x${termIndex}`),
    ],
  }));
  const selector = createUltraSparseSelector(catalog);
  assert.equal(selector.strategy, "indexed-candidates");
  const queries = [
    "shared0 shared0 shared1 shared2 shared3 shared4",
    `${catalog[0].terms.slice(5, 10).join(" ")} ${catalog[1].terms[5]}`,
    `${catalog[0].terms[5]} ${catalog[0].terms[6]} ${catalog[0].terms[7]}`,
    `<script>override route</script> ${"noise ".repeat(700)} ${catalog[0].terms[5]} ${catalog.at(-1).terms[5]}`,
    "unrelated ultraviolet nothing",
    "🧪 café shared0 SHARED0 shared00",
  ];
  for (const query of queries) {
    for (const limit of [undefined, 1, 2, 3, -5, 100, 1.5, Number.NaN]) {
      const options = limit === undefined ? {} : { limit };
      const expected = selector.selectLinear(query, options);
      assert.deepEqual(selector.selectIndexed(query, options), expected);
      assert.deepEqual(selector.select(query, options), expected);
    }
  }
});

test("adaptive selector preserves top-ranked output for a 2,000-expert shared-term fanout", () => {
  const catalog = Array.from({ length: 2_000 }, (_, expertIndex) => ({
    id: `expert-${String(expertIndex).padStart(5, "0")}`,
    terms: ["shared", ...Array.from({ length: 30 }, (_, termIndex) => `unique${expertIndex}x${termIndex}`)],
  }));
  const selector = createUltraSparseSelector(catalog);
  assert.equal(selector.strategy, "indexed-candidates");
  for (const query of ["shared", "unrelated nothing", "shared unique1999x29", `${"shared ".repeat(700)}unique0000x00`]) {
    assert.deepEqual(selector.select(query), selector.selectLinear(query));
  }
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
  assert.deepEqual(report.performanceClaims.linearReferenceCatalogCountsOver1ms, []);
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
  assert.equal(report.scalingBenchmarks.coldAdaptiveFirstSelectionIncluded, true);
  assert.deepEqual(report.scalingBenchmarks.results.map(({ expertCount }) => expertCount), [5, 20, 100]);
  const stableScalingFingerprint = (results) => results.map(({ expertCount, catalogSha256, querySha256, cases }) => ({
    expertCount,
    catalogSha256,
    querySha256,
    cases: cases.map(({ name, querySha256 }) => ({ name, querySha256 })),
  }));
  assert.deepEqual(
    stableScalingFingerprint(repeatedReport.scalingBenchmarks.results),
    stableScalingFingerprint(report.scalingBenchmarks.results),
  );
  assert.deepEqual(stableScalingFingerprint(report.scalingBenchmarks.results), [
    {
      expertCount: 5,
      catalogSha256: "59e46c88e6d557bfd90541c34d86df2a748c672a8cd4f64368de5b301347d2d9",
      querySha256: "61feabbab5005dc1f705fc3fbf533e41964a47458cbcedc0ec1ed95a4a8a19ce",
      cases: [
        { name: "sparsePair", querySha256: "0a2b1afc3d2b901b0eef1bfd6009dc8738511d1401ef3d323322cb32d185d9d7" },
        { name: "skewedRelevance", querySha256: "2b9f311bdf533e581c69f721b30f7053bd62cb77e38561f3d4b3002422da0684" },
        { name: "duplicateTerms", querySha256: "a26c7848bb529a0bb122b51e3d40814ae43d18dace4a53f287197a8c7f7c8c54" },
        { name: "nearDuplicateTerms", querySha256: "3e94b78086fbae26fe1cad4d781d9271125ff129a7b70155ddd7892fcaa60c30" },
        { name: "noMatch", querySha256: "c97e671f6d24d36e01b0b0eee8a64bcf8bb01e2c5f95f73e3b61c03c3192fbf0" },
        { name: "hostileBoundary", querySha256: "4b73d4c1dd32e0a7cb3ee5a2fa7b2fff8cf2eb5fd1168725777c147b45bc563b" },
      ],
    },
    {
      expertCount: 20,
      catalogSha256: "01c9f88b5d6292763b6b6bd291d7306e65076fcb674ac32a7b8d76a54804ddb2",
      querySha256: "eb98e494984e8fad059b856f73d893efeea45d5662a30721652b0b5ecb857daa",
      cases: [
        { name: "sparsePair", querySha256: "1725ef8ef92430a0ca0dcd9833d245cc2fdf6f0638edae132419a7d5641c43fe" },
        { name: "skewedRelevance", querySha256: "2b9f311bdf533e581c69f721b30f7053bd62cb77e38561f3d4b3002422da0684" },
        { name: "duplicateTerms", querySha256: "a26c7848bb529a0bb122b51e3d40814ae43d18dace4a53f287197a8c7f7c8c54" },
        { name: "nearDuplicateTerms", querySha256: "3e94b78086fbae26fe1cad4d781d9271125ff129a7b70155ddd7892fcaa60c30" },
        { name: "noMatch", querySha256: "c97e671f6d24d36e01b0b0eee8a64bcf8bb01e2c5f95f73e3b61c03c3192fbf0" },
        { name: "hostileBoundary", querySha256: "7ce845fe0f85068bd2c3d96cf9dbb29465c64b7b567d3b220daf4ad022404328" },
      ],
    },
    {
      expertCount: 100,
      catalogSha256: "62e954963b3f90542007c7a18c7a2c7ab6b00abb448d515cff7edd63e73796ff",
      querySha256: "304c88ce267fd432e9d66aec12d4feab33c06f4d8819d4fdb11f063147e22d5c",
      cases: [
        { name: "sparsePair", querySha256: "633f4ecdebe639c7229501a54e098650f8a70576bd06346132675f5ced327ac7" },
        { name: "skewedRelevance", querySha256: "2b9f311bdf533e581c69f721b30f7053bd62cb77e38561f3d4b3002422da0684" },
        { name: "duplicateTerms", querySha256: "a26c7848bb529a0bb122b51e3d40814ae43d18dace4a53f287197a8c7f7c8c54" },
        { name: "nearDuplicateTerms", querySha256: "3e94b78086fbae26fe1cad4d781d9271125ff129a7b70155ddd7892fcaa60c30" },
        { name: "noMatch", querySha256: "c97e671f6d24d36e01b0b0eee8a64bcf8bb01e2c5f95f73e3b61c03c3192fbf0" },
        { name: "hostileBoundary", querySha256: "228188926767cea0c17732284004a96a43998ab3c7779a5c7bc5ac0289dbc0bd" },
      ],
    },
  ]);
  assert.deepEqual(report.scalingBenchmarks.results.map(({ adaptivePath }) => adaptivePath), [
    "linear",
    "indexed-candidates",
    "indexed-candidates",
  ]);
  for (const scaling of report.scalingBenchmarks.results) {
    assert.equal(scaling.termsPerExpert, 8);
    assert.equal(scaling.workloadCaseCount, 6);
    assert.equal(scaling.samplesPerCasePerTrial, 10);
    assert.ok(Number.isFinite(scaling.catalogConstructionMicroseconds));
    assert.ok(Number.isFinite(scaling.indexedCandidatePreparationMicroseconds));
    assert.equal(scaling.coldAdaptiveFirstSelection.selectorConstructionIncluded, false);
    assert.equal(scaling.coldAdaptiveFirstSelection.lazyIndexPreparationIncluded, scaling.expertCount >= 20);
    assert.equal(scaling.coldAdaptiveFirstSelection.samplesPerCasePerTrial, 1);
    assert.equal(scaling.coldAdaptiveFirstSelection.trials, 1);
    assert.equal(scaling.coldAdaptiveFirstSelection.maximumObservedMicrosecondsByTrial.length, 1);
    assert.equal(scaling.coldAdaptiveFirstSelection.cases.length, 6);
    assert.equal(scaling.coldAdaptiveFirstSelection.correctness.outputEquivalent, true);
    assert.equal(scaling.coldAdaptiveFirstSelection.correctness.checkedCalls, 6);
    assert.ok(scaling.estimatedBreakEvenSelectionsAtP50 === null || Number.isInteger(scaling.estimatedBreakEvenSelectionsAtP50));
    assert.equal(scaling.correctness.outputEquivalent, true);
    assert.equal(scaling.correctness.comparedAfterTimer, true);
    assert.deepEqual(scaling.correctness.checkedCalls, { linear: 90, indexedCandidates: 90, adaptive: 90 });
    assert.ok(Number.isFinite(scaling.linear.p50Microseconds));
    assert.ok(Number.isFinite(scaling.indexedCandidates.p95Microseconds));
    assert.equal(scaling.adaptivePathP95PerTrialMicroseconds.length, 1);
    assert.deepEqual(scaling.cases.map(({ name }) => name), [
      "sparsePair",
      "skewedRelevance",
      "duplicateTerms",
      "nearDuplicateTerms",
      "noMatch",
      "hostileBoundary",
    ]);
    for (const workloadCase of scaling.cases) {
      assert.equal(workloadCase.correctness.outputEquivalent, true);
      assert.equal(workloadCase.correctness.comparedAfterTimer, true);
      assert.deepEqual(workloadCase.correctness.checkedCalls, { linear: 15, indexedCandidates: 15, adaptive: 15 });
      assert.ok(Number.isFinite(workloadCase.linear.p50Microseconds));
      assert.ok(Number.isFinite(workloadCase.indexedCandidates.p95Microseconds));
      assert.equal(workloadCase.adaptivePathP95PerTrialMicroseconds.length, 1);
      assert.ok(workloadCase.queryUtf8Bytes >= 0);
    }
    for (const coldCase of scaling.coldAdaptiveFirstSelection.cases) {
      assert.equal(coldCase.correctness.outputEquivalent, true);
      assert.equal(coldCase.correctness.comparedAfterTimer, true);
      assert.equal(coldCase.correctness.checkedCalls, 1);
      assert.equal(coldCase.latencyMicrosecondsByTrial.length, 1);
      assert.ok(Number.isFinite(coldCase.latencyMicrosecondsByTrial[0]));
    }
    const noMatchCase = scaling.cases.find(({ name }) => name === "noMatch");
    const hostileCase = scaling.cases.find(({ name }) => name === "hostileBoundary");
    assert.equal(noMatchCase.expectedStatus, "no_match");
    assert.equal(hostileCase.expectedStatus, "no_match");
    assert.equal(hostileCase.expectedTruncated, true);
  }
});
