function canonical(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null && !Array.isArray(value))) throw new TypeError("Outbox payload must be plain JSON data.");
  if (ancestors.has(value)) throw new TypeError("Outbox payload cannot contain cycles.");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) throw new TypeError("Outbox arrays cannot have holes or custom properties.");
      return `[${value.map((entry) => canonical(entry, ancestors)).join(",")}]`;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return `{${Object.keys(value).sort().map((key) => {
      if (!Object.hasOwn(descriptors[key], "value")) throw new TypeError("Outbox payload cannot contain accessors.");
      return `${JSON.stringify(key)}:${canonical(descriptors[key].value, ancestors)}`;
    }).join(",")}}`;
  } finally { ancestors.delete(value); }
}

function eventSnapshot(event) {
  return { ...event, payload: JSON.parse(event.fingerprint) };
}

export class EventOutboxStoreContract {
  async appendOnce() { throw new Error("Implement appendOnce with a durable unique key and transactional persistence."); }
  async claim() { throw new Error("Implement atomic lease claim with expiry and fencing token."); }
  async listPending() { throw new Error("Implement ordered pending event retrieval."); }
  async acknowledge() { throw new Error("Implement lease-token checked acknowledgement."); }
  async release() { throw new Error("Implement lease-token checked retry release."); }
}

// Test/local adapter only. Production delivery requires a durable transactional outbox.
export class InMemoryEventOutboxStore extends EventOutboxStoreContract {
  constructor({ now = Date.now } = {}) {
    super();
    this.now = now;
    this.events = new Map();
    this.keys = new Map();
    this.leases = new Map();
  }

  async appendOnce(idempotencyKey, eventName, payload, scope) {
    if (typeof idempotencyKey !== "string" || !idempotencyKey.trim() || typeof eventName !== "string" || !eventName.trim() || typeof scope !== "string" || !scope.trim()) throw new TypeError("Event key, name, and account or system scope are required.");
    const fingerprint = canonical(payload);
    const key = `${scope}\u0000${eventName}\u0000${idempotencyKey}`;
    const existingId = this.keys.get(key);
    if (existingId) {
      const existing = this.events.get(existingId);
      if (existing.fingerprint !== fingerprint) throw new Error("Idempotency key was reused with a different event payload.");
      return { created: false, event: eventSnapshot(existing) };
    }
    const event = { id: globalThis.crypto?.randomUUID?.() ?? `${this.now()}-${Math.random().toString(36).slice(2)}`, idempotencyKey, scope, eventName, payload: JSON.parse(fingerprint), fingerprint, state: "pending", attempts: 0, createdAt: this.now() };
    this.events.set(event.id, event);
    this.keys.set(key, event.id);
    return { created: true, event: eventSnapshot(event) };
  }

  async claim(eventId, leaseMs = 30_000) {
    if (!Number.isFinite(leaseMs) || leaseMs < 1 || leaseMs > 300_000) throw new RangeError("Event lease must be between 1 ms and 5 minutes.");
    const event = this.events.get(eventId);
    if (!event || event.state === "delivered") return null;
    const lease = this.leases.get(eventId);
    if (lease && lease.until > this.now()) return null;
    const token = globalThis.crypto?.randomUUID?.() ?? `${this.now()}-${Math.random().toString(36).slice(2)}`;
    const next = { token, until: this.now() + leaseMs };
    this.leases.set(eventId, next);
    event.attempts += 1;
    return { event: eventSnapshot(event), leaseToken: token };
  }

  async listPending() { return [...this.events.values()].filter((event) => event.state === "pending").sort((a, b) => a.createdAt - b.createdAt).map(eventSnapshot); }

  async acknowledge(eventId, leaseToken) {
    if (this.leases.get(eventId)?.token !== leaseToken) return false;
    const event = this.events.get(eventId);
    if (!event) return false;
    event.state = "delivered";
    event.deliveredAt = this.now();
    this.leases.delete(eventId);
    return true;
  }

  async release(eventId, leaseToken, error) {
    if (this.leases.get(eventId)?.token !== leaseToken) return false;
    const event = this.events.get(eventId);
    if (!event) return false;
    event.lastError = String(error?.message ?? error ?? "delivery failed").slice(0, 500);
    this.leases.delete(eventId);
    return true;
  }
}

export async function deliverOutboxEvent(eventId, { store, dispatch, leaseMs } = {}) {
  if (!store || typeof store.claim !== "function" || typeof store.acknowledge !== "function" || typeof store.release !== "function") throw new TypeError("A conforming event outbox store is required.");
  if (typeof dispatch !== "function") throw new TypeError("An event dispatcher is required.");
  const claim = await store.claim(eventId, leaseMs);
  if (!claim) return { delivered: false, state: "not_claimed" };
  try {
    // Delivery is at-least-once across a crash between handler completion and ack;
    // consumers with external side effects must deduplicate by eventId/idempotencyKey.
    await dispatch(claim.event.eventName, claim.event.payload, { eventId: claim.event.id, idempotencyKey: claim.event.idempotencyKey, scope: claim.event.scope, attempt: claim.event.attempts });
    if (!await store.acknowledge(eventId, claim.leaseToken)) return { delivered: false, state: "lease_lost" };
    return { delivered: true, state: "delivered", eventId };
  } catch (error) {
    await store.release(eventId, claim.leaseToken, error);
    return { delivered: false, state: "pending", eventId, error: String(error?.message ?? error) };
  }
}

export async function publishEventOnce(idempotencyKey, eventName, payload, { store, dispatch, leaseMs, scope } = {}) {
  if (!store || typeof store.appendOnce !== "function" || typeof store.listPending !== "function") throw new TypeError("A conforming event outbox store is required.");
  const { created, event } = await store.appendOnce(idempotencyKey, eventName, payload, scope);
  const result = await deliverOutboxEvent(event.id, { store, dispatch, leaseMs });
  return { ...result, created, duplicate: !created, eventId: event.id };
}

export async function replayPendingEvents({ store, dispatch, limit = 100, leaseMs } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new RangeError("Replay limit must be between 1 and 1000.");
  if (!store || typeof store.listPending !== "function") throw new TypeError("A conforming event outbox store is required.");
  const pending = (await store.listPending()).slice(0, limit);
  const results = [];
  for (const event of pending) results.push(await deliverOutboxEvent(event.id, { store, dispatch, leaseMs }));
  return results;
}
