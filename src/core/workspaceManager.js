/**
 * Workspace window manager.
 *
 * The HEY workspace lets widgets float as overlapping,
 * movable, resizable windows with a focus order (z).
 * Geometry and open state persist per device.
 */

const STORAGE_KEY = "hey_workspace_windows";
const listeners = new Set();

const DEFAULT_SIZE = { width: 420, height: 340 };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStored(windows) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(windows));
  } catch {
    /* storage unavailable */
  }
}

function normalizeWindow(entry) {
  const screenW = typeof window !== "undefined" ? window.innerWidth : 1440;
  const screenH = typeof window !== "undefined" ? window.innerHeight : 900;
  const width = clamp(Number(entry.width) || DEFAULT_SIZE.width, 280, Math.min(720, screenW - 40));
  const height = clamp(Number(entry.height) || DEFAULT_SIZE.height, 220, Math.min(640, screenH - 80));
  const x = clamp(Number(entry.x) === 0 || Number.isFinite(Number(entry.x))
    ? Number(entry.x)
    : Math.max(16, Math.round((screenW - width) / 2)),
  0, Math.max(0, screenW - width));
  const y = clamp(Number(entry.y) === 0 || Number.isFinite(Number(entry.y))
    ? Number(entry.y)
    : Math.max(16, Math.round((screenH - height) / 3)),
  0, Math.max(0, screenH - height - 60));

  return {
    id: String(entry.id || `window-${Date.now()}`),
    title: String(entry.title || "HEY"),
    contentId: String(entry.contentId || entry.id || "default"),
    x,
    y,
    width,
    height,
    z: Number(entry.z) || 1,
    minimized: Boolean(entry.minimized),
  };
}

export function openWindow(entry = {}) {
  const normalized = normalizeWindow(entry);
  const current = readStored().filter((item) => item.id !== normalized.id);
  normalized.z = Date.now();
  const next = [...current, normalized].sort((a, b) => a.z - b.z);
  writeStored(next);
  emit();
  return normalized;
}

export function closeWindow(id) {
  writeStored(readStored().filter((item) => item.id !== id));
  emit();
}

export function toggleMinimize(id) {
  const next = readStored().map((item) =>
    item.id === id ? { ...item, minimized: !item.minimized } : item,
  );
  writeStored(next);
  emit();
}

export function focusWindow(id) {
  const next = readStored().map((item) =>
    item.id === id ? { ...item, z: Date.now() } : item,
  );
  writeStored(next);
  emit();
}

export function moveWindow(id, x, y) {
  const next = readStored().map((item) =>
    item.id === id
      ? { ...item, x: Math.round(x), y: Math.round(y) }
      : item,
  );
  writeStored(next);
  emit(false);
}

export function resizeWindow(id, width, height) {
  const next = readStored().map((item) =>
    item.id === id
      ? { ...item, width: Math.max(280, Math.round(width)), height: Math.max(220, Math.round(height)) }
      : item,
  );
  writeStored(next);
  emit(false);
}

export function clearWindows() {
  writeStored([]);
  emit();
}

export function getWindows() {
  return readStored().map(normalizeWindow).sort((a, b) => a.z - b.z);
}

export function subscribeWindows(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(withFocus = true) {
  const snapshot = getWindows();
  listeners.forEach((listener) => {
    try {
      listener(snapshot, withFocus);
    } catch (error) {
      console.error("HEY workspace listener error:", error);
    }
  });
}

export default {
  openWindow,
  closeWindow,
  toggleMinimize,
  focusWindow,
  moveWindow,
  resizeWindow,
  clearWindows,
  getWindows,
  subscribeWindows,
};