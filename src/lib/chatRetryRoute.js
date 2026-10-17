function isPlainRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype);
}

function readData(record, key) {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function snapshotProviderProfile(value) {
  if (value === "automatic" || value === "lower_cost") return value;
  if (!isPlainRecord(value) || Reflect.ownKeys(value).length !== 2) return null;
  const providerId = readData(value, "providerId");
  const modelId = readData(value, "modelId");
  if (typeof providerId !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/u.test(providerId)
    || typeof modelId !== "string" || !modelId || modelId.length > 128 || modelId !== modelId.trim()
    || /[\\/]/u.test(modelId) || Array.from(modelId).some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) return null;
  return Object.freeze({ providerId, modelId });
}

export function snapshotChatRetryRoute(fusion, providerProfile) {
  try {
    if (fusion === true) return Object.freeze({ fusion: true, providerProfile: "automatic" });
    if (fusion !== false) return null;
    const profile = snapshotProviderProfile(providerProfile);
    return profile ? Object.freeze({ fusion: false, providerProfile: profile }) : null;
  } catch {
    return null;
  }
}

export function readChatRetryRoute(message) {
  try {
    if (!isPlainRecord(message) || readData(message, "role") !== "user") return { status: "invalid", route: null };
    const descriptor = Object.getOwnPropertyDescriptor(message, "retryRoute");
    if (!descriptor) return { status: "legacy", route: null };
    if (!Object.hasOwn(descriptor, "value") || !isPlainRecord(descriptor.value) || Reflect.ownKeys(descriptor.value).length !== 2) {
      return { status: "invalid", route: null };
    }
    const route = descriptor.value;
    const snapshot = snapshotChatRetryRoute(readData(route, "fusion"), readData(route, "providerProfile"));
    return snapshot ? { status: "stored", route: snapshot } : { status: "invalid", route: null };
  } catch {
    return { status: "invalid", route: null };
  }
}
