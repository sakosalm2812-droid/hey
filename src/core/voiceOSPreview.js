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

function parseSafeWebTarget(value) {
  const target = safeText(value);
  if (!target) return null;
  const match = target.match(/^https?:\/\/([^/?#]*)/i);
  if (!match) return null;
  const authority = match[1];
  if (!authority || authority.includes("@") || authority.endsWith(":") || /[\\\s]/.test(authority)) return null;
  try {
    const parsed = new URL(target);
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:")
      || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Classify a delayed expiry callback against the live preview and account. */
export function getComputerPreviewExpiryAction(input) {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) return "stale";
    const inputFields = Object.getOwnPropertyDescriptors(input);
    if (Object.getPrototypeOf(input) !== Object.prototype
      || Object.getOwnPropertySymbols(input).length
      || Object.keys(inputFields).length !== 3
      || ["scheduledPreviewId", "currentPreview", "currentAccountScope"].some((key) =>
        !inputFields[key]?.enumerable || !Object.hasOwn(inputFields[key], "value"))) return "stale";
    const { scheduledPreviewId, currentPreview, currentAccountScope } = Object.fromEntries(
      Object.entries(inputFields).map(([key, descriptor]) => [key, descriptor.value]),
    );
    if (typeof scheduledPreviewId !== "string" || !scheduledPreviewId
      || (currentAccountScope !== null && typeof currentAccountScope !== "string")) return "stale";
    if (!currentPreview || typeof currentPreview !== "object" || Array.isArray(currentPreview)
      || Object.getPrototypeOf(currentPreview) !== Object.prototype) return "stale";
    const previewFields = Object.getOwnPropertyDescriptors(currentPreview);
    for (const key of ["preview", "accountScope", "reviewed"]) {
      if (!previewFields[key]?.enumerable || !Object.hasOwn(previewFields[key], "value")) return "stale";
    }
    const preview = previewFields.preview.value;
    if (!preview || typeof preview !== "object" || Array.isArray(preview)
      || Object.getPrototypeOf(preview) !== Object.prototype) return "stale";
    const previewIdField = Object.getOwnPropertyDescriptor(preview, "previewId");
    if (!previewIdField || !Object.hasOwn(previewIdField, "value")
      || previewIdField.value !== scheduledPreviewId || previewFields.reviewed.value !== false) return "stale";
    const accountScope = previewFields.accountScope.value;
    if (typeof accountScope !== "string" || !accountScope) return "stale";
    return accountScope === currentAccountScope ? "expire" : "clear";
  } catch {
    return "stale";
  }
}

/** Clear a submitted typed request only if no newer composer draft replaced it. */
export function shouldClearSubmittedComputerPreviewDraft(submittedDraft, currentDraft) {
  return typeof submittedDraft === "string" && submittedDraft.trim().length > 0
    && typeof currentDraft === "string" && currentDraft === submittedDraft;
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
      const parsed = parseSafeWebTarget(ownValue(command, "url"));
      if (!parsed) return null;
      return Object.freeze({ capability: "browser.open_url", label: "Open website", target: parsed.href, risk: "Medium" });
    }
    return null;
  } catch {
    return null;
  }
}

/** Decide whether a failed refresh may restore its request without crossing current UI context. */
export function canRestoreComputerPreviewRequest(input) {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) return false;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return false;
    if (Object.getOwnPropertySymbols(input).length) return false;
    const fields = Object.getOwnPropertyDescriptors(input);
    const allowed = [
      "pendingPreviewId", "currentPreviewId", "pendingAccountScope", "currentAccountScope",
      "expectedAccountScope", "pendingConversationId", "currentConversationId", "currentDraft",
    ];
    if (Object.keys(fields).length !== allowed.length || Object.keys(fields).some((key) => !allowed.includes(key))) return false;
    const values = Object.create(null);
    for (const key of allowed) {
      const descriptor = fields[key];
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return false;
      values[key] = descriptor.value;
    }
    const conversationIsValid = (value) => value === null || typeof value === "string";
    return typeof values.pendingPreviewId === "string" && values.pendingPreviewId.length > 0
      && values.currentPreviewId === values.pendingPreviewId
      && typeof values.pendingAccountScope === "string" && values.pendingAccountScope.length > 0
      && values.pendingAccountScope === values.currentAccountScope
      && values.pendingAccountScope === values.expectedAccountScope
      && conversationIsValid(values.pendingConversationId)
      && values.pendingConversationId === values.currentConversationId
      && typeof values.currentDraft === "string" && values.currentDraft.trim().length === 0;
  } catch {
    return false;
  }
}

export default { describeSafeComputerActionPreview };
