import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkHEYAIReadiness, getHEYChatError, isSameHEYAccount, listHEYConversations, parseFusionVerificationMetadata, withFusionRequestOptIn } from "../src/lib/heyAI.js";

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
  assert.match(getHEYChatError({ status: 503 }, { error: "Provider pricing is not configured." }, true), /pricing is not configured/i);
  assert.match(getHEYChatError({ status: 409 }, { error: "The verification exceeded its configured cost budget." }, true), /cost budget/i);
  assert.match(getHEYChatError({ status: 409 }, { error: "The independent provider check timed out; no answer was delivered." }, true), /timed out/i);
  assert.match(getHEYChatError({ status: 409 }, {}, true), /No verified response was returned/i);
  assert.match(getHEYChatError({ status: 499 }, {}, true), /cancelled before a verified response/i);
  assert.equal(getHEYChatError({ status: 409 }, { error: "x".repeat(300) }, true).length, 240);
  const interruptedReceipt = {
    fusion: { cost: { providerReportedUsd: 0.003, reservedUsd: 0.04, requestCapUsd: 0.05, callsDispatched: 2, callsMetered: 1, providerAttempts: [
      { providerId: "openai", modelId: "gpt-fixture", role: "primary", usageStatus: "reported" },
      { providerId: "gemini", modelId: "gemini-fixture", role: "checker", usageStatus: "unknown" },
    ] } },
  };
  const interruptedMessage = getHEYChatError({ status: 409 }, { error: "The independent provider check timed out.", ...interruptedReceipt }, true);
  assert.match(interruptedMessage, /Provider-reported usage: \$0\.0030 from 1 metered call/);
  assert.match(interruptedMessage, /Usage for 1 interrupted or unmetered call.*unknown/i);
  assert.match(interruptedMessage, /final billing is unconfirmed/i);
  assert.match(interruptedMessage, /OpenAI gpt-fixture \(primary; usage reported\)/);
  assert.match(interruptedMessage, /Gemini gemini-fixture \(checker; usage unknown\)/);
  const unsafeAttempts = getHEYChatError({ status: 409 }, { error: "Timed out.", fusion: { cost: {
    providerReportedUsd: 0.003, reservedUsd: 0.04, requestCapUsd: 0.05, callsDispatched: 2, callsMetered: 1,
    providerAttempts: [{ providerId: "private diagnostic", modelId: "secret-key", role: "primary", usageStatus: "reported" }],
  } } }, true);
  assert.doesNotMatch(unsafeAttempts, /secret-key|private diagnostic/);
  const notDispatched = getHEYChatError({ status: 409 }, {
    error: "The request exceeded its cost budget.",
    fusion: { cost: { providerReportedUsd: 0, reservedUsd: 0, requestCapUsd: 0.05, callsDispatched: 0, callsMetered: 0 } },
  }, true);
  assert.match(notDispatched, /No provider call was dispatched/);
  assert.doesNotMatch(notDispatched, /billing/i);
  assert.match(getHEYChatError({ status: 500 }, {}, true), /No verified response was returned/i);
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

