import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { getProviderRouteRequest } from "../src/lib/heyAI.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("chat keeps Automatic and Lower cost on the supported providerProfile request path", async () => {
  const [page, input, client, catalogTests] = await Promise.all([
    source("../src/ChatPage.jsx"),
    source("../src/components/chat/ChatInput.jsx"),
    source("../src/lib/heyAI.js"),
    source("./provider-catalog.test.js"),
  ]);
  assert.match(input, /value=\{routingChoice\}/);
  assert.match(input, /profiles\.map\(\(profile\)/);
  assert.match(page, /providerProfile: effectiveProviderProfile/);
  assert.match(page, /requestedFusion \? "automatic" : providerProfile/);
  assert.match(client, /providerSelection: \{ providerId, modelId \}/);
  assert.match(catalogTests, /routing catalog exposes only entitled models/);
  assert.deepEqual(getProviderRouteRequest("automatic"), {});
  assert.deepEqual(getProviderRouteRequest("lower_cost"), { routingProfile: "lower_cost" });
});

test("exact entitled models use providerProfile and the current catalog pair", async () => {
  const [input, page] = await Promise.all([source("../src/components/chat/ChatInput.jsx"), source("../src/ChatPage.jsx")]);
  assert.match(input, /<optgroup label="Exact entitled models">/);
  assert.match(input, /setProviderProfile\?\.\(\{ providerId: provider\.providerId, modelId: provider\.modelId \}\)/);
  assert.match(input, /Unavailable · \{exactSelection \?/);
  assert.match(page, /providerCatalog\.providers\.some\(\(provider\) => provider\.providerId === effectiveProviderProfile\.providerId && provider\.modelId === effectiveProviderProfile\.modelId\)/);
  assert.deepEqual(getProviderRouteRequest({ providerId: "gemini", modelId: "gemini-pro" }), {
    providerSelection: { providerId: "gemini", modelId: "gemini-pro" },
  });
  assert.deepEqual(getProviderRouteRequest({ providerId: "gemini", modelId: "gemini-pro" }, true), {});
  assert.throws(() => getProviderRouteRequest({ providerId: "gemini", modelId: "../secret" }), /invalid/);
});

test("catalog loading, permission, unavailable, retry, and empty-entitlement states are visible", async () => {
  const [input, page] = await Promise.all([source("../src/components/chat/ChatInput.jsx"), source("../src/ChatPage.jsx")]);
  assert.match(input, /providerCatalog\.status === "loading"[\s\S]*?role="status"/);
  assert.match(input, /providerCatalog\.status === "permission_required"/);
  assert.match(input, /providerCatalog\.status === "unavailable"/);
  assert.match(input, /No entitled provider models are available/);
  assert.match(input, /onClick=\{onRetryProviderCatalog\}/);
  assert.match(page, /setProviderCatalog\(\{ \.\.\.catalog, status: "ready"/);
  assert.match(page, /status = \/sign in\|authentication\|permission\|entitlement\|authoriz\|enabled remote\/i\.test\(message\) \? "permission_required" : "unavailable"/);
  assert.match(page, /providerCatalogRetry/);
  assert.match(page, /catalogController\.abort\(\)/);
});

test("catalog changes never silently reset an unavailable choice or cross account boundaries", async () => {
  const [page, input] = await Promise.all([source("../src/ChatPage.jsx"), source("../src/components/chat/ChatInput.jsx")]);
  assert.match(page, /if \(!requestedFusion && effectiveProviderProfile !== "automatic"\)[\s\S]*?Choose another option or Automatic before sending/);
  assert.match(input, /Unavailable · \{exactSelection \?/);
  assert.match(page, /<ChatWorkspace key=\{user\?\.id \|\| 'signed-out'\} \/>/);
  assert.doesNotMatch(page, /setProviderProfile\("automatic"\);\s*getHEYProviderCatalog/);
});
