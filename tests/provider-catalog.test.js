import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  calculateProviderUsageCost,
  listConfiguredProviders,
  parseChatPricingConfig,
  parseProviderSelection,
  parseRoutingProfile,
  normalizeProviderEntitlements,
  filterEntitledProviderAttempts,
  isProviderEntitled,
  orderProviderAttemptsForProfile,
  planProviderCallBudget,
  resolveProviderSelection,
} from "../supabase/functions/hey/providerCatalog.js";
import { callConfiguredProvider } from "../supabase/functions/hey/providerDispatch.js";

const attempts = [
  { id: "openai", model: "gpt-fixture", key: "fixture-secret" },
  { id: "gemini", model: "gemini-fixture", key: "fixture-secret-2" },
];
const pricing = parseChatPricingConfig(JSON.stringify({
  budgetUsd: 0.02,
  providers: [
    { id: "openai", model: "gpt-fixture", inputUsdPerMillion: 2, outputUsdPerMillion: 4, maxCostUsd: 0.01 },
    { id: "gemini", model: "gemini-fixture", inputUsdPerMillion: 1, outputUsdPerMillion: 3, maxCostUsd: 0.01 },
  ],
}));

test("provider discovery returns only configured provider/model metadata and never a key", () => {
  const providers = listConfiguredProviders(attempts, pricing);
  assert.deepEqual(providers, [
    { providerId: "openai", providerName: "OpenAI", modelId: "gpt-fixture", state: "configured", maxCostUsd: 0.01 },
    { providerId: "gemini", providerName: "Google Gemini", modelId: "gemini-fixture", state: "configured", maxCostUsd: 0.01 },
  ]);
  assert.equal(JSON.stringify(providers).includes("fixture-secret"), false);
  assert.deepEqual(listConfiguredProviders([{ id: "openai", model: "gpt-fixture", key: "" }], pricing), []);
  assert.deepEqual(listConfiguredProviders([{ id: "openai", model: "gpt-fixture", key: " " }], pricing), []);
  assert.deepEqual(listConfiguredProviders(attempts, null), []);
});

test("provider selection accepts only an exact configured provider/model pair", () => {
  assert.deepEqual(parseProviderSelection(undefined), { status: "automatic" });
  assert.deepEqual(resolveProviderSelection({ providerId: "openai", modelId: "gpt-fixture" }, attempts, pricing), {
    status: "selected",
    attempt: attempts[0],
    pricing: pricing.providers[0],
    budgetUsd: pricing.budgetUsd,
  });
  assert.deepEqual(resolveProviderSelection({ providerId: "openai", modelId: "unconfigured" }, attempts, pricing), { status: "unavailable" });
  assert.deepEqual(parseProviderSelection({ providerId: "openai", modelId: "gpt-fixture", key: "forged" }), { status: "invalid" });
  assert.deepEqual(parseProviderSelection({ providerId: "openai", modelId: " gpt-fixture" }), { status: "invalid" });
});

test("chat pricing requires exact provider/model prices and valid bounded rates", () => {
  assert.equal(pricing.budgetUsd, 0.02);
  assert.equal(parseChatPricingConfig(""), null);
  const invalid = JSON.parse(JSON.stringify(pricing));
  invalid.providers[0].modelId = "different-model";
  assert.equal(resolveProviderSelection({ providerId: "openai", modelId: "gpt-fixture" }, attempts, invalid).status, "unavailable");
  const tooExpensive = JSON.parse(JSON.stringify(pricing));
  tooExpensive.providers[0].inputUsdPerMillion = 1_000_000;
  assert.equal(parseChatPricingConfig(JSON.stringify(tooExpensive)), null);
});

test("per request price reserves cap output tokens and requires bounded provider usage", () => {
  const price = pricing.providers[0];
  const plan = planProviderCallBudget([{ role: "user", content: "hello" }], price, 0.02, 1200);
  assert.ok(plan);
  assert.ok(plan.reservedCostUsd <= price.maxCostUsd);
  assert.equal(plan.outputTokenCeiling, 1200);
  assert.deepEqual(calculateProviderUsageCost("openai", { usage: { prompt_tokens: 10, completion_tokens: 20 } }, price, plan), {
    valid: true,
    costUsd: 0.0001,
  });
  assert.equal(calculateProviderUsageCost("openai", { usage: { prompt_tokens: plan.inputTokenCeiling + 1, completion_tokens: 20 } }, price, plan).valid, false);
  assert.equal(planProviderCallBudget([{ role: "user", content: "x".repeat(20_000) }], price, 0.0001, 1200), null);
  assert.equal(planProviderCallBudget([{ role: "user", content: "x".repeat(33_000) }], {
    ...price, inputUsdPerMillion: 0, outputUsdPerMillion: 0,
  }, 0.01, 1200), null, "cheap pricing cannot bypass the maximum input ceiling");
});

