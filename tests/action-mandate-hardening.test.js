import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { InMemoryMandateStore, issueActionMandate, verifyAndConsumeMandate } from "../src/core/actionMandate.js";

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
    store: { async isRevoked() { throw new Error("offline"); }, async consumeChain() { assert.fail("must not consume after a failed revocation read"); } },
    now,
  });
  assert.equal(result.authorized, false);
  assert.match(result.reason, /storage failed/i);
});
