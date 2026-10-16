import { getSetting, setSetting } from "./settingsRegistry.js";
import { getAccountScope, getAccountStorageKey, subscribeAccountScope } from "./accountScope.js";

const LOCAL_STATES = Object.freeze({
  READY: "ready_local",
  MODEL_MISSING: "model_missing",
  DOWNLOADING: "downloading",
  VALIDATING: "validating",
  LOADING: "loading",
  WARMING: "warming",
  AVAILABLE: "available",
  RESOURCE_LIMITED: "resource_limited",
  UPDATE_AVAILABLE: "update_available",
  FAILED: "failed",
});

const MODEL_TYPES = Object.freeze({
  SPEECH_RECOGNITION: "speech_recognition",
  WAKE_WORD: "wake_word",
  TEXT_TO_SPEECH: "text_to_speech",
  LLM: "llm",
  VISION: "vision",
  EMBEDDING: "embedding",
});

const QUEUE_POLICIES = Object.freeze({
  NEVER: "never",
  USER_APPROVAL: "user_approval",
  ALWAYS: "always",
});

const MAX_SYNC_FIELDS = 128;
const MAX_SYNC_FIELD_NAME_LENGTH = 128;
const MAX_SYNC_STRING_LENGTH = 4096;
const FORBIDDEN_SYNC_FIELDS = new Set(["__proto__", "prototype", "constructor"]);
const LEGACY_OFFLINE_STORAGE_KEY = "hey_offline";
const DEVICE_OFFLINE_STORAGE_KEY = "hey_offline_device_v1";
const OFFLINE_STORAGE_VERSION = 2;
const OUTBOX_RETRY_BASE_MS = 1000;
const OUTBOX_RETRY_MAX_MS = 5 * 60 * 1000;
const OUTBOX_RETRY_MAX_EXPONENT = 9;
const RESOURCE_BUDGET_LIMITS = Object.freeze({
  cpu: [1, 100],
  memory: [1, 1_048_576],
  storage: [1, 1_048_576],
  batteryFloor: [0, 100],
});

function mergeResourceBudget(current, candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return { ...current };
  const next = { ...current };
  for (const [key, [minimum, maximum]] of Object.entries(RESOURCE_BUDGET_LIMITS)) {
    const value = candidate[key];
    if (Number.isFinite(value) && value >= minimum && value <= maximum) next[key] = value;
  }
  return next;
}

function isPersistenceReceipt(receipt, candidate, context) {
  if (!isRecord(receipt)) return false;
  const fields = ["committed", "accountScope", "recordKey", "version", "sequence", "parentVersion"];
  const keys = Reflect.ownKeys(receipt);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key))) return false;
  const values = {};
  for (const key of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(receipt, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) return false;
    values[key] = descriptor.value;
  }
  return values.committed === true
    && values.accountScope === context.accountScope
    && values.recordKey === context.recordKey
    && values.version === candidate.version
    && values.sequence === candidate.sequence
    && values.parentVersion === candidate.parentVersion;
}

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function copyFlatSyncDocument(value) {
  if (!isRecord(value)) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length > MAX_SYNC_FIELDS || keys.some((key) => typeof key !== "string")) return null;

  const copy = Object.create(null);
  for (const key of keys) {
    if (!key || key.length > MAX_SYNC_FIELD_NAME_LENGTH || FORBIDDEN_SYNC_FIELDS.has(key)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) return null;
    const fieldValue = descriptor.value;
    if (typeof fieldValue === "string" && fieldValue.length <= MAX_SYNC_STRING_LENGTH) {
      copy[key] = fieldValue;
    } else if (fieldValue === null || typeof fieldValue === "boolean"
      || (typeof fieldValue === "number" && Number.isFinite(fieldValue))) {
      copy[key] = fieldValue;
    } else {
      return null;
    }
  }
  return copy;
}

function sameSyncValue(left, right, key) {
  return Object.hasOwn(left, key) === Object.hasOwn(right, key)
    && (!Object.hasOwn(left, key) || Object.is(left[key], right[key]));
}

