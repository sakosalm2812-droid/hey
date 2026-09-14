import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";
import { authorizeExecution } from "./permissionManager.js";
import { safeStorage } from "../lib/safeStorage.js";

const CONTROL_MODES = Object.freeze({
  GUIDE: "guide",
  ASSIST: "assist",
  ACT: "act",
});

const COMPUTER_CAPABILITIES = Object.freeze({
  OPEN_URL: "computer.open_url",
  CAPTURE_SCREEN: "computer.capture_screen",
  NAVIGATE_BROWSER: "computer.navigate_browser",
  READ_FILE: "computer.read_file",
  EXECUTE_TERMINAL: "computer.execute_terminal",
  CREATE_DIRECTORY: "computer.create_directory",
  ORGANIZE_FILES: "computer.organize_files",
  OPEN_APP: "computer.open_app",
  CLOSE_APP: "computer.close_app",
  MINIMIZE_WINDOW: "computer.minimize_window",
  MAXIMIZE_WINDOW: "computer.maximize_window",
  MOVE_WINDOW: "computer.move_window",
  RESIZE_WINDOW: "computer.resize_window",
  TYPE_TEXT: "computer.type_text",
  KEYBOARD_SHORTCUT: "computer.keyboard_shortcut",
  CLICK: "computer.click",
  DOUBLE_CLICK: "computer.double_click",
  RIGHT_CLICK: "computer.right_click",
  DRAG_DROP: "computer.drag_drop",
  SCROLL: "computer.scroll",
  CAPTURE_SCREENSHOT: "computer.capture_screenshot",
  GET_CLIPBOARD: "computer.get_clipboard",
  SET_CLIPBOARD: "computer.set_clipboard",
  LIST_PROCESSES: "computer.list_processes",
  KILL_PROCESS: "computer.kill_process",
  GET_WINDOW_LIST: "computer.get_window_list",
  FOCUS_WINDOW: "computer.focus_window",
  GET_SYSTEM_INFO: "computer.get_system_info",
  CHANGE_SETTING: "computer.change_setting",
});

const PHONE_CAPABILITIES = Object.freeze({
  OPEN_APP: "phone.open_app",
  SEND_SMS: "phone.send_sms",
  MAKE_CALL: "phone.make_call",
  GET_CONTACTS: "phone.get_contacts",
  GET_LOCATION: "phone.get_location",
  TAKE_PHOTO: "phone.take_photo",
  RECORD_VIDEO: "phone.record_video",
  GET_NOTIFICATIONS: "phone.get_notifications",
  SEND_NOTIFICATION: "phone.send_notification",
  VIBRATE: "phone.vibrate",
  GET_BATTERY: "phone.get_battery",
  OPEN_URL: "phone.open_url",
  SHARE_CONTENT: "phone.share_content",
});

const BROWSER_CAPABILITIES = Object.freeze({
  OPEN_URL: "browser.open_url",
  NAVIGATE: "browser.navigate",
  CLICK: "browser.click",
  TYPE: "browser.type",
  SELECT: "browser.select",
  SCROLL: "browser.scroll",
  SCREENSHOT: "browser.screenshot",
  EXTRACT_TEXT: "browser.extract_text",
  EXTRACT_HTML: "browser.extract_html",
  FILL_FORM: "browser.fill_form",
  SUBMIT_FORM: "browser.submit_form",
  UPLOAD_FILE: "browser.upload_file",
  DOWNLOAD_FILE: "browser.download_file",
  GET_COOKIES: "browser.get_cookies",
  SET_COOKIES: "browser.set_cookies",
  EXECUTE_SCRIPT: "browser.execute_script",
  GET_CONSOLE_LOGS: "browser.get_console_logs",
  GET_NETWORK_LOGS: "browser.get_network_logs",
  WAIT_FOR_ELEMENT: "browser.wait_for_element",
  SWITCH_TAB: "browser.switch_tab",
  CLOSE_TAB: "browser.close_tab",
  NEW_TAB: "browser.new_tab",
});

const RISK_LEVELS = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
});

