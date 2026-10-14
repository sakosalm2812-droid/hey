import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EVIDENCE_STORE_CONTRACT_VERSION, InMemoryEvidenceStore } from "../src/core/evidenceIntegrity.js";
import { SupabaseEvidenceStore } from "../src/core/supabaseEvidenceStore.js";

const accountId = "10e7b9e4-765b-4e88-b5d4-5eafc0f39f40";
const evidenceId = "7de4ab92-60a8-40a4-9a1a-f80bc3d5fb2f";

function fakeClient(responses = {}) {
  const calls = [];
  return {
    calls,
    client: {
      async rpc(name, args) {
        calls.push({ name, args });
        return responses[name] ?? { data: null, error: null };
      },
    },
  };
}

test("evidence invalidation is bound to the authenticated account in volatile tests", async () => {
  const store = new InMemoryEvidenceStore();
  await store.invalidate(evidenceId, "source_withdrawn", { accountId: "account-a" });
  assert.equal(await store.isInvalidated(evidenceId, { accountId: "account-a" }), true);
  assert.equal(await store.isInvalidated(evidenceId, { accountId: "account-b" }), false);
});

test("Supabase evidence adapter uses bounded account-scoped invalidation RPCs", async () => {
  const { client, calls } = fakeClient({
    is_hey_evidence_invalidated: { data: false, error: null },
    invalidate_hey_evidence: { data: true, error: null },
  });
  const store = new SupabaseEvidenceStore(client, { trustedServer: true });
  assert.equal(store.contractVersion, EVIDENCE_STORE_CONTRACT_VERSION);
  assert.equal(store.testOnly, false);
  assert.equal(await store.isInvalidated(evidenceId, { accountId }), false);
  assert.deepEqual(await store.invalidate(evidenceId, "source_withdrawn", { accountId }), {
    evidenceId, accountId, reason: "source_withdrawn", invalidated: true,
  });
  assert.deepEqual(calls, [
    { name: "is_hey_evidence_invalidated", args: { p_account_id: accountId, p_evidence_id: evidenceId } },
    { name: "invalidate_hey_evidence", args: { p_account_id: accountId, p_evidence_id: evidenceId, p_reason: "source_withdrawn" } },
  ]);
  assert.throws(() => new SupabaseEvidenceStore(client), /trusted server-side/i);
  assert.throws(() => new SupabaseEvidenceStore({}), /Supabase client/i);
});

test("evidence adapter rejects malformed IDs, free-form reasons, RPC errors, and malformed responses", async () => {
  const { client, calls } = fakeClient({
    is_hey_evidence_invalidated: { data: "false", error: null },
    invalidate_hey_evidence: { data: false, error: null },
  });
  const store = new SupabaseEvidenceStore(client, { trustedServer: true });
  await assert.rejects(() => store.isInvalidated(evidenceId, { accountId: "account-a" }), /accountId must be a UUID/i);
  await assert.rejects(() => store.invalidate(evidenceId, "user supplied private data", { accountId }), /machine-safe code/i);
  assert.equal(calls.length, 0, "invalid values must be rejected before making RPC calls");
  await assert.rejects(() => store.isInvalidated(evidenceId, { accountId }), /response was malformed/i);
  await assert.rejects(() => store.invalidate(evidenceId, "source_withdrawn", { accountId }), /did not confirm/i);
});

test("evidence migration keeps invalidation account-scoped and denies direct table access", async () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const sql = await readFile(resolve(root, "supabase/migrations/20261014010000_durable_evidence.sql"), "utf8");
  assert.match(sql, /primary key \(account_id, evidence_id\)/i);
  assert.match(sql, /auth\.uid\(\) is distinct from p_account_id/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.hey_evidence_invalidations from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.invalidate_hey_evidence\(uuid, uuid, text\) to authenticated, service_role/i);
});
