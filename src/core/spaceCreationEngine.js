import { getAccountScope, getAccountStorageKey, subscribeAccountScope } from "./accountScope.js";
import { recordAudit } from "./auditLog.js";
import { publish } from "./eventBus.js";
import { safeStorage } from "../lib/safeStorage.js";
import { getTool } from "./toolRegistry.js";

export const SPACE_CREATION_CONTRACT_VERSION = 1;
export const SPACE_STORAGE_CONTRACT_VERSION = 2;
export const SPACE_LAYOUT_PREFERENCES_CONTRACT_VERSION = 1;
export const SPACE_CREATION_LIMITS = Object.freeze({
  maxPromptLength: 500,
  maxNameLength: 80,
  maxDescriptionLength: 240,
  maxSpacesPerAccount: 1000,
  maxPreferenceIdsPerCategory: 32,
  maxPreferenceIdLength: 64,
  maxToolsPerSpace: 64,
  maxToolNameLength: 160,
  maxStoredChars: 1_000_000,
  previewLifetimeMs: 5 * 60 * 1000,
});

const STORAGE_KEY = "hey_spaces";
const SUPPORTED_SPACE_STORAGE_VERSIONS = new Set([1, SPACE_STORAGE_CONTRACT_VERSION]);
const SPACE_LAYOUT_PREFERENCE_FIELDS = Object.freeze(["favoriteToolIds", "widgetIds", "shortcutIds", "toolIds"]);
const SPACE_LAYOUT_PREFERENCE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;
const activeSpaceWrites = new Set();
const CREATE_SPACE_PROMPT = /^(?:please\s+)?create\s+(?:a\s+)?(?:private\s+)?space\s+(?:called|named)\s+(.+)$/i;
const FORBIDDEN_INTENT = /\b(?:public|share|shared|sharing|invite|invites|members?|permissions?|access|roles?|admin|administrator|owner|grant|escalat(?:e|ion))\b/i;
const SPACE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._'’()-]{0,79}$/u;
const SPACE_STARTERS = Object.freeze({
  empty: { label: "Empty Space", description: "" },
  planning: { label: "Planning template", description: "Goals, tasks, and next steps." },
  research: { label: "Research template", description: "Questions, sources, and findings." },
  custom: { label: "Custom Space", description: "" },
});

function containsControlChars(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

function plainRecord(value) {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

// Read only own data properties. This deliberately rejects getters, symbols, proxies
// that cannot be inspected, and unrecognized fields before consulting caller values.
function readDataRecord(value, allowedKeys) {
  if (!plainRecord(value)) return { error: "Request must be a plain object" };
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(value).length > 0) return { error: "Request contains unsupported fields" };
    const keys = Object.keys(descriptors);
    if (keys.some((key) => !allowedKeys.includes(key))) return { error: "Request contains unsupported fields" };
    const result = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!Object.hasOwn(descriptor, "value")) return { error: "Accessor properties are not allowed" };
      result[key] = descriptor.value;
    }
    return { value: result };
  } catch {
    return { error: "Request could not be safely inspected" };
  }
}

function cleanStoredSpace(id, value, scope) {
  if (!plainRecord(value)) return null;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.values(descriptors).some((descriptor) => !Object.hasOwn(descriptor, "value"))) return null;
    const space = Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]));
    if (space.id !== id || space.accountScope !== scope || typeof space.name !== "string" || !SPACE_NAME.test(space.name)) return null;
    if (space.visibility !== "private" || space.sharing !== "off") return null;
    const detailsRevision = space.detailsRevision === undefined ? 0 : space.detailsRevision;
    if (!Number.isSafeInteger(detailsRevision) || detailsRevision < 0) return null;
    if (space.description !== undefined && (typeof space.description !== "string" || space.description.length > SPACE_CREATION_LIMITS.maxDescriptionLength || containsControlChars(space.description))) return null;
    const templateId = space.templateId === undefined ? "empty" : space.templateId;
    if (typeof templateId !== "string" || !Object.hasOwn(SPACE_STARTERS, templateId)) return null;
    const layoutPreferences = space.layoutPreferences === undefined
      ? createDefaultSpaceLayoutPreferences()
      : normalizeSpaceLayoutPreferences(space.layoutPreferences);
    if (!layoutPreferences) return null;
    return {
      id,
      accountScope: scope,
      name: space.name,
      description: space.description || "",
      templateId,
      detailsRevision,
      visibility: "private",
      sharing: "off",
      createdAt: typeof space.createdAt === "string" ? space.createdAt.slice(0, 64) : null,
      layoutPreferences,
    };
  } catch {
    return null;
  }
}

