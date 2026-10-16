import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { translations } from "../src/i18n/translations.js";
import { clearCopiedMessageIfCurrent, getChatMessageKey } from "../src/lib/chatCopyFeedback.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("copy feedback uses unique bounded message positions rather than duplicate text", () => {
  assert.equal(getChatMessageKey(0), "chat-message-0");
  assert.notEqual(getChatMessageKey(2), getChatMessageKey(3));
  for (const index of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "2", null, NaN]) {
    assert.equal(getChatMessageKey(index), null);
  }
});

test("an older copy timeout cannot clear the latest response feedback", () => {
  const olderRequest = { messageKey: "chat-message-2", requestId: 4 };
  const newerRequest = { messageKey: "chat-message-2", requestId: 5 };
  assert.equal(clearCopiedMessageIfCurrent(newerRequest, olderRequest), newerRequest, "same-message older timeout is stale");
  assert.equal(clearCopiedMessageIfCurrent(olderRequest, olderRequest), null);
  assert.equal(clearCopiedMessageIfCurrent(newerRequest, { messageKey: "chat-message-3", requestId: 6 }), newerRequest);
  assert.equal(clearCopiedMessageIfCurrent(newerRequest, null), newerRequest);
  let getterCalls = 0;
  const hostile = {};
  Object.defineProperty(hostile, "messageKey", { get() { getterCalls += 1; return "chat-message-2"; } });
  Object.defineProperty(hostile, "requestId", { value: 5, enumerable: true });
  assert.equal(clearCopiedMessageIfCurrent(newerRequest, hostile), newerRequest);
  assert.equal(getterCalls, 0);
});

test("message action labels are translated and nonempty in every supported locale", () => {
  const keys = ["copy", "copied", "retry", "pin", "pinned"];
  for (const locale of ["en", "ku", "ar"]) {
    for (const key of keys) {
      const value = translations[locale]?.chat?.messageActions?.[key];
      assert.equal(typeof value, "string", `${locale}.chat.messageActions.${key} exists`);
      assert.ok(value.trim(), `${locale}.chat.messageActions.${key} is nonempty`);
      if (locale !== "en") assert.notEqual(value, translations.en.chat.messageActions[key]);
    }
  }
});

test("Chat response controls expose localized copy state and pinned state to assistive technology", async () => {
  const [page, message, styles] = await Promise.all([
    source("../src/ChatPage.jsx"),
    source("../src/components/chat/ChatMessage.jsx"),
    source("../src/styles/chat.css"),
  ]);
  assert.match(page, /getChatMessageKey\(index\)/);
  assert.match(page, /copied=\{copiedMessage\?\.messageKey === messageKey\}/);
  assert.match(page, /copyRequestRef\.current !== requestId/);
  assert.match(page, /setCopiedMessage\(\(current\) => clearCopiedMessageIfCurrent\(current, feedback\)\)/);
  assert.match(page, /setMessages\(history\.length \? history : \[welcomeMessage\]\);\s*copyRequestRef\.current \+= 1;\s*setCopiedMessage\(null\)/);
  assert.match(page, /setConversationId\(null\);\s*setMessages\(\[welcomeMessage\]\);\s*copyRequestRef\.current \+= 1;\s*setCopiedMessage\(null\)/);
  assert.match(message, /useLocale\(\)/);
  assert.match(message, /role="status" aria-live="polite"/);
  assert.match(message, /aria-label=\{t\(copied \? "chat\.messageActions\.copied" : "chat\.messageActions\.copy"\)\}/);
  assert.match(message, /disabled=\{pinned\}/);
  assert.match(message, /chat\.messageActions\.retry/);
  assert.match(styles, /\.hey-chat-action-status\s*\{[^}]*clip:\s*rect\(0, 0, 0, 0\)/);
});
