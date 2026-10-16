import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { classifyDeviceTransportRequest, createDeviceTransportRequestScope, createDeviceTransportResponseHeaders, digestDeviceCredential, handleDeviceTransport, issueDeviceCredential, normalizeAccountDeviceRequest, normalizeTransportRequest, resolveDeviceTransportCorsOrigin, revokeOwnedDeviceTransport } from "../supabase/functions/hey-device-transport/dispatch.js";

const accountId = "2e4a81a4-2da8-4ae0-bfd6-719484a37795";
const otherAccountId = "10e7b9e4-765b-4e88-b5d4-5eafc0f39f40";
const deviceId = "67337f11-57da-4c23-a41f-fc19d1995b61";
const otherDeviceId = "87337f11-57da-4c23-a41f-fc19d1995b61";
const commandId = "6cc95d2f-b37c-4d99-a6d6-3c59eb9126fb";
const leaseToken = "1b8473f4-b50d-4a04-9834-7e5b446c07b4";

function transportCredentialStore(authenticate, consumeRateLimit = async () => true) {
  return { authenticate, consumeRateLimit };
}

async function credential() {
  const result = await issueDeviceCredential({
    authenticatedAccountId: accountId,
    deviceId,
    loadDevice: async () => ({ id: deviceId, user_id: accountId, status: "online" }),
    credentialStore: { async rotate(_account, _device, hash) { assert.match(hash, /^[0-9a-f]{64}$/); return true; } },
  });
  assert.equal(result.ok, true);
  return result.credential;
}

test("Edge request scope aborts stalled work at its deadline and on client cancellation", async () => {
  let pendingSignal;
  const deadline = createDeviceTransportRequestScope({ timeoutMs: 100 });
  pendingSignal = deadline.signal;
  try {
    await assert.rejects(deadline.race(new Promise(() => {})), (error) => error.code === "DEVICE_TRANSPORT_TIMEOUT");
    assert.equal(pendingSignal.aborted, true);
    assert.equal(deadline.timedOut(), true);
    assert.equal(deadline.callerAborted(), false);
  } finally { deadline.dispose(); }

  const caller = new AbortController();
  const cancelled = createDeviceTransportRequestScope({ signal: caller.signal, timeoutMs: 60_000 });
  try {
    const pending = cancelled.race(new Promise(() => {}));
    caller.abort();
    await assert.rejects(pending, (error) => error.code === "DEVICE_TRANSPORT_ABORTED" && error.name === "AbortError");
    assert.equal(cancelled.signal.aborted, true);
    assert.equal(cancelled.callerAborted(), true);
    assert.equal(cancelled.timedOut(), false);
  } finally { cancelled.dispose(); }

  assert.throws(() => createDeviceTransportRequestScope({ timeoutMs: 60_001 }), /timeout must be between/);
});

