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

function retryDelayMs(response) {
  const value = response.headers?.get?.("Retry-After");
  if (!value) return 250;
  const seconds = Number(value);
  const parsed = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Math.max(0, Math.min(3_600_000, Number.isFinite(parsed) ? parsed : 250));
}

function delayWithSignal(delayMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("The provider request was cancelled.", "AbortError"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("The provider request was cancelled.", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Dispatch a bounded server-configured model, with no client-selected URL or credential. */
export async function callConfiguredProvider({
  messages,
  maxTokens = 1200,
  attempts,
  pricingConfig,
  selected,
  signal,
  authorizeProvider,
  appUrl = "http://localhost:5173",
  fetchImpl = fetch,
} = {}) {
  let lastError = "No priced AI provider is configured";
  const orderedAttempts = selected ? [selected.attempt] : attempts;
  let reservedBudgetUsd = 0;
  const deadline = Date.now() + 35_000;
  let lastProviderStatus = 0;
  let lastRetryAfterSeconds = null;

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
    const selected429RetryAllowed = Boolean(selected &&
      budgetPlan.reservedCostUsd * 2 <= pricing.maxCostUsd + Number.EPSILON &&
      budgetPlan.reservedCostUsd * 2 <= pricingConfig.budgetUsd - reservedBudgetUsd + Number.EPSILON);
    reservedBudgetUsd += budgetPlan.reservedCostUsd * (selected429RetryAllowed ? 2 : 1);
    const inputText = messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
    const providerMaxTokens = budgetPlan.outputTokenCeiling;

    try {
      const authorized = typeof authorizeProvider !== "function" || await authorizeProvider({ providerId: provider.id, modelId: provider.model, signal });
      if (!authorized) throw Object.assign(new Error("Provider entitlement is required"), { providerEntitlementDenied: true });
      for (let retry = 0; retry <= 1; retry += 1) {
        const attemptRemainingMs = Math.min(18_000, deadline - Date.now());
        if (attemptRemainingMs <= 0) {
          lastError = `${provider.id}: request deadline exceeded`;
          break;
        }
        lastProviderStatus = 0;
        lastRetryAfterSeconds = null;
        const response = provider.id === "gemini"
          ? await fetchWithTimeout(`${PROVIDER_ENDPOINTS.gemini}/${encodeURIComponent(provider.model)}:generateContent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": provider.key },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: inputText }] }],
              generationConfig: { maxOutputTokens: providerMaxTokens, temperature: 0.7 },
            }),
          }, attemptRemainingMs, signal, fetchImpl)
          : await fetchWithTimeout(PROVIDER_ENDPOINTS[provider.id], {
            method: "POST",
            headers: {
              Authorization: `Bearer ${provider.key}`,
              "Content-Type": "application/json",
              ...(provider.id === "openrouter" ? { "HTTP-Referer": appUrl, "X-Title": "HEY" } : {}),
            },
            body: JSON.stringify({ model: provider.model, messages, temperature: 0.7, max_tokens: providerMaxTokens }),
          }, attemptRemainingMs, signal, fetchImpl);

        if (signal?.aborted) throw new DOMException("The provider request was cancelled.", "AbortError");
        lastProviderStatus = response.status;
        if (response.status === 429) {
          const retryDelay = retryDelayMs(response);
          lastRetryAfterSeconds = Math.max(1, Math.ceil(retryDelay / 1000));
          lastError = `${provider.id}: provider rate limited the request`;
          if (selected429RetryAllowed && retry === 0 && retryDelay <= 1500 && Date.now() + retryDelay < deadline) {
            await delayWithSignal(retryDelay, signal);
            continue;
          }
          break;
        }
        if (!response.ok) {
          lastProviderStatus = response.status;
          lastError = `${provider.id}: request failed (HTTP ${response.status})`;
          break;
        }
        const responseText = await response.text();
        if (responseText.length > 1_000_000) {
          lastError = `${provider.id}: response exceeded the supported size`;
          break;
        }
        let data;
        try {
          data = JSON.parse(responseText);
        } catch {
          lastError = `${provider.id}: response was invalid`;
          break;
        }
        if (signal?.aborted) throw new DOMException("The provider request was cancelled.", "AbortError");
        const stillAuthorized = typeof authorizeProvider !== "function" || await authorizeProvider({ providerId: provider.id, modelId: provider.model, signal });
        if (!stillAuthorized) throw Object.assign(new Error("Provider entitlement is required"), { providerEntitlementDenied: true });
        const usageCost = calculateProviderUsageCost(provider.id, data, pricing, budgetPlan);
        if (!usageCost.valid) {
          lastError = `${provider.id}: ${usageCost.reason}`;
          break;
        }
        return { data, providerId: provider.id, model: provider.model, costUsd: usageCost.costUsd };
      }
    } catch (error) {
      if (signal?.aborted) throw new DOMException("The provider request was cancelled.", "AbortError");
      if (error?.providerEntitlementDenied) throw error;
      if (error?.providerAuthorizationUnavailable) throw error;
      lastError = `${provider.id}: request failed`;
    }
  }

  throw Object.assign(new Error(lastError), {
    providerBudgetExhausted: lastError.toLowerCase().includes("budget"),
    providerRateLimited: lastProviderStatus === 429,
    retryAfterSeconds: lastRetryAfterSeconds,
    providerHttpStatus: lastProviderStatus,
  });
}

export default { callConfiguredProvider };
