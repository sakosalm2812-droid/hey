import assert from "node:assert/strict";
import test from "node:test";

import { publish } from "../src/core/eventBus.js";
import { bootLogger, getLog, log } from "../src/core/heyLogger.js";
import { getAccountStorageKey, setAccountScope } from "../src/core/accountScope.js";
import { getNotifications, notify } from "../src/core/notificationCenter.js";

test("local activity history is isolated between signed-in accounts", () => {
  const originalStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
  };

  try {
    setAccountScope("account-a");
    log("note", "A private note");
    assert.equal(getLog().length, 1);

    setAccountScope("account-b");
    assert.deepEqual(getLog(), []);
    log("note", "Another account's note");

    setAccountScope("account-a");
    assert.deepEqual(getLog().map((entry) => entry.message), ["A private note"]);
    assert.equal(values.has("hey_log"), false);
  } finally {
    setAccountScope(null);
    globalThis.localStorage = originalStorage;
  }
});

test("boot diagnostics omit prompt content and retain the account scope at event time", async () => {
  const originalStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
  };

  const stop = bootLogger();
  try {
    setAccountScope("account-a");
    publish("execution.request.started", {
      requestId: "request-1",
      prompt: "sensitive user prompt",
      transcript: "private transcript",
      status: "started",
    });
    setAccountScope("account-b");
    await new Promise((resolve) => setTimeout(resolve, 1550));

    setAccountScope("account-a");
    const [entry] = getLog();
    assert.equal(entry.data.requestId, "request-1");
    assert.equal(entry.data.status, "started");
    assert.equal(JSON.stringify(entry).includes("sensitive user prompt"), false);
    assert.equal(JSON.stringify(entry).includes("private transcript"), false);

    setAccountScope("account-b");
    assert.deepEqual(getLog(), []);
  } finally {
    stop();
    setAccountScope(null);
    globalThis.localStorage = originalStorage;
  }
});

test("notifications and mode workspaces use distinct account storage keys", () => {
  const originalStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.has(String(key)) ? values.get(String(key)) : null,
    setItem: (key, value) => values.set(String(key), String(value)),
  };

  try {
    setAccountScope("account-a");
    const modeKeyA = getAccountStorageKey("hey_mode_workspace_plan");
    notify({ id: "reminder-a", title: "Private reminder A", body: "A only", suppressQuiet: true });
    assert.equal(getNotifications()[0].title, "Private reminder A");

    setAccountScope("account-b");
    const modeKeyB = getAccountStorageKey("hey_mode_workspace_plan");
    assert.notEqual(modeKeyA, modeKeyB);
    assert.deepEqual(getNotifications(), []);
    notify({ id: "reminder-b", title: "Private reminder B", body: "B only", suppressQuiet: true });

    setAccountScope("account-a");
    assert.equal(getNotifications()[0].title, "Private reminder A");
    setAccountScope("account-b");
    assert.equal(getNotifications()[0].title, "Private reminder B");
  } finally {
    setAccountScope(null);
    globalThis.localStorage = originalStorage;
  }
});
