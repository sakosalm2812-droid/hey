import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { digestDeviceCredential, handleDeviceTransport, issueDeviceCredential, normalizeAccountDeviceRequest, normalizeTransportRequest, revokeOwnedDeviceTransport } from "../supabase/functions/hey-device-transport/dispatch.js";

const accountId = "2e4a81a4-2da8-4ae0-bfd6-719484a37795";
const otherAccountId = "10e7b9e4-765b-4e88-b5d4-5eafc0f39f40";
const deviceId = "67337f11-57da-4c23-a41f-fc19d1995b61";
const otherDeviceId = "87337f11-57da-4c23-a41f-fc19d1995b61";
const commandId = "6cc95d2f-b37c-4d99-a6d6-3c59eb9126fb";
const leaseToken = "1b8473f4-b50d-4a04-9834-7e5b446c07b4";

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

  for (const device of [null, { id: deviceId, user_id: otherAccountId, status: "online" }, { id: deviceId, user_id: accountId, status: "revoked" }]) {
    const denied = await issueDeviceCredential({ ...deps, loadDevice: async () => device });
    assert.equal(denied.ok, false);
  }
  assert.equal(saved.length, 2);
});

test("transport binds claim, acknowledgement and failure to authenticated device identity", async () => {
  const token = await credential();
  const digest = await digestDeviceCredential(token);
  const credentialStore = { async authenticate(received) { assert.equal(received, digest); return { accountId, deviceId, active: true }; } };
  const calls = [];
  const queue = {
    async claimNext(...args) { calls.push(["claim", ...args]); return { commandId, envelope: { action: "computer.open_url" }, leaseToken }; },
    async renewLease(...args) { calls.push(["renew", ...args]); return { renewed: true, leaseUntil: Date.parse("2026-10-15T10:00:30.000Z"), idempotent: true }; },
    async acknowledge(...args) { calls.push(["ack", ...args]); return true; },
    async recordFailure(...args) { calls.push(["fail", ...args]); return true; },
  };
  assert.deepEqual(await handleDeviceTransport({ authorization: `Bearer ${token}`, body: { operation: "claim", deviceId, leaseMs: 10_000 }, credentialStore, queue }), {
    ok: true, status: 200, claim: { commandId, envelope: { action: "computer.open_url" }, leaseToken },
  });
  assert.deepEqual(await handleDeviceTransport({ authorization: `Bearer ${token}`, body: { operation: "renew", deviceId, commandId, leaseToken, idempotencyKey: "renew-one", leaseMs: 10_000 }, credentialStore, queue }), {
    ok: true, status: 200, renewal: { renewed: true, leaseUntil: Date.parse("2026-10-15T10:00:30.000Z"), idempotent: true },
  });
  assert.deepEqual(await handleDeviceTransport({ authorization: `Bearer ${token}`, body: { operation: "ack", deviceId, commandId, leaseToken }, credentialStore, queue }), { ok: true, status: 200, accepted: true });
  assert.deepEqual(await handleDeviceTransport({ authorization: `Bearer ${token}`, body: { operation: "fail", deviceId, commandId, leaseToken }, credentialStore, queue }), { ok: true, status: 200, accepted: true });
  assert.deepEqual(calls, [
    ["claim", accountId, deviceId, 10_000],
    ["renew", accountId, deviceId, commandId, leaseToken, "renew-one", 10_000],
    ["ack", accountId, deviceId, commandId, leaseToken],
    ["fail", accountId, deviceId, commandId, leaseToken],
  ]);
});

test("malformed, spoofed, revoked and mismatched credentials fail before queue access", async () => {
  const token = await credential();
  let queueCalls = 0;
  const queue = { async claimNext() { queueCalls += 1; return null; } };
  const goodStore = { async authenticate() { return { accountId, deviceId, active: true }; } };
  assert.equal(normalizeTransportRequest({ operation: "claim", deviceId, leaseMs: 300_001 }), null);
  assert.equal(normalizeTransportRequest({ operation: "renew", deviceId, commandId, leaseToken, idempotencyKey: "renew", leaseMs: 300_001 }), null);
  assert.equal(normalizeTransportRequest({ operation: "renew", deviceId, commandId, leaseToken, idempotencyKey: "" }), null);
  const accessorRequest = { operation: "claim", deviceId };
  let getterCalls = 0;
  Object.defineProperty(accessorRequest, "leaseMs", { enumerable: true, get() { getterCalls += 1; return 30_000; } });
  assert.equal(normalizeTransportRequest(accessorRequest), null);
  assert.equal(getterCalls, 0);
  const hostileProxy = new Proxy({}, { ownKeys() { throw new Error("hostile request proxy"); } });
  assert.equal(normalizeTransportRequest(hostileProxy), null);
  for (const auth of ["Bearer service-role-secret", `Bearer ${token} trailing`, "Bearer "]) {
    assert.equal((await handleDeviceTransport({ authorization: auth, body: { operation: "claim", deviceId }, credentialStore: goodStore, queue })).ok, false);
  }
  for (const identity of [
    null,
    { accountId, deviceId: otherDeviceId, active: true },
    { accountId, deviceId, active: false },
  ]) {
    const result = await handleDeviceTransport({ authorization: `Bearer ${token}`, body: { operation: "claim", deviceId }, credentialStore: { async authenticate() { return identity; } }, queue });
    assert.equal(result.status, 401);
  }
  assert.equal((await handleDeviceTransport({ authorization: `Bearer ${token}`, body: { operation: "claim", deviceId, accountId: otherAccountId }, credentialStore: goodStore, queue })).status, 400);
  assert.equal((await handleDeviceTransport({ authorization: `Bearer ${token}`, body: { operation: "claim", deviceId }, credentialStore: { async authenticate() { return null; } }, queue })).status, 401);
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

test("edge stop route authenticates the account JWT and never accepts caller-supplied account scope", async () => {
  const edge = await readFile(new URL("../supabase/functions/hey-device-transport/index.ts", import.meta.url), "utf8");
  assert.match(edge, /userClient\.auth\.getUser\(\)/);
  assert.match(edge, /normalizeAccountDeviceRequest\(parsed\.value\)/);
  assert.match(edge, /revokeOwnedDeviceTransport\(\{\s*authenticatedAccountId: accountId,[\s\S]*?deviceId: accountRequest\.deviceId/);
  assert.match(edge, /rpc\("revoke_hey_device_transport", \{ p_account_id: userId, p_device_id: deviceId \}\)/);
  assert.match(edge, /allowedOrigins = new Set\(\[allowedOrigin, "http:\/\/tauri\.localhost", "tauri:\/\/localhost"\]\)/);
  assert.match(edge, /corsHeaders\(origin\)/);
});

test("device transport disables gateway JWT verification because it verifies JWTs or device secrets itself", async () => {
  const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");
  assert.match(config, /\[functions\.hey-device-transport\][\s\S]*?verify_jwt = false/i);
});
