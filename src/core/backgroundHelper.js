import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";
import { getSetting, setSetting } from "./settingsRegistry.js";
import { safeStorage } from "../lib/safeStorage.js";

const HELPER_STATES = Object.freeze({
  ABSENT: "absent",
  INSTALLING: "installing",
  STOPPED: "stopped",
  STARTING: "starting",
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  STOPPING: "stopping",
  RECOVERING: "recovering",
});

const BACKGROUND_CAPABILITIES = Object.freeze({
  WAKE_WORD: "wake_word",
  GLOBAL_SHORTCUTS: "global_shortcuts",
  DYNAMIC_ISLAND: "dynamic_island",
  NOTIFICATIONS: "notifications",
  REMINDERS: "reminders",
  TIMERS: "timers",
  SCHEDULED_WORKFLOWS: "scheduled_workflows",
  BACKGROUND_SYNC: "background_sync",
  COSMOS_SYNC: "cosmos_sync",
  AGENT_MISSIONS: "agent_missions",
  APPROVED_AUTOMATIONS: "approved_automations",
  DOWNLOADS_UPLOADS: "downloads_uploads",
  CLOUD_GENERATION: "cloud_generation",
  CLOUD_RESEARCH: "cloud_research",
  MEDIA_CONTROL: "media_control",
  DEVICE_HANDOFF: "device_handoff",
});

const CLOSE_BEHAVIORS = Object.freeze({
  KEEP_RUNNING: "keep_running",
  QUIT: "quit",
  ASK: "ask",
});

