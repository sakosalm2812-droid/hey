import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SupabaseDeviceCommandQueueStore } from "../src/core/supabaseDeviceCommandQueueStore.js";
import core from "../src/core/index.js";

const accountId = "2e4a81a4-2da8-4ae0-bfd6-719484a37795";
const deviceId = "67337f11-57da-4c23-a41f-fc19d1995b61";
const commandId = "6cc95d2f-b37c-4d99-a6d6-3c59eb9126fb";
const leaseToken = "1b8473f4-b50d-4a04-9834-7e5b446c07b4";
const credentialHash = "a".repeat(64);
const mandateId = "8c9a52d8-3774-4cc1-a59b-5c19ab4e1230";
const authority = { mandateIds: [mandateId], expiresAt: "2026-10-15T10:01:00.000Z", revocationEpoch: 2 };
const renewal = { renewed: true, leaseUntil: "2026-10-15T10:00:30.000Z", idempotent: false };
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
    enqueue_hey_device_command_authorized: { data: { created: true, command: row }, error: null },
    claim_hey_device_command: { data: { command: row, leaseToken }, error: null },
    renew_hey_device_command_lease: { data: renewal, error: null },
    ack_hey_device_command: { data: true, error: null },
    fail_hey_device_command: { data: true, error: null },
  });
  const store = new SupabaseDeviceCommandQueueStore(client, { trustedServer: true });
  const expected = { commandId: row.commandId, deviceId: row.deviceId, envelope, state: "pending", attempts: 1, createdAt: Date.parse(row.createdAt) };
  assert.deepEqual(await store.enqueue(accountId, deviceId, "request-1", envelope, authority), { created: true, command: expected });
  assert.deepEqual(await store.claimNext(accountId, deviceId, "claim-1", 5_000, credentialHash), { command: expected, leaseToken });
  assert.deepEqual(await store.renewLease(accountId, deviceId, commandId, leaseToken, "renew-1", 5_000, credentialHash), {
    renewed: true, leaseUntil: Date.parse(renewal.leaseUntil), idempotent: false,
  });
  assert.equal(await store.acknowledge(accountId, deviceId, commandId, leaseToken, credentialHash), true);
  assert.equal(await store.recordFailure(accountId, deviceId, commandId, leaseToken, credentialHash), true);
  assert.deepEqual(calls, [
    { name: "enqueue_hey_device_command_authorized", params: { p_account_id: accountId, p_device_id: deviceId, p_idempotency_key: "request-1", p_envelope: envelope, p_mandate_ids: [mandateId], p_mandate_expires_at: authority.expiresAt, p_mandate_revocation_epoch: 2 } },
    { name: "claim_hey_device_command", params: { p_account_id: accountId, p_device_id: deviceId, p_idempotency_key: "claim-1", p_lease_ms: 5_000, p_credential_hash: credentialHash } },
    { name: "renew_hey_device_command_lease", params: { p_account_id: accountId, p_device_id: deviceId, p_command_id: commandId, p_lease_token: leaseToken, p_idempotency_key: "renew-1", p_lease_ms: 5_000, p_credential_hash: credentialHash } },
    { name: "ack_hey_device_command", params: { p_account_id: accountId, p_device_id: deviceId, p_command_id: commandId, p_lease_token: leaseToken, p_credential_hash: credentialHash } },
    { name: "fail_hey_device_command", params: { p_account_id: accountId, p_device_id: deviceId, p_command_id: commandId, p_lease_token: leaseToken, p_credential_hash: credentialHash } },
  ]);
});

