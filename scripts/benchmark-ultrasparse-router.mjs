import os from "node:os";
import { createHash } from "node:crypto";
import {
  createUltraSparseSelector,
  selectUltraSparseExperts,
  selectUltraSparseExpertsIndexed,
  selectUltraSparseExpertsMasked,
} from "../src/core/ultrasparseRouter.js";

const workload = [
  "Debug the JavaScript function and explain the API bug.",
  "Research current evidence and cite the source.",
  "Calculate the probability and show the equation.",
  "Draft an email and rewrite it in a warmer tone.",
  "Plan the project schedule and prioritize the steps.",
  "Compare the study with the reference and write a summary.",
];
const workloadFingerprint = createHash("sha256").update(JSON.stringify(workload), "utf8").digest("hex");
const smokeMode = process.argv.includes("--smoke");
const warmup = smokeMode ? 20 : 2_000;
const samplesPerTrial = smokeMode ? 50 : 10_000;
const trials = smokeMode ? 1 : 5;
const timerOverheadSamples = smokeMode ? 50 : 10_000;
const algorithms = [
  ["linear", selectUltraSparseExperts],
  ["indexed", selectUltraSparseExpertsIndexed],
  ["masked", selectUltraSparseExpertsMasked],
];
const expectedOutputs = new Map(workload.map((query) => [query, selectUltraSparseExperts(query)]));
const equivalentCalls = Object.fromEntries(algorithms.map(([name]) => [name, 0]));

function outputsEqual(actual, expected) {
  if (!actual || typeof actual !== "object" || Object.keys(actual).length !== 4) return false;
  if (actual.status !== expected.status || actual.truncated !== expected.truncated) return false;
  if (!Array.isArray(actual.experts) || actual.experts.length !== expected.experts.length) return false;
  if (!Array.isArray(actual.matchedTerms) || actual.matchedTerms.length !== expected.matchedTerms.length) return false;
  for (let index = 0; index < actual.experts.length; index += 1) {
    if (actual.experts[index]?.id !== expected.experts[index].id || actual.experts[index]?.score !== expected.experts[index].score) return false;
  }
  for (let index = 0; index < actual.matchedTerms.length; index += 1) {
    if (actual.matchedTerms[index]?.expert !== expected.matchedTerms[index].expert || actual.matchedTerms[index]?.term !== expected.matchedTerms[index].term) return false;
  }
  return true;
}

function verifyOutput(name, query, output) {
  if (!outputsEqual(output, expectedOutputs.get(query))) {
    throw new Error(`Selector output mismatch: ${name}`);
  }
  equivalentCalls[name] += 1;
}

function createScalingWorkload(expertCount) {
  const catalog = Array.from({ length: expertCount }, (_, expertIndex) => ({
    id: `expert-${String(expertIndex).padStart(5, "0")}`,
    terms: Array.from({ length: 8 }, (_, termIndex) => `expert${expertIndex}term${termIndex}`),
  }));
  const pairs = [
    [0, Math.floor(expertCount / 2)],
    [Math.floor(expertCount / 3), Math.floor((expertCount * 2) / 3)],
    [expertCount - 2, expertCount - 1],
  ];
  const queries = pairs.map((pair) => `${pair.flatMap((expertIndex) => catalog[expertIndex].terms.slice(0, 4)).join(" ")} unrelated tokens`);
  return { catalog, queries };
}

