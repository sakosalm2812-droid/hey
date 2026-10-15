import { getAccountScope, getAccountStorageKey } from "./accountScope.js";

const STORAGE_KEY = "hey_tool_library_preferences";
const CONTRACT_VERSION = 1;
const MAX_SERIALIZED_LENGTH = 48_000;
const MAX_TOOL_NAME = 160;
const MAX_FAVORITES = 100;
const MAX_PINNED = 100;
const MAX_RECENTS = 30;
const storesBeingMutated = new WeakSet();

const DEFAULT_PREFERENCES = Object.freeze({
  favorites: Object.freeze([]),
  pinned: Object.freeze([]),
  recent: Object.freeze([]),
});

function plainRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be a plain object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object.`);
  const snapshot = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || ["__proto__", "constructor", "prototype"].includes(key)) {
      throw new TypeError(`${label} contains an unsupported property.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label} cannot contain accessors or hidden properties.`);
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function plainArray(value, label, maxLength) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maxLength) {
    throw new TypeError(`${label} must be a bounded plain array.`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(0|[1-9]\d*)$/u.test(key)))) {
    throw new TypeError(`${label} cannot contain custom array properties.`);
  }
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label} cannot be sparse or contain accessors.`);
    }
    result.push(descriptor.value);
  }
  return result;
}

function activeAccountScope(getScope) {
  let scope;
  try { scope = getScope(); } catch { return null; }
  return typeof scope === "string" && scope.startsWith("account:") && scope.slice("account:".length).trim()
    ? scope
    : null;
}

function immutablePreferences(value) {
  return Object.freeze({
    favorites: Object.freeze([...value.favorites]),
    pinned: Object.freeze([...value.pinned]),
    recent: Object.freeze(value.recent.map((entry) => Object.freeze({ ...entry }))),
  });
}

/**
 * Create a local, account-scoped Tool Library preference store. Catalog data
 * remains canonical and independent; this store contains selection metadata
 * only and accepts names only while they exist in the canonical registry.
 */
