import { getAccountScope, getAccountStorageKey } from "../core/accountScope.js";
import { applyDictationCorrections } from "./voiceProviders.js";

const STORAGE_KEY = "hey_dictation_preferences";
const MAX_BYTES = 48_000;
const MAX_CORRECTIONS = 64;
const MAX_SNIPPETS = 32;
const MAX_VOCABULARY = 32;
const MAX_PERSONALIZATION_ENTRIES = 64;
const MAX_APPLICATIONS = 32;
const MAX_APPLICATION_ID_LENGTH = 96;
const storesBeingMutated = new WeakSet();

export const DEFAULT_DICTATION_PREFERENCES = Object.freeze({
  language: "en-US",
  corrections: Object.freeze([]),
  snippets: Object.freeze([]),
  vocabulary: Object.freeze([]),
  applications: Object.freeze([]),
});

/** Validate an explicit, stable application identifier supplied by the host. */
export function normalizeDictationApplicationId(value) {
  if (typeof value !== "string" || value.length > MAX_APPLICATION_ID_LENGTH ||
      !/^[a-z0-9][a-z0-9._-]{0,95}$/u.test(value) || value.includes("..")) {
    throw new TypeError("Dictation application identity is invalid.");
  }
  return value;
}

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

function phraseKey(value, language) {
  return value.normalize("NFC").toLocaleUpperCase(language).toLocaleLowerCase(language).normalize("NFC");
}

function assertUniquePersonalizedPhrases(corrections, snippets, vocabulary, language) {
  const sources = new Set();
  for (const phrase of [
    ...corrections.map(({ from }) => from),
    ...snippets.map(({ name }) => name),
    ...vocabulary,
  ]) {
    const key = phraseKey(phrase, language);
    if (sources.has(key)) throw new TypeError("Dictation corrections, snippets, and vocabulary phrases must not conflict.");
    sources.add(key);
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
  const allowed = new Set(["language", "corrections", "snippets", "vocabulary", "applications"]);
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
    const key = phraseKey(from, language);
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
    const key = phraseKey(name, language);
    if (snippetNames.has(key)) throw new TypeError("Dictation snippet names must be unique.");
    snippetNames.add(key);
    return Object.freeze({ name, text });
  });
  const vocabularyInput = plainArray(record.vocabulary ?? [], "Dictation vocabulary", MAX_VOCABULARY);
  const vocabularyKeys = new Set();
  const vocabulary = vocabularyInput.map((entry) => {
    const phrase = plainText(entry, "Vocabulary phrase", 80);
    const key = phraseKey(phrase, language);
    if (vocabularyKeys.has(key)) throw new TypeError("Dictation vocabulary phrases must be unique.");
    vocabularyKeys.add(key);
    return phrase;
  });
  assertUniquePersonalizedPhrases(corrections, snippets, vocabulary, language);
  if (corrections.length + snippets.length + vocabulary.length > MAX_PERSONALIZATION_ENTRIES) {
    throw new TypeError(`Combined dictation corrections, snippets, and vocabulary must not exceed ${MAX_PERSONALIZATION_ENTRIES} entries.`);
  }

  const applicationInput = plainArray(record.applications ?? [], "Dictation applications", MAX_APPLICATIONS);
  const applicationIds = new Set();
  const applications = applicationInput.map((entry) => {
    const application = plainRecord(entry, "Dictation application preferences");
    if (Object.keys(application).some((key) => !["applicationId", "preferences"].includes(key)) ||
        !Object.hasOwn(application, "applicationId") || !Object.hasOwn(application, "preferences")) {
      throw new TypeError("Dictation application preferences contain unsupported fields.");
    }
    const applicationId = normalizeDictationApplicationId(application.applicationId);
    if (applicationIds.has(applicationId)) throw new TypeError("Dictation application identities must be unique.");
    applicationIds.add(applicationId);
    const override = plainRecord(application.preferences, "Application dictation preferences");
    if (!Object.keys(override).length || Object.keys(override).some((key) => !["language", "corrections", "snippets", "vocabulary"].includes(key))) {
      throw new TypeError("Application dictation preferences contain an unsupported field.");
    }
    const normalized = {};
    if (Object.hasOwn(override, "language")) normalized.language = canonicalLanguage(override.language);
    if (Object.hasOwn(override, "corrections")) {
      normalized.corrections = normalizeDictationPreferences({ language: normalized.language ?? language, corrections: override.corrections }).corrections;
    }
    if (Object.hasOwn(override, "snippets")) {
      normalized.snippets = normalizeDictationPreferences({ language: normalized.language ?? language, snippets: override.snippets }).snippets;
    }
    if (Object.hasOwn(override, "vocabulary")) {
      normalized.vocabulary = normalizeDictationPreferences({ language: normalized.language ?? language, vocabulary: override.vocabulary }).vocabulary;
    }
    const effectiveCorrections = normalized.corrections ?? corrections;
    const effectiveSnippets = normalized.snippets ?? snippets;
    const effectiveVocabulary = normalized.vocabulary ?? vocabulary;
    const effectiveLanguage = normalized.language ?? language;
    assertUniquePersonalizedPhrases(effectiveCorrections, effectiveSnippets, effectiveVocabulary, effectiveLanguage);
    if (effectiveCorrections.length + effectiveSnippets.length + effectiveVocabulary.length > MAX_PERSONALIZATION_ENTRIES) {
      throw new TypeError(`Combined application corrections, snippets, and vocabulary must not exceed ${MAX_PERSONALIZATION_ENTRIES} entries.`);
    }
    return Object.freeze({ applicationId, preferences: Object.freeze(normalized) });
  });

  return Object.freeze({ language, corrections: Object.freeze(corrections), snippets: Object.freeze(snippets), vocabulary: Object.freeze(vocabulary), applications: Object.freeze(applications) });
}

