import { getAccountScope, getAccountStorageKey } from "../core/accountScope.js";
import { applyDictationCorrections } from "./voiceProviders.js";

const STORAGE_KEY = "hey_dictation_preferences";
const MAX_BYTES = 48_000;
const MAX_CORRECTIONS = 64;
const MAX_SNIPPETS = 32;

export const DEFAULT_DICTATION_PREFERENCES = Object.freeze({
  language: "en-US",
  corrections: Object.freeze([]),
  snippets: Object.freeze([]),
});

function plainRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be a plain object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${name} must be a plain object.`);
  const snapshot = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || ["__proto__", "constructor", "prototype"].includes(key)) {
      throw new TypeError(`${name} contains an unsupported property.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${name} cannot contain accessors or hidden properties.`);
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function plainArray(value, name, maxLength) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maxLength) {
    throw new TypeError(`${name} must be a bounded plain array.`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(0|[1-9]\d*)$/u.test(key)))) {
    throw new TypeError(`${name} cannot contain custom array properties.`);
  }
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${name} cannot be sparse or contain accessors.`);
    }
    result.push(descriptor.value);
  }
  return result;
}

function canonicalLanguage(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 64) {
    throw new TypeError("Dictation language must be a valid language tag.");
  }
  try {
    const [locale] = Intl.getCanonicalLocales(value.trim());
    if (!locale) throw new Error("missing locale");
    return locale;
  } catch {
    throw new TypeError("Dictation language must be a valid language tag.");
  }
}

function plainText(value, name, maxLength, allowLineBreaks = false) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new TypeError(`${name} must be non-empty text within the supported length.`);
  }
  const hasControl = [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint === 0x7f || (codePoint < 0x20 && !(allowLineBreaks && [0x09, 0x0a, 0x0d].includes(codePoint)));
  });
  if (hasControl) {
    throw new TypeError(`${name} cannot contain control characters.`);
  }
  return value.trim();
}

