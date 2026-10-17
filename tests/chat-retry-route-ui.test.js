import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { readChatRetryRoute, snapshotChatRetryRoute } from "../src/lib/chatRetryRoute.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("chat retry snapshots the original provider selection and Fusion opt-in", () => {
  const selected = { providerId: "openai", modelId: "gpt-fixture" };
  const route = snapshotChatRetryRoute(false, selected);
  selected.modelId = "changed-after-send";
  assert.deepEqual(route, { fusion: false, providerProfile: { providerId: "openai", modelId: "gpt-fixture" } });
  assert.equal(Object.isFrozen(route), true);
  assert.equal(Object.isFrozen(route.providerProfile), true);

  const fusionRoute = snapshotChatRetryRoute(true, { get providerId() { return assert.fail("Fusion does not inspect a model selection"); } });
  assert.deepEqual(fusionRoute, { fusion: true, providerProfile: "automatic" });
  assert.equal(readChatRetryRoute({ role: "user", retryRoute: route }).status, "stored");
  assert.deepEqual(readChatRetryRoute({ role: "user", retryRoute: route }).route, route);
});

test("chat retry route parsing distinguishes legacy messages and rejects hostile metadata without getters", () => {
  assert.deepEqual(readChatRetryRoute({ role: "user", text: "older message" }), { status: "legacy", route: null });
  assert.deepEqual(readChatRetryRoute({ role: "hey", retryRoute: snapshotChatRetryRoute(false, "automatic") }), { status: "invalid", route: null });
  assert.equal(snapshotChatRetryRoute(false, "unrecognized-profile"), null);
  assert.equal(snapshotChatRetryRoute(false, { providerId: "openai", modelId: "../private" }), null);

  let getterCalls = 0;
  const hostileProfile = { modelId: "gpt-fixture" };
  Object.defineProperty(hostileProfile, "providerId", { enumerable: true, get() { getterCalls += 1; return "openai"; } });
  assert.equal(snapshotChatRetryRoute(false, hostileProfile), null);

  const hostileRoute = {};
  Object.defineProperty(hostileRoute, "fusion", { enumerable: true, get() { getterCalls += 1; return false; } });
  Object.defineProperty(hostileRoute, "providerProfile", { enumerable: true, value: "automatic" });
  assert.deepEqual(readChatRetryRoute({ role: "user", retryRoute: hostileRoute }), { status: "invalid", route: null });
  assert.deepEqual(readChatRetryRoute(new Proxy({}, { getPrototypeOf() { throw new Error("hostile message"); } })), { status: "invalid", route: null });
  assert.equal(getterCalls, 0);
});

test("Chat records each request route and retries the preceding user message with that route", async () => {
  const page = await source("../src/ChatPage.jsx");
  const retry = page.slice(page.indexOf("async function retryMessage(index)"), page.indexOf("async function copyMessage(", page.indexOf("async function retryMessage(index)")));
  assert.match(page, /async function sendUserMessage\(userMessage, retryRoute = null\)/);
  assert.match(page, /retryRoute \? retryRoute\.fusion : fusionEnabled/);
  assert.match(page, /effectiveProviderProfile = retryRoute \? retryRoute\.providerProfile : requestedProviderProfile/);
  assert.match(page, /retryRoute: retryRouteSnapshot/);
  assert.match(retry, /readChatRetryRoute\(previousUserMessage\)/);
  assert.match(retry, /retryRoute\.status === "invalid"/);
  assert.match(retry, /await sendUserMessage\(previousUserMessage\.text, retryRoute\.status === "stored" \? retryRoute\.route : null\)/);
});
