const INVALID = Symbol("invalid lifecycle response");
const ACTIONS = ["start", "stop", "retry", "remove"];

function readOwnDataValue(record, key) {
  try {
    if (!record || typeof record !== "object") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor) return undefined;
    return Object.hasOwn(descriptor, "value") ? descriptor.value : INVALID;
  } catch {
    return INVALID;
  }
}

function snapshotActions(value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") return INVALID;
  const actions = {};
  for (const action of ACTIONS) {
    const enabled = readOwnDataValue(value, action);
    if (enabled === INVALID) return INVALID;
    actions[action] = enabled === true;
  }
  return Object.freeze(actions);
}

function snapshotAvailability(value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") return INVALID;
  const reason = readOwnDataValue(value, "reason");
  if (reason === INVALID) return INVALID;
  return Object.freeze({ reason: typeof reason === "string" ? reason : null });
}

function failure() {
  return Object.freeze({ success: false, status: "error", error: "HEY could not complete this session action safely." });
}

/** Invoke a synchronous lifecycle API and copy its UI-relevant fields without calling getters. */
export function invokeToolLibraryLifecycleAction(invoke) {
  let response;
  try {
    if (typeof invoke !== "function") return failure();
    response = invoke();
  } catch {
    return failure();
  }

  if (!response || typeof response !== "object") return failure();
  const success = readOwnDataValue(response, "success");
  const status = readOwnDataValue(response, "status");
  const error = readOwnDataValue(response, "error");
  const sessionId = readOwnDataValue(response, "sessionId");
  const readiness = readOwnDataValue(response, "readiness");
  const actions = snapshotActions(readOwnDataValue(response, "actions"));
  const availability = snapshotAvailability(readOwnDataValue(response, "availability"));
  if ([success, status, error, sessionId, readiness, actions, availability].includes(INVALID)) return failure();

  return Object.freeze({
    success: success === true,
    status: typeof status === "string" ? status : "error",
    error: typeof error === "string" ? error : null,
    sessionId: typeof sessionId === "string" ? sessionId : null,
    readiness: typeof readiness === "string" ? readiness : null,
    ...(actions === undefined ? {} : { actions }),
    ...(availability === undefined ? {} : { availability }),
  });
}
