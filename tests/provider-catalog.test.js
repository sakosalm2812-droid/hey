import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { parseFusionPricingConfig } from "../supabase/functions/hey/fusionProvider.js";
import {
  filterEntitledProviderAttempts,
  listConfiguredProviders,
  normalizeProviderEntitlements,
  orderProviderAttemptsForProfile,
  parseProviderSelection,
  parseRoutingProfile,
  resolveProviderSelection,
  routingPricesFromFusionConfig,
} from "../supabase/functions/hey/providerCatalog.js";

const attempts = [
  { id: "openai", model: "gpt-fixture", key: "openai-private-key" },
  { id: "gemini", model: "gemini-fixture", key: "gemini-private-key" },
  { id: "groq", model: "groq-unpriced", key: "groq-private-key" },
];

const fusionPrices = parseFusionPricingConfig(JSON.stringify({
  budgetUsd: 0.04,
  minConfidence: 0.7,
  providers: [
    { id: "openai", model: "gpt-fixture", inputUsdPerMillion: 5, outputUsdPerMillion: 10, maxCostUsd: 0.02 },
    { id: "gemini", model: "gemini-fixture", inputUsdPerMillion: 0.2, outputUsdPerMillion: 0.4, maxCostUsd: 0.02 },
  ],
}));
const routingPrices = routingPricesFromFusionConfig(fusionPrices);

test("account entitlements narrow models and reject malformed or hostile grants", () => {
  assert.deepEqual(normalizeProviderEntitlements(["provider.remote", "provider:openai"]), ["provider.remote", "provider:openai"]);
  assert.deepEqual(filterEntitledProviderAttempts(attempts, ["provider.remote", "provider:openai"]), [attempts[0]]);
  assert.deepEqual(filterEntitledProviderAttempts(attempts, ["provider:openai"]), []);
  assert.deepEqual(filterEntitledProviderAttempts(attempts, ["provider.remote", "provider:gemini"]), [attempts[1]]);
  assert.equal(normalizeProviderEntitlements(["provider.remote", " provider:openai"]), null);

  let reads = 0;
  const hostile = ["provider.remote"];
  Object.defineProperty(hostile, "1", {
    enumerable: true,
    get() { reads += 1; throw new Error("must not execute"); },
  });
  hostile.length = 2;
  assert.equal(normalizeProviderEntitlements(hostile), null);
  assert.equal(reads, 0);
});

test("routing catalog exposes only entitled models with exact server prices and no credentials", () => {
  const permitted = filterEntitledProviderAttempts(attempts, ["provider.remote", "provider:openai", "provider:gemini", "provider:groq"]);
  const catalog = listConfiguredProviders(permitted, routingPrices);
  assert.deepEqual(catalog.map(({ providerId, providerName, modelId, state }) => ({ providerId, providerName, modelId, state })), [
    { providerId: "openai", providerName: "OpenAI", modelId: "gpt-fixture", state: "configured" },
    { providerId: "gemini", providerName: "Google Gemini", modelId: "gemini-fixture", state: "configured" },
  ]);
  assert.equal(JSON.stringify(catalog).includes("private-key"), false);
  assert.equal(catalog.some((model) => model.modelId === "groq-unpriced"), false);
});

test("Automatic preserves server order and Lower cost ranks only exact priced entitled models", () => {
  const permitted = filterEntitledProviderAttempts(attempts, ["provider.remote", "provider:openai", "provider:gemini", "provider:groq"]);
  assert.deepEqual(parseRoutingProfile(undefined), { status: "valid", profile: "automatic" });
  assert.deepEqual(parseRoutingProfile("lower_cost"), { status: "valid", profile: "lower_cost" });
  assert.deepEqual(parseRoutingProfile("client-priced"), { status: "invalid" });
  assert.deepEqual(orderProviderAttemptsForProfile(permitted, routingPrices, "automatic"), permitted);
  assert.deepEqual(orderProviderAttemptsForProfile(permitted, routingPrices, "lower_cost"), [attempts[1], attempts[0]]);
  assert.deepEqual(orderProviderAttemptsForProfile(permitted, null, "lower_cost"), []);
});

