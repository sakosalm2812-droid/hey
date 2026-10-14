const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasControlCharacters(value) {
  return [...value].some((character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127);
}

function plainDataRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some((key) => typeof key !== "string" || !Object.hasOwn(descriptors[key], "value"))) return null;
  return descriptors;
}

export function normalizeMandateVerificationRequest(body, authenticatedAccountId) {
  const descriptors = plainDataRecord(body);
  if (!descriptors || !UUID.test(authenticatedAccountId || "")) return null;
  const keys = Object.keys(descriptors).sort();
  if (keys.join(",") !== "action,idempotencyKey,mandate,resource") return null;
  const { action, idempotencyKey, mandate, resource } = Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
  if (typeof action !== "string" || !action.trim() || action.length > 256 || hasControlCharacters(action)) return null;
  if (typeof resource !== "string" || !resource.trim() || resource.length > 256 || hasControlCharacters(resource)) return null;
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey.length > 256 || hasControlCharacters(idempotencyKey)) return null;
  if (!plainDataRecord(mandate)) return null;

  return {
    mandate,
    context: {
      accountId: authenticatedAccountId,
      action: action.trim(),
      resource: resource.trim(),
      idempotencyKey: idempotencyKey.trim(),
    },
  };
}
