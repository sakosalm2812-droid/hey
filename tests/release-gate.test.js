import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import { createEvidenceEnvelope, InMemoryEvidenceStore } from "../src/core/evidenceIntegrity.js";
import { createReleaseInventoryAttestationBody, evaluateReleaseGate } from "../src/core/releaseGate.js";

globalThis.crypto ??= webcrypto;

const accountId = "release-audit-account";
const context = { accountId, currentRevocationEpoch: 4 };
const gate = { id: "web-build", version: "2", subjectDigest: "sha256:current-build" };

async function fixture({ signer = "release-auditor", body = {}, ageMs = 0, store = new InMemoryEvidenceStore() } = {}) {
  const keys = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const inventoryKeys = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
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
    inventoryPrivateKey: inventoryKeys.privateKey,
    store,
    options: { trustedKeys: { [signer]: keys.publicKey, "inventory-authority": inventoryKeys.publicKey }, store, maxAgeMs: 30_000, allowTestOnlyStore: true },
    inventoryChallenge: "release-request-2026-10-14-001",
  };
}

async function request(fixtureData, { gates = [gate], evidence = [fixtureData.envelope], publicClaims = [{ id: "claim-web-ready", text: "Web release verified", gateIds: [gate.id] }], verifierIds = ["release-auditor"], inventoryAttestation, inventoryAttestorIds = ["inventory-authority"], challenge = fixtureData.inventoryChallenge } = {}) {
  if (inventoryAttestation === undefined) {
    inventoryAttestation = await createEvidenceEnvelope({
      accountId,
      source: { kind: "release-inventory", id: "authoritative-registry-17" },
      body: createReleaseInventoryAttestationBody({ gates, publicClaims, challenge }),
      capturedAt: new Date(fixtureData.now).toISOString(),
      expiresAt: new Date(fixtureData.now + 60_000).toISOString(),
      revocationEpoch: 4,
    }, { privateKey: fixtureData.inventoryPrivateKey, keyId: "inventory-authority", now: fixtureData.now });
  }
  return evaluateReleaseGate({
    gates,
    evidence: evidence.map((envelope) => ({ envelope })),
    publicClaims,
    verificationContext: context,
    verificationOptions: fixtureData.options,
    trustedIndependentVerifierKeyIds: verifierIds,
    inventoryAttestation,
    trustedInventoryAttestorKeyIds: inventoryAttestorIds,
    inventoryAttestationChallenge: challenge,
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

test("release recommendation requires a fresh independent signature over the complete inventory and claim mappings", async (t) => {
  const data = await fixture();
  await t.test("missing attestation blocks otherwise passing gates", async () => {
    const result = await request(data, { inventoryAttestation: null });
    assert.equal(result.recommendation, "NOT_READY");
    assert.equal(result.inventoryAttestation.status, "blocked");
  });
  await t.test("changed gate inventory fails its signature binding", async () => {
    const result = await request(data, { gates: [{ ...gate, subjectDigest: "sha256:changed" }] });
    assert.equal(result.recommendation, "NOT_READY");
  });
  await t.test("changed public claim mapping fails its signature binding", async () => {
    const result = await request(data, { publicClaims: [{ id: "claim-web-ready", text: "Web release verified", gateIds: ["another-gate"] }] });
    assert.equal(result.recommendation, "NOT_READY");
  });
  await t.test("replayed challenge and wrong signer fail closed", async () => {
    const claims = [{ id: "claim-web-ready", text: "Web release verified", gateIds: [gate.id] }];
    const oldAttestation = await createEvidenceEnvelope({
      accountId,
      source: { kind: "release-inventory", id: "authoritative-registry-17" },
      body: createReleaseInventoryAttestationBody({ gates: [gate], publicClaims: claims, challenge: data.inventoryChallenge }),
      capturedAt: new Date(data.now).toISOString(),
      expiresAt: new Date(data.now + 60_000).toISOString(),
      revocationEpoch: 4,
    }, { privateKey: data.inventoryPrivateKey, keyId: "inventory-authority", now: data.now });
    const replay = await request(data, { challenge: "new-release-request", inventoryAttestation: oldAttestation });
    assert.equal(replay.recommendation, "NOT_READY");

    const keys = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const body = createReleaseInventoryAttestationBody({ gates: [gate], publicClaims: [{ id: "claim-web-ready", text: "Web release verified", gateIds: [gate.id] }], challenge: data.inventoryChallenge });
    const wrongSigner = await createEvidenceEnvelope({ accountId, source: { kind: "release-inventory" }, body, revocationEpoch: 4 }, { privateKey: keys.privateKey, keyId: "wrong-inventory-authority", now: data.now });
    const rejected = await request(data, { inventoryAttestation: wrongSigner });
    assert.equal(rejected.recommendation, "NOT_READY");
  });
  await t.test("attestation must use a distinct trusted key", async () => {
    const result = await request(data, { inventoryAttestorIds: ["release-auditor"] });
    assert.equal(result.recommendation, "NOT_READY");
  });
  await t.test("malformed and wrong-account attestations fail closed", async () => {
    const malformed = await request(data, { inventoryAttestation: null });
    assert.equal(malformed.recommendation, "NOT_READY");
    const claims = [{ id: "claim-web-ready", text: "Web release verified", gateIds: [gate.id] }];
    const wrongAccount = await createEvidenceEnvelope({
      accountId: "different-account",
      source: { kind: "release-inventory" },
      body: createReleaseInventoryAttestationBody({ gates: [gate], publicClaims: claims, challenge: data.inventoryChallenge }),
      revocationEpoch: 4,
    }, { privateKey: data.inventoryPrivateKey, keyId: "inventory-authority", now: data.now });
    const rejected = await request(data, { inventoryAttestation: wrongAccount });
    assert.equal(rejected.recommendation, "NOT_READY");
  });
  await t.test("stale inventory attestation fails even when the verifier freshness policy is unbounded", async () => {
    const claims = [{ id: "claim-web-ready", text: "Web release verified", gateIds: [gate.id] }];
    const stale = await createEvidenceEnvelope({
      accountId,
      source: { kind: "release-inventory" },
      body: createReleaseInventoryAttestationBody({ gates: [gate], publicClaims: claims, challenge: data.inventoryChallenge }),
      capturedAt: new Date(data.now - 6 * 60 * 1000).toISOString(),
      expiresAt: new Date(data.now + 60_000).toISOString(),
      revocationEpoch: 4,
    }, { privateKey: data.inventoryPrivateKey, keyId: "inventory-authority", now: data.now - 6 * 60 * 1000 });
    const unbounded = { ...data, options: { ...data.options, maxAgeMs: Infinity } };
    const rejected = await request(unbounded, { inventoryAttestation: stale });
    assert.equal(rejected.recommendation, "NOT_READY");
  });
});
