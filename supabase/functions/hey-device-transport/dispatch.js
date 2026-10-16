const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^heydev1\.[A-Za-z0-9_-]{43}$/;
const HASH = /^[0-9a-f]{64}$/;
const MAX_LEASE_MS = 300_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const TAURI_DEVICE_ORIGINS = new Set(["http://tauri.localhost", "tauri://localhost"]);

function result(ok, body = {}) { return { ok, ...body }; }
function validUuid(value) { return typeof value === "string" && UUID.test(value); }

export function resolveDeviceTransportCorsOrigin(origin, configuredOrigin) {
  if (typeof configuredOrigin !== "string" || !configuredOrigin) throw new TypeError("A configured device transport origin is required.");
  if (origin === null || origin === undefined) return configuredOrigin;
  return origin === configuredOrigin || TAURI_DEVICE_ORIGINS.has(origin) ? origin : null;
}

export function createDeviceTransportRequestScope({ signal: callerSignal, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) {
    throw new RangeError("Device transport request timeout must be between 100 ms and 60 seconds.");
  }
  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = false;
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  void aborted.catch(() => {});
  const abort = (code, name, message) => {
    if (controller.signal.aborted) return;
    if (code === "DEVICE_TRANSPORT_TIMEOUT") timedOut = true;
    else callerAborted = true;
    const error = new Error(message);
    error.name = name;
    error.code = code;
    controller.abort(error);
    rejectAbort(error);
  };
  const onCallerAbort = () => abort("DEVICE_TRANSPORT_ABORTED", "AbortError", "Device transport request was cancelled.");
  const timeout = setTimeout(() => abort("DEVICE_TRANSPORT_TIMEOUT", "TimeoutError", "Device transport request timed out."), timeoutMs);
  if (callerSignal?.aborted) onCallerAbort();
  else callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    callerAborted: () => callerAborted,
    race: (promise) => Promise.race([Promise.resolve(promise), aborted]),
    dispose() {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    },
  };
}

export function normalizeAccountDeviceRequest(body) {
  try {
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const keys = Reflect.ownKeys(body);
    const descriptors = Object.getOwnPropertyDescriptors(body);
    if (keys.length !== 2 || keys.some((key) => !["operation", "deviceId"].includes(key)
      || !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], "value"))) return null;
    const operation = descriptors.operation?.value;
    const deviceId = descriptors.deviceId?.value;
    if (!["rotate", "revoke"].includes(operation) || !validUuid(deviceId)) return null;
    return { operation, deviceId };
  } catch { return null; }
}

export function normalizeTransportRequest(body) {
  try {
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const keys = Reflect.ownKeys(body);
    const descriptors = Object.getOwnPropertyDescriptors(body);
    if (keys.some((key) => typeof key !== "string" || !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], "value"))) return null;
    const source = Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
    if (!validUuid(source.deviceId)) return null;
    if (source.operation === "claim") {
      const leaseMs = source.leaseMs === undefined ? 30_000 : source.leaseMs;
      if (!Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > MAX_LEASE_MS || keys.some((key) => !["deviceId", "operation", "leaseMs"].includes(key))) return null;
      return { deviceId: source.deviceId, operation: "claim", leaseMs };
    }
    if (source.operation === "renew") {
      const leaseMs = source.leaseMs === undefined ? 30_000 : source.leaseMs;
      if (!validUuid(source.commandId) || !validUuid(source.leaseToken)
        || typeof source.idempotencyKey !== "string" || !source.idempotencyKey.trim() || source.idempotencyKey.length > 128
        || [...source.idempotencyKey].some((char) => char.codePointAt(0) < 32 || char.codePointAt(0) === 127)
        || !Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > MAX_LEASE_MS
        || keys.some((key) => !["deviceId", "operation", "commandId", "leaseToken", "idempotencyKey", "leaseMs"].includes(key))) return null;
      return { deviceId: source.deviceId, operation: "renew", commandId: source.commandId, leaseToken: source.leaseToken, idempotencyKey: source.idempotencyKey.trim(), leaseMs };
    }
    if (source.operation === "ack" || source.operation === "fail") {
      if (!validUuid(source.commandId) || !validUuid(source.leaseToken)
        || keys.some((key) => !["deviceId", "operation", "commandId", "leaseToken"].includes(key))) return null;
      return { deviceId: source.deviceId, operation: source.operation, commandId: source.commandId, leaseToken: source.leaseToken };
    }
    return null;
  } catch { return null; }
}

