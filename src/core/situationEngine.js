import { getAccountScope } from "./accountScope.js";

const DEFAULT_BUDGET_BYTES = 12_000;
const PRIVATE_PATTERNS = [
  /\b(password|passcode|secret|api[ _-]?key|access[ _-]?token|credential)\b/i,
  /\b(ssn|social security|credit card|bank account|routing number)\b/i,
  /\b(diagnosis|prescription|medical record|therapy session)\b/i,
];

function bytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function contentOf(record) {
  const content = record?.value ?? record?.fact ?? record?.pattern ?? record?.content ?? record?.text;
  if (typeof content === "string") return content;
  if (content == null) return "";
  try { return JSON.stringify(content); } catch { return ""; }
}

function tokens(text) {
  return String(text || "").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

function scoreRecord(record, query, now) {
  const value = contentOf(record);
  if (!value) return 0;
  const queryTokens = new Set(tokens(query));
  const valueTokens = new Set(tokens([value, record.type, ...(record.tags || [])].join(" ")));
  let overlap = 0;
  queryTokens.forEach((token) => { if (valueTokens.has(token)) overlap += 1; });
  const relevance = queryTokens.size ? overlap / queryTokens.size : 0.2;
  const confidence = Number.isFinite(Number(record.confidence)) ? Math.max(0, Math.min(1, Number(record.confidence))) : 0.35;
  const explicit = record.metadata?.explicit === true || record.explicit === true;
  const inferred = record.source === "agent_inferred" || record.explicit === false || record.metadata?.explicit === false;
  const timestamp = Date.parse(record.updatedAt || record.createdAt || record.observedAt || "");
  const ageDays = Number.isFinite(timestamp) ? Math.max(0, (now - timestamp) / 86_400_000) : 365;
  const freshness = Math.exp(-ageDays / 45);
  return relevance * 0.55 + confidence * 0.2 + freshness * 0.15 + (explicit ? 0.12 : 0) - (inferred ? 0.18 : 0);
}

function privacyBlocked(record, destination) {
  if (destination === "local") return false;
  if (record.localOnly === true || record.locality === "local_only") return true;
  if (record.cloudAllowed !== true || record.cloudConsent !== true) return true;
  if (record.sensitivity === "sensitive" || record.privacyScope === "private") return true;
  return PRIVATE_PATTERNS.some((pattern) => pattern.test(contentOf(record)));
}

/**
 * Builds a small, explainable, account-bound context packet. Candidate records
 * remain owned by their existing systems; this compiler only selects and labels.
 */
export function compileSituation({
  query = "",
  context = {},
  records = [],
  accountScope = getAccountScope(),
  workspaceId = null,
  projectId = null,
  destination = "cloud",
  budgetBytes = DEFAULT_BUDGET_BYTES,
  now = Date.now(),
  authorize = () => true,
} = {}) {
  const scope = getAccountScope();
  if (accountScope !== scope) return { version: 1, context: {}, selected: [], excluded: [{ reason: "account_scope_mismatch" }], bytes: 0 };
  if (!Number.isSafeInteger(budgetBytes) || budgetBytes < 256 || budgetBytes > 1_000_000) {
    throw new RangeError("Context byte budget must be an integer between 256 and 1000000.");
  }
  if (String(query).length > 8_000) throw new RangeError("Situation query exceeds 8000 characters.");
  const excluded = [];
  let omittedExclusions = 0;
  const exclude = (entry) => {
    if (excluded.length < 10) excluded.push(entry);
    else omittedExclusions += 1;
  };
  const eligible = [];
  const seen = new Set();

  const inputRecords = Array.isArray(records) ? records : [];
  if (inputRecords.length > 1_000) exclude({ reason: "candidate_limit", omittedCount: inputRecords.length - 1_000 });
  for (const record of inputRecords.slice(0, 1_000)) {
    const id = record?.id;
    if (!id || seen.has(id)) { exclude({ id: id || null, reason: "invalid_or_duplicate" }); continue; }
    seen.add(id);
    if (record.accountScope && record.accountScope !== scope) { exclude({ id, reason: "account_scope_mismatch" }); continue; }
    if (record.workspaceId && record.workspaceId !== workspaceId) { exclude({ id, reason: "workspace_scope_mismatch" }); continue; }
    if (record.projectId && record.projectId !== projectId) { exclude({ id, reason: "project_scope_mismatch" }); continue; }
    if (record.privacyScope === "project" && (!projectId || record.projectId !== projectId)) { exclude({ id, reason: "project_scope_mismatch" }); continue; }
    if (record.expiresAt && Date.parse(record.expiresAt) <= now) { exclude({ id, reason: "expired" }); continue; }
    if (record.deletedAt || record.status === "deleted") { exclude({ id, reason: "deleted" }); continue; }
    let authorized = false;
    try { authorized = authorize(record, { accountScope: scope, destination }) === true; } catch { /* Authorization failures deny access. */ }
    if (!authorized) { exclude({ id, reason: "permission_denied" }); continue; }
    if (privacyBlocked(record, destination)) { exclude({ id, reason: "privacy_or_locality" }); continue; }
    eligible.push({ record, score: scoreRecord(record, query, now) });
  }
  eligible.sort((a, b) => b.score - a.score || String(a.record.id).localeCompare(String(b.record.id)));

  const local = destination === "local";
  const contextConsent = context.cloudContextConsent === true;
  const safeContext = {
    user: context.user && (local || contextConsent) ? { id: local ? context.user.id || null : null, name: context.user.name || null, goals: Array.isArray(context.user.goals) ? context.user.goals.slice(0, 5).map((goal) => String(goal).slice(0, 300)) : [] } : null,
    conversation: context.conversation ? {
      currentTopic: (local || contextConsent) ? context.conversation.currentTopic || null : null,
      lastIntent: context.conversation.lastIntent || null,
      history: (local || contextConsent) && Array.isArray(context.conversation.history) ? context.conversation.history.slice(-3).map(({ role, content, timestamp }) => ({ role, content: String(content || "").slice(0, 1000), timestamp })) : [],
    } : null,
    environment: context.environment ? { time: context.environment.time, timezone: context.environment.timezone, online: context.environment.online } : null,
  };
  const output = { version: 1, context: safeContext, memories: [], selected: [], excluded, bytes: 0, destination };
  for (const candidate of eligible) {
    const item = {
      id: candidate.record.id,
      content: contentOf(candidate.record).slice(0, 2_000),
      type: candidate.record.type || "memory",
      provenance: candidate.record.source || candidate.record.provenance || "unknown",
      confidence: Number.isFinite(Number(candidate.record.confidence)) ? Math.max(0, Math.min(1, Number(candidate.record.confidence))) : null,
      explicit: candidate.record.metadata?.explicit === true || candidate.record.explicit === true,
      freshness: candidate.record.updatedAt || candidate.record.createdAt || candidate.record.observedAt || null,
      score: Number(candidate.score.toFixed(4)),
      handling: "untrusted_data",
    };
    output.memories.push(item);
    const selection = { id: item.id, reason: "ranked_relevant_and_authorized", score: item.score };
    output.selected.push(selection);
    const nextBytes = bytes(output);
    if (nextBytes > budgetBytes) {
      output.memories.pop();
      output.selected.pop();
      exclude({ id: item.id, reason: "context_budget" });
      continue;
    }
    output.bytes = nextBytes;
  }
  if (omittedExclusions > 0) excluded.push({ reason: "additional_exclusions", count: omittedExclusions });
  output.bytes = bytes(output);
  if (output.bytes > budgetBytes) {
    output.omittedCount = 0;
    while (output.bytes > budgetBytes && output.memories.length) {
      output.memories.pop();
      output.selected.pop();
      output.omittedCount += 1;
      output.bytes = bytes(output);
    }
    if (output.bytes > budgetBytes) {
      output.context = { user: null, conversation: null, environment: null };
      output.memories = [];
      output.selected = [];
      const budgetLimited = output.excluded.some((entry) => entry.reason === "context_budget") || omittedExclusions > 0;
      output.excluded = [{ reason: budgetLimited ? "context_budget" : "base_context_exceeds_budget" }];
      output.omittedCount = output.omittedCount + omittedExclusions;
      output.bytes = bytes(output);
    }
  }
  return output;
}

export default { compileSituation };