function cloneSpace(space) {
  return { ...space, layoutPreferences: cloneSpaceLayoutPreferences(space.layoutPreferences) };
}

function createDefaultSpaceLayoutPreferences() {
  return {
    contractVersion: SPACE_LAYOUT_PREFERENCES_CONTRACT_VERSION,
    revision: 0,
    favoriteToolIds: [],
    widgetIds: [],
    shortcutIds: [],
    toolIds: [],
  };
}

function cloneSpaceLayoutPreferences(preferences) {
  return {
    contractVersion: preferences.contractVersion,
    revision: preferences.revision,
    favoriteToolIds: [...preferences.favoriteToolIds],
    widgetIds: [...preferences.widgetIds],
    shortcutIds: [...preferences.shortcutIds],
    toolIds: [...preferences.toolIds],
  };
}

function normalizePreferenceIdList(value) {
  if (!Array.isArray(value)) return null;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(value).length > 0) return null;
    const length = descriptors.length?.value;
    if (!Number.isInteger(length) || length < 0 || length > SPACE_CREATION_LIMITS.maxPreferenceIdsPerCategory) return null;
    if (Object.keys(descriptors).some((key) => key !== "length" && !/^(?:0|[1-9]\d*)$/.test(key))) return null;
    const result = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[index];
      if (!descriptor || !Object.hasOwn(descriptor, "value")) return null;
      const id = descriptor.value;
      if (typeof id !== "string" || id.length > SPACE_CREATION_LIMITS.maxPreferenceIdLength || !SPACE_LAYOUT_PREFERENCE_ID.test(id)) return null;
      if (result.includes(id)) return null;
      result.push(id);
    }
    return result;
  } catch {
    return null;
  }
}

function normalizeSpaceToolIds(value) {
  if (!Array.isArray(value)) return null;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(value).length > 0) return null;
    const length = descriptors.length?.value;
    if (!Number.isInteger(length) || length < 0 || length > SPACE_CREATION_LIMITS.maxToolsPerSpace) return null;
    if (Object.keys(descriptors).some((key) => key !== "length" && !/^(?:0|[1-9]\d*)$/.test(key))) return null;
    const result = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[index];
      if (!descriptor || !Object.hasOwn(descriptor, "value")) return null;
      const name = descriptor.value;
      if (!isSafeSpaceToolName(name)) return null;
      if (result.includes(name)) return null;
      result.push(name);
    }
    return result;
  } catch {
    return null;
  }
}

function isSafeSpaceToolName(name) {
  return typeof name === "string" && name.length > 0 && name.length <= SPACE_CREATION_LIMITS.maxToolNameLength
    && name === name.trim()
    && ![...name].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f);
    });
}

function isCanonicalToolRegistered(name) {
  try { return Boolean(getTool(name)); } catch { return false; }
}

