export function teacherPageStateMatchesAccount(stateAccountId, accountId) {
  return typeof stateAccountId === "string" && typeof accountId === "string" && stateAccountId === accountId;
}

export function shouldResetTeacherDraft(previousAccountId, accountId) {
  return previousAccountId !== accountId;
}

export function teacherOperationCanStart(lockAccountId, accountId) {
  return typeof accountId === "string" && accountId.length > 0 && lockAccountId !== accountId;
}

export function teacherOperationLockBelongsToAccount(lockAccountId, accountId) {
  return typeof accountId === "string" && accountId.length > 0 && lockAccountId === accountId;
}

function teacherJourneyRecoveryKey(userId) {
  return `hey.teacher.journey-recovery.v1:${userId}`;
}

function isRecoveryHint(value, userId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "accountScope,classId,journeyId,userId,workspaceId") return false;
  return value.userId === userId
    && value.accountScope === `account:${userId}`
    && typeof value.classId === "string" && value.classId.trim().length > 0
    && typeof value.workspaceId === "string" && value.workspaceId.trim().length > 0
    && typeof value.journeyId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.journeyId);
}

export function readTeacherJourneyRecoveryHint(storage, userId) {
  if (typeof userId !== "string" || !userId || !storage?.getItem) return null;
  const key = teacherJourneyRecoveryKey(userId);
  try {
    const stored = storage.getItem(key);
    if (!stored) return null;
    const hint = JSON.parse(stored);
    return isRecoveryHint(hint, userId) ? Object.freeze(hint) : null;
  } catch {
    return null;
  }
}

export function writeTeacherJourneyRecoveryHint(storage, hint) {
  if (!storage?.setItem || !isRecoveryHint(hint, hint?.userId)) return false;
  try {
    storage.setItem(teacherJourneyRecoveryKey(hint.userId), JSON.stringify(hint));
    return true;
  } catch {
    return false;
  }
}
