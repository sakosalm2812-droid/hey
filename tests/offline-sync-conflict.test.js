import assert from "node:assert/strict";
import test from "node:test";

import { setAccountScope } from "../src/core/accountScope.js";

globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
const originalSetInterval = globalThis.setInterval;
globalThis.setInterval = () => 0;
const { resolveSyncConflict, resolveAndPersistSyncConflict } = await import("../src/core/offlineEngine.js");
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
      expected: {
        baseVersion: 4,
        baseSequence: 12,
        localVersion: 5,
        localSequence: 13,
        remoteVersion: 6,
        remoteSequence: 14,
      },
      value: { archived: false, pinned: true, title: "Local title" },
    });
  } finally {
    setAccountScope(null);
  }
});

test("the explicit persistence adapter receives a frozen merge and must return an exact commit receipt", async () => {
  setAccountScope("offline-test");
  try {
    let received;
    const result = await resolveAndPersistSyncConflict(input(), {
      recordKey: "space:lesson:42",
      persist: async (candidate, context) => {
        received = { candidate, context };
        return {
          committed: true,
          accountScope: context.accountScope,
          recordKey: context.recordKey,
          version: candidate.version,
          sequence: candidate.sequence,
          parentVersion: candidate.parentVersion,
        };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.persisted, true);
    assert.equal(received.context.accountScope, accountScope);
    assert.equal(received.context.recordKey, "space:lesson:42");
    assert.equal(received.context.expectedBaseVersion, 4);
    assert.equal(received.context.expectedRemoteVersion, 6);
    assert.equal(Object.isFrozen(received.candidate), true);
    assert.equal(Object.isFrozen(received.candidate.value), true);
    assert.deepEqual(received.candidate.value, { archived: false, pinned: true, title: "Local title" });
  } finally {
    setAccountScope(null);
  }
});

test("persistence is opt-in and conflicts never reach the adapter", async () => {
  setAccountScope("offline-test");
  try {
    assert.deepEqual(await resolveAndPersistSyncConflict(input()), { ok: false, code: "persistence_adapter_required" });
    let called = false;
    const conflicting = input({
      remote: { baseVersion: 4, version: 6, sequence: 14, value: { title: "Remote", pinned: false, archived: false } },
    });
    const result = await resolveAndPersistSyncConflict(conflicting, {
      recordKey: "doc-1",
      persist: async () => { called = true; return { committed: true }; },
    });
    assert.deepEqual(result, { ok: false, code: "field_conflict", conflictFields: ["title"] });
    assert.equal(called, false);

    const invalid = await resolveAndPersistSyncConflict(input({
      local: { ...input().local, value: [] },
    }), {
      recordKey: "doc-1",
      persist: async () => { called = true; return {}; },
    });
    assert.deepEqual(invalid, { ok: false, code: "invalid_input" });
    assert.equal(called, false);
  } finally {
    setAccountScope(null);
  }
});

test("persistence adapter rejects false receipts, contains failures, and fences account changes", async () => {
  setAccountScope("offline-test");
  try {
    let adapterGetterCalled = false;
    const accessorAdapter = { recordKey: "doc-1" };
    Object.defineProperty(accessorAdapter, "persist", {
      enumerable: true,
      get() { adapterGetterCalled = true; throw new Error("must not execute"); },
    });
    assert.deepEqual(await resolveAndPersistSyncConflict(input(), accessorAdapter), {
      ok: false,
      code: "persistence_adapter_required",
    });
    assert.equal(adapterGetterCalled, false);

    const rejected = await resolveAndPersistSyncConflict(input(), {
      recordKey: "doc-1",
      persist: async () => ({ committed: true, accountScope: "account:other" }),
    });
    assert.deepEqual(rejected, { ok: false, code: "persistence_not_confirmed" });

    let receiptGetterCalled = false;
    const accessorReceipt = {
      committed: true,
      accountScope,
      recordKey: "doc-1",
      version: 7,
      sequence: 15,
    };
    Object.defineProperty(accessorReceipt, "parentVersion", {
      enumerable: true,
      get() { receiptGetterCalled = true; throw new Error("must not execute"); },
    });
    const accessorRejected = await resolveAndPersistSyncConflict(input(), {
      recordKey: "doc-1",
      persist: async () => accessorReceipt,
    });
    assert.deepEqual(accessorRejected, { ok: false, code: "persistence_not_confirmed" });
    assert.equal(receiptGetterCalled, false);

    const failed = await resolveAndPersistSyncConflict(input(), {
      recordKey: "doc-1",
      persist: async () => { throw new Error("private backend detail"); },
    });
    assert.deepEqual(failed, { ok: false, code: "persistence_failed" });

    let release;
    const pending = resolveAndPersistSyncConflict(input(), {
      recordKey: "doc-1",
      persist: () => new Promise((resolve) => { release = resolve; }),
    });
    await Promise.resolve();
    setAccountScope("other-account");
    release({ committed: true, accountScope, recordKey: "doc-1", version: 7, sequence: 15, parentVersion: 6 });
    assert.deepEqual(await pending, { ok: false, code: "account_changed" });
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
