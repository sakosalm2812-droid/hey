import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SupabaseDeviceCommandQueueStore } from "../src/core/supabaseDeviceCommandQueueStore.js";
import core from "../src/core/index.js";

const accountId = "2e4a81a4-2da8-4ae0-bfd6-719484a37795";
const deviceId = "67337f11-57da-4c23-a41f-fc19d1995b61";
const commandId = "6cc95d2f-b37c-4d99-a6d6-3c59eb9126fb";
const leaseToken = "1b8473f4-b50d-4a04-9834-7e5b446c07b4";
const envelope = { version: 1, action: "computer.open_url", resource: "https://example.com", input: { url: "https://example.com" } };
const row = { commandId, deviceId, envelope, state: "pending", attempts: 1, createdAt: "2026-10-15T10:00:00.000Z", lastError: null };

function fakeClient(responses = {}) {
  const calls = [];
  return { calls, client: { async rpc(name, params) { calls.push({ name, params }); return responses[name] ?? { data: null, error: null }; } } };
}

test("device queue adapter binds account/device scope and exports trusted-server persistence", async () => {
  assert.throws(() => new SupabaseDeviceCommandQueueStore({ rpc() {} }), /trusted server/);
  assert.throws(() => new SupabaseDeviceCommandQueueStore(null, { trustedServer: true }), /configured/);
  assert.equal(core.devices.SupabaseDeviceCommandQueueStore, SupabaseDeviceCommandQueueStore);
  const { client, calls } = fakeClient({
    enqueue_hey_device_command: { data: { created: true, command: row }, error: null },
    claim_hey_device_command: { data: { command: row, leaseToken }, error: null },
    ack_hey_device_command: { data: true, error: null },
  });
  const store = new SupabaseDeviceCommandQueueStore(client, { trustedServer: true });
  const expected = { commandId: row.commandId, deviceId: row.deviceId, envelope, state: "pending", attempts: 1, createdAt: Date.parse(row.createdAt) };
  assert.deepEqual(await store.enqueue(accountId, deviceId, "request-1", envelope), { created: true, command: expected });
  assert.deepEqual(await store.claimNext(accountId, deviceId, 5_000), { command: expected, leaseToken });
  assert.equal(await store.acknowledge(accountId, deviceId, commandId, leaseToken), true);
  assert.deepEqual(calls, [
    { name: "enqueue_hey_device_command", params: { p_account_id: accountId, p_device_id: deviceId, p_idempotency_key: "request-1", p_envelope: envelope } },
    { name: "claim_hey_device_command", params: { p_account_id: accountId, p_device_id: deviceId, p_lease_ms: 5_000 } },
    { name: "ack_hey_device_command", params: { p_account_id: accountId, p_device_id: deviceId, p_command_id: commandId, p_lease_token: leaseToken } },
  ]);
});

test("queue rejects malformed identifiers, envelopes, accessors, oversized payloads and RPC responses safely", async () => {
  const { client } = fakeClient({
    enqueue_hey_device_command: { data: null, error: { message: "private account payload" } },
    claim_hey_device_command: { data: { command: row, leaseToken: "bad" }, error: null },
    ack_hey_device_command: { data: "true", error: null },
  });
  const store = new SupabaseDeviceCommandQueueStore(client, { trustedServer: true });
  await assert.rejects(store.enqueue("other-account", deviceId, "key", envelope), /UUID/);
  await assert.rejects(store.enqueue(accountId, deviceId, "key", { ...envelope, version: 2 }), /envelope/);
  await assert.rejects(store.enqueue(accountId, deviceId, "key", { ...envelope, input: { blob: "x".repeat(66_000) } }), /64 KiB/);
  let getterCalls = 0;
  const hostile = { ...envelope, input: {} };
  Object.defineProperty(hostile.input, "secret", { enumerable: true, get() { getterCalls += 1; return "private"; } });
  await assert.rejects(store.enqueue(accountId, deviceId, "key", hostile), /accessors/);
  assert.equal(getterCalls, 0);
  await assert.rejects(store.claimNext(accountId, deviceId, 300_001), /5 minutes/);
  await assert.rejects(store.enqueue(accountId, deviceId, "key", envelope), (error) => error.message === "Supabase device command enqueue failed.");
  await assert.rejects(store.claimNext(accountId, deviceId), /malformed/);
  await assert.rejects(store.acknowledge(accountId, deviceId, commandId, leaseToken), /malformed/);
  assert.equal(await store.acknowledge(accountId, "not-a-uuid", commandId, leaseToken), false);
  assert.equal(JSON.stringify(client).includes("private account payload"), false);
  assert.equal(JSON.stringify(store).includes("private account payload"), false);
});

test("queue migration fences replay, cross-account access, stale leases and revoked devices", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261015000000_durable_device_command_queue.sql", import.meta.url), "utf8");
  assert.match(sql, /unique\s*\(account_id,\s*device_id,\s*idempotency_key\)/i);
  assert.match(sql, /foreign key \(device_id, account_id\) references public\.hey_devices\(id, user_id\)/i);
  assert.equal((sql.match(/coalesce\(auth\.role\(\), ''\) <> 'service_role'/gi) || []).length, 3);
  assert.match(sql, /d\.user_id = p_account_id/i);
  assert.match(sql, /d\.status <> 'revoked'/i);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /lease_token = gen_random_uuid\(\)/i);
  assert.match(sql, /lease_until > clock_timestamp\(\)/i);
  assert.match(sql, /lease_until <= clock_timestamp\(\)/i);
  assert.match(sql, /idempotency_key = trim\(p_idempotency_key\)[\s\S]*for update/i);
  assert.match(sql, /v_command\.envelope is distinct from p_envelope/i);
  assert.match(sql, /cancel_hey_device_commands_on_revoke/i);
  assert.match(sql, /state = 'cancelled'/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.hey_device_commands from public, anon, authenticated, service_role/i);
  assert.match(sql, /for update;[\s\S]*select count\(\*\) into v_pending_count[\s\S]*v_pending_count >= 100/i);
  assert.match(sql, /grant execute on function public\.enqueue_hey_device_command\(uuid, uuid, text, jsonb\) to service_role/i);
  assert.match(sql, /grant execute on function public\.claim_hey_device_command\(uuid, uuid, integer\) to service_role/i);
  assert.match(sql, /grant execute on function public\.ack_hey_device_command\(uuid, uuid, uuid, uuid\) to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.(?:enqueue|claim|ack)_hey_device_command\([^;]+\) to [^;]*authenticated/i);
  assert.match(sql, /endpoint must authenticate/i);
  assert.match(sql, /the account, verify the applicable mandate, and authorize the target device/i);
  assert.doesNotMatch(sql, /p_error|error_message|exception_message/i);
});
