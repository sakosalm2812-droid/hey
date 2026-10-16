const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_LEASE_MS = 300_000;
const MAX_COMMAND_BYTES = 65_536;

function requiredUuid(value, label) {
  if (typeof value !== "string" || !UUID.test(value)) throw new TypeError(`${label} must be a UUID.`);
  return value;
}

function requiredCredentialHash(value) {
  if (typeof value !== "string" || !SHA256.test(value)) throw new TypeError("Device credential digest must be a SHA-256 hex digest.");
  return value;
}

function boundedText(value, label, maximum = 256) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || [...value].some((char) => char.codePointAt(0) < 32 || char.codePointAt(0) === 127)) {
    throw new TypeError(`${label} must be bounded printable text.`);
  }
  return value.trim();
}

function mandateScope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("A verified device command mandate scope is required.");
  const keys = Reflect.ownKeys(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (keys.length !== 3 || keys.some((key) => !["mandateIds", "expiresAt", "revocationEpoch"].includes(key)
    || !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError("Device command mandate scope is malformed.");
  const mandateIds = descriptors.mandateIds.value;
  const expiresAt = descriptors.expiresAt.value;
  const revocationEpoch = descriptors.revocationEpoch.value;
  if (!Array.isArray(mandateIds) || Object.getPrototypeOf(mandateIds) !== Array.prototype || mandateIds.length < 1 || mandateIds.length > 5) {
    throw new TypeError("Device command mandate scope is malformed.");
  }
  const mandateKeys = Reflect.ownKeys(mandateIds);
  const mandateDescriptors = Object.getOwnPropertyDescriptors(mandateIds);
  if (mandateKeys.length !== mandateIds.length + 1 || !mandateKeys.includes("length")) throw new TypeError("Device command mandate scope is malformed.");
  const ids = Array.from({ length: mandateIds.length }, (_, index) => {
    const descriptor = mandateDescriptors[String(index)];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError("Device command mandate scope is malformed.");
    return descriptor.value;
  });
  if (ids.some((id) => typeof id !== "string" || !UUID.test(id))
    || new Set(ids).size !== ids.length
    || typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt)) || new Date(Date.parse(expiresAt)).toISOString() !== expiresAt
    || !Number.isSafeInteger(revocationEpoch) || revocationEpoch < 0) throw new TypeError("Device command mandate scope is malformed.");
  return { mandateIds: ids, expiresAt, revocationEpoch };
}

function cloneJson(value, ancestors = new WeakSet(), depth = 0, nodes = { count: 0 }) {
  nodes.count += 1;
  if (depth > 32 || nodes.count > 10_000) throw new RangeError("Device command input exceeds supported complexity.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object" || ancestors.has(value)) throw new TypeError("Device command input must be plain JSON data.");
  ancestors.add(value);
  try {
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new TypeError("Device command input must be plain JSON data.");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) throw new TypeError("Device command input cannot contain symbol properties.");
    if (array) {
      if (keys.length !== value.length + 1) throw new TypeError("Device command arrays cannot contain holes or custom properties.");
      return Array.from({ length: value.length }, (_, index) => {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) throw new TypeError("Device command input cannot contain accessors.");
        return cloneJson(descriptor.value, ancestors, depth + 1, nodes);
      });
    }
    const result = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new TypeError("Device command input contains unsupported properties.");
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError("Device command input cannot contain accessors or hidden properties.");
      Object.defineProperty(result, key, { value: cloneJson(descriptor.value, ancestors, depth + 1, nodes), enumerable: true, writable: true, configurable: true });
    }
    return result;
  } finally { ancestors.delete(value); }
}

function normalizeEnvelope(value) {
  const envelope = cloneJson(value);
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)
    || envelope.version !== 1
    || typeof envelope.action !== "string" || !/^[a-z][a-z0-9_.:-]{0,127}$/i.test(envelope.action)
    || typeof envelope.resource !== "string" || !envelope.resource.trim() || envelope.resource.length > 256
    || [...envelope.resource].some((char) => char.codePointAt(0) < 32 || char.codePointAt(0) === 127)
    || !envelope.input || typeof envelope.input !== "object" || Array.isArray(envelope.input)
    || Object.keys(envelope).some((key) => !["version", "action", "resource", "input"].includes(key))) {
    throw new TypeError("Device command envelope is invalid.");
  }
  const normalized = { version: 1, action: envelope.action, resource: envelope.resource.trim(), input: envelope.input };
  if (new TextEncoder().encode(JSON.stringify(normalized)).byteLength > MAX_COMMAND_BYTES) throw new RangeError("Device command envelope exceeds 64 KiB.");
  return normalized;
}

function rpcData(result, operation) {
  if (!result || typeof result !== "object" || result.error) throw new Error(`Supabase device command ${operation} failed.`);
  return result.data;
}

function commandFromRow(row) {
  if (!row || typeof row !== "object" || !UUID.test(row.commandId)
    || !UUID.test(row.deviceId) || !["pending", "acknowledged", "cancelled", "failed"].includes(row.state)
    || !Number.isSafeInteger(row.attempts) || row.attempts < 0
    || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))
    || (row.lastError !== null && row.lastError !== undefined && row.lastError !== "delivery_failed")) {
    throw new Error("Supabase device command response was malformed.");
  }
  return { commandId: row.commandId, deviceId: row.deviceId, envelope: normalizeEnvelope(row.envelope), state: row.state, attempts: row.attempts, createdAt: Date.parse(row.createdAt), ...(row.lastError ? { lastError: row.lastError } : {}) };
}

