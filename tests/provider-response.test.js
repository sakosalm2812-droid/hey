import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { readProviderJson } from "../supabase/functions/hey/providerResponse.js";
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

test("oversized streamed provider errors are cancelled instead of fully buffered", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(32)); },
    cancel() { cancelled = true; },
  });
  assert.deepEqual(await readProviderJson(new Response(body), 16), { status: "too_large" });
  assert.equal(cancelled, true);
});

test("grant revocation during a provider response read invalidates the old exact-model snapshot", async () => {
  let finishBody;
  const body = new ReadableStream({
    start(controller) { finishBody = () => { controller.enqueue(new TextEncoder().encode('{"choices":[]}')); controller.close(); }; },
  });
  const selection = parseProviderSelection({ providerId: "gemini", modelId: "fixture-b" });
  let currentGrants = ["provider.remote", "provider:gemini"];
  const read = readProviderJson(new Response(body));
  currentGrants = ["provider.remote"];
  finishBody();
  assert.equal((await read).status, "ok");
  assert.equal(resolveProviderSelection(selection, attempts, currentGrants, prices).status, "denied");
});

test("chat handles bad provider bodies as recoverable failures while exact selection stays a singleton", async () => {
  const route = await readFile(new URL("../supabase/functions/hey/index.ts", import.meta.url), "utf8");
  const providerCall = route.slice(route.indexOf("async function callProvider"), route.indexOf("function shouldSearch"));
  assert.match(route, /readProviderJson\(response\)/);
  assert.match(route, /parsedResponse\.status !== "ok"[\s\S]*?continue;/);
  assert.match(route, /chatProviderAttempts = \[selection\.attempt\]/);
  assert.match(route, /if \(authorizeProvider && !await authorizeProvider\(provider\)\)[\s\S]*?const response = provider\.id/);
  assert.match(route, /if \(response\.ok\) \{\s+if \(authorizeProvider && !await authorizeProvider\(provider\)\)/);
  assert.doesNotMatch(providerCall, /data\?\.error\?\.message/);
});
