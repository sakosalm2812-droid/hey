function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export const safeStorage = {
  getItem(key) {
    try { return storage()?.getItem(key) ?? null; } catch { return null; }
  },
  setItem(key, value) {
    try { storage()?.setItem(key, value); } catch { /* Storage can be unavailable or full. */ }
  },
  removeItem(key) {
    try { storage()?.removeItem(key); } catch { /* Storage can be unavailable. */ }
  },
};
