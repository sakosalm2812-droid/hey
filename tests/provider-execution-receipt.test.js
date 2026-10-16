import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { createProviderExecutionReceipt, parseProviderExecutionReceipt } from "../src/core/providerExecutionReceipt.js";

const RECEIPT_ID = "123e4567-e89b-42d3-a456-426614174000";

test("OpenAI-compatible provider receipt separates configured and provider-reported model IDs", () => {
  const receipt = createProviderExecutionReceipt({
    providerId: "openrouter",
    configuredModelId: "qwen/qwen3-next:free",
    data: {
      id: "chatcmpl-fixture-123",
      model: "qwen3-next-80b-2026-10-01",
      usage: { prompt_tokens: 41, completion_tokens: 17, total_tokens: 58 },
      choices: [{ message: { content: "answer" } }],
    },
    elapsedMs: 812,
    receiptId: RECEIPT_ID,
  });

  assert.deepEqual(receipt, {
    schemaVersion: 1,
    status: "provider_response_received",
    receiptId: RECEIPT_ID,
    providerId: "openrouter",
    configuredModelId: "qwen/qwen3-next:free",
    providerReportedModelId: "qwen3-next-80b-2026-10-01",
    providerResponseId: "chatcmpl-fixture-123",
    requestTiming: { elapsedMs: 812, scope: "provider_http_round_trip", source: "edge_wall_clock" },
    usageStatus: "reported",
    usage: { inputTokens: 41, outputTokens: 17, totalTokens: 58, source: "provider_reported" },
  });
  assert.equal(Object.hasOwn(receipt, "response"), false);
  assert.equal(Object.hasOwn(receipt, "costUsd"), false, "no unconfigured price is inferred");
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.usage), true);
  assert.deepEqual(parseProviderExecutionReceipt(receipt), receipt);
});

test("Gemini provider receipt uses Gemini response model and token fields", () => {
  const receipt = createProviderExecutionReceipt({
    providerId: "gemini",
    configuredModelId: "gemini-2.5-flash",
    data: {
      responseId: "ignored-field",
      modelVersion: "gemini-2.5-flash-001",
      usageMetadata: { promptTokenCount: 25, candidatesTokenCount: 9, totalTokenCount: 40 },
    },
    elapsedMs: 100,
    receiptId: RECEIPT_ID,
  });
  assert.equal(receipt.providerReportedModelId, "gemini-2.5-flash-001");
  assert.equal(receipt.providerResponseId, null);
  assert.deepEqual(receipt.usage, { inputTokens: 25, outputTokens: 9, totalTokens: 34, source: "provider_reported" });
});

test("missing, unsafe, and hostile provider usage is not copied into receipts", () => {
  const missing = createProviderExecutionReceipt({
    providerId: "openai", configuredModelId: "gpt-fixture", data: { choices: [] }, elapsedMs: 0, receiptId: RECEIPT_ID,
  });
  assert.equal(missing.usageStatus, "unavailable");
  assert.equal(missing.usage, null);

  const invalid = createProviderExecutionReceipt({
    providerId: "openai", configuredModelId: "gpt-fixture",
    data: { usage: { prompt_tokens: 9, completion_tokens: Number.MAX_SAFE_INTEGER + 1 }, model: "private\nmodel" },
    elapsedMs: 1, receiptId: RECEIPT_ID,
  });
  assert.equal(invalid.usageStatus, "invalid");
  assert.equal(invalid.usage, null);
  assert.equal(invalid.providerReportedModelId, null);
  assert.doesNotMatch(JSON.stringify(invalid), /private|9007199254740992/);

  let getterCalls = 0;
  const hostileData = { usage: {} };
  Object.defineProperty(hostileData.usage, "prompt_tokens", {
    enumerable: true,
    get() { getterCalls += 1; throw new Error("must not execute"); },
  });
  Object.defineProperty(hostileData.usage, "completion_tokens", { enumerable: true, value: 2 });
  const safe = createProviderExecutionReceipt({
    providerId: "openai", configuredModelId: "gpt-fixture", data: hostileData, elapsedMs: 2, receiptId: RECEIPT_ID,
  });
  assert.equal(safe.usageStatus, "invalid");
  assert.equal(getterCalls, 0);
});

test("receipt parser rejects tampering, accessors, out-of-range timing, and extra fields", () => {
  const receipt = createProviderExecutionReceipt({
    providerId: "groq", configuredModelId: "llama-fixture", data: { usage: { prompt_tokens: 1, completion_tokens: 2 } },
    elapsedMs: 12, receiptId: RECEIPT_ID,
  });
  assert.equal(parseProviderExecutionReceipt({ ...receipt, costUsd: 0.01 }), null);
  assert.equal(parseProviderExecutionReceipt({ ...receipt, requestTiming: { ...receipt.requestTiming, elapsedMs: 35_001 } }), null);
  const hostile = Object.defineProperty({ ...receipt }, "providerId", {
    enumerable: true,
    get() { throw new Error("must not execute"); },
  });
  assert.equal(parseProviderExecutionReceipt(hostile), null);
});

test("normal chat wires its content-free provider receipt to the message UI without changing Fusion receipts", async () => {
  const [edge, client, chat, message, styles] = await Promise.all([
    readFile(new URL("../supabase/functions/hey/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/heyAI.js", import.meta.url), "utf8"),
    readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/chat/ChatMessage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/chat.css", import.meta.url), "utf8"),
  ]);
  const callProvider = edge.slice(edge.indexOf("async function callProvider"), edge.indexOf("function shouldSearch"));
  assert.match(edge, /createProviderExecutionReceipt\(\{/);
  assert.match(callProvider, /const providerStartedAt = Date\.now\(\);[\s\S]*?const response = provider\.id/);
  assert.match(callProvider, /elapsedMs: providerElapsedMs/);
  assert.match(edge, /providerExecutionReceipt: providerResult\.executionReceipt/);
  assert.match(edge, /redirect: "error"/);
  assert.match(edge, /authorizeChatProvider = async \(provider: ProviderAttempt\)/);
  assert.match(client, /parseProviderExecutionReceipt\(data\.providerExecutionReceipt\)/);
  assert.match(client, /!fusion \? parseProviderExecutionReceipt/);
  assert.match(client, /onProviderExecutionReceipt\?\.\(providerExecutionReceipt\)/);
  assert.match(chat, /onProviderExecutionReceipt: \(receipt\) => \{ providerExecutionReceipt = receipt; \}/);
  assert.match(chat, /providerExecutionReceipt=\{item\.providerExecutionReceipt\}/);
  assert.match(message, /one request, not a model latency benchmark/i);
  assert.match(message, /Provider-reported usage/);
  assert.match(styles, /\.hey-chat-provider-receipt/);
});
