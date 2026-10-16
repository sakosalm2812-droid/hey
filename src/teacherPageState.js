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
