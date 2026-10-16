export const CHAT_EDIT_APPLICATION_ID = "hey.chat";
export const CHAT_EDIT_TARGET_ID = "hey-chat-message-composer";

export async function digestSelection(targetId, selectedText, start, end) {
  if (typeof targetId !== "string" || !targetId || typeof selectedText !== "string" || !selectedText) return null;
  if (!globalThis.crypto?.subtle || typeof TextEncoder !== "function") return null;
  const range = Number.isInteger(start) && Number.isInteger(end) ? `${start}:${end}:` : "";
  const bytes = new TextEncoder().encode(`${targetId}\u0000${range}${selectedText}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function readSelectionSnapshot(input) {
  if (!input || input.id !== CHAT_EDIT_TARGET_ID || typeof input.value !== "string") return null;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > input.value.length) return null;
  return Object.freeze({ targetId: input.id, currentText: input.value, start, end, sourceText: input.value.slice(start, end) });
}

export function selectionStillMatches(input, snapshot) {
  if (!input || !snapshot || input.id !== snapshot.targetId || input.value !== snapshot.currentText) return false;
  if (input.selectionStart !== snapshot.start || input.selectionEnd !== snapshot.end) return false;
  return input.value.slice(snapshot.start, snapshot.end) === snapshot.sourceText;
}

export function replaceSelection(currentText, snapshot, replacement) {
  if (typeof currentText !== "string" || !snapshot || typeof replacement !== "string") return null;
  if (currentText !== snapshot.currentText || currentText.slice(snapshot.start, snapshot.end) !== snapshot.sourceText) return null;
  return `${currentText.slice(0, snapshot.start)}${replacement}${currentText.slice(snapshot.end)}`;
}
