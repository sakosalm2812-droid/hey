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

test("Fusion and provider permission, configuration, and disagreement responses stay visible as failures", () => {
  assert.match(getHEYChatError({ status: 403 }, {}, true), /not permitted/i);
  assert.match(getHEYChatError({ status: 503 }, {}, true), /permissions or pricing are not configured/i);
  assert.match(getHEYChatError({ status: 409 }, {}, true), /No answer was delivered/i);
  assert.match(getHEYChatError({ status: 500 }, {}, true), /No answer was delivered/i);
  assert.match(getHEYChatError({ status: 409 }, { code: "provider_budget_exhausted" }), /configured model budget/i);
  assert.match(getHEYChatError({ status: 503 }, { code: "provider_model_unavailable" }), /no longer configured/i);
  assert.match(getHEYChatError({ status: 429 }, { code: "provider_rate_limited", retryAfterSeconds: 2 }), /rate limited.*2 seconds/i);
  assert.match(getHEYChatError({ status: 429 }, { code: "rate_limited", retryAfterSeconds: 60 }), /too many requests.*60 seconds/i);
  assert.match(getHEYChatError({ status: 403 }, { code: "provider_entitlement_required" }), /does not have access/i);
  assert.match(getHEYChatError({ status: 503 }, { code: "provider_credentials_rejected" }), /credential was rejected/i);
  assert.match(getHEYChatError({ status: 503 }, { code: "provider_access_rejected" }), /provider denied access/i);
});

test("responses from an account that is no longer signed in are rejected", () => {
  assert.equal(isSameHEYAccount({ user: { id: "account-a" } }, { user: { id: "account-a" } }), true);
  assert.equal(isSameHEYAccount({ user: { id: "account-a" } }, { user: { id: "account-b" } }), false);
  assert.equal(isSameHEYAccount({ user: { id: "account-a" } }, null), false);
});

test("chat UI exposes model selection, reports the actual route, and fences requests on unmount", async () => {
  const [input, page, client, message] = await Promise.all([
    readFile(new URL("../src/components/chat/ChatInput.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/heyAI.js", import.meta.url), "utf8"),
    readFile(new URL("../src/components/chat/ChatMessage.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(input, /checked=\{fusionEnabled\}/);
  assert.match(input, /setFusionEnabled\?\.\(event\.target\.checked\)/);
  assert.match(input, /fusionEnabled = false/);
  assert.match(input, /aria-label="Choose a configured model"/);
  assert.match(input, /aria-label="Choose a routing profile"/);
  assert.match(input, /providerCatalog\.providers\.map/);
  assert.match(page, /useEffect\(\(\) => \(\) => activeRequestControllerRef\.current\?\.abort\(\), \[\]\)/);
  assert.match(page, /fusion: requestedFusion/);
  assert.match(page, /onProviderMetadata: \(metadata\) => \{ responseProviderMetadata = metadata; \}/);
  assert.match(page, /providerMetadata=\{item\.providerMetadata\}/);
  assert.match(page, /getHEYProviderCatalog\(\{ signal: controller\.signal \}\)/);
  assert.match(client, /const execution = fusion \? null : await executeRequest/);
  assert.match(client, /const requestBody = withFusionRequestOptIn\([\s\S]*?\}, fusion\)/);
  assert.match(client, /requestBody\.providerSelection = \{/);
  assert.match(client, /requestBody\.routingProfile = providerProfile/);
  assert.match(client, /onProviderMetadata\?\.\(\{[\s\S]*?costUsd: data\.costUsd/);
  assert.match(message, /Provider routing details/);
});
