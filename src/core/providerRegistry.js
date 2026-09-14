const providers = new Map();

export const PROVIDER_CAPABILITIES = {
  chat: "chat",
  reasoning: "reasoning",
  coding: "coding",
  vision: "vision",
  longContext: "long_context",
  image: "image",
};

function normalizeProvider(provider) {
  if (!provider?.id || !provider?.name) {
    throw new TypeError("A provider id and name are required.");
  }

  return {
    ...provider,
    capabilities: [...new Set(provider.capabilities || [PROVIDER_CAPABILITIES.chat])],
    models: Array.isArray(provider.models) ? provider.models : [],
    enabled: provider.enabled !== false,
  };
}

export function registerProvider(provider) {
  const normalized = normalizeProvider(provider);
  providers.set(normalized.id, normalized);
  return normalized;
}

export function unregisterProvider(providerId) {
  return providers.delete(providerId);
}

export function getProvider(providerId) {
  return providers.get(providerId) || null;
}

export function listProviders({ enabledOnly = false } = {}) {
  return Array.from(providers.values()).filter((provider) => !enabledOnly || provider.enabled);
}

export function listModels({ capability, enabledOnly = true } = {}) {
  return listProviders({ enabledOnly })
    .filter((provider) => !capability || provider.capabilities.includes(capability))
    .flatMap((provider) => provider.models.map((model) => ({
      ...model,
      providerId: provider.id,
      providerName: provider.name,
      capabilities: model.capabilities || provider.capabilities,
    })));
}

export function clearProviders() {
  providers.clear();
}

export default {
  registerProvider,
  unregisterProvider,
  getProvider,
  listProviders,
  listModels,
  clearProviders,
  PROVIDER_CAPABILITIES,
};