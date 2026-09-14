import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";
import { executeTask, getExecutionHistory } from "./executionEngine.js";
import { createPlan } from "./planner.js";
import { safeStorage } from "../lib/safeStorage.js";

const MISSION_STATES = Object.freeze({
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

const STEP_STATES = Object.freeze({
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  BLOCKED: "blocked",
  SKIPPED: "skipped",
  CANCELLED: "cancelled",
});

function generateMissionId() {
  return `mission_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateStepId() {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class MissionCenter {
  constructor() {
    this.missions = new Map();
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = safeStorage.getItem("hey_missions");
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
      safeStorage.setItem("hey_missions", JSON.stringify(data));
    } catch (err) {
      console.warn("Failed to save missions:", err);
    }
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

  updateMission(id, updates) {
    const mission = this.missions.get(id);
    if (!mission) return null;

    const updated = {
      ...mission,
      ...updates,
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

    return this.updateMission(id, updates);
  }

  getValidTransitions(currentState) {
    const transitions = {
      [MISSION_STATES.DRAFT]: [MISSION_STATES.PLANNING, MISSION_STATES.CANCELLED],
      [MISSION_STATES.PLANNING]: [MISSION_STATES.READY, MISSION_STATES.CANCELLED],
      [MISSION_STATES.READY]: [MISSION_STATES.QUEUED, MISSION_STATES.CANCELLED],
      [MISSION_STATES.QUEUED]: [MISSION_STATES.RUNNING, MISSION_STATES.CANCELLED],
      [MISSION_STATES.RUNNING]: [MISSION_STATES.VERIFYING, MISSION_STATES.AWAITING_PERMISSION, MISSION_STATES.AWAITING_INPUT, MISSION_STATES.PAUSED, MISSION_STATES.BLOCKED_DEPENDENCY, MISSION_STATES.CANCELLING, MISSION_STATES.FAILED],
      [MISSION_STATES.VERIFYING]: [MISSION_STATES.COMPLETED, MISSION_STATES.RECOVERING, MISSION_STATES.PARTIAL, MISSION_STATES.FAILED],
      [MISSION_STATES.AWAITING_PERMISSION]: [MISSION_STATES.RUNNING, MISSION_STATES.CANCELLING],
      [MISSION_STATES.AWAITING_INPUT]: [MISSION_STATES.RUNNING, MISSION_STATES.CANCELLING],
      [MISSION_STATES.PAUSED]: [MISSION_STATES.RUNNING, MISSION_STATES.CANCELLING],
      [MISSION_STATES.BLOCKED_DEPENDENCY]: [MISSION_STATES.RUNNING, MISSION_STATES.CANCELLING],
      [MISSION_STATES.RECOVERING]: [MISSION_STATES.VERIFYING, MISSION_STATES.PARTIAL, MISSION_STATES.FAILED],
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
    if (mission.state !== MISSION_STATES.QUEUED && mission.state !== MISSION_STATES.READY) {
      throw new Error(`Mission must be queued or ready to start, current: ${mission.state}`);
    }

    this.setMissionState(id, MISSION_STATES.RUNNING);

    try {
      const result = await executeTask(mission.goal, executor, {
        ...options,
        maxSteps: mission.steps.length,
      });

      if (result.status === "completed") {
        this.setMissionState(id, MISSION_STATES.COMPLETED);
      } else if (result.status === "cancelled") {
        this.setMissionState(id, MISSION_STATES.CANCELLED, "Cancelled during execution");
      } else if (result.status === "blocked") {
        this.setMissionState(id, MISSION_STATES.BLOCKED_DEPENDENCY, result.blockReason);
      } else {
        this.setMissionState(id, MISSION_STATES.FAILED, result.error);
      }

      return result;
    } catch (error) {
      this.setMissionState(id, MISSION_STATES.FAILED, error.message);
      throw error;
    }
  }

  pauseMission(id) {
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
    
    this.setMissionState(id, MISSION_STATES.CANCELLING, reason);
    
    if (mission.abortController) {
      mission.abortController.abort();
    }

    setTimeout(() => {
      this.setMissionState(id, MISSION_STATES.CANCELLED, reason);
    }, 100);

    publish("mission.cancelled", { missionId: id, reason });
    recordAudit({
      action: "mission.cancelled",
      status: "completed",
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
    });

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

  createCheckpoint(id) {
    const mission = this.missions.get(id);
    if (!mission) return null;

    const checkpoint = {
      missionId: id,
      state: mission.state,
      steps: mission.steps.map(s => ({ ...s })),
      currentStepIndex: mission.currentStepIndex,
      completedSteps: mission.completedSteps,
      progress: mission.progress,
      timestamp: new Date().toISOString(),
    };

    this.updateMission(id, { checkpoint });
    return checkpoint;
  }

  restoreCheckpoint(id) {
    const mission = this.missions.get(id);
    if (!mission || !mission.checkpoint) return false;

    const { checkpoint } = mission;
    this.updateMission(id, {
      state: checkpoint.state,
      steps: checkpoint.steps,
      currentStepIndex: checkpoint.currentStepIndex,
      completedSteps: checkpoint.completedSteps,
      progress: checkpoint.progress,
    });

    return true;
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

    if ([MISSION_STATES.RUNNING, MISSION_STATES.QUEUED].includes(mission.state)) {
      this.cancelMission(id, "Deleted while running");
    }

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

export function createMissionCheckpoint(id) {
  return missionCenter.createCheckpoint(id);
}

export function restoreMissionCheckpoint(id) {
  return missionCenter.restoreCheckpoint(id);
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

export { MISSION_STATES, STEP_STATES };

export default missionCenter;
