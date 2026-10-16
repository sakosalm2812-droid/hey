export function spaceDetailsMatchAccount(snapshot, accountId, activeScope, spaceId) {
  return Boolean(snapshot && accountId && activeScope === `account:${accountId}`
    && snapshot.accountScope === activeScope && snapshot.spaceId === spaceId
    && Number.isSafeInteger(snapshot.revision) && snapshot.revision >= 0
    && typeof snapshot.name === "string" && typeof snapshot.description === "string");
}

export function spaceDetailsFromRecord(record, accountId) {
  if (!accountId || !record || record.accountScope !== `account:${accountId}` || typeof record.id !== "string"
    || !Number.isSafeInteger(record.detailsRevision) || record.detailsRevision < 0
    || typeof record.name !== "string" || typeof record.description !== "string") return null;
  return { accountScope: record.accountScope, spaceId: record.id, revision: record.detailsRevision, name: record.name, description: record.description };
}
