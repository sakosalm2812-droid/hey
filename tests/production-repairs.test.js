import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { DiagnosticsEngine } from "../src/core/diagnosticsEngine.js";
import { DeveloperEngine } from "../src/core/developerEngine.js";
import { packageSigningPayload, versionSatisfies } from "../src/core/packageValidation.js";
import { calculateNextRun } from "../src/core/scheduleTime.js";
import { AutomationEngine } from "../src/core/automationEngine.js";
import { InMemoryMandateStore, issueActionMandate, verifyAndConsumeMandate } from "../src/core/actionMandate.js";
import { createAction, executeAction, clearActions } from "../src/core/actionEngine.js";

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data };
};

test("recovery blocks missing or unverifiable adapters and only reports verified recovery", async () => {
  const engine = new DiagnosticsEngine({ storage: memoryStorage() });
  const blocked = await engine.attemptRecovery({ action: "retry", target: "x" });
  assert.equal(blocked.success, false);
  assert.equal(blocked.state, "blocked");
  const unregister = engine.registerRecoveryAdapter("retry", {
    run: async () => ({ changed: true }),
    verify: async () => ({ verified: false, reason: "postcondition absent" }),
  });
  const failed = await engine.attemptRecovery({ action: "retry", target: "x" });
  assert.equal(failed.success, false);
  assert.equal(failed.state, "failed");
  unregister();
  const registerTrue = engine.registerRecoveryAdapter("retry", {
    run: async () => ({ changed: true }),
    verify: async () => ({ verified: true }),
  });
  const recovered = await engine.attemptRecovery({ action: "retry", target: "x" });
  assert.equal(recovered.success, true);
  assert.equal(recovered.state, "completed");
  registerTrue();
});

test("signed action mandates attenuate delegation and prevent replay, overuse, and revoked-parent use", async () => {
  const root = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const delegate = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const trustedKeys = { root: root.publicKey, delegate: delegate.publicKey };
  const store = new InMemoryMandateStore();
  const now = Date.parse("2026-10-14T12:00:00Z");
  const parent = await issueActionMandate({
    accountId: "acct-1", actions: ["web.search", "memory.read"], resources: ["web.search", "memory.read"],
    expiresAt: new Date(now + 60_000).toISOString(), maxUses: 3, delegable: true, delegateKeyIds: ["delegate"],
  }, { privateKey: root.privateKey, keyId: "root", now });
  const child = await issueActionMandate({
    accountId: "acct-1", actions: ["web.search"], resources: ["web.search"], expiresAt: new Date(now + 30_000).toISOString(), maxUses: 2,
  }, { privateKey: delegate.privateKey, keyId: "delegate", parent, now });
  const context = { accountId: "acct-1", action: "web.search", resource: "web.search", idempotencyKey: "mission:step:1", currentRevocationEpoch: 0 };
  const testStore = { trustedKeys, store, now, allowTestOnlyStore: true };
  assert.equal((await verifyAndConsumeMandate(child, context, testStore)).authorized, true);
  assert.match((await verifyAndConsumeMandate(child, context, testStore)).reason, /replay/i);
  assert.equal((await verifyAndConsumeMandate(child, { ...context, idempotencyKey: "mission:step:2" }, testStore)).authorized, true);
  assert.match((await verifyAndConsumeMandate(child, { ...context, idempotencyKey: "mission:step:3" }, testStore)).reason, /use limit/i);
  await store.revoke(parent.payload.id, { accountId: context.accountId });
  assert.match((await verifyAndConsumeMandate(child, { ...context, idempotencyKey: "mission:step:4" }, testStore)).reason, /revoked/i);
  await assert.rejects(() => issueActionMandate({ accountId: "acct-1", actions: ["terminal.execute"], resources: ["*"], expiresAt: new Date(now + 10_000).toISOString() }, { privateKey: delegate.privateKey, keyId: "delegate", parent, now }), /subset/i);

  const singleUse = await issueActionMandate({ accountId: "acct-1", actions: ["web.search"], resources: ["web.search"], expiresAt: new Date(now + 10_000).toISOString() }, { privateKey: root.privateKey, keyId: "root", now });
  const sharedStore = new InMemoryMandateStore();
  const concurrent = await Promise.all(Array.from({ length: 32 }, (_, index) => verifyAndConsumeMandate(singleUse, { ...context, idempotencyKey: `shared-race:${index}` }, { trustedKeys, store: sharedStore, now, allowTestOnlyStore: true })));
  assert.equal(concurrent.filter((entry) => entry.authorized).length, 1);
  const forged = { ...singleUse, payload: { ...singleUse.payload, resources: ["*", "web.search"] } };
  assert.equal((await verifyAndConsumeMandate(forged, context, { trustedKeys, store: sharedStore, now, allowTestOnlyStore: true })).authorized, false);
  assert.match((await verifyAndConsumeMandate(singleUse, context, { trustedKeys, store: {}, now })).reason, /durable.*store/i);
  assert.match((await verifyAndConsumeMandate(singleUse, context, { trustedKeys, store: new InMemoryMandateStore(), now: now + 20_000, allowTestOnlyStore: true })).reason, /expired/i);
  const offlineMandate = await issueActionMandate({ accountId: "acct-1", actions: ["web.search"], resources: ["web.search"], expiresAt: new Date(now + 10_000).toISOString() }, { privateKey: root.privateKey, keyId: "root", now });
  assert.match((await verifyAndConsumeMandate(offlineMandate, context, { trustedKeys, store: new InMemoryMandateStore(), now, online: false, allowTestOnlyStore: true })).reason, /offline/i);
});

