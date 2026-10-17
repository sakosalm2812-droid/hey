import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createChatHistoryRequestFence } from "../src/lib/chatHistoryRequestFence.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

test("a send cannot target the previously open conversation while history is loading or changed during preview", async () => {
  const fence = createChatHistoryRequestFence();
  let accountId = "account-a";
  let selectedConversationId = "conversation-old";
  let historyLoading = false;
  const sentConversationIds = [];

  function beginSend(preview) {
    if (historyLoading) return Promise.resolve(false);
    const ticket = fence.begin(accountId, selectedConversationId);
    return preview.promise.then(() => {
      if (historyLoading || !fence.isCurrent(ticket, accountId, selectedConversationId)) return false;
      sentConversationIds.push(selectedConversationId);
      return true;
    });
  }

  const previewStartedOnOldConversation = deferred();
  const oldSend = beginSend(previewStartedOnOldConversation);

  selectedConversationId = "conversation-new";
  historyLoading = true;
  const openTicket = fence.begin(accountId, selectedConversationId);
  const blockedSend = await beginSend(deferred());
  assert.equal(blockedSend, false);

  previewStartedOnOldConversation.resolve();
  assert.equal(await oldSend, false);
  assert.deepEqual(sentConversationIds, []);

  assert.equal(fence.isCurrent(openTicket, accountId, selectedConversationId), true);
  historyLoading = false;
  const previewStartedOnNewConversation = deferred();
  const newSend = beginSend(previewStartedOnNewConversation);
  previewStartedOnNewConversation.resolve();
  assert.equal(await newSend, true);
  assert.deepEqual(sentConversationIds, ["conversation-new"]);
});

test("Chat disables the composer during history loads and rechecks its send ticket after async preview", async () => {
  const page = await source("../src/ChatPage.jsx");
  const sendStart = page.indexOf("async function sendUserMessage(userMessage, retryRoute = null)");
  const sendEnd = page.indexOf("async function refreshComputerPreview", sendStart);
  const sendFunction = page.slice(sendStart, sendEnd);

  assert.match(page, /\[historyLoading, setHistoryLoading\] = useState\(true\)/);
  assert.match(sendFunction, /if \(historyLoadingRef\.current\) \{[\s\S]*?Wait for the selected conversation to finish loading/);
  assert.match(sendFunction, /const sendHistoryTicket = historyRequestFenceRef\.current\.begin\(userIdRef\.current, conversationIdRef\.current\)/);
  assert.match(sendFunction, /await createSafeComputerPreview\(trimmedMessage, previewController\.signal\)[\s\S]*?historyRequestFenceRef\.current\.isCurrent\([\s\S]*?userIdRef\.current[\s\S]*?conversationIdRef\.current/);
  assert.match(page, /disabled=\{isSending \|\| historyLoading\}/);
  assert.match(page, /historyRequestFenceRef\.current\.invalidate\(\);\s*requestedHistoryConversationRef\.current = conversationId \|\| null;/);
});
