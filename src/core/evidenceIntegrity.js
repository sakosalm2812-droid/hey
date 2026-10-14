const FORMAT = "hey.evidence-envelope.v1";
export const EVIDENCE_STORE_CONTRACT_VERSION = "hey.evidence-store.v1";
const encoder = new TextEncoder();

function canonical(value, ancestors = new WeakSet()) {
  if (value === null) return "null";
  if (["string", "boolean"].includes(typeof value)) return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Evidence must contain finite numbers.");
    return JSON.stringify(value);
  }
  if (!value || typeof value !== "object") throw new TypeError("Evidence must be JSON serializable.");
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("Evidence cannot contain class instances.");
  if (ancestors.has(value)) throw new TypeError("Evidence cannot contain cyclic references.");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) throw new TypeError("Evidence arrays cannot contain holes or custom properties.");
      return `[${value.map((entry) => canonical(entry, ancestors)).join(",")}]`;
    }
    const keys = Object.keys(value).sort();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of keys) {
      if (!Object.hasOwn(descriptors[key], "value")) throw new TypeError("Evidence cannot contain accessor properties.");
    }
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(descriptors[key].value, ancestors)}`).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function toBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let text = "";
  bytes.forEach((byte) => { text += String.fromCharCode(byte); });
  return btoa(text);
}

function fromBase64(value) {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
  try {
    if (typeof atob === "function") return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    return new Uint8Array(Buffer.from(value, "base64"));
  } catch { return null; }
}

async function sha256(value) {
  if (!globalThis.crypto?.subtle) throw new Error("WebCrypto SHA-256 is required.");
  return toBase64(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(canonical(value)))));
}

export class EvidenceStoreContract {
  constructor() { this.contractVersion = EVIDENCE_STORE_CONTRACT_VERSION; }
  async isInvalidated() { throw new Error("Implement account-scoped isInvalidated(evidenceId, { accountId }) against durable evidence storage."); }
  async invalidate() { throw new Error("Implement account-scoped invalidate(evidenceId, reason, { accountId }) against durable evidence storage."); }
}

export class InMemoryEvidenceStore {
  constructor() {
    this.contractVersion = EVIDENCE_STORE_CONTRACT_VERSION;
    Object.defineProperty(this, "testOnly", { value: true, enumerable: true });
    this.invalidations = new Map();
  }
  async isInvalidated(evidenceId, { accountId } = {}) {
    if (typeof accountId !== "string" || !accountId.trim()) throw new TypeError("An accountId is required for evidence invalidation lookup.");
    return this.invalidations.has(`${accountId}\u0000${evidenceId}`);
  }
  async invalidate(evidenceId, reason, { accountId } = {}) {
    if (!evidenceId || !reason || typeof accountId !== "string" || !accountId.trim()) throw new TypeError("Evidence ID, account, and invalidation reason are required.");
    const key = `${accountId}\u0000${evidenceId}`;
    const safeReason = typeof reason === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(reason) ? reason : "integrity_failure";
    if (!this.invalidations.has(key)) this.invalidations.set(key, { evidenceId, accountId, reason: safeReason, invalidatedAt: new Date().toISOString() });
    return { ...this.invalidations.get(key) };
  }
}

function signedContent(payload) {
  return canonical({ format: payload.format, id: payload.id, accountId: payload.accountId, source: payload.source, capturedAt: payload.capturedAt, expiresAt: payload.expiresAt, revocationEpoch: payload.revocationEpoch, offlineAllowed: payload.offlineAllowed, bodyDigest: payload.bodyDigest });
}

export async function createEvidenceEnvelope(input, { privateKey, keyId, now = Date.now() } = {}) {
  if (!globalThis.crypto?.subtle || !privateKey || typeof keyId !== "string" || !keyId.trim()) throw new TypeError("A WebCrypto signing key and keyId are required.");
  if (!input || typeof input !== "object" || typeof input.accountId !== "string" || !input.accountId.trim()) throw new TypeError("Evidence must be bound to an accountId.");
  if (!input.source || typeof input.source !== "object" || Array.isArray(input.source)) throw new TypeError("Evidence source metadata is required.");
  const capturedAtMs = input.capturedAt ? Date.parse(input.capturedAt) : now;
  const expiresAtMs = input.expiresAt ? Date.parse(input.expiresAt) : now + 24 * 60 * 60 * 1000;
  if (!Number.isFinite(capturedAtMs) || capturedAtMs > now + 60_000) throw new RangeError("capturedAt must be valid and cannot be in the future.");
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now || expiresAtMs - capturedAtMs > 365 * 24 * 60 * 60 * 1000) throw new RangeError("expiresAt must be future-dated and at most one year after capture.");
  if (input.revocationEpoch !== undefined && (!Number.isSafeInteger(input.revocationEpoch) || input.revocationEpoch < 0)) throw new RangeError("revocationEpoch must be a non-negative integer.");
  const payload = {
    format: FORMAT,
    id: globalThis.crypto.randomUUID(),
    accountId: input.accountId.trim(),
    source: input.source,
    capturedAt: new Date(capturedAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    revocationEpoch: input.revocationEpoch || 0,
    offlineAllowed: input.offlineAllowed === true,
    bodyDigest: await sha256(input.body),
  };
  const signature = await globalThis.crypto.subtle.sign({ name: "Ed25519" }, privateKey, encoder.encode(signedContent(payload)));
  return Object.freeze({ payload: Object.freeze(payload), signature: Object.freeze({ algorithm: "Ed25519", keyId: keyId.trim(), value: toBase64(new Uint8Array(signature)) }), body: input.body });
}

export async function verifyEvidenceEnvelope(envelope, body, context, { trustedKeys = {}, store, now = Date.now(), online = true, maxAgeMs = Infinity, allowTestOnlyStore = false } = {}) {
  const deny = (reason, status = "invalid") => ({ valid: false, status, reason });
  let isInvalidated;
  try {
    if (!store || store.contractVersion !== EVIDENCE_STORE_CONTRACT_VERSION || typeof store.isInvalidated !== "function") return deny("A durable v1 evidence invalidation store is required.", "unavailable");
    if (store.testOnly === true && allowTestOnlyStore !== true) return deny("The in-memory evidence store is test-only; durable invalidation storage is required.", "unavailable");
    isInvalidated = store.isInvalidated;
  } catch {
    return deny("Evidence store contract inspection failed.", "unavailable");
  }
  if (!Number.isFinite(now) || !(maxAgeMs === Infinity || Number.isFinite(maxAgeMs) && maxAgeMs >= 0)) return deny("Evidence verification time and freshness limit are invalid.");
  const payload = envelope?.payload;
  const signature = envelope?.signature;
  if (!payload || payload.format !== FORMAT || signature?.algorithm !== "Ed25519" || typeof signature.keyId !== "string") return deny("Evidence envelope format or signature metadata is invalid.");
  if (!context || context.accountId !== payload.accountId) return deny("Evidence account does not match the authenticated context.", "denied");
  const key = trustedKeys instanceof Map ? trustedKeys.get(signature.keyId) : trustedKeys[signature.keyId];
  const signatureBytes = fromBase64(signature.value);
  if (!key || !signatureBytes || signatureBytes.length !== 64) return deny("Evidence signing key is untrusted or signature malformed.", "untrusted");
  try {
    const isCryptoKey = typeof CryptoKey !== "undefined" && key instanceof CryptoKey;
    const publicKey = isCryptoKey ? key : await globalThis.crypto.subtle.importKey("raw", fromBase64(key), { name: "Ed25519" }, false, ["verify"]);
    if (!await globalThis.crypto.subtle.verify({ name: "Ed25519" }, publicKey, signatureBytes, encoder.encode(signedContent(payload)))) return deny("Evidence signature verification failed.");
  } catch { return deny("Evidence signature verification failed."); }
  try {
    if (await sha256(body) !== payload.bodyDigest) return deny("Evidence body does not match its signed digest.");
  } catch { return deny("Evidence body is malformed or could not be verified."); }
  const capturedAt = Date.parse(payload.capturedAt);
  const expiresAt = Date.parse(payload.expiresAt);
  if (!Number.isFinite(capturedAt) || capturedAt > now + 60_000 || !Number.isFinite(expiresAt) || now >= expiresAt) return deny("Evidence is expired or has an invalid time window.", "stale");
  if (now - capturedAt > maxAgeMs) return deny("Evidence is older than the caller's freshness limit.", "stale");
  if (!Number.isSafeInteger(context.currentRevocationEpoch) || context.currentRevocationEpoch !== payload.revocationEpoch) return deny("Evidence revocation epoch is stale or unavailable.", "stale");
  if (!online && payload.offlineAllowed !== true) return deny("Evidence is not approved for offline use.", "offline_denied");
  try {
    if (await Reflect.apply(isInvalidated, store, [payload.id, { accountId: payload.accountId }])) return deny("Evidence has been invalidated.", "invalidated");
  } catch { return deny("Evidence invalidation check failed; evidence was rejected.", "unavailable"); }
  return { valid: true, status: "verified", evidenceId: payload.id, signerKeyId: signature.keyId, capturedAt: payload.capturedAt, expiresAt: payload.expiresAt };
}

export async function invalidateEvidence(evidenceId, reason, store, { accountId, allowTestOnlyStore = false } = {}) {
  if (!store || store.contractVersion !== EVIDENCE_STORE_CONTRACT_VERSION || typeof store.invalidate !== "function") throw new TypeError("A durable v1 evidence invalidation store is required.");
  if (store.testOnly === true && allowTestOnlyStore !== true) throw new TypeError("The in-memory evidence store is test-only; durable invalidation storage is required.");
  return Reflect.apply(store.invalidate, store, [evidenceId, reason, { accountId }]);
}

export { FORMAT as EVIDENCE_ENVELOPE_FORMAT };
