import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
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

function providerPayload(providerId, value, confidence = 0.9, verificationConfirmed = true) {
  const text = `The answer is ${value}.`;
  const evidence = [{ claimId: "answer", statement: "Exact response text returned by this provider.", value: text, source: "fixture://evidence" }];
  if (verificationConfirmed !== null) evidence.push({
    claimId: "verification",
    statement: "The candidate was independently reviewed.",
    value: verificationConfirmed,
    source: "fixture://review",
  });
  const answer = JSON.stringify({
    text,
    confidence,
    evidence,
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
    const [value, confidence] = answerFor(providerId);
    const isChecker = init.body.includes("Untrusted candidate to verify");
    const candidateValue = isChecker ? answerFor(calls[0]?.providerId || providerId)[0] : value;
    calls.push({ url, init, providerId });
    return new Response(JSON.stringify(providerPayload(providerId, value, confidence, isChecker ? value === candidateValue : null)), { status: 200 });
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

test("Gemini dispatch keeps the API key in a header and out of the request URL", async () => {
  const { calls, fetchImpl } = mockProviderFetch(() => ["42", 0.9]);
  const result = await runFusionChatRequest({ requested: true, accountId: "account-a", entitlements, attempts, pricingConfig: pricing, messages, fetchImpl });
  assert.equal(result.status, "complete");
  const gemini = calls.find((call) => call.providerId === "gemini");
  assert.ok(gemini, "independent checker should use the configured Gemini provider");
  assert.equal(new URL(gemini.url).searchParams.has("key"), false);
  assert.equal(gemini.init.headers["x-goog-api-key"], "fake-gemini-key");
  assert.equal(gemini.init.redirect, "error");
});

test("Gemini redirects are rejected before credentials can reach a second host", async () => {
  const secretKey = "fixture-gemini-key-never-forward";
  const attackerRequests = [];
  let attackerPort;
  const providerRequests = [];
  const providerServer = createServer(async (request, response) => {
    providerRequests.push({ url: request.url, key: request.headers["x-goog-api-key"] });
    response.writeHead(302, { Location: `http://127.0.0.1:${attackerPort}/stolen` });
    response.end("private provider redirect response");
  });
  const attackerServer = createServer((request, response) => {
    attackerRequests.push({ url: request.url, key: request.headers["x-goog-api-key"] });
    response.end("unexpected");
  });
  const listen = (server) => new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
  const close = (server) => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  let providerPort;
  try {
    [providerPort, attackerPort] = await Promise.all([listen(providerServer), listen(attackerServer)]);
    const fetchImpl = async (url, init) => {
      if (String(url).includes("generativelanguage.googleapis.com")) {
        assert.equal(init.redirect, "error");
        assert.equal(new URL(url).searchParams.has("key"), false);
        return fetch(`http://127.0.0.1:${providerPort}/redirect`, init);
      }
      return new Response(JSON.stringify(providerPayload("openai", "42", 0.9, null)), { status: 200 });
    };
    const result = await runFusionChatRequest({
      requested: true,
      accountId: "account-a",
      entitlements,
      attempts: attempts.map((attempt) => attempt.id === "gemini" ? { ...attempt, key: secretKey } : attempt),
      pricingConfig: pricing,
      messages,
      fetchImpl,
    });
    assert.notEqual(result.status, "complete");
    assert.equal("answer" in result, false);
    assert.deepEqual(providerRequests, [{ url: "/redirect", key: secretKey }]);
    assert.deepEqual(attackerRequests, []);
    assert.equal(JSON.stringify(result).includes(secretKey), false);
    assert.equal(JSON.stringify(result).includes("private provider redirect response"), false);
  } finally {
    await Promise.all([close(providerServer), close(attackerServer)]);
  }
});

test("malformed request identities cannot start a provider call", async () => {
  let calls = 0;
  const result = await runFusionChatRequest({
    requested: true,
    requestId: "request-from-another-turn",
    accountId: "auth-user-123",
    entitlements,
    attempts,
    pricingConfig: pricing,
    messages,
    fetchImpl: async () => { calls += 1; throw new Error("must not dispatch"); },
  });
  assert.deepEqual(result, { status: "invalid_request", reason: "fusion_request_id_invalid" });
  assert.equal(calls, 0);
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
  const requestText = "What is the fixture answer?";
  const result = await runFusionChatRequest({ requested: true, requestText, accountId: "auth-user-123", entitlements, attempts, pricingConfig: pricing, messages, fetchImpl });
  assert.equal(result.status, "complete");
  assert.equal(result.independentlyChecked, true);
  assert.equal(result.answer, "The answer is 42.");
  assert.equal(result.evidence.length, 3);
  assert.equal(result.provenance.status, "verified");
  assert.match(result.provenance.requestId, /^[0-9a-f-]{36}$/i);
  assert.match(result.provenance.requestSha256, /^[0-9a-f]{64}$/i);
  const expectedRequestDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(requestText)));
  assert.equal(result.provenance.requestSha256, Array.from(expectedRequestDigest, (byte) => byte.toString(16).padStart(2, "0")).join(""));
  assert.match(result.provenance.answerSha256, /^[0-9a-f]{64}$/i);
  assert.equal(result.provenance.primary.role, "primary");
  assert.equal(result.provenance.primary.providerId, calls[0].providerId);
  assert.equal(result.provenance.checker.role, "checker");
  assert.equal(result.provenance.checker.providerId, calls[1].providerId);
  assert.equal(result.provenance.checker.verificationClaimId, "verification");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.providerId).sort(), ["gemini", "openai"]);
  assert.equal(calls.every(({ init }) => init.method === "POST" && init.signal instanceof AbortSignal), true);
  assert.equal(calls[0].init.body.includes("Return only JSON"), true);
  assert.equal(calls[1].init.body.includes("Independently verify its answer"), true);
  assert.equal(calls[1].init.body.includes("The answer is 42."), true);
  assert.equal(JSON.parse(calls[1].init.body).messages.at(-1).role, "user");
  assert.equal(calls[1].init.body.includes('"claimId":"verification"'), false, "the candidate evidence itself remains untrusted input");
  assert.equal(result.accountScope, undefined);
});