test("Edge handler binds Supabase fetches and request work to one deadline scope", async () => {
  const source = await readFile(new URL("../supabase/functions/hey-device-transport/index.ts", import.meta.url), "utf8");
  assert.match(source, /createDeviceTransportRequestScope\(\{ signal: request\.signal \}\)/);
  assert.match(source, /readBoundedJson\(request, 8 \* 1024, scope\.signal\)/);
  assert.match(source, /fetch\(input, \{ \.\.\.init, signal: scope\.signal \}\)/);
  assert.match(source, /scope\.race\(userClient\.auth\.getUser\(\)\)/);
  assert.match(source, /scope\.race\(handleDeviceTransport\(/);
  assert.match(source, /finally \{\s*scope\.dispose\(\)/);
});

test("transport CORS accepts configured and verified Tauri origins but rejects other origins", async () => {
  const appOrigin = "https://hey.example";
  assert.equal(resolveDeviceTransportCorsOrigin(null, appOrigin), appOrigin);
  assert.equal(resolveDeviceTransportCorsOrigin(appOrigin, appOrigin), appOrigin);
  assert.equal(resolveDeviceTransportCorsOrigin("http://tauri.localhost", appOrigin), "http://tauri.localhost");
  assert.equal(resolveDeviceTransportCorsOrigin("tauri://localhost", appOrigin), "tauri://localhost");
  assert.equal(resolveDeviceTransportCorsOrigin("https://attacker.example", appOrigin), null);
  const headers = createDeviceTransportResponseHeaders("tauri://localhost", appOrigin);
  assert.equal(headers["Access-Control-Allow-Origin"], "tauri://localhost");
  assert.equal(headers["Cache-Control"], "no-store");
  const source = await readFile(new URL("../supabase/functions/hey-device-transport/index.ts", import.meta.url), "utf8");
  assert.match(source, /createDeviceTransportResponseHeaders\(origin, allowedOrigin\)/);
  assert.match(source, /headers: corsHeaders\(origin\)/);
  assert.match(source, /const reply = \(status: number, body: Record<string, unknown>\) => json\(status, body, origin\)/);
});

test("transport request contract remains claim, renew, ack and fail", () => {
  assert.ok(normalizeTransportRequest({ operation: "claim", deviceId, idempotencyKey: "claim-1", leaseMs: 1000 }));
  assert.ok(normalizeTransportRequest({ operation: "claim", deviceId, idempotencyKey: "claim-default" }));
  assert.equal(normalizeTransportRequest({ operation: "claim", deviceId, idempotencyKey: "claim-too-short", leaseMs: 999 }), null);
  assert.equal(normalizeTransportRequest({ operation: "claim", deviceId, idempotencyKey: "claim-too-short", leaseMs: 1 }), null);
  assert.equal(normalizeTransportRequest({ operation: "claim", deviceId, leaseMs: 1000 }), null);
  assert.ok(normalizeTransportRequest({ operation: "renew", deviceId, commandId, leaseToken, idempotencyKey: "renew", leaseMs: 1000 }));
  assert.ok(normalizeTransportRequest({ operation: "ack", deviceId, commandId, leaseToken }));
  assert.ok(normalizeTransportRequest({ operation: "fail", deviceId, commandId, leaseToken }));
  assert.equal(normalizeTransportRequest({ operation: "begin", deviceId, commandId, leaseToken }), null);
  assert.equal(normalizeTransportRequest({ operation: "complete", deviceId, commandId, leaseToken }), null);
});

test("device credentials avoid account JWT lookup while account mutations remain account-authenticated", async () => {
  for (const body of [
    { operation: "claim", deviceId, idempotencyKey: "claim-1" },
    { operation: "renew", deviceId, commandId, leaseToken, idempotencyKey: "renew" },
    { operation: "ack", deviceId, commandId, leaseToken },
    { operation: "fail", deviceId, commandId, leaseToken },
  ]) assert.equal(classifyDeviceTransportRequest(body).kind, "device");
  for (const operation of ["rotate", "revoke"]) {
    assert.equal(classifyDeviceTransportRequest({ operation, deviceId }).kind, "account");
  }
  for (const operation of ["begin", "complete", "unknown"]) {
    assert.equal(classifyDeviceTransportRequest({ operation, deviceId, commandId, leaseToken }).kind, "invalid");
  }

  const source = await readFile(new URL("../supabase/functions/hey-device-transport/index.ts", import.meta.url), "utf8");
  assert.match(source, /if \(classification\.kind === "account"\) \{[\s\S]*?scope\.race\(userClient\.auth\.getUser\(\)\)/);
  assert.equal((source.match(/auth\.getUser\(\)/g) || []).length, 1);
});

test("credential rotation is owner-bound, one-time, random and persists only a digest", async () => {
  const saved = [];
  const deps = {
    authenticatedAccountId: accountId,
    deviceId,
    loadDevice: async () => ({ id: deviceId, user_id: accountId, status: "online" }),
    credentialStore: { async rotate(...args) { saved.push(args); return true; } },
  };
  const first = await issueDeviceCredential(deps);
  const second = await issueDeviceCredential(deps);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.match(first.credential, /^heydev1\.[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.credential, second.credential);
  assert.equal(saved.length, 2);
  assert.equal(saved[0][0], accountId);
  assert.equal(saved[0][1], deviceId);
  assert.equal(saved[0][2], await digestDeviceCredential(first.credential));
  assert.equal(JSON.stringify(saved).includes(first.credential), false);

  for (const device of [null, { id: deviceId, user_id: otherAccountId, status: "online" }, { id: deviceId, user_id: accountId, status: "revoked" }, { id: deviceId, user_id: accountId, status: "pending" }, { id: deviceId, user_id: accountId, status: "unknown" }]) {
    const denied = await issueDeviceCredential({ ...deps, loadDevice: async () => device });
    assert.equal(denied.ok, false);
  }
  assert.equal(saved.length, 2);
});

test("credential rotation store failures are sanitized and never return a credential", async () => {
  const result = await issueDeviceCredential({
    authenticatedAccountId: accountId,
    deviceId,
    loadDevice: async () => ({ id: deviceId, user_id: accountId, status: "online" }),
    credentialStore: { async rotate() { throw new Error("private database credential-store detail"); } },
  });
  assert.deepEqual(result, { ok: false, reason: "Device credential service is unavailable." });
  assert.equal(Object.hasOwn(result, "credential"), false);
  assert.equal(JSON.stringify(result).includes("private database"), false);
});

test("transport binds claim, acknowledgement and failure to authenticated device identity", async () => {
  const token = await credential();
  const digest = await digestDeviceCredential(token);
  const credentialStore = transportCredentialStore(async (received) => { assert.equal(received, digest); return { accountId, deviceId, active: true }; });
  const calls = [];
  const queue = {
    async claimNext(...args) { calls.push(["claim", ...args]); return { commandId, envelope: { action: "computer.open_url" }, leaseToken }; },
    async renewLease(...args) { calls.push(["renew", ...args]); return { renewed: true, leaseUntil: Date.parse("2026-10-15T10:00:30.000Z"), idempotent: true }; },
    async acknowledge(...args) { calls.push(["ack", ...args]); return true; },
    async recordFailure(...args) { calls.push(["fail", ...args]); return true; },
  };
  assert.deepEqual(await handleDeviceTransport({ authorization: `Bearer ${token}`, body: { operation: "claim", deviceId, idempotencyKey: "claim-1", leaseMs: 10_000 }, credentialStore, queue }), {
    ok: true, status: 200, claim: { commandId, envelope: { action: "computer.open_url" }, leaseToken },
  });
  assert.deepEqual(await handleDeviceTransport({ authorization: `Bearer ${token}`, body: { operation: "renew", deviceId, commandId, leaseToken, idempotencyKey: "renew-one", leaseMs: 10_000 }, credentialStore, queue }), {
    ok: true, status: 200, renewal: { renewed: true, leaseUntil: Date.parse("2026-10-15T10:00:30.000Z"), idempotent: true },
  });
  assert.deepEqual(await handleDeviceTransport({ authorization: `Bearer ${token}`, body: { operation: "ack", deviceId, commandId, leaseToken }, credentialStore, queue }), { ok: true, status: 200, accepted: true });
  assert.deepEqual(await handleDeviceTransport({ authorization: `Bearer ${token}`, body: { operation: "fail", deviceId, commandId, leaseToken }, credentialStore, queue }), { ok: true, status: 200, accepted: true });
  assert.deepEqual(calls, [
    ["claim", accountId, deviceId, "claim-1", 10_000, digest],
    ["renew", accountId, deviceId, commandId, leaseToken, "renew-one", 10_000, digest],
    ["ack", accountId, deviceId, commandId, leaseToken, digest],
    ["fail", accountId, deviceId, commandId, leaseToken, digest],
  ]);
});

test("exhausted or unavailable durable rate limits deny before touching the device queue", async () => {
  const token = await credential();
  const digest = await digestDeviceCredential(token);
  let queueCalls = 0;
  const queue = { async claimNext() { queueCalls += 1; return null; } };
  const exhausted = transportCredentialStore(
    async () => ({ accountId, deviceId, active: true }),
    async (receivedDevice, receivedDigest) => {
      assert.equal(receivedDevice, deviceId);
      assert.equal(receivedDigest, digest);
      return false;
    },
  );
  assert.deepEqual(await handleDeviceTransport({
    authorization: `Bearer ${token}`,
    body: { operation: "claim", deviceId, idempotencyKey: "claim-rate-limit" },
    credentialStore: exhausted,
    queue,
  }), { ok: false, status: 429, reason: "Device transport request limit reached." });
  assert.equal(queueCalls, 0);

  const unavailable = transportCredentialStore(async () => ({ accountId, deviceId, active: true }), async () => { throw new Error("private RPC detail"); });
  const failedClosed = await handleDeviceTransport({
    authorization: `Bearer ${token}`,
    body: { operation: "claim", deviceId, idempotencyKey: "claim-rate-limit-unavailable" },
    credentialStore: unavailable,
    queue,
  });
  assert.equal(failedClosed.status, 503);
  assert.equal(JSON.stringify(failedClosed).includes("private RPC detail"), false);
  assert.equal(queueCalls, 0);

  const noLimiter = await handleDeviceTransport({
    authorization: `Bearer ${token}`,
    body: { operation: "claim", deviceId, idempotencyKey: "claim-no-limiter" },
    credentialStore: { async authenticate() { return { accountId, deviceId, active: true }; } },
    queue,
  });
  assert.equal(noLimiter.status, 503);
  assert.equal(queueCalls, 0);
});

test("durable transport limiter is credential-fenced, bounded, private, and service-only", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261016000800_device_transport_rate_limit.sql", import.meta.url), "utf8");
  const edge = await readFile(new URL("../supabase/functions/hey-device-transport/index.ts", import.meta.url), "utf8");
  assert.match(sql, /request_count integer not null check \(request_count between 1 and 120\)/i);
  assert.match(sql, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
  assert.match(sql, /d\.status in \('online', 'offline'\) for update/i);
  assert.match(sql, /c\.secret_hash = p_secret_hash and c\.revoked_at is null for update/i);
  assert.match(sql, /request_count < 120/i);
  assert.match(sql, /window_started_at <= v_now - interval '1 minute'/i);
  assert.match(sql, /revoke all on public\.hey_device_transport_rate_limits from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function public\.consume_hey_device_transport_rate_limit\(uuid, text\) to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.consume_hey_device_transport_rate_limit\([^;]+\) to [^;]*authenticated/i);
  assert.match(edge, /rpc\("consume_hey_device_transport_rate_limit"/i);
  assert.match(edge, /async consumeRateLimit\(deviceId: string, secretHash: string\)/);
});

test("a committed failure report can be retried with the same account, device, lease and credential digest", async () => {
  const token = await credential();
  const digest = await digestDeviceCredential(token);
  const calls = [];
  let committedTransitions = 0;
  const credentialStore = transportCredentialStore(async (received) => { assert.equal(received, digest); return { accountId, deviceId, active: true }; });
  const queue = {
    async recordFailure(...args) {
      calls.push(args);
      if (args[0] !== accountId || args[1] !== deviceId || args[2] !== commandId || args[3] !== leaseToken || args[4] !== digest) return false;
      if (committedTransitions === 0) committedTransitions += 1;
      return true;
    },
  };
  const body = { operation: "fail", deviceId, commandId, leaseToken };
  const first = await handleDeviceTransport({ authorization: `Bearer ${token}`, body, credentialStore, queue });
  const replay = await handleDeviceTransport({ authorization: `Bearer ${token}`, body, credentialStore, queue });
  assert.deepEqual(first, { ok: true, status: 200, accepted: true });
  assert.deepEqual(replay, first, "a lost response retry must be reported as accepted after the receipt lookup");
  assert.equal(committedTransitions, 1, "replay must not apply the retry/backoff transition twice");
  assert.deepEqual(calls, [
    [accountId, deviceId, commandId, leaseToken, digest],
    [accountId, deviceId, commandId, leaseToken, digest],
  ]);
});

test("credential rotation or revocation between authentication and dispatch is fenced at the queue call", async () => {
  const token = await credential();
  const authenticatedDigest = await digestDeviceCredential(token);
  let currentDigest = authenticatedDigest;
  const queueCalls = [];
  const queue = {
    async claimNext(...args) { queueCalls.push(["claim", ...args]); return args[4] === currentDigest ? { commandId } : null; },
    async renewLease(...args) { queueCalls.push(["renew", ...args]); return { renewed: args[6] === currentDigest }; },
    async acknowledge(...args) { queueCalls.push(["ack", ...args]); return args[4] === currentDigest; },
    async recordFailure(...args) { queueCalls.push(["fail", ...args]); return args[4] === currentDigest; },
  };
  const credentialStore = transportCredentialStore(async (received) => {
      assert.equal(received, authenticatedDigest);
      currentDigest = "f".repeat(64); // Simulate rotation after auth reads the old digest.
      return { accountId, deviceId, active: true };
  });
  const racingOperations = [
    { body: { operation: "claim", deviceId, idempotencyKey: "claim-race", leaseMs: 10_000 }, expected: { status: 200, claim: null } },
    { body: { operation: "renew", deviceId, commandId, leaseToken, idempotencyKey: "renew-race", leaseMs: 10_000 }, expected: { status: 409, renewal: { renewed: false } } },
    { body: { operation: "ack", deviceId, commandId, leaseToken }, expected: { status: 409, accepted: false } },
    { body: { operation: "fail", deviceId, commandId, leaseToken }, expected: { status: 409, accepted: false } },
  ];
  for (const { body, expected } of racingOperations) {
    const response = await handleDeviceTransport({ authorization: `Bearer ${token}`, body, credentialStore, queue });
    assert.equal(response.status, expected.status);
    if (Object.hasOwn(expected, "claim")) assert.equal(response.claim, expected.claim);
    if (Object.hasOwn(expected, "renewal")) assert.equal(response.renewal.renewed, expected.renewal.renewed);
    if (Object.hasOwn(expected, "accepted")) assert.equal(response.accepted, expected.accepted);
  }
  assert.equal(queueCalls.length, 4);
  assert.ok(queueCalls.every((call) => call.at(-1) === authenticatedDigest), "each atomic RPC receives the digest authenticated earlier");
  assert.deepEqual(queueCalls.map((call) => call[0]), ["claim", "renew", "ack", "fail"]);
});

test("malformed, spoofed, revoked and mismatched credentials fail before queue access", async () => {
  const token = await credential();
  let queueCalls = 0;
  const queue = { async claimNext() { queueCalls += 1; return null; } };
  const goodStore = transportCredentialStore(async () => ({ accountId, deviceId, active: true }));
  assert.equal(normalizeTransportRequest({ operation: "claim", deviceId, idempotencyKey: "claim-1", leaseMs: 300_001 }), null);
  assert.equal(normalizeTransportRequest({ operation: "claim", deviceId, idempotencyKey: "" }), null);
  assert.equal(normalizeTransportRequest({ operation: "renew", deviceId, commandId, leaseToken, idempotencyKey: "renew", leaseMs: 300_001 }), null);
  assert.equal(normalizeTransportRequest({ operation: "renew", deviceId, commandId, leaseToken, idempotencyKey: "" }), null);
  const accessorRequest = { operation: "claim", deviceId, idempotencyKey: "claim-1" };
  let getterCalls = 0;
  Object.defineProperty(accessorRequest, "leaseMs", { enumerable: true, get() { getterCalls += 1; return 30_000; } });
  assert.equal(normalizeTransportRequest(accessorRequest), null);
  assert.equal(getterCalls, 0);
  const hostileProxy = new Proxy({}, { ownKeys() { throw new Error("hostile request proxy"); } });
  assert.equal(normalizeTransportRequest(hostileProxy), null);
  for (const auth of ["Bearer service-role-secret", `Bearer ${token} trailing`, "Bearer "]) {
    assert.equal((await handleDeviceTransport({ authorization: auth, body: { operation: "claim", deviceId, idempotencyKey: "claim-1" }, credentialStore: goodStore, queue })).ok, false);
  }
  for (const identity of [
    null,
    { accountId, deviceId: otherDeviceId, active: true },
    { accountId, deviceId, active: false },
  ]) {
    const result = await handleDeviceTransport({ authorization: `Bearer ${token}`, body: { operation: "claim", deviceId, idempotencyKey: "claim-1" }, credentialStore: transportCredentialStore(async () => identity), queue });
    assert.equal(result.status, 401);
  }
  assert.equal((await handleDeviceTransport({ authorization: `Bearer ${token}`, body: { operation: "claim", deviceId, idempotencyKey: "claim-1", accountId: otherAccountId }, credentialStore: goodStore, queue })).status, 400);
  assert.equal((await handleDeviceTransport({ authorization: `Bearer ${token}`, body: { operation: "claim", deviceId, idempotencyKey: "claim-1" }, credentialStore: transportCredentialStore(async () => null), queue })).status, 401);
  assert.equal(queueCalls, 0);
  assert.equal((await digestDeviceCredential("bad-token")), null);
});

test("account stop request snapshots only operation/device and atomically delegates owner scope to the trusted RPC", async () => {
  assert.deepEqual(normalizeAccountDeviceRequest({ operation: "revoke", deviceId }), { operation: "revoke", deviceId });
  assert.equal(normalizeAccountDeviceRequest({ operation: "revoke", deviceId, accountId: otherAccountId }), null);
  assert.equal(normalizeAccountDeviceRequest({ operation: "revoke", deviceId: "bad" }), null);
  const hostile = new Proxy({}, { ownKeys() { throw new Error("hostile stop request"); } });
  assert.equal(normalizeAccountDeviceRequest(hostile), null);

  const calls = [];
  const stop = await revokeOwnedDeviceTransport({
    authenticatedAccountId: accountId,
    deviceId,
    revokeDevice: async (...args) => { calls.push(args); return true; },
  });
  assert.deepEqual(stop, { ok: true, status: 200, revoked: true });
  assert.deepEqual(calls, [[accountId, deviceId]], "the client cannot provide the account scope");

  const notOwner = await revokeOwnedDeviceTransport({ authenticatedAccountId: accountId, deviceId, revokeDevice: async () => false });
  assert.deepEqual(notOwner, { ok: false, status: 404, reason: "The requested device is unavailable for this account." });
  const outage = await revokeOwnedDeviceTransport({ authenticatedAccountId: accountId, deviceId, revokeDevice: async () => { throw new Error("private service-role details"); } });
  assert.equal(outage.status, 503);
  assert.equal(JSON.stringify(outage).includes("private service-role"), false);
  assert.equal((await revokeOwnedDeviceTransport({ authenticatedAccountId: otherAccountId, deviceId })).status, 400);
});

test("credential migration stores only hashes, requires trusted service role and revokes on device revocation", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261015000200_device_transport_credentials.sql", import.meta.url), "utf8");
  assert.match(sql, /secret_hash text not null unique check \(secret_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/i);
  assert.match(sql, /foreign key \(device_id, account_id\) references public\.hey_devices\(id, user_id\)/i);
  assert.equal((sql.match(/coalesce\(auth\.role\(\), ''\) <> 'service_role'/gi) || []).length, 6);
  assert.match(sql, /where d\.id = p_device_id and d\.user_id = p_account_id and d\.status <> 'revoked'/i);
  assert.match(sql, /c\.secret_hash = p_secret_hash and c\.revoked_at is null and d\.status <> 'revoked'/i);
  assert.match(sql, /update public\.hey_device_credentials set revoked_at = clock_timestamp\(\)/i);
  assert.match(sql, /create trigger hey_permissions_cancel_device_commands[\s\S]*after update of status or delete/i);
  assert.match(sql, /p\.permission = c\.envelope->>'action' and p\.scope = 'account' and p\.status = 'granted'/i);
  assert.match(sql, /d\.capabilities @> jsonb_build_array\(c\.envelope->>'action'\)/i);
  assert.match(sql, /state = 'cancelled', lease_token = null, lease_until = null[\s\S]*c\.envelope->>'action' = v_permission/i);
  assert.match(sql, /create trigger hey_devices_cancel_unsupported_commands[\s\S]*after update of capabilities/i);
  assert.match(sql, /create or replace function public\.revoke_hey_device_transport\(p_account_id uuid, p_device_id uuid\)[\s\S]*?where d\.id = p_device_id and d\.user_id = p_account_id[\s\S]*?for update/i);
  assert.match(sql, /update public\.hey_devices set status = 'revoked'[\s\S]*update public\.hey_device_credentials set revoked_at = coalesce\(revoked_at, clock_timestamp\(\)\)[\s\S]*update public\.hey_device_commands set state = 'cancelled', lease_token = null, lease_until = null[\s\S]*state = 'pending'/i);
  assert.match(sql, /grant execute on function public\.revoke_hey_device_transport\(uuid, uuid\) to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.revoke_hey_device_transport\([^;]+\) to [^;]*authenticated/i);
  assert.match(sql, /grant execute on function public\.rotate_hey_device_credential\(uuid, uuid, text\) to service_role/i);
  assert.match(sql, /grant execute on function public\.authenticate_hey_device_credential\(text\) to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.(?:rotate|authenticate)_hey_device_credential\([^;]+\) to [^;]*authenticated/i);
  assert.doesNotMatch(sql, /credential text|secret text|token text/i);
});

test("pending or unknown device states cannot rotate or authenticate transport credentials", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20261016000000_fail_closed_device_transport_status.sql", import.meta.url), "utf8");
  assert.match(migration, /d\.status in \('online', 'offline'\)/i);
  assert.equal((migration.match(/d\.status in \('online', 'offline'\)/gi) || []).length, 2);
  assert.match(migration, /grant execute on function public\.rotate_hey_device_credential\(uuid, uuid, text\) to service_role/i);
  assert.match(migration, /grant execute on function public\.authenticate_hey_device_credential\(text\) to service_role/i);
  assert.doesNotMatch(migration, /grant execute on function public\.(?:rotate|authenticate)_hey_device_credential\([^;]+\) to [^;]*authenticated/i);

  let rotationCalls = 0;
  for (const status of ["pending", "revoked", "unknown"]) {
    const denied = await issueDeviceCredential({
      authenticatedAccountId: accountId,
      deviceId,
      loadDevice: async () => ({ id: deviceId, user_id: accountId, status }),
      credentialStore: { async rotate() { rotationCalls += 1; return true; } },
    });
    assert.equal(denied.ok, false);
    assert.equal(Object.hasOwn(denied, "credential"), false);
  }
  assert.equal(rotationCalls, 0);

  const token = await credential();
  let queueCalls = 0;
  const result = await handleDeviceTransport({
    authorization: `Bearer ${token}`,
    body: { operation: "claim", deviceId, idempotencyKey: "claim-1" },
    credentialStore: transportCredentialStore(async () => null),
    queue: { async claimNext() { queueCalls += 1; return null; } },
  });
  assert.equal(result.status, 401);
  assert.equal(queueCalls, 0);
});

test("edge stop route authenticates the account JWT and never accepts caller-supplied account scope", async () => {
  const edge = await readFile(new URL("../supabase/functions/hey-device-transport/index.ts", import.meta.url), "utf8");
  assert.match(edge, /userClient\.auth\.getUser\(\)/);
  assert.match(edge, /const accountRequest = classification\.kind === "account" \? classification\.request : null/);
  assert.match(edge, /revokeOwnedDeviceTransport\(\{\s*authenticatedAccountId: accountId,[\s\S]*?deviceId: accountRequest\.deviceId/);
  assert.match(edge, /rpc\("revoke_hey_device_transport", \{ p_account_id: userId, p_device_id: deviceId \}\)/);
});

test("device transport disables gateway JWT verification because it verifies JWTs or device secrets itself", async () => {
  const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");
  assert.match(config, /\[functions\.hey-device-transport\][\s\S]*?verify_jwt = false/i);
});
