import { publish } from "./eventBus.js";
import { getSetting } from "./settingsRegistry.js";
import { safeStorage } from "../lib/safeStorage.js";

const ISLAND_STATES = Object.freeze({
  HIDDEN: "hidden",
  COMPACT: "compact",
  EXPANDED: "expanded",
  FULL_APP_REQUESTED: "full_app_requested",
  DISCONNECTED_HELPER: "disconnected_helper",
});

const ACTIVITY_TYPES = Object.freeze({
  TASK: "task",
  WORKFLOW: "workflow",
  AGENT: "agent",
  TIMER: "timer",
  REMINDER: "reminder",
  MEDIA: "media",
  DOWNLOAD: "download",
  UPLOAD: "upload",
  FILE_TRANSFER: "file_transfer",
  NOTIFICATION: "notification",
  PENDING_CONFIRMATION: "pending_confirmation",
  SUCCESS: "success",
  ERROR: "error",
  RECOVERY: "recovery",
  DEVICE_HANDOFF: "device_handoff",
  CALENDAR_EVENT: "calendar_event",
  PRAYER_COUNTDOWN: "prayer_countdown",
  GENERATION: "generation",
  RENDER: "render",
  RESEARCH: "research",
  LISTENING: "listening",
  THINKING: "thinking",
  SPEAKING: "speaking",
  MUTED: "muted",
  CUSTOM: "custom",
});

const MODULES = Object.freeze({
  STATE: "state",
  TIMER: "timer",
  MEDIA: "media",
  NOTIFICATIONS: "notifications",
  CONTROLS: "controls",
  CALENDAR: "calendar",
  PRAYER: "prayer",
  CUSTOM: "custom",
});