test("oversized provider response streams are cancelled before the body is fully buffered", async () => {
  let cancelled = 0;
  let calls = 0;
  const result = await runFusionChatRequest({
    requested: true,
    accountId: "auth-user-123",
    entitlements,
    attempts,
    pricingConfig: pricing,
    messages,
    fetchImpl: async () => {
      calls += 1;
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(1_000_001));
        },
        cancel() {
          cancelled += 1;
        },
      }));
    },
  });
  assert.equal(cancelled, 2);
  assert.equal(calls, 2);
  assert.notEqual(result.status, "complete");
  assert.equal("answer" in result, false);
});

test("declared oversized provider bodies are rejected before reading even when cancel never settles", async () => {
  let cancelCount = 0;
  let pullCount = 0;
  let calls = 0;
  const resultPromise = runFusionChatRequest({
    requested: true,
    accountId: "auth-user-123",
    entitlements,
    attempts,
    pricingConfig: pricing,
    messages,
    fetchImpl: async () => {
      calls += 1;
      return new Response(new ReadableStream({
        pull() {
          pullCount += 1;
        },
        cancel() {
          cancelCount += 1;
          return new Promise(() => {});
        },
      }, { highWaterMark: 0 }), {
        headers: { "Content-Length": "1000001" },
      });
    },
  });
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => { timeoutId = setTimeout(() => resolve(null), 100); });
  const result = await Promise.race([resultPromise, timeoutPromise]);
  clearTimeout(timeoutId);

  assert.notEqual(result, null, "oversized-body cleanup must not stall provider fallback");
  assert.equal(calls, 2);
  assert.equal(cancelCount, 2);
  assert.equal(pullCount, 0);
  assert.notEqual(result.status, "complete");
  assert.equal("answer" in result, false);
});

