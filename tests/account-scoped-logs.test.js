import assert from "node:assert/strict";
import test from "node:test";

import { publish } from "../src/core/eventBus.js";
import { bootLogger, getLog, log, setLogScope } from "../src/core/heyLogger.js";

test("local activity history is isolated between signed-in accounts", () => {
  const originalStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
  };

  try {
    setLogScope("account-a");
    log("note", "A private note");
    assert.equal(getLog().length, 1);

    setLogScope("account-b");
    assert.deepEqual(getLog(), []);
    log("note", "Another account's note");

    setLogScope("account-a");
    assert.deepEqual(getLog().map((entry) => entry.message), ["A private note"]);
    assert.equal(values.has("hey_log"), false);
  } finally {
    setLogScope(null);
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
    setLogScope("account-a");
    publish("execution.request.started", {
      requestId: "request-1",
      prompt: "sensitive user prompt",
      transcript: "private transcript",
      status: "started",
    });
    setLogScope("account-b");
    await new Promise((resolve) => setTimeout(resolve, 1550));

    setLogScope("account-a");
    const [entry] = getLog();
    assert.equal(entry.data.requestId, "request-1");
    assert.equal(entry.data.status, "started");
    assert.equal(JSON.stringify(entry).includes("sensitive user prompt"), false);
    assert.equal(JSON.stringify(entry).includes("private transcript"), false);

    setLogScope("account-b");
    assert.deepEqual(getLog(), []);
  } finally {
    stop();
    setLogScope(null);
    globalThis.localStorage = originalStorage;
  }
});
