const PROVIDERS = Object.freeze({
  openai: "OpenAI",
  openrouter: "OpenRouter",
  gemini: "Google Gemini",
  groq: "Groq",
});
const ROUTING_PROFILES = Object.freeze(["automatic", "lower_cost"]);

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalText(value, maxLength) {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > maxLength) return false;
  return !Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

export function parseRoutingProfile(value) {
  if (value === undefined || value === null) return { status: "valid", profile: "automatic" };
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
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") ||
      !canonicalText(descriptor.value, 128)) return null;
    const grant = descriptor.value.toLowerCase();
    if (seen.has(grant)) return null;
    seen.add(grant);
    grants.push(grant);
  }
  return Object.freeze(grants);
}

export function filterEntitledProviderAttempts(attempts, entitlements) {
  const grants = normalizeProviderEntitlements(entitlements);
  if (!grants?.includes("provider.remote") || !Array.isArray(attempts)) return [];
  return attempts.filter((attempt) =>
    isPlainRecord(attempt) &&
    grants.includes(`provider:${attempt.id}`) &&
    canonicalText(attempt.id, 64) &&
    canonicalText(attempt.model, 128) &&
    typeof attempt.key === "string" && attempt.key.length > 0 && attempt.key === attempt.key.trim()
  );
}

export function routingPricesFromFusionConfig(config) {
  if (!isPlainRecord(config) || !Array.isArray(config.providers)) return null;
  return Object.freeze({
    budgetUsd: config.budgetUsd,
    providers: Object.freeze(config.providers.map((provider) => Object.freeze({
      providerId: provider.id,
      modelId: provider.model,
      inputUsdPerMillion: provider.inputUsdPerMillion,
      outputUsdPerMillion: provider.outputUsdPerMillion,
      maxCostUsd: provider.maxCostUsd,
    }))),
  });
}

export function listConfiguredProviders(attempts, pricingConfig) {
  if (!Array.isArray(attempts) || !Array.isArray(pricingConfig?.providers)) return [];
  return attempts.flatMap((attempt) => {
    const price = pricingConfig.providers.find((candidate) =>
      candidate.providerId === attempt.id && candidate.modelId === attempt.model);
    if (!price) return [];
    return [Object.freeze({
      providerId: attempt.id,
      providerName: PROVIDERS[attempt.id],
      modelId: attempt.model,
      state: "configured",
    })];
  });
}

export function orderProviderAttemptsForProfile(attempts, pricingConfig, profile = "automatic") {
  if (!Array.isArray(attempts) || !ROUTING_PROFILES.includes(profile)) return [];
  if (profile === "automatic") return [...attempts];
  const prices = new Map((pricingConfig?.providers || []).map((price) => [
    `${price.providerId}\u001f${price.modelId}`,
    price.inputUsdPerMillion + price.outputUsdPerMillion,
  ]));
  return attempts
    .map((attempt, index) => ({ attempt, index, rate: prices.get(`${attempt.id}\u001f${attempt.model}`) }))
    .filter((entry) => Number.isFinite(entry.rate))
    .sort((left, right) => left.rate - right.rate || left.index - right.index)
    .map((entry) => entry.attempt);
}
