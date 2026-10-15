import { getAccountScope } from "./accountScope.js";
import { parseNaturalCommand } from "./commandParser.js";

const MAX_TEXT_LENGTH = 4096;
const MIN_CONFIDENCE = 0.55;
const ACTION_VERBS = /^(?:open|go to|navigate to|search(?: for)?|look up|read|summarize|inspect|save|remember|create|add|make|run|execute|edit|close|quit|restart|shutdown|shut down|organize|find|take)\b/i;
const SENSITIVE_TERMS = /\b(?:delete|erase|remove|send|submit|purchase|buy|pay|transfer|share|publish|install|uninstall|format|shutdown|shut down|run|execute|terminal|password|passcode|secret|medical|health|financial|bank|credit card|social security)\b/i;
const CANCEL_TERMS = /^(?:cancel|never mind|nevermind|stop|don't do that|do not do that|no,? cancel)[.!\s]*$/i;

function readDataObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be a plain data object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${name} must be a plain data object.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length) throw new TypeError(`${name} cannot contain symbols.`);
  const result = Object.create(null);
  for (const key of Object.keys(descriptors)) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${name} cannot contain accessors or hidden properties.`);
    result[key] = descriptor.value;
  }
  return result;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function tokenize(input) {
  if (typeof input === "string") {
    if (input.length > MAX_TEXT_LENGTH || !input.trim()) throw new TypeError("Voice input text must be non-empty and bounded.");
    return { text: input.trim(), confidence: 1 };
  }
  const request = readDataObject(input, "Voice input");
  if (Object.keys(request).some((key) => !["text", "confidence"].includes(key))) throw new TypeError("Voice input contains unsupported fields.");
  if (typeof request.text !== "string" || request.text.length > MAX_TEXT_LENGTH || !request.text.trim()) throw new TypeError("Voice input text must be non-empty and bounded.");
  if (request.confidence !== undefined && (typeof request.confidence !== "number" || !Number.isFinite(request.confidence) || request.confidence < 0 || request.confidence > 1)) throw new TypeError("Voice confidence must be between zero and one.");
  return { text: request.text.trim(), confidence: request.confidence ?? 1 };
}

function safePreview(command) {
  if (!command || typeof command !== "object") return null;
  // Keep the preview as inert JSON data. It is never dispatched to an adapter.
  const descriptors = Object.getOwnPropertyDescriptors(command);
  const clone = Object.create(null);
  for (const key of Object.keys(descriptors)) {
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value") || !descriptor.enumerable) throw new TypeError("Command preview must be plain data.");
    const value = descriptor.value;
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) clone[key] = value;
    else if (Array.isArray(value)) {
      const entries = [];
      for (let index = 0; index < value.length; index += 1) {
        const entry = Object.getOwnPropertyDescriptor(value, String(index));
        if (!entry || !Object.hasOwn(entry, "value")) throw new TypeError("Command preview arrays must be dense plain data.");
        if (entry.value && typeof entry.value === "object") entries.push(safePreview(entry.value));
        else entries.push(entry.value);
      }
      clone[key] = entries;
    } else clone[key] = safePreview(value);
  }
  return clone;
}

function classifySnapshot({ text, confidence }, scope) {
  const normalized = text.trim();
  if (confidence < MIN_CONFIDENCE) {
    return deepFreeze({ type: "Ask", confidence, status: "clarification_required", reason: "low_confidence", preview: { text: normalized, accountScope: scope }, requiresPreview: true, requiresConfirmation: true, accountScope: scope });
  }
  if (CANCEL_TERMS.test(normalized)) {
    return deepFreeze({ type: "Command", confidence, status: "denied", reason: "user_cancelled", preview: { action: "cancel", text: normalized, accountScope: scope }, requiresPreview: false, requiresConfirmation: false, accountScope: scope });
  }

  const dictateMatch = normalized.match(/^(?:dictate|transcribe|write down)\s*[:,]?\s*(.*)$/i);
  if (dictateMatch) {
    const content = dictateMatch[1].trim();
    const status = content ? "ready" : "clarification_required";
    return deepFreeze({ type: "Dictate", confidence, status, reason: content ? "dictation_only" : "dictation_text_required", preview: { text: content, accountScope: scope }, requiresPreview: false, requiresConfirmation: false, accountScope: scope });
  }

  const editMatch = normalized.match(/^(?:edit|rewrite|revise|correct)\s+(.+)$/i);
  if (editMatch) {
    const requestedEdit = editMatch[1].trim();
    return deepFreeze({ type: "Edit", confidence, status: "preview_required", reason: "text_edit_requires_preview", preview: { instruction: requestedEdit, accountScope: scope }, requiresPreview: true, requiresConfirmation: true, accountScope: scope });
  }

  if (ACTION_VERBS.test(normalized)) {
    const parsed = parseNaturalCommand(normalized);
    if (parsed) {
      const preview = safePreview(parsed);
      const needsClarification = parsed.needsClarification === true;
      const sensitive = SENSITIVE_TERMS.test(normalized) || parsed.kind === "workflow";
      return deepFreeze({ type: "Command", confidence, status: needsClarification ? "clarification_required" : "preview_required", reason: needsClarification ? "command_needs_clarification" : sensitive ? "sensitive_action_requires_confirmation" : "action_requires_confirmation", preview: { command: preview, text: normalized, accountScope: scope }, requiresPreview: true, requiresConfirmation: true, accountScope: scope });
    }
  }

  return deepFreeze({ type: "Ask", confidence, status: "ready", reason: "conversation_or_question", preview: { text: normalized, accountScope: scope }, requiresPreview: false, requiresConfirmation: false, accountScope: scope });
}

/**
 * Classify one bounded utterance into an inert, account-bound preview.
 * This function intentionally does not call any OS or application adapter.
 */
export async function understandVoiceCommand(input) {
  const scopeAtStart = getAccountScope();
  let snapshot;
  try {
    snapshot = tokenize(input);
  } catch (error) {
    return deepFreeze({ type: "Ask", confidence: 0, status: "denied", reason: "invalid_input", error: error instanceof Error ? error.message : "Invalid voice input.", preview: null, requiresPreview: true, requiresConfirmation: true, accountScope: scopeAtStart });
  }
  if (getAccountScope() !== scopeAtStart) {
    return deepFreeze({ type: "Ask", confidence: snapshot.confidence, status: "denied", reason: "stale_account_scope", preview: null, requiresPreview: true, requiresConfirmation: true, accountScope: scopeAtStart });
  }
  // Keep an explicit async boundary so scope freshness is checked before returning any preview.
  await Promise.resolve();
  if (getAccountScope() !== scopeAtStart) {
    return deepFreeze({ type: "Ask", confidence: snapshot.confidence, status: "denied", reason: "stale_account_scope", preview: null, requiresPreview: true, requiresConfirmation: true, accountScope: scopeAtStart });
  }
  return classifySnapshot(snapshot, scopeAtStart);
}

export default { understandVoiceCommand };
