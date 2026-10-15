export function spacePreviewMatchesAccount(preview, accountId, activeAccountId = accountId) {
  return Boolean(preview && accountId && preview.accountId === accountId && activeAccountId === accountId);
}

export function spacesForAccount(spaces, accountId) {
  if (!Array.isArray(spaces) || !accountId) return [];
  return spaces.filter((space) => space?.accountScope === `account:${accountId}`);
}
