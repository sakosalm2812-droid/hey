import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { InMemoryEventOutboxStore, publishEventOnce, replayPendingEvents } from "../src/core/eventOutbox.js";

globalThis.crypto ??= webcrypto;

test("outbox keys prevent duplicate event delivery and reject payload conflicts", async () => {
  const store = new InMemoryEventOutboxStore();
  const deliveries = [];
  const dispatch = async (name, payload, metadata) => deliveries.push({ name, payload, metadata });
  const first = await publishEventOnce("run:42:step:1", "mission.step", { step: 1 }, { store, dispatch, scope: "account-a" });
  const duplicate = await publishEventOnce("run:42:step:1", "mission.step", { step: 1 }, { store, dispatch, scope: "account-a" });
  assert.equal(first.delivered, true);
  assert.equal(first.created, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.state, "not_claimed");
  assert.equal(deliveries.length, 1);
  await assert.rejects(() => publishEventOnce("run:42:step:1", "mission.step", { step: 2 }, { store, dispatch, scope: "account-a" }), /different event payload/);
  const accountScoped = await publishEventOnce("run:42:step:1", "mission.step", { step: 1 }, { store, dispatch, scope: "account-b" });
  assert.equal(accountScoped.created, true);
  const snapshot = await store.appendOnce("immutable", "mission.step", { step: 3 }, "account-a");
  snapshot.event.payload.step = 99;
  const unchanged = await store.appendOnce("immutable", "mission.step", { step: 3 }, "account-a");
  assert.equal(unchanged.event.payload.step, 3);
});

test("outbox retains failed deliveries, replays them, and fences concurrent claims", async () => {
  const store = new InMemoryEventOutboxStore();
  let releaseNow;
  const pending = new Promise((resolve) => { releaseNow = resolve; });
  let calls = 0;
  const blockedDispatch = async () => { calls += 1; await pending; };
  const first = await store.appendOnce("key", "event", { value: 1 }, "account-a");
  const running = publishEventOnce("key", "event", { value: 1 }, { store, dispatch: blockedDispatch, scope: "account-a" });
  await Promise.resolve();
  const secondClaim = await store.claim(first.event.id);
  assert.equal(secondClaim, null);
  releaseNow();
  assert.equal((await running).delivered, true);
  assert.equal(calls, 1);

  const failed = await store.appendOnce("retry", "event", { value: 2 }, "account-a");
  const failure = await publishEventOnce("retry", "event", { value: 2 }, { store, dispatch: async () => { throw new Error("temporary"); }, scope: "account-a" });
  assert.equal(failure.state, "pending");
  assert.match((await store.listPending()).find((event) => event.id === failed.event.id).lastError, /temporary/);
  const replay = await replayPendingEvents({ store, dispatch: async () => {} });
  assert.equal(replay.length, 1);
  assert.equal(replay[0].delivered, true);
  assert.deepEqual(await store.listPending(), []);
});

test("outbox rejects malformed JSON payloads and stale lease tokens", async () => {
  const store = new InMemoryEventOutboxStore();
  const cycle = {}; cycle.self = cycle;
  await assert.rejects(() => store.appendOnce("bad", "event", cycle, "account-a"), /cycles/);
  await assert.rejects(() => store.appendOnce("missing-scope", "event", { ok: true }), /scope/);
  const { event } = await store.appendOnce("valid", "event", { ok: true }, "account-a");
  const claim = await store.claim(event.id, 1000);
  assert.equal(await store.acknowledge(event.id, "wrong-token"), false);
  assert.equal(await store.acknowledge(event.id, claim.leaseToken), true);
});