test("provider selection rejects accessors without executing them", () => {
  let reads = 0;
  const hostile = {};
  Object.defineProperties(hostile, {
    providerId: { enumerable: true, get() { reads += 1; throw new Error("must not run"); } },
    modelId: { enumerable: true, value: "gpt-fixture" },
  });
  assert.deepEqual(parseProviderSelection(hostile), { status: "invalid" });
  assert.equal(reads, 0);
});

test("routing profiles are exact allowlisted values and entitlements only narrow server providers", () => {
  assert.deepEqual(parseRoutingProfile(undefined), { status: "automatic", profile: "automatic" });
  assert.deepEqual(parseRoutingProfile("lower_cost"), { status: "valid", profile: "lower_cost" });
  assert.deepEqual(parseRoutingProfile("maximum_quality"), { status: "invalid" });
  assert.deepEqual(normalizeProviderEntitlements(["provider.remote", "provider:openai"]), ["provider.remote", "provider:openai"]);
  assert.equal(normalizeProviderEntitlements(["provider.remote", " provider:openai"]), null);
  assert.deepEqual(filterEntitledProviderAttempts(attempts, ["provider.remote", "provider:openai"]), [attempts[0]]);
  assert.equal(isProviderEntitled(["provider.remote", "provider:gemini"], "openai"), false);
  assert.deepEqual(filterEntitledProviderAttempts(attempts, ["provider:openai"]), []);
  assert.deepEqual(orderProviderAttemptsForProfile(attempts, pricing, "automatic"), attempts);
  assert.deepEqual(orderProviderAttemptsForProfile(attempts, pricing, "lower_cost"), [attempts[1], attempts[0]]);
  assert.deepEqual(orderProviderAttemptsForProfile(attempts, pricing, "forged"), []);
  let entitlementReads = 0;
  const hostileEntitlements = [];
  Object.defineProperty(hostileEntitlements, "0", { enumerable: true, get() { entitlementReads += 1; return "provider.remote"; } });
  hostileEntitlements.length = 1;
  assert.equal(normalizeProviderEntitlements(hostileEntitlements), null);
  assert.equal(entitlementReads, 0);
});

test("Edge dispatch sends the exact configured model with bounded tokens and reports measured cost", async () => {
  const calls = [];
  const result = await callConfiguredProvider({
    messages: [{ role: "user", content: "hello" }],
    attempts,
    pricingConfig: pricing,
    selected: { attempt: attempts[0], pricing: pricing.providers[0], budgetUsd: pricing.budgetUsd },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        choices: [{ message: { content: "fixture output" } }],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }), { status: 200 });
    },
  });
  assert.equal(calls.length, 1, "an exact model selection makes one provider request");
  assert.equal(calls[0].url, "https://api.openai.com/v1/chat/completions");
  assert.equal(calls[0].init.signal instanceof AbortSignal, true);
  assert.equal(calls[0].init.headers.Authorization, "Bearer fixture-secret");
  assert.deepEqual(JSON.parse(calls[0].init.body).model, "gpt-fixture");
  assert.ok(JSON.parse(calls[0].init.body).max_tokens <= 1200);
  assert.equal(result.providerId, "openai");
  assert.equal(result.model, "gpt-fixture");
  assert.equal(result.costUsd, 0.00028);
});

test("an explicit model failure does not silently fall back to another provider", async () => {
  const calls = [];
  await assert.rejects(callConfiguredProvider({
    messages: [{ role: "user", content: "hello" }],
    attempts,
    pricingConfig: pricing,
    selected: { attempt: attempts[0], pricing: pricing.providers[0], budgetUsd: pricing.budgetUsd },
    fetchImpl: async (url) => {
      calls.push(url);
      return new Response("{}", { status: 503 });
    },
  }), /request failed/);
  assert.deepEqual(calls, ["https://api.openai.com/v1/chat/completions"]);
});

