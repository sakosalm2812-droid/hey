import { processInput } from "../core/heyBrain.js";
import { addConversationMessage } from "../core/contextManager.js";
import { supabase } from "./supabase.js";
import { evaluateResponse } from "../core/qualityEngine.js";
import { saveQualityReport } from "./intelligenceRecords.js";
import { recordAudit } from "../core/auditLog.js";
import { executeRequest } from "../core/executionController.js";
import { parseProviderExecutionReceipt } from "../core/providerExecutionReceipt.js";
import { mapChatConversationRows } from "./chatRetryRoute.js";

const MAX_HEY_API_RESPONSE_BYTES = 2_000_000;

const HEY_SYSTEM = `
You are HEY.

Not an assistant.
A personal intelligence system.

Your purpose:
Help the user think, create, learn, build, and improve.

Personality:
- Calm
- Intelligent
- Direct
- Motivating when needed
- Honest when needed
- Never robotic
- Never generic

Response style:
- Short powerful paragraphs
- Clear structure
- Every sentence should have purpose
- Adapt to the user's situation

You are the core intelligence behind a futuristic AI operating system.
`;

function getHEYApiUrl() {
  const env = import.meta.env || {};
  return env.VITE_HEY_API_URL ||
    (env.VITE_SUPABASE_URL
      ? `${env.VITE_SUPABASE_URL}/functions/v1/hey`
      : '/api/hey');
}

async function getHEYSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export function withFusionRequestOptIn(payload, fusionEnabled = false) {
  const safePayload = { ...payload };
  delete safePayload.fusion;
  return fusionEnabled === true ? { ...safePayload, fusion: true } : safePayload;
}

export function getProviderRouteRequest(providerProfile, fusion = false) {
  if (fusion || providerProfile === "automatic") return {};
  if (providerProfile === "lower_cost") return { routingProfile: "lower_cost" };
  if (!isPlainDataRecord(providerProfile) || Reflect.ownKeys(providerProfile).length !== 2) {
    throw new TypeError("Choose an available model or routing profile before sending.");
  }
  const providerDescriptor = Object.getOwnPropertyDescriptor(providerProfile, "providerId");
  const modelDescriptor = Object.getOwnPropertyDescriptor(providerProfile, "modelId");
  const providerId = providerDescriptor?.value;
  const modelId = modelDescriptor?.value;
  const hasDataFields = providerDescriptor?.enumerable && Object.hasOwn(providerDescriptor, "value")
    && modelDescriptor?.enumerable && Object.hasOwn(modelDescriptor, "value");
  const safeText = (value, maxLength) => typeof value === "string" && value.length > 0 && value.length <= maxLength
    && value === value.trim() && !Array.from(value).some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127);
  if (!hasDataFields || !safeText(providerId, 64) || !/^[a-z][a-z0-9_-]*$/.test(providerId)
    || !safeText(modelId, 128) || /[\\/]/.test(modelId)) {
    throw new TypeError("The selected provider model is invalid. Choose a model from the available list.");
  }
  return { providerSelection: { providerId, modelId } };
}

export function isSameHEYAccount(requestSession, currentSession) {
  return Boolean(requestSession?.user?.id) && requestSession.user.id === currentSession?.user?.id;
}

function isPlainDataRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor && "value" in descriptor && descriptor.enumerable);
  });
}

const FUSION_PROVIDER_LABELS = Object.freeze({ openai: "OpenAI", gemini: "Gemini", openrouter: "OpenRouter", groq: "Groq" });

