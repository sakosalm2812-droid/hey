import test from "node:test";
import assert from "node:assert/strict";
import { SessionAuthority, generateTotp, verifyTotp, hashRecoveryCode, generateRecoveryCodes, consumeRecoveryCode, createDeviceEnrollmentChallenge, completeDeviceEnrollment } from "../src/core/sessionAuthority.js";
import { PermissionScopeRegistry, diffPermissions, evaluateApprovalPolicy, simulateAuthorization } from "../src/core/trustKernelPolicy.js";
import { authorizeWithTrustKernel } from "../src/core/trustKernelPolicy.js";
import { issueActionMandate, InMemoryMandateStore } from "../src/core/actionMandate.js";

class AtomicSessionFixture {
  constructor() { this.records = new Map(); this.lock = Promise.resolve(); }
  async transaction(fn) {
    let release;
    const prior = this.lock;
    this.lock = new Promise((resolve) => { release = resolve; });
    await prior;
    try { return await fn(); } finally { release(); }
  }
  async create(session) { return this.transaction(() => { if (this.records.has(session.id)) throw new Error("duplicate session"); this.records.set(session.id, structuredClone(session)); }); }
  async get(id) { return structuredClone(this.records.get(id) || null); }
  async rotateRefresh({ sessionId, fingerprint, nextFingerprint, now, accessExpiresAt }) {
    return this.transaction(() => {
      const record = this.records.get(sessionId);
      if (!record || record.status !== "active") return { status: "inactive" };
      if (now >= record.absoluteExpiresAt) { record.status = "expired"; return { status: "expired" }; }
      if (record.refreshFingerprint !== fingerprint) { record.status = "revoked"; record.revocationReason = "refresh_reuse"; return { status: "reuse_detected" }; }
      record.refreshFingerprint = nextFingerprint;
      record.refreshVersion += 1;
      record.accessExpiresAt = accessExpiresAt;
      record.lastActivityAt = now;
      return { status: "rotated", session: structuredClone(record) };
    });
  }
  async revoke(id, meta) { return this.transaction(() => { const record = this.records.get(id); if (!record) return false; record.status = "revoked"; record.revokedAt = meta.at; return true; }); }
  async revokeAccount(accountId, meta) { return this.transaction(() => { let count = 0; for (const record of this.records.values()) if (record.accountId === accountId && record.status === "active") { record.status = "revoked"; record.revokedAt = meta.at; count += 1; } return count; }); }
}

test("session authority rotates refresh credentials once and revokes on concurrent reuse", async () => {
  const store = new AtomicSessionFixture();
  const authority = new SessionAuthority({ store, now: () => 1_000_000 });
  const created = await authority.create({ userId: "u1", accountId: "a1", workspaceId: "w1", deviceId: "d1", authMethod: "passkey", authStrength: "strong" });
  assert.equal((await authority.validate(created.session.id, { userId: "u1", accountId: "a1", workspaceId: "w1", deviceId: "d1" })).valid, true);
  assert.equal((await authority.validate(created.session.id, { userId: "u1", accountId: "a2", workspaceId: "w1", deviceId: "d1" })).reason, "context_mismatch");
  const results = await Promise.all([
    authority.refresh({ sessionId: created.session.id, refreshToken: created.refreshToken }),
    authority.refresh({ sessionId: created.session.id, refreshToken: created.refreshToken }),
  ]);
  assert.deepEqual(results.map((item) => item.status).sort(), ["reuse_detected", "rotated"]);
  assert.equal((await store.get(created.session.id)).status, "revoked");
  assert.equal("refreshToken" in (await store.get(created.session.id)), false);
});

test("session authority rejects non-transactional/missing persistence and expires stale contexts", async () => {
  assert.throws(() => new SessionAuthority({ store: {} }), /transactional session store/i);
  const store = new AtomicSessionFixture();
  let now = 100_000;
  const authority = new SessionAuthority({ store, now: () => now, accessTtlMs: 30_000, refreshTtlMs: 60_000 });
  const created = await authority.create({ userId: "u", accountId: "a", deviceId: "d", authMethod: "password" });
  now += 30_000;
  assert.equal((await authority.validate(created.session.id, { userId: "u", accountId: "a", deviceId: "d" })).reason, "session_expired");
});

test("scope hierarchy requires registered canonical descendants and blocks traversal", () => {
  const registry = new PermissionScopeRegistry();
  registry.register({ id: "files", resourceType: "file" });
  registry.register({ id: "files/docs", parent: "files", resourceType: "file" });
  registry.register({ id: "files/docs/private", parent: "files/docs", resourceType: "file" });
  assert.equal(registry.isSubset("files/docs/private", "files"), true);
  assert.equal(registry.intersect("files/docs", "files/docs/private"), "files/docs/private");
  assert.equal(registry.isSubset("files/docs2", "files/docs"), false);
  assert.throws(() => registry.get("files/../secrets"), /traversal/i);
  assert.throws(() => registry.register({ id: "files/secret", parent: "files/docs", resourceType: "file" }), /canonical path prefix/i);
});