test("automatic fallback stays inside aggregate reservations and provider cancellation aborts dispatch", async () => {
  const fallbackPricing = parseChatPricingConfig(JSON.stringify({
    budgetUsd: 0.02,
    providers: [
      { id: "openai", model: "gpt-fixture", inputUsdPerMillion: 2, outputUsdPerMillion: 4, maxCostUsd: 0.002 },
      { id: "gemini", model: "gemini-fixture", inputUsdPerMillion: 1, outputUsdPerMillion: 3, maxCostUsd: 0.01 },
    ],
  }));
  const fallbackAttempts = [attempts[0], attempts[1]];
  const calls = [];
  const response = await callConfiguredProvider({
    messages: [{ role: "user", content: "hello" }],
    attempts: fallbackAttempts,
    pricingConfig: fallbackPricing,
    fetchImpl: async (url) => {
      calls.push(url);
      if (url === "https://api.openai.com/v1/chat/completions") return new Response("{}", { status: 503 });
      return new Response(JSON.stringify({ usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } }), { status: 200 });
    },
  });
  assert.deepEqual(calls, [
    "https://api.openai.com/v1/chat/completions",
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-fixture:generateContent?key=fixture-secret-2",
  ]);
  assert.equal(response.providerId, "gemini");
  assert.ok(response.costUsd <= fallbackPricing.budgetUsd);

  const controller = new AbortController();
  const pending = callConfiguredProvider({
    messages: [{ role: "user", content: "hello" }],
    attempts,
    pricingConfig: pricing,
    signal: controller.signal,
    fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      setTimeout(() => controller.abort(), 5);
    }),
  });
  await assert.rejects(pending, { name: "AbortError" });
});

test("explicit provider selection retries one bounded 429 and fails closed on entitlement changes", async () => {
  const retryPricing = parseChatPricingConfig(JSON.stringify({
    budgetUsd: 0.02,
    providers: [
      { id: "openai", model: "gpt-fixture", inputUsdPerMillion: 2, outputUsdPerMillion: 4, maxCostUsd: 0.02 },
    ],
  }));
  let attemptsMade = 0;
  let authorityChecks = 0;
  const result = await callConfiguredProvider({
    messages: [{ role: "user", content: "hello" }],
    attempts,
    pricingConfig: retryPricing,
    selected: { attempt: attempts[0], pricing: retryPricing.providers[0], budgetUsd: retryPricing.budgetUsd },
    authorizeProvider: async ({ providerId }) => { authorityChecks += 1; return providerId === "openai"; },
    fetchImpl: async () => {
      attemptsMade += 1;
      if (attemptsMade === 1) return new Response("", { status: 429, headers: { "Retry-After": "0" } });
      return new Response(JSON.stringify({ choices: [{ message: { content: "fixture" } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }));
    },
  });
  assert.equal(result.providerId, "openai");
  assert.equal(attemptsMade, 2);
  assert.equal(authorityChecks, 2, "rechecks entitlement before dispatch and before returning the response");

  let calls = 0;
  await assert.rejects(callConfiguredProvider({
    messages: [{ role: "user", content: "hello" }], attempts, pricingConfig: pricing,
    selected: { attempt: attempts[0], pricing: pricing.providers[0], budgetUsd: pricing.budgetUsd },
    authorizeProvider: async () => false,
    fetchImpl: async () => { calls += 1; return new Response("{}"); },
  }), { providerEntitlementDenied: true });
  assert.equal(calls, 0);

  let reads = 0;
  let dispatched = 0;
  await assert.rejects(callConfiguredProvider({
    messages: [{ role: "user", content: "hello" }], attempts, pricingConfig: pricing,
    selected: { attempt: attempts[0], pricing: pricing.providers[0], budgetUsd: pricing.budgetUsd },
    authorizeProvider: async () => { reads += 1; return reads === 1; },
    fetchImpl: async () => {
      dispatched += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: "must not escape" } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }));
    },
  }), { providerEntitlementDenied: true });
  assert.equal(dispatched, 1);
});

