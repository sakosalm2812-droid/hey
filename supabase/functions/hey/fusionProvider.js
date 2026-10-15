import { FUSION_MODES, runProviderFusion } from "../../../src/core/providerFusion.js";

const MAX_REQUEST_BUDGET_USD = 0.25;
const MAX_PROVIDER_RATE_USD_PER_MILLION = 1_000;
const PROVIDER_TIMEOUT_MS = 20_000;
const PROVIDER_ENDPOINTS = Object.freeze({
  openai: "https://api.openai.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/models",
});

const ALLOWED_TOP_LEVEL = ["budgetUsd", "minConfidence", "providers"];
const ALLOWED_PROVIDER_FIELDS = ["id", "model", "inputUsdPerMillion", "outputUsdPerMillion", "maxCostUsd"];
const FUSION_INSTRUCTION = "Return only JSON matching {\"text\": string, \"confidence\": number from 0 to 1, \"evidence\": Array<{\"claimId\": string, \"statement\": string, \"value\": string|number|boolean|null, \"source\": string|null}>}. Confidence is your estimate, not authorization. Keep evidence short and factual; use an empty array when you cannot provide claim-level support.";

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, allowed) {
  return isPlainObject(value) && Reflect.ownKeys(value).every((key) => typeof key === "string" && allowed.includes(key)) &&
    Reflect.ownKeys(value).length === allowed.filter((key) => Object.hasOwn(value, key)).length;
}

/** Parse server-only price configuration. Client-supplied rates/budgets are never used. */
export function parseFusionPricingConfig(raw) {
  if (typeof raw !== "string" || raw.length > 16_384) return null;
  try {
    const config = JSON.parse(raw);
    if (!hasExactKeys(config, ALLOWED_TOP_LEVEL) ||
      !Number.isFinite(config.budgetUsd) || config.budgetUsd <= 0 || config.budgetUsd > MAX_REQUEST_BUDGET_USD ||
      !Number.isFinite(config.minConfidence) || config.minConfidence < 0.5 || config.minConfidence > 1 ||
      !Array.isArray(config.providers) || config.providers.length < 2 || config.providers.length > 4) return null;
    const seen = new Set();
    const providers = [];
    for (const provider of config.providers) {
      if (!hasExactKeys(provider, ALLOWED_PROVIDER_FIELDS) ||
        typeof provider.id !== "string" || !/^(openai|openrouter|groq|gemini)$/.test(provider.id) ||
        typeof provider.model !== "string" || !provider.model.trim() || provider.model.length > 120 ||
        !Number.isFinite(provider.inputUsdPerMillion) || provider.inputUsdPerMillion < 0 || provider.inputUsdPerMillion > MAX_PROVIDER_RATE_USD_PER_MILLION ||
        !Number.isFinite(provider.outputUsdPerMillion) || provider.outputUsdPerMillion < 0 || provider.outputUsdPerMillion > MAX_PROVIDER_RATE_USD_PER_MILLION ||
        !Number.isFinite(provider.maxCostUsd) || provider.maxCostUsd <= 0 || provider.maxCostUsd > config.budgetUsd) return null;
      if (seen.has(provider.id)) return null;
      seen.add(provider.id);
      providers.push(Object.freeze({ ...provider }));
    }
    return Object.freeze({
      budgetUsd: config.budgetUsd,
      minConfidence: config.minConfidence,
      providers: Object.freeze(providers),
    });
  } catch {
    return null;
  }
}

function readProviderText(providerId, data) {
  if (providerId === "gemini") {
    const parts = data?.candidates?.[0]?.content?.parts;
    return Array.isArray(parts) ? parts.map((part) => typeof part?.text === "string" ? part.text : "").join("") : "";
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  return Array.isArray(content) ? content.map((part) => typeof part?.text === "string" ? part.text : "").join("") : "";
}

function readUsage(providerId, data) {
  const usage = providerId === "gemini" ? data?.usageMetadata : data?.usage;
  const inputTokens = providerId === "gemini" ? usage?.promptTokenCount : usage?.prompt_tokens;
  const outputTokens = providerId === "gemini" ? usage?.candidatesTokenCount : usage?.completion_tokens;
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || inputTokens > 100_000 ||
    !Number.isSafeInteger(outputTokens) || outputTokens < 0 || outputTokens > 100_000) return null;
  return { inputTokens, outputTokens };
}

