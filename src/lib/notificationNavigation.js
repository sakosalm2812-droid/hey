const MAX_NOTIFICATION_PATH_LENGTH = 2048;
const ROUTE_ORIGIN = "https://hey.invalid";

function hasControlCharacters(value) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function getSafeNotificationPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_NOTIFICATION_PATH_LENGTH
    || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")
    || hasControlCharacters(value)) return null;
  try {
    const url = new URL(value, ROUTE_ORIGIN);
    if (url.origin !== ROUTE_ORIGIN || url.username || url.password) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function getSafeNotificationActions(value) {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return Object.freeze([]);
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (!Number.isSafeInteger(length) || length < 0) return Object.freeze([]);
    const actions = [];
    for (let index = 0; index < Math.min(length, 2); index += 1) {
      const entry = Object.getOwnPropertyDescriptor(value, String(index));
      if (!entry || !Object.hasOwn(entry, "value")) continue;
      const action = entry.value;
      if (!action || typeof action !== "object" || Array.isArray(action) || Object.getPrototypeOf(action) !== Object.prototype) continue;
      const labelDescriptor = Object.getOwnPropertyDescriptor(action, "label");
      if (!labelDescriptor || !Object.hasOwn(labelDescriptor, "value") || typeof labelDescriptor.value !== "string") continue;
      const label = labelDescriptor.value.trim();
      if (!label) continue;
      const pathDescriptor = Object.getOwnPropertyDescriptor(action, "path");
      const path = pathDescriptor && Object.hasOwn(pathDescriptor, "value")
        ? getSafeNotificationPath(pathDescriptor.value)
        : null;
      actions.push(Object.freeze({ label: label.slice(0, 80), path }));
    }
    return Object.freeze(actions);
  } catch {
    return Object.freeze([]);
  }
}
