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
    let descriptor = Object.getOwnPropertyDescriptor(message, "retryRoute");
    if (!descriptor) {
      const metadataDescriptor = Object.getOwnPropertyDescriptor(message, "metadata");
      if (!metadataDescriptor) return { status: "legacy", route: null };
      if (!Object.hasOwn(metadataDescriptor, "value") || !isPlainRecord(metadataDescriptor.value)) {
        return { status: "invalid", route: null };
      }
      descriptor = Object.getOwnPropertyDescriptor(metadataDescriptor.value, "retryRoute");
    }
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

export function mapChatConversationRows(rows, userId) {
  if (!Array.isArray(rows) || typeof userId !== "string" || !userId) return [];
  return rows.flatMap((row) => {
    try {
      if (!isPlainRecord(row) || readData(row, "user_id") !== userId) return [];
      const role = readData(row, "role");
      if (role !== "user" && role !== "assistant") return [];
      const content = readData(row, "content");
      if (typeof content !== "string") return [];
      const route = role === "user" ? readChatRetryRoute(row) : null;
      return [{
        role: role === "assistant" ? "hey" : "user",
        text: content,
        ...(route && route.status !== "legacy" ? { retryRoute: route.route } : {}),
      }];
    } catch {
      return [];
    }
  });
}