test("aborting while a provider body is streaming cancels its reader and withholds partial vendor text", async () => {
  const controller = new AbortController();
  let cancelCount = 0;
  let calls = 0;
  let markFetchStarted;
  const fetchStarted = new Promise((resolve) => { markFetchStarted = resolve; });
  const resultPromise = runFusionChatRequest({
    requested: true,
    accountId: "auth-user-123",
    entitlements,
    attempts,
    pricingConfig: pricing,
    messages,
    signal: controller.signal,
    fetchImpl: async () => {
      calls += 1;
      markFetchStarted();
      return new Response(new ReadableStream({
        start(stream) {
          stream.enqueue(new TextEncoder().encode("PRIVATE VENDOR RESPONSE BODY"));
        },
        cancel() {
          cancelCount += 1;
        },
      }));
    },
  });
  await fetchStarted;
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();

  const result = await resultPromise;
  assert.equal(result.status, "cancelled");
  assert.equal(calls, 1);
  assert.equal(cancelCount, 1);
  assert.equal("answer" in result, false);
  assert.equal(JSON.stringify(result).includes("PRIVATE VENDOR RESPONSE BODY"), false);
});

test("a late provider response after abort is cancelled without fallback or partial output", async () => {
  const controller = new AbortController();
  let cancelCount = 0;
  let calls = 0;
  let markFetchStarted;
  const fetchStarted = new Promise((resolve) => { markFetchStarted = resolve; });
  const resultPromise = runFusionChatRequest({
    requested: true,
    accountId: "auth-user-123",
    entitlements,
    attempts,
    pricingConfig: pricing,
    messages,
    signal: controller.signal,
    fetchImpl: (_url, init) => new Promise((resolve) => {
      calls += 1;
      markFetchStarted();
      init.signal.addEventListener("abort", () => {
        resolve(new Response(new ReadableStream({
          start(stream) {
            stream.enqueue(new TextEncoder().encode("PRIVATE LATE PROVIDER BODY"));
          },
          cancel() {
            cancelCount += 1;
          },
        })));
      }, { once: true });
    }),
  });
  await fetchStarted;
  controller.abort();

  const result = await resultPromise;
  assert.equal(result.status, "cancelled");
  assert.equal(calls, 1);
  assert.equal(cancelCount, 1);
  assert.equal("answer" in result, false);
  assert.equal(JSON.stringify(result).includes("PRIVATE LATE PROVIDER BODY"), false);
});

test("provider HTTP failure bodies are cancelled without parsing or exposing vendor diagnostics", async () => {
  let cancelCount = 0;
  let calls = 0;
  const resultPromise = runFusionChatRequest({
    requested: true,
    accountId: "auth-user-123",
    entitlements,
    attempts,
    pricingConfig: pricing,
    messages,
    fetchImpl: async () => {
      calls += 1;
      return new Response(new ReadableStream({
        start(stream) {
          stream.enqueue(new TextEncoder().encode("PRIVATE_VENDOR_DIAGNOSTIC_TOKEN=not-for-client"));
        },
        cancel() {
          cancelCount += 1;
          return new Promise(() => {});
        },
      }), { status: 429 });
    },
  });
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => { timeoutId = setTimeout(() => resolve(null), 100); });
  const result = await Promise.race([resultPromise, timeoutPromise]);
  clearTimeout(timeoutId);
  assert.notEqual(result, null, "a stalled provider-body cancellation must not stall fallback");
  assert.equal(calls, 2);
  assert.equal(cancelCount, 2);
  assert.notEqual(result.status, "complete");
  assert.equal("answer" in result, false);
  assert.equal(JSON.stringify(result).includes("PRIVATE_VENDOR_DIAGNOSTIC_TOKEN"), false);
});

