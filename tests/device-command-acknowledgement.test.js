import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SupabaseDeviceCommandQueueStore } from "../src/core/supabaseDeviceCommandQueueStore.js";

const accountId = "2e4a81a4-2da8-4ae0-bfd6-719484a37795";
const otherAccountId = "10e7b9e4-765b-4e88-b5d4-5eafc0f39f40";
const deviceId = "67337f11-57da-4c23-a41f-fc19d1995b61";
const commandId = "6cc95d2f-b37c-4d99-a6d6-3c59eb9126fb";
const leaseToken = "1b8473f4-b50d-4a04-9834-7e5b446c07b4";
const credentialHash = "a".repeat(64);

test("queue adapter passes exact ack scope and preserves idempotent RPC results", async () => {
  const calls = [];
  const replies = [true, true, false];
  const queue = new SupabaseDeviceCommandQueueStore({
    async rpc(name, params) {
      calls.push({ name, params });
      return { data: replies.shift(), error: null };
    },
  }, { trustedServer: true });

  assert.equal(await queue.acknowledge(accountId, deviceId, commandId, leaseToken, credentialHash), true);
  assert.equal(await queue.acknowledge(accountId, deviceId, commandId, leaseToken, credentialHash), true, "same lease retry is accepted by the atomic RPC");
  assert.equal(await queue.acknowledge(otherAccountId, deviceId, commandId, leaseToken, credentialHash), false);
  assert.deepEqual(calls, [
    { name: "ack_hey_device_command", params: { p_account_id: accountId, p_device_id: deviceId, p_command_id: commandId, p_lease_token: leaseToken, p_credential_hash: credentialHash } },
    { name: "ack_hey_device_command", params: { p_account_id: accountId, p_device_id: deviceId, p_command_id: commandId, p_lease_token: leaseToken, p_credential_hash: credentialHash } },
    { name: "ack_hey_device_command", params: { p_account_id: otherAccountId, p_device_id: deviceId, p_command_id: commandId, p_lease_token: leaseToken, p_credential_hash: credentialHash } },
  ]);
});

test("ack migration requires a live exact lease for first transition and denies stale or revoked retries", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261015000300_idempotent_device_command_acknowledgement.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists acknowledged_lease_token uuid/i);
  assert.match(sql, /c\.id = p_command_id and c\.account_id = p_account_id and c\.device_id = p_device_id[\s\S]*c\.state = 'pending' and c\.lease_token = p_lease_token and c\.lease_until > clock_timestamp\(\)/i);
  assert.match(sql, /d\.status <> 'revoked' and d\.capabilities @> jsonb_build_array\(c\.envelope->>'action'\)/i);
  assert.match(sql, /p\.permission = c\.envelope->>'action' and p\.scope = 'account' and p\.status = 'granted'/i);
  assert.match(sql, /c\.state = 'acknowledged' and c\.acknowledged_lease_token = p_lease_token/i);
  assert.match(sql, /select exists \([\s\S]*c\.id = p_command_id and c\.account_id = p_account_id and c\.device_id = p_device_id/i);
  const retryBlock = sql.slice(sql.indexOf("-- Idempotent retry"), sql.indexOf("return v_acknowledged;"));
  assert.match(retryBlock, /c\.state = 'acknowledged' and c\.acknowledged_lease_token = p_lease_token/i);
  assert.match(retryBlock, /d\.status <> 'revoked' and d\.capabilities @> jsonb_build_array\(c\.envelope->>'action'\)/i);
  assert.match(retryBlock, /p\.permission = c\.envelope->>'action' and p\.scope = 'account' and p\.status = 'granted'/i);
  assert.doesNotMatch(retryBlock, /lease_until|clock_timestamp\(\)/i, "a repeat of an already successful ack is idempotent after lease expiry");
  assert.match(sql, /insert into public\.hey_audit_log\(user_id, action, tool, risk_level, status, request_id, metadata\)[\s\S]*'device\.command\.acknowledged'[\s\S]*'acknowledged'[\s\S]*'deviceId'[\s\S]*'commandId'[\s\S]*'pending_to_acknowledged'/i);
  const auditBlock = sql.slice(sql.indexOf("insert into public.hey_audit_log"), sql.indexOf("return true;", sql.indexOf("insert into public.hey_audit_log")));
  assert.doesNotMatch(auditBlock, /envelope|lease_token|credential|last_error/i);
  assert.match(sql, /revoke all on function public\.ack_hey_device_command\(uuid, uuid, uuid, uuid\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.ack_hey_device_command\(uuid, uuid, uuid, uuid\) to service_role/i);
});
