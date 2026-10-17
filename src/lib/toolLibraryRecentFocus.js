export function scheduleRecentToolCardFocus({
  name,
  accountId,
  requestId,
  getActiveScope,
  isCurrentRequest,
  isCatalogCurrent,
  findCard,
  findRecentAction,
  requestFrame,
  cancelFrame,
}) {
  const accountScope = typeof accountId === "string" && accountId ? `account:${accountId}` : null;
  let cancelled = false;
  let focused = false;
  let frameId = null;

  const requestIsCurrent = () => {
    try {
      return Boolean(accountScope && getActiveScope() === accountScope && isCurrentRequest(requestId));
    } catch {
      return false;
    }
  };
  const restoreRecentAction = () => {
    if (!requestIsCurrent()) return false;
    try {
      const action = findRecentAction(name);
      if (!action || action.isConnected === false || typeof action.focus !== "function") return false;
      action.focus();
      return true;
    } catch {
      return false;
    }
  };
  const task = {
    get focused() { return focused; },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      try {
        if (frameId !== null) cancelFrame(frameId);
      } catch { /* A cancelled frame is still fenced by the local flag. */ }
    },
  };

  if (!accountScope || !requestIsCurrent()) return Object.freeze({ status: "stale", task });
  try {
    if (!isCatalogCurrent(name)) {
      restoreRecentAction();
      return Object.freeze({ status: "stale_catalog", task });
    }
    frameId = requestFrame(() => {
      if (cancelled || !requestIsCurrent()) return;
      try {
        if (!isCatalogCurrent(name)) {
          restoreRecentAction();
          return;
        }
        const card = findCard(name);
        if (!card || card.isConnected === false || typeof card.scrollIntoView !== "function" || typeof card.focus !== "function") {
          restoreRecentAction();
          return;
        }
        card.scrollIntoView({ block: "center", behavior: "smooth" });
        if (cancelled || !requestIsCurrent() || !isCatalogCurrent(name)) {
          restoreRecentAction();
          return;
        }
        card.focus({ preventScroll: true });
        focused = true;
      } catch {
        restoreRecentAction();
      }
    });
  } catch {
    restoreRecentAction();
    return Object.freeze({ status: "schedule_failed", task });
  }

  return Object.freeze({ status: "scheduled", task });
}
