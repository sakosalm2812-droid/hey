import { recordAudit } from "./auditLog.js";
import { publish } from "./eventBus.js";
import { authorizeExecution } from "./permissionManager.js";
import { createBrowserOSAdapter } from "./osAdapter.js";
import { createTauriAdapter, isTauriRuntime } from "../lib/tauriAdapter.js";

const CONTROL_MODES = {
  GUIDE: "guide",
  ASSIST: "assist",
  ACT: "act",
};

const COMPUTER_CAPABILITIES = {
  POINTER_MOVE: "pointer.move",
  CLICK: "pointer.click",
  DOUBLE_CLICK: "pointer.double_click",
  RIGHT_CLICK: "pointer.right_click",
  DRAG: "pointer.drag",
  SCROLL: "pointer.scroll",
  TYPE: "keyboard.type",
  SHORTCUT: "keyboard.shortcut",
  KEY_DOWN: "keyboard.key_down",
  KEY_UP: "keyboard.key_up",
  APP_LAUNCH: "app.launch",
  APP_SWITCH: "app.switch",
  APP_CLOSE: "app.close",
  APP_HIDE: "app.hide",
  WINDOW_MOVE: "window.move",
  WINDOW_RESIZE: "window.resize",
  WINDOW_MINIMIZE: "window.minimize",
  WINDOW_MAXIMIZE: "window.maximize",
  WINDOW_RESTORE: "window.restore",
  WINDOW_CLOSE: "window.close",
  WINDOW_FOCUS: "window.focus",
  WINDOW_LIST: "window.list",
  PROCESS_LIST: "process.list",
  PROCESS_KILL: "process.kill",
  FILE_READ: "file.read",
  FILE_WRITE: "file.write",
  FILE_DELETE: "file.delete",
  FILE_COPY: "file.copy",
  FILE_MOVE: "file.move",
  FILE_LIST: "file.list",
  FILE_MKDIR: "file.mkdir",
  FILE_EXISTS: "file.exists",
  FILE_SEARCH: "file.search",
  SHELL_OPEN: "shell.open",
  SHELL_EXECUTE: "shell.execute",
  SCREENSHOT: "screen.capture",
  SCREEN_RECORD: "screen.record",
  DISPLAY_LIST: "display.list",
  DISPLAY_CONFIG: "display.config",
  CLIPBOARD_READ: "clipboard.read",
  CLIPBOARD_WRITE: "clipboard.write",
  CLIPBOARD_HISTORY: "clipboard.history",
  NETWORK_INFO: "network.info",
  WIFI_LIST: "wifi.list",
  BLUETOOTH_LIST: "bluetooth.list",
  USB_LIST: "usb.list",
  AUDIO_DEVICES: "audio.devices",
  AUDIO_VOLUME: "audio.volume",
  AUDIO_MUTE: "audio.mute",
  MEDIA_PLAY: "media.play",
  MEDIA_PAUSE: "media.pause",
  MEDIA_NEXT: "media.next",
  MEDIA_PREVIOUS: "media.previous",
  MEDIA_SEEK: "media.seek",
  SYSTEM_SLEEP: "system.sleep",
  SYSTEM_RESTART: "system.restart",
  SYSTEM_SHUTDOWN: "system.shutdown",
  SYSTEM_LOCK: "system.lock",
  SYSTEM_INFO: "system.info",
  ENV_GET: "env.get",
  ENV_SET: "env.set",
  REGISTRY_READ: "registry.read",
  REGISTRY_WRITE: "registry.write",
  SERVICE_LIST: "service.list",
  SERVICE_START: "service.start",
  SERVICE_STOP: "service.stop",
  SERVICE_RESTART: "service.restart",
};