function normalizeSpaceLayoutPreferences(value) {
  const safe = readDataRecord(value, ["contractVersion", "revision", ...SPACE_LAYOUT_PREFERENCE_FIELDS]);
  if (safe.error) return null;
  const input = safe.value;
  if (input.contractVersion !== SPACE_LAYOUT_PREFERENCES_CONTRACT_VERSION
    || !Number.isSafeInteger(input.revision) || input.revision < 0) return null;
  const preferences = createDefaultSpaceLayoutPreferences();
  preferences.revision = input.revision;
  for (const field of SPACE_LAYOUT_PREFERENCE_FIELDS) {
    if (!Object.hasOwn(input, field)) continue;
    const values = field === "toolIds" ? normalizeSpaceToolIds(input[field]) : normalizePreferenceIdList(input[field]);
    if (!values) return null;
    preferences[field] = values;
  }
  return preferences;
}

function normalizeSpaceLayoutPreferencePatch(value) {
  const safe = readDataRecord(value, SPACE_LAYOUT_PREFERENCE_FIELDS);
  if (safe.error || Object.keys(safe.value).length === 0) return { error: safe.error || "At least one layout preference is required" };
  const patch = {};
  for (const [field, values] of Object.entries(safe.value)) {
    const normalized = field === "toolIds" ? normalizeSpaceToolIds(values) : normalizePreferenceIdList(values);
    if (!normalized) return { error: `Invalid ${field}` };
    patch[field] = normalized;
  }
  return { value: patch };
}

function parseStoredSpaces(stored, scope) {
  if (stored == null) return new Map();
  if (typeof stored !== "string" || stored.length > SPACE_CREATION_LIMITS.maxStoredChars) throw new Error("Space storage is invalid or too large");
  const parsed = JSON.parse(stored);
  if (!plainRecord(parsed) || !SUPPORTED_SPACE_STORAGE_VERSIONS.has(parsed.contractVersion) || parsed.accountScope !== scope || !plainRecord(parsed.spaces)) {
    throw new Error("Space storage version or scope is invalid");
  }
  const entries = Object.entries(parsed.spaces);
  if (entries.length > SPACE_CREATION_LIMITS.maxSpacesPerAccount) throw new Error("Space storage exceeds the account limit");
  const spaces = new Map();
  entries.forEach(([id, value]) => {
    const clean = cleanStoredSpace(id, value, scope);
    if (!clean) throw new Error("Space storage contains an invalid record");
    spaces.set(id, clean);
  });
  return spaces;
}

function serializeSpaces(spaces, scope) {
  const serialized = JSON.stringify({
    contractVersion: SPACE_STORAGE_CONTRACT_VERSION,
    accountScope: scope,
    spaces: Object.fromEntries(spaces),
  });
  return serialized.length <= SPACE_CREATION_LIMITS.maxStoredChars ? serialized : null;
}

function readStorageItem(key) {
  try {
    const storage = globalThis.localStorage;
    return storage ? storage.getItem(key) : null;
  } catch {
    throw new Error("Space storage could not be read");
  }
}

function parseSpacePrompt(prompt) {
  if (typeof prompt !== "string") return { error: "Prompt must be text" };
  if (prompt.length > SPACE_CREATION_LIMITS.maxPromptLength) return { error: "Prompt is too long" };
  const normalized = prompt.trim();
  if (!normalized || containsControlChars(normalized)) return { error: "Prompt is empty or contains unsupported characters" };
  if (FORBIDDEN_INTENT.test(normalized)) return { error: "Sharing and permission changes are not supported by this action" };
  const match = normalized.match(CREATE_SPACE_PROMPT);
  if (!match) return { error: 'Use “create a private space called <name>”' };
  let name = match[1].trim();
  if ((name.startsWith('"') && name.endsWith('"')) || (name.startsWith("'") && name.endsWith("'"))) name = name.slice(1, -1).trim();
  if (!name || name.length > SPACE_CREATION_LIMITS.maxNameLength || containsControlChars(name) || !SPACE_NAME.test(name)) {
    return { error: `Space name must be 1–${SPACE_CREATION_LIMITS.maxNameLength} safe characters` };
  }
  return { value: { name, description: "" } };
}

