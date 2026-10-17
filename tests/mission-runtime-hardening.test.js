import test from "node:test";
import assert from "node:assert/strict";
import { createConfiguredMissionCenter, MissionCenter, missionCenter, MISSION_STATES } from "../src/core/missionCenter.js";
import { SupabaseMissionCheckpointStore } from "../src/core/supabaseMissionCheckpointStore.js";
import { executeTask } from "../src/core/executionEngine.js";
import { getAccountStorageKey, setAccountScope } from "../src/core/accountScope.js";

class MemoryStore {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
}

test("configured application mission center wires durable checkpoint persistence without local fallback", () => {
  const client = { rpc: async () => ({ data: null, error: null }) };
  const configured = createConfiguredMissionCenter({ storage: new MemoryStore(), client, configured: true });
  assert.ok(configured.checkpointStore instanceof SupabaseMissionCheckpointStore);
  assert.equal(configured.checkpointStore.client, client);

  const localOnly = createConfiguredMissionCenter({ storage: new MemoryStore(), client: null, configured: false });
  assert.equal(localOnly.checkpointStore, null);
  assert.throws(() => createConfiguredMissionCenter({ storage: new MemoryStore(), client: null, configured: true }), /configured Supabase client/);

  // The exported production singleton uses the same config-aware factory.
  assert.equal(missionCenter.checkpointStore instanceof SupabaseMissionCheckpointStore, Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY));
});

test("mission history is isolated in memory and storage across account switches", () => {
  const storage = new MemoryStore();
  const center = new MissionCenter({ storage });
  try {
    setAccountScope("mission-owner-a");
    const first = center.createMission("Account A private mission");
    assert.equal(storage.getItem(getAccountStorageKey("hey_missions")) !== null, true);

    setAccountScope("mission-owner-b");
    assert.equal(center.getMission(first.id), null);
    assert.deepEqual(center.getAllMissions(), []);
    const second = center.createMission("Account B private mission");
    assert.notEqual(second.id, first.id);
    const storedB = JSON.parse(storage.getItem(getAccountStorageKey("hey_missions")));
    assert.deepEqual(Object.keys(storedB), [second.id]);
    assert.equal(JSON.stringify(storedB).includes("Account A private mission"), false);

    setAccountScope("mission-owner-a");
    assert.equal(center.getMission(first.id).goal, "Account A private mission");
    assert.deepEqual(center.getAllMissions().map(({ id }) => id), [first.id]);
    const reloaded = new MissionCenter({ storage });
    assert.equal(reloaded.getMission(first.id).goal, "Account A private mission");
  } finally {
    setAccountScope(null);
  }
});

test("account changes isolate mission runs and cancel work started in the previous scope", async () => {
  const center = new MissionCenter({ storage: new MemoryStore() });
  let finish;
  let executionCalls = 0;
  try {
    setAccountScope("mission-run-owner-a");
    const first = center.createMission("Account A execution");
    center.setMissionState(first.id, MISSION_STATES.PLANNING);
    center.setMissionState(first.id, MISSION_STATES.READY);
    const running = center.startMission(first.id, (context) => {
      executionCalls += 1;
      if (context.signal.aborted) return { success: true, verified: false };
      if (executionCalls === 1) return new Promise((resolve) => {
        finish = resolve;
        context.signal.addEventListener("abort", () => resolve({ success: true, verified: false }), { once: true });
      });
      return { success: true, verified: true, artifactId: "account-a-result" };
    }, { verifier: async () => true });
    await new Promise((resolve) => setTimeout(resolve, 0));

    setAccountScope("mission-run-owner-b");
    const second = center.createMission("Account B execution");
    assert.equal(center.getMission(first.id), null);
    finish?.({ success: true, verified: true, artifactId: "account-a-result" });
    await running;

    setAccountScope("mission-run-owner-a");
    assert.equal(center.getMission(first.id).goal, "Account A execution");
    assert.equal(center.getMission(first.id).state, MISSION_STATES.CANCELLED);
    setAccountScope("mission-run-owner-b");
    assert.equal(center.getMission(second.id).state, MISSION_STATES.DRAFT);
  } finally {
    setAccountScope(null);
  }
});