test("queue rejects malformed identifiers, envelopes, accessors, oversized payloads and RPC responses safely", async () => {
  const { client } = fakeClient({
    enqueue_hey_device_command_authorized: { data: null, error: { message: "private account payload" } },
    claim_hey_device_command: { data: { command: row, leaseToken: "bad" }, error: null },
    renew_hey_device_command_lease: { data: { renewed: true, leaseUntil: "bad", idempotent: false }, error: null },
    ack_hey_device_command: { data: "true", error: null },
    fail_hey_device_command: { data: { ok: true }, error: null },
  });
  const store = new SupabaseDeviceCommandQueueStore(client, { trustedServer: true });
  await assert.rejects(store.enqueue("other-account", deviceId, "key", envelope, authority), /UUID/);
  await assert.rejects(store.enqueue(accountId, deviceId, "key", { ...envelope, version: 2 }, authority), /envelope/);
  await assert.rejects(store.enqueue(accountId, deviceId, "key", { ...envelope, input: { blob: "x".repeat(66_000) } }, authority), /64 KiB/);
  let getterCalls = 0;
  const hostile = { ...envelope, input: {} };
  Object.defineProperty(hostile.input, "secret", { enumerable: true, get() { getterCalls += 1; return "private"; } });
  await assert.rejects(store.enqueue(accountId, deviceId, "key", hostile, authority), /accessors/);
  assert.equal(getterCalls, 0);
  await assert.rejects(store.enqueue(accountId, deviceId, "key", envelope), /mandate scope/);
  await assert.rejects(store.claimNext(accountId, deviceId, "\u0000bad-key", 5_000, credentialHash), /bounded printable text/);
  await assert.rejects(store.claimNext(accountId, deviceId, "x".repeat(129), 5_000, credentialHash), /bounded printable text/);
  await assert.rejects(store.claimNext(accountId, deviceId, "too-short", 999, credentialHash), /1 second and 5 minutes/);
  await assert.rejects(store.claimNext(accountId, deviceId, "too-short", 1, credentialHash), /1 second and 5 minutes/);
  const hostileAuthority = { ...authority, mandateIds: [mandateId] };
  Object.defineProperty(hostileAuthority.mandateIds, "0", { enumerable: true, get() { getterCalls += 1; return mandateId; } });
  await assert.rejects(store.enqueue(accountId, deviceId, "key", envelope, hostileAuthority), /mandate scope/);
  assert.equal(getterCalls, 0);
  await assert.rejects(store.claimNext(accountId, deviceId, "claim-1", 300_001), /5 minutes/);
  await assert.rejects(store.enqueue(accountId, deviceId, "key", envelope, authority), (error) => error.message === "Supabase device command enqueue failed.");
  await assert.rejects(store.claimNext(accountId, deviceId, "claim-1", 30_000, credentialHash), /malformed/);
  await assert.rejects(store.renewLease(accountId, deviceId, commandId, leaseToken, "renew-1", 30_000, credentialHash), /malformed/);
  await assert.rejects(store.renewLease(accountId, deviceId, commandId, leaseToken, "renew-1", 300_001), /5 minutes/);
  await assert.rejects(store.renewLease(accountId, deviceId, commandId, leaseToken, "renew-1", 999, credentialHash), /1 second and 5 minutes/);
  await assert.rejects(store.renewLease(accountId, deviceId, commandId, leaseToken, "renew-1", 1, credentialHash), /1 second and 5 minutes/);
  await assert.rejects(store.acknowledge(accountId, deviceId, commandId, leaseToken, credentialHash), /malformed/);
  await assert.rejects(store.recordFailure(accountId, deviceId, commandId, leaseToken, credentialHash), /malformed/);
  assert.equal(await store.acknowledge(accountId, "not-a-uuid", commandId, leaseToken, credentialHash), false);
  assert.equal(await store.recordFailure("not-a-uuid", deviceId, commandId, leaseToken, credentialHash), false);
  await assert.rejects(store.claimNext(accountId, deviceId, "claim-1", 5_000, "secret-token"), /SHA-256/);
  assert.equal(JSON.stringify(client).includes("private account payload"), false);
  assert.equal(JSON.stringify(store).includes("private account payload"), false);
});