test("action execution enforces mandates when the caller requires them", async () => {
  clearActions();
  const action = createAction({ title: "Search", tool: "web.search", permission: "web.search", riskLevel: "low" });
  let executed = false;
  const result = await executeAction(action.id, async () => { executed = true; return { success: true, verified: true }; }, {
    user: { id: "acct-1", plan: "free", permissions: ["web.search"] }, confirmed: true, requireMandate: true,
  });
  assert.equal(result.success, false);
  assert.equal(executed, false);
  assert.match(result.error, /mandate is required/i);
});

test("action execution rejects accessor-based mandate envelopes without evaluating them", async () => {
  const action = createAction({ title: "Search", tool: "web.search", permission: "web.search", riskLevel: "low" });
  let getterCalls = 0;
  const mandate = {};
  Object.defineProperty(mandate, "payload", {
    enumerable: true,
    get() { getterCalls += 1; return { id: "attacker-controlled" }; },
  });
  let executed = false;
  const result = await executeAction(action.id, async () => { executed = true; return { success: true, verified: true }; }, {
    confirmed: true,
    user: { id: "acct-1", permissions: ["web.search"] },
    mandate,
    requireMandate: true,
  });

  assert.equal(result.success, false);
  assert.equal(getterCalls, 0);
  assert.equal(executed, false);
});

test("package validation fails closed, verifies real signatures and revalidates before install", async () => {
  const pair = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicBytes = new Uint8Array(await webcrypto.subtle.exportKey("raw", pair.publicKey));
  const b64 = (bytes) => Buffer.from(bytes).toString("base64");
  const engine = new DeveloperEngine({ trustedKeys: { release: b64(publicBytes) }, storage: memoryStorage() });
  const packageInput = {
    name: "demo", version: "1.2.3", manifest: { name: "demo", version: "1.2.3" },
    dependencies: [], licenses: ["MIT"], compatibility: [],
  };
  const unsigned = { ...packageInput, description: "", schemaId: null };
  const signature = await webcrypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, new TextEncoder().encode(packageSigningPayload(unsigned)));
  const pkg = engine.createPackage({ ...packageInput, signature: { algorithm: "Ed25519", keyId: "release", value: b64(signature) } });
  assert.equal((await engine.validatePackage(pkg.id)).valid, true);
  assert.equal((await engine.stagePackage(pkg.id)).state, "staged");
  // Tampering after staging must be caught at the installation boundary.
  engine.packages.get(pkg.id).manifest.name = "tampered";
  assert.match((await engine.installPackage(pkg.id)).error, /validation failed/i);
  const bad = engine.createPackage({ ...packageInput, name: "bad", manifest: { name: "bad", version: "1.2.3" }, signature: null });
  assert.equal((await engine.validatePackage(bad.id)).valid, false);
  assert.equal((await engine.stagePackage(bad.id)).error !== undefined, true);
  assert.equal(engine.registerSchema({ name: "unsafe", definition: { type: "object", arbitraryKeyword: true } }).error !== undefined, true);
});

