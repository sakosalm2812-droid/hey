import os from "node:os";
import { selectUltraSparseExperts } from "../src/core/ultrasparseRouter.js";

const workload = [
  "Debug the JavaScript function and explain the API bug.",
  "Research current evidence and cite the source.",
  "Calculate the probability and show the equation.",
  "Draft an email and rewrite it in a warmer tone.",
  "Plan the project schedule and prioritize the steps.",
  "Compare the study with the reference and write a summary.",
];
const smokeMode = process.argv.includes("--smoke");
const warmup = smokeMode ? 20 : 2_000;
const samplesPerTrial = smokeMode ? 50 : 10_000;
const trials = smokeMode ? 1 : 5;
const timerOverheadSamples = smokeMode ? 50 : 10_000;

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

const selectionSamplesNs = [];
for (let trial = 0; trial < trials; trial += 1) {
  for (let index = 0; index < warmup; index += 1) selectUltraSparseExperts(workload[index % workload.length]);
  for (let index = 0; index < samplesPerTrial; index += 1) {
    const started = process.hrtime.bigint();
    selectUltraSparseExperts(workload[(trial * samplesPerTrial + index) % workload.length]);
    selectionSamplesNs.push(Number(process.hrtime.bigint() - started));
  }
}

const emptyPairSamplesNs = [];
for (let index = 0; index < timerOverheadSamples; index += 1) {
  const started = process.hrtime.bigint();
  emptyPairSamplesNs.push(Number(process.hrtime.bigint() - started));
}

const report = {
  benchmark: "HEY lexical ultrasparse routing prototype",
  mode: smokeMode ? "smoke" : "benchmark",
  samplesPerTrial,
  warmupPerTrial: warmup,
  trials,
  timerOverheadSamples,
  workloadCount: workload.length,
  workloadBytes: workload.reduce((sum, item) => sum + Buffer.byteLength(item), 0),
  selectionOnly: true,
  modelLoadingIncluded: false,
  inferenceIncluded: false,
  perOperationSelectionLatency: summarize(selectionSamplesNs),
  emptyTimerPairLatency: summarize(emptyPairSamplesNs),
  timingMethod: "Each operation is bracketed by process.hrtime.bigint(); empty timer-pair samples estimate instrumentation overhead and are reported without subtraction.",
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  cpu: os.cpus()[0]?.model || "unknown",
  logicalCpuCount: os.cpus().length,
  totalMemoryBytes: os.totalmem(),
  note: "One local synthetic lexical workload; not a model quality, energy, memory-footprint, GPU, or production-performance result.",
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
