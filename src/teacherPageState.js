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

function snapshotTeacherJourneyRecoveryHint(value, expectedUserId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 5 || keys.some((key) => typeof key !== "string")) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.keys(descriptors).sort().join(",") !== "accountScope,classId,journeyId,userId,workspaceId") return null;
    const hint = {};
    for (const key of ["userId", "accountScope", "workspaceId", "classId", "journeyId"]) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return null;
      hint[key] = descriptor.value;
    }
    const userId = expectedUserId === undefined ? hint.userId : expectedUserId;
    if (typeof userId !== "string" || !userId || userId.length > 128
      || hint.userId !== userId || hint.accountScope !== `account:${userId}`
      || typeof hint.classId !== "string" || !hint.classId.trim() || hint.classId.length > 200
      || typeof hint.workspaceId !== "string" || !hint.workspaceId.trim() || hint.workspaceId.length > 200
      || typeof hint.journeyId !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(hint.journeyId)) return null;
    return Object.freeze(hint);
  } catch {
    return null;
  }
}

export function readTeacherJourneyRecoveryHint(storage, userId) {
  if (typeof userId !== "string" || !userId || !storage?.getItem) return null;
  const key = teacherJourneyRecoveryKey(userId);
  try {
    const stored = storage.getItem(key);
    if (!stored) return null;
    const hint = JSON.parse(stored);
    return snapshotTeacherJourneyRecoveryHint(hint, userId);
  } catch {
    return null;
  }
}

export function writeTeacherJourneyRecoveryHint(storage, hint) {
  if (!storage?.setItem) return false;
  const snapshot = snapshotTeacherJourneyRecoveryHint(hint);
  if (!snapshot) return false;
  try {
    storage.setItem(teacherJourneyRecoveryKey(snapshot.userId), JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}
