import { getAccountScope, getAccountStorageKey, subscribeAccountScope } from "./accountScope.js";
import { recordAudit } from "./auditLog.js";
import { publish } from "./eventBus.js";
import { safeStorage } from "../lib/safeStorage.js";

export const SPACE_CREATION_CONTRACT_VERSION = 1;
export const SPACE_CREATION_LIMITS = Object.freeze({
  maxPromptLength: 500,
  maxNameLength: 80,
  maxSpacesPerAccount: 1000,
  previewLifetimeMs: 5 * 60 * 1000,
});

const STORAGE_KEY = "hey_spaces";
const CREATE_SPACE_PROMPT = /^(?:please\s+)?create\s+(?:a\s+)?(?:private\s+)?space\s+(?:called|named)\s+(.+)$/i;
const FORBIDDEN_INTENT = /\b(?:public|share|shared|sharing|invite|invites|members?|permissions?|access|roles?|admin|administrator|owner|grant|escalat(?:e|ion))\b/i;
const SPACE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._'’()-]{0,79}$/u;

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
    return {
      id,
      accountScope: scope,
      name: space.name,
      description: typeof space.description === "string" ? space.description.slice(0, 240) : "",
      visibility: "private",
      sharing: "off",
      createdAt: typeof space.createdAt === "string" ? space.createdAt.slice(0, 64) : null,
    };
  } catch {
    return null;
  }
}

function cloneSpace(space) {
  return { ...space };
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
    this.load(this.accountScope);
    this.unsubscribeAccountScope = subscribeAccountScope(() => {
      this.accountScope = getAccountScope();
      this.previews.clear();
      this.load(this.accountScope);
      this.notify("account_scope_changed", { accountScope: this.accountScope });
    });
  }

  load(scope = getAccountScope()) {
    this.spaces.clear();
    this.accountScope = scope;
    try {
      const stored = safeStorage.getItem(getAccountStorageKey(STORAGE_KEY, scope));
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (!plainRecord(parsed) || parsed.accountScope !== scope || !plainRecord(parsed.spaces)) return;
      Object.entries(parsed.spaces).slice(0, SPACE_CREATION_LIMITS.maxSpacesPerAccount).forEach(([id, value]) => {
        const clean = cleanStoredSpace(id, value, scope);
        if (clean) this.spaces.set(id, clean);
      });
    } catch {
      this.spaces.clear();
    }
  }

  save() {
    if (getAccountScope() !== this.accountScope) return { error: "Account scope changed; reload before saving" };
    try {
      safeStorage.setItem(getAccountStorageKey(STORAGE_KEY, this.accountScope), JSON.stringify({
        contractVersion: SPACE_CREATION_CONTRACT_VERSION,
        accountScope: this.accountScope,
        spaces: Object.fromEntries(this.spaces),
      }));
      return { success: true };
    } catch {
      return { error: "Space could not be saved" };
    }
  }

  getSpaces() {
    if (getAccountScope() !== this.accountScope) return [];
    return [...this.spaces.values()].map(cloneSpace);
  }

  previewNaturalLanguageRequest(request) {
    const safeRequest = readDataRecord(request, ["prompt"]);
    if (safeRequest.error) return safeRequest;
    if (this.accountScope === "anonymous") return { error: "An account scope is required to create a Space" };
    if (getAccountScope() !== this.accountScope) return { error: "Account scope changed; retry the request" };
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
      space: { ...parsed.value, visibility: "private", sharing: "off" },
      effects: ["Create one private Space in this account"],
      permissionsChanged: false,
      requiresConfirmation: true,
    };
    this.previews.set(previewId, { accountScope: this.accountScope, expiresAt, name: parsed.value.name });
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
    if (this.spaces.size >= SPACE_CREATION_LIMITS.maxSpacesPerAccount) {
      this.previews.delete(previewId);
      return { error: "Space limit reached" };
    }

    const space = {
      id: createId(),
      accountScope: this.accountScope,
      name: pending.name,
      description: "",
      visibility: "private",
      sharing: "off",
      createdAt: new Date().toISOString(),
    };
    this.spaces.set(space.id, space);
    const saved = this.save();
    if (saved.error) {
      this.spaces.delete(space.id);
      this.previews.delete(previewId);
      return saved;
    }
    this.previews.delete(previewId);
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

export function subscribeToPrivateSpaces(listener) {
  return spaceCreationEngine.subscribe(listener);
}