export function validDeviceCredential(value) { return typeof value === "string" && TOKEN.test(value); }

export async function digestDeviceCredential(token) {
  if (!validDeviceCredential(token) || !globalThis.crypto?.subtle) return null;
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function issueDeviceCredential({ authenticatedAccountId, deviceId, loadDevice, credentialStore, cryptoProvider = globalThis.crypto } = {}) {
  if (!validUuid(authenticatedAccountId) || !validUuid(deviceId) || typeof loadDevice !== "function" || typeof credentialStore?.rotate !== "function") {
    return result(false, { reason: "Device credential service is unavailable." });
  }
  try {
    const device = await loadDevice(authenticatedAccountId, deviceId);
    if (device?.id !== deviceId || device.user_id !== authenticatedAccountId || device.status === "revoked") {
      return result(false, { reason: "The requested device is unavailable for this account." });
    }
    const bytes = new Uint8Array(32);
    cryptoProvider.getRandomValues(bytes);
    const base64 = typeof Buffer !== "undefined"
      ? Buffer.from(bytes).toString("base64url")
      : btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const token = `heydev1.${base64}`;
    const digest = await digestDeviceCredential(token);
    if (!digest || !HASH.test(digest) || await credentialStore.rotate(authenticatedAccountId, deviceId, digest) !== true) {
      return result(false, { reason: "Device credential rotation failed." });
    }
    return result(true, { credential: token });
  } catch {
    return result(false, { reason: "Device credential service is unavailable." });
  }
}

export async function revokeOwnedDeviceTransport({ authenticatedAccountId, deviceId, revokeDevice } = {}) {
  if (!validUuid(authenticatedAccountId) || !validUuid(deviceId) || typeof revokeDevice !== "function") {
    return result(false, { status: 400, reason: "Device revocation request is invalid." });
  }
  try {
    if (await revokeDevice(authenticatedAccountId, deviceId) !== true) {
      return result(false, { status: 404, reason: "The requested device is unavailable for this account." });
    }
    return result(true, { status: 200, revoked: true });
  } catch {
    return result(false, { status: 503, reason: "Device revocation is unavailable." });
  }
}

export async function handleDeviceTransport({ authorization, body, credentialStore, queue } = {}) {
  const request = normalizeTransportRequest(body);
  const token = typeof authorization === "string" && authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!request || !validDeviceCredential(token)) return result(false, { status: 400, reason: "Device transport request is invalid." });
  if (typeof credentialStore?.authenticate !== "function" || !queue) return result(false, { status: 503, reason: "Device transport is unavailable." });
  try {
    const digest = await digestDeviceCredential(token);
    if (!digest) return result(false, { status: 503, reason: "Device transport is unavailable." });
    const identity = await credentialStore.authenticate(digest);
    if (!identity || identity.deviceId !== request.deviceId || !validUuid(identity.accountId) || identity.active !== true) {
      return result(false, { status: 401, reason: "Device credential is invalid or revoked." });
    }
    if (request.operation === "claim") {
      const claim = await queue.claimNext(identity.accountId, identity.deviceId, request.leaseMs);
      return result(true, { status: 200, claim });
    }
    if (request.operation === "renew") {
      if (typeof queue.renewLease !== "function") return result(false, { status: 503, reason: "Device transport is unavailable." });
      const renewal = await queue.renewLease(identity.accountId, identity.deviceId, request.commandId, request.leaseToken, request.idempotencyKey, request.leaseMs);
      return result(renewal.renewed, { status: renewal.renewed ? 200 : 409, renewal });
    }
    const accepted = request.operation === "ack"
      ? await queue.acknowledge(identity.accountId, identity.deviceId, request.commandId, request.leaseToken)
      : await queue.recordFailure(identity.accountId, identity.deviceId, request.commandId, request.leaseToken);
    return result(accepted === true, { status: accepted === true ? 200 : 409, accepted: accepted === true });
  } catch {
    return result(false, { status: 503, reason: "Device transport is unavailable." });
  }
}
