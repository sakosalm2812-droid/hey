function activeScope(accountId) {
  return accountId ? `account:${accountId}` : "";
}

export function spaceLifecycleFromRecord(record, accountId) {
  const expectedScope = activeScope(accountId);
  if (!record || !expectedScope || record.accountScope !== expectedScope || typeof record.id !== "string"
    || !["active", "archived"].includes(record.status)
    || record.visibility !== "private" || record.sharing !== "off"
    || !Number.isSafeInteger(record.lifecycleRevision) || record.lifecycleRevision < 0) return null;
  return {
    accountScope: expectedScope,
    spaceId: record.id,
    status: record.status,
    revision: record.lifecycleRevision,
    name: typeof record.name === "string" ? record.name : "Private Space",
  };
}

export function spaceLifecycleMatchesAccount(snapshot, accountId, scope, spaceId) {
  return Boolean(snapshot && accountId && scope === activeScope(accountId)
    && snapshot.accountScope === scope && snapshot.spaceId === spaceId
    && ["active", "archived"].includes(snapshot.status)
    && Number.isSafeInteger(snapshot.revision) && snapshot.revision >= 0);
}

function isCurrentAccount(accountId, accountScope) {
  return Boolean(accountId && accountScope === activeScope(accountId));
}

export function prepareSpaceLifecycle({ api, accountId, accountScope, spaceId, action }) {
  if (!isCurrentAccount(accountId, accountScope)) return { error: "Your account changed. Reload this Space before continuing." };
  if (action !== "archive" && action !== "restore") return { error: "Choose whether to archive or restore this Space." };
  const records = api.getPrivateSpaces();
  const record = Array.isArray(records) ? records.find((item) => item?.id === spaceId && item?.accountScope === accountScope) : null;
  const current = spaceLifecycleFromRecord(record, accountId);
  if (!current) return { error: "Current Space status could not be loaded. Try again." };
  const expectedStatus = action === "archive" ? "active" : "archived";
  if (current.status !== expectedStatus) return { conflict: current, error: "This Space status changed. Review the latest status before continuing." };
  const result = action === "archive"
    ? api.previewArchive({ accountScope, spaceId, expectedLifecycleRevision: current.revision })
    : api.previewRestore({ accountScope, spaceId, expectedLifecycleRevision: current.revision });
  if (result?.code === "stale_revision") {
    const latest = spaceLifecycleFromRecord(result.current, accountId);
    return latest ? { conflict: latest, error: "This Space changed. Review the latest status before preparing another confirmation." } : { error: "The latest Space status could not be verified. Reload and try again." };
  }
  const targetStatus = action === "archive" ? "archived" : "active";
  const expectedAction = action === "archive" ? "archive_private_space" : "restore_private_space";
  if (!result || result.error || result.action !== expectedAction || result.accountScope !== accountScope
    || result.space?.accountScope !== accountScope || result.space?.id !== spaceId
    || result.space?.status !== expectedStatus || result.space?.lifecycleRevision !== current.revision
    || result.space?.visibility !== "private" || result.space?.sharing !== "off"
    || result.permissionsChanged !== false || result.requiresConfirmation !== true || typeof result.previewId !== "string") {
    return { error: result?.error || "A safe Space status review could not be prepared. Reload and try again." };
  }
  return { preview: result, action, targetStatus, current };
}

export function confirmSpaceLifecycle({ api, accountId, accountScope, spaceId, previewId, action }) {
  if (!isCurrentAccount(accountId, accountScope)) return { error: "Your account changed. This confirmation is no longer valid." };
  if (typeof previewId !== "string" || (action !== "archive" && action !== "restore")) return { error: "Review the Space status change again before confirming." };
  const result = action === "archive"
    ? api.confirmArchive({ previewId, confirm: true })
    : api.confirmRestore({ previewId, confirm: true });
  if (result?.code === "stale_revision") {
    const latest = spaceLifecycleFromRecord(result.current, accountId);
    if (latest?.spaceId === spaceId) return { conflict: latest, error: "This Space changed after review. Review its latest status before confirming again." };
  }
  const targetStatus = action === "archive" ? "archived" : "active";
  if (!result?.success || result.accountScope !== accountScope || result.spaceId !== spaceId
    || result.status !== targetStatus || !Number.isSafeInteger(result.revision) || result.permissionsChanged !== false) {
    return { error: result?.error || "The Space status could not be changed. Review the latest status and try again." };
  }
  return { success: true, status: targetStatus, revision: result.revision, permissionsChanged: false };
}