/** Resolve a stable snapshot, using app overrides field-by-field over global settings. */
export function resolveDictationPreferences(input, applicationId) {
  const preferences = normalizeDictationPreferences(input);
  if (applicationId === undefined || applicationId === null) return preferences;
  const identity = normalizeDictationApplicationId(applicationId);
  const app = preferences.applications.find(({ applicationId: id }) => id === identity);
  return normalizeDictationPreferences({
    language: app?.preferences.language ?? preferences.language,
    corrections: app?.preferences.corrections ?? preferences.corrections,
    snippets: app?.preferences.snippets ?? preferences.snippets,
    vocabulary: app?.preferences.vocabulary ?? preferences.vocabulary,
  });
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
  return applyDictationCorrections(transcript, corrections, preferences.language);
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
  let mutationInProgress = false;

  function getStorage() {
    try { return storageProvider(); } catch { return null; }
  }

  function load({ applicationId } = {}) {
    let identity = null;
    try { if (applicationId !== undefined && applicationId !== null) identity = normalizeDictationApplicationId(applicationId); }
    catch { return { success: false, status: "invalid_application", preferences: null, settings: null }; }
    const scope = activeAccountScope(getScope);
    if (!scope) return { success: false, status: "account_required", preferences: null, settings: null };
    const store = getStorage();
    if (!store || !["object", "function"].includes(typeof store)) return { success: false, status: "unavailable", preferences: null, settings: null };
    let raw;
    try { raw = store.getItem(getAccountStorageKey(STORAGE_KEY, scope)); }
    catch { return { success: false, status: "storage_failed", preferences: null, settings: null }; }
    if (raw == null) {
      const settings = normalizeDictationPreferences({});
      return { success: true, status: "default", preferences: resolveDictationPreferences(settings, identity), settings };
    }
    if (typeof raw !== "string" || raw.length > MAX_BYTES) return { success: false, status: "invalid_store", preferences: null, settings: null };
    try {
      const stored = JSON.parse(raw);
      const envelope = plainRecord(stored, "Stored dictation preferences");
      if (![1, 2].includes(envelope.version) || envelope.scope !== scope || !Object.hasOwn(envelope, "preferences")) {
        return { success: false, status: "invalid_store", preferences: null, settings: null };
      }
      const settings = normalizeDictationPreferences(envelope.preferences);
      return { success: true, status: "loaded", preferences: resolveDictationPreferences(settings, identity), settings };
    } catch {
      return { success: false, status: "invalid_store", preferences: null, settings: null };
    }
  }

  function write(scope, store, preferences) {
    const key = getAccountStorageKey(STORAGE_KEY, scope);
    const serialized = JSON.stringify({ version: 2, scope, preferences });
    if (serialized.length > MAX_BYTES) return { success: false, status: "too_large", preferences: null, settings: null };
    let previous;
    let previousRead = false;
    let writeAttempted = false;
    const rollback = () => {
      if (!previousRead || !writeAttempted) return;
      try {
        if (previous == null) store.removeItem(key);
        else store.setItem(key, previous);
      } catch { /* Report failure even when storage cannot be restored. */ }
    };
    try {
      previous = store.getItem(key);
      previousRead = true;
      if (activeAccountScope(getScope) !== scope) return { success: false, status: "account_required", preferences: null, settings: null };
      writeAttempted = true;
      store.setItem(key, serialized);
      if (store.getItem(key) !== serialized || activeAccountScope(getScope) !== scope) {
        rollback();
        if (activeAccountScope(getScope) !== scope) return { success: false, status: "account_required", preferences: null, settings: null };
        return { success: false, status: "storage_failed", preferences: null, settings: null };
      }
    } catch {
      rollback();
      return { success: false, status: "storage_failed", preferences: null, settings: null };
    }
    return { success: true, status: "saved", preferences, settings: preferences };
  }

  function save(value, { applicationId } = {}) {
    let identity = null;
    try { if (applicationId !== undefined && applicationId !== null) identity = normalizeDictationApplicationId(applicationId); }
    catch { return { success: false, status: "invalid_application", preferences: null, settings: null }; }
    const scope = activeAccountScope(getScope);
    if (!scope) return { success: false, status: "account_required", preferences: null, settings: null };
    let preferences;
    let vocabularyProvided;
    try {
      const input = plainRecord(value, "Dictation preferences");
      vocabularyProvided = Object.hasOwn(input, "vocabulary");
      preferences = normalizeDictationPreferences(input);
    }
    catch (error) { return { success: false, status: "invalid_input", error: error.message, preferences: null, settings: null }; }
    const store = getStorage();
    if (!store || !["object", "function"].includes(typeof store)) return { success: false, status: "unavailable", preferences: null, settings: null };
    if (mutationInProgress || storesBeingMutated.has(store)) return { success: false, status: "storage_failed", preferences: null, settings: null };
    mutationInProgress = true;
    storesBeingMutated.add(store);
    try {
      const current = load({ applicationId: identity });
      if (!current.success) return { success: false, status: current.status, preferences: null, settings: null };
      if (activeAccountScope(getScope) !== scope) return { success: false, status: "account_required", preferences: null, settings: null };
      if (identity === null) {
        // A global editor only changes global fields; current app overrides are authoritative.
        const settings = normalizeDictationPreferences({
          ...preferences,
          vocabulary: vocabularyProvided ? preferences.vocabulary : current.settings.vocabulary,
          applications: current.settings.applications,
        });
        return write(scope, store, settings);
      }
      const apps = current.settings.applications.filter((app) => app.applicationId !== identity);
      const currentApp = current.settings.applications.find((app) => app.applicationId === identity);
      const applicationPreferences = {
        language: preferences.language,
        corrections: preferences.corrections,
        snippets: preferences.snippets,
      };
      if (vocabularyProvided) applicationPreferences.vocabulary = preferences.vocabulary;
      else if (currentApp?.preferences.vocabulary !== undefined) applicationPreferences.vocabulary = currentApp.preferences.vocabulary;
      apps.push({ applicationId: identity, preferences: applicationPreferences });
      const settings = normalizeDictationPreferences({ ...current.settings, applications: apps });
      const result = write(scope, store, settings);
      if (result.success) result.preferences = resolveDictationPreferences(settings, identity);
      return result;
    } catch (error) {
      return { success: false, status: "invalid_input", error: error.message, preferences: null, settings: null };
    } finally {
      mutationInProgress = false;
      storesBeingMutated.delete(store);
    }
  }

  function clear({ applicationId } = {}) {
    let identity = null;
    try { if (applicationId !== undefined && applicationId !== null) identity = normalizeDictationApplicationId(applicationId); }
    catch { return { success: false, status: "invalid_application" }; }
    const scope = activeAccountScope(getScope);
    if (!scope) return { success: false, status: "account_required" };
    const store = getStorage();
    if (!store || !["object", "function"].includes(typeof store)) return { success: false, status: "unavailable" };
    if (mutationInProgress || storesBeingMutated.has(store)) return { success: false, status: "storage_failed" };
    mutationInProgress = true;
    storesBeingMutated.add(store);
    try {
      if (identity !== null) {
        const current = load({ applicationId: identity });
        if (!current.success) return { success: false, status: current.status };
        if (activeAccountScope(getScope) !== scope) return { success: false, status: "account_required" };
        const settings = normalizeDictationPreferences({
          ...current.settings,
          applications: current.settings.applications.filter((app) => app.applicationId !== identity),
        });
        const result = write(scope, store, settings);
        if (result.success) {
          result.status = "cleared";
          result.preferences = resolveDictationPreferences(settings, identity);
        }
        return result;
      }
      const key = getAccountStorageKey(STORAGE_KEY, scope);
      let previous;
      let previousRead = false;
      let removeAttempted = false;
      const rollback = () => {
        if (!previousRead || !removeAttempted || previous == null) return;
        try { store.setItem(key, previous); } catch { /* Report failure even when storage cannot be restored. */ }
      };
      try {
        previous = store.getItem(key);
        previousRead = true;
        if (activeAccountScope(getScope) !== scope) return { success: false, status: "account_required" };
        removeAttempted = true;
        store.removeItem(key);
        if (store.getItem(key) !== null || activeAccountScope(getScope) !== scope) {
          rollback();
          return { success: false, status: activeAccountScope(getScope) !== scope ? "account_required" : "storage_failed" };
        }
      } catch {
        rollback();
        return { success: false, status: "storage_failed" };
      }
      return { success: true, status: "cleared" };
    } finally {
      mutationInProgress = false;
      storesBeingMutated.delete(store);
    }
  }

  return Object.freeze({ load, save, clear });
}

export const dictationPreferenceStore = createDictationPreferenceStore();

export default {
  DEFAULT_DICTATION_PREFERENCES,
  normalizeDictationApplicationId,
  normalizeDictationPreferences,
  resolveDictationPreferences,
  applyDictationPreferences,
  createDictationPreferenceStore,
  dictationPreferenceStore,
};