test("selected 429 recovery honors the server delay and refuses a retry outside the budget", async () => {
  let delayedCalls = 0;
  await assert.rejects(callConfiguredProvider({
    messages: [{ role: "user", content: "hello" }], attempts,
    pricingConfig: parseChatPricingConfig(JSON.stringify({
      budgetUsd: 0.02,
      providers: [{ id: "openai", model: "gpt-fixture", inputUsdPerMillion: 2, outputUsdPerMillion: 4, maxCostUsd: 0.02 }],
    })),
    selected: { attempt: attempts[0], pricing: { ...pricing.providers[0], maxCostUsd: 0.02 } },
    fetchImpl: async () => { delayedCalls += 1; return new Response("", { status: 429, headers: { "Retry-After": "9" } }); },
  }), (error) => error.providerRateLimited && error.retryAfterSeconds === 9);
  assert.equal(delayedCalls, 1, "a long upstream Retry-After is returned instead of retried early");

  let budgetLimitedCalls = 0;
  await assert.rejects(callConfiguredProvider({
    messages: [{ role: "user", content: "hello" }], attempts, pricingConfig: pricing,
    selected: { attempt: attempts[0], pricing: pricing.providers[0], budgetUsd: pricing.budgetUsd },
    fetchImpl: async () => { budgetLimitedCalls += 1; return new Response("", { status: 429, headers: { "Retry-After": "0" } }); },
  }), (error) => error.providerRateLimited && error.retryAfterSeconds === 1);
  assert.equal(budgetLimitedCalls, 1, "the same request is not repeated when a second full reservation exceeds the model cap");
});

test("automatic dispatch exhausts only entitled models and preserves upstream 429 state", async () => {
  await assert.rejects(callConfiguredProvider({
    messages: [{ role: "user", content: "hello" }],
    attempts: [attempts[0]], pricingConfig: pricing,
    fetchImpl: async () => new Response("", { status: 429, headers: { "Retry-After": "9" } }),
  }), (error) => error.providerRateLimited === true && error.retryAfterSeconds === 9);

  let calls = 0;
  const recovered = await callConfiguredProvider({
    messages: [{ role: "user", content: "hello" }], attempts, pricingConfig: pricing,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response("", { status: 429, headers: { "Retry-After": "9" } })
        : new Response(JSON.stringify({ usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } }));
    },
  });
  assert.equal(recovered.providerId, "gemini");
  assert.equal(calls, 2, "Automatic falls back instead of waiting on the rate-limited provider");
});

test("provider authentication and model errors retain only bounded status codes", async () => {
  for (const status of [401, 403, 404]) {
    await assert.rejects(callConfiguredProvider({
      messages: [{ role: "user", content: "hello" }],
      attempts: [attempts[0]], pricingConfig: pricing,
      fetchImpl: async () => new Response("vendor error body with no safe details", { status }),
    }), (error) => error.providerHttpStatus === status && !error.message.includes("vendor error body"));
  }
});

test("Edge model discovery is authenticated and selected provider calls stay bounded and cancellable", async () => {
  const [source, client, page, envExample] = await Promise.all([
    readFile(new URL("../supabase/functions/hey/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/heyAI.js", import.meta.url), "utf8"),
    readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  assert.match(source, /request\.method === "GET" && modelsPath/);
  assert.match(source, /if \(!token\) return jsonResponse\(\{ error: "Authentication required" \}, 401\)/);
  assert.match(source, /authClient\.auth\.getUser\(token\)/);
  assert.match(source, /\.select\("entitlements"\)/);
  assert.match(source, /resolveProviderSelection\(payload\.providerSelection, providerAttempts, chatPricingConfig\)/);
  assert.match(source, /parseChatPricingConfig\(Deno\.env\.get\("HEY_CHAT_PRICING_JSON"\)/);
  assert.match(source, /providerSelection\.status === "selected" \? providerSelection : undefined/);
  assert.match(source, /authorizeProvider: async/);
  assert.match(source, /providerResult = await callConfiguredProvider\([\s\S]*?1200[\s\S]*?request\.signal/);
  assert.match(source, /filterEntitledProviderAttempts\(getProviderAttempts\(\), entitlements\)/);
  assert.match(source, /parseRoutingProfile\(payload\.routingProfile\)/);
  assert.match(source, /providerRateLimited/);
  assert.match(source, /providerEntitlementDenied/);
  assert.match(source, /retryAfterSeconds: 60/);
  assert.match(source, /"Retry-After": "60"/);
  assert.match(source, /code: "provider_credentials_rejected"/);
  assert.match(source, /code: "provider_access_rejected"/);
  assert.doesNotMatch(client, /OPENAI_API_KEY|OPENROUTER_API_KEY|GEMINI_API_KEY|GROQ_API_KEY/);
  assert.doesNotMatch(page, /localStorage\.(?:getItem|setItem)\([^)]*provider(?:Selection|Profile)/i);
  assert.match(envExample, /HEY_CHAT_PRICING_JSON/);
  assert.doesNotMatch(envExample, /VITE_(?:OPENAI|OPENROUTER|GEMINI|GROQ)_API_KEY/);
  assert.match(source, /request\.signal\.aborted \|\| error\?\.name === "AbortError"/);
});

