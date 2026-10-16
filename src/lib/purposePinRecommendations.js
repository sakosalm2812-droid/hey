const PURPOSES = new Set([
  "ai_assistant", "ai_models", "control_automation", "create_build",
  "teaching_learning", "life_work", "custom",
]);

// Categories are sourced from the canonical Tool Library registry. Custom goal
// text is intentionally excluded; a purpose choice never implies permission.
const PURPOSE_CATEGORIES = Object.freeze({
  control_automation: Object.freeze(["browser", "computer"]),
  create_build: Object.freeze(["generation"]),
  teaching_learning: Object.freeze(["generation"]),
});
const MAX_CATALOG_TOOLS = 256;
const MAX_RECOMMENDATIONS = 8;

function readValue(record, key) {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function readPurposeSelections(value) {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const length = descriptors.length?.value;
    if (!Number.isInteger(length) || length < 0 || length > PURPOSES.size || Object.getOwnPropertySymbols(value).length) return null;
    if (Object.keys(descriptors).some((key) => key !== "length" && (!/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= length))) return null;
    const selections = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[index];
      if (!descriptor || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "string"
        || !PURPOSES.has(descriptor.value) || selections.includes(descriptor.value)) return null;
      selections.push(descriptor.value);
    }
    return selections;
  } catch {
    return null;
  }
}

function readPinnedNames(value) {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const length = descriptors.length?.value;
    if (!Number.isInteger(length) || length < 0 || length > 100 || Object.getOwnPropertySymbols(value).length) return null;
    if (Object.keys(descriptors).some((key) => key !== "length" && (!/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= length))) return null;
    const pinned = new Set();
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[index];
      if (!descriptor || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "string") return null;
      pinned.add(descriptor.value);
    }
    return pinned;
  } catch {
    return null;
  }
}

export function getPurposePinRecommendations({ accountId, activeScope, setupAccountScope, setup, catalog, pinned }) {
  if (typeof accountId !== "string" || !accountId || activeScope !== `account:${accountId}` || setupAccountScope !== activeScope) return null;
  try {
    if (!setup || typeof setup !== "object" || Array.isArray(setup) || Object.getPrototypeOf(setup) !== Object.prototype
      || readValue(setup, "complete") !== true) return null;
    const selections = readPurposeSelections(readValue(setup, "selections"));
    if (!selections || !Array.isArray(catalog) || Object.getPrototypeOf(catalog) !== Array.prototype) return null;
    const catalogLength = Object.getOwnPropertyDescriptor(catalog, "length")?.value;
    if (!Number.isInteger(catalogLength) || catalogLength < 0 || catalogLength > MAX_CATALOG_TOOLS) return null;
    const categories = new Set(selections.flatMap((purpose) => PURPOSE_CATEGORIES[purpose] || []));
    const pinnedNames = readPinnedNames(pinned);
    if (!pinnedNames) return null;
    const recommendations = [];
    const names = new Set();
    for (let index = 0; index < catalogLength && recommendations.length < MAX_RECOMMENDATIONS; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(catalog, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, "value")) continue;
      const tool = descriptor.value;
      if (!tool || typeof tool !== "object" || Array.isArray(tool) || Object.getPrototypeOf(tool) !== Object.prototype) continue;
      const name = readValue(tool, "name");
      const category = readValue(tool, "category");
      const status = readValue(tool, "status");
      const available = readValue(tool, "available");
      if (typeof name !== "string" || !name.trim() || name.length > 160 || typeof category !== "string"
        || !categories.has(category) || !["supported", "permission_required"].includes(status)
        || (status === "supported" && available !== true) || (status === "permission_required" && available !== false)
        || names.has(name) || pinnedNames.has(name)) continue;
      names.add(name);
      recommendations.push(Object.freeze({ name, category, status, available, accountScope: activeScope }));
    }
    return Object.freeze({
      accountScope: activeScope,
      source: "purposes",
      purposeSelections: Object.freeze([...selections]),
      recommendations: Object.freeze(recommendations),
    });
  } catch {
    return null;
  }
}
