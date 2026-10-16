import assert from "node:assert/strict";
import test from "node:test";

import { setAccountScope } from "../src/core/accountScope.js";

globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
const originalSetInterval = globalThis.setInterval;
globalThis.setInterval = () => 0;
const { resolveSyncConflict } = await import("../src/core/offlineEngine.js");
globalThis.setInterval = originalSetInterval;

const accountScope = "account:offline-test";
const base = { version: 4, sequence: 12, value: { title: "Draft", pinned: false, archived: false } };

function input(overrides = {}) {
  return {
    accountScope,
    base,
    local: { baseVersion: 4, version: 5, sequence: 13, value: { title: "Local title", pinned: false, archived: false } },
    remote: { baseVersion: 4, version: 6, sequence: 14, value: { title: "Draft", pinned: true, archived: false } },
    ...overrides,
  };
}

test("offline sync deterministically merges edits to separate fields", () => {
  setAccountScope("offline-test");
  try {
    const result = resolveSyncConflict(input());
    assert.deepEqual(result, {
      ok: true,
      accountScope,
      version: 7,
      sequence: 15,
      parentVersion: 6,
      value: { archived: false, pinned: true, title: "Local title" },
    });
  } finally {
    setAccountScope(null);
  }
});

test("offline sync reports same-field edits without exposing either value", () => {
  setAccountScope("offline-test");
  try {
    const conflict = input({
      remote: { baseVersion: 4, version: 6, sequence: 14, value: { title: "Remote secret", pinned: false, archived: false } },
    });
    const result = resolveSyncConflict(conflict);
    assert.deepEqual(result, { ok: false, code: "field_conflict", conflictFields: ["title"] });
    assert.equal(JSON.stringify(result).includes("Remote secret"), false);
    assert.equal(JSON.stringify(result).includes("Local title"), false);
  } finally {
    setAccountScope(null);
  }
});

test("account switch, stale revisions, and replayed sequences fail closed", () => {
  setAccountScope("other-account");
  try {
    assert.deepEqual(resolveSyncConflict(input()), { ok: false, code: "account_scope_mismatch" });
    setAccountScope("offline-test");
    assert.deepEqual(resolveSyncConflict(input({
      local: { ...input().local, baseVersion: 3 },
    })), { ok: false, code: "version_mismatch" });
    assert.deepEqual(resolveSyncConflict(input({
      remote: { ...input().remote, sequence: 12 },
    })), { ok: false, code: "sequence_mismatch" });
  } finally {
    setAccountScope(null);
  }
});

test("deletions merge with disjoint edits and identical edits collapse safely", () => {
  setAccountScope("offline-test");
  try {
    const mergedDelete = resolveSyncConflict(input({
      local: { baseVersion: 4, version: 5, sequence: 13, value: { title: "Draft", pinned: false } },
      remote: { baseVersion: 4, version: 6, sequence: 14, value: { title: "Draft", pinned: true, archived: false } },
    }));
    assert.equal(mergedDelete.ok, true);
    assert.deepEqual(mergedDelete.value, { pinned: true, title: "Draft" });

    const identical = input({
      remote: { baseVersion: 4, version: 6, sequence: 14, value: { title: "Local title", pinned: false, archived: false } },
    });
    assert.equal(resolveSyncConflict(identical).ok, true);
  } finally {
    setAccountScope(null);
  }
});

test("malformed and accessor-backed records return recoverable errors; later valid sync still works", () => {
  setAccountScope("offline-test");
  try {
    const accessorValue = {};
    Object.defineProperty(accessorValue, "title", { enumerable: true, get() { throw new Error("must not execute"); } });
    assert.deepEqual(resolveSyncConflict(input({ local: { ...input().local, value: accessorValue } })), { ok: false, code: "invalid_input" });

    const polluted = JSON.parse('{"__proto__":{"admin":true},"pinned":false}');
    assert.deepEqual(resolveSyncConflict(input({ local: { ...input().local, value: polluted } })), { ok: false, code: "invalid_input" });
    assert.equal({}.admin, undefined);
    assert.equal(resolveSyncConflict(input()).ok, true);
  } finally {
    setAccountScope(null);
  }
});
