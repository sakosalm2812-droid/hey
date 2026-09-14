import {
  listModels,
  PROVIDER_CAPABILITIES,
  registerProvider,
} from "./providerRegistry.js";

const taskCapabilities = {
  coding: PROVIDER_CAPABILITIES.coding,
  research: PROVIDER_CAPABILITIES.reasoning,
  vision: PROVIDER_CAPABILITIES.vision,
  image: PROVIDER_CAPABILITIES.image,
  conversation: PROVIDER_CAPABILITIES.chat,
};

function registerConfiguredProviders() {
  if (listModels({ enabledOnly: false }).length) return;

  registerProvider({
    id: "openrouter",
    name: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1",
    capabilities: ["chat", "reasoning", "coding", "vision", "long_context", "image"],
    models: [{ id: "configured", label: "Configured model", priority: 10 }],
  });
  registerProvider({
    id: "gemini",
    name: "Google Gemini",
    endpoint: "https://generativelanguage.googleapis.com",
    capabilities: ["chat", "reasoning", "vision", "long_context", "image"],
    models: [{ id: "configured", label: "Configured model", priority: 20 }],
  });
  registerProvider({
    id: "groq",
    name: "Groq",
    endpoint: "https://api.groq.com/openai/v1",
    capabilities: ["chat", "reasoning", "coding"],
    models: [{ id: "configured", label: "Configured model", priority: 30 }],
  });
}

export function selectModel({ intent = "conversation", capability, preferredProvider, excludedProviders = [] } = {}) {
  registerConfiguredProviders();
  const requestedCapability = capability || taskCapabilities[intent] || PROVIDER_CAPABILITIES.chat;
  const candidates = listModels({ capability: requestedCapability })
    .filter((model) => !excludedProviders.includes(model.providerId))
    .sort((left, right) => {
      if (preferredProvider) {
        if (left.providerId === preferredProvider) return -1;
        if (right.providerId === preferredProvider) return 1;
      }
      return (left.priority || 100) - (right.priority || 100);
    });

  const selected = candidates[0] || null;
  return {
    selected,
    capability: requestedCapability,
    fallbacks: candidates.slice(1),
    requiresServerCredential: Boolean(selected),
  };
}

export function createProviderPlan(options = {}) {
  const selection = selectModel(options);
  return {
    ...selection,
    attempts: [selection.selected, ...selection.fallbacks].filter(Boolean).map((model) => ({
      providerId: model.providerId,
      modelId: model.id,
    })),
    policy: {
      retryTransientFailures: true,
      maxAttempts: Math.min(3, selection.fallbacks.length + (selection.selected ? 1 : 0)),
      preserveConversation: true,
    },
  };
}

export default { selectModel, createProviderPlan };