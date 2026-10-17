import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createChatHistoryRequestFence } from "../src/lib/chatHistoryRequestFence.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("delayed old conversation success cannot replace a newer selection", async () => {
  const fence = createChatHistoryRequestFence();
  let accountId = "account-a";
  let requestedConversationId = null;
  const view = { conversationId: null, messages: [], error: "" };
  const open = (id, request) => {
    requestedConversationId = id;
    const ticket = fence.begin(accountId, id);
    const isCurrent = () => fence.isCurrent(ticket, accountId, requestedConversationId);
    return request.then((messages) => {
      if (!isCurrent()) return;
      view.conversationId = id;
      view.messages = messages;
      view.error = "";
    }, (error) => {
      if (isCurrent()) view.error = error.message;
    });
  };

  const oldRequest = deferred();
  const newRequest = deferred();
  const oldOpen = open("conversation-old", oldRequest.promise);
  const newOpen = open("conversation-new", newRequest.promise);
  newRequest.resolve(["new conversation messages"]);
  await newOpen;
  oldRequest.resolve(["stale old messages"]);
  await oldOpen;

  assert.equal(view.conversationId, "conversation-new");
  assert.deepEqual(view.messages, ["new conversation messages"]);
  assert.equal(view.error, "");
});

test("delayed old failure and account-changed results cannot replace the current history state", async () => {
  const fence = createChatHistoryRequestFence();
  let accountId = "account-a";
  let requestedConversationId = null;
  const view = { conversationId: "conversation-b", messages: ["current messages"], error: "" };
  const open = (id, request) => {
    requestedConversationId = id;
    const ticket = fence.begin(accountId, id);
    const isCurrent = () => fence.isCurrent(ticket, accountId, requestedConversationId);
    return request.then((messages) => {
      if (!isCurrent()) return;
      view.conversationId = id;
      view.messages = messages;
      view.error = "";
    }, (error) => {
      if (isCurrent()) view.error = error.message;
    });
  };

  const staleFailure = deferred();
  const staleFailureOpen = open("conversation-old", staleFailure.promise);
  const currentRequest = deferred();
  const currentOpen = open("conversation-current", currentRequest.promise);
  staleFailure.reject(new Error("old request failed"));
  await staleFailureOpen;
  assert.equal(view.error, "");
  currentRequest.resolve(["current request messages"]);
  await currentOpen;
  assert.equal(view.conversationId, "conversation-current");

  const accountBoundRequest = deferred();
  const accountBoundOpen = open("conversation-private", accountBoundRequest.promise);
  accountId = "account-b";
  accountBoundRequest.reject(new Error("account A result arrived late"));
  await accountBoundOpen;
  assert.equal(view.error, "");
  assert.equal(view.conversationId, "conversation-current");
  assert.deepEqual(view.messages, ["current request messages"]);
});

test("Chat history success, failure, new-chat, and account cleanup all use the request fence", async () => {
  const page = await source("../src/ChatPage.jsx");
  const openStart = page.indexOf("async function openConversation(id)");
  const openEnd = page.indexOf("function startNewConversation()", openStart);
  const openConversation = page.slice(openStart, openEnd);
  const newStart = openEnd;
  const newEnd = page.indexOf("function insertDictationTranscript", newStart);
  const startNewConversation = page.slice(newStart, newEnd);
  const historyEffectStart = page.indexOf("async function loadConversations()", page.indexOf("const conversationListTicket"));
  const historyEffectEnd = page.indexOf("  }, [user?.id]);", historyEffectStart);
  const historyEffect = page.slice(historyEffectStart, historyEffectEnd);

  assert.match(page, /const historyRequestFenceRef = useRef\(null\)/);
  assert.match(page, /const requestedHistoryConversationRef = useRef\(null\)/);
  assert.match(openConversation, /requestedHistoryConversationRef\.current = id/);
  assert.match(openConversation, /historyRequestFenceRef\.current\.begin\(userIdRef\.current, id\)/);
  assert.match(openConversation, /if \(!isCurrentRequest\(\)\) return;[\s\S]*?setConversationId\(id\)/);
  assert.match(openConversation, /catch \{\s*if \(!isCurrentRequest\(\)\) return;[\s\S]*?setChatError/);
  assert.match(startNewConversation, /historyRequestFenceRef\.current\.invalidate\(\)/);
  assert.match(historyEffect, /historyRequestFenceRef\.current\.isCurrent\([\s\S]*?userIdRef\.current[\s\S]*?requestedHistoryConversationRef\.current/);
  assert.match(historyEffect, /historyRequestFenceRef\.current\.invalidate\(\)/);
});
