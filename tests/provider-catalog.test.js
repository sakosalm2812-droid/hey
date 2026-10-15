import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  calculateProviderUsageCost,
  listConfiguredProviders,
  parseChatPricingConfig,
  parseProviderSelection,
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

test("Edge model discovery is authenticated and selected provider calls stay bounded and cancellable", async () => {
  const source = await readFile(new URL("../supabase/functions/hey/index.ts", import.meta.url), "utf8");
  assert.match(source, /request\.method === "GET" && modelsPath/);
  assert.match(source, /if \(!token\) return jsonResponse\(\{ error: "Authentication required" \}, 401\)/);
  assert.match(source, /authClient\.auth\.getUser\(token\)/);
  assert.match(source, /resolveProviderSelection\(payload\.providerSelection, providerAttempts, chatPricingConfig\)/);
  assert.match(source, /parseChatPricingConfig\(Deno\.env\.get\("HEY_CHAT_PRICING_JSON"\)/);
  assert.match(source, /providerSelection\.status === "selected" \? providerSelection : undefined/);
  assert.match(source, /providerResult = await callConfiguredProvider\([\s\S]*?1200[\s\S]*?request\.signal/);
  assert.match(source, /request\.signal\.aborted \|\| error\?\.name === "AbortError"/);
});

