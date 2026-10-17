const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_DISPATCH_TIMEOUT_MS = 20_000;
const MAX_DISPATCH_TIMEOUT_MS = 60_000;

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

function validateOutboxSignal(signal) {
  if (signal && (typeof signal.aborted !== "boolean" || typeof signal.addEventListener !== "function" || typeof signal.removeEventListener !== "function")) {
    throw new TypeError("Outbox cancellation requires an AbortSignal.");
  }
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

  async listPending(limit = 100) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new RangeError("Replay limit must be between 1 and 1000.");
    return [...this.events.values()].filter((event) => event.state === "pending").sort((a, b) => a.createdAt - b.createdAt).slice(0, limit).map(eventSnapshot);
  }

  async acknowledge(eventId, leaseToken) {
    if (this.leases.get(eventId)?.token !== leaseToken) return false;
    const event = this.events.get(eventId);
    if (!event) return false;
    event.state = "delivered";
    event.deliveredAt = this.now();
    this.leases.delete(eventId);
    return true;
  }

  async release(eventId, leaseToken, _error) {
    if (this.leases.get(eventId)?.token !== leaseToken) return false;
    const event = this.events.get(eventId);
    if (!event) return false;
    // Exception messages can contain user data. Keep the local adapter aligned
    // with the durable schema's non-sensitive failure code.
    event.lastError = "delivery_failed";
    this.leases.delete(eventId);
    return true;
  }
}

export async function deliverOutboxEvent(eventId, { store, dispatch, leaseMs = DEFAULT_LEASE_MS, timeoutMs, signal } = {}) {
  if (!store || typeof store.claim !== "function" || typeof store.acknowledge !== "function" || typeof store.release !== "function") throw new TypeError("A conforming event outbox store is required.");
  if (typeof dispatch !== "function") throw new TypeError("An event dispatcher is required.");
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > 300_000) throw new RangeError("Event lease must be between 1 ms and 5 minutes.");
  const effectiveTimeoutMs = timeoutMs ?? Math.min(DEFAULT_DISPATCH_TIMEOUT_MS, Math.max(1, Math.floor(leaseMs / 2)));
  if (!Number.isSafeInteger(effectiveTimeoutMs) || effectiveTimeoutMs < 1 || effectiveTimeoutMs > MAX_DISPATCH_TIMEOUT_MS || effectiveTimeoutMs >= leaseMs) {
    throw new RangeError("Outbox dispatch timeout must be positive, at most 60 seconds, and shorter than its lease.");
  }
  if (signal && (typeof signal.aborted !== "boolean" || typeof signal.addEventListener !== "function" || typeof signal.removeEventListener !== "function")) {
    throw new TypeError("Outbox cancellation requires an AbortSignal.");
  }
  if (signal?.aborted) return { delivered: false, state: "cancelled", eventId };
  const claim = await store.claim(eventId, leaseMs);
  if (!claim) return { delivered: false, state: "not_claimed" };
  const controller = new AbortController();
  if (signal?.aborted) {
    controller.abort(new Error("Outbox dispatch was cancelled."));
    return { delivered: false, state: "pending", eventId, error: "delivery_cancelled" };
  }
  let timeoutId;
  let resolveInterrupt;
  const interrupted = new Promise((resolve) => { resolveInterrupt = resolve; });
  const onAbort = () => resolveInterrupt({ kind: "cancelled" });
  signal?.addEventListener("abort", onAbort, { once: true });
  timeoutId = setTimeout(() => resolveInterrupt({ kind: "timeout" }), effectiveTimeoutMs);
  // Delivery is at-least-once across a crash between handler completion and
  // acknowledgement. Handlers should honor this signal and deduplicate side
  // effects by eventId/idempotencyKey.
  const dispatchPromise = Promise.resolve().then(() => dispatch(claim.event.eventName, claim.event.payload, {
    eventId: claim.event.id,
    idempotencyKey: claim.event.idempotencyKey,
    scope: claim.event.scope,
    attempt: claim.event.attempts,
    signal: controller.signal,
  }));
  // A dispatcher may ignore cancellation and settle after this worker returns.
  // Observe late rejection; its stale lease token is never acknowledged here.
  void dispatchPromise.catch(() => {});
  let outcome;
  try {
    outcome = await Promise.race([
      dispatchPromise.then(() => ({ kind: "delivered" }), () => ({ kind: "failed" })),
      interrupted,
    ]);
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onAbort);
  }
  if (outcome.kind === "timeout" || outcome.kind === "cancelled") {
    controller.abort(new Error(outcome.kind === "timeout" ? "Outbox dispatch timed out." : "Outbox dispatch was cancelled."));
    // Keep the lease until expiry instead of releasing while an uncooperative
    // handler may still be performing its side effect. Replay can recover it.
    return { delivered: false, state: "pending", eventId, error: outcome.kind === "timeout" ? "delivery_timeout" : "delivery_cancelled" };
  }
  if (outcome.kind === "failed") {
    await store.release(eventId, claim.leaseToken);
    return { delivered: false, state: "pending", eventId, error: "delivery_failed" };
  }
  if (!await store.acknowledge(eventId, claim.leaseToken)) return { delivered: false, state: "lease_lost" };
  return { delivered: true, state: "delivered", eventId };
}

export async function publishEventOnce(idempotencyKey, eventName, payload, { store, dispatch, leaseMs, timeoutMs, signal, scope } = {}) {
  if (!store || typeof store.appendOnce !== "function" || typeof store.listPending !== "function") throw new TypeError("A conforming event outbox store is required.");
  validateOutboxSignal(signal);
  // Enqueue is the durable boundary. A caller cancelled before this point must
  // not create work that a later replay could deliver. Once appendOnce starts,
  // cancellation cannot safely retract a transaction that may already commit;
  // it only prevents or stops this call's immediate delivery.
  if (signal?.aborted) {
    return { delivered: false, state: "cancelled", error: "enqueue_cancelled", enqueued: false, created: false, duplicate: false, eventId: null };
  }
  const { created, event } = await store.appendOnce(idempotencyKey, eventName, payload, scope);
  const result = await deliverOutboxEvent(event.id, { store, dispatch, leaseMs, timeoutMs, signal });
  return { ...result, enqueued: true, created, duplicate: !created, eventId: event.id };
}

export async function replayPendingEvents({ store, dispatch, limit = 100, leaseMs, timeoutMs, signal } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new RangeError("Replay limit must be between 1 and 1000.");
  if (!store || typeof store.listPending !== "function") throw new TypeError("A conforming event outbox store is required.");
  const pending = await store.listPending(limit);
  const results = [];
  for (const event of pending) {
    if (signal?.aborted) break;
    results.push(await deliverOutboxEvent(event.id, { store, dispatch, leaseMs, timeoutMs, signal }));
  }
  return results;
}