test("provider failure fallback rechecks the exact checker grant before another dispatch", async () => {
  let revokedCheckerId = null;
  let cancelCount = 0;
  const providerCalls = [];
  const result = await runFusionChatRequest({
    requested: true,
    accountId: "auth-user-123",
    entitlements,
    attempts,
    pricingConfig: pricing,
    messages,
    fetchImpl: async (url) => {
      const providerId = url.includes("api.openai.com") ? "openai" : "gemini";
      providerCalls.push(providerId);
      return new Response(new ReadableStream({
        start(stream) {
          stream.enqueue(new TextEncoder().encode("PRIVATE_PRIMARY_FAILURE_DIAGNOSTIC"));
        },
        cancel() {
          cancelCount += 1;
          revokedCheckerId = providerId === "openai" ? "gemini" : "openai";
        },
      }), { status: 429 });
    },
    getCurrentEntitlements: async () => revokedCheckerId
      ? entitlements.filter((grant) => grant !== `provider:${revokedCheckerId}`)
      : entitlements,
  });
  assert.equal(result.status, "denied");
  assert.equal(result.reason, "provider_permission_revoked");
  assert.equal(providerCalls.length, 1);
  assert.notEqual(providerCalls[0], revokedCheckerId);
  assert.equal(cancelCount, 1);
  assert.equal("answer" in result, false);
  assert.equal(JSON.stringify(result).includes("PRIVATE_PRIMARY_FAILURE_DIAGNOSTIC"), false);
});

test("fusion disagreement returns no answer and stale account scope cancels before any provider HTTP call", async (t) => {
  await t.test("providers disagree", async () => {
    const { calls, fetchImpl } = mockProviderFetch((providerId) => [providerId === "openai" ? "42" : "43", 0.9]);
    const result = await runFusionChatRequest({ requested: true, accountId: "auth-user-123", entitlements, attempts, pricingConfig: pricing, messages, fetchImpl });
    assert.equal(result.status, "provider_contract_invalid");
    assert.equal(result.reason, "checker_verification_not_confirmed");
    assert.equal("answer" in result, false);
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
      const evidence = [
        { claimId: "answer", statement: "Exact response text returned by this provider.", value: "The providers disagree.", source: null },
        ...(calls.length > 1 ? [{ claimId: "verification", statement: "The answer is supported by the conversation.", value: true, source: null }] : []),
        ...makeEvidence(providerId),
      ];
      const answer = JSON.stringify({ text: "The providers disagree.", confidence: 0.9, evidence });
      return providerId === "gemini"
        ? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: answer }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20 } }), { status: 200 })
        : new Response(JSON.stringify({ choices: [{ message: { content: answer } }], usage: { prompt_tokens: 50, completion_tokens: 20 } }), { status: 200 });
    };
    const result = await runFusionChatRequest({ requested: true, accountId: "account-a", entitlements, attempts, pricingConfig: pricing, messages, fetchImpl });
    return { calls, result };
  };

  await t.test("duplicate claim ids produce one independent conflict", async () => {
    const { calls, result } = await runWithEvidence((providerId) => Array.from({ length: 30 }, () => ({
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
    const { result } = await runWithEvidence((providerId) => Array.from({ length: 30 }, (_, index) => ({
      claimId: `claim-${index}`,
      statement: `Claim ${index} differs between providers.`,
      value: providerId === "openai" ? index : index + 100,
      source: null,
    })));
    assert.equal(result.status, "conflict");
    assert.equal(result.answer, null);
    assert.equal(result.conflicts.length, 16);
    assert.equal(result.conflictsTruncated, true);
    assert.equal(result.evidence.length, 63);
  });
});

test("Fusion withholds the candidate when verifier evidence does not bind to its response", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const providerId = url.includes("generativelanguage.googleapis.com") ? "gemini" : "openai";
    calls.push(providerId);
    const text = "The answer is 42.";
    const evidence = [{
      claimId: "answer",
      statement: "Exact response text returned by this provider.",
      value: providerId === "gemini" ? "The answer is 43." : text,
      source: null,
    }, ...(providerId === "gemini" ? [{ claimId: "verification", statement: "The candidate was reviewed.", value: true, source: null }] : [])];
    const answer = JSON.stringify({ text, confidence: 0.9, evidence });
    return providerId === "gemini"
      ? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: answer }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20 } }), { status: 200 })
      : new Response(JSON.stringify({ choices: [{ message: { content: answer } }], usage: { prompt_tokens: 50, completion_tokens: 20 } }), { status: 200 });
  };
  const result = await runFusionChatRequest({ requested: true, accountId: "account-a", entitlements, attempts, pricingConfig: pricing, messages, fetchImpl });
  assert.equal(result.status, "verification_unavailable");
  assert.equal(result.reason, "independent_provider_failed");
  assert.equal(calls.length, 2);
  assert.equal("answer" in result, false);
});

