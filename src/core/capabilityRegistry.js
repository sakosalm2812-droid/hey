import { unsupportedCapability } from "./osAdapter.js";

const capabilities = new Map();

export const CAPABILITY_STATUS = {
  supported: "supported",
  unsupported: "unsupported",
  permissionRequired: "permission_required",
  restricted: "restricted",
};

const ALL_PLATFORMS = ["web", "windows", "macos", "linux", "android", "ios"];

export function registerCapability(capability) {
  if (!capability?.id || !capability.name) throw new TypeError("A capability id and name are required.");
  capabilities.set(capability.id, {
    status: "unavailable",
    riskLevel: "low",
    platforms: ALL_PLATFORMS,
    platformSupport: Object.fromEntries(ALL_PLATFORMS.map((platform) => [platform, CAPABILITY_STATUS.unsupported])),
    ...capability,
  });
  return capabilities.get(capability.id);
}

export function getCapability(id) {
  return capabilities.get(id) || null;
}

export function listCapabilities() {
  return Array.from(capabilities.values());
}

export function getCapabilityAvailability(id, platform = "web", adapter = null) {
  const capability = getCapability(id);
  if (!capability) {
    return { capability: id, platform, status: CAPABILITY_STATUS.unsupported, available: false, error: `Capability ${id} is not registered.` };
  }

  const declaredStatus = capability.platformSupport?.[platform] || CAPABILITY_STATUS.unsupported;
  const adapterSupportsCapability = adapter?.platform === platform && adapter.capabilities?.includes(id);
  const status = adapterSupportsCapability ? CAPABILITY_STATUS.supported : declaredStatus;

  return {
    capability: id,
    platform,
    status,
    available: status === CAPABILITY_STATUS.supported,
    requiresPermission: status === CAPABILITY_STATUS.permissionRequired,
    restricted: status === CAPABILITY_STATUS.restricted,
  };
}

export function executeCapability(id, input = {}, adapter = null) {
  const capability = getCapability(id);
  if (!capability) return unsupportedCapability(id);
  if (!adapter || typeof adapter.execute !== "function") return unsupportedCapability(id);
  if (capability.platforms && !capability.platforms.includes(adapter.platform)) return unsupportedCapability(id, adapter.platform);
  return adapter.execute({ capability: id, input });
}

[
  ["system.info", "Read system information", "low"],
  ["browser.open_url", "Open an approved URL", "medium"],
  ["screen.capture", "Capture the display", "high"],
  ["app.open", "Open application", "high"],
  ["app.close", "Close application", "high"],
  ["filesystem.read", "Read a file", "low"],
  ["filesystem.write", "Create or edit a file", "high"],
  ["filesystem.create_directory", "Create a directory", "high"],
  ["filesystem.list", "List files and folders", "low"],
  ["filesystem.delete", "Delete a file or folder", "critical"],
  ["filesystem.organize", "Organize files", "high"],
  ["terminal.execute", "Execute a terminal command", "critical"],
  ["window.control", "Manage application windows", "high"],
  ["input.control", "Control keyboard or pointer input", "critical"],
  ["browser.navigate", "Navigate an approved browser session", "medium"],
  ["browser.read", "Read an accessible web page", "low"],
  ["vision.inspect", "Inspect a captured screen or image", "high"],
  ["hardware.inspect", "Inspect available system hardware", "low"],
  ["notifications.create", "Create a notification", "medium"],
  ["media.control", "Control supported media", "medium"],
  ["generation.image", "Generate images from text prompts", "high"],
  ["generation.video", "Generate videos from text or images", "high"],
  ["generation.audio", "Generate speech/audio from text", "medium"],
  ["generation.music", "Generate music from text prompts", "high"],
].forEach(([id, name, riskLevel]) => registerCapability({ id, name, riskLevel }));

export default { registerCapability, getCapability, listCapabilities, getCapabilityAvailability, executeCapability, CAPABILITY_STATUS };