function calculateCost(usage, pricing) {
  return (usage.inputTokens * pricing.inputUsdPerMillion + usage.outputTokens * pricing.outputUsdPerMillion) / 1_000_000;
}

function estimateInputTokenCeiling(messages) {
  const content = messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
  // UTF-8 byte count bounds tokens conservatively for the supported text tokenizers;
  // the extra allowance covers provider message framing.
  return new TextEncoder().encode(`${content}\n\n${FUSION_INSTRUCTION}`).byteLength + messages.length * 16 + 128;
}

async function requestProvider({ provider, attempt, messages, signal, fetchImpl }) {
  if (signal?.aborted) throw new Error("Provider request cancelled");
  const startedAt = Date.now();
  let url;
  let headers;
  let body;
  const fusionMessages = messages.map((message) => ({ ...message }));
  const systemIndex = fusionMessages.findIndex((message) => message.role === "system");
  if (systemIndex >= 0) fusionMessages[systemIndex].content = `${fusionMessages[systemIndex].content}\n\n${FUSION_INSTRUCTION}`;
  else fusionMessages.unshift({ role: "system", content: FUSION_INSTRUCTION });

  if (provider.id === "gemini") {
    url = `${PROVIDER_ENDPOINTS.gemini}/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(attempt.key)}`;
    headers = { "Content-Type": "application/json" };
    body = {
      contents: [{ role: "user", parts: [{ text: fusionMessages.map((item) => `${item.role}: ${item.content}`).join("\n\n") }] }],
      generationConfig: { maxOutputTokens: provider.maxOutputTokens, temperature: 0.2 },
    };
  } else {
    url = PROVIDER_ENDPOINTS[provider.id];
    headers = { Authorization: `Bearer ${attempt.key}`, "Content-Type": "application/json" };
    if (provider.id === "openrouter") {
      headers["X-Title"] = "HEY";
    }
    body = { model: provider.model, messages: fusionMessages, temperature: 0.2, max_tokens: provider.maxOutputTokens };
  }

  const controller = new AbortController();
  const abortParent = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortParent();
  else signal?.addEventListener("abort", abortParent, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("Provider timeout")), PROVIDER_TIMEOUT_MS);
  let response;
  let responseText;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (controller.signal.aborted) throw new Error("Provider request cancelled");
    responseText = await response.text();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortParent);
  }
  if (signal?.aborted || controller.signal.aborted) throw new Error("Provider request cancelled");
  if (responseText.length > 1_000_000) throw new Error("Provider response too large");
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error("Provider returned malformed data");
  }
  if (!response.ok) throw new Error("Provider request failed");

  const text = readProviderText(provider.id, data);
  if (text.length > 16_000) throw new Error("Provider output too large");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Provider output did not match the structured response contract");
  }
  const usage = readUsage(provider.id, data);
  if (!usage) throw new Error("Provider usage is unavailable");
  if (usage.inputTokens > provider.maxInputTokens || usage.outputTokens > provider.maxOutputTokens) {
    throw new Error("Provider usage exceeded its reserved token bounds");
  }
  const costUsd = calculateCost(usage, provider);
  if (costUsd > provider.reservedCostUsd) throw new Error("Provider usage exceeded its reserved cost");
  return {
    ...parsed,
    costUsd,
    latencyMs: Date.now() - startedAt,
  };
}

