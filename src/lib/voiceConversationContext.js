export function createConversationScopedVoiceAsk({ ask, getConversationId, onConversationId }) {
  if (typeof ask !== "function" || typeof getConversationId !== "function" || typeof onConversationId !== "function") {
    throw new TypeError("Voice conversation context requires an ask handler and conversation ID accessors.");
  }

  return (text, options = {}) => ask(text, {
    ...options,
    conversationId: getConversationId(),
    onConversationId,
  });
}
