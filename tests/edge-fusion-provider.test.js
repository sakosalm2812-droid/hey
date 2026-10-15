import test from "node:test";
import assert from "node:assert/strict";
import { parseFusionPricingConfig, runFusionChatRequest } from "../supabase/functions/hey/fusionProvider.js";

const pricingText = JSON.stringify({
  budgetUsd: 0.05,
  minConfidence: 0.72,
  providers: [
    { id: "openai", model: "fixture-openai", inputUsdPerMillion: 1, outputUsdPerMillion: 2, maxCostUsd: 0.02 },
    { id: "gemini", model: "fixture-gemini", inputUsdPerMillion: 1, outputUsdPerMillion: 2, maxCostUsd: 0.02 },
  ],
});
const pricing = parseFusionPricingConfig(pricingText);
const attempts = [
  { id: "openai", model: "fixture-openai", key: "fake-openai-key" },
  { id: "gemini", model: "fixture-gemini", key: "fake-gemini-key" },
];
const entitlements = ["hey.fusion", "provider.remote", "provider:openai", "provider:gemini"];
const messages = [
  { role: "system", content: "You are HEY." },
  { role: "user", content: "What is the fixture answer?" },
];

function providerPayload(providerId, value, confidence = 0.9) {
  const answer = JSON.stringify({
    text: `The answer is ${value}.`,
    confidence,
    evidence: [{ claimId: "fixture-answer", statement: `The answer is ${value}.`, value, source: "fixture://evidence" }],
  });
  return providerId === "gemini"
    ? { candidates: [{ content: { parts: [{ text: answer }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20 } }
    : { choices: [{ message: { content: answer } }], usage: { prompt_tokens: 50, completion_tokens: 20 } };
}

function mockProviderFetch(answerFor) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const providerId = url.includes("generativelanguage.googleapis.com") ? "gemini"
      : url.includes("api.openai.com") ? "openai"
      : url.includes("openrouter.ai") ? "openrouter"
      : url.includes("api.groq.com") ? "groq"
      : "unknown";
    calls.push({ url, init, providerId });
    return new Response(JSON.stringify(providerPayload(providerId, ...answerFor(providerId))), { status: 200 });
  };
  return { calls, fetchImpl };
}

test("fusion is not invoked by default, so the normal chat path makes no added provider HTTP call", async () => {
  let calls = 0;
  const result = await runFusionChatRequest({
    requested: false,
    fetchImpl: async () => { calls += 1; throw new Error("must not call"); },
  });
  assert.equal(result.status, "not_requested");
  assert.equal(calls, 0);
});

test("server price config rejects client-shaped, unknown, duplicate, and unsafe rates", () => {
  assert.equal(parseFusionPricingConfig(null), null);
  assert.equal(parseFusionPricingConfig(JSON.stringify({ ...JSON.parse(pricingText), clientBudgetUsd: 0 })), null);
  const duplicated = JSON.parse(pricingText);
  duplicated.providers[1].id = "openai";
  assert.equal(parseFusionPricingConfig(JSON.stringify(duplicated)), null);
  const unsafe = JSON.parse(pricingText);
  unsafe.providers[0].inputUsdPerMillion = 1_000_000;
  assert.equal(parseFusionPricingConfig(JSON.stringify(unsafe)), null);
});

test("fusion permission and exact provider entitlements are required before HTTP dispatch", async (t) => {
  const { calls, fetchImpl } = mockProviderFetch(() => ["42", 0.9]);
  await t.test("feature permission missing", async () => {
    const denied = await runFusionChatRequest({ requested: true, accountId: "account-a", entitlements: [], attempts, pricingConfig: pricing, messages, fetchImpl });
    assert.equal(denied.status, "denied");
    assert.equal(calls.length, 0);
  });
  await t.test("one provider grant missing", async () => {
    const denied = await runFusionChatRequest({ requested: true, accountId: "account-a", entitlements: entitlements.filter((grant) => grant !== "provider:gemini"), attempts, pricingConfig: pricing, messages, fetchImpl });
    assert.equal(denied.status, "denied");
    assert.equal(calls.length, 0);
  });
});

test("fusion fails closed when trusted per-model pricing or the second independent provider is missing", async (t) => {
  let calls = 0;
  await t.test("missing pricing", async () => {
    const result = await runFusionChatRequest({ requested: true, accountId: "account-a", entitlements, attempts, pricingConfig: null, messages, fetchImpl: async () => { calls += 1; } });
    assert.equal(result.status, "unconfigured");
    assert.equal(calls, 0);
  });
  await t.test("second API key absent", async () => {
    const result = await runFusionChatRequest({ requested: true, accountId: "account-a", entitlements, attempts: [attempts[0]], pricingConfig: pricing, messages, fetchImpl: async () => { calls += 1; } });
    assert.equal(result.status, "denied");
    assert.equal(calls, 0);
  });
  assert.equal(calls, 0);
});

test("Fusion dispatches two mocked provider HTTP requests and returns only a checked matching answer", async () => {
  const { calls, fetchImpl } = mockProviderFetch(() => ["42", 0.9]);
  const result = await runFusionChatRequest({ requested: true, accountId: "auth-user-123", entitlements, attempts, pricingConfig: pricing, messages, fetchImpl });
  assert.equal(result.status, "complete");
  assert.equal(result.independentlyChecked, true);
  assert.equal(result.answer, "The answer is 42.");
  assert.equal(result.evidence.length, 2);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.providerId).sort(), ["gemini", "openai"]);
  assert.equal(calls.every(({ init }) => init.method === "POST" && init.signal instanceof AbortSignal), true);
  assert.equal(calls.every(({ init }) => init.body.includes("Return only JSON")), true);
  assert.equal(result.accountScope, undefined);
});

