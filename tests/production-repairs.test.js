import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { DiagnosticsEngine } from "../src/core/diagnosticsEngine.js";
import { DeveloperEngine } from "../src/core/developerEngine.js";
import { packageSigningPayload, versionSatisfies } from "../src/core/packageValidation.js";
import { calculateNextRun } from "../src/core/scheduleTime.js";
import { AutomationEngine } from "../src/core/automationEngine.js";

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
