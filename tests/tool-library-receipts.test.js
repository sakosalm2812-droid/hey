import assert from "node:assert/strict";
import test from "node:test";
import {
  formatToolLibraryReceipt,
  isToolLibraryRecordVisible,
  scopeToolLibraryRecord,
} from "../src/lib/toolLibraryReceipts.js";

test("receipt display handles hostile, cyclic, and sensitive output without invoking getters", () => {
  let getterCalls = 0;
  const result = { message: "done", api_token: "should-not-render" };
  Object.defineProperty(result, "hostile", {
    enumerable: true,
    get() { getterCalls += 1; throw new Error("getter ran"); },
  });
  result.self = result;

  const display = formatToolLibraryReceipt(result);
  assert.equal(getterCalls, 0);
  assert.match(display, /\[redacted\]/);
  assert.match(display, /\[unavailable\]/);
  assert.match(display, /\[repeated reference\]/);
  assert.doesNotMatch(display, /should-not-render|getter ran/);
});

test("receipt display caps large text", () => {
  const display = formatToolLibraryReceipt({ text: "x".repeat(8_000) });
  assert.ok(display.length <= 4_000);
  assert.match(display, /truncated/);
});

test("receipt retry and activity records are visible only in their originating account scope", () => {
  const record = scopeToolLibraryRecord("account-a", {
    status: "error",
    retryable: true,
    retryRun: { input: { destination: "private" }, requestId: "request-a" },
    result: { privateResult: true },
  });
  const activity = scopeToolLibraryRecord("account-a", { items: [{ status: "completed" }] });

  assert.equal(isToolLibraryRecordVisible(record, "account-a", "account:account-a"), true);
  assert.equal(isToolLibraryRecordVisible(activity, "account-a", "account:account-a"), true);
  assert.equal(isToolLibraryRecordVisible(record, "account-b", "account:account-b"), false);
  assert.equal(isToolLibraryRecordVisible(activity, "account-b", "account:account-b"), false);
  assert.equal(isToolLibraryRecordVisible(record, null, "anonymous"), false);
  assert.equal(isToolLibraryRecordVisible(activity, null, "anonymous"), false);
  assert.equal(isToolLibraryRecordVisible(record, "account-a", "anonymous"), false);
});
