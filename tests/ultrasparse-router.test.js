import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createUltraSparsePlan,
  selectUltraSparseExperts,
  selectUltraSparseExpertsIndexed,
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

test("experimental token index is exactly equivalent to the linear baseline on deterministic and hostile inputs", () => {
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
      assert.deepEqual(selectUltraSparseExpertsIndexed(query, options), selectUltraSparseExperts(query, options), `query=${query.slice(0, 60)} limit=${limit}`);
    }
  }
  for (const invalid of [null, undefined, 42, {}, ["code"]]) {
    assert.deepEqual(selectUltraSparseExpertsIndexed(invalid), selectUltraSparseExperts(invalid));
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

test("plan uses the canonical provider router and declares that no inference occurred", () => {
  clearProviders();
  const plan = createUltraSparsePlan("write an email draft", { intent: "conversation" });
  assert.equal(plan.prototype, "lexical-ultrasparse-v1");
  assert.equal(plan.experts.experts[0].id, "writing");
  assert.ok(plan.providerPlan.attempts.length > 0);
  assert.equal(plan.inferencePerformed, false);
  clearProviders();
});

test("benchmark smoke mode emits bounded latency percentiles and timer overhead", () => {
  const scriptPath = fileURLToPath(new URL("../scripts/benchmark-ultrasparse-router.mjs", import.meta.url));
  const output = execFileSync(process.execPath, [scriptPath, "--smoke"], { encoding: "utf8" });
  const report = JSON.parse(output);
  assert.equal(report.mode, "smoke");
  assert.equal(report.selectionOnly, true);
  assert.equal(report.modelLoadingIncluded, false);
  assert.equal(report.inferenceIncluded, false);
  assert.equal(report.algorithms.linear.perOperationSelectionLatency.samples, 50);
  assert.equal(report.algorithms.indexed.perOperationSelectionLatency.samples, 50);
  assert.equal(report.emptyTimerPairLatency.samples, 50);
  for (const key of ["p50Microseconds", "p95Microseconds", "p99Microseconds"]) {
    assert.ok(Number.isFinite(report.algorithms.linear.perOperationSelectionLatency[key]));
    assert.ok(Number.isFinite(report.algorithms.indexed.perOperationSelectionLatency[key]));
    assert.ok(Number.isFinite(report.emptyTimerPairLatency[key]));
  }
});