/** Run fusion from authenticated profile grants and server-held price/key configuration. */
export async function runFusionChatRequest({
  requested,
  accountId,
  entitlements,
  attempts,
  pricingConfig,
  messages,
  signal,
  isCurrent = () => true,
  fetchImpl = fetch,
} = {}) {
  if (!requested) return { status: "not_requested" };
  if (typeof accountId !== "string" || !accountId.trim()) return { status: "denied", reason: "account_identity_missing" };
  if (!Array.isArray(entitlements) || !entitlements.every((value) => typeof value === "string")) {
    return { status: "denied", reason: "account_permissions_invalid" };
  }
  const grants = new Set(entitlements.map((value) => value.toLowerCase()));
  if (!grants.has("hey.fusion") || !grants.has("provider.remote")) {
    return { status: "denied", reason: "fusion_permission_required" };
  }
  if (!pricingConfig || !Array.isArray(pricingConfig.providers) || !Array.isArray(attempts)) {
    return { status: "unconfigured", reason: "trusted_pricing_required" };
  }
  if (!Array.isArray(messages) || messages.length > 24 || messages.some((message) =>
    !message || !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string"
  ) || messages.reduce((total, message) => total + message.content.length, 0) > 20_000) {
    return { status: "invalid_request", reason: "fusion_context_exceeds_bounds" };
  }

  const permitted = pricingConfig.providers.filter((price) =>
    grants.has(`provider:${price.id}`) && attempts.some((attempt) => attempt.id === price.id && attempt.model === price.model && attempt.key)
  );
  if (permitted.length < 2) return { status: "denied", reason: "two_permitted_priced_providers_required" };

  const maxInputTokens = estimateInputTokenCeiling(messages);
  const pricedProviders = permitted.map((provider) => {
    const inputWorstCaseUsd = (maxInputTokens * provider.inputUsdPerMillion) / 1_000_000;
    if (inputWorstCaseUsd >= provider.maxCostUsd && provider.outputUsdPerMillion > 0) return null;
    const affordableOutputTokens = provider.outputUsdPerMillion > 0
      ? Math.floor(((provider.maxCostUsd - inputWorstCaseUsd) * 1_000_000) / provider.outputUsdPerMillion)
      : 1200;
    const maxOutputTokens = Math.min(1200, affordableOutputTokens);
    if (maxOutputTokens < 1) return null;
    const reservedCostUsd = inputWorstCaseUsd + (maxOutputTokens * provider.outputUsdPerMillion) / 1_000_000;
    return Object.freeze({ ...provider, maxInputTokens, maxOutputTokens, reservedCostUsd });
  });
  if (pricedProviders.some((provider) => !provider)) return { status: "budget_exhausted", reason: "request_cannot_fit_provider_price_cap", calls: 0 };
  const selectedProviders = pricedProviders.slice(0, 2);
  if (selectedProviders.reduce((total, provider) => total + provider.reservedCostUsd, 0) > pricingConfig.budgetUsd) {
    return { status: "budget_exhausted", reason: "independent_calls_exceed_server_budget", calls: 0 };
  }

  const providerModels = selectedProviders.map((provider, priority) => ({
    id: provider.model,
    providerId: provider.id,
    providerName: provider.id,
    capabilities: ["chat"],
    local: false,
    priority,
    maxCostUsd: provider.reservedCostUsd,
  }));

  const permissions = ["provider.remote", ...selectedProviders.map((provider) => `provider:${provider.id}`)];
  const result = await runProviderFusion({
    prompt: "Authenticated server-side HEY chat fusion request.",
    intent: "conversation",
    mode: FUSION_MODES.FUSION,
    accountScope: accountId,
    permissions,
    providerModels,
    signal,
    isCurrent,
    maxCostUsd: pricingConfig.budgetUsd,
    minConfidence: pricingConfig.minConfidence,
    invoke: async ({ providerId, signal: providerSignal }) => {
      const provider = selectedProviders.find((item) => item.id === providerId);
      const attempt = attempts.find((item) => item.id === providerId && item.model === provider?.model && item.key);
      if (!provider || !attempt || !Array.isArray(messages)) throw new Error("Provider configuration is unavailable");
      return await requestProvider({ provider, attempt, messages, signal: providerSignal, fetchImpl });
    },
  });
  if (result.status !== "complete") return result;
  const claims = new Map();
  for (const item of result.evidence) {
    const key = `${item.claimId}:${JSON.stringify(item.value)}`;
    const providerIds = claims.get(key) || new Set();
    providerIds.add(item.providerId);
    claims.set(key, providerIds);
  }
  if (result.confidence < pricingConfig.minConfidence || !Array.from(claims.values()).some((ids) => ids.size > 1)) {
    return { status: "inconclusive", reason: "independent_evidence_did_not_confirm_answer" };
  }
  return result;
}

export default { parseFusionPricingConfig, runFusionChatRequest };