test("policy modes fail closed for offline high risk, weak step-up, and unbounded execution", () => {
  const base = { actorId: "u", action: "mail.send", resource: "mail:account", risk: "low", confidence: "high", authStrength: "strong" };
  const policy = { mode: "bounded_full_execution", enabled: true, allowedActions: ["mail.send"], resources: ["mail:account"], maxUses: 3, expiresAt: Date.now() + 1000 };
  assert.equal(evaluateApprovalPolicy({ ...base, offline: true, risk: "high" }, policy).decision, "deny");
  assert.equal(evaluateApprovalPolicy({ ...base, risk: "high", authStrength: "standard" }, policy).decision, "require_step_up");
  assert.equal(evaluateApprovalPolicy(base, { ...policy, maxUses: Infinity }).decision, "deny");
  assert.equal(evaluateApprovalPolicy(base, { ...policy, maxUses: 1.5 }).decision, "deny", "bounded use counts must be whole safe integers");
  assert.equal(evaluateApprovalPolicy(base, policy).decision, "allow");
  assert.equal(evaluateApprovalPolicy(base, { ...policy, enabled: false }).decision, "deny");
  assert.equal(evaluateApprovalPolicy(base, { ...policy, mode: "smart_approval" }).decision, "require_approval", "model confidence is not authority");
  assert.equal(evaluateApprovalPolicy(base, { ...policy, mode: "smart_approval" }, { verifySmartApproval: () => true }).decision, "allow");
  assert.equal(evaluateApprovalPolicy(base, { ...policy, mode: "smart_approval" }, { verifySmartApproval: () => { throw new Error("unavailable"); } }).decision, "require_approval", "evaluator errors must not become authorization errors");
});

test("permission diff identifies additions, removals, and edits without mutating inputs", () => {
  const oldPermissions = [{ permission: "files.read", scope: "account", status: "granted" }, { permission: "mail.send", scope: "workspace", status: "granted" }];
  const newPermissions = [{ permission: "files.read", scope: "account", status: "revoked" }, { permission: "calendar.read", scope: "account", status: "granted" }];
  const diff = diffPermissions(oldPermissions, newPermissions);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.removed.length, 1);
  assert.equal(diff.changed.length, 1);
  assert.equal(oldPermissions[0].status, "granted");
});

test("authorization simulation is non-mutating and fails closed without read-only mandate verifier", async () => {
  const input = { actorId: "u", action: "mail.send", resource: "mail:account", risk: "low", confidence: "high", authStrength: "strong" };
  const policy = { mode: "bounded_full_execution", enabled: true, allowedActions: ["mail.send"], resources: ["mail:account"], maxUses: 3, expiresAt: Date.now() + 1000 };
  assert.equal((await simulateAuthorization({ input, policy, mandate: {} })).decision, "deny");
  const verified = await simulateAuthorization({ input, policy, mandate: {}, verifyMandate: async () => ({ valid: true }) });
  assert.deepEqual(verified, { decision: "allow", reason: "mandate_valid_for_simulated_context", simulated: true });
  assert.equal((await simulateAuthorization({ input, policy, mandate: {}, verifyMandate: async () => { throw new Error("bad token"); } })).decision, "deny");
});

test("execution authorization composes canonical permission, policy, signature, scope, and atomic mandate use", async () => {
  const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const mandate = await issueActionMandate({ accountId: "acct", actions: ["web.search"], resources: ["web:search"], expiresAt: new Date(Date.now() + 60_000).toISOString(), maxUses: 1 }, { privateKey: keyPair.privateKey, keyId: "root" });
  const store = new InMemoryMandateStore();
  const options = { authorization: { user: { id: "acct", plan: "pro", permissions: ["web.search"] }, permission: "web.search", capability: "web.search", riskLevel: "low", confirmed: true }, input: { actorId: "acct", action: "web.search", resource: "web:search", risk: "low" }, policy: { mode: "bounded_full_execution", enabled: true, allowedActions: ["web.search"], resources: ["web:search"], maxUses: 1, expiresAt: Date.now() + 60_000 }, mandate, mandateContext: { accountId: "acct", action: "web.search", resource: "web:search", currentRevocationEpoch: 0, idempotencyKey: "mission-1:step-1" }, mandateOptions: { store, trustedKeys: { root: keyPair.publicKey } } };
  assert.equal((await authorizeWithTrustKernel(options)).authorized, true);
  assert.equal((await authorizeWithTrustKernel(options)).authorized, false, "second use must be rejected as replay");
  assert.equal((await authorizeWithTrustKernel({ ...options, authorization: { user: null } })).authorized, false, "unauthenticated callers are rejected before mandate use");
});

