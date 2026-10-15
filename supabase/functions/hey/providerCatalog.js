const PROVIDER_NAMES = Object.freeze({
  openai: "OpenAI",
  openrouter: "OpenRouter",
  gemini: "Google Gemini",
  groq: "Groq",
});

const PROVIDER_SELECTION_KEYS = ["providerId", "modelId"];
const MAX_CHAT_BUDGET_USD = 0.25;
const MAX_PROVIDER_RATE_USD_PER_MILLION = 1_000;
const MAX_CHAT_INPUT_TOKEN_CEILING = 32_000;
const ROUTING_PROFILES = Object.freeze(["automatic", "lower_cost"]);

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readCanonicalText(value, maxLength) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > maxLength) return null;
  if (Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  })) return null;
  return value;
}

function hasServerCredential(value) {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

export function parseProviderSelection(value) {
  if (value === undefined || value === null) return { status: "automatic" };
  if (!isRecord(value)) return { status: "invalid" };
  const keys = Reflect.ownKeys(value);
  if (keys.length !== PROVIDER_SELECTION_KEYS.length || keys.some((key) => !PROVIDER_SELECTION_KEYS.includes(key))) {
    return { status: "invalid" };
  }
  const providerDescriptor = Object.getOwnPropertyDescriptor(value, "providerId");
  const modelDescriptor = Object.getOwnPropertyDescriptor(value, "modelId");
  if (!providerDescriptor || !Object.hasOwn(providerDescriptor, "value") || !modelDescriptor || !Object.hasOwn(modelDescriptor, "value")) {
    return { status: "invalid" };
  }
  const providerId = readCanonicalText(providerDescriptor.value, 64);
  const modelId = readCanonicalText(modelDescriptor.value, 128);
  if (!providerId || !modelId) return { status: "invalid" };
  return { status: "selected", providerId, modelId };
}

export function parseRoutingProfile(value) {
  if (value === undefined || value === null) return { status: "automatic", profile: "automatic" };
  return typeof value === "string" && ROUTING_PROFILES.includes(value)
    ? { status: "valid", profile: value }
    : { status: "invalid" };
}

export function normalizeProviderEntitlements(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  const keys = Reflect.ownKeys(value);
  if (!Number.isSafeInteger(length) || length > 100 || keys.length !== length + 1) return null;
  const grants = [];
  const seen = new Set();
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "string" ||
      !descriptor.value.trim() || descriptor.value !== descriptor.value.trim() || descriptor.value.length > 128 ||
      Array.from(descriptor.value).some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) return null;
    const grant = descriptor.value.toLowerCase();
    if (seen.has(grant)) return null;
    seen.add(grant);
    grants.push(grant);
  }
  return Object.freeze(grants);
}

export function isProviderEntitled(entitlements, providerId) {
  const grants = normalizeProviderEntitlements(entitlements);
  return Boolean(grants && grants.includes("provider.remote") && grants.includes(`provider:${providerId}`));
}

export function filterEntitledProviderAttempts(attempts, entitlements) {
  const grants = normalizeProviderEntitlements(entitlements);
  if (!grants || !grants.includes("provider.remote") || !Array.isArray(attempts)) return [];
  return attempts.filter((attempt) => grants.includes(`provider:${attempt.id}`));
}

export function orderProviderAttemptsForProfile(attempts, pricingConfig, profile = "automatic") {
  if (!Array.isArray(attempts) || !ROUTING_PROFILES.includes(profile)) return [];
  if (profile === "automatic") return [...attempts];
  const rates = new Map((pricingConfig?.providers || []).map((item) => [
    `${item.providerId}\u001f${item.modelId}`,
    item.inputUsdPerMillion + item.outputUsdPerMillion,
  ]));
  return [...attempts].sort((left, right) => {
    const leftRate = rates.get(`${left.id}\u001f${left.model}`) ?? Number.POSITIVE_INFINITY;
    const rightRate = rates.get(`${right.id}\u001f${right.model}`) ?? Number.POSITIVE_INFINITY;
    return leftRate - rightRate;
  });
}

export function parseChatPricingConfig(raw) {
  if (typeof raw !== "string" || raw.length > 16_384) return null;
  try {
    const config = JSON.parse(raw);
    if (!isRecord(config) || Reflect.ownKeys(config).length !== 2 ||
      !Object.hasOwn(config, "budgetUsd") || !Object.hasOwn(config, "providers") ||
      !Number.isFinite(config.budgetUsd) || config.budgetUsd <= 0 || config.budgetUsd > MAX_CHAT_BUDGET_USD ||
      !Array.isArray(config.providers) || config.providers.length < 1 || config.providers.length > 4) return null;
    const seen = new Set();
    const providers = [];
    for (const provider of config.providers) {
      if (!isRecord(provider) || Reflect.ownKeys(provider).length !== 5 ||
        !["id", "model", "inputUsdPerMillion", "outputUsdPerMillion", "maxCostUsd"].every((key) => Object.hasOwn(provider, key))) return null;
      const providerId = readCanonicalText(provider.id, 64);
      const modelId = readCanonicalText(provider.model, 128);
      if (!providerId || !["openai", "openrouter", "gemini", "groq"].includes(providerId) || !modelId ||
        !Number.isFinite(provider.inputUsdPerMillion) || provider.inputUsdPerMillion < 0 || provider.inputUsdPerMillion > MAX_PROVIDER_RATE_USD_PER_MILLION ||
        !Number.isFinite(provider.outputUsdPerMillion) || provider.outputUsdPerMillion < 0 || provider.outputUsdPerMillion > MAX_PROVIDER_RATE_USD_PER_MILLION ||
        !Number.isFinite(provider.maxCostUsd) || provider.maxCostUsd <= 0 || provider.maxCostUsd > config.budgetUsd || seen.has(providerId)) return null;
      seen.add(providerId);
      providers.push(Object.freeze({
        providerId,
        modelId,
        inputUsdPerMillion: provider.inputUsdPerMillion,
        outputUsdPerMillion: provider.outputUsdPerMillion,
        maxCostUsd: provider.maxCostUsd,
      }));
    }
    return Object.freeze({ budgetUsd: config.budgetUsd, providers: Object.freeze(providers) });
  } catch {
    return null;
  }
}

