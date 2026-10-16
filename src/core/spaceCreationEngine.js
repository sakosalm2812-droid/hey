import { getAccountScope, getAccountStorageKey, subscribeAccountScope } from "./accountScope.js";
import { recordAudit } from "./auditLog.js";
import { publish } from "./eventBus.js";
import { safeStorage } from "../lib/safeStorage.js";
import { getTool } from "./toolRegistry.js";
import { getOnboardingMotivations, rankOnboardingStarterSuggestions } from "./onboardingEngine.js";

export const SPACE_CREATION_CONTRACT_VERSION = 1;
export const SPACE_STORAGE_CONTRACT_VERSION = 5;
export const SPACE_LAYOUT_PREFERENCES_CONTRACT_VERSION = 1;
export const SPACE_CREATION_LIMITS = Object.freeze({
  maxPromptLength: 500,
  maxNameLength: 80,
  maxSpacesPerAccount: 1000,
  maxPreferenceIdsPerCategory: 32,
  maxPreferenceIdLength: 64,
  maxToolsPerSpace: 64,
  maxToolNameLength: 160,
  maxStoredChars: 1_000_000,
  previewLifetimeMs: 5 * 60 * 1000,
});

const STORAGE_KEY = "hey_spaces";
const RECOVERY_STORAGE_KEY = "hey_spaces_recovery";
const SUPPORTED_SPACE_STORAGE_VERSIONS = new Set([1, 2, 3, 4, SPACE_STORAGE_CONTRACT_VERSION]);
const SPACE_LIFECYCLE_STATUSES = new Set(["active", "archived"]);
const SPACE_LAYOUT_PREFERENCE_FIELDS = Object.freeze(["favoriteToolIds", "widgetIds", "shortcutIds", "toolIds"]);
const SPACE_LAYOUT_PREFERENCE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;
const activeSpaceRecordWrites = new Set();
const CREATE_SPACE_PROMPT = /^(?:please\s+)?create\s+(?:a\s+)?(?:private\s+)?space\s+(?:called|named)\s+(.+)$/i;
const FORBIDDEN_INTENT = /\b(?:public|share|shared|sharing|invite|invites|members?|permissions?|access|roles?|admin|administrator|owner|grant|escalat(?:e|ion))\b/i;
const SPACE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._'’()-]{0,79}$/u;
const SPACE_STARTERS = Object.freeze({
  empty: { label: "Empty Space", description: "" },
  planning: { label: "Planning template", description: "Goals, tasks, and next steps." },
  research: { label: "Research template", description: "Questions, sources, and findings." },
  custom: { label: "Custom Space", description: "" },
});
const ONBOARDING_SPACE_STARTERS = Object.freeze({
  personal: Object.freeze({ name: "Personal", templateId: "empty" }),
  work: Object.freeze({ name: "Work", templateId: "planning" }),
  learning: Object.freeze({ name: "Learning", templateId: "research" }),
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
    const templateId = space.templateId === undefined ? "custom" : space.templateId;
    if (typeof templateId !== "string" || !Object.hasOwn(SPACE_STARTERS, templateId)) return null;
    const detailsRevision = space.detailsRevision === undefined ? 0 : space.detailsRevision;
    if (!Number.isSafeInteger(detailsRevision) || detailsRevision < 0) return null;
    const status = space.status === undefined ? "active" : space.status;
    const lifecycleRevision = space.lifecycleRevision === undefined ? 0 : space.lifecycleRevision;
    if (!SPACE_LIFECYCLE_STATUSES.has(status) || !Number.isSafeInteger(lifecycleRevision) || lifecycleRevision < 0) return null;
    const layoutPreferences = space.layoutPreferences === undefined
      ? createDefaultSpaceLayoutPreferences()
      : normalizeSpaceLayoutPreferences(space.layoutPreferences);
    if (!layoutPreferences) return null;
    return {
      id,
      accountScope: scope,
      name: space.name,
      description: typeof space.description === "string" ? space.description.slice(0, 240) : "",
      templateId,
      detailsRevision,
      status,
      lifecycleRevision,
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

function writeRecoverySnapshot(scope, serialized) {
  if (getAccountScope() !== scope) return false;
  const key = getAccountStorageKey(RECOVERY_STORAGE_KEY, scope);
  safeStorage.setItem(key, serialized);
  try {
    if (getAccountScope() === scope && readStorageItem(key) === serialized) return true;
  } catch {
    // Invalidate a stale snapshot when an update cannot be verified.
  }
  if (getAccountScope() !== scope) return false;
  safeStorage.removeItem(key);
  try { return getAccountScope() === scope && readStorageItem(key) == null; } catch { return false; }
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
    this.deletePreviews = new Map();
    this.lifecyclePreviews = new Map();
    this.recoveryPreviews = new Map();
    this.listeners = new Set();
    this.loadError = false;
    this.load(this.accountScope);
    this.unsubscribeAccountScope = subscribeAccountScope(() => {
      this.accountScope = getAccountScope();
      this.previews.clear();
      this.deletePreviews.clear();
      this.lifecyclePreviews.clear();
      this.recoveryPreviews.clear();
      this.load(this.accountScope);
      this.notify("account_scope_changed", { accountScope: this.accountScope });
    });
    this.storageEventTarget = globalThis.window && typeof globalThis.window.addEventListener === "function"
      ? globalThis.window
      : null;
    this.handleStorageEvent = (event) => {
      const scope = this.accountScope;
      if (!event || (event.key !== getAccountStorageKey(STORAGE_KEY, scope) && event.key !== null)) return;
      try {
        if (event.storageArea && globalThis.localStorage && event.storageArea !== globalThis.localStorage) return;
      } catch {
        return;
      }
      const refreshed = this.refreshFromStorage(scope, { notify: true });
      if (refreshed.error && getAccountScope() === scope && this.accountScope === scope) {
        this.spaces.clear();
        this.loadError = true;
        this.notify("storage_sync_error", { accountScope: scope, error: "Space storage could not be read" });
      }
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
      const serialized = serializeSpaces(spaces, scope);
      if (serialized) this.updateRecoverySnapshot(scope, serialized, { notify: false });
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
      if (getAccountScope() === scope && this.accountScope === scope) {
        this.spaces.clear();
        this.loadError = true;
      }
      return { error: "Space storage could not be read" };
    }
  }

  destroy() {
    this.storageEventTarget?.removeEventListener("storage", this.handleStorageEvent);
    this.unsubscribeAccountScope?.();
    this.listeners.clear();
    this.previews.clear();
    this.deletePreviews.clear();
    this.lifecyclePreviews.clear();
    this.recoveryPreviews.clear();
  }

  updateRecoverySnapshot(scope, serialized, { notify = true } = {}) {
    const saved = writeRecoverySnapshot(scope, serialized);
    if (!saved && notify && getAccountScope() === scope && this.accountScope === scope) {
      this.notify("storage_recovery_snapshot_error", { accountScope: scope, error: "Space recovery snapshot could not be updated" });
    }
    return saved;
  }

  previewRecovery(request) {
    const safeRequest = readDataRecord(request, ["accountScope"]);
    if (safeRequest.error) return safeRequest;
    const scope = this.accountScope;
    if (scope === "anonymous" || getAccountScope() === "anonymous") return { error: "An account scope is required to recover Spaces" };
    if (safeRequest.value.accountScope !== scope || getAccountScope() !== scope) return { error: "Account scope mismatch" };
    let primarySnapshot;
    try {
      primarySnapshot = readStorageItem(getAccountStorageKey(STORAGE_KEY, scope));
      const readableSpaces = parseStoredSpaces(primarySnapshot, scope);
      if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; retry recovery" };
      this.spaces = readableSpaces;
      this.loadError = false;
      return { error: "Space storage is readable; recovery is not needed" };
    } catch {
      this.loadError = true;
    }
    if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; retry recovery" };
    let recoverySnapshot;
    let spaces;
    try {
      recoverySnapshot = readStorageItem(getAccountStorageKey(RECOVERY_STORAGE_KEY, scope));
      spaces = parseStoredSpaces(recoverySnapshot, scope);
    } catch {
      return { error: "A valid Space recovery snapshot is unavailable" };
    }
    if (recoverySnapshot == null) return { error: "A valid Space recovery snapshot is unavailable" };
    const previewId = createId();
    const expiresAt = Date.now() + SPACE_CREATION_LIMITS.previewLifetimeMs;
    this.recoveryPreviews.set(previewId, { accountScope: scope, primarySnapshot, recoverySnapshot, expiresAt });
    return {
      previewId,
      accountScope: scope,
      expiresAt: new Date(expiresAt).toISOString(),
      action: "restore_private_spaces_from_recovery_snapshot",
      spaceCount: spaces.size,
      spaces: [...spaces.values()].map((space) => ({ id: space.id, name: space.name, status: space.status })),
      effects: ["Replace unreadable private Space data with the last valid account-scoped snapshot"],
      permissionsChanged: false,
      requiresConfirmation: true,
    };
  }

  confirmRecovery(request) {
    const safeRequest = readDataRecord(request, ["previewId", "confirm"]);
    if (safeRequest.error) return safeRequest;
    const { previewId, confirm } = safeRequest.value;
    const scope = this.accountScope;
    if (typeof previewId !== "string" || previewId.length === 0 || previewId.length > 100) return { error: "A valid Space recovery preview ID is required" };
    if (confirm !== true) return { error: "Explicit confirmation is required" };
    if (scope === "anonymous" || getAccountScope() === "anonymous") return { error: "An account scope is required to recover Spaces" };
    if (getAccountScope() !== scope) {
      this.recoveryPreviews.clear();
      return { error: "Account scope changed; recovery preview is no longer valid" };
    }
    const pending = this.recoveryPreviews.get(previewId);
    if (!pending || pending.accountScope !== scope) return { error: "Space recovery preview not found or already used" };
    if (Date.now() > pending.expiresAt) {
      this.recoveryPreviews.delete(previewId);
      return { error: "Space recovery preview expired; review recovery again" };
    }
    this.recoveryPreviews.delete(previewId);
    try {
      const primaryKey = getAccountStorageKey(STORAGE_KEY, scope);
      const currentPrimary = readStorageItem(primaryKey);
      try {
        const readableSpaces = parseStoredSpaces(currentPrimary, scope);
        if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; recovery preview is no longer valid" };
        this.spaces = readableSpaces;
        this.loadError = false;
        return { error: "Space storage is readable; recovery is no longer needed" };
      } catch {
        if (currentPrimary !== pending.primarySnapshot) return { error: "Space storage changed after recovery review; review recovery again", code: "stale_snapshot" };
      }
      if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; recovery preview is no longer valid" };
      const recoveryKey = getAccountStorageKey(RECOVERY_STORAGE_KEY, scope);
      if (readStorageItem(recoveryKey) !== pending.recoverySnapshot) return { error: "Space recovery snapshot changed after review; review recovery again", code: "stale_snapshot" };
      const restored = parseStoredSpaces(pending.recoverySnapshot, scope);
      safeStorage.setItem(primaryKey, pending.recoverySnapshot);
      if (readStorageItem(primaryKey) !== pending.recoverySnapshot) return { error: "Space recovery could not be saved", code: "write_failed" };
      if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; reload before recovering" };
      this.spaces = restored;
      this.loadError = false;
      const result = { success: true, accountScope: scope, spaceCount: restored.size, permissionsChanged: false };
      this.notify("spaces_recovered", result);
      publish("spaces.private_spaces_recovered", result);
      recordAudit({ action: "space.private_recovery_confirmed", status: "completed", metadata: { accountScope: scope, spaceCount: restored.size } });
      return result;
    } catch {
      return { error: "Space recovery could not be completed", code: "write_failed" };
    }
  }

  save() {
    const scope = this.accountScope;
    if (getAccountScope() !== scope) return { error: "Account scope changed; reload before saving" };
    if (this.loadError) return { error: "Space storage could not be read; try again" };
    try {
      const key = getAccountStorageKey(STORAGE_KEY, scope);
      const serialized = serializeSpaces(this.spaces, scope);
      if (!serialized) return { error: "Space storage limit reached" };
      // safeStorage intentionally absorbs browser storage exceptions. Verify the
      // round trip here so callers never receive a persisted-success result when
      // the canonical per-account store rejected the write.
      safeStorage.setItem(key, serialized);
      if (safeStorage.getItem(key) !== serialized) return { error: "Space could not be saved" };
      if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; reload before saving" };
      this.updateRecoverySnapshot(scope, serialized);
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

  getOnboardingSuggestions() {
    const scope = this.accountScope;
    if (scope === "anonymous" || getAccountScope() !== scope) return { error: "An active account is required for Space suggestions" };
    return {
      accountScope: scope,
      motivationSelections: getOnboardingMotivations(),
      suggestions: rankOnboardingStarterSuggestions().map(({ id, label, score }) => {
        const starter = ONBOARDING_SPACE_STARTERS[id];
        return {
          id,
          label,
          score,
          templateId: starter.templateId,
          previewRequest: {
            accountScope: scope,
            prompt: `Create a private Space called ${starter.name}`,
            templateId: starter.templateId,
          },
          permissionsChanged: false,
          requiresConfirmation: true,
        };
      }),
    };
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

  updateDetails(request) {
    const safeRequest = readDataRecord(request, ["accountScope", "spaceId", "expectedRevision", "name", "description"]);
    if (safeRequest.error) return safeRequest;
    const input = safeRequest.value;
    const { accountScope, spaceId, expectedRevision } = input;
    const scope = this.accountScope;
    if (scope === "anonymous" || getAccountScope() === "anonymous") return { error: "An account scope is required to update Space details" };
    if (typeof accountScope !== "string" || accountScope !== scope || accountScope !== getAccountScope()) return { error: "Account scope mismatch" };
    if (typeof spaceId !== "string" || spaceId.length === 0 || spaceId.length > 100) return { error: "A valid Space ID is required" };
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return { error: "A valid Space details revision is required" };
    if (!Object.hasOwn(input, "name") && !Object.hasOwn(input, "description")) return { error: "At least one Space detail is required" };
    if (Object.hasOwn(input, "name") && (typeof input.name !== "string" || input.name.trim() !== input.name || input.name.length > SPACE_CREATION_LIMITS.maxNameLength || containsControlChars(input.name) || !SPACE_NAME.test(input.name))) {
      return { error: `Space name must be 1–${SPACE_CREATION_LIMITS.maxNameLength} safe characters` };
    }
    if (Object.hasOwn(input, "description") && (typeof input.description !== "string" || input.description.length > 240 || containsControlChars(input.description))) {
      return { error: "Space description must be at most 240 characters and contain no control characters" };
    }

    const writeLockKey = JSON.stringify([scope, spaceId]);
    if (activeSpaceRecordWrites.has(writeLockKey)) return { error: "A Space update is already in progress", code: "write_in_progress" };
    activeSpaceRecordWrites.add(writeLockKey);
    try {
      const refreshed = this.refreshFromStorage(scope, { notify: true });
      if (refreshed.error) return refreshed;
      if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; retry the update" };
      const currentSpace = this.spaces.get(spaceId);
      if (!currentSpace || currentSpace.accountScope !== scope) return { error: "Space not found" };
      const current = { accountScope: scope, spaceId, revision: currentSpace.detailsRevision, name: currentSpace.name, description: currentSpace.description };
      if (current.revision !== expectedRevision) {
        return { error: "Space details changed; review the latest details before updating", code: "stale_revision", current };
      }
      if (current.revision === Number.MAX_SAFE_INTEGER) return { error: "Space details revision limit reached" };

      const name = Object.hasOwn(input, "name") ? input.name : currentSpace.name;
      const description = Object.hasOwn(input, "description") ? input.description : currentSpace.description;
      if (name === currentSpace.name && description === currentSpace.description) return { success: true, ...current, changed: false };
      const updatedSpace = { ...currentSpace, name, description, detailsRevision: current.revision + 1 };
      const nextSpaces = new Map(this.spaces);
      nextSpaces.set(spaceId, updatedSpace);
      const serialized = serializeSpaces(nextSpaces, scope);
      if (!serialized) return { error: "Space storage limit reached", code: "write_failed" };
      try {
        const key = getAccountStorageKey(STORAGE_KEY, scope);
        safeStorage.setItem(key, serialized);
        if (safeStorage.getItem(key) !== serialized) return { error: "Space details could not be saved", code: "write_failed" };
      } catch {
        return { error: "Space details could not be saved", code: "write_failed" };
      }
      this.updateRecoverySnapshot(scope, serialized);
      if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; reload before retrying" };
      this.spaces = nextSpaces;
      const result = { success: true, accountScope: scope, spaceId, revision: updatedSpace.detailsRevision, name, description, changed: true };
      this.notify("space_details_updated", result);
      publish("spaces.private_space_details_updated", result);
      recordAudit({ action: "space.private_details_updated", status: "completed", metadata: { spaceId, accountScope: scope } });
      return result;
    } finally {
      activeSpaceRecordWrites.delete(writeLockKey);
    }
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
    if (activeSpaceRecordWrites.has(writeLockKey)) return { error: "A Space preference update is already in progress", code: "write_in_progress" };

    activeSpaceRecordWrites.add(writeLockKey);
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

      this.updateRecoverySnapshot(scope, serialized);

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
      activeSpaceRecordWrites.delete(writeLockKey);
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

  previewDeleteSpace(request) {
    const safeRequest = readDataRecord(request, ["accountScope", "spaceId", "expectedLayoutRevision"]);
    if (safeRequest.error) return safeRequest;
    const { accountScope, spaceId, expectedLayoutRevision } = safeRequest.value;
    const scope = this.accountScope;
    if (scope === "anonymous" || getAccountScope() === "anonymous") return { error: "An account scope is required to delete a Space" };
    if (typeof accountScope !== "string" || accountScope !== scope || accountScope !== getAccountScope()) return { error: "Account scope mismatch" };
    if (typeof spaceId !== "string" || spaceId.length > 100) return { error: "A valid Space ID is required" };
    if (!Number.isSafeInteger(expectedLayoutRevision) || expectedLayoutRevision < 0) return { error: "A valid Space layout revision is required" };
    const refreshed = this.refreshFromStorage(scope, { notify: true });
    if (refreshed.error) return refreshed;
    if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; retry the request" };
    const space = this.spaces.get(spaceId);
    if (!space || space.accountScope !== scope) return { error: "Space not found" };
    if (space.layoutPreferences.revision !== expectedLayoutRevision) {
      return { error: "Space layout changed; reload before reviewing deletion", code: "stale_revision", current: cloneSpace(space) };
    }
    const previewId = createId();
    const expiresAt = Date.now() + SPACE_CREATION_LIMITS.previewLifetimeMs;
    this.deletePreviews.set(previewId, { accountScope: scope, spaceId, snapshot: JSON.stringify(space), expiresAt });
    return {
      previewId,
      accountScope: scope,
      expiresAt: new Date(expiresAt).toISOString(),
      action: "delete_private_space",
      space: cloneSpace(space),
      effects: [`Permanently delete the private Space “${space.name}” and its saved layout and tool selections`],
      permissionsChanged: false,
      requiresConfirmation: true,
    };
  }

  confirmDeleteSpace(request) {
    const safeRequest = readDataRecord(request, ["previewId", "confirm"]);
    if (safeRequest.error) return safeRequest;
    const { previewId, confirm } = safeRequest.value;
    const scope = this.accountScope;
    if (typeof previewId !== "string" || previewId.length > 100) return { error: "A valid deletion preview ID is required" };
    if (confirm !== true) return { error: "Explicit confirmation is required" };
    if (scope === "anonymous" || getAccountScope() === "anonymous") return { error: "An account scope is required to delete a Space" };
    if (getAccountScope() !== scope) {
      this.deletePreviews.clear();
      return { error: "Account scope changed; deletion preview is no longer valid" };
    }
    const pending = this.deletePreviews.get(previewId);
    if (!pending || pending.accountScope !== scope) return { error: "Deletion preview not found or already used" };
    if (Date.now() > pending.expiresAt) {
      this.deletePreviews.delete(previewId);
      return { error: "Deletion preview expired; review deletion again" };
    }
    const writeLockKey = JSON.stringify([scope, pending.spaceId]);
    if (activeSpaceRecordWrites.has(writeLockKey)) return { error: "A Space update is already in progress", code: "write_in_progress" };
    activeSpaceRecordWrites.add(writeLockKey);
    try {
      const refreshed = this.refreshFromStorage(scope, { notify: true });
      if (refreshed.error) return refreshed;
      if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; deletion preview is no longer valid" };
      const current = this.spaces.get(pending.spaceId);
      if (!current || current.accountScope !== scope) {
        this.deletePreviews.delete(previewId);
        return { error: "Space no longer exists" };
      }
      if (JSON.stringify(current) !== pending.snapshot) {
        this.deletePreviews.delete(previewId);
        return { error: "Space changed after deletion review; review the latest version", code: "stale_revision", current: cloneSpace(current) };
      }
      // Consume before writing so reentrant storage cannot apply this confirmation twice.
      this.deletePreviews.delete(previewId);
      const nextSpaces = new Map(this.spaces);
      nextSpaces.delete(pending.spaceId);
      const serialized = serializeSpaces(nextSpaces, scope);
      if (!serialized) return { error: "Space could not be deleted", code: "write_failed" };
      try {
        const key = getAccountStorageKey(STORAGE_KEY, scope);
        safeStorage.setItem(key, serialized);
        if (safeStorage.getItem(key) !== serialized) return { error: "Space could not be deleted", code: "write_failed" };
      } catch {
        return { error: "Space could not be deleted", code: "write_failed" };
      }
      this.updateRecoverySnapshot(scope, serialized);
      if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; reload before deleting" };
      this.spaces = nextSpaces;
      const result = { success: true, accountScope: scope, spaceId: pending.spaceId, permissionsChanged: false };
      this.notify("space_deleted", result);
      publish("spaces.private_space_deleted", result);
      recordAudit({ action: "space.private_deleted", status: "completed", metadata: { spaceId: pending.spaceId, accountScope: scope } });
      return result;
    } finally {
      activeSpaceRecordWrites.delete(writeLockKey);
    }
  }

  previewArchiveSpace(request) {
    return this.previewLifecycleSpace(request, "archived");
  }

  previewRestoreSpace(request) {
    return this.previewLifecycleSpace(request, "active");
  }

  previewLifecycleSpace(request, targetStatus) {
    const safeRequest = readDataRecord(request, ["accountScope", "spaceId", "expectedLifecycleRevision"]);
    if (safeRequest.error) return safeRequest;
    const { accountScope, spaceId, expectedLifecycleRevision } = safeRequest.value;
    const scope = this.accountScope;
    if (scope === "anonymous" || getAccountScope() === "anonymous") return { error: "An account scope is required to change Space lifecycle" };
    if (typeof accountScope !== "string" || accountScope !== scope || accountScope !== getAccountScope()) return { error: "Account scope mismatch" };
    if (typeof spaceId !== "string" || spaceId.length === 0 || spaceId.length > 100) return { error: "A valid Space ID is required" };
    if (!Number.isSafeInteger(expectedLifecycleRevision) || expectedLifecycleRevision < 0) return { error: "A valid Space lifecycle revision is required" };
    const refreshed = this.refreshFromStorage(scope, { notify: true });
    if (refreshed.error) return refreshed;
    if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; retry the request" };
    const space = this.spaces.get(spaceId);
    if (!space || space.accountScope !== scope) return { error: "Space not found" };
    const expectedStatus = targetStatus === "archived" ? "active" : "archived";
    if (space.status !== expectedStatus) return { error: targetStatus === "archived" ? "Space is already archived" : "Space is not archived" };
    if (space.lifecycleRevision !== expectedLifecycleRevision) {
      return { error: "Space lifecycle changed; reload before reviewing", code: "stale_revision", current: cloneSpace(space) };
    }
    if (space.lifecycleRevision === Number.MAX_SAFE_INTEGER) return { error: "Space lifecycle revision limit reached" };
    const previewId = createId();
    const expiresAt = Date.now() + SPACE_CREATION_LIMITS.previewLifetimeMs;
    this.lifecyclePreviews.set(previewId, {
      accountScope: scope,
      spaceId,
      targetStatus,
      snapshot: JSON.stringify(space),
      expiresAt,
    });
    const isArchive = targetStatus === "archived";
    return {
      previewId,
      accountScope: scope,
      expiresAt: new Date(expiresAt).toISOString(),
      action: isArchive ? "archive_private_space" : "restore_private_space",
      space: cloneSpace(space),
      effects: [isArchive
        ? `Mark “${space.name}” as archived and keep its private saved data available for restoration`
        : `Restore “${space.name}” to active status while keeping its saved data private`],
      permissionsChanged: false,
      requiresConfirmation: true,
    };
  }

  confirmArchiveSpace(request) {
    return this.confirmLifecycleSpace(request, "archived");
  }

  confirmRestoreSpace(request) {
    return this.confirmLifecycleSpace(request, "active");
  }

  confirmLifecycleSpace(request, targetStatus) {
    const safeRequest = readDataRecord(request, ["previewId", "confirm"]);
    if (safeRequest.error) return safeRequest;
    const { previewId, confirm } = safeRequest.value;
    const scope = this.accountScope;
    if (typeof previewId !== "string" || previewId.length === 0 || previewId.length > 100) return { error: "A valid Space lifecycle preview ID is required" };
    if (confirm !== true) return { error: "Explicit confirmation is required" };
    if (scope === "anonymous" || getAccountScope() === "anonymous") return { error: "An account scope is required to change Space lifecycle" };
    if (getAccountScope() !== scope) {
      this.lifecyclePreviews.clear();
      return { error: "Account scope changed; lifecycle preview is no longer valid" };
    }
    const pending = this.lifecyclePreviews.get(previewId);
    if (!pending || pending.accountScope !== scope || pending.targetStatus !== targetStatus) return { error: "Space lifecycle preview not found or already used" };
    if (Date.now() > pending.expiresAt) {
      this.lifecyclePreviews.delete(previewId);
      return { error: "Space lifecycle preview expired; review the change again" };
    }
    const writeLockKey = JSON.stringify([scope, pending.spaceId]);
    if (activeSpaceRecordWrites.has(writeLockKey)) return { error: "A Space update is already in progress", code: "write_in_progress" };
    activeSpaceRecordWrites.add(writeLockKey);
    try {
      const refreshed = this.refreshFromStorage(scope, { notify: true });
      if (refreshed.error) return refreshed;
      if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; lifecycle preview is no longer valid" };
      const current = this.spaces.get(pending.spaceId);
      if (!current || current.accountScope !== scope) {
        this.lifecyclePreviews.delete(previewId);
        return { error: "Space no longer exists" };
      }
      if (JSON.stringify(current) !== pending.snapshot) {
        this.lifecyclePreviews.delete(previewId);
        return { error: "Space changed after lifecycle review; review the latest version", code: "stale_revision", current: cloneSpace(current) };
      }
      this.lifecyclePreviews.delete(previewId);
      const nextSpaces = new Map(this.spaces);
      const updated = { ...current, status: targetStatus, lifecycleRevision: current.lifecycleRevision + 1 };
      nextSpaces.set(pending.spaceId, updated);
      const serialized = serializeSpaces(nextSpaces, scope);
      if (!serialized) return { error: "Space lifecycle change could not be saved", code: "write_failed" };
      try {
        const key = getAccountStorageKey(STORAGE_KEY, scope);
        safeStorage.setItem(key, serialized);
        if (safeStorage.getItem(key) !== serialized) return { error: "Space lifecycle change could not be saved", code: "write_failed" };
      } catch {
        return { error: "Space lifecycle change could not be saved", code: "write_failed" };
      }
      this.updateRecoverySnapshot(scope, serialized);
      if (getAccountScope() !== scope || this.accountScope !== scope) return { error: "Account scope changed; reload before retrying" };
      this.spaces = nextSpaces;
      const result = { success: true, accountScope: scope, spaceId: pending.spaceId, status: targetStatus, revision: updated.lifecycleRevision, permissionsChanged: false };
      const action = targetStatus === "archived" ? "archived" : "restored";
      this.notify(`space_${action}`, result);
      publish(`spaces.private_space_${action}`, result);
      recordAudit({ action: `space.private_${action}`, status: "completed", metadata: { spaceId: pending.spaceId, accountScope: scope } });
      return result;
    } finally {
      activeSpaceRecordWrites.delete(writeLockKey);
    }
  }

  previewNaturalLanguageRequest(request) {
    const safeRequest = readDataRecord(request, ["accountScope", "prompt", "templateId"]);
    if (safeRequest.error) return safeRequest;
    if (this.accountScope === "anonymous") return { error: "An account scope is required to create a Space" };
    if (getAccountScope() !== this.accountScope) return { error: "Account scope changed; retry the request" };
    if (safeRequest.value.accountScope !== undefined && safeRequest.value.accountScope !== this.accountScope) return { error: "Account scope changed; refresh Space suggestions before continuing" };
    if (this.loadError) return { error: "Space storage could not be read; try again" };
    const parsed = parseSpacePrompt(safeRequest.value.prompt);
    if (parsed.error) return parsed;
    if (this.spaces.size >= SPACE_CREATION_LIMITS.maxSpacesPerAccount) return { error: "Space limit reached" };
    const templateId = safeRequest.value.templateId === undefined ? "empty" : safeRequest.value.templateId;
    if (typeof templateId !== "string" || !Object.hasOwn(SPACE_STARTERS, templateId)) return { error: "Choose a supported Space starting point" };

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
      status: "active",
      lifecycleRevision: 0,
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

/** Previews restoration from the last valid account-scoped Space snapshot. */
export function previewPrivateSpaceRecovery(request) {
  return spaceCreationEngine.previewRecovery(request);
}

/** Restores a reviewed recovery snapshot exactly once. */
export function confirmPrivateSpaceRecovery(request) {
  return spaceCreationEngine.confirmRecovery(request);
}

/** Updates a private Space's name or description with its expected details revision. */
export function updatePrivateSpaceDetails(request) {
  return spaceCreationEngine.updateDetails(request);
}

/** Lifecycle previews are account-scoped, revision-bound, and require explicit confirmation. */
export function previewPrivateSpaceArchive(request) {
  return spaceCreationEngine.previewArchiveSpace(request);
}

export function confirmPrivateSpaceArchive(request) {
  return spaceCreationEngine.confirmArchiveSpace(request);
}

export function previewPrivateSpaceRestore(request) {
  return spaceCreationEngine.previewRestoreSpace(request);
}

export function confirmPrivateSpaceRestore(request) {
  return spaceCreationEngine.confirmRestoreSpace(request);
}

export function getOnboardingSpaceSuggestions() {
  return spaceCreationEngine.getOnboardingSuggestions();
}

/** Preview requires accountScope, spaceId, and expectedLayoutRevision. */
export function previewPrivateSpaceDeletion(request) {
  return spaceCreationEngine.previewDeleteSpace(request);
}

/** Confirmation accepts only { previewId, confirm: true } and rechecks persisted state. */
export function confirmPrivateSpaceDeletion(request) {
  return spaceCreationEngine.confirmDeleteSpace(request);
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

export function subscribeToPrivateSpaces(listener) {
  return spaceCreationEngine.subscribe(listener);
}
