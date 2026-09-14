import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";
import { getSetting, setSetting } from "./settingsRegistry.js";

const MODES = Object.freeze({
  STUDY: "study",
  CREATOR: "creator",
  CODING: "coding",
  RESEARCH: "research",
  BUSINESS: "business",
  FOCUS: "focus",
  MEETING: "meeting",
  PRESENTATION: "presentation",
  TRAVEL: "travel",
  MORNING: "morning",
  LATE_NIGHT: "late_night",
  ACCESSIBILITY: "accessibility",
  PRIVATE: "private",
  OFFLINE: "offline",
  EXECUTION: "execution",
});

const PRECEDENCE = Object.freeze({
  SECURITY: 100,
  PROJECT: 80,
  DEVICE: 60,
  MODE: 40,
  SETTING: 20,
});

function generateModeProfileId() {
  return `mode_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class ModeEngine {
  constructor() {
    this.currentMode = getSetting("mode.current") || MODES.EXECUTION;
    this.profiles = new Map();
    this.overrides = new Map();
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = localStorage.getItem("hey_modes");
      if (stored) {
        const parsed = JSON.parse(stored);
        this.currentMode = parsed.currentMode || this.currentMode;
        if (parsed.profiles) Object.entries(parsed.profiles).forEach(([k, v]) => this.profiles.set(k, v));
        if (parsed.overrides) Object.entries(parsed.overrides).forEach(([k, v]) => this.overrides.set(k, v));
      }
    } catch (err) {
      console.warn("Failed to load modes:", err);
    }
  }

  save() {
    try {
      localStorage.setItem("hey_modes", JSON.stringify({
        currentMode: this.currentMode,
        profiles: Object.fromEntries(this.profiles),
        overrides: Object.fromEntries(this.overrides),
      }));
    } catch (err) {
      console.warn("Failed to save modes:", err);
    }
  }

  getCurrentMode() {
    return this.currentMode;
  }

  setMode(mode) {
    if (!Object.values(MODES).includes(mode)) {
      return { error: "Invalid mode" };
    }

    const oldMode = this.currentMode;
    this.currentMode = mode;
    setSetting("mode.current", mode);
    this.save();
    
    this.notify("mode_changed", { oldMode, newMode: mode });
    publish("mode.changed", { oldMode, newMode: mode });
    recordAudit({ action: "mode.changed", status: "completed", metadata: { oldMode, newMode: mode } });
    
    return { success: true, mode };
  }

  createProfile(input) {
    const profileId = generateModeProfileId();
    const profile = {
      id: profileId,
      name: input.name,
      mode: input.mode,
      workspace: input.workspace || {},
      widgets: input.widgets || {},
      agentTeam: input.agentTeam || null,
      providerPriorities: input.providerPriorities || {},
      notificationRules: input.notificationRules || {},
      shortcuts: input.shortcuts || {},
      islandModules: input.islandModules || [],
      personality: input.personality || {},
      voice: input.voice || {},
      proactivity: input.proactivity || {},
      privacy: input.privacy || {},
      gestureProfile: input.gestureProfile || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.profiles.set(profileId, profile);
    this.save();
    return profile;
  }

  getProfile(id) {
    return this.profiles.get(id) || null;
  }

  getAllProfiles() {
    return Array.from(this.profiles.values());
  }

  getProfileForMode(mode) {
    return Array.from(this.profiles.values()).find(p => p.mode === mode);
  }

  applyProfile(profileId) {
    const profile = this.profiles.get(profileId);
    if (!profile) return { error: "Profile not found" };

    this.setMode(profile.mode);
    
    const overrides = {};
    Object.entries(profile).forEach(([key, value]) => {
      if (key !== "id" && key !== "mode" && key !== "createdAt" && key !== "updatedAt") {
        overrides[key] = value;
      }
    });

    this.overrides.set(profile.mode, overrides);
    this.save();
    
    this.notify("profile_applied", { profileId, mode: profile.mode });
    return { success: true, mode: profile.mode };
  }

  setOverride(key, value, scope = "mode") {
    const mode = this.currentMode;
    if (!this.overrides.has(mode)) this.overrides.set(mode, {});
    
    const modeOverrides = this.overrides.get(mode);
    modeOverrides[key] = { value, scope, timestamp: new Date().toISOString() };
    this.overrides.set(mode, modeOverrides);
    this.save();
    
    publish("mode.override_set", { mode, key, value, scope });
    return { success: true };
  }

  getOverride(key, scope = "mode") {
    const mode = this.currentMode;
    const modeOverrides = this.overrides.get(mode);
    const record = modeOverrides?.[key];
    if (!record) return undefined;
    if (scope && record.scope && record.scope !== scope) return undefined;
    return record.value;
  }

  getEffectiveValue(key, context = {}) {
    const mode = this.currentMode;
    const modeOverrides = this.overrides.get(mode);
    
    if (modeOverrides?.[key]?.value !== undefined) {
      return { value: modeOverrides[key].value, source: "mode_override" };
    }
    
    const profile = this.getProfileForMode(mode);
    if (profile?.[key] !== undefined) {
      return { value: profile[key], source: "profile" };
    }
    
    const projectRule = context.project?.[key];
    if (projectRule !== undefined) return { value: projectRule, source: "project" };
    
    const deviceConstraint = context.device?.[key];
    if (deviceConstraint !== undefined) return { value: deviceConstraint, source: "device" };
    
    const securityRestriction = context.security?.[key];
    if (securityRestriction !== undefined) return { value: securityRestriction, source: "security" };
    
    return { value: getSetting(key), source: "default" };
  }

  snapshotOverrides() {
    const mode = this.currentMode;
    return { ...this.overrides.get(mode) };
  }

  restoreOverrides(snapshot) {
    const mode = this.currentMode;
    this.overrides.set(mode, snapshot);
    this.save();
  }

  exportMode(mode) {
    const profile = this.getProfileForMode(mode);
    if (!profile) return null;

    return {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      mode: profile.mode,
      profile: { ...profile },
    };
  }

  importMode(data, options = {}) {
    if (!data?.profile) return { error: "Invalid import data" };

    const profile = data.profile;
    const mode = profile.mode;
    
    if (!options.overwrite && this.profiles.has(mode)) {
      return { error: "Profile exists for this mode" };
    }

    this.profiles.set(mode, { ...profile, updatedAt: new Date().toISOString() });
    this.save();
    
    this.notify("profile_imported", { mode, profile });
    return { success: true, mode };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Mode listener error:", err); }
    });
  }
}

export const modeEngine = new ModeEngine();

export function getCurrentMode() {
  return modeEngine.getCurrentMode();
}

export function setMode(mode) {
  return modeEngine.setMode(mode);
}

export function createModeProfile(input) {
  return modeEngine.createProfile(input);
}

export function getModeProfile(id) {
  return modeEngine.getProfile(id);
}

export function getAllModeProfiles() {
  return modeEngine.getAllProfiles();
}

export function getModeProfileForMode(mode) {
  return modeEngine.getProfileForMode(mode);
}

export function applyModeProfile(profileId) {
  return modeEngine.applyProfile(profileId);
}

export function setModeOverride(key, value, scope) {
  return modeEngine.setOverride(key, value, scope);
}

export function getModeOverride(key, scope) {
  return modeEngine.getOverride(key, scope);
}

export function getModeEffectiveValue(key, context) {
  return modeEngine.getEffectiveValue(key, context);
}

export function snapshotModeOverrides() {
  return modeEngine.snapshotOverrides();
}

export function restoreModeOverrides(snapshot) {
  return modeEngine.restoreOverrides(snapshot);
}

export function exportMode(mode) {
  return modeEngine.exportMode(mode);
}

export function importMode(data, options) {
  return modeEngine.importMode(data, options);
}

export function subscribeToModes(listener) {
  return modeEngine.subscribe(listener);
}

export { MODES, PRECEDENCE };

export default modeEngine;