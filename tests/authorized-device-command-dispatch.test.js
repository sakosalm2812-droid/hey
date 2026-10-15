import test from "node:test";
import assert from "node:assert/strict";
import { MANDATE_STORE_CONTRACT_VERSION, issueActionMandate } from "../src/core/actionMandate.js";
import { enqueueAuthorizedDeviceCommand } from "../supabase/functions/hey-device-command/dispatch.js";
import { normalizeDeviceCommandRequest } from "../supabase/functions/hey-device-command/requestContract.js";

const accountId = "2e4a81a4-2da8-4ae0-bfd6-719484a37795";
const deviceId = "67337f11-57da-4c23-a41f-fc19d1995b61";
const action = "browser.open_url";
const resource = "https://example.com";
const idempotencyKey = "dispatch-12345678";
const now = Date.now();

function body(mandate, overrides = {}) {
  return {
    deviceId,
    idempotencyKey,
    envelope: { version: 1, action, resource, input: { url: resource } },
    mandate,
    ...overrides,
  };
}

function durableStore({ epoch = 0, revoked = false } = {}) {
  const replay = new Set();
  const store = {
    contractVersion: MANDATE_STORE_CONTRACT_VERSION,
    testOnly: false,
    async getCurrentRevocationEpoch() { return epoch; },
    async isRevoked() { return revoked; },
    async consumeChain(mandates, key, context) {
      if (context.revocationEpoch !== epoch) return { consumed: false, reason: "stale_epoch" };
      if (revoked) return { consumed: false, reason: "revoked" };
      const replayKey = `${context.accountId}:${mandates[0].mandateId}:${key}`;
      if (replay.has(replayKey)) return { consumed: false, reason: "replay" };
      replay.add(replayKey);
      return { consumed: true, remainingUses: mandates[0].maxUses - replay.size };
    },
  };
  return store;
}

async function signedMandate(keyPair, { issuedAt = now, expiresAt = now + 60_000 } = {}) {
  return issueActionMandate({ accountId, actions: [action], resources: [resource], maxUses: 4, expiresAt: new Date(expiresAt).toISOString(), revocationEpoch: 0 }, {
    privateKey: keyPair.privateKey,
    keyId: "root",
    now: issuedAt,
  });
}

function dependencies({ store = durableStore(), queue = {}, accountId: resolvedAccountId = accountId, deviceOwner = accountId, deviceUnavailableOnSecondRead = false, permissionUnavailableOnSecondRead = false, mutate } = {}) {
  const queueCalls = [];
  const queueImpl = queue.enqueue || (async (...args) => ({ created: true, command: { commandId: "6cc95d2f-b37c-4d99-a6d6-3c59eb9126fb", deviceId: args[1], envelope: args[3], state: "pending", attempts: 0, createdAt: now } }));
  const wrappedQueue = {
    async enqueue(...args) {
      queueCalls.push(args);
      if (queue.error) throw queue.error;
      const prior = wrappedQueue.byKey.get(args[2]);
      if (prior) return { ...prior, created: false };
      const result = await queueImpl(...args);
      wrappedQueue.byKey.set(args[2], result);
      return result;
    },
    byKey: new Map(),
  };
  let deviceReads = 0;
  let accountReads = 0;
  return {
    queueCalls,
    run: (requestBody) => enqueueAuthorizedDeviceCommand({
      authenticatedAccountId: accountId,
      body: requestBody,
      loadAccount: async (_userId) => {
        await Promise.resolve();
        accountReads += 1;
        mutate?.();
        return { userId: resolvedAccountId, profile: { plan: "pro", entitlements: [] }, permissions: [{ permission: action, scope: "account", status: permissionUnavailableOnSecondRead && accountReads > 1 ? "revoked" : "granted" }] };
      },
      loadDevice: async (_userId, id) => {
        await Promise.resolve();
        deviceReads += 1;
        return { id, user_id: deviceOwner, status: deviceUnavailableOnSecondRead && deviceReads > 1 ? "revoked" : "online", capabilities: [action] };
      },
      mandateStore: store,
      trustedKeys: { root: globalThis.testPublicKey },
      queue: wrappedQueue,
      now,
    }),
  };
}

test("request normalization snapshots data before awaits and rejects accessors/account overrides", async () => {
  const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const mandate = await signedMandate(keyPair);
  const source = body(mandate);
  const normalized = normalizeDeviceCommandRequest(source);
  source.envelope.input.url = "https://attacker.invalid";
  assert.equal(normalized.envelope.input.url, resource);
  assert.equal(normalizeDeviceCommandRequest({ ...body(mandate), accountId }), null);
  let getterCalls = 0;
  const hostile = body(mandate);
  Object.defineProperty(hostile.envelope, "action", { enumerable: true, get() { getterCalls += 1; return action; } });
  assert.equal(normalizeDeviceCommandRequest(hostile), null);
  assert.equal(getterCalls, 0);
});

