export function resolveTeacherPageAccess(user, accountScope) {
  if (!user?.id || !user.app_metadata || typeof user.app_metadata !== "object") {
    return Object.freeze({ status: "identity-missing", classIds: Object.freeze([]) });
  }
  if (accountScope !== `account:${user.id}` || user.app_metadata.hey_account_scope !== accountScope) {
    return Object.freeze({ status: "scope-mismatch", classIds: Object.freeze([]) });
  }
  if (user.app_metadata.hey_role !== "teacher") {
    return Object.freeze({ status: "role-denied", classIds: Object.freeze([]) });
  }
  const classIds = Array.isArray(user.app_metadata.hey_class_ids)
    ? [...new Set(user.app_metadata.hey_class_ids.filter((classId) => typeof classId === "string" && classId.trim()))]
    : [];
  if (!classIds.length) return Object.freeze({ status: "class-unassigned", classIds: Object.freeze([]) });
  return Object.freeze({
    status: "ready",
    userId: user.id,
    accountScope,
    classIds: Object.freeze(classIds),
  });
}

export function teacherArtifactOperationContextMatches(expected, active, expectedRevision) {
  return Boolean(expected && active
    && expected.userId === active.userId
    && expected.accountScope === active.accountScope
    && expected.workspaceId === active.workspaceId
    && expected.classId === active.classId
    && (expectedRevision === undefined || expectedRevision === active.revision));
}

export function hasTeacherAnswerKeyField(value, seen = new WeakSet(), depth = 0) {
  if (!value || typeof value !== "object") return false;
  if (depth > 32 || seen.has(value)) return true;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasTeacherAnswerKeyField(item, seen, depth + 1));
  return Object.entries(value).some(([key, item]) => key === "teacherAnswer"
    || hasTeacherAnswerKeyField(item, seen, depth + 1));
}

export function teacherJourneyPersistenceMatches(result, expected) {
  if (!result || typeof result !== "object" || !expected || typeof expected !== "object") return false;
  if (result.journeyId !== expected.journeyId) return false;
  const saved = result.saved;
  const records = [saved?.lesson, saved?.teacherArtifact, saved?.studentArtifact];
  if (records.some((record) => !record || typeof record !== "object")) return false;
  if (new Set(records.map((record) => record.id)).size !== records.length) return false;

  const contracts = ["hey.teacher.lesson.v1", "hey.teacher.assessment.v1", "hey.teacher.worksheet.v1"];
  for (const [index, record] of records.entries()) {
    if (record.createdBy !== expected.userId
      || record.projectId !== expected.workspaceId
      || record.metadata?.accountScope !== expected.accountScope
      || record.metadata?.workspaceId !== expected.workspaceId
      || record.metadata?.classId !== expected.classId
      || record.metadata?.artifactContract !== contracts[index]) return false;
  }
  return !hasTeacherAnswerKeyField(saved.studentArtifact.content);
}
