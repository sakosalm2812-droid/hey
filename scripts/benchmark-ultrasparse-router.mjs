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
const warmup = 2_000;
const iterations = 50_000;
const trials = 5;

for (let index = 0; index < warmup; index += 1) selectUltraSparseExperts(workload[index % workload.length]);
const elapsedSamplesNs = [];
for (let trial = 0; trial < trials; trial += 1) {
  const started = process.hrtime.bigint();
  for (let index = 0; index < iterations; index += 1) selectUltraSparseExperts(workload[index % workload.length]);
  elapsedSamplesNs.push(Number(process.hrtime.bigint() - started));
}
const sortedSamplesNs = [...elapsedSamplesNs].sort((left, right) => left - right);
const medianNs = sortedSamplesNs[Math.floor(sortedSamplesNs.length / 2)];
const report = {
  benchmark: "HEY lexical ultrasparse routing prototype",
  iterations,
  warmup,
  trials,
  workloadCount: workload.length,
  workloadBytes: workload.reduce((sum, item) => sum + Buffer.byteLength(item), 0),
  selectionOnly: true,
  modelLoadingIncluded: false,
  inferenceIncluded: false,
  medianTrialElapsedMs: medianNs / 1e6,
  medianSelectionMicroseconds: medianNs / iterations / 1e3,
  trialSelectionMicroseconds: elapsedSamplesNs.map((sample) => sample / iterations / 1e3),
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  cpu: os.cpus()[0]?.model || "unknown",
  logicalCpuCount: os.cpus().length,
  totalMemoryBytes: os.totalmem(),
  note: "One local synthetic lexical workload; not a model quality, energy, memory-footprint, GPU, or production-performance result.",
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
