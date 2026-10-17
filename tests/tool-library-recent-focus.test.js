import assert from "node:assert/strict";
import test from "node:test";
import { scheduleRecentToolCardFocus } from "../src/lib/toolLibraryRecentFocus.js";

function fixture(overrides = {}) {
  let frameCallback;
  let activeScope = "account:account-a";
  let currentRequest = true;
  const calls = [];
  const card = {
    isConnected: true,
    scrollIntoView(options) { calls.push(["scroll", options]); },
    focus(options) { calls.push(["card_focus", options]); },
  };
  const recentAction = {
    isConnected: true,
    focus() { calls.push(["recent_focus"]); },
  };
  const options = {
    name: "computer.open_url",
    accountId: "account-a",
    requestId: 7,
    getActiveScope: () => activeScope,
    isCurrentRequest: (requestId) => currentRequest && requestId === 7,
    isCatalogCurrent: () => true,
    findCard: () => card,
    findRecentAction: () => recentAction,
    requestFrame(callback) { frameCallback = callback; return 13; },
    cancelFrame(id) { calls.push(["cancel", id]); },
    ...overrides,
  };
  return {
    options,
    calls,
    card,
    setScope(value) { activeScope = value; },
    setCurrentRequest(value) { currentRequest = value; },
    flush() { frameCallback?.(); },
  };
}

test("recent tool focus scrolls to and focuses the exact catalog card without dispatching it", () => {
  const state = fixture();
  const result = scheduleRecentToolCardFocus(state.options);
  assert.equal(result.status, "scheduled");
  assert.deepEqual(state.calls, []);
  state.flush();
  assert.deepEqual(state.calls, [
    ["scroll", { block: "center", behavior: "smooth" }],
    ["card_focus", { preventScroll: true }],
  ]);
  assert.equal(result.task.focused, true);
});

test("stale catalog rows and disappeared cards restore focus to the recent action", () => {
  const stale = fixture({ isCatalogCurrent: (() => { let checks = 0; return () => ++checks === 1; })() });
  scheduleRecentToolCardFocus(stale.options);
  stale.flush();
  assert.deepEqual(stale.calls, [["recent_focus"]]);

  const disappeared = fixture({ findCard: () => null });
  scheduleRecentToolCardFocus(disappeared.options);
  disappeared.flush();
  assert.deepEqual(disappeared.calls, [["recent_focus"]]);
});

test("account changes and superseded requests never focus a stale card or old-account action", () => {
  const accountChanged = fixture();
  scheduleRecentToolCardFocus(accountChanged.options);
  accountChanged.setScope("account:account-b");
  accountChanged.flush();
  assert.deepEqual(accountChanged.calls, []);

  const superseded = fixture();
  scheduleRecentToolCardFocus(superseded.options);
  superseded.setCurrentRequest(false);
  superseded.flush();
  assert.deepEqual(superseded.calls, []);
});

test("cancellation or reset cancels the pending frame and makes late callbacks inert", () => {
  const state = fixture();
  const result = scheduleRecentToolCardFocus(state.options);
  result.task.cancel();
  state.flush();
  assert.deepEqual(state.calls, [["cancel", 13]]);
  assert.equal(result.task.focused, false);
});

test("invalid account scope never schedules focus", () => {
  const state = fixture({ getActiveScope: () => "anonymous" });
  const result = scheduleRecentToolCardFocus(state.options);
  assert.equal(result.status, "stale");
  state.flush();
  assert.deepEqual(state.calls, []);
});
