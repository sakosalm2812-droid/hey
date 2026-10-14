import test from "node:test";
import assert from "node:assert/strict";
import { MissionCenter, MISSION_STATES } from "../src/core/missionCenter.js";
import { executeTask } from "../src/core/executionEngine.js";

class MemoryStore {
  constructor() { this.value = null; }
  getItem(key) { return key === "hey_missions" ? this.value : null; }
  setItem(key, value) { if (key === "hey_missions") this.value = value; }
}

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

test("checkpoint creation and restore fail closed without canonical signed evidence", async () => {
  const center = new MissionCenter({ storage: new MemoryStore() });
  const mission = center.createMission("Create a checkpoint test.");
  await assert.rejects(() => center.createCheckpoint(mission.id, { accountId: "acct", privateKey: {}, keyId: "root" }), /canonical signed evidence service/i);
  assert.deepEqual(await center.restoreCheckpoint(mission.id), { restored: false, reason: "checkpoint_missing" });
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
