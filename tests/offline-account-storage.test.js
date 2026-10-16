import assert from "node:assert/strict";
import test from "node:test";

import { getAccountStorageKey, setAccountScope } from "../src/core/accountScope.js";

const values = new Map([[
  "hey_offline",
  JSON.stringify({
    state: "available",
    resourceBudget: { cpu: 42, memory: 1536, storage: 4096, batteryFloor: 35 },
    outbox: [{ id: "legacy-item", payload: { anonymous: true } }],
  }),
]]);
let failWrites = false;
globalThis.localStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) {
    if (failWrites) throw new Error("storage full");
    values.set(String(key), String(value));
  },
  removeItem(key) { values.delete(String(key)); },
};

const originalSetInterval = globalThis.setInterval;
globalThis.setInterval = () => 0;
const { offlineEngine } = await import("../src/core/offlineEngine.js");
globalThis.setInterval = originalSetInterval;

test("legacy offline data migrates only into anonymous scoped storage and keeps device preferences", () => {
  try {
    assert.equal(offlineEngine.getState(), "available");
    assert.deepEqual(offlineEngine.getOutbox().map((item) => item.id), ["legacy-item"]);
    assert.equal(values.has("hey_offline"), false);

    const anonymousKey = getAccountStorageKey("hey_offline", "anonymous");
    const migrated = JSON.parse(values.get(anonymousKey));
    assert.equal(migrated.accountScope, "anonymous");
    assert.equal(migrated.storageVersion, 2);
    assert.equal(JSON.parse(values.get("hey_offline_device_v1")).resourceBudget.batteryFloor, 35);
  } finally {
    setAccountScope(null);
  }
});

test("runtime state and queued work reload per account without cross-account leakage", () => {
  try {
    setAccountScope("offline-a");
    offlineEngine.setState("available");
    const deviceBudget = { ...offlineEngine.getResourceBudget() };
    const itemA = offlineEngine.addToOutbox({ type: "sync", payload: { account: "a" }, destination: "/a" });
    offlineEngine.localRuntime.modelPacks.set("model-a", { id: "model-a", name: "A model" });
    offlineEngine.save();

    setAccountScope("offline-b");
    assert.equal(offlineEngine.getState(), "ready_local");
    assert.deepEqual(offlineEngine.getResourceBudget(), deviceBudget);
    assert.deepEqual(offlineEngine.getOutbox(), []);
    assert.deepEqual(offlineEngine.getModelPacks(), []);
    const itemB = offlineEngine.addToOutbox({ type: "sync", payload: { account: "b" }, destination: "/b" });

    setAccountScope("offline-a");
    assert.equal(offlineEngine.getState(), "available");
    assert.deepEqual(offlineEngine.getOutbox().map((item) => item.id), [itemA.id]);
    assert.deepEqual(offlineEngine.getModelPacks().map((pack) => pack.id), ["model-a"]);

    setAccountScope("offline-b");
    assert.deepEqual(offlineEngine.getOutbox().map((item) => item.id), [itemB.id]);
  } finally {
    setAccountScope(null);
  }
});

test("stale model downloads and outbox sends cannot mutate the newly active account", async () => {
  const originalFetch = globalThis.fetch;
  let rejectDownload;
  let finishSend;
  try {
    setAccountScope("offline-download-a");
    globalThis.fetch = () => new Promise((_resolve, reject) => { rejectDownload = reject; });
    const download = offlineEngine.installModelPack({ name: "A model", type: "llm", version: "1", downloadUrl: "/model" });
    await Promise.resolve();

    setAccountScope("offline-download-b");
    assert.deepEqual(offlineEngine.getModelPacks(), []);
    rejectDownload(new Error("late failure"));
    assert.deepEqual(await download, { error: "account_changed" });
    assert.deepEqual(offlineEngine.getModelPacks(), []);

    setAccountScope("offline-send-a");
    const itemA = offlineEngine.addToOutbox({ type: "sync", payload: { secret: "a" }, destination: "/send-a", requiresConsent: false });
    globalThis.fetch = () => new Promise((resolve) => { finishSend = resolve; });
    const send = offlineEngine.sendOutboxItem(itemA);
    await Promise.resolve();

    setAccountScope("offline-send-b");
    const itemB = offlineEngine.addToOutbox({ type: "sync", payload: { account: "b" }, destination: "/send-b" });
    finishSend({ ok: true });
    assert.deepEqual(await send, { error: "account_changed" });
    assert.deepEqual(offlineEngine.getOutbox().map((item) => item.id), [itemB.id]);
  } finally {
    globalThis.fetch = originalFetch;
    setAccountScope(null);
  }
});

test("account changes during hostile payload serialization stop before network dispatch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  try {
    setAccountScope("offline-serialize-a");
    const item = offlineEngine.addToOutbox({ type: "sync", payload: {}, destination: "/must-not-send", requiresConsent: false });
    item.payload = {
      toJSON() {
        setAccountScope("offline-serialize-b");
        return { account: "a" };
      },
    };
    globalThis.fetch = async () => { fetchCalled = true; return { ok: true }; };
    assert.deepEqual(await offlineEngine.sendOutboxItem(item), { error: "account_changed" });
    assert.equal(fetchCalled, false);
    assert.deepEqual(offlineEngine.getOutbox(), []);
  } finally {
    globalThis.fetch = originalFetch;
    setAccountScope(null);
  }
});

test("storage failures return safely and do not load one account into another", () => {
  const originalWarn = console.warn;
  try {
    setAccountScope("offline-storage-a");
    failWrites = true;
    console.warn = () => {};
    assert.deepEqual(offlineEngine.setState("available"), { success: true });
    failWrites = false;
    setAccountScope("offline-storage-b");
    assert.equal(offlineEngine.getState(), "ready_local");
    assert.deepEqual(offlineEngine.getOutbox(), []);
  } finally {
    console.warn = originalWarn;
    failWrites = false;
    setAccountScope(null);
  }
});

test("legacy data is not read while a signed-in account is active", () => {
  try {
    values.set("hey_offline", JSON.stringify({ state: "failed", outbox: [{ id: "must-not-load" }] }));
    setAccountScope("offline-no-legacy");
    assert.equal(offlineEngine.getState(), "ready_local");
    assert.deepEqual(offlineEngine.getOutbox(), []);
    assert.equal(values.has("hey_offline"), true);
  } finally {
    values.delete("hey_offline");
    setAccountScope(null);
  }
});