test("mission only reaches completed after a verified execution result", async () => {
  const center = new MissionCenter({ storage: new MemoryStore() });
  const mission = center.createMission("Build a simple integration test.");
  center.setMissionState(mission.id, MISSION_STATES.PLANNING);
  center.setMissionState(mission.id, MISSION_STATES.READY);
  const result = await center.startMission(mission.id, async () => ({ success: true, verified: true, artifactId: "artifact-1" }), { verifier: async (candidate) => candidate.success === true && candidate.artifactId === "artifact-1" });
  assert.equal(result.status, "completed");
  assert.equal(result.verified, true);
  assert.equal(center.getMission(mission.id).state, MISSION_STATES.COMPLETED);
  assert.equal(center.getMission(mission.id).verification.status, "verified");
});

test("unverified task output cannot become successful mission completion", async () => {
  const task = await executeTask("Build a simple test.", async () => ({ success: true, verified: true, output: "claimed success" }), { maxSteps: 1, maxRetries: 0 });
  assert.equal(task.status, "failed");
  assert.equal(task.verified, false);
  const center = new MissionCenter({ storage: new MemoryStore() });
  const mission = center.createMission("Build another simple integration test.");
  center.setMissionState(mission.id, MISSION_STATES.PLANNING);
  center.setMissionState(mission.id, MISSION_STATES.READY);
  await center.startMission(mission.id, async () => ({ success: true, verified: true, output: "claimed success" }), { maxRetries: 0 });
  assert.notEqual(center.getMission(mission.id).state, MISSION_STATES.COMPLETED);
  assert.equal(center.getMission(mission.id).verification?.status, "unverified");
});