function generateActionId() {
  return `action_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateTargetId() {
  return `target_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class ComputerControlEngine {
  constructor() {
    this.adapters = new Map();
    this.currentMode = CONTROL_MODES.GUIDE;
    this.commandHistory = [];
    this.activeSessions = new Map();
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = safeStorage.getItem("hey_computer_control");
      if (stored) {
        const parsed = JSON.parse(stored);
        this.currentMode = parsed.currentMode || CONTROL_MODES.GUIDE;
        this.commandHistory = parsed.commandHistory || [];
      }
    } catch (err) {
      console.warn("Failed to load computer control:", err);
    }
  }

  save() {
    try {
      safeStorage.setItem("hey_computer_control", JSON.stringify({
        currentMode: this.currentMode,
        commandHistory: this.commandHistory.slice(-100),
      }));
    } catch (err) {
      console.warn("Failed to save computer control:", err);
    }
  }

  registerAdapter(platform, adapter) {
    if (!adapter.capabilities || !Array.isArray(adapter.capabilities)) {
      throw new Error("Adapter must declare capabilities array");
    }
    this.adapters.set(platform, {
      ...adapter,
      registeredAt: new Date().toISOString(),
    });
    this.notify("adapter_registered", { platform, capabilities: adapter.capabilities });
    return { success: true };
  }

  unregisterAdapter(platform) {
    this.adapters.delete(platform);
    this.notify("adapter_unregistered", { platform });
    return true;
  }

  getAvailableAdapters() {
    return Array.from(this.adapters.entries()).map(([platform, adapter]) => ({
      platform,
      capabilities: adapter.capabilities,
      registeredAt: adapter.registeredAt,
    }));
  }

  setControlMode(mode) {
    if (!Object.values(CONTROL_MODES).includes(mode)) {
      return { error: "Invalid control mode" };
    }
    const oldMode = this.currentMode;
    this.currentMode = mode;
    this.save();
    this.notify("mode_changed", { oldMode, newMode: mode });
    return { success: true, mode };
  }

  getControlMode() {
    return this.currentMode;
  }

  getComputerCapabilities() {
    return Object.values(COMPUTER_CAPABILITIES);
  }

  getCommandHistory(limit = 50) {
    return this.commandHistory.slice(-limit);
  }

  clearCommandHistory() {
    this.commandHistory = [];
    this.save();
  }

  async executeCapability(input) {
    const {
      capability,
      target,
      parameters = {},
      mode = this.currentMode,
      user = null,
    } = input;

    const actionId = generateActionId();
    const targetId = generateTargetId();

    const authResult = authorizeExecution({
      user,
      capability,
      permission: capability,
      riskLevel: this.getRiskLevel(capability),
      confirmed: mode === CONTROL_MODES.ACT,
    });

    if (!authResult.authorized) {
      return {
        success: false,
        actionId,
        status: authResult.decision,
        requiresConfirmation: authResult.requiresConfirmation,
        reason: authResult.reason,
      };
    }

    const adapter = this.findAdapterForCapability(capability);
    if (!adapter) {
      return {
        success: false,
        actionId,
        status: "unavailable",
        code: "NO_ADAPTER",
        message: `No adapter found for capability: ${capability}`,
      };
    }

    const actionRecord = {
      actionId,
      targetId,
      capability,
      target,
      parameters,
      mode,
      userId: user?.id,
      startedAt: new Date().toISOString(),
      status: "executing",
    };

    this.commandHistory.push(actionRecord);
    if (this.commandHistory.length > 1000) {
      this.commandHistory = this.commandHistory.slice(-500);
    }
    this.save();

    this.notify("action_started", actionRecord);
    publish("computer.action.started", actionRecord);

    try {
      const result = await adapter.execute(capability, { target, parameters, actionId, targetId });
      
      actionRecord.status = result.success ? "completed" : "failed";
      actionRecord.completedAt = new Date().toISOString();
      actionRecord.result = result;
      this.save();

      if (result.success) {
        this.notify("action_completed", { actionId, result });
        publish("computer.action.completed", { actionId, result });
        
        recordAudit({
          action: "computer.action",
          status: "completed",
          metadata: { capability, target, actionId, mode },
        });
      } else {
        this.notify("action_failed", { actionId, error: result.error });
        publish("computer.action.failed", { actionId, error: result.error });
      }

      return { success: result.success, actionId, result: result.data, error: result.error };
    } catch (error) {
      actionRecord.status = "failed";
      actionRecord.error = error.message;
      actionRecord.completedAt = new Date().toISOString();
      this.save();

      this.notify("action_failed", { actionId, error: error.message });
      return { success: false, actionId, error: error.message };
    }
  }

  findAdapterForCapability(capability) {
    for (const [, adapter] of this.adapters) {
      if (adapter.capabilities.includes(capability)) {
        return adapter;
      }
    }
    return null;
  }

  getRiskLevel(capability) {
    const criticalCapabilities = [
      COMPUTER_CAPABILITIES.EXECUTE_TERMINAL,
      COMPUTER_CAPABILITIES.KILL_PROCESS,
      COMPUTER_CAPABILITIES.CHANGE_SETTING,
    ];
    const highCapabilities = [
      COMPUTER_CAPABILITIES.OPEN_APP,
      COMPUTER_CAPABILITIES.CLOSE_APP,
      COMPUTER_CAPABILITIES.ORGANIZE_FILES,
      COMPUTER_CAPABILITIES.KILL_PROCESS,
      COMPUTER_CAPABILITIES.SET_CLIPBOARD,
    ];
    const mediumCapabilities = [
      COMPUTER_CAPABILITIES.OPEN_URL,
      COMPUTER_CAPABILITIES.NAVIGATE_BROWSER,
      COMPUTER_CAPABILITIES.EXECUTE_TERMINAL,
      COMPUTER_CAPABILITIES.CREATE_DIRECTORY,
      COMPUTER_CAPABILITIES.OPEN_APP,
      COMPUTER_CAPABILITIES.CLOSE_APP,
      COMPUTER_CAPABILITIES.TYPE_TEXT,
      COMPUTER_CAPABILITIES.KEYBOARD_SHORTCUT,
      COMPUTER_CAPABILITIES.CLICK,
      COMPUTER_CAPABILITIES.DRAG_DROP,
    ];

    if (criticalCapabilities.includes(capability)) return RISK_LEVELS.CRITICAL;
    if (highCapabilities.includes(capability)) return RISK_LEVELS.HIGH;
    if (mediumCapabilities.includes(capability)) return RISK_LEVELS.MEDIUM;
    return RISK_LEVELS.LOW;
  }

  async executePhoneCapability(input) {
    return this.executeCapability({ ...input, platform: "phone" });
  }

  async executeBrowserCapability(input) {
    return this.executeCapability({ ...input, platform: "browser" });
  }

  async executeComputerCapability(input) {
    return this.executeCapability({ ...input, platform: "computer" });
  }

  connectPhone(deviceId) {
    this.activeSessions.set("phone", { deviceId, connectedAt: new Date().toISOString() });
    this.notify("phone_connected", { deviceId });
    return { success: true };
  }

  disconnectPhone() {
    this.activeSessions.delete("phone");
    this.notify("phone_disconnected", {});
    return { success: true };
  }

  getPhoneConnection() {
    return this.activeSessions.get("phone") || null;
  }

  isPhoneConnected() {
    return this.activeSessions.has("phone");
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Computer control listener error:", err); }
    });
  }
}

