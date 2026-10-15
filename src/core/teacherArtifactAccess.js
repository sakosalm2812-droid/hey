import { supabaseClient } from "../lib/supabase.js";

/**
 * HEY's narrow Teacher answer-key contract. A deployment must provision these
 * server-managed Supabase app_metadata claims: hey_role="teacher",
 * hey_account_scope=<account scope>, and hey_class_ids=[...]. No claim
 * provisioner or database RLS policy currently exists in this repository.
 */
export function isTeacherAnswerKeyArtifact(artifact) {
  const seen = new WeakSet();
  const containsAnswer = (value, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 32 || seen.has(value)) return false;
    seen.add(value);
    if (Array.isArray(value)) return value.some((child) => containsAnswer(child, depth + 1));
    return Object.entries(value).some(([key, child]) => key === "teacherAnswer" || containsAnswer(child, depth + 1));
  };
  return Boolean(artifact && typeof artifact === "object" && containsAnswer(artifact.content));
}

export function authorizeTeacherArtifactRead(artifact, context, user) {
  if (!isTeacherAnswerKeyArtifact(artifact)) return true;
  const claims = user?.app_metadata;
  const metadata = artifact.metadata;
  if (!user?.id || !claims || claims.hey_role !== "teacher") return false;
  if (typeof metadata?.accountScope !== "string" || !metadata.accountScope
    || typeof metadata?.classId !== "string" || !metadata.classId) return false;
  if (claims.hey_account_scope !== metadata.accountScope
    || !Array.isArray(claims.hey_class_ids)
    || !claims.hey_class_ids.includes(metadata.classId)) return false;
  if (context?.accountScope !== undefined && context.accountScope !== metadata.accountScope) return false;
  if (context?.classId !== undefined && context.classId !== metadata.classId) return false;
  return true;
}

export async function canReadTeacherArtifact(artifact, context) {
  if (!isTeacherAnswerKeyArtifact(artifact)) return true;
  try {
    const { data, error } = await supabaseClient.auth.getUser();
    return !error && authorizeTeacherArtifactRead(artifact, context, data?.user);
  } catch {
    return false;
  }
}
