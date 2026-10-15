import { calculateProviderUsageCost, planProviderCallBudget } from "./providerCatalog.js";

const PROVIDER_ENDPOINTS = Object.freeze({
  openai: "https://api.openai.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/models",
});

async function fetchWithTimeout(url, init, timeoutMs, parentSignal, fetchImpl) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(() => controller.abort(new DOMException("Provider request timed out.", "TimeoutError")), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

/** Dispatch a bounded server-configured model, with no client-selected URL or credential. */
export async function callConfiguredProvider({
  messages,
  maxTokens = 1200,
  attempts,
  pricingConfig,
  selected,
  signal,
  appUrl = "http://localhost:5173",
  fetchImpl = fetch,
} = {}) {
  let lastError = "No priced AI provider is configured";
  const orderedAttempts = selected ? [selected.attempt] : attempts;
  let reservedBudgetUsd = 0;
  const deadline = Date.now() + 35_000;

  for (const provider of orderedAttempts || []) {
    if (signal?.aborted) throw new DOMException("The provider request was cancelled.", "AbortError");
    const remaining = Math.min(18_000, deadline - Date.now());
    if (remaining <= 0) break;
    const pricing = selected?.attempt === provider
      ? selected.pricing
      : pricingConfig?.providers?.find((item) => item.providerId === provider.id && item.modelId === provider.model);
    if (!pricing) continue;
    const budgetPlan = planProviderCallBudget(messages, pricing, pricingConfig.budgetUsd - reservedBudgetUsd, maxTokens);
    if (!budgetPlan) {
      lastError = "The configured model budget cannot cover this request's input";
      continue;
    }
    reservedBudgetUsd += budgetPlan.reservedCostUsd;
    const inputText = messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
    const providerMaxTokens = budgetPlan.outputTokenCeiling;

    try {
      const response = provider.id === "gemini"
        ? await fetchWithTimeout(`${PROVIDER_ENDPOINTS.gemini}/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.key)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: inputText }] }],
            generationConfig: { maxOutputTokens: providerMaxTokens, temperature: 0.7 },
          }),
        }, remaining, signal, fetchImpl)
        : await fetchWithTimeout(PROVIDER_ENDPOINTS[provider.id], {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.key}`,
            "Content-Type": "application/json",
            ...(provider.id === "openrouter" ? { "HTTP-Referer": appUrl, "X-Title": "HEY" } : {}),
          },
          body: JSON.stringify({ model: provider.model, messages, temperature: 0.7, max_tokens: providerMaxTokens }),
        }, remaining, signal, fetchImpl);

      if (signal?.aborted) throw new DOMException("The provider request was cancelled.", "AbortError");
      const data = await response.json();
      if (signal?.aborted) throw new DOMException("The provider request was cancelled.", "AbortError");
      if (response.ok) {
        const usageCost = calculateProviderUsageCost(provider.id, data, pricing, budgetPlan);
        if (!usageCost.valid) {
          lastError = `${provider.id}: ${usageCost.reason}`;
          continue;
        }
        return { data, providerId: provider.id, model: provider.model, costUsd: usageCost.costUsd };
      }
      lastError = `${provider.id}: request failed (HTTP ${response.status})`;
    } catch {
      if (signal?.aborted) throw new DOMException("The provider request was cancelled.", "AbortError");
      lastError = `${provider.id}: request failed`;
    }
  }

  throw Object.assign(new Error(lastError), { providerBudgetExhausted: lastError.toLowerCase().includes("budget") });
}

export default { callConfiguredProvider };
