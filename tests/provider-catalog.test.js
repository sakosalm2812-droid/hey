import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { getHEYProviderCatalog } from "../src/lib/heyAI.js";
import { supabase } from "../src/lib/supabase.js";

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
  snapshotProviderAttempts,
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

test("provider catalog is withheld when the signed-in account changes during loading", async (t) => {
  const sessions = [
    { user: { id: "account-a" }, access_token: "token-a" },
    { user: { id: "account-b" }, access_token: "token-b" },
  ];
  let sessionReads = 0;
  let fetchCalls = 0;
  t.mock.method(supabase.auth, "getSession", async () => ({ data: { session: sessions[sessionReads++] } }));
  t.mock.method(globalThis, "fetch", async (url, options) => {
    fetchCalls += 1;
    assert.match(String(url), /\/models$/);
    assert.equal(options.headers.Authorization, "Bearer token-a");
    return new Response(JSON.stringify({ providers: [], profiles: [{ id: "automatic", label: "Automatic" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  await assert.rejects(getHEYProviderCatalog(), { name: "AbortError", message: /account changed/i });
  assert.equal(sessionReads, 2);
  assert.equal(fetchCalls, 1);
});

test("pre-aborted model catalog requests never dispatch fetch", async (t) => {
  t.mock.method(supabase.auth, "getSession", async () => ({
    data: { session: { user: { id: "account-a" }, access_token: "token-a" } },
  }));
  let fetchCalls = 0;
  t.mock.method(globalThis, "fetch", async () => { fetchCalls += 1; throw new Error("fetch must not start"); });
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(getHEYProviderCatalog({ signal: controller.signal }), { name: "AbortError" });

  const timeoutController = new AbortController();
  const timeoutReason = new DOMException("The request timed out.", "TimeoutError");
  timeoutController.abort(timeoutReason);
  await assert.rejects(getHEYProviderCatalog({ signal: timeoutController.signal }), (error) => error === timeoutReason);
  assert.equal(fetchCalls, 0);
});

test("non-OK catalog body timeout preserves TimeoutError and cancels its stream", async (t) => {
  t.mock.method(supabase.auth, "getSession", async () => ({
    data: { session: { user: { id: "account-a" }, access_token: "token-a" } },
  }));
  let requestSignal;
  let cancelRequested = false;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    requestSignal = options.signal;
    return new Response(new ReadableStream({
      start() {},
      cancel() { cancelRequested = true; return new Promise(() => {}); },
    }), { status: 503 });
  });

  const startedAt = Date.now();
  await assert.rejects(getHEYProviderCatalog({ timeoutMs: 20 }), { name: "TimeoutError" });
  assert.equal(Date.now() - startedAt < 500, true);
  assert.equal(requestSignal.aborted, true);
  assert.equal(cancelRequested, true);
});

test("oversized catalog content-length cancels before any body pull", async (t) => {
  t.mock.method(supabase.auth, "getSession", async () => ({
    data: { session: { user: { id: "account-a" }, access_token: "token-a" } },
  }));
  let cancelRequested = false;
  let pulls = 0;
  t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
    pull() { pulls += 1; },
    cancel() { cancelRequested = true; },
  }, { highWaterMark: 0 }), {
    status: 503,
    headers: { "Content-Length": "2000001" },
  }));

  await assert.rejects(getHEYProviderCatalog({ timeoutMs: 1_000 }), /could not be loaded/i);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(cancelRequested, true);
  assert.equal(pulls, 0);
});

test("late fetch response after caller abort is cancelled without reading its body", async (t) => {
  t.mock.method(supabase.auth, "getSession", async () => ({
    data: { session: { user: { id: "account-a" }, access_token: "token-a" } },
  }));
  const controller = new AbortController();
  let requestSignal;
  let fetchCalls = 0;
  let markFetchStarted;
  const fetchStarted = new Promise((resolve) => { markFetchStarted = resolve; });
  let resolveFetch;
  const pendingFetch = new Promise((resolve) => { resolveFetch = resolve; });
  t.mock.method(globalThis, "fetch", (_url, options) => {
    requestSignal = options.signal;
    fetchCalls += 1;
    markFetchStarted();
    return pendingFetch;
  });

  const pendingCatalog = getHEYProviderCatalog({ signal: controller.signal, timeoutMs: 5_000 });
  await fetchStarted;
  controller.abort();
  await assert.rejects(pendingCatalog, { name: "AbortError" });

  let cancelRequested = false;
  let pulls = 0;
  resolveFetch(new Response(new ReadableStream({
    pull() { pulls += 1; },
    cancel() { cancelRequested = true; },
  }, { highWaterMark: 0 })));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fetchCalls, 1);
  assert.equal(requestSignal.aborted, true);
  assert.equal(cancelRequested, true);
  assert.equal(pulls, 0);
});