function parseFusionProviderAttempts(value, callsDispatched, callsMetered) {
  if (!Array.isArray(value) || value.length !== callsDispatched || value.length > 4) return null;
  const attempts = [];
  for (const attempt of value) {
    if (!isPlainDataRecord(attempt) || !Object.hasOwn(FUSION_PROVIDER_LABELS, attempt.providerId) ||
      typeof attempt.modelId !== "string" || attempt.modelId.length < 1 || attempt.modelId.length > 120 ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._:/_-]*$/.test(attempt.modelId) ||
      !["primary", "checker", "fallback"].includes(attempt.role) ||
      !["reported", "unknown"].includes(attempt.usageStatus)) return null;
    attempts.push(Object.freeze({
      providerId: attempt.providerId,
      modelId: attempt.modelId,
      role: attempt.role,
      usageStatus: attempt.usageStatus,
    }));
  }
  if (attempts.filter((attempt) => attempt.usageStatus === "reported").length !== callsMetered) return null;
  return Object.freeze(attempts);
}

async function sha256Hex(value) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function parseFusionVerificationMetadataUnsafe(value, { answer, requestId, requestText } = {}) {
  if (!isPlainDataRecord(value) || value.status !== "verified" || value.independentlyChecked !== true ||
    !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1 ||
    typeof answer !== "string" || !answer.trim() || typeof requestText !== "string" || !requestText.trim() || typeof requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId) ||
    typeof value.responseSha256 !== "string" || !/^[0-9a-f]{64}$/i.test(value.responseSha256) ||
    !isPlainDataRecord(value.cost) || !Number.isFinite(value.cost.providerReportedUsd) || value.cost.providerReportedUsd < 0 ||
    !Number.isFinite(value.cost.reservedUsd) || value.cost.reservedUsd < value.cost.providerReportedUsd ||
    !Number.isFinite(value.cost.requestCapUsd) || value.cost.requestCapUsd <= 0 || value.cost.requestCapUsd > 0.25 ||
    value.cost.reservedUsd > value.cost.requestCapUsd ||
    !Number.isSafeInteger(value.cost.callsDispatched) || value.cost.callsDispatched < 0 || value.cost.callsDispatched > 4 ||
    !Number.isSafeInteger(value.cost.callsMetered) || value.cost.callsMetered < 0 || value.cost.callsMetered > value.cost.callsDispatched ||
    (value.cost.fusionElapsedMs !== undefined && (!Number.isSafeInteger(value.cost.fusionElapsedMs) || value.cost.fusionElapsedMs < 0 || value.cost.fusionElapsedMs > 40_000)) ||
    !isPlainDataRecord(value.provenance) || value.provenance.status !== "verified" ||
    value.provenance.requestId !== requestId || typeof value.provenance.requestSha256 !== "string" ||
    !/^[0-9a-f]{64}$/i.test(value.provenance.requestSha256) || typeof value.provenance.answerSha256 !== "string" ||
    !/^[0-9a-f]{64}$/i.test(value.provenance.answerSha256)) return null;
  try {
    if (await sha256Hex(answer) !== value.responseSha256.toLowerCase() ||
      await sha256Hex(requestText.trim()) !== value.provenance.requestSha256.toLowerCase()) return null;
  } catch {
    return null;
  }
  const { primary, checker } = value.provenance;
  if (!isPlainDataRecord(primary) || !isPlainDataRecord(checker) ||
    primary.role !== "primary" || checker.role !== "checker" ||
    typeof primary.providerId !== "string" || !primary.providerId || typeof primary.modelId !== "string" || !primary.modelId ||
    typeof checker.providerId !== "string" || !checker.providerId || typeof checker.modelId !== "string" || !checker.modelId ||
    primary.providerId === checker.providerId || primary.answerClaimId !== "answer" || checker.answerClaimId !== "answer" ||
    checker.verificationClaimId !== "verification" || checker.confirmed !== true) return null;
  return Object.freeze({
    status: "verified",
    requestId,
    requestSha256: value.provenance.requestSha256.toLowerCase(),
    responseSha256: value.responseSha256.toLowerCase(),
    confidence: value.confidence,
    cost: Object.freeze({
      providerReportedUsd: value.cost.providerReportedUsd,
      reservedUsd: value.cost.reservedUsd,
      requestCapUsd: value.cost.requestCapUsd,
      callsDispatched: value.cost.callsDispatched,
      callsMetered: value.cost.callsMetered,
      ...(value.cost.fusionElapsedMs !== undefined ? { fusionElapsedMs: value.cost.fusionElapsedMs } : {}),
    }),
    primary: Object.freeze({ role: "primary", providerId: primary.providerId, modelId: primary.modelId }),
    checker: Object.freeze({ role: "checker", providerId: checker.providerId, modelId: checker.modelId }),
  });
}

