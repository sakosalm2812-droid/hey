import { recordAudit } from "./auditLog.js";
import { executeWithPermission } from "./permissionManager.js";
import { getAccountScope, getAccountStorageKey, subscribeAccountScope } from "./accountScope.js";

const adapters = new Map();
const devices = new Map();
const DEVICE_STORAGE_KEY = "hey_device_enrollments";
const DEVICE_STORE_VERSION = 1;
const MAX_DEVICE_STORE_LENGTH = 256_000;
const DEVICE_PLATFORMS = ["windows", "macos", "linux", "android", "ios", "web"];
const DEVICE_STATUSES = ["online", "offline", "revoked"];
const DEVICE_TRANSPORTS = ["local", "remote"];
let loadedScope = null;

function copyDevice(device) {
  return {
    ...device,
    capabilities: [...device.capabilities],
    permissions: [...device.permissions],
    metadata: clonePlainData(device.metadata),
  };
}

function clonePlainData(value, name = "Device data") {
  const active = new WeakSet();
  let visited = 0;

  function visit(current, depth) {
    visited += 1;
    if (visited > 10000 || depth > 32) throw new TypeError(`${name} exceeds the supported size.`);
    if (current === null || typeof current === "string" || typeof current === "boolean") return current;
    if (typeof current === "number" && Number.isFinite(current)) return current;
    if (typeof current !== "object") throw new TypeError(`${name} must contain only JSON-compatible data.`);
    if (active.has(current)) throw new TypeError(`${name} cannot contain cycles.`);
    active.add(current);

    let copy;
    if (Array.isArray(current)) {
      const keys = Reflect.ownKeys(current);
      if (keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(0|[1-9]\d*)$/.test(key)))) {
        throw new TypeError(`${name} arrays cannot contain custom properties.`);
      }
      copy = [];
      for (let index = 0; index < current.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${name} arrays must be dense data.`);
        copy.push(visit(descriptor.value, depth + 1));
      }
    } else {
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${name} must use plain objects.`);
      copy = {};
      for (const key of Reflect.ownKeys(current)) {
        if (typeof key !== "string" || ["__proto__", "prototype", "constructor"].includes(key)) {
          throw new TypeError(`${name} contains an unsupported property.`);
        }
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${name} cannot contain accessors or hidden properties.`);
        Object.defineProperty(copy, key, { value: visit(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true });
      }
    }
    active.delete(current);
    return copy;
  }

  return visit(value, 0);
}

function normalizeStringList(value, name) {
  const snapshot = clonePlainData(value, name);
  if (!Array.isArray(snapshot) || snapshot.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new TypeError(`${name} must be an array of non-empty strings.`);
  }
  return [...new Set(snapshot.map((entry) => entry.trim()))];
}

function scopedStorageKey(scope = getAccountScope()) {
  return getAccountStorageKey(DEVICE_STORAGE_KEY, scope);
}

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function normalizeStoredDevice(value, accountId) {
  const device = clonePlainData(value, "Stored device registration");
  if (!device || typeof device !== "object" || Array.isArray(device) ||
    typeof device.id !== "string" || !device.id.trim() || device.accountId !== accountId ||
    !DEVICE_PLATFORMS.includes(device.platform) || !DEVICE_STATUSES.includes(device.status) ||
    !DEVICE_TRANSPORTS.includes(device.transport) || typeof device.name !== "string" || !device.name.trim() ||
    !Array.isArray(device.capabilities) || !Array.isArray(device.permissions) ||
    typeof device.trusted !== "boolean" || !device.metadata || typeof device.metadata !== "object" || Array.isArray(device.metadata) ||
    typeof device.registeredAt !== "string" || !Number.isFinite(Date.parse(device.registeredAt)) ||
    (device.revokedAt != null && (typeof device.revokedAt !== "string" || !Number.isFinite(Date.parse(device.revokedAt))))) {
    throw new TypeError("Stored device enrollment is invalid.");
  }
  return {
    id: device.id.trim(),
    accountId,
    name: device.name.trim(),
    platform: device.platform,
    osVersion: typeof device.osVersion === "string" ? device.osVersion : null,
    deviceType: typeof device.deviceType === "string" ? device.deviceType : "unknown",
    status: device.status,
    capabilities: normalizeStringList(device.capabilities, "Stored device capabilities"),
    permissions: normalizeStringList(device.permissions, "Stored device permissions"),
    trusted: device.trusted,
    transport: device.transport,
    metadata: clonePlainData(device.metadata, "Stored device metadata"),
    lastSeenAt: typeof device.lastSeenAt === "string" ? device.lastSeenAt : null,
    registeredAt: device.registeredAt,
    ...(device.revokedAt ? { revokedAt: device.revokedAt } : {}),
  };
}

function serializeRegistry(scope, records) {
  const accountId = scope.startsWith("account:") ? scope.slice("account:".length) : null;
  if (!accountId || !accountId.trim()) return null;
  const ownedRecords = records.filter((device) => device.accountId === accountId);
  const serialized = JSON.stringify({ version: DEVICE_STORE_VERSION, accountId, devices: ownedRecords.map((device) => normalizeStoredDevice(device, accountId)) });
  if (serialized.length > MAX_DEVICE_STORE_LENGTH) throw new TypeError("Device enrollment store exceeds the supported size.");
  return serialized;
}

function persistRegistry(records, scope = getAccountScope()) {
  const serialized = serializeRegistry(scope, records);
  // Ownerless / out-of-session registrations remain process-local for compatibility.
  if (serialized === null) return true;
  const store = storage();
  if (!store) return false;
  try {
    const key = scopedStorageKey(scope);
    store.setItem(key, serialized);
    return store.getItem(key) === serialized;
  } catch {
    return false;
  }
}

function loadRegistry(scope = getAccountScope()) {
  if (loadedScope === scope) return;
  devices.clear();
  loadedScope = scope;
  const accountId = scope.startsWith("account:") ? scope.slice("account:".length) : null;
  if (!accountId) return;
  let raw;
  try { raw = storage()?.getItem(scopedStorageKey(scope)); } catch { return; }
  if (!raw || raw.length > MAX_DEVICE_STORE_LENGTH) return;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== DEVICE_STORE_VERSION || parsed.accountId !== accountId || !Array.isArray(parsed.devices)) return;
    const recovered = parsed.devices.map((device) => normalizeStoredDevice(device, accountId));
    if (new Set(recovered.map((device) => device.id)).size !== recovered.length) return;
    recovered.forEach((device) => devices.set(device.id, device));
  } catch {
    // Corrupt or outdated local records fail closed; a later valid registration may replace them.
  }
}

subscribeAccountScope(() => {
  devices.clear();
  loadedScope = null;
});

export function registerDeviceAdapter(platform, adapter) {
  if (!adapter || (Object.getPrototypeOf(adapter) !== Object.prototype && Object.getPrototypeOf(adapter) !== null)) {
    throw new TypeError("A plain platform adapter is required.");
  }
  const platformDescriptor = Object.getOwnPropertyDescriptor(adapter, "platform");
  const executeDescriptor = Object.getOwnPropertyDescriptor(adapter, "execute");
  const capabilitiesDescriptor = Object.getOwnPropertyDescriptor(adapter, "capabilities");
  if (!platform || !platformDescriptor || !Object.hasOwn(platformDescriptor, "value") ||
    !executeDescriptor || !Object.hasOwn(executeDescriptor, "value") || typeof executeDescriptor.value !== "function" ||
    !capabilitiesDescriptor || !Object.hasOwn(capabilitiesDescriptor, "value")) {
    throw new TypeError("A platform and adapter with execute() are required.");
  }
  if (!DEVICE_PLATFORMS.includes(platform) || platformDescriptor.value !== platform) {
    throw new TypeError("The adapter platform must match a supported device platform.");
  }
  const registered = Object.freeze({
    platform,
    execute: executeDescriptor.value,
    capabilities: Object.freeze(normalizeStringList(capabilitiesDescriptor.value, "Adapter capabilities")),
  });
  adapters.set(platform, registered);
  return { platform: registered.platform, capabilities: [...registered.capabilities] };
}

export function unregisterDeviceAdapter(platform) {
  return adapters.delete(platform);
}

export function registerDevice(device, options = {}) {
  loadRegistry();
  device = clonePlainData(device, "Device registration");
  if (!device?.id || !device.platform) throw new TypeError("A device id and platform are required.");
  if (!DEVICE_PLATFORMS.includes(device.platform)) throw new TypeError(`Unsupported device platform: ${device.platform}`);
  const id = String(device.id).trim();
  if (!id) throw new TypeError("A device id is required.");
  if (devices.has(id)) throw new Error(`Device is already registered: ${id}`);
  const status = device.status || "offline";
  const transport = device.transport || "remote";
  const registrationUser = options?.user;
  const ownerId = registrationUser?.id || registrationUser?.userId || registrationUser?.accountId;
  if (!DEVICE_STATUSES.includes(status)) throw new TypeError(`Unsupported device status: ${status}`);
  if (!DEVICE_TRANSPORTS.includes(transport)) throw new TypeError(`Unsupported device transport: ${transport}`);
  if (ownerId && getAccountScope() !== `account:${String(ownerId).trim()}`) {
    throw new Error("Device enrollment requires the active owning account.");
  }
  const registered = {
    id,
    // Ownership comes from the authenticated registration context, never device payload fields.
    accountId: typeof ownerId === "string" && ownerId.trim() ? ownerId.trim() : null,
    name: String(device.name || id),
    platform: device.platform,
    osVersion: device.osVersion || null,
    deviceType: device.deviceType || "unknown",
    status,
    capabilities: normalizeStringList(device.capabilities || [], "Device capabilities"),
    permissions: normalizeStringList(device.permissions || [], "Device permissions"),
    trusted: device.trusted === true,
    transport,
    metadata: clonePlainData(device.metadata || {}, "Device metadata"),
    lastSeenAt: device.lastSeenAt || null,
    registeredAt: new Date().toISOString(),
  };
  if (registered.accountId && getAccountScope() === `account:${registered.accountId}`) {
    const nextRecords = [...devices.values(), registered];
    if (!persistRegistry(nextRecords)) throw new Error("Device enrollment could not be safely saved.");
  }
  devices.set(id, registered);
  recordAudit({ action: "device.registered", status: "completed", metadata: { deviceId: id, platform: device.platform } });
  return copyDevice(registered);
}

export function unregisterDevice(deviceId, user = null) {
  loadRegistry();
  const device = devices.get(deviceId);
  if (!device) return false;
  const accountId = user?.id || user?.userId || user?.accountId;
  if (device.accountId && (!accountId || device.accountId !== String(accountId).trim())) return false;
  if (device.accountId && getAccountScope() !== `account:${device.accountId}`) return false;
  if (device.accountId && getAccountScope() === `account:${device.accountId}`) {
    const nextRecords = [...devices.values()].filter((entry) => entry.id !== deviceId);
    if (!persistRegistry(nextRecords)) return false;
  }
  const removed = devices.delete(deviceId);
  if (removed) recordAudit({ action: "device.unregistered", status: "completed", metadata: { deviceId } });
  return removed;
}

// Account reset is an internal lifecycle boundary, separate from user-facing removal.
export function clearDeviceRegistry() {
  const count = devices.size;
  devices.clear();
  loadedScope = null;
  return count;
}

/** Revoke a device only when the authenticated account owns its registration. */
export function revokeDevice(deviceId, user) {
  loadRegistry();
  const device = devices.get(deviceId);
  const accountId = user?.id || user?.userId || user?.accountId;
  if (!device || !accountId || !device.accountId || device.accountId !== String(accountId).trim() || getAccountScope() !== `account:${device.accountId}`) {
    return { success: false, status: "denied", error: "Only the authenticated owning account can revoke this device." };
  }
  if (device.status === "revoked") return { success: true, status: "revoked", device: copyDevice(device) };

  const previousStatus = device.status;
  const previousTrusted = device.trusted;
  device.status = "revoked";
  device.trusted = false;
  device.revokedAt = new Date().toISOString();
  if (getAccountScope() === `account:${device.accountId}` && !persistRegistry([...devices.values()])) {
    device.status = previousStatus;
    device.trusted = previousTrusted;
    delete device.revokedAt;
    return { success: false, status: "storage_failed", error: "Device revocation could not be safely saved." };
  }
  recordAudit({ action: "device.revoked", status: "completed", metadata: { deviceId, accountId: device.accountId } });
  return { success: true, status: "revoked", device: copyDevice(device) };
}

export function listDevices() {
  loadRegistry();
  return Array.from(devices.values(), copyDevice);
}

export function getDevice(deviceId) {
  loadRegistry();
  const device = devices.get(deviceId);
  return device ? copyDevice(device) : null;
}

export function getDeviceCapabilities(deviceId) {
  return getDevice(deviceId)?.capabilities || [];
}

export function listDeviceAdapters() {
  return Array.from(adapters.entries()).map(([platform, adapter]) => ({
    platform,
    capabilities: [...adapter.capabilities],
  }));
}

export async function executeOnDevice(deviceId, action, input = {}, options = {}) {
  loadRegistry();
  if (typeof action !== "string" || !action.trim()) {
    return { success: false, verified: false, status: "unsupported", error: "A declared device capability is required." };
  }
  const device = devices.get(deviceId);
  if (!device) return { success: false, error: "Device is not registered." };
  const accountId = options.user?.id || options.user?.userId || options.user?.accountId;
  if (!device.accountId || !accountId || device.accountId !== String(accountId).trim() || getAccountScope() !== `account:${device.accountId}`) {
    return { success: false, verified: false, status: "permission_denied", error: "Device execution requires the authenticated owning account." };
  }
  if (device.status !== "online") return { success: false, verified: false, status: "unavailable", error: `Device ${device.name} is ${device.status}.` };
  if (!device.trusted) return { success: false, verified: false, status: "permission_required", error: `Device ${device.name} is not trusted.` };
  if (device.transport !== "local") return { success: false, verified: false, status: "unavailable", error: "Remote device transport is not configured." };
  const adapter = adapters.get(device.platform);
  if (!adapter) return { success: false, verified: false, status: "unsupported", error: `No adapter is installed for ${device.platform}.` };
  if (!device.capabilities.includes(action)) return { success: false, verified: false, status: "unsupported", error: `Device ${device.name} does not expose ${action}.` };
  if (adapter.platform !== device.platform) return { success: false, verified: false, status: "unsupported", error: `The installed adapter does not match ${device.platform}.` };
  if (!adapter.capabilities.includes(action)) return { success: false, verified: false, status: "unsupported", error: `The ${device.platform} adapter does not expose ${action}.` };

  let actionInput;
  try {
    actionInput = clonePlainData(input, "Device action input");
  } catch {
    return { success: false, verified: false, status: "invalid_input", error: "Device action input must be cloneable data." };
  }

  const authorizationResult = await executeWithPermission({
    permission: options.permission || `${device.platform}.${action}`,
    scope: deviceId,
    riskLevel: options.riskLevel || "high",
    reason: options.reason || `HEY wants to ${action} on ${device.name}.`,
    user: options.user,
    confirmed: options.confirmed === true,
  }, async () => {
    const result = await adapter.execute({ device: copyDevice(device), action, input: actionInput });
    if (!result || result.success !== true || result.verified !== true) {
      return { success: false, verified: false, status: "verification_failed", error: "The device adapter did not report a verified successful postcondition." };
    }
    return result;
  });

  if (!authorizationResult.success) return authorizationResult;
  if (authorizationResult.result?.success !== true || authorizationResult.result?.verified !== true) {
    return { ...authorizationResult.result, authorization: authorizationResult.authorization, request: authorizationResult.request };
  }
  return { ...authorizationResult.result, authorization: authorizationResult.authorization, request: authorizationResult.request };
}

export default { registerDeviceAdapter, unregisterDeviceAdapter, registerDevice, unregisterDevice, revokeDevice, listDevices, getDevice, getDeviceCapabilities, listDeviceAdapters, executeOnDevice };
