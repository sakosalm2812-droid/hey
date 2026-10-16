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

export function snapshotProviderAttempts(value) {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 8) return null;
    const snapshot = [];
    const seen = new Set();
    for (let index = 0; index < value.length; index += 1) {
      const item = Object.getOwnPropertyDescriptor(value, String(index));
      if (!item?.enumerable || !Object.hasOwn(item, "value") || !isPlainRecord(item.value)) return null;
      const source = item.value;
      if (Reflect.ownKeys(source).length !== 3) return null;
      const descriptors = ["id", "model", "key"].map((key) => Object.getOwnPropertyDescriptor(source, key));
      if (descriptors.some((descriptor) => !descriptor?.enumerable || !Object.hasOwn(descriptor, "value"))) return null;
      const [id, model, key] = descriptors.map((descriptor) => descriptor.value);
      if (!canonicalText(id, 64) || !/^[a-z][a-z0-9_-]*$/.test(id) || !canonicalText(model, 128) ||
        /[\\/]/.test(model) || typeof key !== "string" || !key || key !== key.trim() || seen.has(id)) return null;
      seen.add(id);
      snapshot.push(Object.freeze({ id, model, key }));
    }
    if (Reflect.ownKeys(value).length !== value.length + 1) return null;
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

export function parseRoutingProfile(value) {
  if (value === undefined || value === null) return { status: "valid", profile: "automatic" };
  return typeof value === "string" && ROUTING_PROFILES.includes(value)
    ? { status: "valid", profile: value }
    : { status: "invalid" };
}

export function parseProviderSelection(value) {
  if (value === undefined || value === null) return { status: "automatic" };
  try {
    if (!isPlainRecord(value) || Reflect.ownKeys(value).length !== 2) return { status: "invalid" };
    const providerDescriptor = Object.getOwnPropertyDescriptor(value, "providerId");
    const modelDescriptor = Object.getOwnPropertyDescriptor(value, "modelId");
    if (!providerDescriptor?.enumerable || !Object.hasOwn(providerDescriptor, "value") ||
      !modelDescriptor?.enumerable || !Object.hasOwn(modelDescriptor, "value") ||
      !canonicalText(providerDescriptor.value, 64) || !/^[a-z][a-z0-9_-]*$/.test(providerDescriptor.value) ||
      !canonicalText(modelDescriptor.value, 128) || /[\\/]/.test(modelDescriptor.value)) return { status: "invalid" };
    return { status: "selected", providerId: providerDescriptor.value, modelId: modelDescriptor.value };
  } catch {
    return { status: "invalid" };
  }
}

export function resolveProviderSelection(selection, attempts, entitlements, pricingConfig) {
  if (selection?.status !== "selected") return { status: "invalid" };
  const grants = normalizeProviderEntitlements(entitlements);
  if (!grants?.includes("provider.remote") || !grants.includes(`provider:${selection.providerId}`)) {
    return { status: "denied" };
  }
  const attempt = Array.isArray(attempts) && attempts.find((candidate) =>
    isPlainRecord(candidate) && candidate.id === selection.providerId && candidate.model === selection.modelId &&
    canonicalText(candidate.id, 64) && canonicalText(candidate.model, 128) &&
    typeof candidate.key === "string" && candidate.key.length > 0 && candidate.key === candidate.key.trim());
  if (!attempt) return { status: "unavailable" };
  const price = Array.isArray(pricingConfig?.providers) && pricingConfig.providers.find((candidate) =>
    candidate.providerId === selection.providerId && candidate.modelId === selection.modelId &&
    Number.isFinite(candidate.inputUsdPerMillion) && Number.isFinite(candidate.outputUsdPerMillion) &&
    Number.isFinite(candidate.maxCostUsd));
  return price ? { status: "selected", attempt } : { status: "unavailable" };
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