function getFusionFailureCostSummary(details) {
  try {
    if (!isPlainDataRecord(details) || !isPlainDataRecord(details.fusion)) return "";
    const partial = details.fusion.partialProviderFailure;
    const partialSummary = isPlainDataRecord(partial) && partial.policy === "require_independent_confirmation" &&
      partial.disposition === "answer_withheld" && partial.successfulResponses === 1 && partial.failedResponses === 1
      ? " One provider returned a response, but the other failed. The response was withheld because independent confirmation is required."
      : "";
    const conflict = details.fusion.conflictSummary;
    const conflictSummary = details.fusion.status === "conflict" && isPlainDataRecord(conflict) &&
      Object.keys(conflict).length === 2 && Number.isSafeInteger(conflict.count) && conflict.count >= 1 && conflict.count <= 16 &&
      typeof conflict.truncated === "boolean"
      ? ` Fusion withheld an answer because providers disagreed on ${conflict.count}${conflict.truncated ? " or more" : ""} evidence claim(s).`
      : "";
    const failureSummary = `${partialSummary}${conflictSummary}`;
    if (!isPlainDataRecord(details.fusion.cost)) return failureSummary;
    const cost = details.fusion.cost;
    if (!Number.isFinite(cost.providerReportedUsd) || cost.providerReportedUsd < 0 ||
      !Number.isFinite(cost.reservedUsd) || cost.reservedUsd < cost.providerReportedUsd ||
      !Number.isFinite(cost.requestCapUsd) || cost.requestCapUsd <= 0 || cost.requestCapUsd > 0.25 ||
      cost.reservedUsd > cost.requestCapUsd || !Number.isSafeInteger(cost.callsDispatched) || cost.callsDispatched < 0 || cost.callsDispatched > 4 ||
      !Number.isSafeInteger(cost.callsMetered) || cost.callsMetered < 0 || cost.callsMetered > cost.callsDispatched) return failureSummary;
    if (cost.callsDispatched === 0) {
      return ` No provider call was dispatched; $0.0000 of the $${cost.requestCapUsd.toFixed(2)} request budget was reserved.${failureSummary}`;
    }
    const attempts = parseFusionProviderAttempts(cost.providerAttempts, cost.callsDispatched, cost.callsMetered);
    const unknownCalls = cost.callsDispatched - cost.callsMetered;
    const usage = ` Provider-reported usage: $${cost.providerReportedUsd.toFixed(4)} from ${cost.callsMetered} metered call(s).`;
    const reserve = ` Up to $${cost.reservedUsd.toFixed(4)} was reserved from the $${cost.requestCapUsd.toFixed(2)} request cap.`;
    const attemptSummary = attempts
      ? ` Provider attempts: ${attempts.map((attempt) => `${FUSION_PROVIDER_LABELS[attempt.providerId]} ${attempt.modelId} (${attempt.role}; usage ${attempt.usageStatus})`).join("; ")}.`
      : "";
    const elapsed = Number.isSafeInteger(cost.fusionElapsedMs) && cost.fusionElapsedMs >= 0 && cost.fusionElapsedMs <= 40_000
      ? ` Server-side Fusion elapsed: ${(cost.fusionElapsedMs / 1000).toFixed(2)} s.`
      : "";
    return unknownCalls > 0
      ? `${usage}${reserve}${elapsed}${failureSummary}${attemptSummary} Usage for ${unknownCalls} interrupted or unmetered call(s) is unknown; final billing is unconfirmed.`
      : `${usage}${reserve}${elapsed}${failureSummary}${attemptSummary} Final provider billing may differ.`;
  } catch {
    return "";
  }
}

