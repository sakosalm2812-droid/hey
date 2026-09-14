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
  return import.meta.env.VITE_HEY_API_URL ||
    (import.meta.env.VITE_SUPABASE_URL
      ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hey`
      : '/api/hey');
}

async function getHEYSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 75_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRetry(url, options = {}, { timeoutMs = 75_000, retries = 1 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchWithTimeout(url, options, timeoutMs);
    } catch (error) {
      lastError = error;
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

export async function askHEY(message, { conversationId, onConversationId, onExecutionResult, confirmed = false } = {}) {
  try {
    const brainResult = processInput(message);
    const session = await getHEYSession();
    const executionIdentity = await getExecutionIdentity(session);
    const execution = await executeRequest(
      { input: message, command: brainResult.command, tools: brainResult.tools, primaryTools: brainResult.primaryTools },
      { confirmed, user: executionIdentity },
    );
    onExecutionResult?.(execution, message);
    if (execution.handled) {
      const answer = execution.result?.message || "HEY could not complete that action.";
      addConversationMessage({ role: "assistant", content: answer });
      return answer;
    }
    const response = await fetchWithRetry(getHEYApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
      body: JSON.stringify({
        message,
        requestId: crypto.randomUUID(),
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
      })
    })

    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      const friendly = response.status === 401 ? 'Your session expired. Please sign in again.'
        : response.status === 429 ? 'HEY is receiving too many requests. Wait a moment and try again.'
        : response.status >= 500 ? 'HEY could not reach its AI provider. Check the server configuration and try again.'
        : details.error || 'HEY could not send this message.';
      throw new Error(friendly);
    }

    const data = await response.json()

    if (data.conversationId && onConversationId) {
      onConversationId(data.conversationId);
    }

    const answer = data.response || 'HEY could not generate a response.';
    const qualityReport = evaluateResponse(answer, brainResult.safety);
    saveQualityReport(qualityReport, data.conversationId || conversationId).catch((error) => {
      recordAudit({ action: "quality.report_failed", status: "failed", metadata: { reason: error.message } });
    });

    addConversationMessage({ role: "assistant", content: answer });

    return answer;
  } catch (error) {
    console.error('HEY AI Error:', error)

    throw new Error(error.name === 'AbortError' ? 'The reply took too long. Please try again.' : error.message || 'HEY is temporarily unavailable. Try again.', { cause: error });
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
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return [];

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

