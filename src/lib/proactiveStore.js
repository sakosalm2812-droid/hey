/**
 * Persistence for proactive engine preferences and
 * the daily suggestion budget.
 *
 * The engine itself (`core/proactiveEngine`) stays
 * pure; this module owns storage and day boundaries.
 */

const SETTINGS_KEY = "hey_proactive_settings";
const BUDGET_KEY = "hey_proactive_budget";

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export function dayKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function loadStoredProactiveSettings() {
  const stored = readJSON(SETTINGS_KEY, {});
  return stored && typeof stored === "object" ? stored : {};
}

export function saveProactiveSettings(settings) {
  writeJSON(SETTINGS_KEY, settings);
  return settings;
}

export function resetProactiveSettings() {
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Return how many suggestions were surfaced for
 * the current day, and record new ones.
 */
export function getSuggestionsToday() {
  const budget = readJSON(BUDGET_KEY, {});
  return budget[dayKey()] || 0;
}

/**
 * Record that `count` suggestions were surfaced
 * today. Returns the new running total.
 */
export function recordSuggestionsToday(count) {
  const key = dayKey();
  const budget = readJSON(BUDGET_KEY, {});
  const total = (budget[key] || 0) + Math.max(0, count);
  budget[key] = total;
  writeJSON(BUDGET_KEY, budget);
  return total;
}

/**
 * The next time HEY may surface a suggestion,
 * respecting the quiet-hours preference the user
 * configured.
 */
export function getNextProactiveWindow(settings) {
  const start = String(settings.quietHours?.start || "22:00");
  const end = String(settings.quietHours?.end || "08:00");
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes === endMinutes) return now;
  if (startMinutes > endMinutes) {
    return nowMinutes < endMinutes || nowMinutes >= startMinutes
      ? now
      : new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          startH,
          startM,
        );
  }
  return nowMinutes >= startMinutes && nowMinutes < endMinutes
    ? now
    : new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        startH,
        startM,
      );
}

export default {
  dayKey,
  loadStoredProactiveSettings,
  saveProactiveSettings,
  resetProactiveSettings,
  getSuggestionsToday,
  recordSuggestionsToday,
  getNextProactiveWindow,
};