test("fusion disagreement returns no answer and stale account scope cancels before any provider HTTP call", async (t) => {
  await t.test("providers disagree", async () => {
    const { calls, fetchImpl } = mockProviderFetch((providerId) => [providerId === "openai" ? "42" : "43", 0.9]);
    const result = await runFusionChatRequest({ requested: true, accountId: "auth-user-123", entitlements, attempts, pricingConfig: pricing, messages, fetchImpl });
    assert.equal(result.status, "conflict");
    assert.equal(result.answer, null);
    assert.equal(calls.length, 2);
  });
  await t.test("account scope no longer current", async () => {
    let calls = 0;
    const result = await runFusionChatRequest({
      requested: true, accountId: "auth-user-123", entitlements, attempts, pricingConfig: pricing, messages,
      isCurrent: () => false,
      fetchImpl: async () => { calls += 1; },
    });
    assert.equal(result.status, "cancelled");
    assert.equal(calls, 0);
  });
});

test("hostile provider evidence cannot multiply or exceed the bounded conflict summary", async (t) => {
  const runWithEvidence = async (makeEvidence) => {
    const calls = [];
    const fetchImpl = async (url) => {
      const providerId = url.includes("generativelanguage.googleapis.com") ? "gemini" : "openai";
      calls.push(providerId);
      const evidence = makeEvidence(providerId);
      const answer = JSON.stringify({ text: "The providers disagree.", confidence: 0.9, evidence });
      return providerId === "gemini"
        ? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: answer }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20 } }), { status: 200 })
        : new Response(JSON.stringify({ choices: [{ message: { content: answer } }], usage: { prompt_tokens: 50, completion_tokens: 20 } }), { status: 200 });
    };
    const result = await runFusionChatRequest({ requested: true, accountId: "account-a", entitlements, attempts, pricingConfig: pricing, messages, fetchImpl });
    return { calls, result };
  };

  await t.test("duplicate claim ids produce one independent conflict", async () => {
    const { calls, result } = await runWithEvidence((providerId) => Array.from({ length: 32 }, () => ({
      claimId: "same-claim",
      statement: "The providers returned different values.",
      value: providerId === "openai" ? "alpha" : "beta",
      source: null,
    })));
    assert.equal(result.status, "conflict");
    assert.equal(result.answer, null);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflictsTruncated, false);
    assert.equal(calls.length, 2);
  });

  await t.test("more than the report cap is flagged and truncated", async () => {
    const { result } = await runWithEvidence((providerId) => Array.from({ length: 32 }, (_, index) => ({
      claimId: `claim-${index}`,
      statement: `Claim ${index} differs between providers.`,
      value: providerId === "openai" ? index : index + 100,
      source: null,
    })));
    assert.equal(result.status, "conflict");
    assert.equal(result.answer, null);
    assert.equal(result.conflicts.length, 16);
    assert.equal(result.conflictsTruncated, true);
    assert.equal(result.evidence.length, 64);
  });
});

