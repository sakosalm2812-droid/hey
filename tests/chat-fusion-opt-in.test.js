import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getHEYChatError, isSameHEYAccount, parseFusionVerificationMetadata, withFusionRequestOptIn } from "../src/lib/heyAI.js";

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
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(await parseFusionVerificationMetadata({ ...verified, provenance: { ...verified.provenance, checker: { ...verified.provenance.checker, confirmed: false } } }, { answer, requestId, requestText }), null);
  assert.equal(await parseFusionVerificationMetadata({ ...verified, provenance: { ...verified.provenance, checker: { ...verified.provenance.checker, providerId: "openai" } } }, { answer, requestId, requestText }), null);
  assert.equal(await parseFusionVerificationMetadata(verified, { answer: "A replayed answer.", requestId, requestText }), null);
  assert.equal(await parseFusionVerificationMetadata(verified, { answer, requestId: "123e4567-e89b-42d3-a456-426614174001", requestText }), null);
  assert.equal(await parseFusionVerificationMetadata(verified, { answer, requestId, requestText: "A different prompt using the same request ID." }), null);
  const hostile = {};
  Object.defineProperty(hostile, "status", { enumerable: true, get: () => "verified" });
  assert.equal(await parseFusionVerificationMetadata(hostile, { answer, requestId, requestText }), null);
});

test("chat UI exposes Fusion as a per-request checkbox and fences requests on unmount", async () => {
  const [input, page, client, message] = await Promise.all([
    readFile(new URL("../src/components/chat/ChatInput.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/heyAI.js", import.meta.url), "utf8"),
    readFile(new URL("../src/components/chat/ChatMessage.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(input, /checked=\{fusionEnabled\}/);
  assert.match(input, /setFusionEnabled\?\.\(event\.target\.checked\)/);
  assert.match(input, /fusionEnabled = false/);
  assert.match(page, /useEffect\(\(\) => \(\) => activeRequestControllerRef\.current\?\.abort\(\), \[\]\)/);
  assert.match(page, /fusion: requestedFusion/);
  assert.match(page, /onFusionVerification/);
  assert.match(client, /const execution = fusion \? null : await executeRequest/);
  assert.match(client, /withFusionRequestOptIn\([\s\S]*?\}, fusion\)\)/);
  assert.match(client, /parseFusionVerificationMetadata\(data\.fusion,/);
  assert.match(message, /Independent provider check passed/);
  assert.match(message, /role="status"/);
});
