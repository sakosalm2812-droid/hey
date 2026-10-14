import { EventOutboxStoreContract } from "./eventOutbox.js";

const MAX_TEXT = 512;
const MAX_LEASE_MS = 300_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validText(value, label, maximum = MAX_TEXT) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || [...value].some((char) => char.codePointAt(0) < 32 || char.codePointAt(0) === 127)) {
    throw new TypeError(`${label} must be bounded printable text.`);
  }
  return value.trim();
}

function jsonValue(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null && !Array.isArray(value))) {
    throw new TypeError("Outbox payload must be plain JSON data.");
  }
  if (ancestors.has(value)) throw new TypeError("Outbox payload cannot contain cycles.");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) throw new TypeError("Outbox arrays cannot have holes or custom properties.");
      return value.map((entry) => jsonValue(entry, ancestors));
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (!Object.hasOwn(descriptors[key], "value")) throw new TypeError("Outbox payload cannot contain accessors.");
      Object.defineProperty(result, key, { value: jsonValue(descriptors[key].value, ancestors), enumerable: true, configurable: true, writable: true });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function rpcData(result, operation) {
  if (!result || typeof result !== "object" || result.error) {
    // Supabase error bodies can contain query data. Never copy them into logs or
    // user-facing errors; preserve only the stable operation name.
    throw new Error(`Supabase event outbox ${operation} failed.`);
  }
  return result.data;
}

function eventFromRow(row) {
  if (!row || typeof row !== "object" || !UUID.test(row.id)
    || typeof row.idempotencyKey !== "string" || typeof row.scope !== "string"
    || typeof row.eventName !== "string" || !["pending", "delivered"].includes(row.state)
    || !Number.isSafeInteger(row.attempts) || row.attempts < 0
    || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))
    || (row.deliveredAt !== null && row.deliveredAt !== undefined && (typeof row.deliveredAt !== "string" || !Number.isFinite(Date.parse(row.deliveredAt))))
    || (row.lastError !== null && row.lastError !== undefined && row.lastError !== "delivery_failed")) {
    throw new Error("Supabase event outbox response was malformed.");
  }
  return {
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    scope: row.scope,
    eventName: row.eventName,
    payload: jsonValue(row.payload),
    state: row.state,
    attempts: row.attempts,
    createdAt: Date.parse(row.createdAt),
    ...(row.deliveredAt ? { deliveredAt: Date.parse(row.deliveredAt) } : {}),
    ...(row.lastError ? { lastError: row.lastError } : {}),
  };
}

/**
 * Durable outbox adapter for trusted server-side Supabase clients only. The
 * migration's privileged RPCs keep append, claim, and lease fencing atomic.
 * Do not instantiate with an anon/browser client.
 */
export class SupabaseEventOutboxStore extends EventOutboxStoreContract {
  constructor(client, { trustedServer = false } = {}) {
    super();
    if (!client || typeof client.rpc !== "function") throw new TypeError("A configured Supabase client is required for durable event outbox storage.");
    if (trustedServer !== true) throw new TypeError("SupabaseEventOutboxStore is restricted to trusted server-side clients.");
    this.client = client;
    Object.defineProperty(this, "testOnly", { value: false, enumerable: true });
  }

  async appendOnce(idempotencyKey, eventName, payload, scope) {
    const params = {
      p_idempotency_key: validText(idempotencyKey, "Event idempotency key"),
      p_event_name: validText(eventName, "Event name"),
      p_payload: jsonValue(payload),
      p_scope: validText(scope, "Event scope"),
    };
    const data = rpcData(await this.client.rpc("append_hey_event_outbox_once", params), "append");
    if (!data || typeof data !== "object" || typeof data.created !== "boolean") throw new Error("Supabase event outbox response was malformed.");
    return { created: data.created, event: eventFromRow(data.event) };
  }

  async claim(eventId, leaseMs = 30_000) {
    if (typeof eventId !== "string" || !UUID.test(eventId)) throw new TypeError("Event id must be a UUID.");
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > MAX_LEASE_MS) throw new RangeError("Event lease must be between 1 ms and 5 minutes.");
    const data = rpcData(await this.client.rpc("claim_hey_event_outbox", { p_event_id: eventId, p_lease_ms: leaseMs }), "claim");
    if (data === null) return null;
    if (!data || typeof data !== "object" || !UUID.test(data.leaseToken)) throw new Error("Supabase event outbox lease response was malformed.");
    return { event: eventFromRow(data.event), leaseToken: data.leaseToken };
  }

  async listPending(limit = 100) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new RangeError("Replay limit must be between 1 and 1000.");
    const data = rpcData(await this.client.rpc("list_hey_event_outbox_pending", { p_limit: limit }), "list");
    if (!Array.isArray(data)) throw new Error("Supabase event outbox response was malformed.");
    return data.map(eventFromRow);
  }

  async acknowledge(eventId, leaseToken) {
    if (typeof eventId !== "string" || !UUID.test(eventId) || typeof leaseToken !== "string" || !UUID.test(leaseToken)) return false;
    const data = rpcData(await this.client.rpc("ack_hey_event_outbox", { p_event_id: eventId, p_lease_token: leaseToken }), "acknowledgement");
    if (typeof data !== "boolean") throw new Error("Supabase event outbox response was malformed.");
    return data;
  }

  async release(eventId, leaseToken, _error) {
    if (typeof eventId !== "string" || !UUID.test(eventId) || typeof leaseToken !== "string" || !UUID.test(leaseToken)) return false;
    const data = rpcData(await this.client.rpc("release_hey_event_outbox", { p_event_id: eventId, p_lease_token: leaseToken }), "release");
    if (typeof data !== "boolean") throw new Error("Supabase event outbox response was malformed.");
    return data;
  }
}

export default SupabaseEventOutboxStore;
