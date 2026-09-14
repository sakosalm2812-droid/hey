import { publish } from "./eventBus.js";

const TRUST_STATES = Object.freeze({
  SECURE: "secure",
  ATTENTION_REQUIRED: "attention_required",
  REVOKING: "revoking",
  RECONCILING: "reconciling",
});

const EXPORT_STATES = Object.freeze({
  QUEUED: "queued",
  BUILDING: "building",
  READY: "ready",
  EXPIRED: "expired",
});

const DELETION_STATES = Object.freeze({
  REQUESTED: "requested",
  SUPPRESSED: "suppressed",
  PURGING: "purging",
  REMOTE_PENDING: "remote_pending",
  BACKUP_EXPIRY_PENDING: "backup_expiry_pending",
  COMPLETED: "completed",
});

class TrustCenterEngine {
  constructor() {
    this.micActive = false;
    this.cameraActive = false;
    this.screenActive = false;
    this.backgroundServices = new Map();
    this.connectedAccounts = new Map();
    this.trustedDevices = new Map();
    this.activeGrants = new Map();
    this.agentsWithAuthority = new Map();
    this.activeWorkflows = new Map();
    this.sensitiveActions = [];
    this.cosmosCategories = new Map();
    this.processingLocations = new Map();
    this.securityAlerts = [];
    this.exports = new Map();
    this.deletions = new Map();
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = localStorage.getItem("hey_trust_center");
      if (stored) {
        const parsed = JSON.parse(stored);
        this.backgroundServices = new Map(Object.entries(parsed.backgroundServices || {}));
        this.connectedAccounts = new Map(Object.entries(parsed.connectedAccounts || {}));
        this.trustedDevices = new Map(Object.entries(parsed.trustedDevices || {}));
        this.activeGrants = new Map(Object.entries(parsed.activeGrants || {}));
        this.agentsWithAuthority = new Map(Object.entries(parsed.agentsWithAuthority || {}));
        this.activeWorkflows = new Map(Object.entries(parsed.activeWorkflows || {}));
        this.sensitiveActions = parsed.sensitiveActions || [];
        this.cosmosCategories = new Map(Object.entries(parsed.cosmosCategories || {}));
        this.processingLocations = new Map(Object.entries(parsed.processingLocations || {}));
        this.securityAlerts = parsed.securityAlerts || [];
        this.exports = new Map(Object.entries(parsed.exports || {}));
        this.deletions = new Map(Object.entries(parsed.deletions || {}));
      }
    } catch (err) {
      console.warn("Failed to load trust center:", err);
    }
  }

  save() {
    try {
      localStorage.setItem("hey_trust_center", JSON.stringify({
        backgroundServices: Object.fromEntries(this.backgroundServices),
        connectedAccounts: Object.fromEntries(this.connectedAccounts),
        trustedDevices: Object.fromEntries(this.trustedDevices),
        activeGrants: Object.fromEntries(this.activeGrants),
        agentsWithAuthority: Object.fromEntries(this.agentsWithAuthority),
        activeWorkflows: Object.fromEntries(this.activeWorkflows),
        sensitiveActions: this.sensitiveActions,
        cosmosCategories: Object.fromEntries(this.cosmosCategories),
        processingLocations: Object.fromEntries(this.processingLocations),
        securityAlerts: this.securityAlerts,
        exports: Object.fromEntries(this.exports),
        deletions: Object.fromEntries(this.deletions),
      }));
    } catch (err) {
      console.warn("Failed to save trust center:", err);
    }
  }

  setMicActive(active) {
    this.micActive = active;
    this.save();
    this.notify("mic_changed", { active });
    return { success: true, active };
  }

  setCameraActive(active) {
    this.cameraActive = active;
    this.save();
    this.notify("camera_changed", { active });
    return { success: true, active };
  }

  setScreenActive(active) {
    this.screenActive = active;
    this.save();
    this.notify("screen_changed", { active });
    return { success: true, active };
  }

  getSensorStatus() {
    return {
      microphone: this.micActive,
      camera: this.cameraActive,
      screen: this.screenActive,
    };
  }

  addBackgroundService(input) {
    const service = {
      id: input.id,
      name: input.name,
      capability: input.capability,
      enabled: true,
      startedAt: new Date().toISOString(),
      status: "running",
    };
    this.backgroundServices.set(input.id, service);
    this.save();
    this.notify("background_service_added", service);
    return service;
  }

  removeBackgroundService(id) {
    this.backgroundServices.delete(id);
    this.save();
  }

  getBackgroundServices() {
    return Array.from(this.backgroundServices.values());
  }

  addConnectedAccount(input) {
    const account = {
      id: input.id,
      provider: input.provider,
      email: input.email,
      scopes: input.scopes || [],
      connectedAt: new Date().toISOString(),
      lastUsed: null,
    };
    this.connectedAccounts.set(input.id, account);
    this.save();
    return account;
  }

  removeConnectedAccount(id) {
    this.connectedAccounts.delete(id);
    this.save();
  }

  getConnectedAccounts() {
    return Array.from(this.connectedAccounts.values());
  }

  addTrustedDevice(input) {
    const device = {
      id: input.id,
      name: input.name,
      platform: input.platform,
      trustedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      capabilities: input.capabilities || [],
    };
    this.trustedDevices.set(input.id, device);
    this.save();
    return device;
  }

  removeTrustedDevice(id) {
    this.trustedDevices.delete(id);
    this.save();
  }

  getTrustedDevices() {
    return Array.from(this.trustedDevices.values());
  }

  addGrant(input) {
    const grant = {
      id: `grant_${Date.now()}`,
      permission: input.permission,
      scope: input.scope,
      grantedAt: new Date().toISOString(),
      expiresAt: input.expiresAt,
      capability: input.capability,
    };
    this.activeGrants.set(grant.id, grant);
    this.save();
    return grant;
  }

  revokeGrant(id) {
    this.activeGrants.delete(id);
    this.save();
  }

  getActiveGrants() {
    return Array.from(this.activeGrants.values());
  }

  addAgentWithAuthority(input) {
    const agent = {
      id: input.id,
      name: input.name,
      capabilities: input.capabilities || [],
      permissions: input.permissions || [],
      grantedAt: new Date().toISOString(),
    };
    this.agentsWithAuthority.set(input.id, agent);
    this.save();
    return agent;
  }

  removeAgentWithAuthority(id) {
    this.agentsWithAuthority.delete(id);
    this.save();
  }

  getAgentsWithAuthority() {
    return Array.from(this.agentsWithAuthority.values());
  }

  addActiveWorkflow(input) {
    const workflow = {
      id: input.id,
      name: input.name,
      state: input.state,
      startedAt: new Date().toISOString(),
      permissions: input.permissions || [],
    };
    this.activeWorkflows.set(input.id, workflow);
    this.save();
    return workflow;
  }

  removeActiveWorkflow(id) {
    this.activeWorkflows.delete(id);
    this.save();
  }

  getActiveWorkflows() {
    return Array.from(this.activeWorkflows.values());
  }

  recordSensitiveAction(input) {
    const action = {
      id: `sens_${Date.now()}`,
      type: input.type,
      target: input.target,
      permission: input.permission,
      riskLevel: input.riskLevel,
      timestamp: new Date().toISOString(),
      status: input.status,
    };
    this.sensitiveActions.unshift(action);
    if (this.sensitiveActions.length > 100) this.sensitiveActions.pop();
    this.save();
    return action;
  }

  getSensitiveActions(limit = 50) {
    return this.sensitiveActions.slice(0, limit);
  }

  addCosmosCategory(input) {
    const category = {
      id: input.id,
      name: input.name,
      description: input.description,
      sensitivity: input.sensitivity || "medium",
      retention: input.retention || "default",
      itemCount: 0,
    };
    this.cosmosCategories.set(input.id, category);
    this.save();
    return category;
  }

  getCosmosCategories() {
    return Array.from(this.cosmosCategories.values());
  }

  setProcessingLocation(categoryId, location) {
    this.processingLocations.set(categoryId, location);
    this.save();
  }

  getProcessingLocations() {
    return Object.fromEntries(this.processingLocations);
  }

  addSecurityAlert(input) {
    const alert = {
      id: `alert_${Date.now()}`,
      severity: input.severity,
      message: input.message,
      source: input.source,
      timestamp: new Date().toISOString(),
      acknowledged: false,
    };
    this.securityAlerts.unshift(alert);
    if (this.securityAlerts.length > 50) this.securityAlerts.pop();
    this.save();
    return alert;
  }

  acknowledgeAlert(alertId) {
    const alert = this.securityAlerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      this.save();
    }
  }

  getSecurityAlerts() {
    return this.securityAlerts;
  }

  requestExport(input) {
    const exportId = `exp_${Date.now()}`;
    const exportReq = {
      id: exportId,
      accountId: input.accountId,
      format: input.format || "json",
      include: input.include || ["all"],
      state: "queued",
      requestedAt: new Date().toISOString(),
      readyAt: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      downloadUrl: null,
    };
    this.exports.set(exportId, exportReq);
    this.save();
    this.processExport(exportId);
    return exportReq;
  }

  processExport(exportId) {
    const exportReq = this.exports.get(exportId);
    if (!exportReq) return;
    exportReq.state = "building";
    this.save();
    setTimeout(() => {
      exportReq.state = "ready";
      exportReq.downloadUrl = `/api/exports/${exportId}/download`;
      exportReq.readyAt = new Date().toISOString();
      this.exports.set(exportId, exportReq);
      this.save();
      this.notify("export_ready", exportReq);
    }, 5000);
  }

  getExport(id) {
    return this.exports.get(id) || null;
  }

  getExports(accountId) {
    return Array.from(this.exports.values()).filter(e => e.accountId === accountId);
  }

  requestDeletion(input) {
    const deletionId = `del_${Date.now()}`;
    const deletion = {
      id: deletionId,
      accountId: input.accountId,
      reason: input.reason,
      state: "requested",
      requestedAt: new Date().toISOString(),
      suppressedAt: null,
      purgingAt: null,
      remotePendingAt: null,
      backupExpiryAt: null,
      completedAt: null,
      scope: input.scope || "all",
    };
    this.deletions.set(deletionId, deletion);
    this.save();
    this.processDeletion(deletionId);
    return deletion;
  }

  processDeletion(deletionId) {
    const deletion = this.deletions.get(deletionId);
    if (!deletion) return;
    deletion.state = "suppressed";
    deletion.suppressedAt = new Date().toISOString();
    this.save();
    setTimeout(() => {
      deletion.state = "purging";
      deletion.purgingAt = new Date().toISOString();
      this.save();
    }, 1000);
    setTimeout(() => {
      deletion.state = "remote_pending";
      deletion.remotePendingAt = new Date().toISOString();
      this.save();
    }, 2000);
    setTimeout(() => {
      deletion.state = "backup_expiry_pending";
      deletion.backupExpiryAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      this.save();
    }, 3000);
    setTimeout(() => {
      deletion.state = "completed";
      deletion.completedAt = new Date().toISOString();
      this.save();
      this.notify("deletion_completed", deletion);
    }, 4000);
  }

  getDeletion(id) {
    return this.deletions.get(id) || null;
  }

  getDeletions(accountId) {
    return Array.from(this.deletions.values()).filter(d => d.accountId === accountId);
  }

  stopEverything() {
    this.micActive = false;
    this.cameraActive = false;
    this.screenActive = false;

    this.backgroundServices.forEach(service => {
      service.enabled = false;
      service.status = "stopped";
    });

    this.activeGrants.forEach(grant => {
      if (grant.expiresAt && new Date(grant.expiresAt) > new Date()) {
        grant.revoked = true;
      }
    });

    this.activeWorkflows.forEach(workflow => {
      workflow.state = "paused";
    });

    this.save();
    this.notify("stop_everything", {});
    publish("trust.stop_everything", {});
    return { success: true };
  }

  revokeAll() {
    this.connectedAccounts.clear();
    this.trustedDevices.clear();
    this.activeGrants.clear();
    this.agentsWithAuthority.clear();
    this.activeWorkflows.clear();
    this.save();
    this.notify("revoke_all", {});
    return { success: true };
  }

  getTrustState() {
    return {
      sensors: this.getSensorStatus(),
      backgroundServices: this.getBackgroundServices().length,
      connectedAccounts: this.connectedAccounts.size,
      trustedDevices: this.trustedDevices.size,
      activeGrants: this.activeGrants.size,
      agentsWithAuthority: this.agentsWithAuthority.size,
      activeWorkflows: this.activeWorkflows.size,
      sensitiveActions: this.sensitiveActions.length,
      cosmosCategories: this.cosmosCategories.size,
      securityAlerts: this.securityAlerts.filter(a => !a.acknowledged).length,
      exports: this.exports.size,
      deletions: this.deletions.size,
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Trust Center listener error:", err); }
    });
  }
}

