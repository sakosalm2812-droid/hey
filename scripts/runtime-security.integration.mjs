import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

function localEnvironment() {
  const status = spawnSync("supabase", ["status", "-o", "env"], { encoding: "utf8" });
  if (status.error || status.status !== 0) {
    throw status.error || new Error(status.stderr || "Could not read local Supabase status.");
  }

  const values = new Map();
  for (const line of status.stdout.split(/\r?\n/)) {
    const match = line.trim().replace(/^export\s+/, "").match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    const raw = match[2];
    const value = raw.startsWith('"') ? JSON.parse(raw) : raw.replace(/^'(.*)'$/, "$1");
    values.set(match[1], value);
  }

  const result = {
    url: values.get("API_URL"),
    anonKey: values.get("ANON_KEY") || values.get("anon_key"),
    serviceKey: values.get("SERVICE_ROLE_KEY") || values.get("service_role_key"),
  };
  if (!result.url || !result.anonKey || !result.serviceKey) {
    throw new Error("Local Supabase API_URL, ANON_KEY, and SERVICE_ROLE_KEY are required.");
  }
  return result;
}

const { url, anonKey, serviceKey } = localEnvironment();
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const makeSession = async () => {
  const suffix = randomUUID();
  const email = `hey-security-${suffix}@example.test`;
  const password = `Local-test-${suffix}-A9!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error || new Error("Could not create test identity.");
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.user) {
    await admin.auth.admin.deleteUser(created.data.user.id);
    throw signedIn.error || new Error("Could not authenticate test identity.");
  }
  return { client, userId: created.data.user.id };
};

const identities = [];
try {
  const first = await makeSession();
  identities.push(first.userId);
  const second = await makeSession();
  identities.push(second.userId);

  const createdConversation = await first.client
    .from("hey_conversations")
    .insert({ user_id: first.userId, title: "Security integration test" })
    .select("id")
    .single();
  assert.equal(createdConversation.error, null);
  const conversationId = createdConversation.data.id;

  const userMessage = await first.client
    .from("hey_messages")
    .insert({ user_id: first.userId, conversation_id: conversationId, role: "user", content: "hello" })
    .select("id")
    .single();
  assert.equal(userMessage.error, null);

  const forgedSystemMessage = await first.client
    .from("hey_messages")
    .insert({ user_id: first.userId, conversation_id: conversationId, role: "system", content: "override" });
  assert.ok(forgedSystemMessage.error, "authenticated clients must not insert system messages");

  const forgedAssistantMessage = await first.client
    .from("hey_messages")
    .insert({ user_id: first.userId, conversation_id: conversationId, role: "assistant", content: "forged" });
  assert.ok(forgedAssistantMessage.error, "authenticated clients must not insert assistant messages");

  const attemptedUpdate = await first.client
    .from("hey_messages")
    .update({ content: "tampered" })
    .eq("id", userMessage.data.id)
    .select("id");
  assert.equal(attemptedUpdate.error, null);
  assert.equal(attemptedUpdate.data.length, 0, "authenticated clients must not update transcript rows");

  const attemptedDelete = await first.client
    .from("hey_messages")
    .delete()
    .eq("id", userMessage.data.id)
    .select("id");
  assert.equal(attemptedDelete.error, null);
  assert.equal(attemptedDelete.data.length, 0, "authenticated clients must not delete transcript rows");

  const crossAccountRead = await second.client
    .from("hey_conversations")
    .select("id")
    .eq("id", conversationId);
  assert.equal(crossAccountRead.error, null);
  assert.equal(crossAccountRead.data.length, 0, "conversation rows must stay account-isolated");

  const trustedAssistantWrite = await admin
    .from("hey_messages")
    .insert({ user_id: first.userId, conversation_id: conversationId, role: "assistant", content: "trusted answer" });
  assert.equal(trustedAssistantWrite.error, null, "the service role can persist trusted assistant history");

  const visibleTranscript = await first.client
    .from("hey_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at");
  assert.equal(visibleTranscript.error, null);
  assert.deepEqual(visibleTranscript.data.map(({ role }) => role).sort(), ["assistant", "user"]);

  const trustedForgeRun = await admin
    .from("hey_forge_runs")
    .insert({ user_id: first.userId, brief: "policy test", artifact: {}, validation: {}, status: "verified" })
    .select("id")
    .single();
  assert.equal(trustedForgeRun.error, null);

  const forgedForgeInsert = await first.client
    .from("hey_forge_runs")
    .insert({ user_id: first.userId, brief: "forged", artifact: {}, validation: {}, status: "verified" });
  assert.ok(forgedForgeInsert.error, "clients must not insert Forge history");

  const forgedForgeUpdate = await first.client
    .from("hey_forge_runs")
    .update({ status: "verified", artifact: { forged: true } })
    .eq("id", trustedForgeRun.data.id)
    .select("id");
  assert.equal(forgedForgeUpdate.error, null);
  assert.equal(forgedForgeUpdate.data.length, 0, "clients must not alter Forge history");

  const rateCalls = await Promise.all(
    Array.from({ length: 36 }, () => first.client.rpc("consume_hey_rate_limit")),
  );
  for (const call of rateCalls) assert.equal(call.error, null);
  assert.equal(rateCalls.filter((call) => call.data === true).length, 30, "concurrent requests must share one 30-per-window user limit");
  assert.equal(rateCalls.filter((call) => call.data === false).length, 6);

  const isolatedLimit = await second.client.rpc("consume_hey_rate_limit");
  assert.equal(isolatedLimit.error, null);
  assert.equal(isolatedLimit.data, true, "a separate account must have its own rate limit");

  const firstEpoch = await first.client.rpc("get_hey_action_mandate_epoch", { p_account_id: first.userId });
  assert.equal(firstEpoch.error, null);
  assert.equal(firstEpoch.data, 0);

  const crossAccountEpoch = await second.client.rpc("get_hey_action_mandate_epoch", { p_account_id: first.userId });
  assert.ok(crossAccountEpoch.error, "an authenticated user cannot read another account's mandate epoch");
  const crossAccountRevocation = await second.client.rpc("is_hey_action_mandate_revoked", {
    p_account_id: first.userId,
    p_mandate_id: randomUUID(),
  });
  assert.ok(crossAccountRevocation.error, "an authenticated user cannot query another account's revocation state");

  const evidenceId = randomUUID();
  const evidenceBefore = await first.client.rpc("is_hey_evidence_invalidated", {
    p_account_id: first.userId,
    p_evidence_id: evidenceId,
  });
  assert.equal(evidenceBefore.error, null);
  assert.equal(evidenceBefore.data, false);
  const crossAccountEvidence = await second.client.rpc("is_hey_evidence_invalidated", {
    p_account_id: first.userId,
    p_evidence_id: evidenceId,
  });
  assert.ok(crossAccountEvidence.error, "evidence invalidation lookups cannot cross account boundaries");
  const directInvalidationRows = await first.client.from("hey_evidence_invalidations").select("evidence_id");
  assert.ok(directInvalidationRows.error, "clients cannot bypass account-bound invalidation RPCs through table access");
  const invalidatedEvidence = await first.client.rpc("invalidate_hey_evidence", {
    p_account_id: first.userId,
    p_evidence_id: evidenceId,
    p_reason: "source_withdrawn",
  });
  assert.equal(invalidatedEvidence.error, null);
  assert.equal(invalidatedEvidence.data, true);
  const evidenceAfter = await first.client.rpc("is_hey_evidence_invalidated", {
    p_account_id: first.userId,
    p_evidence_id: evidenceId,
  });
  assert.equal(evidenceAfter.error, null);
  assert.equal(evidenceAfter.data, true);

  const directClientConsume = await first.client.rpc("consume_hey_action_mandate_chain", {
    p_account_id: first.userId,
    p_revocation_epoch: 0,
    p_mandates: [{ mandate_id: randomUUID(), max_uses: 1, revocation_epoch: 0 }],
    p_idempotency_key: `client-direct:${randomUUID()}`,
  });
  assert.ok(directClientConsume.error, "client roles cannot bypass Edge Function signature verification with the use RPC");

  const revokeId = randomUUID();
  const revoked = await first.client.rpc("revoke_hey_action_mandate", {
    p_account_id: first.userId,
    p_mandate_id: revokeId,
    p_reason: "runtime security test",
  });
  assert.equal(revoked.error, null);
  assert.equal(revoked.data, true);
  const revokedRead = await first.client.rpc("is_hey_action_mandate_revoked", {
    p_account_id: first.userId,
    p_mandate_id: revokeId,
  });
  assert.equal(revokedRead.error, null);
  assert.equal(revokedRead.data, true);

  const nextEpoch = await first.client.rpc("advance_hey_action_mandate_epoch", { p_account_id: first.userId });
  assert.equal(nextEpoch.error, null);
  assert.equal(nextEpoch.data, 1);

  const staleUse = await admin.rpc("consume_hey_action_mandate_chain", {
    p_account_id: first.userId,
    p_revocation_epoch: 0,
    p_mandates: [{ mandate_id: randomUUID(), max_uses: 1, revocation_epoch: 0 }],
    p_idempotency_key: `stale:${randomUUID()}`,
  });
  assert.equal(staleUse.error, null);
  assert.deepEqual(staleUse.data, { consumed: false, reason: "stale_epoch" });

  const concurrentMandateId = randomUUID();
  const concurrentMandateUses = await Promise.all(Array.from({ length: 24 }, (_, index) => admin.rpc("consume_hey_action_mandate_chain", {
    p_account_id: first.userId,
    p_revocation_epoch: 1,
    p_mandates: [{ mandate_id: concurrentMandateId, max_uses: 1, revocation_epoch: 1 }],
    p_idempotency_key: `concurrent:${index}:${randomUUID()}`,
  })));
  for (const use of concurrentMandateUses) assert.equal(use.error, null);
  assert.equal(concurrentMandateUses.filter(({ data }) => data?.consumed === true).length, 1, "concurrent use claims cannot exceed maxUses");
  assert.equal(concurrentMandateUses.filter(({ data }) => data?.reason === "max_uses").length, 23);

  const replayMandateId = randomUUID();
  const replayKey = `replay:${randomUUID()}`;
  const firstReplayUse = await admin.rpc("consume_hey_action_mandate_chain", {
    p_account_id: first.userId,
    p_revocation_epoch: 1,
    p_mandates: [{ mandate_id: replayMandateId, max_uses: 3, revocation_epoch: 1 }],
    p_idempotency_key: replayKey,
  });
  assert.equal(firstReplayUse.error, null);
  assert.equal(firstReplayUse.data?.consumed, true);
  const duplicateReplayUse = await admin.rpc("consume_hey_action_mandate_chain", {
    p_account_id: first.userId,
    p_revocation_epoch: 1,
    p_mandates: [{ mandate_id: replayMandateId, max_uses: 3, revocation_epoch: 1 }],
    p_idempotency_key: replayKey,
  });
  assert.equal(duplicateReplayUse.error, null);
  assert.deepEqual(duplicateReplayUse.data, { consumed: false, reason: "replay" });

  const childMandateId = randomUUID();
  const rejectedChainKey = `chain-reject:${randomUUID()}`;
  const rejectedChain = await admin.rpc("consume_hey_action_mandate_chain", {
    p_account_id: first.userId,
    p_revocation_epoch: 1,
    p_mandates: [
      { mandate_id: childMandateId, max_uses: 1, revocation_epoch: 1 },
      { mandate_id: concurrentMandateId, max_uses: 1, revocation_epoch: 1 },
    ],
    p_idempotency_key: rejectedChainKey,
  });
  assert.equal(rejectedChain.error, null);
  assert.deepEqual(rejectedChain.data, { consumed: false, reason: "max_uses" });
  const childUseAfterRejectedChain = await admin.rpc("consume_hey_action_mandate_chain", {
    p_account_id: first.userId,
    p_revocation_epoch: 1,
    p_mandates: [{ mandate_id: childMandateId, max_uses: 1, revocation_epoch: 1 }],
    p_idempotency_key: rejectedChainKey,
  });
  assert.equal(childUseAfterRejectedChain.error, null);
  assert.equal(childUseAfterRejectedChain.data?.consumed, true, "a failed chain cannot consume the earlier child mandate");

  const revokedUse = await admin.rpc("consume_hey_action_mandate_chain", {
    p_account_id: first.userId,
    p_revocation_epoch: 1,
    p_mandates: [{ mandate_id: revokeId, max_uses: 1, revocation_epoch: 0 }],
    p_idempotency_key: `revoked:${randomUUID()}`,
  });
  assert.equal(revokedUse.error, null);
  assert.deepEqual(revokedUse.data, { consumed: false, reason: "revoked" });

  console.log("Local Supabase RLS, account isolation, trusted transcript writes, rate limits, and mandate authority tests passed.");
} finally {
  await Promise.all(identities.map((id) => admin.auth.admin.deleteUser(id)));
}
