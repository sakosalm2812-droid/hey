import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkHEYAIReadiness, getHEYChatError, isSameHEYAccount, listHEYConversations, withFusionRequestOptIn } from "../src/lib/heyAI.js";

test("ordinary chat omits Fusion and explicit opt-in sends only the supported true field", () => {
  const ordinary = withFusionRequestOptIn({ message: "hello", mode: "research", fusion: true });
  assert.deepEqual(ordinary, { message: "hello", mode: "research" });

  const optedIn = withFusionRequestOptIn({ message: "hello", mode: "research" }, true);
  assert.deepEqual(optedIn, { message: "hello", mode: "research", fusion: true });
  assert.equal(Object.hasOwn(optedIn, "modelMode"), false);
});

test("Fusion permission, configuration, and disagreement responses stay visible as failures", () => {
  assert.match(getHEYChatError({ status: 403 }, {}, true), /not permitted/i);
  assert.match(getHEYChatError({ status: 503 }, {}, true), /permissions or pricing are not configured/i);
  assert.match(getHEYChatError({ status: 409 }, {}, true), /No answer was delivered/i);
  assert.match(getHEYChatError({ status: 500 }, {}, true), /No answer was delivered/i);
});

test("responses from an account that is no longer signed in are rejected", () => {
  assert.equal(isSameHEYAccount({ user: { id: "account-a" } }, { user: { id: "account-a" } }), true);
  assert.equal(isSameHEYAccount({ user: { id: "account-a" } }, { user: { id: "account-b" } }), false);
  assert.equal(isSameHEYAccount({ user: { id: "account-a" } }, null), false);
});

test("HEY AI readiness reflects the real health endpoint and distinguishes missing configuration", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ status: "ready" }), { status: 200 });
    assert.equal((await checkHEYAIReadiness()).status, "ready");

    globalThis.fetch = async () => new Response(JSON.stringify({ status: "not_ready" }), { status: 503 });
    assert.equal((await checkHEYAIReadiness()).status, "not_configured");

    globalThis.fetch = async () => { throw new TypeError("offline"); };
    assert.equal((await checkHEYAIReadiness()).status, "unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("chat conversation loading does not treat a missing Supabase session as an empty account", async () => {
  await assert.rejects(listHEYConversations(), /Supabase session is unavailable/i);
});

test("chat UI exposes Fusion as a per-request checkbox and fences requests on unmount", async () => {
  const [input, page, client] = await Promise.all([
    readFile(new URL("../src/components/chat/ChatInput.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/heyAI.js", import.meta.url), "utf8"),
  ]);
  assert.match(input, /checked=\{fusionEnabled\}/);
  assert.match(input, /setFusionEnabled\?\.\(event\.target\.checked\)/);
  assert.match(input, /fusionEnabled = false/);
  assert.match(page, /useEffect\(\(\) => \(\) => activeRequestControllerRef\.current\?\.abort\(\), \[\]\)/);
  assert.match(page, /fusion: requestedFusion/);
  assert.match(client, /const execution = fusion \? null : await executeRequest/);
  assert.match(client, /withFusionRequestOptIn\([\s\S]*?\}, fusion\)\)/);
  assert.match(page, /aria-label="Service readiness"/);
  assert.match(page, /provider reachability is confirmed when you send a message/);
  assert.match(page, /Supabase could not load your conversations/);
  assert.match(client, /HEY AI could not be reached/);
});
