const ACTIVE_STATUSES = new Set(["starting", "running"]);
const REMOVABLE_STATUSES = new Set(["completed", "completed_after_stop", "cancelled", "failed", "failed_after_stop"]);

function readData(record, key) {
  try {
    if (!record || typeof record !== "object") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

export function getToolLibraryLifecycleView(record, accountId, activeScope, toolStatus) {
  if (typeof accountId !== "string" || !accountId || activeScope !== `account:${accountId}` || readData(record, "accountId") !== accountId) {
    return { visible: false, startDeclared: false, stopDeclared: false, retryDeclared: false, removeDeclared: false, canStart: false, canStop: false, canRetry: false, canRemove: false, status: "unavailable", sessionId: null };
  }

  const actions = readData(record, "actions");
  const status = readData(record, "status");
  const readiness = readData(record, "readiness");
  const sessionId = readData(record, "sessionId");
  const startDeclared = readData(actions, "start") === true;
  const stopDeclared = readData(actions, "stop") === true;
  const retryDeclared = readData(actions, "retry") === true;
  const removeDeclared = readData(actions, "remove") === true;
  const active = ACTIVE_STATUSES.has(status);
  const failed = status === "failed" || status === "failed_after_stop";
  return {
    visible: true,
    status: typeof status === "string" ? status : "registered",
    readiness: typeof readiness === "string" ? readiness : "unavailable",
    sessionId: typeof sessionId === "string" && sessionId ? sessionId : null,
    startDeclared,
    stopDeclared,
    retryDeclared,
    removeDeclared,
    canStart: toolStatus === "supported" && startDeclared && readiness !== "unavailable" && !active,
    canStop: stopDeclared && active && typeof sessionId === "string" && Boolean(sessionId),
    canRetry: toolStatus === "supported" && retryDeclared && failed && readiness !== "unavailable" && typeof sessionId === "string" && Boolean(sessionId),
    canRemove: removeDeclared && REMOVABLE_STATUSES.has(status) && readiness === "ready" && typeof sessionId === "string" && Boolean(sessionId),
  };
}