export async function parseFusionVerificationMetadata(value, options = {}) {
  try {
    return await parseFusionVerificationMetadataUnsafe(value, options);
  } catch {
    return null;
  }
}

export function getHEYChatError(response, details = {}, fusion = false) {
  if (response.status === 401) return "Your session expired. Please sign in again.";
  if (details.code === "provider_entitlement_required") return "Your account does not have access to a remote AI provider.";
  if (details.code === "account_permissions_unavailable") return "HEY could not verify your provider access. Try again shortly.";
  if (details.code === "provider_profile_invalid") return "That routing profile is unavailable. Refresh the model list and try again.";
  if (details.code === "provider_pricing_unavailable") return "Cost-ranked routing is unavailable because verified model prices are missing.";
  if (fusion && response.status === 403) return "Your account is not permitted to use model fusion.";
  if (fusion && response.status === 499) return `Model fusion was cancelled before a verified response was returned.${getFusionFailureCostSummary(details)}`;
  if (fusion && (response.status === 409 || response.status === 503)) {
    const serverMessage = typeof details.error === "string" ? details.error.trim().slice(0, 240) : "";
    if (serverMessage) return `${serverMessage}${getFusionFailureCostSummary(details)}`;
    const fallback = response.status === 409
      ? "Model verification could not be completed. No verified response was returned."
      : "Model fusion is unavailable because its provider permissions or pricing are not configured.";
    return `${fallback}${getFusionFailureCostSummary(details)}`;
  }
  if (response.status === 429) return "HEY is receiving too many requests. Wait a moment and try again.";
  if (response.status >= 500) return fusion
    ? `Model fusion is unavailable right now. No verified response was returned.${getFusionFailureCostSummary(details)}`
    : "HEY could not reach its AI provider. Check the server configuration and try again.";
  return details.error || "HEY could not send this message.";
}

async function responseJsonOrEmpty(response) {
  try {
    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError" || error?.name === "TimeoutError") throw error;
    return {};
  }
}

export async function checkHEYAIReadiness({ signal, timeoutMs = 8_000 } = {}) {
  const healthUrl = `${getHEYApiUrl().replace(/\/+$/, "")}/health`;
  let response;
  try {
    response = await fetchWithTimeout(healthUrl, { method: "GET" }, timeoutMs, signal);
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return { status: "unavailable", message: "HEY AI health endpoint could not be reached." };
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return { status: "unavailable", message: "HEY AI returned an invalid health response." };
  }

  if (response.ok && payload?.status === "ready") {
    return { status: "ready", message: "Required backend configuration is present." };
  }
  if (response.status === 503 && payload?.status === "not_ready") {
    return { status: "not_configured", message: "Required Supabase or AI provider configuration is missing." };
  }
  return { status: "unavailable", message: "HEY AI health could not be confirmed." };
}