export const computerControlEngine = new ComputerControlEngine();

export function initializeComputerControl() {
  return { success: true, message: "Computer control initialized" };
}

export function executeComputerControl(input) {
  return computerControlEngine.executeCapability(input);
}

export function setControlMode(mode) {
  return computerControlEngine.setControlMode(mode);
}

export function getControlMode() {
  return computerControlEngine.getControlMode();
}

export function getComputerCapabilities() {
  return computerControlEngine.getComputerCapabilities();
}

export function getCommandHistory(limit) {
  return computerControlEngine.getCommandHistory(limit);
}

export function clearCommandHistory() {
  computerControlEngine.clearCommandHistory();
}

export function connectPhone(deviceId) {
  return computerControlEngine.connectPhone(deviceId);
}

export function disconnectPhone() {
  return computerControlEngine.disconnectPhone();
}

export function getPhoneConnection() {
  return computerControlEngine.getPhoneConnection();
}

export function isPhoneConnected() {
  return computerControlEngine.isPhoneConnected();
}

export function executePhoneCapability(input) {
  return computerControlEngine.executePhoneCapability(input);
}

export function executeBrowserCapability(input) {
  return computerControlEngine.executeBrowserCapability(input);
}

export function executeComputerCapability(input) {
  return computerControlEngine.executeComputerCapability(input);
}

export function getAvailableAdapters() {
  return computerControlEngine.getAvailableAdapters();
}

export function subscribeToComputerControl(listener) {
  return computerControlEngine.subscribe(listener);
}

export { CONTROL_MODES, COMPUTER_CAPABILITIES, PHONE_CAPABILITIES, BROWSER_CAPABILITIES };

export default computerControlEngine;
