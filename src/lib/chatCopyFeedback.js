export function getChatMessageKey(index) {
  return Number.isSafeInteger(index) && index >= 0 ? `chat-message-${index}` : null;
}

function readFeedbackToken(value) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const messageKey = Object.getOwnPropertyDescriptor(value, "messageKey");
    const requestId = Object.getOwnPropertyDescriptor(value, "requestId");
    if (!messageKey || !Object.hasOwn(messageKey, "value") || typeof messageKey.value !== "string"
      || !requestId || !Object.hasOwn(requestId, "value") || !Number.isSafeInteger(requestId.value) || requestId.value < 0) return null;
    return { messageKey: messageKey.value, requestId: requestId.value };
  } catch {
    return null;
  }
}

export function clearCopiedMessageIfCurrent(current, expired) {
  const currentToken = readFeedbackToken(current);
  const expiredToken = readFeedbackToken(expired);
  return currentToken && expiredToken && currentToken.messageKey === expiredToken.messageKey && currentToken.requestId === expiredToken.requestId
    ? null
    : current;
}
