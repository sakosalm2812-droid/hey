import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { InMemoryEventOutboxStore, deliverOutboxEvent, publishEventOnce, replayPendingEvents } from "../src/core/eventOutbox.js";
import { clearEventListeners, publishOnce as publishOnceEvent, subscribe } from "../src/core/eventBus.js";

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
  const failure = await publishEventOnce("retry", "event", { value: 2 }, { store, dispatch: async () => { throw new Error("private email user@example.test"); }, scope: "account-a" });
  assert.equal(failure.state, "pending");
  assert.equal(failure.error, "delivery_failed");
  assert.equal(JSON.stringify(failure).includes("user@example.test"), false);
  assert.equal((await store.listPending()).find((event) => event.id === failed.event.id).lastError, "delivery_failed");
  const replay = await replayPendingEvents({ store, dispatch: async () => {} });
  assert.equal(replay.length, 1);
  assert.equal(replay[0].delivered, true);
  assert.deepEqual(await store.listPending(), []);
});

test("outbox replay forwards its validated page size to the store", async () => {
  const store = new InMemoryEventOutboxStore();
  const delivered = [];
  for (let index = 0; index < 3; index += 1) await store.appendOnce(`key-${index}`, "event", { index }, "account-a");
  const results = await replayPendingEvents({ store, limit: 1, dispatch: async (_name, payload) => delivered.push(payload.index) });
  assert.equal(results.length, 1);
  assert.deepEqual(delivered, [0]);
  await assert.rejects(() => store.listPending(1001), /Replay limit/);
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

test("a timed-out outbox worker aborts its dispatcher and leaves its lease fenced for expiry recovery", async () => {
  let now = 0;
  const store = new InMemoryEventOutboxStore({ now: () => now });
  const { event } = await store.appendOnce("timeout", "event", { safe: true }, "account-a");
  let finishDispatch;
  let dispatchSignal;
  let firstLeaseToken;
  const wrappedStore = {
    claim: async (...args) => {
      const claim = await store.claim(...args);
      firstLeaseToken = claim?.leaseToken;
      return claim;
    },
    acknowledge: (...args) => store.acknowledge(...args),
    release: (...args) => store.release(...args),
  };
  const timedOut = await deliverOutboxEvent(event.id, {
    store: wrappedStore,
    leaseMs: 100,
    timeoutMs: 10,
    dispatch: async (_name, _payload, metadata) => {
      dispatchSignal = metadata.signal;
      await new Promise((resolve) => { finishDispatch = resolve; });
    },
  });
  assert.deepEqual(timedOut, { delivered: false, state: "pending", eventId: event.id, error: "delivery_timeout" });
  assert.equal(dispatchSignal.aborted, true);
  assert.equal(await store.claim(event.id, 100), null, "timed-out work retains its lease until expiry");

  now = 101;
  const recovered = await store.claim(event.id, 100);
  assert.ok(recovered);
  assert.notEqual(recovered.leaseToken, firstLeaseToken);
  finishDispatch();
  await Promise.resolve();
  assert.equal(await store.acknowledge(event.id, firstLeaseToken), false, "stale worker cannot acknowledge the recovered lease");
  assert.equal(await store.acknowledge(event.id, recovered.leaseToken), true);
});

test("caller cancellation aborts outbox dispatch and replay recovers after lease expiry", async () => {
  let now = 0;
  const store = new InMemoryEventOutboxStore({ now: () => now });
  const { event } = await store.appendOnce("cancel", "event", { safe: true }, "account-a");
  const caller = new AbortController();
  let finishDispatch;
  let dispatchSignal;
  const running = deliverOutboxEvent(event.id, {
    store,
    leaseMs: 100,
    timeoutMs: 50,
    signal: caller.signal,
    dispatch: async (_name, _payload, metadata) => {
      dispatchSignal = metadata.signal;
      await new Promise((resolve) => { finishDispatch = resolve; });
    },
  });
  await Promise.resolve();
  await Promise.resolve();
  caller.abort();
  assert.deepEqual(await running, { delivered: false, state: "pending", eventId: event.id, error: "delivery_cancelled" });
  assert.equal(dispatchSignal.aborted, true);
  assert.equal(await store.claim(event.id, 100), null, "cancellation does not release a possibly active side effect early");

  now = 101;
  finishDispatch();
  const replay = await replayPendingEvents({ store, dispatch: async () => {} });
  assert.equal(replay.length, 1);
  assert.equal(replay[0].delivered, true);
});

test("outbox dispatch timeout must be bounded below the lease and pre-aborted workers do not claim", async () => {
  const store = new InMemoryEventOutboxStore();
  const { event } = await store.appendOnce("bounds", "event", {}, "account-a");
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(await deliverOutboxEvent(event.id, { store, dispatch: async () => assert.fail("pre-cancelled dispatch must not run"), signal: controller.signal }), {
    delivered: false, state: "cancelled", eventId: event.id,
  });
  assert.equal((await store.claim(event.id, 1000))?.event.id, event.id, "pre-cancellation leaves the event unclaimed");
  await assert.rejects(deliverOutboxEvent(event.id, { store, leaseMs: 10, timeoutMs: 10, dispatch: async () => {} }), /shorter than its lease/);
});

test("a pre-cancelled publish-once call does not enqueue an event for later replay", async () => {
  const durableStore = new InMemoryEventOutboxStore();
  let appendCalls = 0;
  const store = {
    appendOnce: (...args) => { appendCalls += 1; return durableStore.appendOnce(...args); },
    claim: (...args) => durableStore.claim(...args),
    listPending: (...args) => durableStore.listPending(...args),
    acknowledge: (...args) => durableStore.acknowledge(...args),
    release: (...args) => durableStore.release(...args),
  };
  const caller = new AbortController();
  caller.abort();
  let sideEffects = 0;

  const result = await publishOnceEvent("cancelled.before.enqueue", { secret: "must-not-replay" }, {
    idempotencyKey: "cancel-before-enqueue",
    scope: "account-a",
    store,
    signal: caller.signal,
  });

  assert.deepEqual(result, {
    delivered: false,
    state: "cancelled",
    error: "enqueue_cancelled",
    enqueued: false,
    created: false,
    duplicate: false,
    eventId: null,
  });
  assert.equal(appendCalls, 0);
  assert.deepEqual(await durableStore.listPending(), []);
  assert.deepEqual(await replayPendingEvents({ store: durableStore, dispatch: async () => { sideEffects += 1; } }), []);
  assert.equal(sideEffects, 0);
});

test("a hostile cancellation signal fails closed before the outbox append", async () => {
  const durableStore = new InMemoryEventOutboxStore();
  let appendCalls = 0;
  const store = {
    appendOnce: (...args) => { appendCalls += 1; return durableStore.appendOnce(...args); },
    listPending: (...args) => durableStore.listPending(...args),
  };
  const signal = Object.defineProperty({}, "aborted", { get() { throw new Error("hostile signal getter"); } });

  await assert.rejects(
    publishEventOnce("hostile-signal", "event", {}, { store, dispatch: async () => {}, scope: "account-a", signal }),
    /hostile signal getter/,
  );
  assert.equal(appendCalls, 0);
  assert.deepEqual(await durableStore.listPending(), []);
});

test("cancellation after durable append stops immediate dispatch but preserves the event for replay", async () => {
  const durableStore = new InMemoryEventOutboxStore();
  let finishAppend;
  let markAppendStarted;
  const appendStarted = new Promise((resolve) => { markAppendStarted = resolve; });
  const appendGate = new Promise((resolve) => { finishAppend = resolve; });
  const store = {
    appendOnce: async (...args) => {
      const appended = await durableStore.appendOnce(...args);
      markAppendStarted();
      await appendGate;
      return appended;
    },
    claim: (...args) => durableStore.claim(...args),
    listPending: (...args) => durableStore.listPending(...args),
    acknowledge: (...args) => durableStore.acknowledge(...args),
    release: (...args) => durableStore.release(...args),
  };
  const caller = new AbortController();
  let immediateSideEffects = 0;
  const publishing = publishEventOnce("cancel-during-enqueue", "event", { value: 1 }, {
    store,
    dispatch: async () => { immediateSideEffects += 1; },
    scope: "account-a",
    signal: caller.signal,
  });

  await appendStarted;
  caller.abort();
  finishAppend();
  const result = await publishing;

  assert.equal(result.state, "cancelled");
  assert.equal(result.enqueued, true, "the append had committed before cancellation was observed");
  assert.equal(result.created, true);
  assert.equal(result.error, undefined);
  assert.equal(immediateSideEffects, 0, "cancelled caller does not start immediate delivery");
  assert.equal((await durableStore.listPending()).length, 1);

  let replaySideEffects = 0;
  const replay = await replayPendingEvents({ store: durableStore, dispatch: async () => { replaySideEffects += 1; } });
  assert.equal(replay.length, 1);
  assert.equal(replay[0].delivered, true);
  assert.equal(replaySideEffects, 1, "durable enqueue remains eligible for the normal replay guarantee");
});

test("event bus forwards worker cancellation through its public publish-once API", async () => {
  const store = new InMemoryEventOutboxStore();
  const controller = new AbortController();
  let dispatchSignal;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const unsubscribe = subscribe("cancelled.event", async (_payload, metadata) => {
    dispatchSignal = metadata.signal;
    markStarted();
    await new Promise(() => {});
  });
  try {
    const running = publishOnceEvent("cancelled.event", {}, {
      idempotencyKey: "cancel-event",
      scope: "account-a",
      store,
      leaseMs: 100,
      timeoutMs: 50,
      signal: controller.signal,
    });
    await started;
    controller.abort();
    assert.equal((await running).error, "delivery_cancelled");
    assert.equal(dispatchSignal.aborted, true);
  } finally {
    unsubscribe();
    clearEventListeners("cancelled.event");
  }
});