function createId() {
  return `space_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`}`;
}

export class SpaceCreationEngine {
  constructor() {
    this.accountScope = getAccountScope();
    this.spaces = new Map();
    this.previews = new Map();
    this.listeners = new Set();
    this.loadError = false;
    this.load(this.accountScope);
    this.unsubscribeAccountScope = subscribeAccountScope(() => {
      this.accountScope = getAccountScope();
      this.previews.clear();
      this.load(this.accountScope);
      this.notify("account_scope_changed", { accountScope: this.accountScope });
    });
    this.storageEventTarget = globalThis.window && typeof globalThis.window.addEventListener === "function"
      ? globalThis.window
      : null;
    this.handleStorageEvent = (event) => {
      if (!event || (event.key !== getAccountStorageKey(STORAGE_KEY, this.accountScope) && event.key !== null)) return;
      try {
        if (event.storageArea && globalThis.localStorage && event.storageArea !== globalThis.localStorage) return;
      } catch {
        return;
      }
      const refreshed = this.refreshFromStorage(this.accountScope, { notify: true });
      if (refreshed.error) this.loadError = true;
    };
    this.storageEventTarget?.addEventListener("storage", this.handleStorageEvent);
  }

  load(scope = getAccountScope()) {
    this.accountScope = scope;
    this.loadError = false;
    try {
      const spaces = parseStoredSpaces(readStorageItem(getAccountStorageKey(STORAGE_KEY, scope)), scope);
      if (getAccountScope() !== scope || this.accountScope !== scope) return;
      this.spaces = spaces;
    } catch {
      if (getAccountScope() !== scope || this.accountScope !== scope) return;
      this.spaces.clear();
      this.loadError = true;
    }
  }

  refreshFromStorage(scope = this.accountScope, { notify = false } = {}) {
    if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; reload before reading" };
    const previous = serializeSpaces(this.spaces, scope);
    try {
      const spaces = parseStoredSpaces(readStorageItem(getAccountStorageKey(STORAGE_KEY, scope)), scope);
      if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; reload before reading" };
      this.spaces = spaces;
      this.loadError = false;
      if (notify && serializeSpaces(spaces, scope) !== previous) {
        this.notify("storage_synced", { accountScope: scope, spaces: [...spaces.values()].map(cloneSpace) });
      }
      return { success: true };
    } catch {
      this.loadError = true;
      return { error: "Space storage could not be read" };
    }
  }

  destroy() {
    this.storageEventTarget?.removeEventListener("storage", this.handleStorageEvent);
    this.unsubscribeAccountScope?.();
    this.listeners.clear();
    this.previews.clear();
  }

  save() {
    return this.persistSpaces(this.spaces, this.accountScope);
  }

  persistSpaces(spaces, scope) {
    if (getAccountScope() !== scope) return { error: "Account scope changed; reload before saving" };
    if (this.loadError) return { error: "Space storage could not be read; try again" };
    try {
      const key = getAccountStorageKey(STORAGE_KEY, scope);
      const serialized = serializeSpaces(spaces, scope);
      if (!serialized) return { error: "Space storage limit reached" };
      // safeStorage intentionally absorbs browser storage exceptions. Verify the
      // round trip here so callers never receive a persisted-success result when
      // the canonical per-account store rejected the write.
      safeStorage.setItem(key, serialized);
      if (safeStorage.getItem(key) !== serialized) return { error: "Space could not be saved" };
      if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; reload before saving" };
      return { success: true };
    } catch {
      return { error: "Space could not be saved" };
    }
  }

  getSpaces() {
    if (getAccountScope() !== this.accountScope) return [];
    // A failed read is retried on demand so the page's retry action can recover
    // after browser storage becomes available again.
    if (this.loadError) this.load(this.accountScope);
    if (this.loadError) throw new Error("Space storage could not be read");
    return [...this.spaces.values()].map(cloneSpace);
  }

  getLayoutPreferences(spaceId) {
    if (typeof spaceId !== "string" || spaceId.length > 100) return { error: "A valid Space ID is required" };
    const refreshed = this.refreshFromStorage(this.accountScope);
    if (refreshed.error) return refreshed;
    const space = this.spaces.get(spaceId);
    if (!space || space.accountScope !== this.accountScope) return { error: "Space not found" };
    return {
      success: true,
      accountScope: this.accountScope,
      spaceId,
      ...cloneSpaceLayoutPreferences(space.layoutPreferences),
    };
  }

  updateLayoutPreferences(request) {
    const safeRequest = readDataRecord(request, ["accountScope", "spaceId", "expectedRevision", "preferences"]);
    if (safeRequest.error) return safeRequest;
    const { accountScope, spaceId, expectedRevision } = safeRequest.value;
    const scope = this.accountScope;
    if (scope === "anonymous" || getAccountScope() === "anonymous") return { error: "An account scope is required to update Space preferences" };
    if (typeof accountScope !== "string" || accountScope !== scope || accountScope !== getAccountScope()) {
      return { error: "Account scope mismatch" };
    }
    if (typeof spaceId !== "string" || spaceId.length > 100) return { error: "A valid Space ID is required" };
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return { error: "A valid expected revision is required" };
    const patch = normalizeSpaceLayoutPreferencePatch(safeRequest.value.preferences);
    if (patch.error) return patch;
    const writeLockKey = JSON.stringify([scope, spaceId]);
    if (activeSpaceWrites.has(writeLockKey)) return { error: "A Space update is already in progress", code: "write_in_progress" };

    activeSpaceWrites.add(writeLockKey);
    try {
      const refreshed = this.refreshFromStorage(scope, { notify: true });
      if (refreshed.error) return refreshed;
      if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; retry the update" };
      const currentSpace = this.spaces.get(spaceId);
      if (!currentSpace || currentSpace.accountScope !== scope) return { error: "Space not found" };
      const current = currentSpace.layoutPreferences;
      if (current.revision !== expectedRevision) {
        return {
          error: "Space layout preferences changed; reload before updating",
          code: "stale_revision",
          current: { accountScope: scope, spaceId, ...cloneSpaceLayoutPreferences(current) },
        };
      }
      if (current.revision === Number.MAX_SAFE_INTEGER) return { error: "Space layout preference revision limit reached" };
      if (Object.hasOwn(patch.value, "toolIds")) {
        const existingToolIds = new Set(current.toolIds);
        const unregistered = patch.value.toolIds.find((name) => !existingToolIds.has(name) && !isCanonicalToolRegistered(name));
        if (unregistered) return { error: "Tool is not registered in the canonical registry", code: "tool_not_registered" };
      }

      const updatedPreferences = { ...cloneSpaceLayoutPreferences(current), ...patch.value, revision: current.revision + 1 };
      const updatedSpace = { ...currentSpace, layoutPreferences: updatedPreferences };
      const nextSpaces = new Map(this.spaces);
      nextSpaces.set(spaceId, updatedSpace);
      const serialized = serializeSpaces(nextSpaces, scope);
      if (!serialized) return { error: "Space storage limit reached" };
      try {
        const key = getAccountStorageKey(STORAGE_KEY, scope);
        safeStorage.setItem(key, serialized);
        if (safeStorage.getItem(key) !== serialized) return { error: "Space preferences could not be saved", code: "write_failed" };
      } catch {
        return { error: "Space preferences could not be saved", code: "write_failed" };
      }

      if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; retry the update" };
      this.spaces = nextSpaces;
      const result = { success: true, accountScope: scope, spaceId, ...cloneSpaceLayoutPreferences(updatedPreferences) };
      this.notify("layout_preferences_updated", result);
      publish("spaces.layout_preferences_updated", result);
      if (Object.hasOwn(patch.value, "toolIds")) {
        this.notify("tool_membership_updated", result);
        publish("spaces.tool_membership_updated", result);
      }
      return result;
    } finally {
      activeSpaceWrites.delete(writeLockKey);
    }
  }

  setToolMembership(request) {
    const safeRequest = readDataRecord(request, ["accountScope", "spaceId", "toolName", "member", "expectedRevision"]);
    if (safeRequest.error) return safeRequest;
    const { accountScope, spaceId, toolName, member, expectedRevision } = safeRequest.value;
    const scope = this.accountScope;
    if (scope === "anonymous" || getAccountScope() === "anonymous") return { error: "An account scope is required to update Space tool membership" };
    if (typeof accountScope !== "string" || accountScope !== scope || accountScope !== getAccountScope()) return { error: "Account scope mismatch" };
    if (typeof spaceId !== "string" || spaceId.length > 100) return { error: "A valid Space ID is required" };
    if (!isSafeSpaceToolName(toolName)) {
      return { error: "A valid canonical tool name is required" };
    }
    if (typeof member !== "boolean") return { error: "Tool membership must be explicitly enabled or disabled" };
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return { error: "A valid expected revision is required" };
    if (member && !isCanonicalToolRegistered(toolName)) return { error: "Tool is not registered in the canonical registry", code: "tool_not_registered" };

    const current = this.getLayoutPreferences(spaceId);
    if (current.error) return current;
    if (current.revision !== expectedRevision) {
      return {
        error: "Space layout preferences changed; reload before updating",
        code: "stale_revision",
        current,
      };
    }
    const toolIds = new Set(current.toolIds);
    if (member === toolIds.has(toolName)) return { ...current, changed: false };
    if (member) {
      if (toolIds.size >= SPACE_CREATION_LIMITS.maxToolsPerSpace) return { error: "Space tool limit reached", code: "space_tool_limit" };
      toolIds.add(toolName);
    } else toolIds.delete(toolName);

    const updated = this.updateLayoutPreferences({
      accountScope,
      spaceId,
      expectedRevision,
      preferences: { toolIds: [...toolIds] },
    });
    return updated.success ? { ...updated, changed: true } : updated;
  }

  updateDetails(request) {
    const safeRequest = readDataRecord(request, ["accountScope", "spaceId", "expectedRevision", "name", "description"]);
    if (safeRequest.error) return safeRequest;
    const { accountScope, spaceId, expectedRevision } = safeRequest.value;
    const scope = this.accountScope;
    if (scope === "anonymous" || getAccountScope() === "anonymous") return { error: "An account scope is required to edit a Space" };
    if (typeof accountScope !== "string" || accountScope !== scope || accountScope !== getAccountScope()) return { error: "Account scope mismatch" };
    if (typeof spaceId !== "string" || spaceId.length > 100) return { error: "A valid Space ID is required" };
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return { error: "A valid details revision is required" };
    if (!Object.hasOwn(safeRequest.value, "name") && !Object.hasOwn(safeRequest.value, "description")) return { error: "Provide a Space name or description to update" };

    let name;
    if (Object.hasOwn(safeRequest.value, "name")) {
      name = safeRequest.value.name;
      if (typeof name !== "string") return { error: "Space name must be text" };
      name = name.trim();
      if (!name || name.length > SPACE_CREATION_LIMITS.maxNameLength || containsControlChars(name) || !SPACE_NAME.test(name)) {
        return { error: `Space name must be 1–${SPACE_CREATION_LIMITS.maxNameLength} safe characters` };
      }
    }
    let description;
    if (Object.hasOwn(safeRequest.value, "description")) {
      description = safeRequest.value.description;
      if (typeof description !== "string" || description.length > SPACE_CREATION_LIMITS.maxDescriptionLength || containsControlChars(description)) {
        return { error: `Space description must be at most ${SPACE_CREATION_LIMITS.maxDescriptionLength} safe characters` };
      }
      description = description.trim();
    }

    const writeLockKey = JSON.stringify([scope, spaceId]);
    if (activeSpaceWrites.has(writeLockKey)) return { error: "A Space update is already in progress", code: "write_in_progress" };
    activeSpaceWrites.add(writeLockKey);
    try {
      const refreshed = this.refreshFromStorage(scope, { notify: true });
      if (refreshed.error) return refreshed;
      if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; retry the update" };
      const current = this.spaces.get(spaceId);
      if (!current || current.accountScope !== scope) return { error: "Space not found" };
      if (current.detailsRevision !== expectedRevision) {
        return {
          error: "Space details changed; reload before updating",
          code: "stale_revision",
          current: { accountScope: scope, spaceId, detailsRevision: current.detailsRevision, name: current.name, description: current.description },
        };
      }
      if (current.detailsRevision === Number.MAX_SAFE_INTEGER) return { error: "Space details revision limit reached" };

      const updated = {
        ...current,
        ...(name === undefined ? {} : { name }),
        ...(description === undefined ? {} : { description }),
        detailsRevision: current.detailsRevision + 1,
      };
      const nextSpaces = new Map(this.spaces);
      nextSpaces.set(spaceId, updated);
      const saved = this.persistSpaces(nextSpaces, scope);
      if (saved.error) return { ...saved, code: saved.error === "Space storage limit reached" ? "storage_limit" : "write_failed" };
      if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; reload before updating" };

      this.spaces = nextSpaces;
      const result = { success: true, accountScope: scope, spaceId, detailsRevision: updated.detailsRevision, name: updated.name, description: updated.description };
      this.notify("space_updated", result);
      publish("spaces.private_space_updated", result);
      return result;
    } finally {
      activeSpaceWrites.delete(writeLockKey);
    }
  }

  previewNaturalLanguageRequest(request) {
    const safeRequest = readDataRecord(request, ["prompt", "templateId"]);
    if (safeRequest.error) return safeRequest;
    if (this.accountScope === "anonymous") return { error: "An account scope is required to create a Space" };
    if (getAccountScope() !== this.accountScope) return { error: "Account scope changed; retry the request" };
    if (this.loadError) return { error: "Space storage could not be read; try again" };
    const templateId = safeRequest.value.templateId === undefined ? "empty" : safeRequest.value.templateId;
    if (typeof templateId !== "string" || !Object.hasOwn(SPACE_STARTERS, templateId)) return { error: "Choose a supported Space starting point" };
    const parsed = parseSpacePrompt(safeRequest.value.prompt);
    if (parsed.error) return parsed;
    if (this.spaces.size >= SPACE_CREATION_LIMITS.maxSpacesPerAccount) return { error: "Space limit reached" };

    const previewId = createId();
    const expiresAt = Date.now() + SPACE_CREATION_LIMITS.previewLifetimeMs;
    const preview = {
      previewId,
      contractVersion: SPACE_CREATION_CONTRACT_VERSION,
      accountScope: this.accountScope,
      expiresAt: new Date(expiresAt).toISOString(),
      action: "create_private_space",
      space: { ...parsed.value, description: SPACE_STARTERS[templateId].description, templateId, visibility: "private", sharing: "off" },
      template: { id: templateId, label: SPACE_STARTERS[templateId].label },
      effects: [`Create one private Space from the ${SPACE_STARTERS[templateId].label.toLocaleLowerCase()}`],
      permissionsChanged: false,
      requiresConfirmation: true,
    };
    this.previews.set(previewId, { accountScope: this.accountScope, expiresAt, name: parsed.value.name, templateId });
    return preview;
  }

  confirmNaturalLanguagePreview(request) {
    const safeRequest = readDataRecord(request, ["previewId", "confirm"]);
    if (safeRequest.error) return safeRequest;
    const { previewId, confirm } = safeRequest.value;
    if (typeof previewId !== "string" || previewId.length > 100) return { error: "A valid preview ID is required" };
    if (confirm !== true) return { error: "Explicit confirmation is required" };
    if (this.accountScope === "anonymous") return { error: "An account scope is required to create a Space" };
    if (getAccountScope() !== this.accountScope) {
      this.previews.clear();
      return { error: "Account scope changed; preview is no longer valid" };
    }
    if (this.loadError) return { error: "Space storage could not be read; try again" };
    const pending = this.previews.get(previewId);
    if (!pending) return { error: "Preview not found or already used" };
    if (pending.accountScope !== this.accountScope) {
      this.previews.delete(previewId);
      return { error: "Preview belongs to a different account" };
    }
    if (Date.now() > pending.expiresAt) {
      this.previews.delete(previewId);
      return { error: "Preview expired; create a new preview" };
    }
    const refreshed = this.refreshFromStorage(this.accountScope);
    if (refreshed.error) return { error: "Space storage could not be read; try again" };
    if (this.spaces.size >= SPACE_CREATION_LIMITS.maxSpacesPerAccount) {
      this.previews.delete(previewId);
      return { error: "Space limit reached" };
    }

    // Consume before mutating or calling storage. Storage implementations can
    // synchronously re-enter application code, so deletion after save would
    // permit the same explicit confirmation to create a second Space.
    this.previews.delete(previewId);

    const space = {
      id: createId(),
      accountScope: this.accountScope,
      name: pending.name,
      description: SPACE_STARTERS[pending.templateId || "empty"].description,
      templateId: pending.templateId || "empty",
      detailsRevision: 0,
      visibility: "private",
      sharing: "off",
      createdAt: new Date().toISOString(),
      layoutPreferences: createDefaultSpaceLayoutPreferences(),
    };
    this.spaces.set(space.id, space);
    const saved = this.save();
    if (saved.error) {
      if (this.accountScope === space.accountScope) this.spaces.delete(space.id);
      return saved;
    }
    const result = cloneSpace(space);
    this.notify("space_created", result);
    publish("spaces.private_space_created", result);
    recordAudit({ action: "space.private_created", status: "completed", metadata: { spaceId: space.id, accountScope: this.accountScope } });
    return { success: true, space: result, permissionsChanged: false };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, value) {
    for (const listener of this.listeners) {
      try { listener(event, value); } catch (error) { console.error("Space creation listener error:", error); }
    }
  }
}

export const spaceCreationEngine = new SpaceCreationEngine();

// Stable UI contract: preview({ prompt }) returns a reviewable, in-memory-only
// preview; confirm({ previewId, confirm: true }) applies that preview exactly once.
export function previewNaturalLanguageSpaceCreation(request) {
  return spaceCreationEngine.previewNaturalLanguageRequest(request);
}

export function confirmNaturalLanguageSpaceCreation(request) {
  return spaceCreationEngine.confirmNaturalLanguagePreview(request);
}

export function getPrivateSpaces() {
  return spaceCreationEngine.getSpaces();
}

export function getSpaceLayoutPreferences(spaceId) {
  return spaceCreationEngine.getLayoutPreferences(spaceId);
}

/**
 * Backend contract exposed as HEY.spaces.updateLayoutPreferences(request):
 * { accountScope, spaceId, expectedRevision, preferences: Partial<{favoriteToolIds, widgetIds, shortcutIds}> }.
 * Each category accepts up to 32 unique safe IDs of at most 64 characters. A
 * successful result returns the new revision; stale writes return
 * { code: "stale_revision", current }. Starter choices stay in onboarding.
 */
export function updateSpaceLayoutPreferences(request) {
  return spaceCreationEngine.updateLayoutPreferences(request);
}

/**
 * `HEY.spaces.setToolMembership({ accountScope, spaceId, toolName, member, expectedRevision })`.
 * HEY private Spaces are general-purpose containers. This revision-checked
 * reference membership requires a registered tool when adding; it does not
 * grant permission or imply that the tool can execute in the current context.
 */
export function setSpaceToolMembership(request) {
  return spaceCreationEngine.setToolMembership(request);
}

export function updatePrivateSpaceDetails(request) {
  return spaceCreationEngine.updateDetails(request);
}

export function subscribeToPrivateSpaces(listener) {
  return spaceCreationEngine.subscribe(listener);
}
