function tryFocus(target) {
  try {
    if (!target || typeof target.focus !== "function") return false;
    target.focus();
    return true;
  } catch {
    return false;
  }
}

export function focusDictationEditTarget(stage, status, { flowHeading, statusMessage } = {}) {
  if (stage === "idle") {
    return typeof status === "string" && status.length > 0 ? tryFocus(statusMessage) : false;
  }
  if (["capture", "consent", "previewing", "review", "confirmed"].includes(stage)) {
    return tryFocus(flowHeading);
  }
  return false;
}
