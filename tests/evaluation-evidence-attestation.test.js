import assert from "node:assert/strict";
import test from "node:test";

import { clearPermissions, seedPermissions } from "../src/core/permissionManager.js";
import { setAccountScope } from "../src/core/accountScope.js";
import { selectModel } from "../src/core/providerRouter.js";
import { attachEvaluationReport, clearProviders, registerProvider } from "../src/core/providerRegistry.js";
import { createEvaluationReport, verifyEvaluationReport } from "../src/core/modelPlatform.js";

const model = {
  id: "fixture/evaluation-model",
  revision: "pinned-revision-1",
  weightSha256: "a".repeat(64),
};

function sampleRun() {
  return {
    model,
    suite: "fixture-suite",
    suiteRevision: "fixture-suite-revision-1",
    datasetSha256: "b".repeat(64),
    evaluatedAt: new Date(Date.now() - 60_000).toISOString(),
    hardware: "fixture host; no model execution asserted",
    runtime: "fixture-runtime",
    runtimeVersion: "1.0.0",
    runId: "fixture-run-1",
    pricing: { inputUsdPerMillion: 1, outputUsdPerMillion: 2 },
    samples: [
      { caseId: "case-1", passed: true, latencyMs: 10, inputTokens: 4, outputTokens: 3 },
      { caseId: "case-2", passed: false, latencyMs: 20, inputTokens: 5, outputTokens: 2 },
    ],
  };
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

async function digestReportBody(report) {
  const body = Object.fromEntries(Object.entries(report).filter(([key]) => key !== "reportDigest"));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(body)));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

test("evaluation digests cannot promote caller-supplied observations into attested routing evidence", async () => {
  clearProviders();
  clearPermissions();
  setAccountScope("evaluation-receipt-fixture");
  const provider = registerProvider({
    id: "evaluation-receipt-fixture",
    name: "Evaluation Receipt Fixture",
    capabilities: ["chat"],
    models: [{ ...model, priority: 1 }],
  });
  seedPermissions([
    { permission: "provider.remote", status: "granted", scope: "account" },
    { permission: `provider:${provider.id}`, status: "granted", scope: "account" },
  ], "evaluation-receipt-fixture");

  try {
    const report = await createEvaluationReport(sampleRun());
    assert.equal(report.measurementEvidenceStatus, "caller_supplied_unattested");
    assert.equal(await verifyEvaluationReport(report), true, "the unkeyed digest still verifies report integrity");

    const attached = await attachEvaluationReport(provider.id, model.id, report);
    assert.equal(attached.routingEvidence.evaluationReportDigest, report.reportDigest);
    assert.equal(attached.routingEvidence.measurementEvidenceStatus, "caller_supplied_unattested");
    assert.equal(selectModel({ profile: "fast", allowedProviders: [provider.id] }).selected, null,
      "digest integrity alone cannot authorize profile routing");

    const forged = structuredClone(report);
    forged.measurementEvidenceStatus = "independently_attested";
    forged.reportDigest = await digestReportBody(forged);
    assert.equal(await verifyEvaluationReport(forged), false,
      "recomputing the public digest cannot forge independent attestation");
  } finally {
    clearProviders();
    clearPermissions();
    setAccountScope(null);
  }
});