test("failure recording sends only scoped lease identifiers and accepts only a boolean RPC result", async () => {
  const { client, calls } = fakeClient({ fail_hey_device_command: { data: false, error: null } });
  const store = new SupabaseDeviceCommandQueueStore(client, { trustedServer: true });
  assert.equal(await store.recordFailure(accountId, deviceId, commandId, leaseToken, credentialHash), false);
  assert.deepEqual(calls, [{ name: "fail_hey_device_command", params: {
    p_account_id: accountId, p_device_id: deviceId, p_command_id: commandId, p_lease_token: leaseToken, p_credential_hash: credentialHash,
  } }]);
  assert.equal(JSON.stringify(calls).includes("envelope"), false);
  assert.equal(JSON.stringify(calls).includes("error"), false);
});

test("transport queue migration locks current device and credential before every mutation", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261016000200_atomic_device_transport_credential_fence.sql", import.meta.url), "utf8");
  for (const [name, signature] of [
    ["claim_hey_device_command", "uuid, uuid, integer, text"],
    ["renew_hey_device_command_lease", "uuid, uuid, uuid, uuid, text, integer, text"],
    ["ack_hey_device_command", "uuid, uuid, uuid, uuid, text"],
    ["fail_hey_device_command", "uuid, uuid, uuid, uuid, text"],
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?p_credential_hash text\\s*\\)[\\s\\S]*?d\\.status in \\('online', 'offline'\\) for update[\\s\\S]*?c\\.secret_hash = p_credential_hash and c\\.revoked_at is null for update[\\s\\S]*?return public\\.${name}\\(`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\(${signature.replaceAll(", ", ", ")}\\) to service_role`, "i"));
    assert.doesNotMatch(sql, new RegExp(`grant execute on function public\\.${name}\\([^;]+\\) to [^;]*authenticated`, "i"));
  }
  assert.match(sql, /revoke all on function public\.claim_hey_device_command\(uuid, uuid, integer\) from public, anon, authenticated, service_role/i);
  assert.match(sql, /revoke all on function public\.renew_hey_device_command_lease\(uuid, uuid, uuid, uuid, text, integer\) from public, anon, authenticated, service_role/i);
  assert.match(sql, /revoke all on function public\.ack_hey_device_command\(uuid, uuid, uuid, uuid\) from public, anon, authenticated, service_role/i);
  assert.match(sql, /revoke all on function public\.fail_hey_device_command\(uuid, uuid, uuid, uuid\) from public, anon, authenticated, service_role/i);
});

test("device claims replay one active lease by bounded per-device key and fail closed when stale", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261016000400_idempotent_device_command_claims.sql", import.meta.url), "utf8");
  const table = sql.slice(sql.indexOf("create table public.hey_device_command_claim_receipts"), sql.indexOf(";", sql.indexOf("create table public.hey_device_command_claim_receipts")) + 1);
  assert.match(table, /primary key \(account_id, device_id, idempotency_key\)/i);
  assert.match(table, /unique \(command_id, lease_token\)/i);
  assert.match(table, /foreign key \(command_id, account_id, device_id\)[\s\S]*references public\.hey_device_commands\(id, account_id, device_id\) on delete cascade/i);
  assert.doesNotMatch(table, /credential|secret_hash|envelope|error text/i);
  assert.match(sql, /alter table public\.hey_device_command_claim_receipts enable row level security/i);
  assert.match(sql, /revoke all on public\.hey_device_command_claim_receipts from public, anon, authenticated, service_role/i);
  assert.match(sql, /p_idempotency_key text,[\s\S]*p_lease_ms integer, p_credential_hash text/i);
  assert.match(sql, /d\.status in \('online', 'offline'\) for update[\s\S]*c\.secret_hash = p_credential_hash and c\.revoked_at is null for update/i);
  assert.match(sql, /r\.idempotency_key = trim\(p_idempotency_key\)[\s\S]*c\.lease_token = v_receipt\.lease_token[\s\S]*c\.lease_until > clock_timestamp\(\)/i);
  assert.match(sql, /hey_device_command_mandate_is_current/i);
  assert.match(sql, /if not found then return null; end if;[\s\S]*v_claim := public\.claim_hey_device_command\(p_account_id, p_device_id, p_lease_ms\)/i);
  assert.match(sql, /insert into public\.hey_device_command_claim_receipts[\s\S]*return v_claim/i);
  assert.match(sql, /revoke all on function public\.claim_hey_device_command\(uuid, uuid, text, integer, text\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.claim_hey_device_command\(uuid, uuid, text, integer, text\) to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.claim_hey_device_command\([^;]+\) to [^;]*authenticated/i);
});