function copySyncRevision(revision) {
  if (!isRecord(revision)) return null;
  const allowedKeys = new Set(["baseVersion", "version", "sequence", "value"]);
  if (Reflect.ownKeys(revision).some((key) => typeof key !== "string" || !allowedKeys.has(key))) return null;
  for (const key of allowedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(revision, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) return null;
  }
  const { baseVersion, version, sequence } = revision;
  if (![baseVersion, version, sequence].every((value) => Number.isSafeInteger(value) && value >= 0)) return null;
  const value = copyFlatSyncDocument(revision.value);
  if (!value) return null;
  return { baseVersion, version, sequence, value };
}

/**
 * Resolves concurrent edits to a flat scalar record using a three-way merge.
 * All three revisions must descend from the same base and belong to the
 * currently active account. Conflicting fields are returned by name only.
 */
export function resolveOfflineSyncConflict(input) {
  try {
    if (!isRecord(input) || Reflect.ownKeys(input).some((key) => !["accountScope", "base", "local", "remote"].includes(key))) {
      return { ok: false, code: "invalid_input" };
    }
    const accountScopeDescriptor = Object.getOwnPropertyDescriptor(input, "accountScope");
    if (!accountScopeDescriptor || !Object.hasOwn(accountScopeDescriptor, "value")
      || typeof accountScopeDescriptor.value !== "string") {
      return { ok: false, code: "invalid_input" };
    }
    if (accountScopeDescriptor.value !== getAccountScope()) return { ok: false, code: "account_scope_mismatch" };

    const baseDescriptor = Object.getOwnPropertyDescriptor(input, "base");
    const localDescriptor = Object.getOwnPropertyDescriptor(input, "local");
    const remoteDescriptor = Object.getOwnPropertyDescriptor(input, "remote");
    if (![baseDescriptor, localDescriptor, remoteDescriptor].every((descriptor) => descriptor && Object.hasOwn(descriptor, "value"))) {
      return { ok: false, code: "invalid_input" };
    }
    const local = copySyncRevision(localDescriptor.value);
    const remote = copySyncRevision(remoteDescriptor.value);
    const baseRevision = baseDescriptor.value;
    if (!isRecord(baseRevision)
      || Reflect.ownKeys(baseRevision).some((key) => !["version", "sequence", "value"].includes(key))) {
      return { ok: false, code: "invalid_input" };
    }
    const baseVersionDescriptor = Object.getOwnPropertyDescriptor(baseRevision, "version");
    const baseSequenceDescriptor = Object.getOwnPropertyDescriptor(baseRevision, "sequence");
    const baseValueDescriptor = Object.getOwnPropertyDescriptor(baseRevision, "value");
    if (![baseVersionDescriptor, baseSequenceDescriptor, baseValueDescriptor].every((descriptor) => descriptor && Object.hasOwn(descriptor, "value"))) {
      return { ok: false, code: "invalid_input" };
    }
    const baseVersion = baseVersionDescriptor.value;
    const baseSequence = baseSequenceDescriptor.value;
    const base = copyFlatSyncDocument(baseValueDescriptor.value);
    if (!Number.isSafeInteger(baseVersion) || baseVersion < 0 || !Number.isSafeInteger(baseSequence) || baseSequence < 0
      || !base || !local || !remote) {
      return { ok: false, code: "invalid_input" };
    }
    if (local.baseVersion !== baseVersion || remote.baseVersion !== baseVersion
      || local.version <= baseVersion || remote.version <= baseVersion
      || Math.max(local.version, remote.version) === Number.MAX_SAFE_INTEGER) {
      return { ok: false, code: "version_mismatch" };
    }
    if (local.sequence <= baseSequence || remote.sequence <= baseSequence
      || Math.max(local.sequence, remote.sequence) === Number.MAX_SAFE_INTEGER) {
      return { ok: false, code: "sequence_mismatch" };
    }

    const merged = Object.create(null);
    const conflicts = [];
    const fields = new Set([...Object.keys(base), ...Object.keys(local.value), ...Object.keys(remote.value)]);
    for (const key of [...fields].sort()) {
      const localChanged = !sameSyncValue(base, local.value, key);
      const remoteChanged = !sameSyncValue(base, remote.value, key);
      if (localChanged && remoteChanged && !sameSyncValue(local.value, remote.value, key)) {
        conflicts.push(key);
      } else {
        const source = localChanged ? local.value : remote.value;
        if (Object.hasOwn(source, key)) merged[key] = source[key];
      }
    }
    if (conflicts.length) return { ok: false, code: "field_conflict", conflictFields: conflicts };

    return {
      ok: true,
      accountScope: accountScopeDescriptor.value,
      version: Math.max(local.version, remote.version) + 1,
      sequence: Math.max(local.sequence, remote.sequence) + 1,
      parentVersion: Math.max(local.version, remote.version),
      expected: {
        baseVersion,
        baseSequence,
        localVersion: local.version,
        localSequence: local.sequence,
        remoteVersion: remote.version,
        remoteSequence: remote.sequence,
      },
      value: Object.fromEntries(Object.keys(merged).sort().map((key) => [key, merged[key]])),
    };
  } catch {
    // Malformed or hostile in-memory values must not prevent later sync work.
    return { ok: false, code: "invalid_input" };
  }
}