function generateTaskId() {
  return `bg_task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class BackgroundHelperEngine {
  constructor() {
    this.state = HELPER_STATES.ABSENT;
    this.enabledCapabilities = new Set();
    this.backgroundTasks = new Map();
    this.closeBehavior = getSetting("helper.keep_running_on_close") || CLOSE_BEHAVIORS.ASK;
    this.startAtLogin = getSetting("helper.start_at_login") || false;
    this.crashCount = 0;
    this.lastCrash = null;
    this.listeners = new Set();
    this.ipcServer = null;
    this.load();
  }

  load() {
    try {
      const stored = safeStorage.getItem("hey_background_helper");
      if (stored) {
        const parsed = JSON.parse(stored);
        this.enabledCapabilities = new Set(parsed.enabledCapabilities || []);
        this.closeBehavior = parsed.closeBehavior || this.closeBehavior;
        this.startAtLogin = parsed.startAtLogin || this.startAtLogin;
        this.crashCount = parsed.crashCount || 0;
        this.lastCrash = parsed.lastCrash || null;
      }
    } catch (err) {
      console.warn("Failed to load background helper:", err);
    }
  }

  save() {
    try {
      safeStorage.setItem("hey_background_helper", JSON.stringify({
        enabledCapabilities: Array.from(this.enabledCapabilities),
        closeBehavior: this.closeBehavior,
        startAtLogin: this.startAtLogin,
        crashCount: this.crashCount,
        lastCrash: this.lastCrash,
      }));
    } catch (err) {
      console.warn("Failed to save background helper:", err);
    }
  }

  async install() {
    if (this.state !== HELPER_STATES.ABSENT) return { error: "Already installed" };

    this.state = HELPER_STATES.INSTALLING;
    this.notify("state_changed", { state: this.state });

    try {
      await this.registerIPC();
      await this.registerGlobalShortcuts();
      await this.registerNotifications();
      await this.setupTrayMenu();
      
      this.state = HELPER_STATES.STOPPED;
      this.notify("state_changed", { state: this.state });
      
      publish("background.helper_installed", {});
      recordAudit({ action: "background.helper_installed", status: "completed", metadata: {} });
      
      return { success: true };
    } catch (error) {
      this.state = HELPER_STATES.ABSENT;
      this.notify("state_changed", { state: this.state, error: error.message });
      return { error: error.message };
    }
  }

  async start() {
    if (this.state === HEALTHY_STATES.HEALTHY) return { error: "Already running" };

    this.state = HELPER_STATES.STARTING;
    this.notify("state_changed", { state: this.state });

    try {
      await this.startCapabilities();
      this.state = HELPER_STATES.HEALTHY;
      this.crashCount = 0;
      this.notify("state_changed", { state: this.state });
      
      publish("background.helper_started", {});
      recordAudit({ action: "background.helper_started", status: "completed", metadata: {} });
      
      return { success: true };
    } catch (error) {
      this.state = HELPER_STATES.STOPPED;
      this.notify("state_changed", { state: this.state, error: error.message });
      return { error: error.message };
    }
  }

  async stop() {
    if (this.state === HELPER_STATES.STOPPED) return { error: "Already stopped" };

    this.state = HELPER_STATES.STOPPING;
    this.notify("state_changed", { state: this.state });

    try {
      await this.stopCapabilities();
      await this.cancelBackgroundTasks();
      
      this.state = HELPER_STATES.STOPPED;
      this.notify("state_changed", { state: this.state });
      
      publish("background.helper_stopped", {});
      recordAudit({ action: "background.helper_stopped", status: "completed", metadata: {} });
      
      return { success: true };
    } catch (error) {
      this.state = HELPER_STATES.DEGRADED;
      this.notify("state_changed", { state: this.state, error: error.message });
      return { error: error.message };
    }
  }

  pause() {
    if (this.state !== HELPER_STATES.HEALTHY) return { error: "Not running" };

    this.enabledCapabilities.forEach(cap => this.disableCapability(cap));
    this.notify("paused", {});
    return { success: true };
  }

  resume() {
    if (this.state !== HELPER_STATES.HEALTHY) return { error: "Not running" };

    this.enabledCapabilities.forEach(cap => this.enableCapability(cap));
    this.notify("resumed", {});
    return { success: true };
  }

  async startCapabilities() {
    for (const cap of this.enabledCapabilities) {
      await this.startCapability(cap);
    }
  }

  async stopCapabilities() {
    for (const cap of this.enabledCapabilities) {
      await this.stopCapability(cap);
    }
  }

  async startCapability(capability) {
    switch (capability) {
      case BACKGROUND_CAPABILITIES.WAKE_WORD:
        await this.startWakeWord();
        break;
      case BACKGROUND_CAPABILITIES.GLOBAL_SHORTCUTS:
        await this.startGlobalShortcuts();
        break;
      case BACKGROUND_CAPABILITIES.DYNAMIC_ISLAND:
        await this.startDynamicIsland();
        break;
      case BACKGROUND_CAPABILITIES.NOTIFICATIONS:
        await this.startNotifications();
        break;
      case BACKGROUND_CAPABILITIES.REMINDERS:
        await this.startReminders();
        break;
      case BACKGROUND_CAPABILITIES.TIMERS:
        await this.startTimers();
        break;
      case BACKGROUND_CAPABILITIES.SCHEDULED_WORKFLOWS:
        await this.startScheduledWorkflows();
        break;
      case BACKGROUND_CAPABILITIES.BACKGROUND_SYNC:
        await this.startBackgroundSync();
        break;
      case BACKGROUND_CAPABILITIES.COSMOS_SYNC:
        await this.startCosmosSync();
        break;
      case BACKGROUND_CAPABILITIES.AGENT_MISSIONS:
        await this.startAgentMissions();
        break;
      case BACKGROUND_CAPABILITIES.APPROVED_AUTOMATIONS:
        await this.startApprovedAutomations();
        break;
      case BACKGROUND_CAPABILITIES.DOWNLOADS_UPLOADS:
        await this.startDownloadsUploads();
        break;
      case BACKGROUND_CAPABILITIES.CLOUD_GENERATION:
        await this.startCloudGeneration();
        break;
      case BACKGROUND_CAPABILITIES.CLOUD_RESEARCH:
        await this.startCloudResearch();
        break;
      case BACKGROUND_CAPABILITIES.MEDIA_CONTROL:
        await this.startMediaControl();
        break;
      case BACKGROUND_CAPABILITIES.DEVICE_HANDOFF:
        await this.startDeviceHandoff();
        break;
    }
  }

  async stopCapability(capability) {
    switch (capability) {
      case BACKGROUND_CAPABILITIES.WAKE_WORD:
        await this.stopWakeWord();
        break;
      case BACKGROUND_CAPABILITIES.GLOBAL_SHORTCUTS:
        await this.stopGlobalShortcuts();
        break;
      case BACKGROUND_CAPABILITIES.DYNAMIC_ISLAND:
        await this.stopDynamicIsland();
        break;
      case BACKGROUND_CAPABILITIES.NOTIFICATIONS:
        await this.stopNotifications();
        break;
      case BACKGROUND_CAPABILITIES.REMINDERS:
        await this.stopReminders();
        break;
      case BACKGROUND_CAPABILITIES.TIMERS:
        await this.stopTimers();
        break;
      case BACKGROUND_CAPABILITIES.SCHEDULED_WORKFLOWS:
        await this.stopScheduledWorkflows();
        break;
      case BACKGROUND_CAPABILITIES.BACKGROUND_SYNC:
        await this.stopBackgroundSync();
        break;
      case BACKGROUND_CAPABILITIES.COSMOS_SYNC:
        await this.stopCosmosSync();
        break;
      case BACKGROUND_CAPABILITIES.AGENT_MISSIONS:
        await this.stopAgentMissions();
        break;
      case BACKGROUND_CAPABILITIES.APPROVED_AUTOMATIONS:
        await this.stopApprovedAutomations();
        break;
      case BACKGROUND_CAPABILITIES.DOWNLOADS_UPLOADS:
        await this.stopDownloadsUploads();
        break;
      case BACKGROUND_CAPABILITIES.CLOUD_GENERATION:
        await this.stopCloudGeneration();
        break;
      case BACKGROUND_CAPABILITIES.CLOUD_RESEARCH:
        await this.stopCloudResearch();
        break;
      case BACKGROUND_CAPABILITIES.MEDIA_CONTROL:
        await this.stopMediaControl();
        break;
      case BACKGROUND_CAPABILITIES.DEVICE_HANDOFF:
        await this.stopDeviceHandoff();
        break;
    }
  }

  enableCapability(capability) {
    if (!Object.values(BACKGROUND_CAPABILITIES).includes(capability)) {
      return { error: "Invalid capability" };
    }

    this.enabledCapabilities.add(capability);
    this.save();
    
    if (this.state === HELPER_STATES.HEALTHY) {
      this.startCapability(capability);
    }
    
    this.notify("capability_enabled", { capability });
    return { success: true };
  }

  disableCapability(capability) {
    if (!this.enabledCapabilities.has(capability)) {
      return { error: "Capability not enabled" };
    }

    this.stopCapability(capability);
    this.enabledCapabilities.delete(capability);
    this.save();
    
    this.notify("capability_disabled", { capability });
    return { success: true };
  }

  isCapabilityEnabled(capability) {
    return this.enabledCapabilities.has(capability);
  }

  getEnabledCapabilities() {
    return Array.from(this.enabledCapabilities);
  }

  async runBackgroundTask(input) {
    const taskId = generateTaskId();
    const now = new Date().toISOString();
    
    const task = {
      id: taskId,
      type: input.type,
      payload: input.payload,
      capability: input.capability,
      priority: input.priority || "normal",
      state: "queued",
      createdAt: now,
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      retries: 0,
      maxRetries: input.maxRetries || 3,
    };

    this.backgroundTasks.set(taskId, task);
    this.save();
    
    this.processTask(taskId);
    
    publish("background.task_queued", task);
    return task;
  }

  async processTask(taskId) {
    const task = this.backgroundTasks.get(taskId);
    if (!task || task.state !== "queued") return;

    task.state = "running";
    task.startedAt = new Date().toISOString();
    this.save();

    try {
      const result = await this.executeTask(task);
      task.state = "completed";
      task.result = result;
      task.completedAt = new Date().toISOString();
    } catch (error) {
      task.error = error.message;
      task.retries++;
      
      if (task.retries < task.maxRetries) {
        task.state = "queued";
        setTimeout(() => this.processTask(taskId), 1000 * Math.pow(2, task.retries));
      } else {
        task.state = "failed";
        task.completedAt = new Date().toISOString();
      }
    }

    this.save();
    publish("background.task_completed", task);
  }

  async executeTask() {
    return { success: true, message: "Task executed" };
  }

  cancelBackgroundTask(taskId) {
    const task = this.backgroundTasks.get(taskId);
    if (!task) return { error: "Task not found" };

    if (task.state === "running") {
      return { error: "Cannot cancel running task" };
    }

    task.state = "cancelled";
    task.completedAt = new Date().toISOString();
    this.save();
    
    publish("background.task_cancelled", task);
    return { success: true };
  }

  async cancelBackgroundTasks() {
    for (const [, task] of this.backgroundTasks) {
      if (task.state === "queued" || task.state === "running") {
        task.state = "cancelled";
        task.completedAt = new Date().toISOString();
      }
    }
    this.save();
  }

  getBackgroundTask(taskId) {
    return this.backgroundTasks.get(taskId) || null;
  }

  getAllBackgroundTasks() {
    return Array.from(this.backgroundTasks.values());
  }

  getBackgroundHelperState() {
    return {
      state: this.state,
      enabledCapabilities: this.getEnabledCapabilities(),
      closeBehavior: this.closeBehavior,
      startAtLogin: this.startAtLogin,
      crashCount: this.crashCount,
      lastCrash: this.lastCrash,
      queuedTasks: this.getAllBackgroundTasks().filter(t => t.state === "queued").length,
      runningTasks: this.getAllBackgroundTasks().filter(t => t.state === "running").length,
      completedTasks: this.getAllBackgroundTasks().filter(t => t.state === "completed").length,
      failedTasks: this.getAllBackgroundTasks().filter(t => t.state === "failed").length,
    };
  }

  handleCloseBehavior() {
    switch (this.closeBehavior) {
      case CLOSE_BEHAVIORS.KEEP_RUNNING:
        this.notify("close_behavior_keep_running", {});
        return { action: "keep_running" };
      case CLOSE_BEHAVIORS.QUIT:
        this.stop();
        return { action: "quit" };
      case CLOSE_BEHAVIORS.ASK:
        return { action: "ask", behaviors: Object.values(CLOSE_BEHAVIORS) };
    }
  }

  setCloseBehavior(behavior) {
    if (!Object.values(CLOSE_BEHAVIORS).includes(behavior)) {
      return { error: "Invalid close behavior" };
    }
    this.closeBehavior = behavior;
    setSetting("helper.keep_running_on_close", behavior);
    this.save();
    return { success: true };
  }

  setStartAtLogin(enabled) {
    this.startAtLogin = enabled;
    setSetting("helper.start_at_login", enabled);
    this.save();
    return { success: true };
  }

  recordCrash(error) {
    this.crashCount++;
    this.lastCrash = { error: error.message, timestamp: new Date().toISOString() };
    this.save();
    
    if (this.crashCount >= 3) {
      this.state = HELPER_STATES.RECOVERING;
      this.notify("crash_loop_detected", { count: this.crashCount });
      setTimeout(() => {
        this.state = HELPER_STATES.STOPPED;
        this.notify("state_changed", { state: this.state, reason: "crash_loop_stop" });
      }, 600000);
    }
    
    publish("background.crash_recorded", { count: this.crashCount, error });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Background helper listener error:", err); }
    });
  }

  async registerIPC() {}
  async registerGlobalShortcuts() {}
  async registerNotifications() {}
  async setupTrayMenu() {}
  async startWakeWord() {}
  async stopWakeWord() {}
  async startGlobalShortcuts() {}
  async stopGlobalShortcuts() {}
  async startDynamicIsland() {}
  async stopDynamicIsland() {}
  async startNotifications() {}
  async stopNotifications() {}
  async startReminders() {}
  async stopReminders() {}
  async startTimers() {}
  async stopTimers() {}
  async startScheduledWorkflows() {}
  async stopScheduledWorkflows() {}
  async startBackgroundSync() {}
  async stopBackgroundSync() {}
  async startCosmosSync() {}
  async stopCosmosSync() {}
  async startAgentMissions() {}
  async stopAgentMissions() {}
  async startApprovedAutomations() {}
  async stopApprovedAutomations() {}
  async startDownloadsUploads() {}
  async stopDownloadsUploads() {}
  async startCloudGeneration() {}
  async stopCloudGeneration() {}
  async startCloudResearch() {}
  async stopCloudResearch() {}
  async startMediaControl() {}
  async stopMediaControl() {}
  async startDeviceHandoff() {}
  async stopDeviceHandoff() {}
}

const HEALTHY_STATES = HELPER_STATES;

export const backgroundHelperEngine = new BackgroundHelperEngine();

export function startBackgroundHelper() {
  return backgroundHelperEngine.start();
}

export function stopBackgroundHelper() {
  return backgroundHelperEngine.stop();
}

export function pauseBackgroundHelper() {
  return backgroundHelperEngine.pause();
}

export function resumeBackgroundHelper() {
  return backgroundHelperEngine.resume();
}

export function getBackgroundHelperState() {
  return backgroundHelperEngine.getBackgroundHelperState();
}

export function isBackgroundCapabilityEnabled(capability) {
  return backgroundHelperEngine.isCapabilityEnabled(capability);
}

export function enableBackgroundCapability(capability) {
  return backgroundHelperEngine.enableCapability(capability);
}

export function disableBackgroundCapability(capability) {
  return backgroundHelperEngine.disableCapability(capability);
}

export function runBackgroundTask(input) {
  return backgroundHelperEngine.runBackgroundTask(input);
}

export function cancelBackgroundTask(taskId) {
  return backgroundHelperEngine.cancelBackgroundTask(taskId);
}

export function handleBackgroundCloseBehavior() {
  return backgroundHelperEngine.handleCloseBehavior();
}

export function setBackgroundCloseBehavior(behavior) {
  return backgroundHelperEngine.setCloseBehavior(behavior);
}

export function setBackgroundStartAtLogin(enabled) {
  return backgroundHelperEngine.setStartAtLogin(enabled);
}

export function subscribeToBackgroundHelper(listener) {
  return backgroundHelperEngine.subscribe(listener);
}

export { HELPER_STATES, BACKGROUND_CAPABILITIES, CLOSE_BEHAVIORS };

export default backgroundHelperEngine;