export const trustCenterEngine = new TrustCenterEngine();

export function setMicActive(active) {
  return trustCenterEngine.setMicActive(active);
}

export function setCameraActive(active) {
  return trustCenterEngine.setCameraActive(active);
}

export function setScreenActive(active) {
  return trustCenterEngine.setScreenActive(active);
}

export function getSensorStatus() {
  return trustCenterEngine.getSensorStatus();
}

export function addBackgroundService(input) {
  return trustCenterEngine.addBackgroundService(input);
}

export function removeBackgroundService(id) {
  return trustCenterEngine.removeBackgroundService(id);
}

export function getBackgroundServices() {
  return trustCenterEngine.getBackgroundServices();
}

export function addConnectedAccount(input) {
  return trustCenterEngine.addConnectedAccount(input);
}

export function removeConnectedAccount(id) {
  return trustCenterEngine.removeConnectedAccount(id);
}

export function getConnectedAccounts() {
  return trustCenterEngine.getConnectedAccounts();
}

export function addTrustedDevice(input) {
  return trustCenterEngine.addTrustedDevice(input);
}

export function removeTrustedDevice(id) {
  return trustCenterEngine.removeTrustedDevice(id);
}

export function getTrustedDevices() {
  return trustCenterEngine.getTrustedDevices();
}