function benchmarkScaling() {
  const expertCounts = smokeMode ? [5, 20, 100] : [5, 20, 100, 500, 2_000];
  return expertCounts.map((expertCount) => {
    const { catalog, queries } = createScalingWorkload(expertCount);
    const preparationStarted = process.hrtime.bigint();
    const selector = createUltraSparseSelector(catalog);
    const catalogConstructionMicroseconds = Number(process.hrtime.bigint() - preparationStarted) / 1e3;
    const indexPreparationStarted = process.hrtime.bigint();
    selector.prepareIndexed();
    const indexedCandidatePreparationMicroseconds = Number(process.hrtime.bigint() - indexPreparationStarted) / 1e3;
    const expected = new Map(queries.map((query) => [query, selector.selectLinear(query)]));
    const samplesPerTrial = smokeMode ? 50 : expertCount <= 100 ? 5_000 : expertCount <= 500 ? 1_000 : 250;
    const warmupPerTrial = smokeMode ? 20 : 300;
    const trialCount = smokeMode ? 1 : 3;
    const samples = { linear: [], indexedCandidates: [] };
    const samplesByTrial = {
      linear: Array.from({ length: trialCount }, () => []),
      indexedCandidates: Array.from({ length: trialCount }, () => []),
    };
    const checkedCalls = { linear: 0, indexedCandidates: 0, adaptive: 0 };

    function checkResult(name, query, result) {
      if (!outputsEqual(result, expected.get(query))) throw new Error(`Scaling selector output mismatch: ${name}, experts=${expertCount}`);
      checkedCalls[name] += 1;
    }

    for (let trial = 0; trial < trialCount; trial += 1) {
      for (let index = 0; index < warmupPerTrial; index += 1) {
        const query = queries[index % queries.length];
        checkResult("linear", query, selector.selectLinear(query));
        checkResult("indexedCandidates", query, selector.selectIndexed(query));
        checkResult("adaptive", query, selector.select(query));
      }
      for (let index = 0; index < samplesPerTrial; index += 1) {
        const query = queries[(trial * samplesPerTrial + index) % queries.length];
        const offset = (trial + index) % 2;
        const order = offset === 0
          ? [["linear", selector.selectLinear], ["indexedCandidates", selector.selectIndexed]]
          : [["indexedCandidates", selector.selectIndexed], ["linear", selector.selectLinear]];
        for (const [name, select] of order) {
          const started = process.hrtime.bigint();
          const result = select(query);
          const elapsedNs = Number(process.hrtime.bigint() - started);
          samples[name].push(elapsedNs);
          samplesByTrial[name][trial].push(elapsedNs);
          checkResult(name, query, result);
        }
        checkResult("adaptive", query, selector.select(query));
      }
    }

    const linear = summarize(samples.linear);
    const indexedCandidates = summarize(samples.indexedCandidates);
    const selectionSavingsP50 = linear.p50Microseconds - indexedCandidates.p50Microseconds;
    return {
      expertCount,
      termsPerExpert: 8,
      matchedExpertsPerQuery: 2,
      queryCount: queries.length,
      fingerprintVersion: 1,
      fingerprintAlgorithm: "sha256",
      fingerprintCanonicalization: "UTF-8 bytes of JSON.stringify(value)",
      catalogSha256: createHash("sha256").update(JSON.stringify(catalog), "utf8").digest("hex"),
      querySha256: createHash("sha256").update(JSON.stringify(queries), "utf8").digest("hex"),
      selectorStrategy: selector.strategy,
      catalogConstructionMicroseconds,
      indexedCandidatePreparationMicroseconds,
      samplesPerTrial,
      warmupPerTrial,
      trials: trialCount,
      linear,
      indexedCandidates,
      adaptivePathP95PerTrialMicroseconds: samplesByTrial[selector.strategy === "linear" ? "linear" : "indexedCandidates"]
        .map((trialSamples) => summarize(trialSamples).p95Microseconds),
      estimatedBreakEvenSelectionsAtP50: selectionSavingsP50 > 0
        ? Math.ceil((catalogConstructionMicroseconds + indexedCandidatePreparationMicroseconds) / selectionSavingsP50)
        : null,
      adaptivePath: selector.strategy,
      correctness: {
        baseline: "linear",
        outputEquivalent: true,
        comparedAfterTimer: true,
        checkedCalls,
      },
    };
  });
}

function summarize(samplesNs) {
  const sorted = [...samplesNs].sort((left, right) => left - right);
  const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
  return {
    samples: sorted.length,
    p50Microseconds: percentile(0.50) / 1e3,
    p95Microseconds: percentile(0.95) / 1e3,
    p99Microseconds: percentile(0.99) / 1e3,
  };
}

const selectionSamplesNs = Object.fromEntries(algorithms.map(([name]) => [name, []]));
const selectionSamplesByTrialNs = Object.fromEntries(algorithms.map(([name]) => [
  name,
  Array.from({ length: trials }, () => []),
]));
const memoryBefore = process.memoryUsage();
for (let trial = 0; trial < trials; trial += 1) {
  for (let index = 0; index < warmup; index += 1) {
    const query = workload[index % workload.length];
    for (const [name, select] of algorithms) verifyOutput(name, query, select(query));
  }
  for (let index = 0; index < samplesPerTrial; index += 1) {
    const query = workload[(trial * samplesPerTrial + index) % workload.length];
    const offset = (trial + index) % algorithms.length;
    const order = [...algorithms.slice(offset), ...algorithms.slice(0, offset)];
    for (const [name, select] of order) {
      const started = process.hrtime.bigint();
      const output = select(query);
      const elapsedNs = Number(process.hrtime.bigint() - started);
      selectionSamplesNs[name].push(elapsedNs);
      selectionSamplesByTrialNs[name][trial].push(elapsedNs);
      // Consume and compare the exact timed result after stopping the timer.
      verifyOutput(name, query, output);
    }
  }
}
const memoryAfter = process.memoryUsage();
const runtimeEnvironment = {
  runtime: {
    name: "node",
    version: process.version,
    v8Version: process.versions.v8,
  },
  operatingSystem: {
    platform: process.platform,
    release: os.release(),
    architecture: process.arch,
  },
  cpu: {
    model: os.cpus()[0]?.model || "unknown",
    logicalCpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  },
};

