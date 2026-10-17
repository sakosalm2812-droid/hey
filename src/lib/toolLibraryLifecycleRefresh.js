function ownDataValue(value, key) {
  try {
    if (!value || typeof value !== "object") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function normalizeActivity(result) {
  try {
    if (ownDataValue(result, "success") !== true) return null;
    const entries = ownDataValue(result, "activity");
    if (!Array.isArray(entries)) return null;
    const items = [];
    for (let index = 0; index < Math.min(entries.length, 100); index += 1) {
      const item = ownDataValue(entries, index);
      const id = ownDataValue(item, "id");
      const status = ownDataValue(item, "status");
      const at = ownDataValue(item, "at");
      if (typeof id !== "string" || !id || typeof status !== "string" || !status || typeof at !== "string" || !Number.isFinite(Date.parse(at))) return null;
      items.push(Object.freeze({ id, status, at }));
    }
    return items;
  } catch {
    return null;
  }
}

export async function refreshToolLibraryLifecycleSnapshot({
  accountId,
  getActiveScope,
  isCurrentRequest,
  readActivity,
  readLifecycle,
}) {
  if (typeof accountId !== "string" || !accountId) return Object.freeze({ status: "account_changed" });
  const accountScope = `account:${accountId}`;
  if (getActiveScope() !== accountScope) return Object.freeze({ status: "account_changed" });

  const [activityResult, lifecycleResult] = await Promise.allSettled([
    Promise.resolve().then(readActivity),
    Promise.resolve().then(readLifecycle),
  ]);
  if (getActiveScope() !== accountScope || !isCurrentRequest()) return Object.freeze({ status: "stale" });

  const activityResponse = activityResult.status === "fulfilled" ? activityResult.value : null;
  const normalizedActivity = normalizeActivity(activityResponse);
  const activityStatus = normalizedActivity === null ? "unavailable" : "ready";
  const activity = normalizedActivity || [];
  const contract = lifecycleResult.status === "fulfilled" ? lifecycleResult.value : null;
  const lifecycleStatus = ownDataValue(contract, "success") === true ? "ready" : "unavailable";
  const actions = ownDataValue(contract, "actions");
  const lifecycle = lifecycleStatus === "ready" ? Object.freeze({
    success: true,
    status: ownDataValue(contract, "status"),
    readiness: ownDataValue(contract, "readiness"),
    sessionId: ownDataValue(contract, "sessionId"),
    actions: Object.freeze({
      start: ownDataValue(actions, "start") === true,
      stop: ownDataValue(actions, "stop") === true,
      retry: ownDataValue(actions, "retry") === true,
      remove: ownDataValue(actions, "remove") === true,
    }),
  }) : null;
  return Object.freeze({
    status: "ready",
    activityStatus,
    activity: Object.freeze(activity),
    lifecycleStatus,
    lifecycle,
  });
}