export function addGrant(input) {
  return trustCenterEngine.addGrant(input);
}

export function revokeGrant(id) {
  return trustCenterEngine.revokeGrant(id);
}

export function getActiveGrants() {
  return trustCenterEngine.getActiveGrants();
}

export function addAgentWithAuthority(input) {
  return trustCenterEngine.addAgentWithAuthority(input);
}

export function removeAgentWithAuthority(id) {
  return trustCenterEngine.removeAgentWithAuthority(id);
}

export function getAgentsWithAuthority() {
  return trustCenterEngine.getAgentsWithAuthority();
}

export function addActiveWorkflow(input) {
  return trustCenterEngine.addActiveWorkflow(input);
}

export function removeActiveWorkflow(id) {
  return trustCenterEngine.removeActiveWorkflow(id);
}

export function getActiveWorkflows() {
  return trustCenterEngine.getActiveWorkflows();
}

export function recordSensitiveAction(input) {
  return trustCenterEngine.recordSensitiveAction(input);
}

export function getSensitiveActions(limit) {
  return trustCenterEngine.getSensitiveActions(limit);
}

export function addCosmosCategory(input) {
  return trustCenterEngine.addCosmosCategory(input);
}

export function getCosmosCategories() {
  return trustCenterEngine.getCosmosCategories();
}

