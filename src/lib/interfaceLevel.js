export const DEFAULT_INTERFACE_LEVEL = "simple";
export const INTERFACE_LEVELS = Object.freeze(["simple", "advanced"]);

export function isInterfaceLevel(value) {
  return INTERFACE_LEVELS.includes(value);
}

export function resolveInterfaceLevel(settings) {
  return settings?.interfaceLevel === "advanced" ? "advanced" : DEFAULT_INTERFACE_LEVEL;
}

export function mergeInterfaceLevel(settings, level) {
  if (!isInterfaceLevel(level)) {
    throw new RangeError("Interface level must be simple or advanced.");
  }

  const current = settings && typeof settings === "object" && !Array.isArray(settings)
    ? settings
    : {};

  return { ...current, interfaceLevel: level };
}

export async function saveInterfaceLevel({ userId, level, getSettings, updateSettings }) {
  if (typeof userId !== "string" || !userId.trim()) {
    throw new TypeError("An account is required to save the interface level.");
  }
  if (!isInterfaceLevel(level)) {
    throw new RangeError("Interface level must be simple or advanced.");
  }
  if (typeof getSettings !== "function" || typeof updateSettings !== "function") {
    throw new TypeError("Settings persistence functions are required.");
  }

  const accountId = userId.trim();
  const currentSettings = await getSettings(accountId);
  const updatedSettings = mergeInterfaceLevel(currentSettings, level);
  await updateSettings(accountId, updatedSettings);
  return level;
}
