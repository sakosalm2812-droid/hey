import assert from "node:assert/strict";
import test from "node:test";

import { getAccountStorageKey, setAccountScope } from "../src/core/accountScope.js";

const values = new Map();
globalThis.localStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(String(key), String(value)); },
  removeItem(key) { values.delete(String(key)); },
};

const originalSetInterval = globalThis.setInterval;
globalThis.setInterval = () => 0;
const { offlineEngine } = await import("../src/core/offlineEngine.js");
globalThis.setInterval = originalSetInterval;

function scopedOutbox(scope) {
  const snapshot = JSON.parse(values.get(getAccountStorageKey("hey_offline", `account:${scope}`)) || "{}");
  return snapshot.outbox || [];
}

test("non-2xx responses remain queued with persisted backoff and recover on a later 2xx", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = 50_000;
  let fetchCount = 0;
  let sentEvents = 0;
  Date.now = () => now;
  try {
    setAccountScope("outbox-http-retry");
    globalThis.fetch = async () => {
      fetchCount += 1;
      return fetchCount === 1 ? { ok: false, status: 503 } : { ok: true, status: 200 };
    };
    const unsubscribe = offlineEngine.subscribe((event) => {
      if (event === "outbox_sent") sentEvents += 1;
    });
    const item = offlineEngine.addToOutbox({ type: "sync", payload: { task: 1 }, destination: "/sync", requiresConsent: false });

    const failed = await offlineEngine.sendOutboxItem(item);
    assert.deepEqual(failed, { error: "http_503", retryAt: 51_000 });
    assert.equal(item.attempts, 1);
    assert.equal(item.deliveryState, "retry_wait");
    assert.equal(scopedOutbox("outbox-http-retry")[0].lastError, "http_503");
    assert.deepEqual(await offlineEngine.sendOutboxItem(item), { error: "retry_scheduled", retryAt: 51_000 });
    assert.equal(fetchCount, 1);
    assert.equal(sentEvents, 0);

    now = 51_000;
    assert.deepEqual(await offlineEngine.sendOutboxItem(item), { success: true });
    assert.deepEqual(offlineEngine.getOutbox(), []);
    assert.equal(sentEvents, 1);
    unsubscribe();

    setAccountScope("outbox-http-other");
    setAccountScope("outbox-http-retry");
    assert.deepEqual(offlineEngine.getOutbox(), []);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    setAccountScope(null);
  }
});

test("rejected fetches retry without exposing exception text; permanent HTTP errors block until explicit retry", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = 80_000;
  let fetchCount = 0;
  Date.now = () => now;
  try {
    setAccountScope("outbox-network-retry");
    globalThis.fetch = async () => {
      fetchCount += 1;
      if (fetchCount === 1) throw new Error("private endpoint token");
      if (fetchCount === 2) return { ok: false, status: 400 };
      return { ok: true, status: 204 };
    };
    const item = offlineEngine.addToOutbox({ type: "sync", payload: { task: 2 }, destination: "/sync", requiresConsent: false });

    assert.deepEqual(await offlineEngine.sendOutboxItem(item), { error: "network_error", retryAt: 81_000 });
    assert.equal(item.lastError, "network_error");
    assert.equal(JSON.stringify(item).includes("private endpoint token"), false);
    now = 81_000;
    assert.deepEqual(await offlineEngine.sendOutboxItem(item), { error: "http_400", blocked: true });
    assert.equal(item.deliveryState, "blocked");
    assert.equal(item.nextAttemptAt, null);
    assert.deepEqual(await offlineEngine.sendOutboxItem(item), { error: "delivery_blocked" });
    assert.equal(fetchCount, 2);

    const retried = offlineEngine.retryOutboxItem(item.id);
    assert.equal(retried.success, true);
    assert.equal(item.deliveryState, "pending");
    assert.equal(item.attempts, 0);
    assert.deepEqual(await offlineEngine.sendOutboxItem(item), { success: true });
    assert.deepEqual(offlineEngine.getOutbox(), []);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    setAccountScope(null);
  }
});

