const MAX_RECENT_ENTRIES = 30;
const MAX_CATALOG_TOOLS = 256;

function ownDataValue(value, key) {
  try {
    if (!value || typeof value !== "object") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function validBoundedArray(value, maximum) {
  try {
    if (!Array.isArray(value)) return false;
    const length = ownDataValue(value, "length");
    return Number.isSafeInteger(length) && length >= 0 && length <= maximum;
  } catch {
    return false;
  }
}

export function resolveRecentToolEntry({ name, accountId, activeScope, recent, catalog }) {
  if (typeof accountId !== "string" || !accountId || activeScope !== `account:${accountId}`) {
    return Object.freeze({ status: "account_required" });
  }
  if (typeof name !== "string" || !name || !validBoundedArray(recent, MAX_RECENT_ENTRIES) || !validBoundedArray(catalog, MAX_CATALOG_TOOLS)) {
    return Object.freeze({ status: "invalid_entry" });
  }

  try {
    const hasRecent = Array.from({ length: ownDataValue(recent, "length") }, (_, index) => ownDataValue(recent, String(index)))
      .some((entry) => ownDataValue(entry, "name") === name);
    if (!hasRecent) return Object.freeze({ status: "not_recent" });

    const hasCatalogEntry = Array.from({ length: ownDataValue(catalog, "length") }, (_, index) => ownDataValue(catalog, String(index)))
      .some((tool) => ownDataValue(tool, "name") === name);
    return Object.freeze({ status: hasCatalogEntry ? "ready" : "stale_entry", ...(hasCatalogEntry ? { name } : {}) });
  } catch {
    return Object.freeze({ status: "invalid_entry" });
  }
}