const emptyPairSamplesNs = [];
for (let index = 0; index < timerOverheadSamples; index += 1) {
  const started = process.hrtime.bigint();
  emptyPairSamplesNs.push(Number(process.hrtime.bigint() - started));
}

const scalingResults = benchmarkScaling();
const primaryTrialP95Microseconds = Object.fromEntries(algorithms.map(([name]) => [
  name,
  selectionSamplesByTrialNs[name].map((trialSamples) => summarize(trialSamples).p95Microseconds),
]));
const subMillisecondTargetVerified = !smokeMode
  && Object.values(primaryTrialP95Microseconds).every((trialValues) => trialValues.every((value) => value < 1_000))
  && scalingResults.every(({ adaptivePathP95PerTrialMicroseconds }) => adaptivePathP95PerTrialMicroseconds.every((value) => value < 1_000));

const report = {
  benchmark: "HEY lexical ultrasparse selector comparison",
  mode: smokeMode ? "smoke" : "benchmark",
  samplesPerTrial,
  warmupPerTrial: warmup,
  trials,
  timerOverheadSamples,
  workloadCount: workload.length,
  workloadBytes: workload.reduce((sum, item) => sum + Buffer.byteLength(item), 0),
  workloadSha256: workloadFingerprint,
  workloadFingerprint: {
    version: 1,
    algorithm: "sha256",
    canonicalization: "UTF-8 bytes of JSON.stringify(queryArray)",
    queryCount: workload.length,
    queryUtf8Bytes: workload.reduce((sum, item) => sum + Buffer.byteLength(item), 0),
    digest: workloadFingerprint,
  },
  algorithms: {
    linear: {
      isDefault: true,
      description: "Scan each expert's declared terms against the token set.",
      perOperationSelectionLatency: summarize(selectionSamplesNs.linear),
      p95MicrosecondsByTrial: primaryTrialP95Microseconds.linear,
    },
    indexed: {
      isDefault: false,
      description: "Use a prebuilt token-to-expert inverted index.",
      perOperationSelectionLatency: summarize(selectionSamplesNs.indexed),
      p95MicrosecondsByTrial: primaryTrialP95Microseconds.indexed,
    },
    masked: {
      isDefault: false,
      description: "Use a prebuilt token-to-expert bit-mask index with fixed per-expert accumulators.",
      perOperationSelectionLatency: summarize(selectionSamplesNs.masked),
      p95MicrosecondsByTrial: primaryTrialP95Microseconds.masked,
    },
  },
  correctness: {
    baseline: "linear",
    outputEquivalent: true,
    comparedAfterTimer: true,
    checkedCallsPerAlgorithm: equivalentCalls.linear,
    checkedCalls: equivalentCalls,
  },
  scalingBenchmarks: {
    synthetic: true,
    catalogPreparationIncludedInSelectionLatency: false,
    indexedCandidatePreparationIncludedInSelectionLatency: false,
    comparison: "linear full scan vs indexed candidate accumulation",
    results: scalingResults,
  },
  selectionOnly: true,
  modelLoadingIncluded: false,
  networkIncluded: false,
  prefillIncluded: false,
  decodeIncluded: false,
  inferenceIncluded: false,
  performanceClaims: {
    subMillisecondTargetVerified,
    verificationScope: "p95 below 1,000 microseconds in every full-mode trial for each fixed selector and each synthetic catalog's adaptive path",
    endToEndSubMillisecondTargetVerified: false,
    linearReferenceCatalogCountsOver1ms: scalingResults.filter(({ linear }) => linear.p95Microseconds >= 1_000).map(({ expertCount }) => expertCount),
    note: "This verifies only in-process lexical selection for the declared synthetic workload; linear reference scans at listed catalog sizes may exceed 1 ms, and no end-to-end or production latency is verified.",
  },
  emptyTimerPairLatency: summarize(emptyPairSamplesNs),
  timingMethod: "Each operation is bracketed by process.hrtime.bigint(); each algorithm receives the same deterministic query sequence, call order rotates across algorithms to balance ordering effects, and empty timer-pair samples estimate timer overhead without subtraction.",
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  cpu: os.cpus()[0]?.model || "unknown",
  logicalCpuCount: os.cpus().length,
  totalMemoryBytes: os.totalmem(),
  executionEnvironment: runtimeEnvironment,
  processMemoryBytes: {
    before: memoryBefore.rss,
    after: memoryAfter.rss,
    delta: memoryAfter.rss - memoryBefore.rss,
    note: "Whole-process RSS snapshots; not attributable to an algorithm or a per-operation allocation measurement.",
  },
  note: "One local synthetic lexical workload; not a model quality, energy, memory-footprint, GPU, or production-performance result.",
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
