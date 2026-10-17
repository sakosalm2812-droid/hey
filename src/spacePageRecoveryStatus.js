export function isSpaceRecoverySnapshotFailure(event, payload, accountId, activeScope) {
  if (event !== "storage_recovery_snapshot_error" || !accountId || activeScope !== `account:${accountId}` || !payload) return false;
  let descriptors;
  try { descriptors = Object.getOwnPropertyDescriptors(payload); } catch { return false; }
  return Object.hasOwn(descriptors, "accountScope")
    && Object.hasOwn(descriptors.accountScope, "value")
    && descriptors.accountScope.value === activeScope;
}

export function isSpaceRecoverySnapshotUpdated(event, payload, accountId, activeScope) {
  if (event !== "storage_recovery_snapshot_updated" || !accountId || activeScope !== `account:${accountId}` || !payload) return false;
  let descriptors;
  try { descriptors = Object.getOwnPropertyDescriptors(payload); } catch { return false; }
  return Object.hasOwn(descriptors, "accountScope")
    && Object.hasOwn(descriptors.accountScope, "value")
    && descriptors.accountScope.value === activeScope;
}
