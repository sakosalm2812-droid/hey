const listeners = new Map();

export function subscribe(eventName, listener) {
  if (typeof listener !== "function") throw new TypeError("A listener is required.");
  const current = listeners.get(eventName) || new Set();
  current.add(listener);
  listeners.set(eventName, current);
  return () => current.delete(listener);
}

export function publish(eventName, payload = {}) {
  const current = listeners.get(eventName) || new Set();
  current.forEach((listener) => listener(payload));
  return current.size;
}

export function clearEventListeners(eventName) {
  if (eventName) return listeners.delete(eventName);
  listeners.clear();
  return true;
}

export default { subscribe, publish, clearEventListeners };
