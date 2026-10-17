export const CHAT_EDIT_APPLICATION_ID = "hey.chat";
export const CHAT_EDIT_TARGET_ID = "hey-chat-message-composer";

export function captureEditOperationFence(generation, accountScope) {
  if (!Number.isSafeInteger(generation) || generation < 0 || typeof accountScope !== "string") return null;
  return Object.freeze({ generation, accountScope });
}

export function editOperationFenceIsCurrent(fence, generation, accountScope) {
  try {
    if (!fence || typeof fence !== "object" || Array.isArray(fence)) return false;
    const prototype = Object.getPrototypeOf(fence);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const keys = Reflect.ownKeys(fence);
    if (keys.length !== 2 || keys.some((key) => !["generation", "accountScope"].includes(key))) return false;
    const generationValue = Object.getOwnPropertyDescriptor(fence, "generation");
    const scopeValue = Object.getOwnPropertyDescriptor(fence, "accountScope");
    return Boolean(generationValue?.enumerable && Object.hasOwn(generationValue, "value")
      && scopeValue?.enumerable && Object.hasOwn(scopeValue, "value")
      && generationValue.value === generation
      && scopeValue.value === accountScope);
  } catch {
    return false;
  }
}

export function undoEntryIsCurrent(entry, { accountScope, conversationId, currentValue } = {}) {
  try {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const prototype = Object.getPrototypeOf(entry);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const keys = Reflect.ownKeys(entry);
    const expectedKeys = ["accountScope", "conversationId", "nextValue", "originalEnd", "previousValue", "start"];
    if (keys.length !== expectedKeys.length || keys.some((key) => !expectedKeys.includes(key))) return false;
    const snapshot = Object.create(null);
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(entry, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return false;
      snapshot[key] = descriptor.value;
    }
    return typeof snapshot.accountScope === "string"
      && snapshot.accountScope === accountScope
      && snapshot.conversationId === conversationId
      && typeof snapshot.previousValue === "string"
      && typeof snapshot.nextValue === "string"
      && snapshot.nextValue === currentValue
      && Number.isSafeInteger(snapshot.start)
      && Number.isSafeInteger(snapshot.originalEnd)
      && snapshot.start >= 0
      && snapshot.originalEnd >= snapshot.start
      && snapshot.originalEnd <= snapshot.previousValue.length
      && snapshot.start <= snapshot.nextValue.length;
  } catch {
    return false;
  }
}

export async function digestSelection(targetId, selectedText, start, end) {
  if (typeof targetId !== "string" || !targetId || typeof selectedText !== "string" || !selectedText) return null;
  if (!globalThis.crypto?.subtle || typeof TextEncoder !== "function") return null;
  const range = Number.isInteger(start) && Number.isInteger(end) ? `${start}:${end}:` : "";
  const bytes = new TextEncoder().encode(`${targetId}\u0000${range}${selectedText}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function readSelectionSnapshot(input, conversationId = null) {
  if (!input || input.id !== CHAT_EDIT_TARGET_ID || typeof input.value !== "string") return null;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > input.value.length) return null;
  return Object.freeze({ targetId: input.id, conversationId, currentText: input.value, start, end, sourceText: input.value.slice(start, end) });
}

export function digestSelectionSnapshot(snapshot) {
  if (!snapshot || typeof snapshot.targetId !== "string" || typeof snapshot.conversationId !== "string" && snapshot.conversationId !== null) return Promise.resolve(null);
  const contextBoundTarget = `${snapshot.targetId}\u0000conversation:${snapshot.conversationId ?? "new"}`;
  return digestSelection(contextBoundTarget, snapshot.sourceText, snapshot.start, snapshot.end);
}

export function selectionStillMatches(input, snapshot, conversationId) {
  if (!input || !snapshot || input.id !== snapshot.targetId || input.value !== snapshot.currentText) return false;
  if (arguments.length >= 3 && snapshot.conversationId !== conversationId) return false;
  if (input.selectionStart !== snapshot.start || input.selectionEnd !== snapshot.end) return false;
  return input.value.slice(snapshot.start, snapshot.end) === snapshot.sourceText;
}

export function replaceSelection(currentText, snapshot, replacement) {
  if (typeof currentText !== "string" || !snapshot || typeof replacement !== "string") return null;
  if (currentText !== snapshot.currentText || currentText.slice(snapshot.start, snapshot.end) !== snapshot.sourceText) return null;
  return `${currentText.slice(0, snapshot.start)}${replacement}${currentText.slice(snapshot.end)}`;
}
