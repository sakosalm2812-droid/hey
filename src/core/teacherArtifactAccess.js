import { supabaseClient } from "../lib/supabase.js";

/**
 * HEY's narrow Teacher answer-key contract. A deployment must provision these
 * server-managed Supabase app_metadata claims: hey_role="teacher",
 * hey_account_scope=<account scope>, and hey_class_ids=[...]. The repository
 * includes database RLS policies, but claim provisioning remains deployment-owned.
 */
export function isTeacherAnswerKeyArtifact(artifact) {
  const seen = new WeakSet();
  const containsAnswer = (value, depth = 0) => {
    if (!value || typeof value !== "object") return false;
    // If content is too deep or cyclic to inspect completely, keep it private.
    if (depth > 32 || seen.has(value)) return true;
    seen.add(value);
    if (Array.isArray(value)) return value.some((child) => containsAnswer(child, depth + 1));
    return Object.entries(value).some(([key, child]) => key === "teacherAnswer" || containsAnswer(child, depth + 1));
  };
  const metadata = artifact?.metadata;
  const content = artifact?.content;
  return Boolean(artifact && typeof artifact === "object" && (
    containsAnswer(content)
    || content?.type === "teacher_assessment"
    || metadata?.workflow === "teacher_assessment"
    || metadata?.artifactContract === "hey.teacher.assessment.v1"
  ));
}

export function isStudentWorksheetArtifact(artifact) {
  return artifact?.content?.type === "teacher_worksheet";
}

export function isTeacherActivityHandoutArtifact(artifact) {
  return artifact?.content?.type === "teacher_activity_handout"
    || artifact?.metadata?.workflow === "teacher_activity_handout"
    || artifact?.metadata?.artifactContract === "hey.teacher.activity_handout.v1";
}

export function isTeacherLessonArtifact(artifact) {
  const content = artifact?.content;
  const metadata = artifact?.metadata;
  return Boolean((content && Array.isArray(content.learningObjectives) && Array.isArray(content.activities)
    && content.assessment && typeof content.assessment === "object" && typeof content.durationMinutes === "number")
    || metadata?.workflow === "teacher_lesson_plan"
    || metadata?.artifactContract === "hey.teacher.lesson.v1");
}

function hasTeacherClassAccess(artifact, context, user) {
  const claims = user?.app_metadata;
  const metadata = artifact.metadata;
  if (!user?.id || !claims) return false;
  if (typeof metadata?.accountScope !== "string" || !metadata.accountScope
    || typeof metadata?.classId !== "string" || !metadata.classId) return false;
  if (claims.hey_account_scope !== metadata.accountScope || !Array.isArray(claims.hey_class_ids)
    || !claims.hey_class_ids.includes(metadata.classId)) return false;
  if (context?.accountScope !== undefined && context.accountScope !== metadata.accountScope) return false;
  if (context?.classId !== undefined && context.classId !== metadata.classId) return false;
  return true;
}

export function authorizeTeacherArtifactRead(artifact, context, user) {
  if (isTeacherAnswerKeyArtifact(artifact)) {
    return user?.app_metadata?.hey_role === "teacher"
      && artifact?.createdBy === user.id
      && hasTeacherClassAccess(artifact, context, user);
  }
  if (isStudentWorksheetArtifact(artifact) || isTeacherActivityHandoutArtifact(artifact)) {
    const role = user?.app_metadata?.hey_role;
    return ["teacher", "student"].includes(role) && hasTeacherClassAccess(artifact, context, user);
  }
  if (isTeacherLessonArtifact(artifact)) {
    const claims = user?.app_metadata;
    if (!user?.id || claims?.hey_role !== "teacher" || artifact?.createdBy !== user.id
      || claims.hey_account_scope !== artifact?.metadata?.accountScope) return false;
    if (context?.accountScope !== undefined && context.accountScope !== artifact.metadata.accountScope) return false;
    if (artifact.metadata.classId !== undefined
      && (!Array.isArray(claims.hey_class_ids) || !claims.hey_class_ids.includes(artifact.metadata.classId))) return false;
    return true;
  }
  return true;
}

export function authorizeTeacherArtifactWrite(artifact, context, user) {
  const claims = user?.app_metadata;
  if (!user?.id || claims?.hey_role !== "teacher" || !claims.hey_account_scope
    || claims.hey_account_scope !== artifact?.metadata?.accountScope) return false;
  if (context?.accountScope !== undefined && context.accountScope !== claims.hey_account_scope) return false;
  if (artifact?.createdBy !== undefined && artifact.createdBy !== user.id) return false;
  const classId = context?.classId || artifact?.metadata?.classId;
  if (classId !== undefined && (!Array.isArray(claims.hey_class_ids) || !claims.hey_class_ids.includes(classId))) return false;
  return true;
}

export async function canReadTeacherArtifact(artifact, context) {
  if (!isTeacherAnswerKeyArtifact(artifact) && !isStudentWorksheetArtifact(artifact)
    && !isTeacherActivityHandoutArtifact(artifact) && !isTeacherLessonArtifact(artifact)) return true;
  try {
    const { data, error } = await supabaseClient.auth.getUser();
    return !error && authorizeTeacherArtifactRead(artifact, context, data?.user);
  } catch {
    return false;
  }
}

export async function canWriteTeacherArtifact(artifact, context) {
  if (!isTeacherAnswerKeyArtifact(artifact) && !isStudentWorksheetArtifact(artifact)
    && !isTeacherActivityHandoutArtifact(artifact) && !isTeacherLessonArtifact(artifact)) return true;
  try {
    const { data, error } = await supabaseClient.auth.getUser();
    return !error && authorizeTeacherArtifactWrite(artifact, context, data?.user);
  } catch {
    return false;
  }
}