test("oversized candidate evidence cannot be sent to the checker or escape as an answer", async () => {
  let calls = 0;
  const primaryText = "The answer is 42.";
  const primaryOutput = JSON.stringify({
    text: primaryText,
    confidence: 0.9,
    evidence: [
      { claimId: "answer", statement: "Exact response text returned by this provider.", value: primaryText, source: null },
      ...Array.from({ length: 20 }, (_, index) => ({
        claimId: `claim-${index}`,
        statement: "Evidence detail ".repeat(30),
        value: index,
        source: null,
      })),
    ],
  });
  const fetchImpl = async (url) => {
    calls += 1;
    const providerId = url.includes("generativelanguage.googleapis.com") ? "gemini" : "openai";
    const data = providerId === "gemini"
      ? { candidates: [{ content: { parts: [{ text: primaryOutput }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20 } }
      : { choices: [{ message: { content: primaryOutput } }], usage: { prompt_tokens: 50, completion_tokens: 20 } };
    return new Response(JSON.stringify(data), { status: 200 });
  };
  const result = await runFusionChatRequest({ requested: true, accountId: "account-a", entitlements, attempts, pricingConfig: pricing, messages, fetchImpl });
  assert.equal(result.status, "verification_unavailable");
  assert.equal(result.reason, "independent_provider_failed");
  assert.equal(calls, 1);
  assert.equal("answer" in result, false);
});

test("primary cannot forge checker provenance with its own verification claim", async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    const providerId = url.includes("generativelanguage.googleapis.com") ? "gemini" : "openai";
    const text = "The answer is 42.";
    const answer = JSON.stringify({
      text,
      confidence: 0.9,
      evidence: [
        { claimId: "answer", statement: "Exact response text returned by this provider.", value: text, source: null },
        { claimId: "verification", statement: "This provider claims it checked the candidate.", value: true, source: null },
      ],
    });
    calls += 1;
    const data = providerId === "gemini"
      ? { candidates: [{ content: { parts: [{ text: answer }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20 } }
      : { choices: [{ message: { content: answer } }], usage: { prompt_tokens: 50, completion_tokens: 20 } };
    return new Response(JSON.stringify(data), { status: 200 });
  };
  const result = await runFusionChatRequest({ requested: true, accountId: "account-a", entitlements, attempts, pricingConfig: pricing, messages, fetchImpl });
  assert.equal(result.status, "inconclusive");
  assert.equal(result.reason, "independent_evidence_did_not_confirm_answer");
  assert.equal(calls, 2);
  assert.equal("answer" in result, false);
  assert.equal("provenance" in result, false);
});

test("Edge chat explains verification, time, cost, and provider-contract failures without leaking details", async () => {
  const route = await readFile(new URL("../supabase/functions/hey/index.ts", import.meta.url), "utf8");
  assert.match(route, /models\/\$\{provider\.model\}:generateContent/);
  assert.match(route, /models\/\$\{encodeURIComponent\(attempt\.model\)\}:generateContent/);
  assert.match(route, /"x-goog-api-key": provider\.key/);
  assert.match(route, /"x-goog-api-key": attempt\.key/);
  assert.equal([...route.matchAll(/"x-goog-api-key": (?:provider|attempt)\.key[\s\S]{0,80}?redirect: "error"/g)].length, 2);
  assert.doesNotMatch(route, /generateContent\?key=\$\{(?:provider|attempt)\.key\}/);
  assert.match(route, /\["conflict", "inconclusive", "verification_unavailable", "time_budget_exhausted", "budget_exhausted", "provider_contract_invalid"\]\.includes\(fusion\.status\)/);
  assert.match(route, /fusion\.status === "verification_unavailable"[\s\S]*?no answer was delivered/i);
  assert.match(route, /fusion\.status === "time_budget_exhausted"[\s\S]*?no answer was delivered/i);
  assert.match(route, /fusion\.status === "budget_exhausted"[\s\S]*?no answer was delivered/i);
  assert.match(route, /fusion\.status === "provider_contract_invalid"[\s\S]*?no answer was delivered/i);
  assert.match(route, /latestProfileQuery\.abortSignal\(signal\)/);
  assert.match(route, /requestId: payload\.requestId/);
  assert.match(route, /requestText: message/);
  assert.match(route, /fusion\.provenance\?\.status !== "verified"[\s\S]*?No answer was delivered/i);
  assert.match(route, /provenance: fusion\.provenance/);
  assert.match(route, /providerReportedUsd: fusion\.costUsd/);
  assert.match(route, /reservedUsd: fusion\.reservedCostUsd/);
  assert.match(route, /requestCapUsd: fusion\.requestCapUsd/);
});

test("Edge chat checks cancellation after verification and before persisting, and aborts an in-flight insert", async () => {
  const route = await readFile(new URL("../supabase/functions/hey/index.ts", import.meta.url), "utf8");
  const hashPosition = route.indexOf("responseSha256: await sha256Hex(answer)");
  const persistencePosition = route.indexOf('from("hey_messages").insert([');
  const cancellationPosition = route.lastIndexOf("if (request.signal.aborted)", persistencePosition);
  assert.ok(hashPosition >= 0 && persistencePosition > hashPosition);
  assert.ok(cancellationPosition > hashPosition && cancellationPosition < persistencePosition);
  assert.match(route.slice(persistencePosition, persistencePosition + 600), /\.abortSignal\(request\.signal\)/);
  const persistenceBlock = route.slice(persistencePosition, persistencePosition + 1400);
  assert.match(persistenceBlock, /if \(request\.signal\.aborted\)/);
  assert.match(persistenceBlock, /catch \(error\)[\s\S]*?error as Error\)\?\.name === "AbortError"/);
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

test("verified fusion receipts carry the exact server request cap and provider-reported usage", async () => {
  const { fetchImpl } = mockProviderFetch(() => ["42", 0.9]);
  const result = await runFusionChatRequest({
    requested: true,
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    accountId: "auth-user-123",
    entitlements,
    attempts,
    pricingConfig: pricing,
    messages,
    fetchImpl,
  });
  assert.equal(result.status, "complete");
  assert.equal(result.requestCapUsd, pricing.budgetUsd);
  assert.ok(result.costUsd >= 0);
  assert.ok(result.reservedCostUsd >= result.costUsd);
  assert.ok(result.reservedCostUsd <= result.requestCapUsd);
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
  await t.test("mid-call grant revocation blocks the checker dispatch", async () => {
    const { calls, fetchImpl } = mockProviderFetch(() => ["42", 0.9]);
    let revokedProviderId = null;
    const result = await runFusionChatRequest({
      requested: true,
      accountId: "auth-user-123",
      entitlements,
      attempts,
      pricingConfig: pricing,
      messages,
      fetchImpl: async (...args) => {
        const response = await fetchImpl(...args);
        revokedProviderId = calls[0].providerId;
        return response;
      },
      getCurrentEntitlements: async (accountId) => {
        assert.equal(accountId, "auth-user-123");
        return revokedProviderId
          ? entitlements.filter((grant) => grant !== `provider:${revokedProviderId}`)
          : entitlements;
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(result.status, "denied");
    assert.equal(result.reason, "provider_permission_revoked");
    assert.equal(result.calls, 1);
    assert.equal("answer" in result, false);
  });

  await t.test("revalidation outage fails closed after the provider calls", async () => {
    const { calls, fetchImpl } = mockProviderFetch(() => ["42", 0.9]);
    let authorityChecks = 0;
    const result = await runFusionChatRequest({
      requested: true,
      accountId: "auth-user-123",
      entitlements,
      attempts,
      pricingConfig: pricing,
      messages,
      fetchImpl,
      getCurrentEntitlements: async () => {
        authorityChecks += 1;
        if (authorityChecks === 5) throw new Error("private database error");
        return entitlements;
      },
    });
    assert.deepEqual(result, { status: "unconfigured", reason: "authorization_revalidation_failed" });
    assert.equal(calls.length, 2);
    assert.equal(JSON.stringify(result).includes("private database error"), false);
    assert.equal("answer" in result, false);
  });

  await t.test("initial authority outage prevents all provider calls", async () => {
    let calls = 0;
    const result = await runFusionChatRequest({
      requested: true,
      accountId: "auth-user-123",
      entitlements,
      attempts,
      pricingConfig: pricing,
      messages,
      fetchImpl: async () => { calls += 1; throw new Error("must not dispatch"); },
      getCurrentEntitlements: async () => { throw new Error("private database error"); },
    });
    assert.deepEqual(result, { status: "unconfigured", reason: "authorization_revalidation_failed", calls: 0, reservedCostUsd: 0 });
    assert.equal(calls, 0);
  });
});

test("mid-call authority revocation aborts the cooperative provider and prevents checker dispatch", async () => {
  const calls = [];
  let revokedProviderId = null;
  let providerAborted = false;
  const fetchImpl = async (url, init) => {
    const providerId = url.includes("generativelanguage.googleapis.com") ? "gemini" : "openai";
    calls.push(providerId);
    return await new Promise((_resolve, reject) => {
      const revokeTimer = setTimeout(() => { revokedProviderId = providerId; }, 25);
      init.signal.addEventListener("abort", () => {
        providerAborted = true;
        clearTimeout(revokeTimer);
        reject(new Error("provider fetch aborted"));
      }, { once: true });
    });
  };
  const result = await runFusionChatRequest({
    requested: true,
    accountId: "auth-user-123",
    entitlements,
    attempts,
    pricingConfig: pricing,
    messages,
    authorityRecheckIntervalMs: 5,
    fetchImpl,
    getCurrentEntitlements: async () => revokedProviderId
      ? entitlements.filter((grant) => grant !== `provider:${revokedProviderId}`)
      : entitlements,
  });
  assert.equal(result.status, "denied");
  assert.equal(result.reason, "provider_permission_revoked");
  assert.equal(result.calls, 1);
  assert.equal(providerAborted, true);
  assert.equal(calls.length, 1);
  assert.equal("answer" in result, false);
});

test("mid-checker authority revocation aborts the checker and withholds the candidate", async () => {
  const primary = mockProviderFetch(() => ["42", 0.9]);
  const calls = [];
  let revokedProviderId = null;
  let checkerAborted = false;
  const fetchImpl = async (url, init) => {
    const providerId = url.includes("generativelanguage.googleapis.com") ? "gemini" : "openai";
    calls.push(providerId);
    if (calls.length === 1) return await primary.fetchImpl(url, init);
    return await new Promise((_resolve, reject) => {
      const revokeTimer = setTimeout(() => { revokedProviderId = providerId; }, 25);
      init.signal.addEventListener("abort", () => {
        checkerAborted = true;
        clearTimeout(revokeTimer);
        reject(new Error("checker fetch aborted"));
      }, { once: true });
    });
  };
  const result = await runFusionChatRequest({
    requested: true,
    accountId: "auth-user-123",
    entitlements,
    attempts,
    pricingConfig: pricing,
    messages,
    authorityRecheckIntervalMs: 5,
    fetchImpl,
    getCurrentEntitlements: async () => revokedProviderId
      ? entitlements.filter((grant) => grant !== `provider:${revokedProviderId}`)
      : entitlements,
  });
  assert.equal(result.status, "denied");
  assert.equal(result.reason, "provider_permission_revoked");
  assert.equal(result.calls, 2);
  assert.equal(checkerAborted, true);
  assert.equal(calls.length, 2);
  assert.equal("answer" in result, false);
});
