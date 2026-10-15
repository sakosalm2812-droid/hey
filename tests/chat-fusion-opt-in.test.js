import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getHEYChatError, isSameHEYAccount, withFusionRequestOptIn } from "../src/lib/heyAI.js";

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
  assert.doesNotMatch(page, /pendingExecution|confirmPendingExecution|setPendingExecution/);
  assert.match(client, /const execution = fusion \? null : await executeRequest/);
  assert.match(client, /withFusionRequestOptIn\([\s\S]*?\}, fusion\)\)/);
});
