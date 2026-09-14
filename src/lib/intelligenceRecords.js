import { supabase } from "./supabase.js";

async function currentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

export async function saveMemoryNode(node) {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase.from("hey_memory_nodes").upsert({ user_id: userId, node_key: node.id, value: node.value, node_type: node.type || "memory", confidence: node.confidence ?? 0.7, tags: node.tags || [], metadata: node }).select().single();
  if (error) throw error;
  return data;
}

export async function saveActionRun(action) {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase.from("hey_action_runs").upsert({
    user_id: userId,
    action_key: action.id,
    title: action.title,
    tool: action.tool,
    risk_level: action.riskLevel,
    status: action.status,
    input: action.input || {},
    result: action.result || null,
    undo: action.undo || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,action_key" }).select().single();
  if (error) throw error;
  return data;
}

export async function saveMemoryEdge(edge) {
  const userId = await currentUserId();
  if (!userId || !edge?.from || !edge?.to) return null;
  const fromKey = String(edge.from);
  const toKey = String(edge.to);
  const [{ data: fromNode }, { data: toNode }] = await Promise.all([
    supabase.from("hey_memory_nodes").select("id").eq("user_id", userId).eq("node_key", fromKey).maybeSingle(),
    supabase.from("hey_memory_nodes").select("id").eq("user_id", userId).eq("node_key", toKey).maybeSingle(),
  ]);
  if (!fromNode?.id || !toNode?.id) return null;
  const { data, error } = await supabase
    .from("hey_memory_edges")
    .upsert({
      user_id: userId,
      from_node: fromNode.id,
      to_node: toNode.id,
      relation: edge.relation || "related",
      weight: typeof edge.weight === "number" ? edge.weight : 0.6,
    }, { onConflict: "user_id,from_node,to_node,relation" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function saveAuditEntry(entry) {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase.from("hey_audit").insert({
    user_id: userId,
    action: entry.action || "unknown",
    tool: entry.tool || null,
    risk_level: entry.riskLevel || "low",
    status: entry.status || "completed",
    request_id: entry.requestId || null,
    metadata: entry.metadata || {},
  }).select().single();
  if (error) throw error;
  return data;
}

export async function saveQualityReport(report, conversationId = null) {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase.from("hey_quality_reports").insert({ user_id: userId, conversation_id: conversationId, score: report.score, checks: report.checks, needs_revision: report.needsRevision }).select().single();
  if (error) throw error;
  return data;
}

export async function saveForgeRun(input, artifact, validation) {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase.from("hey_forge_runs").insert({ user_id: userId, brief: input, artifact: artifact || {}, validation: validation || {}, status: validation?.valid ? "verified" : "needs_review" }).select().single();
  if (error) throw error;
  return data;
}
