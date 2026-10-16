import { processInput } from "../core/heyBrain.js";
import { addConversationMessage } from "../core/contextManager.js";
import { supabase } from "./supabase.js";
import { evaluateResponse } from "../core/qualityEngine.js";
import { saveQualityReport } from "./intelligenceRecords.js";
import { recordAudit } from "../core/auditLog.js";
import { executeRequest } from "../core/executionController.js";

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
    primary: Object.freeze({ role: "primary", providerId: primary.providerId, modelId: primary.modelId }),
    checker: Object.freeze({ role: "checker", providerId: checker.providerId, modelId: checker.modelId }),
  });
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
  if (fusion && response.status === 403) return "Your account is not permitted to use model fusion.";
  if (fusion && response.status === 409) return "The providers could not independently confirm an answer. No answer was delivered.";
  if (fusion && response.status === 503) return "Model fusion is unavailable because its provider permissions or pricing are not configured.";
  if (response.status === 429) return "HEY is receiving too many requests. Wait a moment and try again.";
  if (response.status >= 500) return fusion
    ? "Model fusion is unavailable right now. No answer was delivered."
    : "HEY could not reach its AI provider. Check the server configuration and try again.";
  return details.error || "HEY could not send this message.";
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
  } catch {
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

async function fetchWithTimeout(url, options = {}, timeoutMs = 75_000, externalSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("The request timed out.", "TimeoutError")), timeoutMs);
  const abortFromCaller = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromCaller();
  else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromCaller);
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

export async function askHEY(message, { conversationId, onConversationId, onExecutionResult, onFusionVerification, confirmed = false, fusion = false, signal } = {}) {
  try {
    if (signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
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
      }, fusion))
      }, { signal });
    } catch (error) {
      if (error?.name === "AbortError" || error?.name === "TimeoutError") throw error;
      throw new Error("HEY AI could not be reached. Check your connection and try again.", { cause: error });
    }

    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
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
    if (typeof data.response !== "string" || !data.response.trim()) {
      throw new Error(fusion ? "Model fusion did not return a verified answer. No answer was delivered." : "HEY did not return a response. Please try again.");
    }
    if (fusion) onFusionVerification?.(fusionVerification);

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

  const { data, error } = await supabase
    .from("hey_messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data || []).map((message) => ({
    role: message.role === "assistant" ? "hey" : "user",
    text: message.content,
  }));
}

