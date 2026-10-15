import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";
import { executeTask, getExecutionHistory } from "./executionEngine.js";
import { createPlan } from "./planner.js";
import { safeStorage } from "../lib/safeStorage.js";

export const MISSION_STATES = Object.freeze({
  DRAFT: "draft",
  PLANNING: "planning",
  READY: "ready",
  QUEUED: "queued",
  RUNNING: "running",
  VERIFYING: "verifying",
  COMPLETED: "completed",
  AWAITING_PERMISSION: "awaiting_permission",
  AWAITING_INPUT: "awaiting_input",
  PAUSED: "paused",
  BLOCKED_DEPENDENCY: "blocked_dependency",
  RECOVERING: "recovering",
  PARTIAL: "partial",
  FAILED: "failed",
  CANCELLING: "cancelling",
  CANCELLED: "cancelled",
});

export const STEP_STATES = Object.freeze({
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  BLOCKED: "blocked",
  SKIPPED: "skipped",
  CANCELLED: "cancelled",
});
const STATE_UPDATE_TOKEN = Symbol("mission-state-transition");

function isPlainJsonValue(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || ancestors.has(value)) return false;
  ancestors.add(value);
  try {
    const isArray = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (isArray) {
      if (keys.length !== value.length + 1 || !Object.hasOwn(descriptors, "length")) return false;
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true || !isPlainJsonValue(descriptor.value, ancestors)) return false;
      }
      return true;
    }
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true || !isPlainJsonValue(descriptor.value, ancestors)) return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    ancestors.delete(value);
  }
}

function isValidMissionCheckpoint(checkpoint, missionId) {
  if (!isPlainJsonValue(checkpoint)) return false;
  if (!checkpoint || checkpoint.schemaVersion !== 1 || checkpoint.missionId !== missionId) return false;
  if (!Object.values(MISSION_STATES).includes(checkpoint.state) || !Array.isArray(checkpoint.steps)) return false;
  const allowedCheckpointFields = new Set(["schemaVersion", "missionId", "state", "steps", "currentStepIndex", "completedSteps", "progress", "outcome", "verification", "timestamp", "evidenceEnvelope", "evidenceStatus"]);
  if (Object.keys(checkpoint).some((key) => !allowedCheckpointFields.has(key))) return false;
  if (checkpoint.evidenceStatus !== "signed" || typeof checkpoint.timestamp !== "string" || !Number.isFinite(Date.parse(checkpoint.timestamp))) return false;
  if (!Number.isSafeInteger(checkpoint.currentStepIndex) || checkpoint.currentStepIndex < -1 || checkpoint.currentStepIndex > checkpoint.steps.length) return false;
  if (!Number.isSafeInteger(checkpoint.completedSteps) || checkpoint.completedSteps < 0) return false;
  const completed = checkpoint.steps.filter((step) => step && step.state === STEP_STATES.COMPLETED).length;
  if (completed !== checkpoint.completedSteps) return false;
  if (checkpoint.currentStepIndex === -1 && completed !== checkpoint.steps.length) return false;
  if (checkpoint.currentStepIndex === checkpoint.steps.length && checkpoint.steps.length > 0 && completed !== checkpoint.steps.length) return false;
  const expectedProgress = checkpoint.steps.length ? Math.round((completed / checkpoint.steps.length) * 100) : 0;
  if (!Number.isSafeInteger(checkpoint.progress) || checkpoint.progress !== expectedProgress) return false;
  const seenStepIds = new Set();
  return checkpoint.steps.every((step) => {
    if (!step || typeof step !== "object" || Object.keys(step).some((key) => !["id", "description", "tool", "state", "result", "error", "startedAt", "completedAt", "attempts", "maxRetries", "dependencies"].includes(key))) return false;
    if (typeof step.id !== "string" || !step.id || seenStepIds.has(step.id) || typeof step.description !== "string") return false;
    seenStepIds.add(step.id);
    return Object.values(STEP_STATES).includes(step.state)
      && Number.isSafeInteger(step.attempts) && step.attempts >= 0
      && Number.isSafeInteger(step.maxRetries) && step.maxRetries >= 0
      && Array.isArray(step.dependencies) && step.dependencies.every((dependency) => typeof dependency === "string");
  });
}