test("principal and device owner/capability mismatches never enqueue", async () => {
  const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  globalThis.testPublicKey = keyPair.publicKey;
  const mandate = await signedMandate(keyPair);

  const otherAccount = dependencies({ accountId: "10e7b9e4-765b-4e88-b5d4-5eafc0f39f40" });
  assert.equal((await otherAccount.run(body(mandate))).enqueued, false);
  assert.equal(otherAccount.queueCalls.length, 0);

  const otherOwner = dependencies({ deviceOwner: "10e7b9e4-765b-4e88-b5d4-5eafc0f39f40" });
  assert.equal((await otherOwner.run(body(mandate))).enqueued, false);
  assert.equal(otherOwner.queueCalls.length, 0);

  const unsupported = dependencies();
  unsupported.run = (requestBody) => enqueueAuthorizedDeviceCommand({
    authenticatedAccountId: accountId,
    body: requestBody,
    loadAccount: async () => ({ userId: accountId, profile: { plan: "pro", entitlements: [] }, permissions: [{ permission: action, scope: "account", status: "granted" }] }),
    loadDevice: async () => ({ id: deviceId, user_id: accountId, status: "online", capabilities: ["device.control"] }),
    mandateStore: durableStore(), trustedKeys: { root: keyPair.publicKey }, queue: { async enqueue() { assert.fail("unauthorized enqueue"); } }, now,
  });
  assert.equal((await unsupported.run(body(mandate))).enqueued, false);
});

test("stale, revoked, malformed, and replayed mandates deny before queue enqueue", async () => {
  const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  globalThis.testPublicKey = keyPair.publicKey;
  const mandate = await signedMandate(keyPair);

  const stale = dependencies({ store: durableStore({ epoch: 1 }) });
  assert.equal((await stale.run(body(mandate))).enqueued, false);
  assert.equal(stale.queueCalls.length, 0);

  const revoked = dependencies({ store: durableStore({ revoked: true }) });
  assert.equal((await revoked.run(body(mandate))).enqueued, false);
  assert.equal(revoked.queueCalls.length, 0);

  const malformed = dependencies();
  assert.equal((await malformed.run(body({ payload: {}, signature: { algorithm: "Ed25519", keyId: "root", value: "bad" } }))).enqueued, false);
  assert.equal(malformed.queueCalls.length, 0);

  const replayed = dependencies();
  assert.equal((await replayed.run(body(mandate))).enqueued, true);
  assert.equal((await replayed.run(body(mandate))).enqueued, false);
  assert.equal(replayed.queueCalls.length, 1, "mandate replay must not invoke the queue a second time");
});

test("inputs stay bound across awaits, device revocation is rechecked, duplicate keys are idempotent, and queue errors are sanitized", async () => {
  const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  globalThis.testPublicKey = keyPair.publicKey;
  const mandate = await signedMandate(keyPair);
  const mutable = body(mandate);
  const changed = dependencies({ mutate() { mutable.deviceId = "10e7b9e4-765b-4e88-b5d4-5eafc0f39f40"; mutable.envelope.input.url = "https://attacker.invalid"; } });
  const first = await changed.run(mutable);
  assert.equal(first.enqueued, true);
  assert.equal(changed.queueCalls[0][1], deviceId);
  assert.equal(changed.queueCalls[0][3].input.url, resource);

  const raceStore = durableStore();
  const revokedDuringAwait = dependencies({ store: raceStore, deviceUnavailableOnSecondRead: true });
  assert.equal((await revokedDuringAwait.run(body(await signedMandate(keyPair)))).enqueued, false);
  assert.equal(revokedDuringAwait.queueCalls.length, 0);

  const permissionRevoked = dependencies({ permissionUnavailableOnSecondRead: true });
  assert.equal((await permissionRevoked.run(body(await signedMandate(keyPair)))).enqueued, false);
  assert.equal(permissionRevoked.queueCalls.length, 0);

  const duplicate = dependencies({ queue: { async enqueue(...args) { return { created: true, command: { commandId: "6cc95d2f-b37c-4d99-a6d6-3c59eb9126fb", deviceId: args[1], envelope: args[3], state: "pending", attempts: 0, createdAt: now } }; } } });
  const firstMandate = await signedMandate(keyPair);
  const secondMandate = await signedMandate(keyPair);
  assert.equal((await duplicate.run(body(firstMandate))).created, true);
  const duplicateResult = await duplicate.run(body(secondMandate));
  assert.equal(duplicateResult.created, false);
  assert.equal(duplicate.queueCalls.length, 2);

  const failing = dependencies({ queue: { error: new Error("private envelope and service-role diagnostic") } });
  const failure = await failing.run(body(await signedMandate(keyPair)));
  assert.equal(failure.enqueued, false);
  assert.equal(failure.reason, "Device command authorization or queue service is unavailable.");
  assert.equal(JSON.stringify(failure).includes("private envelope"), false);
});
