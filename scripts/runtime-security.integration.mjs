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
  const email = \`hey-security-\${suffix}@example.test\`;
  const password = \`Local-test-\${suffix}-A9!\`;
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
  assert.deepEqual(visibleTranscript.data.map(({ role }) => role), ["user", "assistant"]);

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

  console.log("Local Supabase RLS, trusted transcript writes, account isolation, and concurrent rate-limit tests passed.");
} finally {
  await Promise.all(identities.map((id) => admin.auth.admin.deleteUser(id)));
}