function generateModelPackId() {
  return `model_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateOutboxId() {
  return `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class OfflineEngine {
  constructor() {
    this.deviceResourceBudget = {
      cpu: 50,
      memory: 2048,
      storage: 5120,
      batteryFloor: getSetting("local.battery_floor") || 20,
    };
    this.accountScope = getAccountScope();
    this.scopeEpoch = 0;
    this.localRuntime = this.createRuntime();
    this.listeners = new Set();
    this.unsubscribeAccountScope = subscribeAccountScope((_previous, next) => this.changeAccountScope(next));
    this.load();
    this.startResourceMonitor();
  }

  createRuntime() {
    return {
      state: LOCAL_STATES.READY,
      modelPacks: new Map(),
      resourceBudget: { ...this.deviceResourceBudget },
      cache: new Map(),
      outbox: [],
      outboxInFlight: new Set(),
      lanCompute: { enabled: false, peers: [] },
    };
  }

  captureScope() {
    return { accountScope: this.accountScope, epoch: this.scopeEpoch, runtime: this.localRuntime };
  }

  isCurrentScope(capture) {
    return Boolean(capture
      && capture.accountScope === this.accountScope
      && capture.accountScope === getAccountScope()
      && capture.epoch === this.scopeEpoch
      && capture.runtime === this.localRuntime);
  }

  changeAccountScope(nextScope) {
    if (nextScope === this.accountScope) return;
    this.scopeEpoch += 1;
    this.accountScope = nextScope;
    this.localRuntime = this.createRuntime();
    this.load();
  }

  applyStoredState(parsed, scope) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    if (Object.hasOwn(parsed, "accountScope") && parsed.accountScope !== scope) return false;
    if (parsed.storageVersion !== undefined && parsed.storageVersion !== OFFLINE_STORAGE_VERSION) return false;
    if (Object.values(LOCAL_STATES).includes(parsed.state)) this.localRuntime.state = parsed.state;
    if (parsed.modelPacks && typeof parsed.modelPacks === "object" && !Array.isArray(parsed.modelPacks)) {
      for (const [id, pack] of Object.entries(parsed.modelPacks)) {
        if (id && pack && typeof pack === "object" && !Array.isArray(pack)) this.localRuntime.modelPacks.set(id, pack);
      }
    }
    if (Array.isArray(parsed.outbox)) this.localRuntime.outbox = parsed.outbox;
    if (parsed.lanCompute && typeof parsed.lanCompute === "object" && !Array.isArray(parsed.lanCompute)) {
      this.localRuntime.lanCompute = {
        enabled: parsed.lanCompute.enabled === true,
        peers: Array.isArray(parsed.lanCompute.peers) ? parsed.lanCompute.peers : [],
      };
    }
    return true;
  }

  load(scope = this.accountScope) {
    const capture = this.captureScope();
    if (scope !== capture.accountScope || !this.isCurrentScope(capture)) return false;
    try {
      const storage = globalThis.localStorage;
      if (!storage || !this.isCurrentScope(capture)) return false;
      const devicePreferences = storage.getItem(DEVICE_OFFLINE_STORAGE_KEY);
      if (!this.isCurrentScope(capture)) return false;
      if (devicePreferences) {
        const parsedPreferences = JSON.parse(devicePreferences);
        if (parsedPreferences?.resourceBudget) {
          this.deviceResourceBudget = mergeResourceBudget(this.deviceResourceBudget, parsedPreferences.resourceBudget);
          this.localRuntime.resourceBudget = { ...this.deviceResourceBudget };
        }
      }

      const scopedKey = getAccountStorageKey("hey_offline", capture.accountScope);
      let stored = storage.getItem(scopedKey);
      if (!this.isCurrentScope(capture)) return false;
      let migratingLegacy = false;
      if (!stored && scope === "anonymous") {
        stored = storage.getItem(LEGACY_OFFLINE_STORAGE_KEY);
        if (!this.isCurrentScope(capture)) return false;
        migratingLegacy = Boolean(stored);
      }
      if (stored) {
        const parsed = JSON.parse(stored);
        if (!this.isCurrentScope(capture) || !this.applyStoredState(parsed, scope) || !this.isCurrentScope(capture)) return false;
        if (migratingLegacy && parsed.resourceBudget && typeof parsed.resourceBudget === "object") {
          this.deviceResourceBudget = mergeResourceBudget(this.deviceResourceBudget, parsed.resourceBudget);
          this.localRuntime.resourceBudget = { ...this.deviceResourceBudget };
        }
        if (migratingLegacy && this.save(capture) && this.isCurrentScope(capture)) storage.removeItem(LEGACY_OFFLINE_STORAGE_KEY);
      }
      return true;
    } catch (err) {
      console.warn("Failed to load offline engine:", err);
      return false;
    }
  }

  save(capture = this.captureScope()) {
    if (!this.isCurrentScope(capture)) return false;
    try {
      const storage = globalThis.localStorage;
      if (!storage) return false;
      const serialized = JSON.stringify({
        storageVersion: OFFLINE_STORAGE_VERSION,
        accountScope: capture.accountScope,
        state: capture.runtime.state,
        modelPacks: Object.fromEntries(capture.runtime.modelPacks),
        outbox: capture.runtime.outbox,
        lanCompute: capture.runtime.lanCompute,
      });
      if (!this.isCurrentScope(capture)) return false;
      storage.setItem(getAccountStorageKey("hey_offline", capture.accountScope), serialized);
      if (!this.isCurrentScope(capture)) return false;
      storage.setItem(DEVICE_OFFLINE_STORAGE_KEY, JSON.stringify({ resourceBudget: this.deviceResourceBudget }));
      return true;
    } catch (err) {
      console.warn("Failed to save offline engine:", err);
      return false;
    }
  }

  startResourceMonitor() {
    setInterval(() => {
      const capture = this.captureScope();
      if (navigator.getBattery) {
        navigator.getBattery().then(battery => {
          if (!this.isCurrentScope(capture)) return;
          if (battery.level * 100 < this.localRuntime.resourceBudget.batteryFloor) {
            this.notify("battery_low", { level: battery.level * 100, floor: this.localRuntime.resourceBudget.batteryFloor });
          }
        });
      }
    }, 60000);
  }

  getState() {
    return this.localRuntime.state;
  }

  setState(state) {
    if (!Object.values(LOCAL_STATES).includes(state)) return { error: "Invalid state" };
    this.localRuntime.state = state;
    this.save();
    this.notify("state_changed", { state });
    return { success: true };
  }

  getModelPacks() {
    return Array.from(this.localRuntime.modelPacks.values());
  }

  getModelPack(id) {
    return this.localRuntime.modelPacks.get(id) || null;
  }

  async installModelPack(input) {
    const capture = this.captureScope();
    const packId = generateModelPackId();
    const pack = {
      id: packId,
      name: input.name,
      type: input.type,
      version: input.version,
      size: input.size,
      languages: input.languages || [],
      modalities: input.modalities || [],
      checksum: input.checksum,
      diskRequirement: input.diskRequirement,
      ramRequirement: input.ramRequirement,
      acceleratorRequirement: input.acceleratorRequirement,
      state: LOCAL_STATES.DOWNLOADING,
      downloadUrl: input.downloadUrl,
      progress: 0,
      createdAt: new Date().toISOString(),
    };

    capture.runtime.modelPacks.set(packId, pack);
    this.save(capture);

    try {
      const downloadUrl = input.downloadUrl;
      const expectedChecksum = input.checksum;
      const modelType = input.type;
      if (!this.isCurrentScope(capture)) return { error: "account_changed" };
      const response = await fetch(downloadUrl);
      if (!this.isCurrentScope(capture)) return { error: "account_changed" };
      const reader = response.body.getReader();
      const contentLength = +response.headers.get("Content-Length");
      let received = 0;
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (!this.isCurrentScope(capture)) return { error: "account_changed" };
        if (done) break;
        chunks.push(value);
        received += value.length;
        pack.progress = Math.round((received / contentLength) * 100);
        capture.runtime.modelPacks.set(packId, pack);
        this.save(capture);
        if (!this.isCurrentScope(capture)) return { error: "account_changed" };
      }

      const blob = new Blob(chunks);
      const checksum = await this.computeChecksum(blob);
      if (!this.isCurrentScope(capture)) return { error: "account_changed" };
      
      if (checksum !== expectedChecksum) {
        pack.state = LOCAL_STATES.FAILED;
        pack.error = "Checksum mismatch";
        capture.runtime.modelPacks.set(packId, pack);
        this.save(capture);
        if (!this.isCurrentScope(capture)) return { error: "account_changed" };
        return { error: "Checksum mismatch" };
      }

      pack.state = LOCAL_STATES.VALIDATING;
      capture.runtime.modelPacks.set(packId, pack);
      this.save(capture);
      if (!this.isCurrentScope(capture)) return { error: "account_changed" };

      const valid = await this.validateModelPack(blob, modelType);
      if (!this.isCurrentScope(capture)) return { error: "account_changed" };
      if (!valid) {
        pack.state = LOCAL_STATES.FAILED;
        pack.error = "Validation failed";
        capture.runtime.modelPacks.set(packId, pack);
        this.save(capture);
        if (!this.isCurrentScope(capture)) return { error: "account_changed" };
        return { error: "Validation failed" };
      }

      pack.state = LOCAL_STATES.AVAILABLE;
      pack.blob = blob;
      capture.runtime.modelPacks.set(packId, pack);
      this.save(capture);
      if (!this.isCurrentScope(capture)) return { error: "account_changed" };

      this.notify("model_pack_installed", pack);
      return pack;
    } catch (error) {
      if (!this.isCurrentScope(capture)) return { error: "account_changed" };
      pack.state = LOCAL_STATES.FAILED;
      pack.error = error.message;
      capture.runtime.modelPacks.set(packId, pack);
      this.save(capture);
      if (!this.isCurrentScope(capture)) return { error: "account_changed" };
      return { error: error.message };
    }
  }

  async computeChecksum(blob) {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async validateModelPack() {
    return true;
  }

  removeModelPack(id) {
    this.localRuntime.modelPacks.delete(id);
    this.save();
    return true;
  }

  getResourceBudget() {
    return this.localRuntime.resourceBudget;
  }

  setResourceBudget(budget) {
    this.deviceResourceBudget = mergeResourceBudget(this.deviceResourceBudget, budget);
    this.localRuntime.resourceBudget = { ...this.deviceResourceBudget };
    setSetting("local.battery_floor", budget.batteryFloor);
    this.save();
    return this.localRuntime.resourceBudget;
  }

  getCache() {
    return Array.from(this.localRuntime.cache.values());
  }

  setCache(key, value, ttl = 86400000) {
    this.localRuntime.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
    this.save();
  }

  getCacheEntry(key) {
    const entry = this.localRuntime.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.localRuntime.cache.delete(key);
      this.save();
      return null;
    }
    return entry.value;
  }

  clearCache() {
    this.localRuntime.cache.clear();
    this.save();
  }

  getOutbox() {
    return this.localRuntime.outbox;
  }

  resolveSyncConflict(input) {
    return resolveOfflineSyncConflict(input);
  }

  /**
   * Optionally delegates a resolved merge to an explicit caller-owned
   * compare-and-set adapter. No persistence occurs without that adapter.
   */
  async resolveAndPersistSyncConflict(input, adapterOptions) {
    const capture = this.captureScope();
    try {
      if (!isRecord(adapterOptions)
        || Reflect.ownKeys(adapterOptions).some((key) => typeof key !== "string" || !["recordKey", "persist"].includes(key))) {
        return { ok: false, code: "persistence_adapter_required" };
      }
      const recordKeyDescriptor = Object.getOwnPropertyDescriptor(adapterOptions, "recordKey");
      const persistDescriptor = Object.getOwnPropertyDescriptor(adapterOptions, "persist");
      if (!recordKeyDescriptor || !Object.hasOwn(recordKeyDescriptor, "value")
        || !persistDescriptor || !Object.hasOwn(persistDescriptor, "value")
        || typeof persistDescriptor.value !== "function") {
        return { ok: false, code: "persistence_adapter_required" };
      }
      const recordKey = recordKeyDescriptor.value;
      const hasControlCharacter = typeof recordKey === "string"
        && Array.from(recordKey).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
      if (typeof recordKey !== "string" || !recordKey.trim() || recordKey.length > 200 || hasControlCharacter) {
        return { ok: false, code: "invalid_record_key" };
      }

      const merge = this.resolveSyncConflict(input);
      if (!merge.ok) return merge;
      if (!this.isCurrentScope(capture) || merge.accountScope !== capture.accountScope) {
        return { ok: false, code: "account_scope_mismatch" };
      }

      const context = Object.freeze({
        recordKey,
        accountScope: capture.accountScope,
        expectedBaseVersion: merge.expected.baseVersion,
        expectedBaseSequence: merge.expected.baseSequence,
        expectedLocalVersion: merge.expected.localVersion,
        expectedLocalSequence: merge.expected.localSequence,
        expectedRemoteVersion: merge.expected.remoteVersion,
        expectedRemoteSequence: merge.expected.remoteSequence,
      });
      const candidate = Object.freeze({
        ...merge,
        expected: Object.freeze({ ...merge.expected }),
        value: Object.freeze({ ...merge.value }),
      });

      const receipt = await persistDescriptor.value(candidate, context);
      if (!this.isCurrentScope(capture)) return { ok: false, code: "account_changed" };
      if (!isPersistenceReceipt(receipt, candidate, context)) {
        return { ok: false, code: "persistence_not_confirmed" };
      }
      return { ...candidate, persisted: true };
    } catch {
      if (!this.isCurrentScope(capture)) return { ok: false, code: "account_changed" };
      return { ok: false, code: "persistence_failed" };
    }
  }

  addToOutbox(input) {
    const outboxId = generateOutboxId();
    const item = {
      id: outboxId,
      type: input.type,
      payload: input.payload,
      destination: input.destination,
      priority: input.priority || "normal",
      requiresConsent: input.requiresConsent !== false,
      createdAt: new Date().toISOString(),
      attempts: 0,
      deliveryState: "pending",
      nextAttemptAt: null,
      lastError: null,
    };

    this.localRuntime.outbox.push(item);
    this.save();
    this.notify("outbox_added", item);
    return item;
  }

  processOutbox() {
    if (typeof navigator === "undefined" || navigator.onLine !== true) return;
    if (this.localRuntime.outbox.length === 0) return;

    const now = Date.now();
    const item = this.localRuntime.outbox.find((queued) => queued.deliveryState !== "blocked"
      && (!Number.isFinite(queued.nextAttemptAt) || queued.nextAttemptAt <= now)
      && (!queued.requiresConsent || this.hasUserConsent(queued)));
    if (!item) return;
    this.sendOutboxItem(item);
  }

  hasUserConsent() {
    return true;
  }

  async sendOutboxItem(item) {
    const capture = this.captureScope();
    if (!capture.runtime.outbox.includes(item)) return { error: "item_not_queued" };
    if (capture.runtime.outboxInFlight.has(item.id)) return { error: "already_sending" };
    if (item.deliveryState === "blocked") return { error: "delivery_blocked" };
    if (Number.isFinite(item.nextAttemptAt) && item.nextAttemptAt > Date.now()) {
      return { error: "retry_scheduled", retryAt: item.nextAttemptAt };
    }
    capture.runtime.outboxInFlight.add(item.id);
    try {
      const destination = item.destination;
      const body = JSON.stringify(item.payload);
      if (!this.isCurrentScope(capture)) return { error: "account_changed" };
      let response;
      try {
        response = await fetch(destination, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      } catch {
        return this.recordOutboxFailure(item, capture, "network_error", true);
      }
      if (!this.isCurrentScope(capture)) return { error: "account_changed" };
      const status = response?.status;
      if (!response || !Number.isInteger(status) || status < 100 || status > 599) {
        return this.recordOutboxFailure(item, capture, "invalid_response", true);
      }
      if (status < 200 || status >= 300 || response.ok !== true) {
        const retryable = status === 408 || status === 425 || status === 429 || status >= 500;
        return this.recordOutboxFailure(item, capture, `http_${status}`, retryable);
      }

      const itemIndex = capture.runtime.outbox.indexOf(item);
      if (itemIndex < 0) return { error: "item_not_queued" };
      capture.runtime.outbox.splice(itemIndex, 1);
      this.save(capture);
      if (!this.isCurrentScope(capture)) return { error: "account_changed" };
      this.notify("outbox_sent", item);
      return { success: true };
    } catch {
      if (!this.isCurrentScope(capture)) return { error: "account_changed" };
      return this.recordOutboxFailure(item, capture, "invalid_payload", false);
    } finally {
      capture.runtime.outboxInFlight.delete(item.id);
    }
  }

  recordOutboxFailure(item, capture, code, retryable) {
    if (!this.isCurrentScope(capture)) return { error: "account_changed" };
    if (!capture.runtime.outbox.includes(item)) return { error: "item_not_queued" };
    const previousAttempts = Number.isSafeInteger(item.attempts) && item.attempts >= 0 ? item.attempts : 0;
    item.attempts = Math.min(previousAttempts + 1, Number.MAX_SAFE_INTEGER);
    item.lastError = code;
    if (retryable) {
      const exponent = Math.min(Math.max(item.attempts - 1, 0), OUTBOX_RETRY_MAX_EXPONENT);
      const delay = Math.min(OUTBOX_RETRY_BASE_MS * (2 ** exponent), OUTBOX_RETRY_MAX_MS);
      item.deliveryState = "retry_wait";
      item.nextAttemptAt = Date.now() + delay;
    } else {
      item.deliveryState = "blocked";
      item.nextAttemptAt = null;
    }
    this.save(capture);
    if (!this.isCurrentScope(capture)) return { error: "account_changed" };
    return retryable
      ? { error: code, retryAt: item.nextAttemptAt }
      : { error: code, blocked: true };
  }

  retryOutboxItem(itemId) {
    const item = this.localRuntime.outbox.find((queued) => queued.id === itemId);
    if (!item) return { error: "item_not_queued" };
    if (this.localRuntime.outboxInFlight.has(item.id)) return { error: "already_sending" };
    item.attempts = 0;
    item.lastError = null;
    item.deliveryState = "pending";
    item.nextAttemptAt = null;
    this.save();
    return { success: true, item };
  }

  enableLANCompute(enabled) {
    this.localRuntime.lanCompute.enabled = enabled;
    this.save();
    return { success: true };
  }

  addLANPeer(peer) {
    this.localRuntime.lanCompute.peers.push({
      id: peer.id,
      name: peer.name,
      capabilities: peer.capabilities,
      lastSeen: new Date().toISOString(),
    });
    this.save();
  }

  removeLANPeer(peerId) {
    this.localRuntime.lanCompute.peers = this.localRuntime.lanCompute.peers.filter(p => p.id !== peerId);
    this.save();
  }

  getLANPeers() {
    return this.localRuntime.lanCompute.peers;
  }

  getQueuePolicy() {
    return getSetting("privacy.no_cloud") ? QUEUE_POLICIES.NEVER : QUEUE_POLICIES.USER_APPROVAL;
  }

  setQueuePolicy(policy) {
    if (!Object.values(QUEUE_POLICIES).includes(policy)) return { error: "Invalid policy" };
    return { success: true };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Offline listener error:", err); }
    });
  }
}

