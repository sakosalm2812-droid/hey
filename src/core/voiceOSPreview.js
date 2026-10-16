function ownValue(object, key) {
  if (!object || typeof object !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function safeText(value, maxLength = 512) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength
    && !Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    }) ? value.trim() : null;
}

/** Return a bounded display summary for one inert, user-reviewed computer request. */
export function describeSafeComputerActionPreview(preview) {
  try {
    if (Object.getPrototypeOf(preview) !== Object.prototype
      || ownValue(preview, "type") !== "Command"
      || ownValue(preview, "status") !== "preview_required"
      || ownValue(preview, "requiresConfirmation") !== true) return null;

    const body = ownValue(preview, "preview");
    if (Object.getPrototypeOf(body) !== null && Object.getPrototypeOf(body) !== Object.prototype) return null;
    const command = ownValue(body, "command");
    if (!command || (Object.getPrototypeOf(command) !== null && Object.getPrototypeOf(command) !== Object.prototype)) return null;

    const kind = ownValue(command, "kind");
    if (kind === "computer") {
      const operation = ownValue(command, "operation");
      const target = safeText(ownValue(command, "target"));
      if (!target) return null;
      if (operation === "open") return Object.freeze({ capability: "app.open", label: "Open app", target, risk: "High" });
      if (operation === "navigate_browser") return Object.freeze({ capability: "browser.navigate", label: "Navigate browser", target, risk: "Medium" });
      return null;
    }
    if (kind === "open_url") {
      const target = safeText(ownValue(command, "url"));
      if (!target) return null;
      const parsed = new URL(target);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
      return Object.freeze({ capability: "browser.open_url", label: "Open website", target: parsed.href, risk: "Medium" });
    }
    return null;
  } catch {
    return null;
  }
}

export default { describeSafeComputerActionPreview };