test("server budget prevents the independent provider call when its reservation would exceed the cap", async () => {
  const constrainedPricing = parseFusionPricingConfig(JSON.stringify({
    budgetUsd: 0.03,
    minConfidence: 0.72,
    providers: pricing.providers.map((provider) => ({ ...provider, inputUsdPerMillion: 0, outputUsdPerMillion: 1_000, maxCostUsd: 0.02 })),
  }));
  const { calls, fetchImpl } = mockProviderFetch(() => ["42", 0.2]);
  const result = await runFusionChatRequest({ requested: true, accountId: "auth-user-123", entitlements, attempts, pricingConfig: constrainedPricing, messages, fetchImpl });
  assert.equal(result.status, "budget_exhausted");
  assert.equal(calls.length, 0);
});

test("parallel account requests use immutable request-local provider snapshots", async () => {
  const secondPricing = parseFusionPricingConfig(JSON.stringify({
    budgetUsd: 0.05,
    minConfidence: 0.72,
    providers: [
      { id: "openrouter", model: "fixture-router", inputUsdPerMillion: 1, outputUsdPerMillion: 2, maxCostUsd: 0.02 },
      { id: "groq", model: "fixture-groq", inputUsdPerMillion: 1, outputUsdPerMillion: 2, maxCostUsd: 0.02 },
    ],
  }));
  const secondAttempts = [
    { id: "openrouter", model: "fixture-router", key: "fake-router-key" },
    { id: "groq", model: "fixture-groq", key: "fake-groq-key" },
  ];
  const secondEntitlements = ["hey.fusion", "provider.remote", "provider:openrouter", "provider:groq"];
  const first = mockProviderFetch(() => ["42", 0.9]);
  const second = mockProviderFetch(() => ["42", 0.9]);
  const [firstResult, secondResult] = await Promise.all([
    runFusionChatRequest({ requested: true, accountId: "account-a", entitlements, attempts, pricingConfig: pricing, messages, fetchImpl: first.fetchImpl }),
    runFusionChatRequest({ requested: true, accountId: "account-b", entitlements: secondEntitlements, attempts: secondAttempts, pricingConfig: secondPricing, messages, fetchImpl: second.fetchImpl }),
  ]);
  assert.equal(firstResult.status, "complete");
  assert.equal(secondResult.status, "complete");
  assert.deepEqual(first.calls.map((call) => call.providerId).sort(), ["gemini", "openai"]);
  assert.deepEqual(second.calls.map((call) => call.providerId).sort(), ["groq", "openrouter"]);
});

test("HTTP cancellation aborts the provider fetch and stale output is not returned", async () => {
  const controller = new AbortController();
  let calls = 0;
  const resultPromise = runFusionChatRequest({
    requested: true,
    accountId: "auth-user-123",
    entitlements,
    attempts,
    pricingConfig: pricing,
    messages,
    signal: controller.signal,
    fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
      calls += 1;
      init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      controller.abort();
    }),
  });
  const result = await resultPromise;
  assert.equal(result.status, "cancelled");
  assert.equal(calls, 1);
});

test("provider grants are revalidated after provider work before a fused answer can be returned", async (t) => {
  await t.test("revocation of either selected provider denies the answer", async () => {
    const { calls, fetchImpl } = mockProviderFetch(() => ["42", 0.9]);
    const result = await runFusionChatRequest({
      requested: true,
      accountId: "auth-user-123",
      entitlements,
      attempts,
      pricingConfig: pricing,
      messages,
      fetchImpl,
      getCurrentEntitlements: async (accountId) => {
        assert.equal(accountId, "auth-user-123");
        return entitlements.filter((grant) => grant !== "provider:gemini");
      },
    });
    assert.equal(calls.length, 2);
    assert.deepEqual(result, { status: "denied", reason: "fusion_permission_revoked" });
    assert.equal("answer" in result, false);
  });

  await t.test("revalidation outage fails closed after the provider calls", async () => {
    const { fetchImpl } = mockProviderFetch(() => ["42", 0.9]);
    const result = await runFusionChatRequest({
      requested: true,
      accountId: "auth-user-123",
      entitlements,
      attempts,
      pricingConfig: pricing,
      messages,
      fetchImpl,
      getCurrentEntitlements: async () => { throw new Error("private database error"); },
    });
    assert.deepEqual(result, { status: "unconfigured", reason: "authorization_revalidation_failed" });
    assert.equal(JSON.stringify(result).includes("private database error"), false);
    assert.equal("answer" in result, false);
  });
});