export function listConfiguredProviders(attempts, pricingConfig) {
  if (!Array.isArray(attempts) || !Array.isArray(pricingConfig?.providers)) return [];
  return attempts.flatMap((attempt) => {
    const providerId = readCanonicalText(attempt?.id, 64);
    const modelId = readCanonicalText(attempt?.model, 128);
    if (!providerId || !modelId || !hasServerCredential(attempt?.key)) return [];
    const pricing = pricingConfig.providers.find((item) => item.providerId === providerId && item.modelId === modelId);
    if (!pricing) return [];
    return [Object.freeze({
      providerId,
      providerName: PROVIDER_NAMES[providerId] || providerId,
      modelId,
      state: "configured",
      maxCostUsd: pricing.maxCostUsd,
    })];
  });
}

export function resolveProviderSelection(value, attempts, pricingConfig) {
  const selection = parseProviderSelection(value);
  if (selection.status !== "selected") return selection;
  const attempt = Array.isArray(attempts)
    ? attempts.find((candidate) => candidate?.id === selection.providerId && candidate?.model === selection.modelId && hasServerCredential(candidate?.key))
    : null;
  const pricing = Array.isArray(pricingConfig?.providers)
    ? pricingConfig.providers.find((candidate) => candidate.providerId === selection.providerId && candidate.modelId === selection.modelId)
    : null;
  return attempt && pricing ? { status: "selected", attempt, pricing, budgetUsd: pricingConfig.budgetUsd } : { status: "unavailable" };
}

export function planProviderCallBudget(messages, pricing, requestBudgetRemainingUsd, maxOutputTokens = 1200) {
  if (!Array.isArray(messages) || !pricing || !Number.isFinite(requestBudgetRemainingUsd) || requestBudgetRemainingUsd <= 0 ||
    !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1) return null;
  const inputText = messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
  const inputTokenCeiling = new TextEncoder().encode(inputText).byteLength + messages.length * 16 + 128;
  if (inputTokenCeiling > MAX_CHAT_INPUT_TOKEN_CEILING) return null;
  const inputCostCeiling = (inputTokenCeiling * pricing.inputUsdPerMillion) / 1_000_000;
  const providerBudgetUsd = Math.min(pricing.maxCostUsd, requestBudgetRemainingUsd);
  if (inputCostCeiling >= providerBudgetUsd) return null;
  const outputTokenCeiling = pricing.outputUsdPerMillion > 0
    ? Math.floor(((providerBudgetUsd - inputCostCeiling) * 1_000_000) / pricing.outputUsdPerMillion)
    : maxOutputTokens;
  const permittedOutputTokens = Math.min(maxOutputTokens, outputTokenCeiling);
  if (permittedOutputTokens < 1) return null;
  const reservedCostUsd = inputCostCeiling + (permittedOutputTokens * pricing.outputUsdPerMillion) / 1_000_000;
  if (reservedCostUsd > providerBudgetUsd + Number.EPSILON) return null;
  return Object.freeze({
    inputTokenCeiling,
    outputTokenCeiling: permittedOutputTokens,
    reservedCostUsd,
  });
}

export function calculateProviderUsageCost(providerId, data, pricing, plan) {
  const usage = providerId === "gemini" ? data?.usageMetadata : data?.usage;
  const inputTokens = providerId === "gemini" ? usage?.promptTokenCount : usage?.prompt_tokens;
  const outputTokens = providerId === "gemini" ? usage?.candidatesTokenCount : usage?.completion_tokens;
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || inputTokens > plan.inputTokenCeiling ||
    !Number.isSafeInteger(outputTokens) || outputTokens < 0 || outputTokens > plan.outputTokenCeiling) {
    return { valid: false, reason: "provider_usage_unavailable_or_out_of_bounds" };
  }
  const costUsd = (inputTokens * pricing.inputUsdPerMillion + outputTokens * pricing.outputUsdPerMillion) / 1_000_000;
  if (costUsd > plan.reservedCostUsd + Number.EPSILON || costUsd > pricing.maxCostUsd + Number.EPSILON) {
    return { valid: false, reason: "provider_usage_exceeded_budget" };
  }
  return { valid: true, costUsd };
}

export default {
  parseProviderSelection,
  parseRoutingProfile,
  normalizeProviderEntitlements,
  isProviderEntitled,
  filterEntitledProviderAttempts,
  orderProviderAttemptsForProfile,
  parseChatPricingConfig,
  listConfiguredProviders,
  resolveProviderSelection,
  planProviderCallBudget,
  calculateProviderUsageCost,
};
