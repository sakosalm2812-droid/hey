import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { InMemoryMandateStore, MANDATE_STORE_CONTRACT_VERSION, issueActionMandate, verifyAndConsumeMandate } from "../src/core/actionMandate.js";

globalThis.crypto ??= webcrypto;

test("mandate verification rejects accessor, cyclic, and sparse signed payloads without side effects", async () => {
  const now = Date.parse("2026-10-14T12:00:00.000Z");
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const trustedKeys = { root: keys.publicKey };
  const mandate = await issueActionMandate({
    accountId: "acct-1",
    actions: ["web.search"],
    resources: ["web.search"],
    expiresAt: new Date(now + 60_000).toISOString(),
  }, { privateKey: keys.privateKey, keyId: "root", now });
  const context = { accountId: "acct-1", action: "web.search", resource: "web.search", currentRevocationEpoch: 0, idempotencyKey: "attack-case-1" };

  let getterCalls = 0;
  const accessorPayload = { ...mandate.payload };
  Object.defineProperty(accessorPayload, "accountId", {
    enumerable: true,
    get() { getterCalls += 1; return "acct-1"; },
  });
  const noOpStore = new InMemoryMandateStore();
  const accessorResult = await verifyAndConsumeMandate({ payload: accessorPayload, signature: mandate.signature }, context, { trustedKeys, store: noOpStore, now });
  assert.equal(accessorResult.authorized, false);
  assert.equal(getterCalls, 0);
  assert.equal(noOpStore.usage.size, 0);

  let signatureGetterCalls = 0;
  const accessorEnvelope = { payload: mandate.payload };
  Object.defineProperty(accessorEnvelope, "signature", {
    enumerable: true,
    get() { signatureGetterCalls += 1; return mandate.signature; },
  });
  const envelopeResult = await verifyAndConsumeMandate(accessorEnvelope, context, { trustedKeys, store: noOpStore, now });
  assert.equal(envelopeResult.authorized, false);
  assert.equal(signatureGetterCalls, 0);

  const cyclicPayload = { ...mandate.payload, delegationDepth: 1, parent: null };
  cyclicPayload.parent = cyclicPayload;
  const cyclicResult = await verifyAndConsumeMandate({ payload: cyclicPayload, signature: mandate.signature }, context, { trustedKeys, store: noOpStore, now });
  assert.equal(cyclicResult.authorized, false);

  const sparsePayload = { ...mandate.payload, actions: new Array(2) };
  sparsePayload.actions[1] = "web.search";
  const sparseResult = await verifyAndConsumeMandate({ payload: sparsePayload, signature: mandate.signature }, context, { trustedKeys, store: noOpStore, now });
  assert.equal(sparseResult.authorized, false);
  assert.equal(noOpStore.usage.size, 0);
});

test("mandate authority read failures fail closed instead of escaping verification", async () => {
  const now = Date.parse("2026-10-14T12:00:00.000Z");
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const mandate = await issueActionMandate({
    accountId: "acct-1",
    actions: ["web.search"],
    resources: ["web.search"],
    expiresAt: new Date(now + 60_000).toISOString(),
  }, { privateKey: keys.privateKey, keyId: "root", now });
  const result = await verifyAndConsumeMandate(mandate, {
    accountId: "acct-1",
    action: "web.search",
    resource: "web.search",
    currentRevocationEpoch: 0,
    idempotencyKey: "storage-failure",
  }, {
    trustedKeys: { root: keys.publicKey },
    store: { contractVersion: MANDATE_STORE_CONTRACT_VERSION, async isRevoked() { throw new Error("offline"); }, async consumeChain() { assert.fail("must not consume after a failed revocation read"); } },
    now,
  });
  assert.equal(result.authorized, false);
  assert.match(result.reason, /storage failed/i);

  let legacyConsumes = 0;
  const legacyStore = {
    async isRevoked() { return false; },
    async consumeChain() { legacyConsumes += 1; return { consumed: true }; },
  };
  const legacyResult = await verifyAndConsumeMandate(mandate, {
    accountId: "acct-1",
    action: "web.search",
    resource: "web.search",
    currentRevocationEpoch: 0,
    idempotencyKey: "legacy-store-contract",
  }, { trustedKeys: { root: keys.publicKey }, store: legacyStore, now });
  assert.equal(legacyResult.authorized, false);
  assert.match(legacyResult.reason, /v2 mandate store/i);
  assert.equal(legacyConsumes, 0, "legacy stores must be rejected before they can ignore atomic epoch context");
});

test("mandate consumption atomically rejects a revocation epoch advanced after preflight", async () => {
  const now = Date.parse("2026-10-14T12:00:00.000Z");
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const mandate = await issueActionMandate({
    accountId: "acct-epoch-race",
    actions: ["web.search"],
    resources: ["web.search"],
    revocationEpoch: 0,
    maxUses: 2,
    expiresAt: new Date(now + 60_000).toISOString(),
  }, { privateKey: keys.privateKey, keyId: "root", now });
  const backingStore = new InMemoryMandateStore();
  backingStore.setCurrentRevocationEpoch("acct-epoch-race", 0);
  let advanced = false;
  const racingStore = {
    contractVersion: MANDATE_STORE_CONTRACT_VERSION,
    async isRevoked(id) {
      const revoked = await backingStore.isRevoked(id);
      if (!advanced) {
        advanced = true;
        backingStore.setCurrentRevocationEpoch("acct-epoch-race", 1);
      }
      return revoked;
    },
    consumeChain: (...args) => backingStore.consumeChain(...args),
  };

  const result = await verifyAndConsumeMandate(mandate, {
    accountId: "acct-epoch-race",
    action: "web.search",
    resource: "web.search",
    currentRevocationEpoch: 0,
    idempotencyKey: "epoch-race-1",
  }, { trustedKeys: { root: keys.publicKey }, store: racingStore, now });

  assert.equal(result.authorized, false);
  assert.match(result.reason, /epoch changed/i);
  assert.equal(backingStore.usage.size, 0, "a stale epoch must not consume any delegation-chain use");
  assert.equal(backingStore.idempotency.size, 0, "a stale epoch must not reserve the replay key");
});
