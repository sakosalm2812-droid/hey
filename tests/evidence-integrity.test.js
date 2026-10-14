import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  createEvidenceEnvelope,
  verifyEvidenceEnvelope,
  invalidateEvidence,
  InMemoryEvidenceStore,
} from "../src/core/evidenceIntegrity.js";

globalThis.crypto ??= webcrypto;

test("signed evidence is account-bound, fresh, and detects tampering and invalidation", async () => {
  const keys = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const now = Date.parse("2026-10-14T12:00:00Z");
  const store = new InMemoryEvidenceStore();
  const envelope = await createEvidenceEnvelope({
    accountId: "account-a", source: { kind: "sensor", id: "sensor-1" }, body: { value: 42 },
    capturedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 60_000).toISOString(), revocationEpoch: 3,
  }, { privateKey: keys.privateKey, keyId: "trusted-1", now });
  const options = { trustedKeys: { "trusted-1": keys.publicKey }, store, now, maxAgeMs: 10_000, allowTestOnlyStore: true };
  const context = { accountId: "account-a", currentRevocationEpoch: 3 };
  assert.equal((await verifyEvidenceEnvelope(envelope, envelope.body, context, options)).valid, true);
  assert.equal((await verifyEvidenceEnvelope(envelope, envelope.body, { ...context, accountId: "account-b" }, options)).status, "denied");
  assert.equal((await verifyEvidenceEnvelope(envelope, { value: 43 }, context, options)).valid, false);
  await assert.rejects(() => invalidateEvidence(envelope.payload.id, "source_withdrawn", store, { accountId: context.accountId }), /test-only/i);
  await invalidateEvidence(envelope.payload.id, "source_withdrawn", store, { accountId: context.accountId, allowTestOnlyStore: true });
  assert.equal((await verifyEvidenceEnvelope(envelope, envelope.body, context, options)).status, "invalidated");
});

test("evidence fails closed for cycles, accessors, malformed freshness, offline policy, and storage faults", async () => {
  const keys = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const now = Date.now();
  const badCycle = {}; badCycle.self = badCycle;
  await assert.rejects(() => createEvidenceEnvelope({ accountId: "a", source: { kind: "x" }, body: badCycle }, { privateKey: keys.privateKey, keyId: "k", now }), /cyclic/);
  const accessor = Object.defineProperty({}, "secret", { enumerable: true, get() { throw new Error("must not execute"); } });
  await assert.rejects(() => createEvidenceEnvelope({ accountId: "a", source: { kind: "x" }, body: accessor }, { privateKey: keys.privateKey, keyId: "k", now }), /accessor/);
  const envelope = await createEvidenceEnvelope({ accountId: "a", source: { kind: "x" }, body: { ok: true } }, { privateKey: keys.privateKey, keyId: "k", now });
  const trustedKeys = { k: keys.publicKey };
  const context = { accountId: "a", currentRevocationEpoch: 0 };
  assert.equal((await verifyEvidenceEnvelope(envelope, envelope.body, context, { trustedKeys, store: new InMemoryEvidenceStore(), now, maxAgeMs: -1, allowTestOnlyStore: true })).valid, false);
  const offline = await createEvidenceEnvelope({ accountId: "a", source: { kind: "x" }, body: { ok: true }, offlineAllowed: false }, { privateKey: keys.privateKey, keyId: "k", now });
  assert.equal((await verifyEvidenceEnvelope(offline, offline.body, context, { trustedKeys, store: new InMemoryEvidenceStore(), now, online: false, allowTestOnlyStore: true })).status, "offline_denied");
  assert.equal((await verifyEvidenceEnvelope(envelope, envelope.body, context, { trustedKeys, store: { contractVersion: "hey.evidence-store.v1", async isInvalidated() { throw new Error("db down"); } }, now })).status, "unavailable");
});

test("volatile evidence invalidation is denied unless a test explicitly opts in", async () => {
  const keys = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const now = Date.now();
  const store = new InMemoryEvidenceStore();
  const envelope = await createEvidenceEnvelope({ accountId: "a", source: { kind: "x" }, body: { ok: true } }, { privateKey: keys.privateKey, keyId: "k", now });
  const context = { accountId: "a", currentRevocationEpoch: 0 };
  const denied = await verifyEvidenceEnvelope(envelope, envelope.body, context, { trustedKeys: { k: keys.publicKey }, store, now });
  assert.equal(denied.valid, false);
  assert.match(denied.reason, /test-only/i);
  const allowed = await verifyEvidenceEnvelope(envelope, envelope.body, context, { trustedKeys: { k: keys.publicKey }, store, now, allowTestOnlyStore: true });
  assert.equal(allowed.valid, true);
});
