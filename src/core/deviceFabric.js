import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";
import { safeStorage } from "../lib/safeStorage.js";

const DEVICE_ROLES = Object.freeze({
  WORKSTATION: "workstation",
  MOBILE: "mobile",
  PRIVATE_CONFIRMATION: "private_confirmation",
  CAMERA: "camera",
  CONTROLLER: "controller",
  PRESENTATION_DISPLAY: "presentation_display",
  COMPUTE_NODE: "compute_node",
  AMBIENT_DISPLAY: "ambient_display",
});

const TRUST_STATES = Object.freeze({
  UNTRUSTED: "untrusted",
  PENDING: "pending",
  TRUSTED: "trusted",
  REVOKED: "revoked",
});

const SYNC_CATEGORIES = Object.freeze({
  COSMOS: "cosmos",
  WORKSPACE: "workspace",
  SETTINGS: "settings",
  ARTIFACTS: "artifacts",
  MISSIONS: "missions",
  CREDENTIALS: "credentials",
});

function generateDeviceId() {
  return `dev_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generatePairCode() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function generateHandoffId() {
  return `handoff_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class DeviceFabricEngine {
  constructor() {
    this.devices = new Map();
    this.localDeviceId = null;
    this.pairCode = null;
    this.pairCodeExpiry = null;
    this.handoffs = new Map();
    this.trustGrants = new Map();
    this.listeners = new Set();
    this.load();
    this.initializeLocalDevice();
  }

  load() {
    try {
      const stored = safeStorage.getItem("hey_device_fabric");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.devices) Object.entries(parsed.devices).forEach(([k, v]) => this.devices.set(k, v));
        this.localDeviceId = parsed.localDeviceId;
        this.pairCode = parsed.pairCode;
        this.pairCodeExpiry = parsed.pairCodeExpiry;
        if (parsed.trustGrants) Object.entries(parsed.trustGrants).forEach(([k, v]) => this.trustGrants.set(k, v));
      }
    } catch (err) {
      console.warn("Failed to load device fabric:", err);
    }
  }

  save() {
    try {
      safeStorage.setItem("hey_device_fabric", JSON.stringify({
        devices: Object.fromEntries(this.devices),
        localDeviceId: this.localDeviceId,
        pairCode: this.pairCode,
        pairCodeExpiry: this.pairCodeExpiry,
        trustGrants: Object.fromEntries(this.trustGrants),
      }));
    } catch (err) {
      console.warn("Failed to save device fabric:", err);
    }
  }

  initializeLocalDevice() {
    if (!this.localDeviceId) {
      this.localDeviceId = generateDeviceId();
      this.registerDevice({
        id: this.localDeviceId,
        name: navigator.userAgent.includes("Mobile") ? "Mobile" : "Workstation",
        platform: navigator.platform,
        deviceType: navigator.userAgent.includes("Mobile") ? "phone" : "desktop",
        capabilities: this.getLocalCapabilities(),
        status: "online",
        trusted: true,
        role: DEVICE_ROLES.WORKSTATION,
        lastSeen: new Date().toISOString(),
      });
    }
  }

  getLocalCapabilities() {
    return [
      "computer.open_url",
      "computer.navigate_browser",
      "computer.capture_screen",
      "computer.read_file",
      "computer.create_directory",
      "computer.open_app",
      "computer.close_app",
      "computer.execute_terminal",
      "computer.organize_files",
    ];
  }

  getDeviceId() {
    return this.localDeviceId;
  }

  getDeviceName() {
    const device = this.devices.get(this.localDeviceId);
    return device?.name || "Unknown Device";
  }

  renameDevice(name) {
    const device = this.devices.get(this.localDeviceId);
    if (device) {
      device.name = name;
      device.updatedAt = new Date().toISOString();
      this.devices.set(this.localDeviceId, device);
      this.save();
    }
    return name;
  }

  registerDevice(input) {
    const device = {
      id: input.id,
      name: input.name,
      platform: input.platform,
      deviceType: input.deviceType,
      capabilities: input.capabilities || [],
      status: input.status || "online",
      trusted: input.trusted || false,
      role: input.role || DEVICE_ROLES.MOBILE,
      keyId: input.keyId || generateDeviceId(),
      lastSeen: new Date().toISOString(),
      revokedAt: null,
      syncCategories: input.syncCategories || [],
      metadata: input.metadata || {},
    };

    this.devices.set(device.id, device);
    this.save();
    this.notify("device_registered", device);
    return device;
  }

  getDevice(id) {
    return this.devices.get(id) || null;
  }

  getAllDevices() {
    return Array.from(this.devices.values());
  }

  getTrustedDevices() {
    return this.getAllDevices().filter(d => d.trusted && d.status !== "revoked");
  }

  getDeviceCapabilities(id) {
    const device = this.devices.get(id);
    return device?.capabilities || [];
  }

  producePairCode() {
    this.pairCode = generatePairCode();
    this.pairCodeExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    this.save();
    this.notify("pair_code_generated", { code: this.pairCode, expiresAt: this.pairCodeExpiry });
    return this.pairCode;
  }

  getPairCode() {
    if (this.pairCode && new Date(this.pairCodeExpiry) > new Date()) {
      return this.pairCode;
    }
    return null;
  }

  registerPairCode(code, deviceInfo) {
    if (code !== this.pairCode || new Date(this.pairCodeExpiry) <= new Date()) {
      return { error: "Invalid or expired pair code" };
    }

    const device = this.registerDevice({
      ...deviceInfo,
      trusted: true,
      status: "online",
    });

    this.createTrustGrant(device.id, "pairing");
    this.pairCode = null;
    this.pairCodeExpiry = null;
    this.save();
    
    this.notify("device_paired", { device, code });
    return { success: true, device };
  }

  createTrustGrant(deviceId, reason) {
    const grant = {
      id: `grant_${Date.now()}`,
      deviceId,
      reason,
      capabilities: this.devices.get(deviceId)?.capabilities || [],
      createdAt: new Date().toISOString(),
      expiresAt: null,
      revokedAt: null,
    };
    this.trustGrants.set(deviceId, grant);
    this.save();
    return grant;
  }

  revokeDevice(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) return { error: "Device not found" };

    device.trusted = false;
    device.revokedAt = new Date().toISOString();
    device.status = "revoked";
    
    if (this.trustGrants.has(deviceId)) {
      this.trustGrants.get(deviceId).revokedAt = new Date().toISOString();
    }
    
    this.devices.set(deviceId, device);
    this.save();
    
    this.notify("device_revoked", { deviceId });
    publish("fabric.device_revoked", { deviceId });
    recordAudit({ action: "fabric.device_revoked", status: "completed", metadata: { deviceId } });
    
    return { success: true };
  }

  listPeers() {
    return this.getTrustedDevices().map(d => ({
      id: d.id,
      name: d.name,
      deviceType: d.deviceType,
      platform: d.platform,
      role: d.role,
      capabilities: d.capabilities,
      lastSeen: d.lastSeen,
      status: d.status,
    }));
  }

  requestHandoff(input = {}) {
    const sourceDevice = this.devices.get(this.localDeviceId);
    const targetDevice = input.targetDeviceId ? this.devices.get(input.targetDeviceId) : null;

    if (!sourceDevice) return { success: false, reason: "Local device is not registered" };
    if (!targetDevice) return { success: false, reason: "No reachable device to hand off to in this runtime" };
    if (!input.targetDeviceId) return { success: false, reason: "Handoff requires a trusted target device" };
    if (!targetDevice.trusted) return { success: false, reason: "Target device not trusted" };

    const handoffId = generateHandoffId();
    const handoff = {
      id: handoffId,
      sourceDeviceId: this.localDeviceId,
      targetDeviceId: input.targetDeviceId,
      note: input.note,
      state: input.state || {},
      privacyLabels: input.privacyLabels || [],
      excludedContent: input.excludedContent || [],
      status: "preparing",
      createdAt: new Date().toISOString(),
      acknowledgedAt: null,
      completedAt: null,
    };

    this.handoffs.set(handoffId, handoff);
    this.save();
    this.notify("handoff_requested", handoff);
    return { success: true, handoff };
  }

  getHandoffBundle(handoffId) {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) return { error: "Handoff not found" };

    return {
      state: handoff.state,
      privacyLabels: handoff.privacyLabels,
      excludedContent: handoff.excludedContent,
      note: handoff.note,
    };
  }

  acceptHandoff(handoffId) {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) return { error: "Handoff not found" };

    handoff.status = "acknowledged";
    handoff.acknowledgedAt = new Date().toISOString();
    this.handoffs.set(handoffId, handoff);
    this.save();
    
    this.notify("handoff_accepted", handoff);
    return { success: true, handoff };
  }

  completeHandoff(handoffId) {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) return { error: "Handoff not found" };

    handoff.status = "completed";
    handoff.completedAt = new Date().toISOString();
    this.handoffs.set(handoffId, handoff);
    this.save();
    
    this.notify("handoff_completed", handoff);
    return { success: true, handoff };
  }

  clearHandoffBundle(handoffId) {
    this.handoffs.delete(handoffId);
    this.save();
  }

  syncCapabilities(deviceId, capabilities) {
    const device = this.devices.get(deviceId);
    if (device) {
      device.capabilities = capabilities;
      device.lastSeen = new Date().toISOString();
      this.devices.set(deviceId, device);
      this.save();
    }
  }

  getSyncCategories(deviceId) {
    const device = this.devices.get(deviceId);
    return device?.syncCategories || [];
  }

  setSyncCategories(deviceId, categories) {
    const device = this.devices.get(deviceId);
    if (device) {
      device.syncCategories = categories;
      device.updatedAt = new Date().toISOString();
      this.devices.set(deviceId, device);
      this.save();
    }
  }

  getCapabilitySnapshot(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) return null;

    return {
      deviceId: device.id,
      capabilities: device.capabilities,
      role: device.role,
      platform: device.platform,
      deviceType: device.deviceType,
      capturedAt: new Date().toISOString(),
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Device fabric listener error:", err); }
    });
  }
}

