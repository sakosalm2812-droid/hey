import { recordAudit } from "./auditLog.js";
import { executeWithPermission } from "./permissionManager.js";

const adapters = new Map();
const devices = new Map();
const DEVICE_PLATFORMS = ["windows", "macos", "linux", "android", "ios", "web"];

export function registerDeviceAdapter(platform, adapter) {
  if (!platform || !adapter || typeof adapter.execute !== "function") {
    throw new TypeError("A platform and adapter with execute() are required.");
  }
  adapters.set(platform, adapter);
  return adapter;
}

export function unregisterDeviceAdapter(platform) {
  return adapters.delete(platform);
}

export function registerDevice(device) {
  if (!device?.id || !device.platform) throw new TypeError("A device id and platform are required.");
  if (!DEVICE_PLATFORMS.includes(device.platform)) throw new TypeError(`Unsupported device platform: ${device.platform}`);
  const registered = {
    id: String(device.id),
    name: String(device.name || device.id),
    platform: device.platform,
    osVersion: device.osVersion || null,
    deviceType: device.deviceType || "unknown",
    status: device.status || "offline",
    capabilities: [...new Set(Array.isArray(device.capabilities) ? device.capabilities : [])],
    permissions: [...new Set(Array.isArray(device.permissions) ? device.permissions : [])],
    trusted: device.trusted === true,
    transport: device.transport || "remote",
    metadata: device.metadata || {},
    lastSeenAt: device.lastSeenAt || null,
    registeredAt: new Date(),
  };
  devices.set(device.id, registered);
  recordAudit({ action: "device.registered", status: "completed", metadata: { deviceId: device.id, platform: device.platform } });
  return registered;
}

export function unregisterDevice(deviceId) {
  const removed = devices.delete(deviceId);
  if (removed) recordAudit({ action: "device.unregistered", status: "completed", metadata: { deviceId } });
  return removed;
}

export function listDevices() {
  return Array.from(devices.values()).map((device) => ({ ...device, capabilities: [...device.capabilities], permissions: [...device.permissions] }));
}

export function getDevice(deviceId) {
  const device = devices.get(deviceId);
  return device ? { ...device, capabilities: [...device.capabilities], permissions: [...device.permissions] } : null;
}

export function getDeviceCapabilities(deviceId) {
  return getDevice(deviceId)?.capabilities || [];
}

export function listDeviceAdapters() {
  return Array.from(adapters.entries()).map(([platform, adapter]) => ({
    platform,
    capabilities: adapter.capabilities || [],
  }));
}

export async function executeOnDevice(deviceId, action, input = {}, options = {}) {
  const device = devices.get(deviceId);
  if (!device) return { success: false, error: "Device is not registered." };
  if (device.status !== "online") return { success: false, verified: false, status: "unavailable", error: `Device ${device.name} is ${device.status}.` };
  if (!device.trusted) return { success: false, verified: false, status: "permission_required", error: `Device ${device.name} is not trusted.` };
  if (device.transport !== "local") return { success: false, verified: false, status: "unavailable", error: "Remote device transport is not configured." };
  const adapter = adapters.get(device.platform);
  if (!adapter) return { success: false, error: `No adapter is installed for ${device.platform}.` };
  if (device.capabilities.length && !device.capabilities.includes(action)) return { success: false, verified: false, status: "unsupported", error: `Device ${device.name} does not expose ${action}.` };

  return executeWithPermission({
    permission: options.permission || `${device.platform}.${action}`,
    scope: deviceId,
    riskLevel: options.riskLevel || "high",
    reason: options.reason || `HEY wants to ${action} on ${device.name}.`,
  }, () => adapter.execute({ device, action, input }));
}

export default { registerDeviceAdapter, unregisterDeviceAdapter, registerDevice, unregisterDevice, listDevices, getDevice, getDeviceCapabilities, listDeviceAdapters, executeOnDevice };