export function createToolLibraryPreferenceStore({
  storageProvider = () => globalThis.localStorage,
  getScope = getAccountScope,
  isToolRegistered = () => false,
  now = () => new Date(),
} = {}) {
  let mutationInProgress = false;

  function getStorage() {
    try { return storageProvider(); } catch { return null; }
  }

  function hasMethod(store, name) {
    try { return typeof store?.[name] === "function"; } catch { return false; }
  }

  function invoke(store, name, ...args) {
    const method = store?.[name];
    if (typeof method !== "function") throw new TypeError(`Storage method ${name} is unavailable.`);
    return Reflect.apply(method, store, args);
  }

  function validateToolName(value, { requireRegistered = true } = {}) {
    if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > MAX_TOOL_NAME ||
        [...value].some((character) => {
          const code = character.codePointAt(0);
          return code < 0x20 || code === 0x7f;
        })) {
      throw new TypeError("Tool name is invalid.");
    }
    if (requireRegistered) {
      let registered;
      try { registered = isToolRegistered(value); } catch { registered = false; }
      if (registered !== true) throw new TypeError("Tool is not registered in the canonical registry.");
    }
    return value;
  }

  function normalizePreferences(input, { stored = false } = {}) {
    const record = plainRecord(input, "Tool Library preferences");
    if (Object.keys(record).some((key) => !["favorites", "pinned", "recent"].includes(key))) {
      throw new TypeError("Tool Library preferences contain an unsupported field.");
    }

    const normalizeNames = (value, label, maxLength) => {
      const names = plainArray(value ?? [], label, maxLength).map((name) => validateToolName(name, { requireRegistered: !stored }));
      if (new Set(names).size !== names.length) throw new TypeError(`${label} must not contain duplicates.`);
      return stored ? names.filter((name) => isRegisteredTool(name)) : names;
    };
    const favorites = normalizeNames(record.favorites, "Tool favorites", MAX_FAVORITES);
    const pinned = normalizeNames(record.pinned, "Pinned tools", MAX_PINNED);
    const recentInput = plainArray(record.recent ?? [], "Recent tools", MAX_RECENTS);
    const seenRecent = new Set();
    const recent = [];
    for (const item of recentInput) {
      const entry = plainRecord(item, "Recent tool entry");
      if (Object.keys(entry).some((key) => !["name", "usedAt"].includes(key)) ||
          !Object.hasOwn(entry, "name") || !Object.hasOwn(entry, "usedAt")) {
        throw new TypeError("Recent tool entry contains unsupported fields.");
      }
      const name = validateToolName(entry.name, { requireRegistered: !stored });
      if (seenRecent.has(name)) throw new TypeError("Recent tools must not contain duplicates.");
      seenRecent.add(name);
      if (typeof entry.usedAt !== "string" || entry.usedAt.length > 40 ||
          !Number.isFinite(Date.parse(entry.usedAt)) || new Date(entry.usedAt).toISOString() !== entry.usedAt) {
        throw new TypeError("Recent tool timestamp is invalid.");
      }
      if (!stored || isRegisteredTool(name)) recent.push({ name, usedAt: entry.usedAt });
    }
    return { favorites, pinned, recent };
  }

  function isRegisteredTool(name) {
    try { return isToolRegistered(name) === true; } catch { return false; }
  }

  function read(scope, store) {
    let raw;
    try { raw = invoke(store, "getItem", getAccountStorageKey(STORAGE_KEY, scope)); }
    catch { return { success: false, status: "storage_failed", preferences: null }; }
    if (raw == null) return { success: true, status: "default", preferences: immutablePreferences(DEFAULT_PREFERENCES) };
    if (typeof raw !== "string" || raw.length > MAX_SERIALIZED_LENGTH) return { success: false, status: "invalid_store", preferences: null };
    try {
      const envelope = plainRecord(JSON.parse(raw), "Stored Tool Library preferences");
      if (envelope.version !== CONTRACT_VERSION || envelope.scope !== scope || !Object.hasOwn(envelope, "preferences") ||
          Object.keys(envelope).some((key) => !["version", "scope", "preferences"].includes(key))) {
        return { success: false, status: "invalid_store", preferences: null };
      }
      const normalized = normalizePreferences(envelope.preferences, { stored: true });
      return {
        success: true,
        status: "loaded",
        needsPrune: JSON.stringify(envelope.preferences) !== JSON.stringify(normalized),
        preferences: immutablePreferences(normalized),
      };
    } catch {
      return { success: false, status: "invalid_store", preferences: null };
    }
  }

  function load() {
    const scope = activeAccountScope(getScope);
    if (!scope) return { success: false, status: "account_required", preferences: null };
    const store = getStorage();
    if (!store || !hasMethod(store, "getItem")) return { success: false, status: "unavailable", preferences: null };
    if (activeAccountScope(getScope) !== scope) return { success: false, status: "account_required", preferences: null };
    const result = read(scope, store);
    if (activeAccountScope(getScope) !== scope) return { success: false, status: "account_required", preferences: null };
    if (!result.success || !result.needsPrune) return { success: result.success, status: result.status, preferences: result.preferences };
    if (mutationInProgress || storesBeingMutated.has(store) || !hasMethod(store, "setItem")) {
      return { success: false, status: "storage_failed", preferences: null };
    }
    mutationInProgress = true;
    storesBeingMutated.add(store);
    try {
      const saved = persist(scope, store, result.preferences);
      return saved.success ? { ...saved, status: "pruned" } : saved;
    } finally {
      mutationInProgress = false;
      storesBeingMutated.delete(store);
    }
  }

  function persist(scope, store, preferences) {
    const key = getAccountStorageKey(STORAGE_KEY, scope);
    const serialized = JSON.stringify({ version: CONTRACT_VERSION, scope, preferences });
    if (serialized.length > MAX_SERIALIZED_LENGTH) return { success: false, status: "too_large", preferences: null };
    let previous;
    let previousRead = false;
    let writeAttempted = false;
    const rollback = () => {
      if (!previousRead || !writeAttempted) return;
      try {
        if (previous == null) invoke(store, "removeItem", key);
        else invoke(store, "setItem", key, previous);
      } catch { /* Return failure even if storage cannot restore the prior value. */ }
    };
    try {
      previous = invoke(store, "getItem", key);
      previousRead = true;
      if (activeAccountScope(getScope) !== scope) return { success: false, status: "account_required", preferences: null };
      writeAttempted = true;
      invoke(store, "setItem", key, serialized);
      if (invoke(store, "getItem", key) !== serialized || activeAccountScope(getScope) !== scope) {
        rollback();
        return { success: false, status: activeAccountScope(getScope) !== scope ? "account_required" : "storage_failed", preferences: null };
      }
    } catch {
      rollback();
      return { success: false, status: "storage_failed", preferences: null };
    }
    return { success: true, status: "saved", preferences: immutablePreferences(preferences) };
  }

  function update(mutator, { accountId } = {}) {
    const scope = activeAccountScope(getScope);
    if (!scope) return { success: false, status: "account_required", preferences: null };
    if (accountId !== undefined && scope !== `account:${accountId}`) {
      return { success: false, status: "account_required", preferences: null };
    }
    const store = getStorage();
    if (!store || !hasMethod(store, "getItem") || !hasMethod(store, "setItem")) {
      return { success: false, status: "unavailable", preferences: null };
    }
    if (mutationInProgress || storesBeingMutated.has(store)) return { success: false, status: "storage_failed", preferences: null };
    mutationInProgress = true;
    storesBeingMutated.add(store);
    try {
      const current = read(scope, store);
      if (!current.success) return current;
      if (activeAccountScope(getScope) !== scope) return { success: false, status: "account_required", preferences: null };
      const changed = normalizePreferences(mutator({
        favorites: [...current.preferences.favorites],
        pinned: [...current.preferences.pinned],
        recent: current.preferences.recent.map((entry) => ({ ...entry })),
      }));
      return persist(scope, store, changed);
    } catch (error) {
      return { success: false, status: "invalid_input", error: error.message, preferences: null };
    } finally {
      mutationInProgress = false;
      storesBeingMutated.delete(store);
    }
  }

  function setFavorite(name, enabled = true) {
    return update((preferences) => {
      validateToolName(name);
      if (typeof enabled !== "boolean") throw new TypeError("Favorite state must be a boolean.");
      const favorites = preferences.favorites.filter((item) => item !== name);
      if (enabled) favorites.unshift(name);
      return { ...preferences, favorites };
    });
  }

  function setPinned(name, enabled = true) {
    return update((preferences) => {
      validateToolName(name);
      if (typeof enabled !== "boolean") throw new TypeError("Pinned state must be a boolean.");
      const pinned = preferences.pinned.filter((item) => item !== name);
      if (enabled) pinned.unshift(name);
      return { ...preferences, pinned };
    });
  }

  function recordRecent(name, { accountId } = {}) {
    return update((preferences) => {
      validateToolName(name);
      const timestamp = now();
      if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) throw new TypeError("Recent tool clock is invalid.");
      const recent = [{ name, usedAt: timestamp.toISOString() }, ...preferences.recent.filter((item) => item.name !== name)]
        .slice(0, MAX_RECENTS);
      return { ...preferences, recent };
    }, { accountId });
  }

  function clear() {
    return update(() => ({ favorites: [], pinned: [], recent: [] }));
  }

  return Object.freeze({ load, setFavorite, setPinned, recordRecent, clear });
}

export const TOOL_LIBRARY_PREFERENCE_LIMITS = Object.freeze({
  maxSerializedLength: MAX_SERIALIZED_LENGTH,
  maxToolName: MAX_TOOL_NAME,
  maxFavorites: MAX_FAVORITES,
  maxPinned: MAX_PINNED,
  maxRecents: MAX_RECENTS,
});

export default { createToolLibraryPreferenceStore, TOOL_LIBRARY_PREFERENCE_LIMITS };