test("latest claim RPC enforces the one-second delivery floor before locking or consuming an attempt", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261016000500_minimum_device_command_claim_lease.sql", import.meta.url), "utf8");
  const claim = sql.slice(sql.indexOf("create or replace function public.claim_hey_device_command"), sql.indexOf("$$;", sql.indexOf("create or replace function public.claim_hey_device_command")) + 3);
  assert.match(claim, /p_lease_ms not between 1000 and 300000/i);
  assert.ok(claim.indexOf("p_lease_ms not between 1000 and 300000") < claim.indexOf("select * into v_device"), "short leases must be rejected before acquiring a device lease");
  assert.match(claim, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
  assert.match(claim, /c\.secret_hash = p_credential_hash and c\.revoked_at is null for update/i);
  assert.match(claim, /r\.idempotency_key = trim\(p_idempotency_key\)[\s\S]*v_claim := public\.claim_hey_device_command\(p_account_id, p_device_id, p_lease_ms\)/i);
  assert.match(sql, /revoke all on function public\.claim_hey_device_command\(uuid, uuid, integer\) from public, anon, authenticated, service_role/i);
  assert.match(sql, /revoke all on function public\.claim_hey_device_command\(uuid, uuid, integer, text\) from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function public\.claim_hey_device_command\(uuid, uuid, text, integer, text\) to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.claim_hey_device_command\([^;]+\) to [^;]*authenticated/i);
});

