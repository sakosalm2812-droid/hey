import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { cancelProviderResponse, extractProviderText, readProviderJson } from "../supabase/functions/hey/providerResponse.js";
import { remainingProviderTimeMs } from "../supabase/functions/hey/providerDeadline.js";
import { parseProviderSelection, resolveProviderSelection, snapshotProviderAttempts } from "../supabase/functions/hey/providerCatalog.js";

const attempts = snapshotProviderAttempts([
  { id: "openai", model: "fixture-a", key: "private-a" },
  { id: "gemini", model: "fixture-b", key: "private-b" },
]);
const prices = { providers: [
  { providerId: "openai", modelId: "fixture-a", inputUsdPerMillion: 1, outputUsdPerMillion: 1, maxCostUsd: 0.01 },
  { providerId: "gemini", modelId: "fixture-b", inputUsdPerMillion: 1, outputUsdPerMillion: 1, maxCostUsd: 0.01 },
] };

test("provider JSON reader accepts bounded object JSON and rejects malformed or hostile bodies", async () => {
  assert.deepEqual(await readProviderJson(new Response('{"choices":[]}')), { status: "ok", data: { choices: [] } });
  assert.deepEqual(await readProviderJson(new Response("not-json")), { status: "invalid" });
  assert.deepEqual(await readProviderJson(new Response("[]")), { status: "invalid" });
  assert.deepEqual(await readProviderJson(new Response("{}", { headers: { "content-length": "99" } }), 8), { status: "too_large" });
});

test("provider JSON reader accepts fragmented valid JSON without retaining every chunk", async () => {
  const encoded = new TextEncoder().encode('{"choices":[{"message":{"content":"ok"}}]}');
  let offset = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (offset === encoded.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoded.slice(offset, offset + 1));
      offset += 1;
    },
  }, { highWaterMark: 0 });

  assert.deepEqual(await readProviderJson(new Response(body)), {
    status: "ok",
    data: { choices: [{ message: { content: "ok" } }] },
  });
});

test("provider JSON reader cancels streams that send endless empty chunks", async () => {
  let pullCount = 0;
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      pullCount += 1;
      controller.enqueue(new Uint8Array(0));
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });

  assert.deepEqual(await readProviderJson(new Response(body)), { status: "too_fragmented" });
  assert.equal(pullCount, 4_097);
  assert.equal(cancelled, true);
});

test("invalid limits and malformed response access cancel bodies without waiting for cleanup", async () => {
  const trackedBody = () => {
    let cancelRequested = false;
    let pullCount = 0;
    const body = new ReadableStream({
      pull() { pullCount += 1; },
      cancel() {
        cancelRequested = true;
        return new Promise(() => {});
      },
    }, { highWaterMark: 0 });
    return { body, wasCancelled: () => cancelRequested, pullCount: () => pullCount };
  };

  const invalidLimit = trackedBody();
  assert.deepEqual(await readProviderJson({ headers: new Headers(), body: invalidLimit.body }, 0), { status: "invalid" });
  assert.equal(invalidLimit.wasCancelled(), true);
  assert.equal(invalidLimit.pullCount(), 0);

  let noReaderCancelled = false;
  assert.deepEqual(await readProviderJson({
    headers: new Headers(),
    body: { cancel() { noReaderCancelled = true; return new Promise(() => {}); } },
  }), { status: "invalid" });
  assert.equal(noReaderCancelled, true);

  const hostileHeaders = trackedBody();
  const malformedResponse = {
    get headers() { throw new Error("hostile headers getter"); },
    body: hostileHeaders.body,
  };
  assert.deepEqual(await readProviderJson(malformedResponse), { status: "invalid" });
  assert.equal(hostileHeaders.wasCancelled(), true);
  assert.equal(hostileHeaders.pullCount(), 0);

  let failedReaderCancelled = false;
  assert.deepEqual(await readProviderJson({
    headers: new Headers(),
    body: {
      getReader() { throw new Error("body is not readable"); },
      cancel() { failedReaderCancelled = true; return new Promise(() => {}); },
    },
  }), { status: "invalid" });
  assert.equal(failedReaderCancelled, true);
});

test("provider responses require usable text across OpenAI-compatible and Gemini shapes", () => {
  assert.equal(extractProviderText({ choices: [] }), "");
  assert.equal(extractProviderText({ choices: [{ message: { content: "  " } }] }), "");
  assert.equal(extractProviderText({ candidates: [{ content: { parts: [] } }] }), "");
  assert.equal(extractProviderText({ choices: [{ message: { content: "usable answer" } }] }), "usable answer");
  assert.equal(extractProviderText({ candidates: [{ content: { parts: [{ text: "Gemini answer" }] } }] }), "Gemini answer");
});

test("provider request budget is recomputed after slow authorization and never floors past the deadline", async () => {
  const deadline = 35_000;
  let now = 0;
  let finishAuthorization;
  const authorization = new Promise((resolve) => { finishAuthorization = resolve; });
  const authorize = async () => {
    await authorization;
    return true;
  };

  const pendingAuthorization = authorize();
  assert.equal(remainingProviderTimeMs(deadline, now), 18_000);
  now = 35_001;
  finishAuthorization();
  await pendingAuthorization;
  assert.equal(remainingProviderTimeMs(deadline, now), 0);
  assert.equal(remainingProviderTimeMs(deadline, 34_999), 1);
  assert.equal(remainingProviderTimeMs(deadline, 34_500), 500);

  const route = await readFile(new URL("../supabase/functions/hey/index.ts", import.meta.url), "utf8");
  const providerCall = route.slice(route.indexOf("async function callProvider"), route.indexOf("function shouldSearch"));
  assert.match(providerCall, /await authorizeProvider\(provider\)[\s\S]*?const requestTimeoutMs = remainingProviderTimeMs\(deadline\)/);
  assert.match(providerCall, /if \(requestTimeoutMs <= 0\) break/);
  assert.match(providerCall, /const bodyTimeoutMs = remainingProviderTimeMs\(deadline\)[\s\S]*?timeoutMs: bodyTimeoutMs/);
  assert.doesNotMatch(providerCall, /Math\.max\(500, Math\.min\(18_000, deadline - Date\.now\(\)\)\)/);
});