export async function getHEYProviderCatalog({ signal, timeoutMs = 8_000 } = {}) {
  const session = await getHEYSession();
  if (!session?.access_token) throw new Error("Sign in to view available AI models.");
  const catalogUrl = `${getHEYApiUrl().replace(/\/+$/, "")}/models`;
  const response = await fetchWithTimeout(catalogUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${session.access_token}` },
  }, timeoutMs, signal);
  const details = await responseJsonOrEmpty(response);
  if (!response.ok) throw new Error(details.error || "Available AI models could not be loaded.");
  const currentSession = await getHEYSession();
  if (!isSameHEYAccount(session, currentSession)) {
    throw new DOMException("The signed-in account changed while available models were loading.", "AbortError");
  }
  if (!Array.isArray(details.providers) || !details.providers.every((provider) =>
    provider && typeof provider.providerId === "string" && typeof provider.providerName === "string" &&
    typeof provider.modelId === "string" && provider.state === "configured"
  )) throw new Error("The available model catalog is invalid.");
  if (!Array.isArray(details.profiles) || !details.profiles.every((profile) =>
    profile && ["automatic", "lower_cost"].includes(profile.id) && typeof profile.label === "string"
  ) || !details.profiles.some((profile) => profile.id === "automatic")) {
    throw new Error("The routing profile catalog is invalid.");
  }
  return details;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 75_000, externalSignal) {
  const callerAbortReason = () => externalSignal?.reason instanceof Error
    ? externalSignal.reason
    : new DOMException("The request was cancelled.", "AbortError");
  if (externalSignal?.aborted) throw callerAbortReason();

  const controller = new AbortController();
  let response = null;
  let activeReader = null;
  let rejectInterrupted;
  let interruptedOnce = false;
  const interrupted = new Promise((_, reject) => { rejectInterrupted = reject; });
  const cancelBody = () => {
    try {
      const pending = (activeReader || response?.body)?.cancel?.();
      if (pending && typeof pending.catch === "function") void pending.catch(() => {});
    } catch { /* Cleanup must not delay request settlement. */ }
  };
  const interrupt = (error) => {
    if (interruptedOnce) return;
    interruptedOnce = true;
    controller.abort(error);
    cancelBody();
    rejectInterrupted(error);
  };
  const timeout = setTimeout(() => interrupt(new DOMException("The request timed out.", "TimeoutError")), timeoutMs);
  const abortFromCaller = () => interrupt(callerAbortReason());
  externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const cleanup = () => {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  };
  try {
    response = await Promise.race([
      fetch(url, { ...options, signal: controller.signal }).then((lateResponse) => {
        if (controller.signal.aborted) {
          try { void Promise.resolve(lateResponse.body?.cancel?.()).catch(() => {}); } catch { /* Best effort. */ }
          throw controller.signal.reason;
        }
        return lateResponse;
      }),
      interrupted,
    ]);
    const nativeJson = response.json.bind(response);
    response.json = async () => {
      try {
        const declaredLength = response.headers?.get?.("content-length");
        if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_HEY_API_RESPONSE_BYTES) {
          cancelBody();
          throw new Error("HEY returned an oversized response.");
        }
        const reader = response.body?.getReader?.();
        if (!reader) return await Promise.race([nativeJson(), interrupted]);
        activeReader = reader;
        const chunks = [];
        let totalBytes = 0;
        while (true) {
          const outcome = await Promise.race([
            reader.read().then((result) => ({ result })),
            interrupted,
          ]);
          const { done, value } = outcome.result;
          if (done) break;
          if (!(value instanceof Uint8Array)) throw new Error("HEY returned an invalid response body.");
          totalBytes += value.byteLength;
          if (totalBytes > MAX_HEY_API_RESPONSE_BYTES) {
            cancelBody();
            throw new Error("HEY returned an oversized response.");
          }
          chunks.push(value);
        }
        const bytes = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      } finally {
        try { activeReader?.releaseLock(); } catch { /* A failed read may retain its lock. */ }
        activeReader = null;
        cleanup();
      }
    };
    return response;
  } catch (error) {
    cleanup();
    throw error;
  }
}

async function fetchWithRetry(url, options = {}, { timeoutMs = 75_000, retries = 1, signal } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    try {
      return await fetchWithTimeout(url, options, timeoutMs, signal);
    } catch (error) {
      lastError = error;
      if (signal?.aborted || error?.name === "AbortError") throw error;
      if (attempt === retries) break;
    }
  }
  throw lastError;
}

async function getExecutionIdentity(session) {
  const userId = session?.user?.id;
  if (!userId) return null;

  const [{ data: profile, error: profileError }, { data: permissions, error: permissionsError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan, entitlements")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("hey_permissions")
      .select("permission")
      .eq("user_id", userId)
      .eq("status", "granted"),
  ]);

  if (profileError || permissionsError || !profile) {
    throw new Error("HEY could not verify your account permissions.");
  }

  return {
    id: userId,
    role: "user",
    plan: profile.plan,
    entitlements: Array.isArray(profile.entitlements) ? profile.entitlements : [],
    permissions: (permissions || []).map((item) => item.permission),
  };
}

export async function askHEY(message, { conversationId, onConversationId, onExecutionResult, onFusionVerification, onProviderExecutionReceipt, confirmed = false, fusion = false, providerProfile = "automatic", signal } = {}) {
  try {
    if (signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    const providerRouteRequest = getProviderRouteRequest(providerProfile, fusion);
    const brainResult = processInput(message);
    const session = await getHEYSession();
    const executionIdentity = fusion ? null : await getExecutionIdentity(session);
    const execution = fusion ? null : await executeRequest(
      { input: message, command: brainResult.command, tools: brainResult.tools, primaryTools: brainResult.primaryTools },
      { confirmed, user: executionIdentity },
    );
    if (signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    const currentBeforeSend = await getHEYSession();
    if (!isSameHEYAccount(session, currentBeforeSend)) {
      throw new DOMException("The signed-in account changed while this request was running.", "AbortError");
    }
    onExecutionResult?.(execution, message);
    if (execution.handled) {
      const answer = execution.result?.message || "HEY could not complete that action.";
      addConversationMessage({ role: "assistant", content: answer });
      return answer;
    }
    const requestId = crypto.randomUUID();
    let response;
    try {
      response = await fetchWithRetry(getHEYApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
      body: JSON.stringify(withFusionRequestOptIn({
        message,
        requestId,
        system: `${HEY_SYSTEM}\n\n${brainResult.instruction}`,
        context: brainResult.context,
        memory: brainResult.memory,
        analysis: brainResult.analysis,
        intent: brainResult.intent,
        agent: brainResult.agent,
        agentTeam: brainResult.agents,
        plan: brainResult.plan,
        providerPlan: brainResult.providerPlan,
        safety: brainResult.safety,
        tools: brainResult.tools,
        primaryTools: brainResult.primaryTools,
        responseStyle: brainResult.responseStyle,
        conversationId,
        ...providerRouteRequest,
      }, fusion))
      }, { signal });
    } catch (error) {
      if (error?.name === "AbortError" || error?.name === "TimeoutError") throw error;
      throw new Error("HEY AI could not be reached. Check your connection and try again.", { cause: error });
    }

    if (!response.ok) {
      const details = await responseJsonOrEmpty(response);
      throw new Error(getHEYChatError(response, details, fusion));
    }

    const data = await response.json()
    if (signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    const currentSession = await getHEYSession();
    if (!isSameHEYAccount(session, currentSession)) {
      throw new DOMException("The signed-in account changed while this request was running.", "AbortError");
    }

    const fusionVerification = fusion
      ? await parseFusionVerificationMetadata(data.fusion, { answer: data.response, requestId, requestText: message })
      : null;
    if (fusion) {
      if (signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
      const currentAfterVerification = await getHEYSession();
      if (!isSameHEYAccount(session, currentAfterVerification)) {
        throw new DOMException("The signed-in account changed while this request was running.", "AbortError");
      }
    }
    if (fusion && !fusionVerification) {
      throw new Error("Model fusion did not return verified provider provenance. No answer was delivered.");
    }
    const providerExecutionReceipt = !fusion ? parseProviderExecutionReceipt(data.providerExecutionReceipt) : null;
    if (typeof data.response !== "string" || !data.response.trim()) {
      throw new Error(fusion ? "Model fusion did not return a verified answer. No answer was delivered." : "HEY did not return a response. Please try again.");
    }
    if (fusion) onFusionVerification?.(fusionVerification);
    else if (providerExecutionReceipt) onProviderExecutionReceipt?.(providerExecutionReceipt);

    if (data.conversationId && onConversationId) {
      onConversationId(data.conversationId);
    }
    const answer = data.response;
    const qualityReport = evaluateResponse(answer, brainResult.safety);
    saveQualityReport(qualityReport, data.conversationId || conversationId).catch((error) => {
      recordAudit({ action: "quality.report_failed", status: "failed", metadata: { reason: error.message } });
    });

    addConversationMessage({ role: "assistant", content: answer });

    return answer;
  } catch (error) {
    console.error('HEY AI Error:', error)

    if (error.name === 'AbortError') throw error;
    if (error.name === 'TimeoutError') throw new Error('The reply took too long. Please try again.', { cause: error });
    throw new Error(error.message || 'HEY is temporarily unavailable. Try again.', { cause: error });
  }
}

export async function rewriteHEYText({ text, instruction, signal, providerProfile = "automatic" } = {}) {
  if (typeof text !== "string" || !text.trim() || text.length > 4096 ||
    typeof instruction !== "string" || !instruction.trim() || instruction.length > 4096) {
    throw new Error("The selected text or edit instruction is invalid.");
  }
  if (signal?.aborted) throw new DOMException("The rewrite was cancelled.", "AbortError");
  const providerRouteRequest = getProviderRouteRequest(providerProfile, false);
  const session = await getHEYSession();
  if (!session?.access_token) throw new Error("Sign in to preview a selected-text rewrite.");
  const currentSession = await getHEYSession();
  if (!isSameHEYAccount(session, currentSession)) throw new DOMException("The signed-in account changed.", "AbortError");
  const response = await fetchWithRetry(getHEYApiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({
      operation: "dictation_rewrite",
      requestId: crypto.randomUUID(),
      message: instruction,
      selectedText: text,
      instruction,
      ...providerRouteRequest,
    }),
  }, { timeoutMs: 20_000, retries: 0, signal });
  if (!response.ok) {
    const details = await responseJsonOrEmpty(response);
    throw new Error(getHEYChatError(response, details));
  }
  const data = await response.json();
  if (signal?.aborted) throw new DOMException("The rewrite was cancelled.", "AbortError");
  const latestSession = await getHEYSession();
  if (!isSameHEYAccount(session, latestSession)) throw new DOMException("The signed-in account changed.", "AbortError");
  if (typeof data.text !== "string" || !data.text.trim() || data.text.length > 4096) {
    throw new Error("HEY could not create a usable rewrite preview.");
  }
  return { text: data.text };
}

export async function createForgeArtifact(description, category, plan) {
  const session = await getHEYSession();
  if (!session?.access_token) throw new Error("Sign in to use Forge.");

  const response = await fetchWithRetry(getHEYApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      operation: "forge",
      requestId: crypto.randomUUID(),
      message: description,
      description,
      category,
      plan,
    }),
  }, { timeoutMs: 120_000 });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Forge could not generate the artifact.");
  return data;
}

export async function listHEYConversations() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error("Supabase could not verify your session.", { cause: sessionError });
  const session = sessionData?.session;
  if (!session?.user) throw new Error("Your Supabase session is unavailable.");

  const { data, error } = await supabase
    .from("hey_conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", session.user.id)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getHEYConversationMessages(conversationId) {
  if (!conversationId) return [];

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error("Supabase could not verify your session.", { cause: sessionError });
  const session = sessionData?.session;
  const userId = session?.user?.id;
  if (!userId) throw new Error("Your Supabase session is unavailable.");

  const { data, error } = await supabase
    .from("hey_messages")
    .select("user_id, role, content, metadata, created_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const { data: currentSessionData, error: currentSessionError } = await supabase.auth.getSession();
  if (currentSessionError) throw new Error("Supabase could not verify your session.", { cause: currentSessionError });
  if (!isSameHEYAccount(session, currentSessionData?.session)) {
    throw new DOMException("The signed-in account changed while loading this conversation.", "AbortError");
  }

  return mapChatConversationRows(data || [], userId);
}