export function normalizeDictationPreferences(input) {
  const record = plainRecord(input, "Dictation preferences");
  const allowed = new Set(["language", "corrections", "snippets"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) throw new TypeError("Dictation preferences contain an unsupported field.");
  const language = canonicalLanguage(record.language ?? DEFAULT_DICTATION_PREFERENCES.language);

  const correctionInput = plainArray(record.corrections ?? [], "Dictation corrections", MAX_CORRECTIONS);
  const correctionSources = new Set();
  const corrections = correctionInput.map((entry) => {
    const correction = plainRecord(entry, "Dictation correction");
    if (Object.keys(correction).some((key) => !["from", "to"].includes(key))) {
      throw new TypeError("Dictation correction contains an unsupported field.");
    }
    const from = plainText(correction.from, "Correction source", 80);
    const to = plainText(correction.to, "Correction replacement", 160);
    const key = from.toLocaleLowerCase();
    if (correctionSources.has(key)) throw new TypeError("Dictation correction sources must be unique.");
    correctionSources.add(key);
    return Object.freeze({ from, to });
  });

  const snippetInput = plainArray(record.snippets ?? [], "Dictation snippets", MAX_SNIPPETS);
  const snippetNames = new Set();
  const snippets = snippetInput.map((entry) => {
    const snippet = plainRecord(entry, "Dictation snippet");
    if (Object.keys(snippet).some((key) => !["name", "text"].includes(key))) {
      throw new TypeError("Dictation snippet contains an unsupported field.");
    }
    const name = plainText(snippet.name, "Snippet name", 64);
    const text = plainText(snippet.text, "Snippet text", 2000, true);
    const key = name.toLocaleLowerCase();
    if (snippetNames.has(key)) throw new TypeError("Dictation snippet names must be unique.");
    snippetNames.add(key);
    return Object.freeze({ name, text });
  });

  return Object.freeze({ language, corrections: Object.freeze(corrections), snippets: Object.freeze(snippets) });
}

/** Apply saved phrase corrections and spoken snippet names without storing text. */
export function applyDictationPreferences(transcript, input) {
  const preferences = normalizeDictationPreferences(input);
  const corrections = [
    ...preferences.corrections,
    ...preferences.snippets.map(({ name, text }) => ({ from: name, to: text })),
  ];
  if (corrections.length > MAX_CORRECTIONS) {
    throw new TypeError(`Combined dictation corrections and snippets must not exceed ${MAX_CORRECTIONS} entries.`);
  }
  return applyDictationCorrections(transcript, corrections);
}

function activeAccountScope(getScope) {
  const scope = getScope();
  if (typeof scope !== "string" || !scope.startsWith("account:") || !scope.slice("account:".length).trim()) return null;
  return scope;
}

/**
 * Create an account-bound preference store. It stores settings only; audio and
 * recognized transcripts are never written by this module.
 */
export function createDictationPreferenceStore({
  storageProvider = () => globalThis.localStorage,
  getScope = getAccountScope,
} = {}) {
  function getStorage() {
    try { return storageProvider(); } catch { return null; }
  }

  function load() {
    const scope = activeAccountScope(getScope);
    if (!scope) return { success: false, status: "account_required", preferences: null };
    const store = getStorage();
    if (!store) return { success: false, status: "unavailable", preferences: null };
    let raw;
    try { raw = store.getItem(getAccountStorageKey(STORAGE_KEY, scope)); }
    catch { return { success: false, status: "storage_failed", preferences: null }; }
    if (raw == null) return { success: true, status: "default", preferences: normalizeDictationPreferences({}) };
    if (typeof raw !== "string" || raw.length > MAX_BYTES) return { success: false, status: "invalid_store", preferences: null };
    try {
      const stored = JSON.parse(raw);
      const envelope = plainRecord(stored, "Stored dictation preferences");
      if (envelope.version !== 1 || envelope.scope !== scope || !Object.hasOwn(envelope, "preferences")) {
        return { success: false, status: "invalid_store", preferences: null };
      }
      return { success: true, status: "loaded", preferences: normalizeDictationPreferences(envelope.preferences) };
    } catch {
      return { success: false, status: "invalid_store", preferences: null };
    }
  }

  function save(value) {
    const scope = activeAccountScope(getScope);
    if (!scope) return { success: false, status: "account_required", preferences: null };
    let preferences;
    try { preferences = normalizeDictationPreferences(value); }
    catch (error) { return { success: false, status: "invalid_input", error: error.message, preferences: null }; }
    const store = getStorage();
    if (!store) return { success: false, status: "unavailable", preferences: null };
    const key = getAccountStorageKey(STORAGE_KEY, scope);
    const serialized = JSON.stringify({ version: 1, scope, preferences });
    if (serialized.length > MAX_BYTES) return { success: false, status: "too_large", preferences: null };
    let previous;
    try {
      previous = store.getItem(key);
      store.setItem(key, serialized);
      if (store.getItem(key) !== serialized) {
        if (previous == null) store.removeItem(key);
        else store.setItem(key, previous);
        return { success: false, status: "storage_failed", preferences: null };
      }
    } catch {
      return { success: false, status: "storage_failed", preferences: null };
    }
    return { success: true, status: "saved", preferences };
  }

  function clear() {
    const scope = activeAccountScope(getScope);
    if (!scope) return { success: false, status: "account_required" };
    const store = getStorage();
    if (!store) return { success: false, status: "unavailable" };
    try { store.removeItem(getAccountStorageKey(STORAGE_KEY, scope)); }
    catch { return { success: false, status: "storage_failed" }; }
    return { success: true, status: "cleared" };
  }

  return Object.freeze({ load, save, clear });
}

export const dictationPreferenceStore = createDictationPreferenceStore();

export default {
  DEFAULT_DICTATION_PREFERENCES,
  normalizeDictationPreferences,
  applyDictationPreferences,
  createDictationPreferenceStore,
  dictationPreferenceStore,
};