test("oversized streamed provider errors are cancelled instead of fully buffered", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(32)); },
    cancel() { cancelled = true; },
  });
  assert.deepEqual(await readProviderJson(new Response(body), 16), { status: "too_large" });
  assert.equal(cancelled, true);
});

test("provider HTTP error bodies are cancelled without awaiting upstream cleanup", () => {
  let cancelRequested = false;
  let pullCount = 0;
  const response = new Response(new ReadableStream({
    pull() { pullCount += 1; },
    cancel() {
      cancelRequested = true;
      return new Promise(() => {});
    },
  }, { highWaterMark: 0 }), { status: 429 });

  cancelProviderResponse(response);

  assert.equal(cancelRequested, true);
  assert.equal(pullCount, 0, "the provider diagnostic body is never read");
});

test("a stalled provider body times out promptly even when upstream cancellation never settles", async () => {
  let cancelRequested = false;
  const body = new ReadableStream({
    start() {},
    cancel() {
      cancelRequested = true;
      return new Promise(() => {});
    },
  });
  const startedAt = Date.now();
  assert.deepEqual(await readProviderJson(new Response(body), undefined, { timeoutMs: 20 }), { status: "timeout" });
  assert.equal(Date.now() - startedAt < 500, true);
  assert.equal(cancelRequested, true);
});

test("aborting a stalled provider body returns promptly and marks it as aborted", async () => {
  let cancelRequested = false;
  const controller = new AbortController();
  const body = new ReadableStream({
    start() {},
    cancel() { cancelRequested = true; return new Promise(() => {}); },
  });
  const reading = readProviderJson(new Response(body), undefined, { signal: controller.signal, timeoutMs: 5_000 });
  controller.abort();
  assert.deepEqual(await reading, { status: "aborted" });
  assert.equal(cancelRequested, true);
});

test("pre-aborted provider body reads cancel without pulling a response chunk", async () => {
  const controller = new AbortController();
  controller.abort();
  let pullCount = 0;
  let cancelRequested = false;
  const body = new ReadableStream({
    pull(streamController) {
      pullCount += 1;
      streamController.enqueue(new TextEncoder().encode('{"choices":[]}'));
    },
    cancel() { cancelRequested = true; return new Promise(() => {}); },
  }, { highWaterMark: 0 });

  assert.deepEqual(await readProviderJson(new Response(body), undefined, { signal: controller.signal }), { status: "aborted" });
  assert.equal(pullCount, 0);
  assert.equal(cancelRequested, true);
});

test("grant revocation during a provider response read invalidates the old exact-model snapshot", async () => {
  let finishBody;
  const body = new ReadableStream({
    start(controller) { finishBody = () => { controller.enqueue(new TextEncoder().encode('{"choices":[]}')); controller.close(); }; },
  });
  const selection = parseProviderSelection({ providerId: "gemini", modelId: "fixture-b" });
  let currentGrants = ["provider.remote", "provider:gemini"];
  assert.equal(resolveProviderSelection(selection, attempts, currentGrants, prices).status, "selected");
  const read = readProviderJson(new Response(body));
  currentGrants = ["provider.remote"];
  finishBody();
  assert.equal((await read).status, "ok");
  assert.equal(resolveProviderSelection(selection, attempts, currentGrants, prices).status, "denied");
});

test("chat handles bad provider bodies as recoverable failures while exact selection stays a singleton", async () => {
  const route = await readFile(new URL("../supabase/functions/hey/index.ts", import.meta.url), "utf8");
  const providerCall = route.slice(route.indexOf("async function callProvider"), route.indexOf("function shouldSearch"));
  assert.match(route, /readProviderJson\(response, undefined, \{/);
  assert.match(providerCall, /if \(!response\.ok\) \{\s*cancelProviderResponse\(response\);[\s\S]*?continue;\s*\}[\s\S]*?const parsedResponse = await readProviderJson/);
  assert.match(providerCall, /if \(!extractProviderText\(data\)\) \{[\s\S]*?continue;\s*\}[\s\S]*?return \{ data, providerId: provider\.id/);
  assert.match(providerCall, /lastError = `\$\{provider\.id\}: empty response`/);
  assert.match(route, /parsedResponse\.status !== "ok"[\s\S]*?continue;/);
  assert.match(route, /readProviderJson\(response, undefined, \{[\s\S]*?signal,[\s\S]*?timeoutMs: bodyTimeoutMs/);
  assert.match(route, /callProvider\(messages, 1200, chatProviderAttempts, authorizeChatProvider, request\.signal\)/);
  assert.match(route, /parsedResponse\.status === "aborted"[\s\S]*?providerRequestCancelled/);
  assert.match(route, /request\.signal\.aborted\) return jsonResponse\(\{ error: "The provider request was cancelled"/);
  assert.match(route, /chatProviderAttempts = \[selection\.attempt\]/);
  assert.match(route, /if \(authorizeProvider && !await authorizeProvider\(provider\)\)[\s\S]*?const response = provider\.id/);
  assert.match(route, /const stillAuthorized = await authorizeProvider\(provider\)/);
  assert.doesNotMatch(providerCall, /data\?\.error\?\.message/);
});
