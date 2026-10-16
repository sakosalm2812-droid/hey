export const TOOL_LIBRARY_PLATFORMS = Object.freeze([
  Object.freeze({ id: "web", label: "Web" }),
  Object.freeze({ id: "windows", label: "Windows" }),
  Object.freeze({ id: "macos", label: "macOS" }),
  Object.freeze({ id: "linux", label: "Linux" }),
  Object.freeze({ id: "android", label: "Android" }),
  Object.freeze({ id: "ios", label: "iOS" }),
]);

const VALID_STATUSES = new Set(["supported", "permission_required", "restricted", "unsupported"]);
const MAX_CATALOG_ROWS = 512;

function ownDataValue(value, key) {
  if (!value || typeof value !== "object") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function findStatus(catalog, toolName) {
  try {
    if (!Array.isArray(catalog)) return "unknown";
    const length = Math.min(catalog.length, MAX_CATALOG_ROWS);
    for (let index = 0; index < length; index += 1) {
      const row = ownDataValue(catalog, index);
      if (ownDataValue(row, "name") !== toolName) continue;
      const status = ownDataValue(row, "status");
      return VALID_STATUSES.has(status) ? status : "unknown";
    }
  } catch {
    return "unknown";
  }
  return "unknown";
}

export function getToolLibraryPlatformMatrix(catalogs, toolName) {
  return Object.freeze(TOOL_LIBRARY_PLATFORMS.map(({ id, label }) => Object.freeze({
    platform: id,
    label,
    status: findStatus(ownDataValue(catalogs, id), toolName),
  })));
}
