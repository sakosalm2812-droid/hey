import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import { createEvidenceEnvelope, InMemoryEvidenceStore } from "../src/core/evidenceIntegrity.js";
import { evaluateReleaseGate } from "../src/core/releaseGate.js";

globalThis.crypto ??= webcrypto;

const accountId = "release-audit-account";
const context = { accountId, currentRevocationEpoch: 4 };
const gate = { id: "web-build", version: "2", subjectDigest: "sha256:current-build" };

async function fixture({ signer = "release-auditor", body = {}, ageMs = 0, store = new InMemoryEvidenceStore() } = {}) {
  const keys = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const now = Date.parse("2026-10-14T12:00:00.000Z");
  const envelope = await createEvidenceEnvelope({
    accountId,
    source: { kind: "release-check", id: "ci-run-42" },
    body: { gateId: gate.id, gateVersion: gate.version, subjectDigest: gate.subjectDigest, result: "passed", ...body },
    capturedAt: new Date(now - ageMs).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    revocationEpoch: 4,
  }, { privateKey: keys.privateKey, keyId: signer, now: now - ageMs });
  return {
    now,
    envelope,
    store,
    options: { trustedKeys: { [signer]: keys.publicKey }, store, maxAgeMs: 30_000, allowTestOnlyStore: true },
  };
}

function request(fixtureData, { gates = [gate], evidence = [fixtureData.envelope], publicClaims = [{ id: "claim-web-ready", text: "Web release verified", gateIds: [gate.id] }], verifierIds = ["release-auditor"] } = {}) {
  return evaluateReleaseGate({
    gates,
    evidence: evidence.map((envelope) => ({ envelope })),
    publicClaims,
    verificationContext: context,
    verificationOptions: fixtureData.options,
    trustedIndependentVerifierKeyIds: verifierIds,
    now: fixtureData.now,
  });
}

test("release recommendation requires fresh signed evidence for current gate versions and mapped claims", async () => {
  const fixtureData = await fixture();
  const result = await request(fixtureData);
  assert.equal(result.recommendation, "READY");
  assert.equal(result.gates[0].status, "passed");
  assert.equal(result.publicClaims[0].status, "passed");
  assert.equal(result.gates[0].evidenceIds[0], fixtureData.envelope.payload.id);
});

test("release evidence fails closed when stale, revoked, signed by an unapproved verifier, or for an old subject", async (t) => {
  await t.test("stale", async () => {
    const data = await fixture({ ageMs: 31_000 });
    const result = await request(data);
    assert.equal(result.recommendation, "NOT_READY");
    assert.equal(result.rejectedEvidenceCount, 1);
  });

  await t.test("revoked", async () => {
    const data = await fixture();
    await data.store.invalidate(data.envelope.payload.id, "audit_withdrawn", { accountId });
    const result = await request(data);
    assert.equal(result.recommendation, "NOT_READY");
  });

  await t.test("unapproved signer", async () => {
    const data = await fixture({ signer: "ordinary-build-key" });
    const result = await request(data);
    assert.equal(result.recommendation, "NOT_READY");
    assert.equal(result.rejectedEvidenceCount, 1);
  });

  await t.test("superseded build digest", async () => {
    const data = await fixture({ body: { subjectDigest: "sha256:previous-build" } });
    const result = await request(data);
    assert.equal(result.recommendation, "NOT_READY");
    assert.equal(result.gates[0].reason, "current_independent_evidence_missing");
  });
});

test("claims with missing gate coverage block release and unsupported optional gates remain explicit", async () => {
  const data = await fixture();
  const unsupportedClaim = await request(data, { publicClaims: [{ id: "claim-native-ready", text: "Native release ready", gateIds: ["windows-device-build"] }] });
  assert.equal(unsupportedClaim.recommendation, "NOT_READY");
  assert.equal(unsupportedClaim.publicClaims[0].status, "blocked");

  const limitation = await request(data, { gates: [gate, { id: "native-build", version: "1", subjectDigest: "sha256:native", required: false }] });
  assert.equal(limitation.recommendation, "READY_WITH_EXPLICIT_LIMITATIONS");
  assert.equal(limitation.gates[1].status, "not_required");
});

test("malformed release inventory cannot manufacture a ready recommendation", async () => {
  const data = await fixture();
  await assert.rejects(() => request(data, { gates: [] }), /At least one release gate/);
  await assert.rejects(() => request(data, { publicClaims: [{ id: "claim", text: "Claim", gateIds: [] }] }), /non-empty array/);
  const accessorClaim = Object.defineProperty({ id: "claim", gateIds: [gate.id] }, "text", { enumerable: true, get() { throw new Error("should not run"); } });
  await assert.rejects(() => request(data, { publicClaims: [accessorClaim] }), /accessor properties/);
});