const PHONE_CAPABILITIES = {
  APP_LAUNCH: "phone.app.launch",
  APP_LIST: "phone.app.list",
  NOTIFICATION_SEND: "phone.notification.send",
  NOTIFICATION_LIST: "phone.notification.list",
  SMS_SEND: "phone.sms.send",
  SMS_READ: "phone.sms.read",
  CALL_MAKE: "phone.call.make",
  CALL_HANGUP: "phone.call.hangup",
  CALL_LIST: "phone.call.list",
  CONTACT_LIST: "phone.contact.list",
  CONTACT_GET: "phone.contact.get",
  LOCATION_GET: "phone.location.get",
  LOCATION_WATCH: "phone.location.watch",
  CAMERA_CAPTURE: "phone.camera.capture",
  CAMERA_RECORD: "phone.camera.record",
  FILE_LIST: "phone.file.list",
  FILE_READ: "phone.file.read",
  FILE_WRITE: "phone.file.write",
  FILE_SHARE: "phone.file.share",
  CLIPBOARD_READ: "phone.clipboard.read",
  CLIPBOARD_WRITE: "phone.clipboard.write",
  SCREENSHOT: "phone.screen.capture",
  SCREEN_RECORD: "phone.screen.record",
  VOLUME_GET: "phone.volume.get",
  VOLUME_SET: "phone.volume.set",
  BRIGHTNESS_GET: "phone.brightness.get",
  BRIGHTNESS_SET: "phone.brightness.set",
  WIFI_LIST: "phone.wifi.list",
  WIFI_CONNECT: "phone.wifi.connect",
  BLUETOOTH_LIST: "phone.bluetooth.list",
  BLUETOOTH_CONNECT: "phone.bluetooth.connect",
  BATTERY_GET: "phone.battery.get",
  DEVICE_INFO: "phone.device.info",
  APP_INSTALL: "phone.app.install",
  APP_UNINSTALL: "phone.app.uninstall",
  PERMISSION_REQUEST: "phone.permission.request",
  PERMISSION_CHECK: "phone.permission.check",
  INTENT_SEND: "phone.intent.send",
  INTENT_BROADCAST: "phone.intent.broadcast",
  SHARE_SHEET: "phone.share_sheet",
  SHORTCUT_RUN: "phone.shortcut.run",
  WIDGET_UPDATE: "phone.widget.update",
  FOCUS_MODE: "phone.focus_mode",
  DO_NOT_DISTURB: "phone.do_not_disturb",
};

const BROWSER_CAPABILITIES = {
  NAVIGATE: "browser.navigate",
  BACK: "browser.back",
  FORWARD: "browser.forward",
  REFRESH: "browser.refresh",
  TAB_NEW: "browser.tab.new",
  TAB_CLOSE: "browser.tab.close",
  TAB_SWITCH: "browser.tab.switch",
  TAB_LIST: "browser.tab.list",
  CLICK: "browser.click",
  TYPE: "browser.type",
  SELECT: "browser.select",
  SCROLL: "browser.scroll",
  SCREENSHOT: "browser.screenshot",
  GET_TEXT: "browser.get_text",
  GET_HTML: "browser.get_html",
  GET_ATTRIBUTE: "browser.get_attribute",
  WAIT_FOR: "browser.wait_for",
  EXECUTE_SCRIPT: "browser.execute_script",
  DOWNLOAD: "browser.download",
  UPLOAD: "browser.upload",
  FORM_FILL: "browser.form_fill",
  COOKIE_GET: "browser.cookie.get",
  COOKIE_SET: "browser.cookie.set",
  COOKIE_DELETE: "browser.cookie.delete",
  LOCAL_STORAGE_GET: "browser.local_storage.get",
  LOCAL_STORAGE_SET: "browser.local_storage.set",
  SESSION_STORAGE_GET: "browser.session_storage.get",
  SESSION_STORAGE_SET: "browser.session_storage.set",
  NETWORK_REQUESTS: "browser.network.requests",
  CONSOLE_LOGS: "browser.console.logs",
  PERFORMANCE: "browser.performance",
  ACCESSIBILITY_TREE: "browser.accessibility.tree",
};

class ComputerControlEngine {
  constructor() {
    this.adapters = new Map();
    this.currentMode = CONTROL_MODES.GUIDE;
    this.activeAdapter = null;
    this.browserAutomation = null;
    this.phoneConnection = null;
    this.commandHistory = [];
    this.permissions = new Map();
  }