export function setProcessingLocation(categoryId, location) {
  return trustCenterEngine.setProcessingLocation(categoryId, location);
}

export function getProcessingLocations() {
  return trustCenterEngine.getProcessingLocations();
}

export function addSecurityAlert(input) {
  return trustCenterEngine.addSecurityAlert(input);
}

export function acknowledgeAlert(alertId) {
  return trustCenterEngine.acknowledgeAlert(alertId);
}

export function getSecurityAlerts() {
  return trustCenterEngine.getSecurityAlerts();
}

export function requestExport(input) {
  return trustCenterEngine.requestExport(input);
}

export function getExport(id) {
  return trustCenterEngine.getExport(id);
}

export function getExports(accountId) {
  return trustCenterEngine.getExports(accountId);
}

export function requestDeletion(input) {
  return trustCenterEngine.requestDeletion(input);
}

export function getDeletion(id) {
  return trustCenterEngine.getDeletion(id);
}

export function getDeletions(accountId) {
  return trustCenterEngine.getDeletions(accountId);
}

export function stopEverything() {
  return trustCenterEngine.stopEverything();
}

export function revokeAll() {
  return trustCenterEngine.revokeAll();
}

export function getTrustState() {
  return trustCenterEngine.getTrustState();
}

export function subscribeToTrustCenter(listener) {
  return trustCenterEngine.subscribe(listener);
}

export { TRUST_STATES, EXPORT_STATES, DELETION_STATES };
export default trustCenterEngine;