test("the chat client accepts only request- and answer-bound primary/checker provenance", async () => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const answer = "The checked response.";
  const digestBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(answer)));
  const answerSha256 = Array.from(digestBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const requestText = "What is the checked result?";
  const requestDigestBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(requestText)));
  const requestSha256 = Array.from(requestDigestBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const verified = {
    status: "verified",
    independentlyChecked: true,
    confidence: 0.91,
    responseSha256: answerSha256,
    cost: { providerReportedUsd: 0.021, reservedUsd: 0.04, requestCapUsd: 0.05, callsDispatched: 2, callsMetered: 2 },
    provenance: {
      status: "verified",
      requestId,
      requestSha256,
      answerSha256,
      primary: { role: "primary", providerId: "openai", modelId: "gpt-fixture", answerClaimId: "answer" },
      checker: { role: "checker", providerId: "gemini", modelId: "gemini-fixture", answerClaimId: "answer", verificationClaimId: "verification", confirmed: true },
    },
  };
  const parsed = await parseFusionVerificationMetadata(verified, { answer, requestId, requestText });
  assert.equal(parsed.status, "verified");
  assert.equal(parsed.requestId, requestId);
  assert.equal(parsed.requestSha256, requestSha256);
  assert.equal(parsed.primary.providerId, "openai");
  assert.equal(parsed.checker.providerId, "gemini");
  assert.deepEqual(parsed.cost, { providerReportedUsd: 0.021, reservedUsd: 0.04, requestCapUsd: 0.05, callsDispatched: 2, callsMetered: 2 });
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(await parseFusionVerificationMetadata({ ...verified, provenance: { ...verified.provenance, checker: { ...verified.provenance.checker, confirmed: false } } }, { answer, requestId, requestText }), null);
  assert.equal(await parseFusionVerificationMetadata({ ...verified, provenance: { ...verified.provenance, checker: { ...verified.provenance.checker, providerId: "openai" } } }, { answer, requestId, requestText }), null);
  assert.equal(await parseFusionVerificationMetadata(verified, { answer: "A replayed answer.", requestId, requestText }), null);
  assert.equal(await parseFusionVerificationMetadata(verified, { answer, requestId: "123e4567-e89b-42d3-a456-426614174001", requestText }), null);
  assert.equal(await parseFusionVerificationMetadata(verified, { answer, requestId, requestText: "A different prompt using the same request ID." }), null);
  const hostile = {};
  Object.defineProperty(hostile, "status", { enumerable: true, get: () => "verified" });
  assert.equal(await parseFusionVerificationMetadata(hostile, { answer, requestId, requestText }), null);
  const hostileProxy = new Proxy({}, { get() { throw new Error("hostile getter"); } });
  assert.equal(await parseFusionVerificationMetadata(hostileProxy, { answer, requestId, requestText }), null);
  for (const cost of [
    { providerReportedUsd: -0.01, reservedUsd: 0.04, requestCapUsd: 0.05 },
    { providerReportedUsd: 0.06, reservedUsd: 0.04, requestCapUsd: 0.05 },
    { providerReportedUsd: 0.02, reservedUsd: 0.06, requestCapUsd: 0.05 },
    { providerReportedUsd: 0.02, reservedUsd: 0.04, requestCapUsd: 0.26 },
  ]) {
    assert.equal(await parseFusionVerificationMetadata({ ...verified, cost: { ...cost, callsDispatched: 2, callsMetered: 2 } }, { answer, requestId, requestText }), null);
  }
  assert.equal(await parseFusionVerificationMetadata({ ...verified, cost: { ...verified.cost, callsMetered: 3 } }, { answer, requestId, requestText }), null);
});

test("chat UI exposes Fusion as a per-request checkbox and fences requests on unmount", async () => {
  const [input, page, client, message] = await Promise.all([
    readFile(new URL("../src/components/chat/ChatInput.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/heyAI.js", import.meta.url), "utf8"),
    readFile(new URL("../src/components/chat/ChatMessage.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(input, /checked=\{fusionEnabled\}/);
  assert.match(input, /server applies a per-request cost cap/i);
  assert.match(input, /setFusionEnabled\?\.\(event\.target\.checked\)/);
  assert.match(input, /fusionEnabled = false/);
  assert.match(page, /useEffect\(\(\) => \(\) => \{[\s\S]*?activeRequestControllerRef\.current\?\.abort\(\);[\s\S]*?previewRequestControllerRef\.current\?\.abort\(\);[\s\S]*?\}, \[\]\)/);
  assert.match(page, /fusion: requestedFusion/);
  assert.match(page, /onFusionVerification/);
  assert.match(client, /const execution = fusion \? null : await executeRequest/);
  assert.match(client, /withFusionRequestOptIn\([\s\S]*?\}, fusion\)\)/);
  assert.match(page, /aria-label="Service readiness"/);
  assert.match(page, /provider reachability is confirmed when you send a message/);
  assert.match(page, /Supabase could not load your conversations/);
  assert.match(client, /HEY AI could not be reached/);
  assert.match(client, /parseFusionVerificationMetadata\(data\.fusion,/);
  assert.match(message, /Provider responses agreed for this request/);
  assert.match(message, /not a check against independent sources/i);
  assert.match(message, /scoped to the signed-in account session/i);
  assert.match(message, /primary\.modelId/);
  assert.match(message, /checker\.modelId/);
  assert.match(message, /Provider-reported usage:/);
  assert.match(message, /interrupted or unmetered call/);
  assert.match(message, /Final provider billing may differ/);
  assert.match(message, /role="status"/);
});