  initialize() {
    const browserAdapter = createBrowserOSAdapter();
    this.adapters.set("browser", browserAdapter);

    if (isTauriRuntime()) {
      const tauriAdapter = createTauriAdapter();
      if (tauriAdapter) {
        this.adapters.set("tauri", tauriAdapter);
        this.activeAdapter = tauriAdapter;
      }
    }

    if (!this.activeAdapter) {
      this.activeAdapter = browserAdapter;
    }

    publish("computer_control.initialized", {
      adapters: Array.from(this.adapters.keys()),
      activeAdapter: this.activeAdapter?.platform,
    });

    return {
      adapters: Array.from(this.adapters.keys()),
      activeAdapter: this.activeAdapter?.platform,
      capabilities: this.getAllCapabilities(),
    };
  }

  getAdapter(platform) {
    return this.adapters.get(platform) || this.activeAdapter;
  }

  setActiveAdapter(platform) {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`Adapter not found: ${platform}`);
    }
    this.activeAdapter = adapter;
    publish("computer_control.adapter_changed", { platform });
    return adapter;
  }

  getAllCapabilities() {
    const capabilities = [];
    for (const adapter of this.adapters.values()) {
      if (adapter.capabilities) {
        capabilities.push(...adapter.capabilities);
      }
    }
    return [...new Set(capabilities)];
  }

  getCapabilitiesByCategory(category) {
    switch (category) {
      case "computer":
        return Object.values(COMPUTER_CAPABILITIES);
      case "phone":
        return Object.values(PHONE_CAPABILITIES);
      case "browser":
        return Object.values(BROWSER_CAPABILITIES);
      default:
        return this.getAllCapabilities();
    }
  }

  async execute(capability, input = {}, options = {}) {
    const mode = options.mode || this.currentMode;
    const adapter = options.adapter ? this.getAdapter(options.adapter) : this.activeAdapter;

    if (!adapter) {
      throw new Error("No active adapter available");
    }

    const authContext = {
      user: options.user,
      capability,
      permission: capability,
      riskLevel: this.getRiskLevel(capability),
      confirmed: mode === CONTROL_MODES.ACT || options.confirmed === true,
    };

    const authResult = authorizeExecution(authContext);
    if (!authResult.authorized) {
      return {
        authorized: false,
        reason: authResult.reason,
        requiresConfirmation: authResult.requiresConfirmation,
        mode,
      };
    }

    if (mode === CONTROL_MODES.GUIDE) {
      return {
        authorized: true,
        mode: CONTROL_MODES.GUIDE,
        guidance: this.generateGuidance(capability, input),
        action: capability,
      };
    }

    if (mode === CONTROL_MODES.ASSIST && !options.confirmed) {
      return {
        authorized: true,
        mode: CONTROL_MODES.ASSIST,
        requiresConfirmation: true,
        action: capability,
        preview: this.generatePreview(capability, input),
      };
    }

    const startTime = Date.now();
    let result;

    try {
      if (typeof adapter.execute === "function") {
        result = await adapter.execute({ capability, input });
      } else if (adapter[capability] && typeof adapter[capability] === "function") {
        result = await adapter[capability](input);
      } else {
        result = { success: false, error: `Capability ${capability} not implemented on ${adapter.platform}` };
      }

      const duration = Date.now() - startTime;

      if (result.success !== false) {
        recordAudit({
          action: "computer_control.executed",
          tool: capability,
          status: "completed",
          metadata: { mode, adapter: adapter.platform, duration, verified: result.verified },
        });

        this.commandHistory.push({
          capability,
          input,
          result: { success: result.success },
          mode,
          adapter: adapter.platform,
          duration,
          timestamp: new Date().toISOString(),
        });

        if (this.commandHistory.length > 1000) {
          this.commandHistory = this.commandHistory.slice(-1000);
        }
      }

      return {
        ...result,
        mode,
        adapter: adapter.platform,
        duration,
      };
    } catch (err) {
      recordAudit({
        action: "computer_control.executed",
        tool: capability,
        status: "failed",
        metadata: { mode, adapter: adapter?.platform, error: err.message },
      });

      throw err;
    }
  }

  generateGuidance(capability) {
    const guidanceMap = {
      [COMPUTER_CAPABILITIES.CLICK]: "Move cursor to the target element and click. Ensure the correct window is focused.",
      [COMPUTER_CAPABILITIES.TYPE]: "Focus the target input field, then type the text. Use keyboard shortcuts for special keys.",
      [COMPUTER_CAPABILITIES.APP_LAUNCH]: "Specify the application name or path. Ensure the app is installed.",
      [COMPUTER_CAPABILITIES.WINDOW_MOVE]: "Select the target window, then specify new coordinates.",
      [COMPUTER_CAPABILITIES.FILE_READ]: "Provide the file path. Ensure you have read permissions.",
      [BROWSER_CAPABILITIES.NAVIGATE]: "Provide the URL. The browser will navigate to the page.",
      [BROWSER_CAPABILITIES.CLICK]: "Specify the element selector. Ensure the page is loaded.",
      [BROWSER_CAPABILITIES.TYPE]: "Focus the input element first, then provide the text to type.",
    };

    return guidanceMap[capability] || `Execute ${capability} with the provided parameters.`;
  }

  generatePreview(capability, input) {
    return {
      capability,
      description: this.generateGuidance(capability, input),
      parameters: input,
      estimatedRisk: this.getRiskLevel(capability),
      reversible: this.isReversible(capability),
    };
  }

  getRiskLevel(capability) {
    const highRisk = [
      COMPUTER_CAPABILITIES.FILE_DELETE,
      COMPUTER_CAPABILITIES.PROCESS_KILL,
      COMPUTER_CAPABILITIES.SYSTEM_SHUTDOWN,
      COMPUTER_CAPABILITIES.SYSTEM_RESTART,
      COMPUTER_CAPABILITIES.REGISTRY_WRITE,
      COMPUTER_CAPABILITIES.SERVICE_STOP,
      BROWSER_CAPABILITIES.DOWNLOAD,
      BROWSER_CAPABILITIES.FORM_FILL,
      PHONE_CAPABILITIES.SMS_SEND,
      PHONE_CAPABILITIES.CALL_MAKE,
      PHONE_CAPABILITIES.APP_UNINSTALL,
      PHONE_CAPABILITIES.FILE_DELETE,
    ];

    const mediumRisk = [
      COMPUTER_CAPABILITIES.FILE_WRITE,
      COMPUTER_CAPABILITIES.FILE_MOVE,
      COMPUTER_CAPABILITIES.APP_CLOSE,
      COMPUTER_CAPABILITIES.WINDOW_CLOSE,
      COMPUTER_CAPABILITIES.SHELL_EXECUTE,
      BROWSER_CAPABILITIES.CLICK,
      BROWSER_CAPABILITIES.TYPE,
      BROWSER_CAPABILITIES.UPLOAD,
      PHONE_CAPABILITIES.NOTIFICATION_SEND,
      PHONE_CAPABILITIES.CLIPBOARD_WRITE,
    ];

    if (highRisk.includes(capability)) return "high";
    if (mediumRisk.includes(capability)) return "medium";
    return "low";
  }

  isReversible(capability) {
    const irreversible = [
      COMPUTER_CAPABILITIES.FILE_DELETE,
      COMPUTER_CAPABILITIES.PROCESS_KILL,
      COMPUTER_CAPABILITIES.SYSTEM_SHUTDOWN,
      COMPUTER_CAPABILITIES.SYSTEM_RESTART,
      COMPUTER_CAPABILITIES.REGISTRY_WRITE,
      BROWSER_CAPABILITIES.DOWNLOAD,
      PHONE_CAPABILITIES.SMS_SEND,
      PHONE_CAPABILITIES.CALL_MAKE,
      PHONE_CAPABILITIES.APP_UNINSTALL,
      PHONE_CAPABILITIES.FILE_DELETE,
    ];
    return !irreversible.includes(capability);
  }

  setMode(mode) {
    if (!Object.values(CONTROL_MODES).includes(mode)) {
      throw new Error(`Invalid control mode: ${mode}`);
    }
    this.currentMode = mode;
    publish("computer_control.mode_changed", { mode });
    return { mode };
  }

  getMode() {
    return this.currentMode;
  }

  getCommandHistory(limit = 50) {
    return this.commandHistory.slice(-limit);
  }

  clearHistory() {
    this.commandHistory = [];
  }

  async connectPhone(connectionParams) {
    this.phoneConnection = {
      ...connectionParams,
      connectedAt: new Date().toISOString(),
      capabilities: Object.values(PHONE_CAPABILITIES),
    };

    publish("computer_control.phone.connected", { 
      deviceId: connectionParams.deviceId,
      platform: connectionParams.platform,
    });

    return {
      connected: true,
      deviceId: connectionParams.deviceId,
      capabilities: this.phoneConnection.capabilities,
    };
  }

  disconnectPhone() {
    const wasConnected = !!this.phoneConnection;
    this.phoneConnection = null;
    
    if (wasConnected) {
      publish("computer_control.phone.disconnected", {});
    }
    
    return { disconnected: wasConnected };
  }

  getPhoneConnection() {
    return this.phoneConnection;
  }

  isPhoneConnected() {
    return !!this.phoneConnection;
  }

  async executePhoneCapability(capability, input = {}, options = {}) {
    if (!this.phoneConnection) {
      throw new Error("No phone connected. Connect a phone first.");
    }

    return this.execute(capability, input, { 
      ...options, 
      adapter: "phone",
      phoneConnection: this.phoneConnection,
    });
  }

  async executeBrowserCapability(capability, input = {}, options = {}) {
    return this.execute(capability, input, { 
      ...options, 
      adapter: "browser",
    });
  }

  async executeComputerCapability(capability, input = {}, options = {}) {
    return this.execute(capability, input, { 
      ...options, 
      adapter: isTauriRuntime() ? "tauri" : "browser",
    });
  }

  getAvailableAdapters() {
    return Array.from(this.adapters.entries()).map(([key, adapter]) => ({
      platform: adapter.platform || key,
      capabilities: adapter.capabilities || [],
      isActive: adapter === this.activeAdapter,
    }));
  }
}