/** Trusted service-role adapter for durable command transport. Transport mutations require the authenticated credential digest so their RPC can recheck it atomically with each queue operation. */
export class SupabaseDeviceCommandQueueStore {
  constructor(client, { trustedServer = false } = {}) {
    if (!client || typeof client.rpc !== "function") throw new TypeError("A configured Supabase client is required for device command storage.");
    if (trustedServer !== true) throw new TypeError("SupabaseDeviceCommandQueueStore is restricted to trusted server-side clients.");
    this.client = client;
    Object.defineProperty(this, "testOnly", { value: false, enumerable: true });
  }

  async enqueue(accountId, deviceId, idempotencyKey, envelope, authority) {
    const mandate = mandateScope(authority);
    const params = {
      p_account_id: requiredUuid(accountId, "accountId"),
      p_device_id: requiredUuid(deviceId, "deviceId"),
      p_idempotency_key: boundedText(idempotencyKey, "Command idempotency key"),
      p_envelope: normalizeEnvelope(envelope),
      p_mandate_ids: mandate.mandateIds,
      p_mandate_expires_at: mandate.expiresAt,
      p_mandate_revocation_epoch: mandate.revocationEpoch,
    };
    if (params.p_idempotency_key.length > 256) throw new RangeError("Command idempotency key exceeds 256 characters.");
    const data = rpcData(await this.client.rpc("enqueue_hey_device_command_authorized", params), "enqueue");
    if (!data || typeof data !== "object" || typeof data.created !== "boolean") throw new Error("Supabase device command response was malformed.");
    return { created: data.created, command: commandFromRow(data.command) };
  }

  async claimNext(accountId, deviceId, leaseMs = 30_000, credentialHash) {
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > MAX_LEASE_MS) throw new RangeError("Device command lease must be between 1 ms and 5 minutes.");
    const data = rpcData(await this.client.rpc("claim_hey_device_command", { p_account_id: requiredUuid(accountId, "accountId"), p_device_id: requiredUuid(deviceId, "deviceId"), p_lease_ms: leaseMs, p_credential_hash: requiredCredentialHash(credentialHash) }), "claim");
    if (data === null) return null;
    if (!data || typeof data !== "object" || !UUID.test(data.leaseToken)) throw new Error("Supabase device command lease response was malformed.");
    return { command: commandFromRow(data.command), leaseToken: data.leaseToken };
  }

  async renewLease(accountId, deviceId, commandId, leaseToken, idempotencyKey, leaseMs = 30_000, credentialHash) {
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > MAX_LEASE_MS) throw new RangeError("Device command lease must be between 1 ms and 5 minutes.");
    const data = rpcData(await this.client.rpc("renew_hey_device_command_lease", {
      p_account_id: requiredUuid(accountId, "accountId"),
      p_device_id: requiredUuid(deviceId, "deviceId"),
      p_command_id: requiredUuid(commandId, "commandId"),
      p_lease_token: requiredUuid(leaseToken, "leaseToken"),
      p_idempotency_key: boundedText(idempotencyKey, "Lease renewal idempotency key", 128),
      p_lease_ms: leaseMs,
      p_credential_hash: requiredCredentialHash(credentialHash),
    }), "lease renewal");
    if (!data || typeof data !== "object" || typeof data.renewed !== "boolean") throw new Error("Supabase device command renewal response was malformed.");
    if (!data.renewed) return { renewed: false, leaseUntil: null, idempotent: false };
    if (typeof data.leaseUntil !== "string" || !Number.isFinite(Date.parse(data.leaseUntil)) || typeof data.idempotent !== "boolean") {
      throw new Error("Supabase device command renewal response was malformed.");
    }
    return { renewed: true, leaseUntil: Date.parse(data.leaseUntil), idempotent: data.idempotent };
  }

  async acknowledge(accountId, deviceId, commandId, leaseToken, credentialHash) {
    for (const value of [accountId, deviceId, commandId, leaseToken]) {
      if (typeof value !== "string" || !UUID.test(value)) return false;
    }
    const data = rpcData(await this.client.rpc("ack_hey_device_command", { p_account_id: accountId, p_device_id: deviceId, p_command_id: commandId, p_lease_token: leaseToken, p_credential_hash: requiredCredentialHash(credentialHash) }), "acknowledgement");
    if (typeof data !== "boolean") throw new Error("Supabase device command response was malformed.");
    return data;
  }

  async recordFailure(accountId, deviceId, commandId, leaseToken, credentialHash) {
    for (const value of [accountId, deviceId, commandId, leaseToken]) {
      if (typeof value !== "string" || !UUID.test(value)) return false;
    }
    const data = rpcData(await this.client.rpc("fail_hey_device_command", { p_account_id: accountId, p_device_id: deviceId, p_command_id: commandId, p_lease_token: leaseToken, p_credential_hash: requiredCredentialHash(credentialHash) }), "failure recording");
    if (typeof data !== "boolean") throw new Error("Supabase device command response was malformed.");
    return data;
  }
}

export default SupabaseDeviceCommandQueueStore;