test("TOTP follows RFC 6238 vectors and rejects replayed counters", async () => {
  const secret = new TextEncoder().encode("12345678901234567890");
  assert.equal(await generateTotp(secret, 1, { digits: 6 }), "287082");
  const consumed = new Set();
  const store = {
    async checkRateLimit() { return true; },
    async consumeTotpCounter(accountId, counter) { const key = `${accountId}:${counter}`; if (consumed.has(key)) return false; consumed.add(key); return true; },
    async consumeRecoveryCode(_accountId, fingerprint) { if (consumed.has(fingerprint)) return false; consumed.add(fingerprint); return true; },
  };
  assert.equal((await verifyTotp({ code: "287082", secret, accountId: "a", now: 59_000, window: 0, store })).verified, true);
  assert.equal((await verifyTotp({ code: "287082", secret, accountId: "a", now: 59_000, window: 0, store })).reason, "replayed_code");
  assert.equal((await verifyTotp({ code: "000000", secret, accountId: "a", now: 59_000, window: 0, store })).verified, false);
});

test("recovery codes are normalized, fingerprinted, and consumed once", async () => {
  const generated = await generateRecoveryCodes({ count: 4 });
  assert.equal(generated.codes.length, 4);
  assert.equal(new Set(generated.fingerprints).size, 4);
  assert.equal(generated.codes.every((code) => /^[A-Z2-7]{5}(?:-[A-Z2-7]{5}){4}-[A-Z2-7]$/.test(code)), true);
  assert.equal(generated.fingerprints.some((fingerprint) => generated.codes.includes(fingerprint)), false);
  const one = await hashRecoveryCode("ABCD-EFGH-IJKL-MNOP");
  const two = await hashRecoveryCode("abcdefghijklmnop");
  assert.equal(one, two);
  const used = new Set();
  const store = { async consumeRecoveryCode(_accountId, fingerprint) { if (used.has(fingerprint)) return false; used.add(fingerprint); return true; } };
  assert.equal((await consumeRecoveryCode({ accountId: "acct", code: "ABCD-EFGH-IJKL-MNOP", store })).verified, true);
  assert.equal((await consumeRecoveryCode({ accountId: "acct", code: "abcdefghijklmnop", store })).verified, false);
  assert.deepEqual(await consumeRecoveryCode({ accountId: "acct", code: "ZYXW-VUTS-RQPO-NMLK", store: { async consumeRecoveryCode() { throw new Error("offline"); } } }), { verified: false, reason: "recovery_store_unavailable" });
});

test("device enrollment verifies signed one-time account challenge and starts provisional", async () => {
  const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
  const challenges = new Map();
  const devices = [];
  const store = {
    async createChallenge(record) { challenges.set(record.id, record); },
    async consumeChallenge(id, accountId, fingerprint, now) {
      const record = challenges.get(id);
      if (!record || record.accountId !== accountId || record.fingerprint !== fingerprint || record.usedAt || record.expiresAt <= now) return false;
      record.usedAt = now;
      return true;
    },
    async saveDevice(device) { devices.push(device); },
  };
  let now = 1000;
  const challenge = await createDeviceEnrollmentChallenge({ accountId: "acct", store, now });
  const signature = await crypto.subtle.sign({ name: "Ed25519" }, keyPair.privateKey, new TextEncoder().encode(challenge.challenge));
  const proof = { challengeId: challenge.id, challenge: challenge.challenge, signature: b64url(new Uint8Array(signature)), publicKey: b64url(publicKeyBytes), accountId: "acct", label: "Laptop", store, now };
  assert.equal((await completeDeviceEnrollment({ ...proof, signature: b64url(new Uint8Array(64)) })).reason, "device_proof_invalid");
  assert.equal(challenges.get(challenge.id).usedAt, null, "an invalid signature must not consume the enrollment challenge");
  const enrolled = await completeDeviceEnrollment(proof);
  assert.equal(enrolled.enrolled, true);
  assert.equal(enrolled.device.status, "registered");
  assert.equal(enrolled.device.trustState, "provisional");
  assert.equal(devices.length, 1);
  assert.equal((await completeDeviceEnrollment(proof)).reason, "challenge_expired_used_or_wrong_account");
  now += 200_000;
  assert.equal((await completeDeviceEnrollment({ ...proof, now })).enrolled, false);
});