test("semver dependency ranges correctly constrain zero-major releases", () => {
  assert.equal(versionSatisfies("1.8.0", "^1.2.3"), true);
  assert.equal(versionSatisfies("2.0.0", "^1.2.3"), false);
  assert.equal(versionSatisfies("0.3.9", "^0.3.2"), true);
  assert.equal(versionSatisfies("0.4.0", "^0.3.2"), false);
  assert.equal(versionSatisfies("0.0.4", "^0.0.3"), false);
});

test("recurrence honors timezone, weekdays and spring-forward gaps", () => {
  const daily = calculateNextRun({ type: "daily", time: "09:00", timeZone: "America/Los_Angeles" }, new Date("2026-01-01T18:30:00Z"));
  assert.equal(daily.toISOString(), "2026-01-02T17:00:00.000Z");
  const weekly = calculateNextRun({ type: "weekly", time: "10:00", timeZone: "UTC", daysOfWeek: [1] }, new Date("2026-01-05T10:00:00Z"));
  assert.equal(weekly.toISOString(), "2026-01-12T10:00:00.000Z");
  const gap = calculateNextRun({ type: "daily", time: "02:30", timeZone: "America/New_York" }, new Date("2026-03-08T05:00:00Z"));
  assert.equal(gap.toISOString(), "2026-03-08T07:00:00.000Z");
  assert.throws(() => calculateNextRun({ type: "daily", time: "09:00", timeZone: "Not/AZone" }, new Date()), RangeError);
});

test("workflow schedule rejects invalid definitions and marks failed runs accurately", async () => {
  let now = Date.parse("2026-01-01T00:00:00Z");
  const storage = memoryStorage();
  const scheduled = [];
  const engine = new AutomationEngine({
    storage, now: () => now,
    setTimer: (fn, delay) => { scheduled.push({ fn, delay }); return { unref() {} }; },
    clearTimer: () => {}, recoverOnStart: false,
  });
  const invalid = engine.createWorkflow({ name: "bad", steps: [], trigger: { type: "schedule", schedule: { type: "daily", time: "09:00" } } });
  assert.match(engine.enableWorkflow(invalid.id).error, /Invalid schedule/);
  const workflow = engine.createWorkflow({ name: "good", steps: [{ id: "step" }], trigger: { type: "schedule", schedule: { type: "interval", intervalMinutes: 5 } } });
  engine.enableWorkflow(workflow.id);
  assert.equal(engine.getAllOccurrences().filter((o) => o.state === "pending").length, 1);
  const occurrence = engine.getAllOccurrences().find((o) => o.state === "pending");
  now = Date.parse(occurrence.scheduledAt);
  await engine.admitOccurrence(occurrence.id);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(engine.getOccurrence(occurrence.id).state, "failed");
  assert.equal(engine.getAllRuns().at(-1).success, false);
});

test("automation workflow versions remain immutable and survive an engine restart", () => {
  const storage = memoryStorage();
  const engine = new AutomationEngine({ storage, recoverOnStart: false });
  const workflow = engine.createWorkflow({
    name: "versioned",
    steps: [{ id: "step-1", input: { nested: { value: "original" } } }],
  });

  const version = engine.createVersion(workflow.id);
  workflow.steps[0].input.nested.value = "mutated";
  engine.updateWorkflow(workflow.id, { name: "updated" });

  const restoredEngine = new AutomationEngine({ storage, recoverOnStart: false });
  const restoredVersions = restoredEngine.getVersions(workflow.id);
  assert.equal(restoredVersions.length, 1);
  assert.equal(restoredVersions[0].id, version.id);
  assert.equal(restoredVersions[0].definition.name, "versioned");
  assert.equal(restoredVersions[0].definition.steps[0].input.nested.value, "original");
});