export const deviceFabricEngine = new DeviceFabricEngine();

export function getDeviceId() {
  return deviceFabricEngine.getDeviceId();
}

export function getDeviceName() {
  return deviceFabricEngine.getDeviceName();
}

export function renameDevice(name) {
  return deviceFabricEngine.renameDevice(name);
}

export function startFabric() {
  return { success: true, deviceId: deviceFabricEngine.getDeviceId() };
}

export function listPeers() {
  return deviceFabricEngine.listPeers();
}

export function requestHandoff(input) {
  return deviceFabricEngine.requestHandoff(input);
}

export function getHandoffBundle(handoffId) {
  return deviceFabricEngine.getHandoffBundle(handoffId);
}

export function clearHandoffBundle(handoffId) {
  return deviceFabricEngine.clearHandoffBundle(handoffId);
}

export function acceptHandoff(handoffId) {
  return deviceFabricEngine.acceptHandoff(handoffId);
}

export function producePairCode() {
  return deviceFabricEngine.producePairCode();
}

export function registerPairCode(code, deviceInfo) {
  return deviceFabricEngine.registerPairCode(code, deviceInfo);
}

export function getPairCode() {
  return deviceFabricEngine.getPairCode();
}

export function getDevice(id) {
  return deviceFabricEngine.getDevice(id);
}

export function getAllDevices() {
  return deviceFabricEngine.getAllDevices();
}

export function getDeviceCapabilities(id) {
  return deviceFabricEngine.getDeviceCapabilities(id);
}

export function subscribeToDeviceFabric(listener) {
  return deviceFabricEngine.subscribe(listener);
}

export { DEVICE_ROLES, TRUST_STATES, SYNC_CATEGORIES };

export default deviceFabricEngine;