test("mission cancellation propagates to the executor and cannot be deleted mid-run", async () => {
  const center = new MissionCenter({ storage: new MemoryStore() });
  const mission = center.createMission("Build a cancellation test.");
  center.setMissionState(mission.id, MISSION_STATES.PLANNING);
  center.setMissionState(mission.id, MISSION_STATES.READY);
  let observedAbort = false;
  const running = center.startMission(mission.id, (_context) => new Promise((resolve) => {
    const signal = _context.signal;
    signal.addEventListener("abort", () => { observedAbort = true; resolve({ success: true, verified: false }); }, { once: true });
  }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(center.deleteMission(mission.id), false);
  assert.equal(center.cancelMission(mission.id, "hostile test"), true);
  const result = await running;
  assert.equal(observedAbort, true);
  assert.equal(result.status, "cancelled");
  assert.equal(center.getMission(mission.id).state, MISSION_STATES.CANCELLED);
  assert.equal(center.deleteMission(mission.id), true);
});

test("mission execution bridges an already-aborted or later caller signal to the executor", async () => {
  const center = new MissionCenter({ storage: new MemoryStore() });
  const mission = center.createMission("Honor caller cancellation.");
  center.setMissionState(mission.id, MISSION_STATES.PLANNING);
  center.setMissionState(mission.id, MISSION_STATES.READY);
  const caller = new AbortController();
  let executorObservedAbort = false;
  const running = center.startMission(mission.id, (context) => new Promise((resolve) => {
    context.signal.addEventListener("abort", () => {
      executorObservedAbort = true;
      resolve({ success: true, verified: false });
    }, { once: true });
  }), { signal: caller.signal });
  await new Promise((resolve) => setTimeout(resolve, 0));
  caller.abort("caller stopped");
  const result = await running;
  assert.equal(executorObservedAbort, true);
  assert.equal(result.status, "cancelled");
  assert.equal(result.verified, false);
  assert.equal(center.getMission(mission.id).state, MISSION_STATES.CANCELLED);
});

test("checkpoint creation and restore fail closed without canonical signed evidence", async () => {
  const center = new MissionCenter({ storage: new MemoryStore() });
  const mission = center.createMission("Create a checkpoint test.");
  await assert.rejects(() => center.createCheckpoint(mission.id, { accountId: "acct", privateKey: {}, keyId: "root" }), /canonical signed evidence service/i);
  assert.deepEqual(await center.restoreCheckpoint(mission.id), { restored: false, reason: "checkpoint_missing" });
});

test("checkpoint restore rejects malformed signed state before asking evidence verifier", async () => {
  let verifierCalled = false;
  const center = new MissionCenter({ storage: new MemoryStore(), evidenceService: {
    async verifyEnvelope() { verifierCalled = true; return { valid: true }; },
  } });
  const mission = center.createMission("Reject malformed checkpoint state.");
  mission.checkpoint = {
    schemaVersion: 1,
    missionId: mission.id,
    state: MISSION_STATES.COMPLETED,
    steps: [{ state: "completed", attempts: 0, dependencies: [] }],
    currentStepIndex: undefined,
    completedSteps: 1,
    progress: 100,
    evidenceEnvelope: { payload: "signed-looking" },
  };
  assert.deepEqual(await center.restoreCheckpoint(mission.id, { accountId: "acct" }), { restored: false, reason: "checkpoint_schema_invalid" });
  assert.equal(verifierCalled, false);
  assert.equal(center.getMission(mission.id).state, MISSION_STATES.DRAFT);
});

test("checkpoint restore rejects sparse and accessor-backed state without invoking getters", async () => {
  let verifierCalls = 0;
  let getterCalls = 0;
  const center = new MissionCenter({ storage: new MemoryStore(), evidenceService: {
    async verifyEnvelope() { verifierCalls += 1; return { valid: true }; },
  } });
  const mission = center.createMission("Reject unsafe checkpoint structures.");
  const sparseSteps = [];
  sparseSteps.length = 1;
  center.updateMission(mission.id, { checkpoint: {
    schemaVersion: 1,
    missionId: mission.id,
    state: MISSION_STATES.DRAFT,
    steps: sparseSteps,
    currentStepIndex: 0,
    completedSteps: 0,
    progress: 0,
    timestamp: new Date().toISOString(),
    evidenceEnvelope: { signature: "placeholder" },
    evidenceStatus: "signed",
  } });
  assert.deepEqual(await center.restoreCheckpoint(mission.id, { accountId: "acct" }), { restored: false, reason: "checkpoint_schema_invalid" });

  const accessorCheckpoint = {
    schemaVersion: 1,
    missionId: mission.id,
    steps: [],
    currentStepIndex: 0,
    completedSteps: 0,
    progress: 0,
    timestamp: new Date().toISOString(),
    evidenceEnvelope: { signature: "placeholder" },
    evidenceStatus: "signed",
  };
  Object.defineProperty(accessorCheckpoint, "state", { enumerable: true, get() { getterCalls += 1; return MISSION_STATES.DRAFT; } });
  mission.checkpoint = accessorCheckpoint;
  assert.deepEqual(await center.restoreCheckpoint(mission.id, { accountId: "acct" }), { restored: false, reason: "checkpoint_schema_invalid" });
  assert.equal(getterCalls, 0);
  assert.equal(verifierCalls, 0);
});

test("checkpoint restore applies the exact immutable snapshot that the verifier approved", async () => {
  let enteredVerifier;
  const verifierEntered = new Promise((resolve) => { enteredVerifier = resolve; });
  let releaseVerifier;
  const verifierGate = new Promise((resolve) => { releaseVerifier = resolve; });
  let verifiedBody;
  const center = new MissionCenter({ storage: new MemoryStore(), evidenceService: {
    async verifyEnvelope(_envelope, body) {
      verifiedBody = body;
      enteredVerifier();
      await verifierGate;
      return { valid: true };
    },
  } });
  const mission = center.createMission("Prevent checkpoint verification races.");
  const checkpoint = {
    schemaVersion: 1,
    missionId: mission.id,
    state: MISSION_STATES.DRAFT,
    steps: mission.steps.map((step) => ({ ...step })),
    currentStepIndex: mission.currentStepIndex,
    completedSteps: 0,
    progress: 0,
    outcome: null,
    verification: null,
    timestamp: new Date().toISOString(),
    evidenceEnvelope: { signature: "placeholder" },
    evidenceStatus: "signed",
  };
  mission.checkpoint = checkpoint;
  const restoring = center.restoreCheckpoint(mission.id, { accountId: "acct" });
  await verifierEntered;
  checkpoint.state = MISSION_STATES.COMPLETED;
  checkpoint.verification = { status: "verified" };
  if (checkpoint.steps.length) checkpoint.steps[0].state = "completed";
  releaseVerifier();

  const result = await restoring;
  assert.deepEqual(verifiedBody.state, MISSION_STATES.DRAFT);
  assert.deepEqual(verifiedBody.verification, null);
  assert.notEqual(verifiedBody.steps[0]?.state, "completed");
  assert.deepEqual(result, { restored: true, state: MISSION_STATES.DRAFT, evidence: { valid: true } });
  assert.equal(center.getMission(mission.id).state, MISSION_STATES.DRAFT);
  assert.equal(center.getMission(mission.id).verification, null);
});

test("durable checkpoint injection persists before local mutation and restores only the stored revision", async () => {
  let persisted = null;
  const expectedRevisions = [];
  const checkpointStore = {
    async load(accountId, missionId) {
      assert.equal(accountId, "2e4a81a4-2da8-4ae0-bfd6-719484a37795");
      if (!persisted || persisted.checkpoint.missionId !== missionId) return null;
      return { revision: persisted.revision, checkpoint: JSON.parse(JSON.stringify(persisted.checkpoint)) };
    },
    async save(accountId, missionId, checkpoint, { expectedRevision }) {
      assert.equal(accountId, "2e4a81a4-2da8-4ae0-bfd6-719484a37795");
      expectedRevisions.push(expectedRevision);
      if (expectedRevision !== (persisted?.revision ?? null)) return { saved: false, conflict: true };
      persisted = { revision: (persisted?.revision ?? 0) + 1, checkpoint: JSON.parse(JSON.stringify(checkpoint)) };
      assert.equal(persisted.checkpoint.missionId, missionId);
      return { saved: true, revision: persisted.revision };
    },
  };
  const center = new MissionCenter({
    storage: new MemoryStore(),
    checkpointStore,
    evidenceService: {
      async createEnvelope() { return { signature: "signed-checkpoint" }; },
      async verifyEnvelope(envelope) { return { valid: envelope.signature === "signed-checkpoint" }; },
    },
  });
  const mission = center.createMission("Persist and recover a checkpoint.");
  const created = await center.createCheckpoint(mission.id, {
    accountId: "2e4a81a4-2da8-4ae0-bfd6-719484a37795",
    privateKey: { key: "test" },
    keyId: "test-key",
  });
  assert.equal(created.evidenceStatus, "signed");
  assert.equal(persisted.revision, 1);

  mission.checkpoint = null;
  const restored = await center.restoreCheckpoint(mission.id, { accountId: "2e4a81a4-2da8-4ae0-bfd6-719484a37795" });
  assert.equal(restored.restored, true);
  assert.equal(restored.state, MISSION_STATES.DRAFT);
  const updated = await center.createCheckpoint(mission.id, {
    accountId: "2e4a81a4-2da8-4ae0-bfd6-719484a37795",
    privateKey: { key: "test" },
    keyId: "test-key",
  });
  assert.equal(updated.evidenceStatus, "signed");
  assert.deepEqual(expectedRevisions, [null, 1]);
  assert.equal(persisted.revision, 2);
});

test("configured durable checkpoint storage fails closed on save conflicts and never falls back to local state", async () => {
  let verifierCalls = 0;
  const checkpointStore = {
    async load() { return null; },
    async save() { return { saved: false, conflict: true }; },
  };
  const center = new MissionCenter({
    storage: new MemoryStore(),
    checkpointStore,
    evidenceService: {
      async createEnvelope() { return { signature: "signed" }; },
      async verifyEnvelope() { verifierCalls += 1; return { valid: true }; },
    },
  });
  const mission = center.createMission("Fail closed on checkpoint persistence conflicts.");
  await assert.rejects(() => center.createCheckpoint(mission.id, { accountId: "acct", privateKey: {}, keyId: "test-key" }), /durable revision/);
  assert.equal(mission.checkpoint, null);
  mission.checkpoint = {
    schemaVersion: 1,
    missionId: mission.id,
    state: MISSION_STATES.DRAFT,
    steps: mission.steps.map((step) => ({ ...step })),
    currentStepIndex: mission.currentStepIndex,
    completedSteps: 0,
    progress: 0,
    outcome: null,
    verification: null,
    timestamp: new Date().toISOString(),
    evidenceEnvelope: { signature: "signed" },
    evidenceStatus: "signed",
  };
  assert.deepEqual(await center.restoreCheckpoint(mission.id, { accountId: "acct" }), { restored: false, reason: "checkpoint_missing" });
  assert.equal(verifierCalls, 0);
});

test("durable checkpoint restore rejects malformed revision metadata before evidence verification", async () => {
  let verifierCalls = 0;
  const center = new MissionCenter({
    storage: new MemoryStore(),
    checkpointStore: { async load() { return { revision: "1", checkpoint: {} }; } },
    evidenceService: { async verifyEnvelope() { verifierCalls += 1; return { valid: true }; } },
  });
  const mission = center.createMission("Reject malformed checkpoint store metadata.");
  assert.deepEqual(await center.restoreCheckpoint(mission.id, { accountId: "acct" }), { restored: false, reason: "checkpoint_store_response_malformed" });
  assert.equal(verifierCalls, 0);
});

test("queued and paused missions cancel without claiming cancellation while work is active", () => {
  const center = new MissionCenter({ storage: new MemoryStore() });
  const mission = center.createMission("Cancel a queued mission.");
  center.setMissionState(mission.id, MISSION_STATES.PLANNING);
  center.setMissionState(mission.id, MISSION_STATES.READY);
  center.setMissionState(mission.id, MISSION_STATES.QUEUED);
  assert.equal(center.cancelMission(mission.id, "user request"), true);
  assert.equal(center.getMission(mission.id).state, MISSION_STATES.CANCELLED);
});

test("public mission state updates cannot forge verification or mark work completed", () => {
  const center = new MissionCenter({ storage: new MemoryStore() });
  const mission = center.createMission("Prevent forged completion.");
  center.setMissionState(mission.id, MISSION_STATES.PLANNING);
  center.setMissionState(mission.id, MISSION_STATES.READY);
  center.setMissionState(mission.id, MISSION_STATES.QUEUED);
  center.setMissionState(mission.id, MISSION_STATES.RUNNING);
  center.setMissionState(mission.id, MISSION_STATES.VERIFYING);
  assert.throws(() => center.setMissionState(mission.id, MISSION_STATES.COMPLETED), /independently verified/i);
  assert.throws(() => center.updateMission(mission.id, { state: MISSION_STATES.COMPLETED }), /verified mission state transition/i);
  assert.throws(() => center.updateMission(mission.id, { verification: { status: "verified" } }), /only be recorded by the mission verifier/i);
  assert.equal(center.getMission(mission.id).state, MISSION_STATES.VERIFYING);
});
