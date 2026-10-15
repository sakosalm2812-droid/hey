import { registerOwnedTool } from "./toolRegistry.js";
import { OS_CAPABILITIES, createBrowserOSAdapter, unsupportedCapability } from "./osAdapter.js";
import { getCapability, getCapabilityAvailability } from "./capabilityRegistry.js";
import { createTauriAdapter } from "../lib/tauriAdapter.js";

const browserAdapter = typeof navigator !== "undefined" ? createBrowserOSAdapter() : null;
let activeAdapter = createTauriAdapter() || browserAdapter;
const COMPUTER_TOOL_OWNER = Object.freeze({});

const COMPUTER_TOOL_CAPABILITIES = [
  OS_CAPABILITIES.systemInfo,
  OS_CAPABILITIES.openUrl,
  OS_CAPABILITIES.screenshot,
  "app.open", "app.close", "filesystem.read", "filesystem.write", "filesystem.create_directory",
  "filesystem.list", "filesystem.delete", "filesystem.organize", "terminal.execute", "window.control",
  "input.control", "browser.navigate", "browser.read", "vision.inspect", "hardware.inspect",
  "notifications.create", "media.control",
];
const computerToolHandlers = new Map(COMPUTER_TOOL_CAPABILITIES.map((capability) => [
  capability,
  (input, context) => browserTool(capability, input, context),
]));

export function setComputerAdapter(adapter) {
  if (!adapter || typeof adapter.execute !== "function") throw new TypeError("A computer adapter with execute() is required.");
  activeAdapter = adapter;
  return activeAdapter;
}

/** Read capability availability against the adapter that will receive execution. */
export function getComputerCapabilityAvailability(capability, platform = activeAdapter?.platform || browserAdapter?.platform || "web") {
  return getCapabilityAvailability(capability, platform, activeAdapter);
}

function browserTool(capability, input, context = {}) {
  if (activeAdapter && activeAdapter !== browserAdapter && activeAdapter.capabilities?.includes(capability)) {
    return activeAdapter.execute({ capability, input, context });
  }
  if (!browserAdapter) return unsupportedCapability(capability, "web");
  if (capability === OS_CAPABILITIES.systemInfo) return browserAdapter.getSystemInfo(input, context);
  if (capability === OS_CAPABILITIES.openUrl) return browserAdapter.openUrl(input, context);
  if (capability === OS_CAPABILITIES.screenshot) return browserAdapter.captureScreen(input, context);
  return browserAdapter.execute({ capability, input, context });
}

export function registerComputerTools() {
  registerOwnedTool("computer.system_info", computerToolHandlers.get(OS_CAPABILITIES.systemInfo), {
    category: "system",
    capabilities: [OS_CAPABILITIES.systemInfo],
    permissions: ["system.info"],
    permission: "system.info",
    riskLevel: "low",
    inputSchema: { type: "object", properties: {} },
    source: "browser_adapter",
  }, COMPUTER_TOOL_OWNER);

  registerOwnedTool("computer.open_url", computerToolHandlers.get(OS_CAPABILITIES.openUrl), {
    category: "browser",
    capabilities: [OS_CAPABILITIES.openUrl],
    permission: "browser.open_url",
    riskLevel: "medium",
    requiresConfirmation: true,
    inputSchema: { type: "object", required: ["url"], properties: { url: { type: "string" } } },
    source: "browser_adapter",
  }, COMPUTER_TOOL_OWNER);

  registerOwnedTool("computer.capture_screen", computerToolHandlers.get(OS_CAPABILITIES.screenshot), {
    category: "vision",
    capabilities: [OS_CAPABILITIES.screenshot],
    permission: "screen.capture",
    riskLevel: "high",
    requiresConfirmation: true,
    inputSchema: { type: "object", properties: {} },
    source: "browser_adapter",
  }, COMPUTER_TOOL_OWNER);

  const adapterTools = [
    ["computer.open_app", "app.open"],
    ["computer.close_app", "app.close"],
    ["computer.read_file", "filesystem.read"],
    ["computer.write_file", "filesystem.write"],
    ["computer.create_directory", "filesystem.create_directory"],
    ["computer.list_files", "filesystem.list"],
    ["computer.delete_file", "filesystem.delete"],
    ["computer.organize_files", "filesystem.organize"],
    ["computer.execute_terminal", "terminal.execute"],
    ["computer.control_window", "window.control"],
    ["computer.control_input", "input.control"],
    ["computer.navigate_browser", "browser.navigate"],
    ["computer.read_page", "browser.read"],
    ["computer.inspect_screen", "vision.inspect"],
    ["computer.inspect_hardware", "hardware.inspect"],
    ["computer.create_notification", "notifications.create"],
    ["computer.control_media", "media.control"],
  ];

  adapterTools.forEach(([name, capability]) => {
    const definition = getCapability(capability);
    registerOwnedTool(name, computerToolHandlers.get(capability), {
      category: "computer",
      capabilities: [capability],
      permission: capability,
      riskLevel: definition.riskLevel,
      requiresConfirmation: definition.riskLevel !== "low",
      inputSchema: { type: "object", properties: { target: { type: "string" }, command: { type: "string" }, path: { type: "string" } } },
      source: "platform_adapter",
    }, COMPUTER_TOOL_OWNER);
  });

  return ["computer.system_info", "computer.open_url", "computer.capture_screen", ...adapterTools.map(([name]) => name)];
}

export default { registerComputerTools, setComputerAdapter };
