import { publishEventOnce, replayPendingEvents } from "./eventOutbox.js";

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

export function publishOnce(eventName, payload = {}, { idempotencyKey, scope, store, leaseMs } = {}) {
  return publishEventOnce(idempotencyKey, eventName, payload, {
    store,
    leaseMs,
    scope,
    dispatch: async (name, data, metadata) => {
      const current = [...(listeners.get(name) || [])];
      if (current.length === 0) throw new Error(`No event handlers are registered for ${name}.`);
      for (const listener of current) await listener(data, metadata);
    },
  });
}

export function replayPending({ store, limit = 100, leaseMs } = {}) {
  return replayPendingEvents({
    store,
    limit,
    leaseMs,
    dispatch: async (name, data, metadata) => {
      const current = [...(listeners.get(name) || [])];
      if (current.length === 0) throw new Error(`No event handlers are registered for ${name}.`);
      for (const listener of current) await listener(data, metadata);
    },
  });
}

export function clearEventListeners(eventName) {
  if (eventName) return listeners.delete(eventName);
  listeners.clear();
  return true;
}

export default { subscribe, publish, publishOnce, replayPending, clearEventListeners };
