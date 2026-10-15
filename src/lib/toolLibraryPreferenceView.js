const EMPTY_PREFERENCES = Object.freeze({
  favorites: Object.freeze([]),
  pinned: Object.freeze([]),
  recent: Object.freeze([]),
});

export function getToolLibraryPreferenceView({ accountId, activeScope, state }) {
  if (typeof accountId !== "string" || !accountId || activeScope !== `account:${accountId}`) {
    return { status: "account_required", ready: false, preferences: EMPTY_PREFERENCES };
  }
  if (state?.accountId !== accountId) {
    return { status: "loading", ready: false, preferences: EMPTY_PREFERENCES };
  }

  if (state.status !== "ready" || !state.preferences ||
      !Array.isArray(state.preferences.favorites) ||
      !Array.isArray(state.preferences.pinned) ||
      !Array.isArray(state.preferences.recent)) {
    return {
      status: state.status === "ready" ? "invalid_store" : state.status || "loading",
      ready: false,
      preferences: EMPTY_PREFERENCES,
    };
  }

  return { status: "ready", ready: true, preferences: state.preferences };
}
