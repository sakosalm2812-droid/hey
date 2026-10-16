const ACTIVE_STATUSES = new Set(["starting", "running"]);

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
    return { visible: false, startDeclared: false, stopDeclared: false, canStart: false, canStop: false, status: "unavailable", sessionId: null };
  }

  const actions = readData(record, "actions");
  const status = readData(record, "status");
  const readiness = readData(record, "readiness");
  const sessionId = readData(record, "sessionId");
  const startDeclared = readData(actions, "start") === true;
  const stopDeclared = readData(actions, "stop") === true;
  const active = ACTIVE_STATUSES.has(status);
  return {
    visible: true,
    status: typeof status === "string" ? status : "registered",
    readiness: typeof readiness === "string" ? readiness : "unavailable",
    sessionId: typeof sessionId === "string" && sessionId ? sessionId : null,
    startDeclared,
    stopDeclared,
    canStart: toolStatus === "supported" && startDeclared && readiness !== "unavailable" && !active,
    canStop: stopDeclared && active && typeof sessionId === "string" && Boolean(sessionId),
  };
}