function generateMissionId() {
  return `mission_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateStepId() {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export class MissionCenter {
  constructor({ storage = safeStorage, evidenceService = null } = {}) {
    this.missions = new Map();
    this.listeners = new Set();
    this.activeRuns = new Map();
    this.storage = storage;
    this.evidenceService = evidenceService;
    this.load();
  }

  load() {
    try {
      const stored = this.storage.getItem("hey_missions");
      if (stored) {
        const parsed = JSON.parse(stored);
        Object.entries(parsed).forEach(([id, mission]) => {
          this.missions.set(id, mission);
        });
      }
    } catch (err) {
      console.warn("Failed to load missions:", err);
    }
  }

  save() {
    try {
      const data = Object.fromEntries(this.missions);
      this.storage.setItem("hey_missions", JSON.stringify(data));
    } catch (err) {
      console.warn("Failed to save missions:", err);
    }
  }

  configureEvidenceService(evidenceService) {
    const create = evidenceService?.createEnvelope || evidenceService?.createEvidenceEnvelope;
    const verify = evidenceService?.verifyEnvelope || evidenceService?.verifyEvidenceEnvelope;
    if (typeof create !== "function" || typeof verify !== "function") throw new TypeError("The canonical evidence service must expose envelope creation and verification.");
    this.evidenceService = evidenceService;
    return true;
  }

  createMission(goal, options = {}) {
    const id = generateMissionId();
    const plan = createPlan(goal);

    const mission = {
      id,
      goal,
      description: options.description || "",
      state: MISSION_STATES.DRAFT,
      priority: options.priority || "normal",
      projectId: options.projectId || null,
      tags: options.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      steps: plan.steps?.map(step => ({
        id: generateStepId(),
        description: step.description,
        tool: step.tool || null,
        state: STEP_STATES.PENDING,
        result: null,
        error: null,
        startedAt: null,
        completedAt: null,
        attempts: 0,
        maxRetries: step.maxRetries || 2,
        dependencies: step.dependencies || [],
      })) || [],
      currentStepIndex: 0,
      completedSteps: 0,
      failedSteps: 0,
      totalCost: 0,
      estimatedCost: options.estimatedCost || null,
      budget: options.budget || null,
      metadata: options.metadata || {},
      checkpoint: null,
      abortController: null,
      progress: 0,
      blockingReason: null,
      cancellationReason: null,
      recoveryAttempts: 0,
    };

    this.missions.set(id, mission);
    this.save();
    this.notifyListeners("created", mission);
    
    publish("mission.created", mission);
    recordAudit({
      action: "mission.created",
      status: "completed",
      metadata: { missionId: id, goal },
    });

    return mission;
  }

  getMission(id) {
    return this.missions.get(id) || null;
  }

  getAllMissions() {
    return Array.from(this.missions.values());
  }

  getActiveMissions() {
    return this.getAllMissions().filter(m => 
      ![MISSION_STATES.COMPLETED, MISSION_STATES.CANCELLED, MISSION_STATES.FAILED].includes(m.state)
    );
  }

  getMissionsByState(state) {
    return this.getAllMissions().filter(m => m.state === state);
  }

  getMissionsByProject(projectId) {
    return this.getAllMissions().filter(m => m.projectId === projectId);
  }

  updateMission(id, updates, stateToken = null) {
    const mission = this.missions.get(id);
    if (!mission) return null;

    if (updates?.state === MISSION_STATES.COMPLETED && stateToken !== STATE_UPDATE_TOKEN) {
      throw new Error("Mission completion must pass the verified mission state transition.");
    }
    if (updates?.verification?.status === "verified" && stateToken !== STATE_UPDATE_TOKEN) throw new Error("Verified mission evidence can only be recorded by the mission verifier.");

    const updated = {
      ...mission,
      ...updates,
      state: stateToken === STATE_UPDATE_TOKEN && updates.state !== undefined ? updates.state : mission.state,
      updatedAt: new Date().toISOString(),
    };

    this.missions.set(id, updated);
    this.save();
    this.notifyListeners("updated", updated);
    
    publish("mission.updated", updated);
    return updated;
  }

  setMissionState(id, state, reason = null) {
    const mission = this.missions.get(id);
    if (!mission) return null;

    const validTransitions = this.getValidTransitions(mission.state);
    if (!validTransitions.includes(state)) {
      throw new Error(`Invalid state transition: ${mission.state} -> ${state}`);
    }
    if (state === MISSION_STATES.COMPLETED && mission.verification?.status !== "verified") {
      throw new Error("Mission cannot be completed without independently verified postconditions.");
    }

    const updates = { state };
    
    if (state === MISSION_STATES.RUNNING && !mission.startedAt) {
      updates.startedAt = new Date().toISOString();
    }
    if (state === MISSION_STATES.COMPLETED) {
      updates.completedAt = new Date().toISOString();
      updates.progress = 100;
    }
    if (state === MISSION_STATES.CANCELLED) {
      updates.cancellationReason = reason;
    }
    if (state === MISSION_STATES.BLOCKED_DEPENDENCY) {
      updates.blockingReason = reason;
    }
    if (state === MISSION_STATES.FAILED) {
      updates.cancellationReason = reason;
    }

    return this.updateMission(id, updates, STATE_UPDATE_TOKEN);
  }

  getValidTransitions(currentState) {
    const transitions = {
      [MISSION_STATES.DRAFT]: [MISSION_STATES.PLANNING, MISSION_STATES.CANCELLED],
      [MISSION_STATES.PLANNING]: [MISSION_STATES.READY, MISSION_STATES.CANCELLED],
      [MISSION_STATES.READY]: [MISSION_STATES.QUEUED, MISSION_STATES.CANCELLED],
      [MISSION_STATES.QUEUED]: [MISSION_STATES.RUNNING, MISSION_STATES.CANCELLED],
      [MISSION_STATES.RUNNING]: [MISSION_STATES.VERIFYING, MISSION_STATES.AWAITING_PERMISSION, MISSION_STATES.AWAITING_INPUT, MISSION_STATES.PAUSED, MISSION_STATES.BLOCKED_DEPENDENCY, MISSION_STATES.CANCELLING, MISSION_STATES.FAILED],
      [MISSION_STATES.VERIFYING]: [MISSION_STATES.COMPLETED, MISSION_STATES.RECOVERING, MISSION_STATES.PARTIAL, MISSION_STATES.FAILED],
      [MISSION_STATES.AWAITING_PERMISSION]: [MISSION_STATES.RUNNING, MISSION_STATES.CANCELLING, MISSION_STATES.CANCELLED],
      [MISSION_STATES.AWAITING_INPUT]: [MISSION_STATES.RUNNING, MISSION_STATES.CANCELLING, MISSION_STATES.CANCELLED],
      [MISSION_STATES.PAUSED]: [MISSION_STATES.RUNNING, MISSION_STATES.CANCELLING, MISSION_STATES.CANCELLED],
      [MISSION_STATES.BLOCKED_DEPENDENCY]: [MISSION_STATES.RUNNING, MISSION_STATES.CANCELLING, MISSION_STATES.CANCELLED],
      [MISSION_STATES.RECOVERING]: [MISSION_STATES.VERIFYING, MISSION_STATES.PARTIAL, MISSION_STATES.FAILED, MISSION_STATES.CANCELLED],
      [MISSION_STATES.PARTIAL]: [MISSION_STATES.QUEUED, MISSION_STATES.CANCELLED],
      [MISSION_STATES.FAILED]: [MISSION_STATES.QUEUED, MISSION_STATES.CANCELLED],
      [MISSION_STATES.CANCELLING]: [MISSION_STATES.CANCELLED],
      [MISSION_STATES.COMPLETED]: [],
      [MISSION_STATES.CANCELLED]: [],
    };
    return transitions[currentState] || [];
  }

  async startMission(id, executor, options = {}) {
    const mission = this.missions.get(id);
    if (!mission) throw new Error("Mission not found");
    if (this.activeRuns.has(id)) throw new Error("Mission already has an active execution run.");
    if (mission.state !== MISSION_STATES.QUEUED && mission.state !== MISSION_STATES.READY) {
      throw new Error(`Mission must be queued or ready to start, current: ${mission.state}`);
    }

    const controller = new AbortController();
    const externalSignal = options.signal;
    const abortFromExternal = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) abortFromExternal();
    else externalSignal?.addEventListener?.("abort", abortFromExternal, { once: true });
    this.activeRuns.set(id, controller);
    this.updateMission(id, { runStartedAt: new Date().toISOString(), outcome: "running" });
    if (this.missions.get(id)?.state === MISSION_STATES.READY) this.setMissionState(id, MISSION_STATES.QUEUED);
    this.setMissionState(id, MISSION_STATES.RUNNING);

    try {
      const result = await executeTask(mission.goal, executor, {
        ...options,
        signal: controller.signal,
        maxSteps: mission.steps.length,
      });

      if (controller.signal.aborted || this.missions.get(id)?.state === MISSION_STATES.CANCELLING) {
        const currentState = this.missions.get(id)?.state;
        if (currentState !== MISSION_STATES.CANCELLING && this.getValidTransitions(currentState).includes(MISSION_STATES.CANCELLING)) {
          this.setMissionState(id, MISSION_STATES.CANCELLING, "Caller cancelled execution.");
        }
        if (this.missions.get(id)?.state === MISSION_STATES.CANCELLING) this.setMissionState(id, MISSION_STATES.CANCELLED, "Cancellation raced with task completion; outcome retained as unverified.");
        this.updateMission(id, { outcome: "unknown_after_cancellation", verification: { status: "unverified", at: new Date().toISOString() } });
        return { ...result, status: "cancelled", verified: false, cancellationOutcome: "unknown" };
      }
      if (result.status === "completed") this.setMissionState(id, MISSION_STATES.VERIFYING);
      if (result.status === "completed" && result.verified === true) {
        this.updateMission(id, { outcome: "verified", verification: { status: "verified", at: new Date().toISOString(), completedSteps: result.metadata?.executionHistory?.filter((event) => event.type === "step_completed" && event.verified === true).length || 0 } }, STATE_UPDATE_TOKEN);
        this.setMissionState(id, MISSION_STATES.COMPLETED);
      } else if (result.status === "cancelled") {
        this.setMissionState(id, MISSION_STATES.CANCELLED, "Cancelled during execution");
        this.updateMission(id, { outcome: "cancelled", verification: { status: "unknown_after_cancellation", at: new Date().toISOString() } });
      } else if (result.status === "blocked") {
        this.setMissionState(id, MISSION_STATES.BLOCKED_DEPENDENCY, result.blockReason);
      } else {
        this.setMissionState(id, result.status === "completed" ? MISSION_STATES.PARTIAL : MISSION_STATES.FAILED, result.error || (result.status === "completed" ? "Execution produced no independently verified completed step." : null));
        this.updateMission(id, { outcome: result.status === "completed" ? "unverified" : "failed", verification: { status: "unverified", at: new Date().toISOString() } });
      }

      return result;
    } catch (error) {
      const current = this.missions.get(id);
      if (controller.signal.aborted && current?.state === MISSION_STATES.RUNNING) this.setMissionState(id, MISSION_STATES.CANCELLING, "Caller cancelled execution.");
      if (this.missions.get(id)?.state === MISSION_STATES.CANCELLING) this.setMissionState(id, MISSION_STATES.CANCELLED, current?.cancellationReason || "Cancelled during execution");
      else this.setMissionState(id, MISSION_STATES.FAILED, error.message);
      throw error;
    } finally {
      externalSignal?.removeEventListener?.("abort", abortFromExternal);
      this.activeRuns.delete(id);
      const current = this.missions.get(id);
      if (current) this.updateMission(id, { runFinishedAt: new Date().toISOString() });
    }
  }

  pauseMission(id) {
    if (this.activeRuns.has(id)) throw new Error("The current executor cannot durably pause in-flight work; cancellation or an explicit wait state is required.");
    return this.setMissionState(id, MISSION_STATES.PAUSED);
  }

  resumeMission(id) {
    const mission = this.missions.get(id);
    if (!mission || mission.state !== MISSION_STATES.PAUSED) return null;
    return this.setMissionState(id, MISSION_STATES.RUNNING);
  }

  cancelMission(id, reason = "User cancelled") {
    const mission = this.missions.get(id);
    if (!mission) return null;
    if ([MISSION_STATES.COMPLETED, MISSION_STATES.CANCELLED, MISSION_STATES.FAILED].includes(mission.state)) return false;
    
    const active = this.activeRuns.has(id);
    if (active) this.setMissionState(id, MISSION_STATES.CANCELLING, reason);
    else if (this.getValidTransitions(mission.state).includes(MISSION_STATES.CANCELLED)) this.setMissionState(id, MISSION_STATES.CANCELLED, reason);
    else if (this.getValidTransitions(mission.state).includes(MISSION_STATES.CANCELLING)) {
      this.setMissionState(id, MISSION_STATES.CANCELLING, reason);
      this.setMissionState(id, MISSION_STATES.CANCELLED, reason);
    } else return false;
    const controller = this.activeRuns.get(id) || mission.abortController;
    controller?.abort?.();

    publish(active ? "mission.cancellation_requested" : "mission.cancelled", { missionId: id, reason });
    recordAudit({
      action: active ? "mission.cancellation_requested" : "mission.cancelled",
      status: active ? "pending" : "completed",
      metadata: { missionId: id, reason },
    });

    return true;
  }

  retryMission(id, executor, options = {}) {
    const mission = this.missions.get(id);
    if (!mission) throw new Error("Mission not found");
    if (![MISSION_STATES.FAILED, MISSION_STATES.PARTIAL, MISSION_STATES.CANCELLED].includes(mission.state)) {
      throw new Error("Can only retry failed, partial, or cancelled missions");
    }

    const resetSteps = mission.steps.map(step => ({
      ...step,
      state: step.state === STEP_STATES.COMPLETED ? STEP_STATES.COMPLETED : STEP_STATES.PENDING,
      result: step.state === STEP_STATES.COMPLETED ? step.result : null,
      error: null,
      attempts: step.state === STEP_STATES.COMPLETED ? step.attempts : 0,
    }));

    this.updateMission(id, {
      state: MISSION_STATES.QUEUED,
      steps: resetSteps,
      currentStepIndex: resetSteps.findIndex(s => s.state !== STEP_STATES.COMPLETED),
      completedSteps: resetSteps.filter(s => s.state === STEP_STATES.COMPLETED).length,
      failedSteps: 0,
      blockingReason: null,
      cancellationReason: null,
      verification: null,
      outcome: "retry_queued",
    }, STATE_UPDATE_TOKEN);

    return this.startMission(id, executor, options);
  }

  updateStep(id, stepIndex, updates) {
    const mission = this.missions.get(id);
    if (!mission || stepIndex >= mission.steps.length) return null;

    const steps = [...mission.steps];
    steps[stepIndex] = { ...steps[stepIndex], ...updates };

    if (updates.state === STEP_STATES.RUNNING && !steps[stepIndex].startedAt) {
      steps[stepIndex].startedAt = new Date().toISOString();
    }
    if (updates.state === STEP_STATES.COMPLETED) {
      steps[stepIndex].completedAt = new Date().toISOString();
    }
    if (updates.state === STEP_STATES.FAILED) {
      steps[stepIndex].attempts = (steps[stepIndex].attempts || 0) + 1;
    }

    const completedSteps = steps.filter(s => s.state === STEP_STATES.COMPLETED).length;
    const progress = steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0;

    return this.updateMission(id, {
      steps,
      currentStepIndex: steps.findIndex(s => s.state !== STEP_STATES.COMPLETED),
      completedSteps,
      progress,
    });
  }

  async createCheckpoint(id, { accountId, privateKey, keyId, revocationEpoch = 0, expiresAt } = {}) {
    const mission = this.missions.get(id);
    if (!mission) return null;
    const createEnvelope = this.evidenceService?.createEnvelope || this.evidenceService?.createEvidenceEnvelope;
    if (typeof createEnvelope !== "function" || typeof accountId !== "string" || !privateKey || !keyId) {
      throw new Error("A canonical signed evidence service, authenticated account, and signing key are required for checkpoints.");
    }

    const body = {
      schemaVersion: 1,
      missionId: id,
      state: mission.state,
      steps: mission.steps.map(s => ({ ...s })),
      currentStepIndex: mission.currentStepIndex,
      completedSteps: mission.completedSteps,
      progress: mission.progress,
      outcome: mission.outcome || null,
      verification: mission.verification || null,
      timestamp: new Date().toISOString(),
    };
    const envelope = await createEnvelope({ accountId, source: { type: "mission_checkpoint", missionId: id }, body, revocationEpoch, offlineAllowed: false, expiresAt }, { privateKey, keyId });
    const checkpoint = { ...body, evidenceEnvelope: envelope, evidenceStatus: "signed" };

    this.updateMission(id, { checkpoint });
    return checkpoint;
  }

  async restoreCheckpoint(id, { accountId, currentRevocationEpoch, trustedKeys, store, now = Date.now(), online = true, maxAgeMs = Infinity } = {}) {
    const mission = this.missions.get(id);
    if (!mission || !mission.checkpoint) return { restored: false, reason: "checkpoint_missing" };
    if (this.activeRuns.has(id)) return { restored: false, reason: "mission_execution_active" };

    const { checkpoint } = mission;
    if (!isValidMissionCheckpoint(checkpoint, id)) return { restored: false, reason: "checkpoint_schema_invalid" };
    const verifyEnvelope = this.evidenceService?.verifyEnvelope || this.evidenceService?.verifyEvidenceEnvelope;
    if (typeof verifyEnvelope !== "function" || !checkpoint.evidenceEnvelope) return { restored: false, reason: "signed_checkpoint_verifier_unavailable" };
    const evidence = await verifyEnvelope(checkpoint.evidenceEnvelope, {
      schemaVersion: checkpoint.schemaVersion,
      missionId: checkpoint.missionId,
      state: checkpoint.state,
      steps: checkpoint.steps,
      currentStepIndex: checkpoint.currentStepIndex,
      completedSteps: checkpoint.completedSteps,
      progress: checkpoint.progress,
      outcome: checkpoint.outcome,
      verification: checkpoint.verification,
      timestamp: checkpoint.timestamp,
    }, { accountId, currentRevocationEpoch }, { trustedKeys, store, now, online, maxAgeMs });
    if (evidence?.valid !== true) return { restored: false, reason: evidence?.reason || "checkpoint_evidence_invalid" };
    if (checkpoint.state === MISSION_STATES.COMPLETED && checkpoint.verification?.status !== "verified") return { restored: false, reason: "completed_checkpoint_unverified" };
    const restoredState = [MISSION_STATES.RUNNING, MISSION_STATES.VERIFYING, MISSION_STATES.CANCELLING].includes(checkpoint.state)
      ? MISSION_STATES.RECOVERING
      : checkpoint.state;
    this.updateMission(id, {
      state: restoredState,
      steps: checkpoint.steps,
      currentStepIndex: checkpoint.currentStepIndex,
      completedSteps: checkpoint.completedSteps,
      progress: checkpoint.progress,
      outcome: checkpoint.outcome,
      verification: checkpoint.verification,
    }, STATE_UPDATE_TOKEN);

    return { restored: true, state: restoredState, evidence };
  }

  getMissionProgress(id) {
    const mission = this.missions.get(id);
    if (!mission) return null;

    return {
      missionId: id,
      state: mission.state,
      progress: mission.progress,
      completedSteps: mission.completedSteps,
      totalSteps: mission.steps.length,
      currentStep: mission.currentStepIndex < mission.steps.length ? mission.steps[mission.currentStepIndex] : null,
      estimatedTimeRemaining: mission.metadata.estimatedTimeRemaining || null,
      totalCost: mission.totalCost,
      budget: mission.budget,
    };
  }

  getMissionReplay(id) {
    const mission = this.missions.get(id);
    if (!mission) return null;

    return {
      missionId: id,
      goal: mission.goal,
      createdAt: mission.createdAt,
      completedAt: mission.completedAt,
      steps: mission.steps.map((step, index) => ({
        stepIndex: index,
        description: step.description,
        tool: step.tool,
        state: step.state,
        result: step.result,
        error: step.error,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
        attempts: step.attempts,
        dependencies: step.dependencies,
      })),
      executionHistory: getExecutionHistory(id),
      finalState: mission.state,
      totalCost: mission.totalCost,
    };
  }

  deleteMission(id) {
    const mission = this.missions.get(id);
    if (!mission) return false;

    if (this.activeRuns.has(id) || [MISSION_STATES.RUNNING, MISSION_STATES.QUEUED, MISSION_STATES.CANCELLING].includes(mission.state)) return false;

    this.missions.delete(id);
    this.save();
    this.notifyListeners("deleted", { id });
    return true;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(event, data) {
    this.listeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (err) {
        console.error("Mission listener error:", err);
      }
    });
  }
}

export const missionCenter = new MissionCenter();

export function createMission(goal, options) {
  return missionCenter.createMission(goal, options);
}

export function getMission(id) {
  return missionCenter.getMission(id);
}

export function getAllMissions() {
  return missionCenter.getAllMissions();
}

export function getActiveMissions() {
  return missionCenter.getActiveMissions();
}

export function getMissionsByState(state) {
  return missionCenter.getMissionsByState(state);
}

export function getMissionsByProject(projectId) {
  return missionCenter.getMissionsByProject(projectId);
}

export function updateMission(id, updates) {
  return missionCenter.updateMission(id, updates);
}

export function setMissionState(id, state, reason) {
  return missionCenter.setMissionState(id, state, reason);
}

export function startMission(id, executor, options) {
  return missionCenter.startMission(id, executor, options);
}

export function pauseMission(id) {
  return missionCenter.pauseMission(id);
}

export function resumeMission(id) {
  return missionCenter.resumeMission(id);
}

export function cancelMission(id, reason) {
  return missionCenter.cancelMission(id, reason);
}

export function retryMission(id, executor, options) {
  return missionCenter.retryMission(id, executor, options);
}

export function updateMissionStep(id, stepIndex, updates) {
  return missionCenter.updateStep(id, stepIndex, updates);
}

export function createMissionCheckpoint(id, options) {
  return missionCenter.createCheckpoint(id, options);
}

export function restoreMissionCheckpoint(id, options) {
  return missionCenter.restoreCheckpoint(id, options);
}

export function getMissionProgress(id) {
  return missionCenter.getMissionProgress(id);
}

export function getMissionReplay(id) {
  return missionCenter.getMissionReplay(id);
}

export function deleteMission(id) {
  return missionCenter.deleteMission(id);
}

export function subscribeToMissions(listener) {
  return missionCenter.subscribe(listener);
}

export default missionCenter;