export const offlineEngine = new OfflineEngine();

export function getOfflineState() {
  return offlineEngine.getState();
}

export function setOfflineState(state) {
  return offlineEngine.setState(state);
}

export function getModelPacks() {
  return offlineEngine.getModelPacks();
}

export function getModelPack(id) {
  return offlineEngine.getModelPack(id);
}

export function installModelPack(input) {
  return offlineEngine.installModelPack(input);
}

export function removeModelPack(id) {
  return offlineEngine.removeModelPack(id);
}

export function getResourceBudget() {
  return offlineEngine.getResourceBudget();
}

export function setResourceBudget(budget) {
  return offlineEngine.setResourceBudget(budget);
}

export function getOfflineCache() {
  return offlineEngine.getCache();
}

export function setOfflineCache(key, value, ttl) {
  return offlineEngine.setCache(key, value, ttl);
}

export function getOfflineCacheEntry(key) {
  return offlineEngine.getCacheEntry(key);
}

export function clearOfflineCache() {
  return offlineEngine.clearCache();
}

export function getOutbox() {
  return offlineEngine.getOutbox();
}

export function addToOutbox(input) {
  return offlineEngine.addToOutbox(input);
}

export function processOutbox() {
  return offlineEngine.processOutbox();
}

export function retryOutboxItem(itemId) {
  return offlineEngine.retryOutboxItem(itemId);
}

export function resolveSyncConflict(input) {
  return offlineEngine.resolveSyncConflict(input);
}

export function resolveAndPersistSyncConflict(input, adapterOptions) {
  return offlineEngine.resolveAndPersistSyncConflict(input, adapterOptions);
}

export function enableLANCompute(enabled) {
  return offlineEngine.enableLANCompute(enabled);
}

export function addLANPeer(peer) {
  return offlineEngine.addLANPeer(peer);
}

export function removeLANPeer(peerId) {
  return offlineEngine.removeLANPeer(peerId);
}

export function getLANPeers() {
  return offlineEngine.getLANPeers();
}

export function getQueuePolicy() {
  return offlineEngine.getQueuePolicy();
}

export function setQueuePolicy(policy) {
  return offlineEngine.setQueuePolicy(policy);
}

export function subscribeToOffline(listener) {
  return offlineEngine.subscribe(listener);
}

export { LOCAL_STATES, MODEL_TYPES, QUEUE_POLICIES };

export default offlineEngine;
