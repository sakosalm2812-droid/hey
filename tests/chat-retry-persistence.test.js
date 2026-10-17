import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { mapChatConversationRows, readChatRetryRoute, snapshotChatRetryRoute } from "../src/lib/chatRetryRoute.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("saved user message metadata round-trips exact model, routing profile, and Fusion retry routes", () => {
  const routes = [
    snapshotChatRetryRoute(false, { providerId: "openai", modelId: "gpt-fixture" }),
    snapshotChatRetryRoute(false, "lower_cost"),
    snapshotChatRetryRoute(true, "automatic"),
  ];
  const rows = routes.map((retryRoute, index) => ({
    user_id: "account-a",
    role: "user",
    content: `prompt ${index}`,
    metadata: { retryRoute },
  }));

  const restored = mapChatConversationRows(JSON.parse(JSON.stringify(rows)), "account-a");
  assert.equal(restored.length, 3);
  for (const [index, message] of restored.entries()) {
    assert.equal(readChatRetryRoute(message).status, "stored");
    assert.deepEqual(readChatRetryRoute(message).route, routes[index]);
  }
});

test("history mapping is account fenced and preserves legacy messages without retry metadata", () => {
  const rows = [
    { user_id: "account-a", role: "user", content: "old message", metadata: {} },
    { user_id: "account-b", role: "user", content: "private other account", metadata: { retryRoute: snapshotChatRetryRoute(true, "automatic") } },
    { user_id: "account-a", role: "assistant", content: "reply", metadata: {} },
    { user_id: "account-a", role: "system", content: "must not render", metadata: {} },
  ];

  const restored = mapChatConversationRows(rows, "account-a");
  assert.deepEqual(restored, [
    { role: "user", text: "old message" },
    { role: "hey", text: "reply" },
  ]);
  assert.deepEqual(readChatRetryRoute(restored[0]), { status: "legacy", route: null });
  assert.deepEqual(mapChatConversationRows(rows, "account-b"), [
    { role: "user", text: "private other account", retryRoute: snapshotChatRetryRoute(true, "automatic") },
  ]);
});

test("invalid persisted routes fail closed and history loading verifies the active account", async () => {
  const hostileMetadata = {};
  Object.defineProperty(hostileMetadata, "retryRoute", { enumerable: true, get() { return assert.fail("route getters must not run"); } });
  const invalid = mapChatConversationRows([
    { user_id: "account-a", role: "user", content: "prompt", metadata: hostileMetadata },
  ], "account-a");
  assert.deepEqual(invalid, [{ role: "user", text: "prompt", retryRoute: null }]);
  assert.deepEqual(readChatRetryRoute(invalid[0]), { status: "invalid", route: null });

  const [client, edge, schema] = await Promise.all([
    source("../src/lib/heyAI.js"),
    source("../supabase/functions/hey/index.ts"),
    source("../supabase/migrations/20260819000000_hey_core.sql"),
  ]);
  assert.match(client, /\.eq\("conversation_id", conversationId\)[\s\S]*?\.eq\("user_id", userId\)/);
  assert.match(client, /isSameHEYAccount\(session, currentSessionData\?\.session\)/);
  assert.match(edge, /const retryRoute = snapshotChatRetryRoute\(fusionRequested, requestedRetryProfile\)/);
  assert.match(edge, /role: "user", content: message, metadata: \{ retryRoute \}/);
  assert.match(schema, /metadata jsonb not null default '\{\}'::jsonb/);
  assert.doesNotMatch(edge.slice(edge.indexOf("const retryRoute ="), edge.indexOf("let chatProviderAttempts")), /api.?key|access.?token|secret/i);
});
