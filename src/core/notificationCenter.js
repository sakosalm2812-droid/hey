import { loadStoredProactiveSettings } from "../lib/proactiveStore.js";
import { publish } from "./eventBus.js";
import { getAccountStorageKey } from "./accountScope.js";
import { isWithinQuietHours } from "./attentionPolicy.js";
import { getSetting } from "./settingsRegistry.js";

const STORAGE_KEY = "hey_notifications";
const MAX_VISIBLE = 8;

const listeners = new Set();

function readStored() {
  try {
    const raw = localStorage.getItem(getAccountStorageKey(STORAGE_KEY));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStored(notifications) {
  try {
    localStorage.setItem(getAccountStorageKey(STORAGE_KEY), JSON.stringify(notifications.slice(0, MAX_VISIBLE)));
  } catch {
    /* storage unavailable */
  }
}

export function getNotifications({ sharedSurface = isSharedSurface() } = {}) {
  const now = Date.now();
  return readStored()
    .filter((item) => !item.expiresAt || Date.parse(item.expiresAt) > now)
    .map((item) => presentNotification(item, { sharedSurface }));
}

export function isSharedSurface() {
  if (getSetting("mode.current") === "presentation") return true;
  if (typeof document === "undefined") return false;
  return document.documentElement?.dataset?.heyPublicMode === "true" ||
    Boolean(document.querySelector?.('[data-hey-public-surface="true"]'));
}

export function presentNotification(item, { sharedSurface = false } = {}) {
  if (!item || typeof item !== "object") return null;
  const privateItem = ["private", "sensitive", "secret"].includes(String(item.privacy || "private").toLowerCase());
  if (!sharedSurface || !privateItem) return { ...item, actions: Array.isArray(item.actions) ? item.actions : [] };
  return {
    ...item,
    title: "Private notification",
    body: "Open HEY to view this notification.",
    path: null,
    actions: [],
    redacted: true,
  };
}

export function subscribeNotifications(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  writeStored(readStored().slice(0, MAX_VISIBLE));
  const snapshot = getNotifications();
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.error("HEY notification listener error:", error);
    }
  });
  publish("notification.updated", { count: snapshot.length });
}

/**
 * Quiet behavior uses the shared quiet-hours setting.
 * Low/medium notifications are held back during the window;
 * urgent (priority >= 2) notifications still break through.
 */
export function isQuietMoment(now = new Date()) {
  const settings = loadStoredProactiveSettings();
  if (!settings.enabled) return false;
  return isWithinQuietHours(now, settings.quietHours || { start: "22:00", end: "08:00" }, settings.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
}

const CATEGORIES = ["success", "error", "warning", "info", "loading", "action-required"];

export function normaliseNotify(category, priority) {
  return {
    category: CATEGORIES.includes(category) ? category : "info",
    priority: Number(priority) >= 0 && Number(priority) <= 3 ? Number(priority) : 1,
  };
}

/**
 * Add (or update) a notification.
 * Setting `id` makes the notification deduplicate: it replaces
 * any existing notification with the same id instead of piling up.
 */
export function notify(entry = {}) {
  const now = new Date();
  const { category, priority } = normaliseNotify(entry.category, entry.priority);
  const id = entry.id || `hey-${uuid()}`;
  const quiet = entry.suppressQuiet ? false : isQuietMoment(now);
  const passesQuiet = quiet ? priority >= 2 : true;

  const current = readStored();
  const existingIndex = current.findIndex((item) => item.id === id);
  const actions = (Array.isArray(entry.actions) ? entry.actions : [])
    .slice(0, 2)
    .map((action) => ({
      label: String(action?.label || ""),
      path: action?.path || null,
    }))
    .filter((action) => action.label);

  const item = {
    id,
    category,
    priority,
    title: String(entry.title || "HEY"),
    body: String(entry.body || ""),
    privacy: ["public", "private", "sensitive", "secret"].includes(entry.privacy) ? entry.privacy : "private",
    path: entry.path || null,
    actions,
    createdAt: now.toISOString(),
    expiresAt: entry.expiresAt && Number.isFinite(Date.parse(entry.expiresAt)) ? new Date(entry.expiresAt).toISOString() : null,
    read: existingIndex >= 0 ? current[existingIndex].read : false,
    quieted: quiet && !passesQuiet,
    hidden: quiet && !passesQuiet,
  };

  const next = [...current];
  if (existingIndex >= 0) {
    next[existingIndex] = item;
  } else {
    next.unshift(item);
  }
  writeStored(next.slice(0, MAX_VISIBLE));
  emit();
  return item;
}

/** Deliver only through the canonical in-app surface and independently read it back. */
export function deliverInAppNotification(entry) {
  const item = notify({ ...entry, category: entry.category || "info" });
  const persisted = readStored().find((notification) => notification.id === item.id);
  return persisted?.id === item.id ? persisted : null;
}

function uuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function dismissNotification(id) {
  const next = readStored().filter((item) => item.id !== id);
  writeStored(next);
  emit();
}

export function markNotificationRead(id) {
  const next = readStored().map((item) =>
    item.id === id ? { ...item, read: true } : item,
  );
  writeStored(next);
  emit();
}

export function markAllNotificationsRead() {
  const next = readStored().map((item) => ({ ...item, read: true }));
  writeStored(next);
  emit();
}

export function clearNotifications() {
  writeStored([]);
  emit();
}

export function unreadCount() {
  return readStored().filter((item) => !item.read).length;
}

export default {
  notify,
  getNotifications,
  subscribeNotifications,
  dismissNotification,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotifications,
  unreadCount,
  isQuietMoment,
};