export const computerControlEngine = new ComputerControlEngine();

export function initializeComputerControl() {
  return computerControlEngine.initialize();
}

export function executeComputerControl(capability, input, options) {
  return computerControlEngine.execute(capability, input, options);
}

export function setControlMode(mode) {
  return computerControlEngine.setMode(mode);
}

export function getControlMode() {
  return computerControlEngine.getMode();
}

export function getComputerCapabilities(category) {
  return computerControlEngine.getCapabilitiesByCategory(category);
}

export function getCommandHistory(limit) {
  return computerControlEngine.getCommandHistory(limit);
}

export function clearCommandHistory() {
  return computerControlEngine.clearHistory();
}

export function connectPhone(params) {
  return computerControlEngine.connectPhone(params);
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

export function executePhoneCapability(capability, input, options) {
  return computerControlEngine.executePhoneCapability(capability, input, options);
}

export function executeBrowserCapability(capability, input, options) {
  return computerControlEngine.executeBrowserCapability(capability, input, options);
}

export function executeComputerCapability(capability, input, options) {
  return computerControlEngine.executeComputerCapability(capability, input, options);
}

export function getAvailableAdapters() {
  return computerControlEngine.getAvailableAdapters();
}

export { CONTROL_MODES, COMPUTER_CAPABILITIES, PHONE_CAPABILITIES, BROWSER_CAPABILITIES };

export default {
  initializeComputerControl,
  executeComputerControl,
  setControlMode,
  getControlMode,
  getComputerCapabilities,
  getCommandHistory,
  clearCommandHistory,
  connectPhone,
  disconnectPhone,
  getPhoneConnection,
  isPhoneConnected,
  executePhoneCapability,
  executeBrowserCapability,
  executeComputerCapability,
  getAvailableAdapters,
  CONTROL_MODES,
  COMPUTER_CAPABILITIES,
  PHONE_CAPABILITIES,
  BROWSER_CAPABILITIES,
};