test("exact provider selection is canonical, grant-bound, priced, and never broadens to fallback", () => {
  const permitted = filterEntitledProviderAttempts(attempts, ["provider.remote", "provider:openai", "provider:gemini"]);
  const selected = parseProviderSelection({ providerId: "gemini", modelId: "gemini-fixture" });
  assert.deepEqual(selected, { status: "selected", providerId: "gemini", modelId: "gemini-fixture" });
  const resolution = resolveProviderSelection(selected, permitted, ["provider.remote", "provider:gemini"], routingPrices);
  assert.equal(resolution.status, "selected");
  assert.equal(resolution.attempt, attempts[1]);
  assert.deepEqual([resolution.attempt], [attempts[1]]);
  assert.equal(resolveProviderSelection(selected, permitted, ["provider.remote", "provider:openai"], routingPrices).status, "denied");
  assert.equal(resolveProviderSelection(selected, permitted, ["provider.remote", "provider:gemini"], null).status, "unavailable");
  assert.equal(resolveProviderSelection(parseProviderSelection({ providerId: "groq", modelId: "groq-unpriced" }), attempts, ["provider.remote", "provider:groq"], routingPrices).status, "unavailable");
  assert.equal(resolveProviderSelection(parseProviderSelection({ providerId: "gemini", modelId: "different-model" }), permitted, ["provider.remote", "provider:gemini"], routingPrices).status, "unavailable");
});

test("exact provider selection rejects malformed IDs, extra keys, and accessors without reading them", () => {
  for (const candidate of [
    { providerId: "Gemini", modelId: "gemini-fixture" },
    { providerId: "gemini", modelId: "../secret" },
    { providerId: "gemini", modelId: "gemini-fixture", key: "attacker-key" },
  ]) assert.equal(parseProviderSelection(candidate).status, "invalid");
  let reads = 0;
  const hostile = { providerId: "gemini" };
  Object.defineProperty(hostile, "modelId", { enumerable: true, get() { reads += 1; throw new Error("must not execute"); } });
  assert.equal(parseProviderSelection(hostile).status, "invalid");
  assert.equal(reads, 0);
});

test("authenticated model discovery and chat profile stay opt-in and server authoritative", async () => {
  const [route, client, page, input] = await Promise.all([
    readFile(new URL("../supabase/functions/hey/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/heyAI.js", import.meta.url), "utf8"),
    readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/chat/ChatInput.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /request\.method === "GET" && modelsPath/);
  assert.match(route, /authClient\.auth\.getUser\(token\)/);
  assert.match(route, /\.select\("entitlements"\)/);
  assert.match(route, /filterEntitledProviderAttempts\(getProviderAttempts\(\), entitlements\)/);
  assert.match(route, /parseFusionPricingConfig\(Deno\.env\.get\("HEY_FUSION_PRICING_JSON"/);
  assert.match(route, /orderProviderAttemptsForProfile\(chatProviderAttempts, routingPricing, "lower_cost"\)/);
  assert.match(route, /parseProviderSelection\(payload\.providerSelection\)/);
  assert.match(route, /chatProviderAttempts = \[selection\.attempt\]/);
  assert.match(route, /providerSelection: invalid|provider_selection_invalid/);
  assert.match(route, /provider\.model === requestedProvider\.modelId/);
  assert.match(route, /authorizeChatProvider = async \(provider: ProviderAttempt\)/);
  assert.match(route, /await callProvider\(messages, 1200, chatProviderAttempts, authorizeChatProvider\)/);
  assert.match(route, /if \(authorizeProvider && !await authorizeProvider\(provider\)\)[\s\S]*?const response = provider\.id/);
  assert.match(route, /if \(response\.ok\) \{\s+if \(authorizeProvider && !await authorizeProvider\(provider\)\)/);
  assert.match(route, /providerAuthorizationUnavailable[\s\S]*?account_permissions_unavailable/);
  assert.match(client, /getHEYApiUrl\(\).*\/models/);
  assert.match(client, /access_token/);
  assert.match(client, /routingProfile: !fusion && providerProfile === "lower_cost" \? "lower_cost" : undefined/);
  assert.match(page, /providerProfile: requestedProviderProfile/);
  assert.match(input, /Available models:/);
  assert.match(input, /Model routing profile/);
});