function generateIslandId() {
  return `island_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateActivityId() {
  return `activity_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateModuleId() {
  return `module_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class DynamicIslandEngine {
  constructor() {
    this.islands = new Map();
    this.defaultIsland = null;
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = safeStorage.getItem("hey_dynamic_island");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.islands) {
          Object.entries(parsed.islands).forEach(([id, island]) => {
            island.activities = new Map(Object.entries(island.activities || {}));
            island.modules = new Map(Object.entries(island.modules || {}));
            this.islands.set(id, island);
          });
        }
        this.defaultIsland = parsed.defaultIsland;
      }
    } catch (err) {
      console.warn("Failed to load Dynamic Island:", err);
    }
  }

  save() {
    try {
      safeStorage.setItem("hey_dynamic_island", JSON.stringify({
        islands: Object.fromEntries(this.islands),
        defaultIsland: this.defaultIsland,
      }));
    } catch (err) {
      console.warn("Failed to save Dynamic Island:", err);
    }
  }

  createIsland(input = {}) {
    const islandId = generateIslandId();
    const now = new Date().toISOString();
    
    const island = {
      id: islandId,
      name: input.name || "Dynamic Island",
      state: ISLAND_STATES.COMPACT,
      position: input.position || { x: "center", y: "top" },
      monitor: input.monitor || "primary",
      size: input.size || { width: 300, height: 40 },
      opacity: input.opacity || getSetting("island.opacity") || 0.9,
      autoHide: input.autoHide !== false,
      idleBehavior: input.idleBehavior || "show_state",
      contentModules: input.contentModules || [MODULES.STATE, MODULES.TIMER, MODULES.NOTIFICATIONS],
      animation: input.animation !== false,
      textMode: input.textMode || "icon",
      alwaysOnTop: input.alwaysOnTop !== false,
      notificationPriority: input.notificationPriority || "normal",
      theme: input.theme || getSetting("appearance.theme") || "refined-dark",
      activities: new Map(),
      modules: new Map(),
      expanded: false,
      createdAt: now,
      updatedAt: now,
      lastInteraction: null,
    };

    this.islands.set(islandId, island);
    
    if (!this.defaultIsland) {
      this.defaultIsland = islandId;
    }
    
    this.save();
    this.notify("island_created", island);
    return island;
  }

  getIsland(id) {
    return this.islands.get(id) || null;
  }

  getDefaultIsland() {
    if (this.defaultIsland) return this.islands.get(this.defaultIsland);
    const first = this.islands.values().next().value;
    return first || null;
  }

  getAllIslands() {
    return Array.from(this.islands.values());
  }

  updateIslandSettings(id, updates) {
    const island = this.islands.get(id);
    if (!island) return null;

    const updated = { ...island, ...updates, updatedAt: new Date().toISOString() };
    this.islands.set(id, updated);
    this.save();
    this.notify("settings_updated", updated);
    return updated;
  }

  addActivity(islandId, input) {
    const island = this.islands.get(islandId);
    if (!island) return { error: "Island not found" };

    const activityId = generateActivityId();
    const activity = {
      id: activityId,
      type: input.type || ACTIVITY_TYPES.CUSTOM,
      title: input.title || "",
      message: input.message || "",
      progress: input.progress || null,
      progressMax: input.progressMax || 100,
      actions: input.actions || [],
      priority: input.priority || "normal",
      persistent: input.persistent || false,
      expiresAt: input.expiresAt || null,
      metadata: input.metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dismissed: false,
      pinned: false,
    };

    island.activities.set(activityId, activity);
    island.updatedAt = new Date().toISOString();
    this.save();
    
    this.notify("activity_added", { islandId, activity });
    publish("island.activity_added", { islandId, activity });
    
    if (island.autoHide && island.state === ISLAND_STATES.HIDDEN) {
      this.setIslandState(islandId, ISLAND_STATES.COMPACT);
    }
    
    return activity;
  }

  updateActivity(islandId, activityId, updates) {
    const island = this.islands.get(islandId);
    if (!island) return { error: "Island not found" };

    const activity = island.activities.get(activityId);
    if (!activity) return { error: "Activity not found" };

    const updated = { ...activity, ...updates, updatedAt: new Date().toISOString() };
    island.activities.set(activityId, updated);
    island.updatedAt = new Date().toISOString();
    this.save();
    
    this.notify("activity_updated", { islandId, activity: updated });
    publish("island.activity_updated", { islandId, activity: updated });
    
    return updated;
  }

  removeActivity(islandId, activityId) {
    const island = this.islands.get(islandId);
    if (!island) return { error: "Island not found" };

    island.activities.delete(activityId);
    island.updatedAt = new Date().toISOString();
    this.save();
    
    this.notify("activity_removed", { islandId, activityId });
    return { success: true };
  }

  dismissActivity(islandId, activityId) {
    return this.updateActivity(islandId, activityId, { dismissed: true });
  }

  pinActivity(islandId, activityId) {
    return this.updateActivity(islandId, activityId, { pinned: true });
  }

  unpinActivity(islandId, activityId) {
    return this.updateActivity(islandId, activityId, { pinned: false });
  }

  setIslandState(islandId, state) {
    const island = this.islands.get(islandId);
    if (!island) return { error: "Island not found" };
    if (!Object.values(ISLAND_STATES).includes(state)) return { error: "Invalid state" };

    const oldState = island.state;
    island.state = state;
    island.updatedAt = new Date().toISOString();
    this.save();
    
    this.notify("state_changed", { islandId, oldState, newState: state });
    publish("island.state_changed", { islandId, oldState, newState: state });
    
    return { success: true, state };
  }

  toggleExpanded(islandId) {
    const island = this.islands.get(islandId);
    if (!island) return { error: "Island not found" };

    island.expanded = !island.expanded;
    island.updatedAt = new Date().toISOString();
    this.save();
    
    this.notify("expanded_toggled", { islandId, expanded: island.expanded });
    return { success: true, expanded: island.expanded };
  }

  handleInteraction(islandId, interaction) {
    const island = this.islands.get(islandId);
    if (!island) return { error: "Island not found" };

    island.lastInteraction = new Date().toISOString();
    
    if (interaction.type === "click" && island.state === ISLAND_STATES.COMPACT) {
      this.setIslandState(islandId, ISLAND_STATES.EXPANDED);
    } else if (interaction.type === "click" && island.state === ISLAND_STATES.EXPANDED) {
      if (interaction.target === "background") {
        this.setIslandState(islandId, ISLAND_STATES.COMPACT);
      }
    }
    
    publish("island.interaction", { islandId, interaction });
    return { success: true };
  }

  addModule(islandId, input) {
    const island = this.islands.get(islandId);
    if (!island) return { error: "Island not found" };

    const moduleId = generateModuleId();
    const module = {
      id: moduleId,
      type: input.type || MODULES.CUSTOM,
      title: input.title || "",
      content: input.content || {},
      enabled: input.enabled !== false,
      order: input.order || island.modules.size,
      createdAt: new Date().toISOString(),
    };

    island.modules.set(moduleId, module);
    island.updatedAt = new Date().toISOString();
    this.save();
    
    this.notify("module_added", { islandId, module });
    return module;
  }

  removeModule(islandId, moduleId) {
    const island = this.islands.get(islandId);
    if (!island) return { error: "Island not found" };

    island.modules.delete(moduleId);
    island.updatedAt = new Date().toISOString();
    this.save();
    
    return { success: true };
  }

  updateModule(islandId, moduleId, updates) {
    const island = this.islands.get(islandId);
    if (!island) return { error: "Island not found" };

    const module = island.modules.get(moduleId);
    if (!module) return { error: "Module not found" };

    const updated = { ...module, ...updates };
    island.modules.set(moduleId, updated);
    island.updatedAt = new Date().toISOString();
    this.save();
    
    return updated;
  }

  enableModule(islandId, moduleId) {
    return this.updateModule(islandId, moduleId, { enabled: true });
  }

  disableModule(islandId, moduleId) {
    return this.updateModule(islandId, moduleId, { enabled: false });
  }

  getVisibleActivities(islandId) {
    const island = this.islands.get(islandId);
    if (!island) return [];

    const now = new Date();
    return Array.from(island.activities.values())
      .filter(a => !a.dismissed && (!a.expiresAt || new Date(a.expiresAt) > now))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned - a.pinned;
        const priorityOrder = { high: 3, normal: 2, low: 1 };
        return (priorityOrder[b.priority] || 2) - (priorityOrder[a.priority] || 2);
      });
  }

  cleanupExpiredActivities(islandId) {
    const island = this.islands.get(islandId);
    if (!island) return 0;

    const now = new Date();
    let removed = 0;
    
    island.activities.forEach((activity, id) => {
      if (activity.expiresAt && new Date(activity.expiresAt) <= now) {
        island.activities.delete(id);
        removed++;
      }
    });
    
    if (removed > 0) {
      island.updatedAt = new Date().toISOString();
      this.save();
    }
    
    return removed;
  }

  completeActivity(islandId, activityId) {
    return this.updateActivity(islandId, activityId, { 
      progress: 100, 
      completedAt: new Date().toISOString(),
      dismissed: true,
    });
  }

  errorActivity(islandId, activityId, error) {
    return this.updateActivity(islandId, activityId, { 
      type: ACTIVITY_TYPES.ERROR,
      message: error,
      dismissed: false,
    });
  }

  destroyIsland(id) {
    const island = this.islands.get(id);
    if (!island) return false;

    if (this.defaultIsland === id) {
      const remaining = this.getAllIslands().find(i => i.id !== id);
      this.defaultIsland = remaining?.id || null;
    }

    this.islands.delete(id);
    this.save();
    this.notify("island_destroyed", { id });
    return true;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Dynamic Island listener error:", err); }
    });
  }
}

export const dynamicIslandEngine = new DynamicIslandEngine();

export function createDynamicIsland(input) {
  return dynamicIslandEngine.createIsland(input);
}

export function getDynamicIsland(id) {
  return dynamicIslandEngine.getIsland(id);
}

export function getDefaultDynamicIsland() {
  return dynamicIslandEngine.getDefaultIsland();
}

export function listDynamicIslands() {
  return dynamicIslandEngine.getAllIslands();
}

export function updateDynamicIslandSettings(id, updates) {
  return dynamicIslandEngine.updateIslandSettings(id, updates);
}

export function addIslandActivity(islandId, input) {
  return dynamicIslandEngine.addActivity(islandId, input);
}

export function updateIslandActivity(islandId, activityId, updates) {
  return dynamicIslandEngine.updateActivity(islandId, activityId, updates);
}

export function removeIslandActivity(islandId, activityId) {
  return dynamicIslandEngine.removeActivity(islandId, activityId);
}

export function dismissIslandActivity(islandId, activityId) {
  return dynamicIslandEngine.dismissActivity(islandId, activityId);
}

export function pinIslandActivity(islandId, activityId) {
  return dynamicIslandEngine.pinActivity(islandId, activityId);
}

export function unpinIslandActivity(islandId, activityId) {
  return dynamicIslandEngine.unpinActivity(islandId, activityId);
}

export function setIslandState(islandId, state) {
  return dynamicIslandEngine.setIslandState(islandId, state);
}

export function toggleIslandExpanded(islandId) {
  return dynamicIslandEngine.toggleExpanded(islandId);
}

export function handleIslandInteraction(islandId, interaction) {
  return dynamicIslandEngine.handleInteraction(islandId, interaction);
}

export function addIslandModule(islandId, input) {
  return dynamicIslandEngine.addModule(islandId, input);
}

export function removeIslandModule(islandId, moduleId) {
  return dynamicIslandEngine.removeModule(islandId, moduleId);
}

export function updateIslandModule(islandId, moduleId, updates) {
  return dynamicIslandEngine.updateModule(islandId, moduleId, updates);
}

export function enableIslandModule(islandId, moduleId) {
  return dynamicIslandEngine.enableModule(islandId, moduleId);
}

export function disableIslandModule(islandId, moduleId) {
  return dynamicIslandEngine.disableModule(islandId, moduleId);
}

export function getVisibleIslandActivities(islandId) {
  return dynamicIslandEngine.getVisibleActivities(islandId);
}

export function cleanupExpiredIslandActivities(islandId) {
  return dynamicIslandEngine.cleanupExpiredActivities(islandId);
}

export function completeIslandActivity(islandId, activityId) {
  return dynamicIslandEngine.completeActivity(islandId, activityId);
}

export function errorIslandActivity(islandId, activityId, error) {
  return dynamicIslandEngine.errorActivity(islandId, activityId, error);
}

export function destroyDynamicIsland(id) {
  return dynamicIslandEngine.destroyIsland(id);
}

export function subscribeToDynamicIsland(listener) {
  return dynamicIslandEngine.subscribe(listener);
}

export { ISLAND_STATES, ACTIVITY_TYPES, MODULES };

export default dynamicIslandEngine;
