export function spacePreviewMatchesAccount(preview, accountId, activeAccountId = accountId) {
  return Boolean(preview && accountId && preview.accountId === accountId && activeAccountId === accountId);
}

export function spacesForAccount(spaces, accountId) {
  if (!Array.isArray(spaces) || !accountId) return [];
  return spaces.filter((space) => space?.accountScope === `account:${accountId}`);
}

export function spaceMembershipMatchesAccount(snapshot, accountId, activeScope, spaceId) {
  const expectedScope = accountId ? `account:${accountId}` : "";
  return Boolean(
    snapshot?.success === true &&
    typeof accountId === "string" && accountId &&
    activeScope === expectedScope &&
    snapshot.accountScope === expectedScope &&
    snapshot.spaceId === spaceId &&
    Number.isSafeInteger(snapshot.revision) && snapshot.revision >= 0 &&
    Array.isArray(snapshot.toolIds)
  );
}

export function spaceDetailsMatchAccount(snapshot, accountId, activeScope, spaceId) {
  const expectedScope = accountId ? `account:${accountId}` : "";
  return Boolean(
    snapshot?.success === true &&
    typeof accountId === "string" && accountId &&
    activeScope === expectedScope &&
    snapshot.accountScope === expectedScope &&
    snapshot.spaceId === spaceId &&
    Number.isSafeInteger(snapshot.detailsRevision) && snapshot.detailsRevision >= 0 &&
    typeof snapshot.name === "string" && typeof snapshot.description === "string"
  );
}
