import { supabaseClient } from "../lib/supabase.js";

const MAX_CLASSIFICATION_NODES = 10000;
const MAX_CLASSIFICATION_DEPTH = 32;

/**
 * HEY's narrow Teacher answer-key contract. A deployment must provision these
 * server-managed Supabase app_metadata claims: hey_role="teacher",
 * hey_account_scope=<account scope>, and hey_class_ids=[...]. The repository
 * includes database RLS policies, but claim provisioning remains deployment-owned.
 */
function snapshotArtifactData(value, state, depth = 0) {
  state.nodes += 1;
  if (state.nodes > MAX_CLASSIFICATION_NODES || depth > MAX_CLASSIFICATION_DEPTH) throw new TypeError("Artifact classification bounds exceeded");
  if (value === undefined || value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object" || state.seen.has(value)) throw new TypeError("Artifact data is ambiguous");
  state.seen.add(value);

  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Artifact data must use plain objects and arrays");
  }
  const keys = Reflect.ownKeys(value);
  if (array) {
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    const length = lengthDescriptor?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_CLASSIFICATION_NODES
      || keys.length !== length + 1
      || keys.some((key) => key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length))) {
      throw new TypeError("Artifact arrays must be dense plain data");
    }
    const copy = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new TypeError("Artifact arrays cannot contain accessors");
      copy.push(snapshotArtifactData(descriptor.value, state, depth + 1));
    }
    return copy;
  }

  const copy = Object.create(null);
  for (const key of keys) {
    if (typeof key !== "string") throw new TypeError("Artifact objects cannot contain symbol keys");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new TypeError("Artifact objects cannot contain accessors");
    if (key === "teacherAnswer") state.hasAnswer = true;
    Object.defineProperty(copy, key, {
      value: snapshotArtifactData(descriptor.value, state, depth + 1),
      enumerable: descriptor.enumerable,
      writable: false,
      configurable: false,
    });
  }
  return copy;
}

function classifyArtifact(artifact) {
  if (!artifact || typeof artifact !== "object") {
    return { safe: false, artifact: null, hasAnswer: true, answerKey: true, studentWorksheet: false, activityHandout: false, lesson: true };
  }
  try {
    const state = { nodes: 0, seen: new WeakSet(), hasAnswer: false };
    const snapshot = snapshotArtifactData(artifact, state);
    const content = snapshot.content;
    const metadata = snapshot.metadata;
    const answerKey = state.hasAnswer
      || content?.type === "teacher_assessment"
      || metadata?.workflow === "teacher_assessment"
      || metadata?.artifactContract === "hey.teacher.assessment.v1";
    return {
      safe: true,
      artifact: snapshot,
      hasAnswer: state.hasAnswer,
      answerKey,
      studentWorksheet: !answerKey && content?.type === "teacher_worksheet",
      activityHandout: !answerKey && (content?.type === "teacher_activity_handout"
        || metadata?.workflow === "teacher_activity_handout"
        || metadata?.artifactContract === "hey.teacher.activity_handout.v1"),
      lesson: Boolean(content && Array.isArray(content.learningObjectives) && Array.isArray(content.activities)
        && content.assessment && typeof content.assessment === "object" && typeof content.durationMinutes === "number"
        || metadata?.workflow === "teacher_lesson_plan"
        || metadata?.artifactContract === "hey.teacher.lesson.v1"),
    };
  } catch {
    // Unreadable evidence must never make an artifact eligible for student access.
    return { safe: false, artifact: null, hasAnswer: true, answerKey: true, studentWorksheet: false, activityHandout: false, lesson: true };
  }
}

export function isTeacherAnswerKeyArtifact(artifact) {
  const classification = classifyArtifact(artifact);
  return !classification.safe || classification.answerKey;
}

export function isStudentWorksheetArtifact(artifact) {
  const classification = classifyArtifact(artifact);
  return classification.safe && classification.studentWorksheet;
}

export function isTeacherActivityHandoutArtifact(artifact) {
  const classification = classifyArtifact(artifact);
  return classification.safe && classification.activityHandout;
}

export function isTeacherLessonArtifact(artifact) {
  const classification = classifyArtifact(artifact);
  return !classification.safe || classification.lesson;
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

function authorizeClassifiedRead(classification, context, user) {
  const artifact = classification.artifact;
  if (!classification.safe) return false;
  if (classification.answerKey) {
    return user?.app_metadata?.hey_role === "teacher"
      && artifact?.createdBy === user.id
      && hasTeacherClassAccess(artifact, context, user);
  }
  if (classification.studentWorksheet || classification.activityHandout) {
    const role = user?.app_metadata?.hey_role;
    return ["teacher", "student"].includes(role) && hasTeacherClassAccess(artifact, context, user);
  }
  if (classification.lesson) {
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

export function authorizeTeacherArtifactRead(artifact, context, user) {
  return authorizeClassifiedRead(classifyArtifact(artifact), context, user);
}

function authorizeClassifiedWrite(classification, context, user) {
  if (!classification.safe) return false;
  const artifact = classification.artifact;
  const claims = user?.app_metadata;
  if (!user?.id || claims?.hey_role !== "teacher" || !claims.hey_account_scope
    || claims.hey_account_scope !== artifact?.metadata?.accountScope) return false;
  if (context?.accountScope !== undefined && context.accountScope !== claims.hey_account_scope) return false;
  if (artifact?.createdBy !== undefined && artifact.createdBy !== user.id) return false;
  const classId = context?.classId || artifact?.metadata?.classId;
  if (classId !== undefined && (!Array.isArray(claims.hey_class_ids) || !claims.hey_class_ids.includes(classId))) return false;
  return true;
}

export function authorizeTeacherArtifactWrite(artifact, context, user) {
  return authorizeClassifiedWrite(classifyArtifact(artifact), context, user);
}

export async function canReadTeacherArtifact(artifact, context) {
  const classification = classifyArtifact(artifact);
  if (!classification.safe) return false;
  if (!classification.answerKey && !classification.studentWorksheet && !classification.activityHandout && !classification.lesson) return true;
  try {
    const { data, error } = await supabaseClient.auth.getUser();
    return !error && authorizeClassifiedRead(classification, context, data?.user);
  } catch {
    return false;
  }
}

export async function canWriteTeacherArtifact(artifact, context) {
  const classification = classifyArtifact(artifact);
  if (!classification.safe) return false;
  if (!classification.answerKey && !classification.studentWorksheet && !classification.activityHandout && !classification.lesson) return true;
  try {
    const { data, error } = await supabaseClient.auth.getUser();
    return !error && authorizeClassifiedWrite(classification, context, data?.user);
  } catch {
    return false;
  }
}
