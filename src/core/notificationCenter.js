import { loadStoredProactiveSettings } from "../lib/proactiveStore.js";
import { publish } from "./eventBus.js";

const STORAGE_KEY = "hey_notifications";
const MAX_VISIBLE = 8;

const listeners = new Set();

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStored(notifications) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, MAX_VISIBLE)));
  } catch {
    /* storage unavailable */
  }
}

export function getNotifications() {
  return readStored();
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

function minutesOf(date) {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Quiet behavior uses the shared quiet-hours setting.
 * Low/medium notifications are held back during the window;
 * urgent (priority >= 2) notifications still break through.
 */
export function isQuietMoment(now = new Date()) {
  const settings = loadStoredProactiveSettings();
  if (!settings.enabled) return false;
  const start = Number(String(settings.quietHours?.start || "22:00").split(":")[0]) * 60 +
    Number(String(settings.quietHours?.start || "22:00").split(":")[1]);
  const end = Number(String(settings.quietHours?.end || "08:00").split(":")[0]) * 60 +
    Number(String(settings.quietHours?.end || "08:00").split(":")[1]);
  const nowMin = minutesOf(now);
  if (start === end) return false;
  return start > end ? nowMin >= start || nowMin < end : nowMin >= start && nowMin < end;
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
    path: entry.path || null,
    actions,
    createdAt: now.toISOString(),
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