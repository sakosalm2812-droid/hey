const encoder = new TextEncoder();
const SESSION_FORMAT = "hey.session.v1";

function required(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} is required.`);
  return value.trim();
}

async function digest(value) {
  if (!globalThis.crypto?.subtle) throw new Error("WebCrypto is required for credential fingerprints.");
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Provider-neutral session lifecycle coordinator. The persistence adapter MUST
 * implement atomic refresh rotation and revocation in its durable transaction.
 * This class stores only token fingerprints and never persists bearer tokens.
 */
export class SessionAuthority {
  constructor({ store, now = () => Date.now(), accessTtlMs = 5 * 60_000, refreshTtlMs = 30 * 24 * 60 * 60_000 } = {}) {
    if (!store || !["create", "get", "rotateRefresh", "revoke", "revokeAccount"].every((name) => typeof store[name] === "function")) {
      throw new TypeError("A transactional session store implementing create/get/rotateRefresh/revoke/revokeAccount is required.");
    }
    if (!Number.isSafeInteger(accessTtlMs) || accessTtlMs < 30_000 || !Number.isSafeInteger(refreshTtlMs) || refreshTtlMs <= accessTtlMs) throw new RangeError("Session TTLs are invalid.");
    this.store = store;
    this.now = now;
    this.accessTtlMs = accessTtlMs;
    this.refreshTtlMs = refreshTtlMs;
  }

  async create(input) {
    const accountId = required(input?.accountId, "accountId");
    const userId = required(input?.userId, "userId");
    const deviceId = required(input?.deviceId, "deviceId");
    const workspaceId = input?.workspaceId == null ? null : required(input.workspaceId, "workspaceId");
    const id = globalThis.crypto?.randomUUID?.();
    const refreshToken = globalThis.crypto?.randomUUID?.();
    if (!id || !refreshToken) throw new Error("Cryptographic randomness is required to create sessions.");
    const issuedAt = this.now();
    const record = {
      format: SESSION_FORMAT, id, userId, accountId, workspaceId, deviceId,
      status: "active", issuedAt, lastActivityAt: issuedAt,
      accessExpiresAt: issuedAt + this.accessTtlMs,
      absoluteExpiresAt: issuedAt + this.refreshTtlMs,
      refreshFingerprint: await digest(refreshToken), refreshVersion: 1,
      authMethod: required(input.authMethod, "authMethod"),
      authStrength: input.authStrength || "standard", sessionVersion: 1,
      risk: "low", scopes: Array.isArray(input.scopes) ? [...new Set(input.scopes)] : [],
    };
    await this.store.create(record);
    return { session: { ...record, refreshFingerprint: undefined }, refreshToken };
  }

  async refresh({ sessionId, refreshToken }) {
    required(sessionId, "sessionId");
    required(refreshToken, "refreshToken");
    const fingerprint = await digest(refreshToken);
    const now = this.now();
    const nextToken = globalThis.crypto?.randomUUID?.();
    if (!nextToken) throw new Error("Cryptographic randomness is required to rotate sessions.");
    // The adapter performs compare-and-swap, token reuse detection, and session
    // revocation atomically across workers. A non-atomic adapter is rejected.
    const result = await this.store.rotateRefresh({ sessionId, fingerprint, nextFingerprint: await digest(nextToken), now, accessExpiresAt: now + this.accessTtlMs });
    if (result?.status !== "rotated") return { status: result?.status || "denied", session: null, refreshToken: null };
    return { status: "rotated", session: result.session, refreshToken: nextToken };
  }

  async revoke(sessionId, reason = "user_request") {
    return this.store.revoke(required(sessionId, "sessionId"), { reason, at: this.now() });
  }

  async revokeAccount(accountId, reason = "account_security_event") {
    return this.store.revokeAccount(required(accountId, "accountId"), { reason, at: this.now() });
  }

  async validate(sessionId, { accountId, userId, deviceId, workspaceId = null } = {}) {
    const session = await this.store.get(required(sessionId, "sessionId"));
    const now = this.now();
    if (!session || session.format !== SESSION_FORMAT || session.status !== "active") return { valid: false, reason: "session_inactive" };
    if (now >= session.accessExpiresAt || now >= session.absoluteExpiresAt) return { valid: false, reason: "session_expired" };
    if (session.accountId !== accountId || session.userId !== userId || session.deviceId !== deviceId || session.workspaceId !== workspaceId) return { valid: false, reason: "context_mismatch" };
    return { valid: true, session };
  }
}

/** A production adapter must make rotateRefresh a serializable/CAS transaction. */
export class SessionStoreContract {
  async create() { throw new Error("Implement durable session creation with unique session IDs."); }
  async get() { throw new Error("Implement strongly consistent session lookup."); }
  async rotateRefresh() { throw new Error("Implement atomic refresh rotation and reuse-triggered family revocation."); }
  async revoke() { throw new Error("Implement durable single-session revocation."); }
  async revokeAccount() { throw new Error("Implement durable account-wide credential invalidation."); }
}

/** Compute a TOTP candidate per RFC 6238; callers must persist secret material encrypted. */
export async function generateTotp(secret, counter, { digits = 6 } = {}) {
  if (!(secret instanceof Uint8Array) || secret.length < 20) throw new TypeError("TOTP secret must be at least 160 bits of Uint8Array key material.");
  if (!Number.isSafeInteger(counter) || counter < 0 || !Number.isInteger(digits) || digits < 6 || digits > 8) throw new RangeError("TOTP counter or digit count is invalid.");
  const key = await globalThis.crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const message = new Uint8Array(8);
  new DataView(message.buffer).setBigUint64(0, BigInt(counter));
  const mac = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, message));
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % (10 ** digits)).padStart(digits, "0");
}

/** The store must atomically enforce attempt limits and one-time counter consumption. */
export class MfaReplayStoreContract {
  async checkRateLimit() { throw new Error("Implement account/device scoped MFA rate limiting in durable storage."); }
  async consumeTotpCounter() { throw new Error("Implement atomic monotonic TOTP counter consumption."); }
  async consumeRecoveryCode() { throw new Error("Implement one-time recovery-code fingerprint consumption."); }
}

export async function verifyTotp({ code, secret, accountId, now = Date.now(), stepSeconds = 30, window = 1, digits = 6, store }) {
  if (typeof accountId !== "string" || !accountId.trim() || !store || typeof store.checkRateLimit !== "function" || typeof store.consumeTotpCounter !== "function") return { verified: false, reason: "mfa_store_unavailable" };
  if (!Number.isInteger(digits) || digits < 6 || digits > 8 || typeof code !== "string" || !new RegExp(`^\\d{${digits}}$`).test(code) || !Number.isFinite(now) || !Number.isSafeInteger(stepSeconds) || stepSeconds < 15 || !Number.isInteger(window) || window < 0 || window > 2) return { verified: false, reason: "invalid_challenge" };
  try { if (!await store.checkRateLimit(accountId, now)) return { verified: false, reason: "rate_limited" }; }
  catch { return { verified: false, reason: "mfa_store_unavailable" }; }
  const currentCounter = Math.floor(now / 1000 / stepSeconds);
  let matchedCounter = null;
  try {
    for (let offset = -window; offset <= window; offset += 1) {
      const candidateCounter = currentCounter + offset;
      if (candidateCounter < 0) continue;
      const candidate = await generateTotp(secret, candidateCounter, { digits });
      let diff = 0;
      for (let index = 0; index < digits; index += 1) diff |= candidate.charCodeAt(index) ^ code.charCodeAt(index);
      if (diff === 0) matchedCounter = matchedCounter === null ? candidateCounter : Math.max(matchedCounter, candidateCounter);
    }
  } catch { return { verified: false, reason: "mfa_unavailable" }; }
  if (matchedCounter === null) return { verified: false, reason: "invalid_code" };
  try { if (!await store.consumeTotpCounter(accountId, matchedCounter, now)) return { verified: false, reason: "replayed_code" }; }
  catch { return { verified: false, reason: "mfa_store_unavailable" }; }
  return { verified: true, method: "totp", counter: matchedCounter };
}

export async function hashRecoveryCode(code) {
  if (typeof code !== "string" || code.length < 12 || code.length > 128) throw new TypeError("Recovery code length is invalid.");
  return digest(code.normalize("NFKC").replace(/[\s-]/g, "").toUpperCase());
}

export async function generateRecoveryCodes({ count = 10 } = {}) {
  if (!globalThis.crypto?.getRandomValues || !Number.isInteger(count) || count < 1 || count > 20) throw new RangeError("Recovery-code count must be between 1 and 20 and secure randomness must be available.");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const codes = [];
  for (let codeIndex = 0; codeIndex < count; codeIndex += 1) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    let bits = 0;
    let value = 0;
    let encoded = "";
    for (const byte of bytes) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) { encoded += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits) encoded += alphabet[(value << (5 - bits)) & 31];
    codes.push(encoded.match(/.{1,5}/g).join("-"));
  }
  const fingerprints = await Promise.all(codes.map(hashRecoveryCode));
  return { codes, fingerprints };
}

export async function consumeRecoveryCode({ accountId, code, store, now = Date.now() }) {
  if (typeof accountId !== "string" || !accountId.trim() || !store || typeof store.consumeRecoveryCode !== "function") return { verified: false, reason: "recovery_store_unavailable" };
  const fingerprint = await hashRecoveryCode(code);
  const consumed = await store.consumeRecoveryCode(accountId, fingerprint, now);
  return consumed === true ? { verified: true, method: "recovery_code" } : { verified: false, reason: "invalid_or_used_recovery_code" };
}

function encodeUrlSafe(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export class DeviceEnrollmentStoreContract {
  async createChallenge() { throw new Error("Persist a short-lived account-bound challenge with unique ID."); }
  async consumeChallenge() { throw new Error("Atomically consume an unused, unexpired challenge bound to the authenticated account."); }
  async saveDevice() { throw new Error("Persist a new device as registered and provisional, never trusted by default."); }
  async revokeDevice() { throw new Error("Durably revoke device credentials and invalidate its sessions."); }
}

export async function createDeviceEnrollmentChallenge({ accountId, store, now = Date.now(), ttlMs = 120_000 }) {
  if (typeof accountId !== "string" || !accountId.trim() || !store || typeof store.createChallenge !== "function") throw new TypeError("Authenticated account and device enrollment store are required.");
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 15_000 || ttlMs > 5 * 60_000 || !globalThis.crypto?.getRandomValues) throw new RangeError("Device enrollment challenge lifetime or secure randomness is invalid.");
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const challenge = encodeUrlSafe(bytes);
  const id = globalThis.crypto.randomUUID();
  await store.createChallenge({ id, accountId: accountId.trim(), fingerprint: await digest(challenge), issuedAt: now, expiresAt: now + ttlMs, usedAt: null });
  return { id, challenge, expiresAt: now + ttlMs, algorithm: "Ed25519" };
}

export async function completeDeviceEnrollment({ challengeId, challenge, signature, publicKey, accountId, label = "", store, now = Date.now() }) {
  if (!store || typeof store.consumeChallenge !== "function" || typeof store.saveDevice !== "function") return { enrolled: false, reason: "device_store_unavailable" };
  if (typeof accountId !== "string" || !accountId.trim() || typeof challengeId !== "string" || typeof challenge !== "string" || typeof signature !== "string" || typeof publicKey !== "string") return { enrolled: false, reason: "invalid_enrollment_proof" };
  let signatureBytes;
  let keyBytes;
  try {
    const decode = (value) => Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (character) => character.charCodeAt(0));
    signatureBytes = decode(signature);
    keyBytes = decode(publicKey);
  } catch { return { enrolled: false, reason: "malformed_key_or_signature" }; }
  if (signatureBytes.length !== 64 || keyBytes.length !== 32) return { enrolled: false, reason: "malformed_key_or_signature" };
  let consumed;
  try { consumed = await store.consumeChallenge(challengeId, accountId.trim(), await digest(challenge), now); } catch { return { enrolled: false, reason: "challenge_store_unavailable" }; }
  if (consumed !== true) return { enrolled: false, reason: "challenge_expired_used_or_wrong_account" };
  try {
    const key = await globalThis.crypto.subtle.importKey("raw", keyBytes, { name: "Ed25519" }, false, ["verify"]);
    if (!await globalThis.crypto.subtle.verify({ name: "Ed25519" }, key, signatureBytes, encoder.encode(challenge))) return { enrolled: false, reason: "device_proof_invalid" };
  } catch { return { enrolled: false, reason: "device_proof_invalid" }; }
  const device = {
    id: globalThis.crypto.randomUUID(), accountId: accountId.trim(), publicKey,
    label: String(label).trim().slice(0, 80), status: "registered", trustState: "provisional",
    createdAt: new Date(now).toISOString(), lastAuthenticatedAt: null, version: 1,
  };
  await store.saveDevice(device);
  return { enrolled: true, device };
}

export const SESSION_FORMAT_VERSION = SESSION_FORMAT;
