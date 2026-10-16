import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createConversationScopedVoiceAsk } from "../src/lib/voiceConversationContext.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("voice requests use the current Chat conversation and keep its returned id", async () => {
  const page = await source("../src/ChatPage.jsx");
  const voiceStart = page.indexOf("voiceSessionRef.current = createVoiceSession({");
  const voiceEnd = page.indexOf("return () => voiceSessionRef.current?.destroy();", voiceStart);
  const voiceSetup = page.slice(voiceStart, voiceEnd);

  assert.ok(voiceStart >= 0, "ChatPage creates its shared voice session");
  assert.match(page, /const conversationIdRef = useRef\(conversationId\);\s*useLayoutEffect\(\(\) => \{ conversationIdRef\.current = conversationId; \}, \[conversationId\]\);/);
  assert.match(voiceSetup, /ask: createConversationScopedVoiceAsk\(\{[\s\S]*?getConversationId: \(\) => conversationIdRef\.current,[\s\S]*?onConversationId: setConversationId/);
  assert.match(page, /return askHEY\(text, \{ signal, conversationId: activeConversationId, onConversationId \}\);/);
  assert.match(page, /<ChatWorkspace key=\{user\?\.id \|\| 'signed-out'\} \/>/);
});

test("voice context follows the active thread and ignores caller attempts to replace its binding", async () => {
  let currentConversationId = "thread-a";
  const calls = [];
  const updateConversationId = (conversationId) => { currentConversationId = conversationId; };
  const ask = createConversationScopedVoiceAsk({
    ask: async (...args) => { calls.push(args); return "answer"; },
    getConversationId: () => currentConversationId,
    onConversationId: updateConversationId,
  });
  const controller = new AbortController();
  const hostileCallback = () => assert.fail("caller must not replace ChatPage's conversation updater");

  await ask("first turn", { signal: controller.signal, conversationId: "other-thread", onConversationId: hostileCallback });
  assert.equal(calls[0][1].conversationId, "thread-a");
  assert.equal(calls[0][1].signal, controller.signal);
  calls[0][1].onConversationId("thread-b");
  await ask("next turn");
  assert.equal(calls[1][1].conversationId, "thread-b");
  assert.equal(calls[1][1].onConversationId, updateConversationId);
});