test("streamed catalog responses remain capped at two megabytes", async (t) => {
  t.mock.method(supabase.auth, "getSession", async () => ({
    data: { session: { user: { id: "account-a" }, access_token: "token-a" } },
  }));
  let cancelRequested = false;
  t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(2_000_001)); },
    cancel() { cancelRequested = true; },
  }), { status: 200 }));

  await assert.rejects(getHEYProviderCatalog({ timeoutMs: 1_000 }), /catalog is invalid/i);
  assert.equal(cancelRequested, true);
});

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
  assert.equal(parseProviderSelection(new Proxy({}, { ownKeys() { throw new Error("hostile trap"); } })).status, "invalid");
});

test("provider attempts use an immutable request snapshot across concurrent configuration changes", () => {
  const source = attempts.map((attempt) => ({ ...attempt }));
  const snapshot = snapshotProviderAttempts(source);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot[1]), true);
  source[1].model = "attacker-swapped-model";
  source[1].key = "attacker-swapped-key";
  assert.equal(snapshot[1].model, "gemini-fixture");
  assert.equal(snapshot[1].key, "gemini-private-key");
  assert.throws(() => { snapshot[1].model = "attacker-swapped-model"; }, TypeError);

  const selection = parseProviderSelection({ providerId: "gemini", modelId: "gemini-fixture" });
  assert.equal(resolveProviderSelection(selection, snapshot, ["provider.remote", "provider:gemini"], routingPrices).status, "selected");
  // A later account snapshot revoking the provider wins over the original catalog snapshot.
  assert.equal(resolveProviderSelection(selection, snapshot, ["provider.remote"], routingPrices).status, "denied");
});

test("provider snapshot rejects malformed, duplicate, sparse, and hostile configuration atomically", () => {
  assert.equal(snapshotProviderAttempts([attempts[0], attempts[0]]), null);
  const sparse = new Array(3);
  sparse[0] = attempts[0];
  sparse[2] = attempts[1];
  assert.equal(snapshotProviderAttempts(sparse), null);
  assert.equal(snapshotProviderAttempts(new Proxy([], { getPrototypeOf() { throw new Error("hostile trap"); } })), null);
  assert.equal(snapshotProviderAttempts([{ id: "openai", model: "gpt-fixture", get key() { throw new Error("must not run"); } }]), null);
});

test("authenticated model discovery and chat profile stay opt-in and server authoritative", async () => {
  const [route, client, page, input] = await Promise.all([
    readFile(new URL("../supabase/functions/hey/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/heyAI.js", import.meta.url), "utf8"),
    readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/chat/ChatInput.jsx", import.meta.url), "utf8"),
  ]);
  const providerCatalogClient = client.slice(client.indexOf("export async function getHEYProviderCatalog"), client.indexOf("async function fetchWithTimeout"));
  assert.match(route, /request\.method === "GET" && modelsPath/);
  assert.match(route, /authClient\.auth\.getUser\(token\)/);
  assert.match(route, /\.select\("entitlements"\)/);
  assert.match(route, /filterEntitledProviderAttempts\(getProviderAttempts\(\), entitlements\)/);
  assert.match(route, /parseFusionPricingConfig\(Deno\.env\.get\("HEY_FUSION_PRICING_JSON"/);
  assert.match(route, /orderProviderAttemptsForProfile\(chatProviderAttempts, routingPricing, "lower_cost"\)/);
  assert.match(route, /parseProviderSelection\(payload\.providerSelection\)/);
  assert.match(route, /chatProviderAttempts = \[selection\.attempt\]/);
  assert.match(route, /providerSelection: invalid|provider_selection_invalid/);
  assert.match(route, /snapshotProviderAttempts\(ordered\) \|\| \[\]/);
  assert.match(route, /provider\.model === requestedProvider\.modelId/);
  assert.match(route, /authorizeChatProvider = async \(provider: ProviderAttempt\)/);
  assert.match(route, /await callProvider\(messages, 1200, chatProviderAttempts, authorizeChatProvider, request\.signal\)/);
  assert.match(route, /if \(authorizeProvider && !await authorizeProvider\(provider\)\)[\s\S]*?const response = provider\.id/);
  assert.match(route, /const stillAuthorized = await authorizeProvider\(provider\)/);
  assert.match(route, /providerAuthorizationUnavailable[\s\S]*?account_permissions_unavailable/);
  assert.match(client, /getHEYApiUrl\(\).*\/models/);
  assert.match(client, /access_token/);
  assert.match(providerCatalogClient, /const details = await responseJsonOrEmpty\(response\);[\s\S]*const currentSession = await getHEYSession\(\);[\s\S]*if \(!isSameHEYAccount\(session, currentSession\)\)[\s\S]*throw new DOMException\("The signed-in account changed while available models were loading\.", "AbortError"\)[\s\S]*if \(!Array\.isArray\(details\.providers\)/);
  assert.match(client, /providerSelection: \{ providerId, modelId \}/);
  assert.match(client, /providerProfile === "lower_cost"/);
  assert.match(page, /providerProfile: effectiveProviderProfile/);
  assert.match(input, /Exact entitled models/);
  assert.match(input, /Model for this request/);
});
