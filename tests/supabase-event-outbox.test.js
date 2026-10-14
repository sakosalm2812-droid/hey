import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SupabaseEventOutboxStore } from "../src/core/supabaseEventOutboxStore.js";
import core from "../src/core/index.js";

const eventId = "6cc95d2f-b37c-4d99-a6d6-3c59eb9126fb";
const leaseToken = "1b8473f4-b50d-4a04-9834-7e5b446c07b4";
const row = {
  id: eventId,
  idempotencyKey: "key-1",
  scope: "account-1",
  eventName: "mission.step",
  payload: { nested: [1, "two"] },
  state: "pending",
  attempts: 2,
  createdAt: "2026-10-14T10:00:00.000Z",
  deliveredAt: null,
  lastError: null,
};

function fakeClient(responses = {}) {
  const calls = [];
  return {
    calls,
    client: { async rpc(name, params) { calls.push({ name, params }); return responses[name] ?? { data: null, error: null }; } },
  };
}

test("Supabase outbox is a trusted server-only implementation of the canonical contract", async () => {
  assert.throws(() => new SupabaseEventOutboxStore({ rpc() {} }), /trusted server/);
  assert.throws(() => new SupabaseEventOutboxStore(null, { trustedServer: true }), /configured/);
  assert.equal(core.events.SupabaseEventOutboxStore, SupabaseEventOutboxStore);
  const { client, calls } = fakeClient({
    append_hey_event_outbox_once: { data: { created: true, event: row }, error: null },
    claim_hey_event_outbox: { data: { event: row, leaseToken }, error: null },
    list_hey_event_outbox_pending: { data: [row], error: null },
    ack_hey_event_outbox: { data: true, error: null },
    release_hey_event_outbox: { data: true, error: null },
  });
  const store = new SupabaseEventOutboxStore(client, { trustedServer: true });
  const appended = await store.appendOnce("key-1", "mission.step", { nested: [1, "two"] }, "account-1");
  assert.deepEqual(appended, { created: true, event: { id: row.id, idempotencyKey: row.idempotencyKey, scope: row.scope, eventName: row.eventName, payload: row.payload, state: row.state, attempts: row.attempts, createdAt: Date.parse(row.createdAt) } });
  assert.deepEqual(await store.claim(eventId, 5_000), { event: appended.event, leaseToken });
  assert.deepEqual(await store.listPending(17), [appended.event]);
  assert.equal(await store.acknowledge(eventId, leaseToken), true);
  assert.equal(await store.release(eventId, leaseToken, new Error("private email/user payload")), true);
  assert.deepEqual(calls.map(({ name }) => name), [
    "append_hey_event_outbox_once", "claim_hey_event_outbox", "list_hey_event_outbox_pending", "ack_hey_event_outbox", "release_hey_event_outbox",
  ]);
  assert.deepEqual(calls[0].params, { p_idempotency_key: "key-1", p_event_name: "mission.step", p_payload: { nested: [1, "two"] }, p_scope: "account-1" });
  assert.deepEqual(calls[4].params, { p_event_id: eventId, p_lease_token: leaseToken });
  assert.equal(JSON.stringify(calls).includes("private email/user payload"), false);
});

test("Supabase adapter rejects malformed payloads, bounds, malformed RPC results, and hides storage errors", async () => {
  const { client } = fakeClient({
    append_hey_event_outbox_once: { data: null, error: { message: "raw PII from database" } },
    claim_hey_event_outbox: { data: null, error: null },
  });
  const store = new SupabaseEventOutboxStore(client, { trustedServer: true });
  const cyclic = {}; cyclic.self = cyclic;
  await assert.rejects(store.appendOnce("key", "event", cyclic, "scope"), /cycles/);
  await assert.rejects(store.appendOnce("key", "event", { get privateData() { throw new Error("getter executed"); } }, "scope"), /accessors/);
  await assert.rejects(store.appendOnce("key", "event", { value: Infinity }, "scope"), /plain JSON/);
  await assert.rejects(store.claim(eventId, 300_001), /between 1 ms and 5 minutes/);
  await assert.rejects(store.listPending(0), /Replay limit/);
  await assert.rejects(store.appendOnce("key", "event", {}, "scope"), (error) => {
    assert.equal(error.message, "Supabase event outbox append failed.");
    assert.equal(error.message.includes("PII"), false);
    return true;
  });
  assert.equal(await store.claim(eventId), null);
  await assert.rejects(store.acknowledge(eventId, leaseToken), /malformed/);
  assert.equal(await store.acknowledge("not-a-uuid", leaseToken), false);
});

test("migration enforces service-role RPCs, unique idempotency, atomic leases, and non-sensitive errors", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261014020000_durable_event_outbox.sql", import.meta.url), "utf8");
  assert.match(sql, /unique\s*\(scope,\s*event_name,\s*idempotency_key\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.hey_event_outbox from public, anon, authenticated/i);
  assert.match(sql, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /lease_token = gen_random_uuid\(\)/i);
  assert.match(sql, /lease_until > clock_timestamp\(\)/i);
  assert.match(sql, /last_error = 'delivery_failed'/i);
  assert.doesNotMatch(sql, /p_error|error_message|exception_message/i);
  for (const name of ["append_hey_event_outbox_once", "claim_hey_event_outbox", "list_hey_event_outbox_pending", "ack_hey_event_outbox", "release_hey_event_outbox"]) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\(`, "i"));
  }
});