test("delivery failure retries are idempotent per exact lease and remain private and revocation-fenced", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261016000300_idempotent_device_command_failure_receipts.sql", import.meta.url), "utf8");
  const table = sql.slice(sql.indexOf("create table public.hey_device_command_failure_receipts"), sql.indexOf(";", sql.indexOf("create table public.hey_device_command_failure_receipts")) + 1);
  assert.match(table, /primary key \(command_id, lease_token\)/i);
  assert.match(table, /foreign key \(device_id, account_id\) references public\.hey_devices\(id, user_id\)/i);
  assert.doesNotMatch(table, /secret_hash|credential|envelope|error text/i);
  assert.match(sql, /alter table public\.hey_device_command_failure_receipts enable row level security/i);
  assert.match(sql, /revoke all on public\.hey_device_command_failure_receipts from public, anon, authenticated, service_role/i);

  const failFn = sql.slice(sql.indexOf("create or replace function public.fail_hey_device_command"));
  assert.match(failFn, /c\.id = p_command_id and c\.account_id = p_account_id and c\.device_id = p_device_id[\s\S]*c\.lease_token = p_lease_token and c\.lease_until > clock_timestamp\(\)/i);
  assert.match(failFn, /hey_device_command_mandate_is_current/i);
  assert.match(failFn, /last_error = 'delivery_failed'/i);
  assert.doesNotMatch(failFn, /p_error|error_message|exception_message/i);
  assert.match(failFn, /d\.status in \('online', 'offline'\) and d\.capabilities @> jsonb_build_array\(c\.envelope->>'action'\)/i);
  assert.match(failFn, /p\.user_id = c\.account_id[\s\S]*p\.status = 'granted'/i);
  assert.match(failFn, /if found then[\s\S]*insert into public\.hey_device_command_failure_receipts[\s\S]*return true/i);
  assert.match(failFn, /return exists \([\s\S]*r\.account_id = p_account_id and r\.device_id = p_device_id[\s\S]*r\.command_id = p_command_id and r\.lease_token = p_lease_token/i);
  assert.match(failFn, /join public\.hey_device_commands c on c\.id = r\.command_id[\s\S]*join public\.hey_devices d on d\.id = r\.device_id and d\.user_id = r\.account_id/i);
  assert.match(sql, /revoke all on function public\.fail_hey_device_command\(uuid, uuid, uuid, uuid\) from public, anon, authenticated, service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.fail_hey_device_command\([^;]+\) to [^;]*authenticated/i);

  const credentialFence = await readFile(new URL("../supabase/migrations/20261016000200_atomic_device_transport_credential_fence.sql", import.meta.url), "utf8");
  assert.match(credentialFence, /create or replace function public\.fail_hey_device_command\([\s\S]*?p_credential_hash text\s*\)[\s\S]*?c\.secret_hash = p_credential_hash and c\.revoked_at is null for update[\s\S]*?return public\.fail_hey_device_command\(p_account_id, p_device_id, p_command_id, p_lease_token\)/i);
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

test("mandate lease migration keeps renewal idempotency bounded and revocation-aware", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261015000400_device_command_lease_renewal.sql", import.meta.url), "utf8");
  assert.match(sql, /mandate_ids uuid\[\] not null default array\[\]::uuid\[\]/i);
  assert.match(sql, /mandate_expires_at timestamptz/i);
  assert.match(sql, /hey_device_command_mandate_is_current/i);
  assert.match(sql, /m\.revocation_epoch = p_revocation_epoch/i);
  assert.match(sql, /revoked_at is null/i);
  assert.match(sql, /state = 'cancelled', lease_token = null, lease_until = null/i);
  assert.match(sql, /create or replace function public\.renew_hey_device_command_lease[\s\S]*v_command\.lease_token is distinct from p_lease_token[\s\S]*v_command\.lease_until <= clock_timestamp\(\)/i);
  assert.match(sql, /primary key \(account_id, device_id, command_id, lease_token, idempotency_key\)/i);
  assert.match(sql, /lease_renewals >= 5/i);
  assert.match(sql, /p_lease_ms not between 1 and 300000/i);
  assert.match(sql, /grant execute on function public\.renew_hey_device_command_lease\(uuid, uuid, uuid, uuid, text, integer\) to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.renew_hey_device_command_lease\([^;]+\) to [^;]*authenticated/i);
});

test("latest credential-fenced renewal RPC keeps the one-second floor at the database boundary", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261016000900_minimum_device_command_renewal_lease.sql", import.meta.url), "utf8");
  assert.match(sql, /create or replace function public\.renew_hey_device_command_lease\([\s\S]*?p_lease_ms not between 1000 and 300000/i);
  assert.match(sql, /d\.status in \('online', 'offline'\) for update/i);
  assert.match(sql, /c\.secret_hash = p_credential_hash and c\.revoked_at is null for update/i);
  assert.match(sql, /return public\.renew_hey_device_command_lease\(\s*p_account_id, p_device_id, p_command_id, p_lease_token, p_idempotency_key, p_lease_ms\s*\)/i);
  assert.match(sql, /revoke all on function public\.renew_hey_device_command_lease\(uuid, uuid, uuid, uuid, text, integer, text\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.renew_hey_device_command_lease\(uuid, uuid, uuid, uuid, text, integer, text\) to service_role/i);
});

test("retry migration uses bounded backoff, terminal attempts, live scoped leases and service-role-only RPCs", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261015000100_device_command_delivery_retries.sql", import.meta.url), "utf8");
  assert.match(sql, /available_at timestamptz not null default clock_timestamp\(\)/i);
  assert.match(sql, /available_at <= clock_timestamp\(\)/i);
  assert.match(sql, /attempts < 5/i);
  assert.match(sql, /attempts >= 5 then 'failed' else 'pending'/i);
  assert.match(sql, /power\(2, greatest\(0, c\.attempts - 1\)\)::integer/i);
  assert.match(sql, /least\(60,/i);
  assert.match(sql, /attempts >= 5 and \(c\.lease_until is null or c\.lease_until <= clock_timestamp\(\)\)/i);
  assert.match(sql, /c\.lease_token = p_lease_token and c\.lease_until > clock_timestamp\(\)/i);
  assert.match(sql, /c\.id = p_command_id and c\.account_id = p_account_id and c\.device_id = p_device_id/i);
  assert.match(sql, /d\.id = p_device_id and d\.user_id = p_account_id and d\.status <> 'revoked'/i);
  assert.match(sql, /last_error = 'delivery_failed'/i);
  assert.doesNotMatch(sql, /p_error|error_message|exception_message|command content/i);
  assert.match(sql, /revoke all on function public\.fail_hey_device_command\(uuid, uuid, uuid, uuid\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.fail_hey_device_command\(uuid, uuid, uuid, uuid\) to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.fail_hey_device_command\([^;]+\) to [^;]*authenticated/i);
});

test("latest command enqueue and claim serialize current authorization before queue writes", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261017000100_atomic_device_command_permission_fence.sql", import.meta.url), "utf8");
  const enqueueStart = sql.indexOf("create or replace function public.enqueue_hey_device_command_authorized(");
  const enqueueEnd = sql.indexOf("$$;", enqueueStart) + 3;
  const enqueue = sql.slice(enqueueStart, enqueueEnd);
  const enqueuePermissionLock = enqueue.indexOf("perform 1 from public.hey_permissions p");
  assert.ok(enqueuePermissionLock >= 0);
  const enqueueLockBody = enqueue.slice(enqueuePermissionLock);
  assert.ok(enqueueLockBody.includes("p.status = 'granted'"));
  assert.ok(enqueueLockBody.includes("for share;"));
  assert.ok(enqueuePermissionLock < enqueue.indexOf("select * into v_command"), "permission row lock must precede command lookup/insertion");

  const claimStart = sql.indexOf("create or replace function public.claim_hey_device_command(p_account_id uuid, p_device_id uuid, p_lease_ms integer)");
  const claimEnd = sql.indexOf("$$;", claimStart) + 3;
  const claim = sql.slice(claimStart, claimEnd);
  const claimPermissionLock = claim.indexOf("perform p.permission from public.hey_permissions p");
  const claimEpochLock = claim.indexOf("perform 1 from public.hey_action_mandate_epochs e");
  const claimMandateLock = claim.indexOf("perform m.mandate_id from public.hey_action_mandates m");
  assert.ok(claimPermissionLock >= 0 && claimEpochLock > claimPermissionLock && claimMandateLock > claimEpochLock);
  const claimPermissionBody = claim.slice(claimPermissionLock, claimEpochLock);
  assert.ok(claimPermissionBody.includes("p.status = 'granted'"));
  assert.ok(claimPermissionBody.includes("pending.state = 'pending'"));
  assert.ok(claimPermissionBody.includes("pending.envelope->>'action' = p.permission"));
  assert.ok(claimPermissionBody.includes("for share of p;"));
  assert.ok(claim.slice(claimEpochLock, claimMandateLock).includes("for share;"));
  const claimMandateBody = claim.slice(claimMandateLock);
  assert.ok(claimMandateBody.includes("m.mandate_id = any(pending.mandate_ids)"));
  assert.ok(claimMandateBody.includes("for share of m;"));
  assert.ok(claim.indexOf("select * into v_device") < claimPermissionLock, "claim keeps the established device-first lock order");
  assert.ok(claimMandateLock < claim.indexOf("update public.hey_device_commands"), "authorization rows are locked before any queue row mutation");
  assert.ok(sql.includes("revoke all on function public.enqueue_hey_device_command_authorized(uuid, uuid, text, jsonb, uuid[], timestamptz, bigint) from public, anon, authenticated;"));
  assert.ok(sql.includes("grant execute on function public.enqueue_hey_device_command_authorized(uuid, uuid, text, jsonb, uuid[], timestamptz, bigint) to service_role;"));
  assert.ok(sql.includes("revoke all on function public.claim_hey_device_command(uuid, uuid, integer) from public, anon, authenticated, service_role;"));
});

test("latest authorized enqueue requires enrollment before idempotency replay", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261017000200_enforce_enrollment_on_command_replay.sql", import.meta.url), "utf8");
  const start = sql.indexOf("create or replace function public.enqueue_hey_device_command_authorized(");
  const end = sql.indexOf("$$;", start) + 3;
  const enqueue = sql.slice(start, end);
  const enrollmentGate = enqueue.indexOf("d.status in ('online', 'offline')");
  const idempotencyLookup = enqueue.indexOf("select * into v_command from public.hey_device_commands");
  assert.ok(enrollmentGate >= 0 && idempotencyLookup > enrollmentGate, "enrollment must be checked before returning an existing idempotency result");
  assert.ok(enqueue.includes("for update;"), "device status remains serialized with enrollment transitions");
  assert.ok(!enqueue.includes("d.status <> 'revoked'"), "pending and unknown device states must not pass the SQL boundary");
  assert.ok(enqueue.includes("select * into v_command"), "same-key replay remains supported for enrolled devices");
  assert.ok(sql.includes("revoke all on function public.enqueue_hey_device_command_authorized(uuid, uuid, text, jsonb, uuid[], timestamptz, bigint) from public, anon, authenticated;"));
  assert.ok(sql.includes("grant execute on function public.enqueue_hey_device_command_authorized(uuid, uuid, text, jsonb, uuid[], timestamptz, bigint) to service_role;"));
});

test("idempotent claim replay locks current authorization before locking the command row", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261017000300_fence_device_claim_replay_authorization.sql", import.meta.url), "utf8");
  const start = sql.indexOf("create or replace function public.claim_hey_device_command(");
  const end = sql.indexOf("$$;", start) + 3;
  const claim = sql.slice(start, end);
  const deviceLock = claim.indexOf("select * into v_device");
  const credentialLock = claim.indexOf("select * into v_credential");
  const receiptLookup = claim.indexOf("select * into v_receipt");
  const metadataRead = claim.indexOf("select * into v_command");
  const permissionLock = claim.indexOf("perform p.permission from public.hey_permissions p");
  const epochLock = claim.indexOf("perform 1 from public.hey_action_mandate_epochs e");
  const mandateLock = claim.indexOf("perform m.mandate_id from public.hey_action_mandates m");
  const replayCommandLock = claim.indexOf("select * into v_command", metadataRead + 1);
  assert.ok(deviceLock >= 0 && credentialLock > deviceLock && receiptLookup > credentialLock);
  assert.ok(metadataRead > receiptLookup && permissionLock > metadataRead && epochLock > permissionLock);
  assert.ok(mandateLock > epochLock && replayCommandLock > mandateLock, "authorization rows must be locked before the replayed command row");
  assert.ok(claim.slice(permissionLock, epochLock).includes("p.status = 'granted'") && claim.slice(permissionLock, epochLock).includes("for share of p;"));
  assert.ok(claim.slice(epochLock, mandateLock).includes("for share;"));
  assert.ok(claim.slice(mandateLock, replayCommandLock).includes("m.mandate_id = any(v_command.mandate_ids)"));
  const replay = claim.slice(replayCommandLock);
  assert.ok(replay.includes("c.state = 'pending'"));
  assert.ok(replay.includes("c.lease_token = v_receipt.lease_token"));
  assert.ok(replay.includes("c.lease_until > clock_timestamp()"));
  assert.ok(replay.includes("hey_device_command_mandate_is_current"));
  assert.ok(replay.includes("p.status = 'granted'"));
  assert.ok(replay.includes("v_device.capabilities @> jsonb_build_array(c.envelope->>'action')"));
  assert.ok(replay.indexOf("for update;") > replay.indexOf("v_device.capabilities"), "replay must revalidate and lock the current command after authorization locks");
  assert.ok(claim.includes("v_claim := public.claim_hey_device_command(p_account_id, p_device_id, p_lease_ms)"), "first-time claims still use the private legacy routine");
  assert.ok(claim.includes("insert into public.hey_device_command_claim_receipts"));
  assert.ok(sql.includes("revoke all on function public.claim_hey_device_command(uuid, uuid, text, integer, text) from public, anon, authenticated;"));
  assert.ok(sql.includes("grant execute on function public.claim_hey_device_command(uuid, uuid, text, integer, text) to service_role;"));
  assert.ok(!/grant execute on function public\.claim_hey_device_command\([^;]+\) to [^;]*authenticated/i.test(sql));
});