test("repeated transient failures keep the item queued and cap deterministic backoff", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = 120_000;
  let fetchCount = 0;
  Date.now = () => now;
  try {
    setAccountScope("outbox-repeated-retry");
    globalThis.fetch = async () => {
      fetchCount += 1;
      return fetchCount <= 10 ? { ok: false, status: 503 } : { ok: true, status: 200 };
    };
    const item = offlineEngine.addToOutbox({ type: "sync", payload: { task: 4 }, destination: "/sync", requiresConsent: false });

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const delay = Math.min(1000 * (2 ** Math.min(attempt - 1, 9)), 5 * 60 * 1000);
      const result = await offlineEngine.sendOutboxItem(item);
      assert.deepEqual(result, { error: "http_503", retryAt: now + delay });
      now += delay;
      assert.equal(offlineEngine.getOutbox().includes(item), true);
      assert.equal(item.attempts, attempt);
    }

    assert.equal(item.nextAttemptAt, now);
    now = item.nextAttemptAt;
    assert.deepEqual(await offlineEngine.sendOutboxItem(item), { success: true });
    assert.deepEqual(offlineEngine.getOutbox(), []);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    setAccountScope(null);
  }
});

test("duplicate sends and replay after acknowledged persistence dispatch only once", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  let finishFetch;
  try {
    setAccountScope("outbox-duplicate");
    globalThis.fetch = () => {
      fetchCount += 1;
      return new Promise((resolve) => { finishFetch = resolve; });
    };
    const item = offlineEngine.addToOutbox({ type: "sync", payload: { task: 3 }, destination: "/sync", requiresConsent: false });
    const first = offlineEngine.sendOutboxItem(item);
    assert.deepEqual(await offlineEngine.sendOutboxItem(item), { error: "already_sending" });
    assert.equal(fetchCount, 1);

    finishFetch({ ok: true, status: 202 });
    assert.deepEqual(await first, { success: true });
    assert.deepEqual(await offlineEngine.sendOutboxItem(item), { error: "item_not_queued" });
    assert.equal(fetchCount, 1);

    setAccountScope("outbox-duplicate-other");
    setAccountScope("outbox-duplicate");
    assert.deepEqual(offlineEngine.getOutbox(), []);
    assert.deepEqual(scopedOutbox("outbox-duplicate"), []);
  } finally {
    globalThis.fetch = originalFetch;
    setAccountScope(null);
  }
});

test("a late successful response after account switch cannot remove either account's queued work", async () => {
  const originalFetch = globalThis.fetch;
  let finishFetch;
  try {
    setAccountScope("outbox-switch-a");
    globalThis.fetch = () => new Promise((resolve) => { finishFetch = resolve; });
    const itemA = offlineEngine.addToOutbox({ type: "sync", payload: { account: "a" }, destination: "/a", requiresConsent: false });
    const pending = offlineEngine.sendOutboxItem(itemA);
    await Promise.resolve();

    setAccountScope("outbox-switch-b");
    const itemB = offlineEngine.addToOutbox({ type: "sync", payload: { account: "b" }, destination: "/b" });
    finishFetch({ ok: true, status: 200 });
    assert.deepEqual(await pending, { error: "account_changed" });
    assert.deepEqual(offlineEngine.getOutbox().map((entry) => entry.id), [itemB.id]);

    setAccountScope("outbox-switch-a");
    assert.deepEqual(offlineEngine.getOutbox().map((entry) => entry.id), [itemA.id]);
    assert.equal(itemA.attempts, 0);
    setAccountScope("outbox-switch-b");
    assert.deepEqual(offlineEngine.getOutbox().map((entry) => entry.id), [itemB.id]);
  } finally {
    globalThis.fetch = originalFetch;
    setAccountScope(null);
  }
});
