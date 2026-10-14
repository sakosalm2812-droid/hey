import { safeStorage } from "../lib/safeStorage.js";
import { calculateNextRun as calculateScheduledNextRun } from "./scheduleTime.js";

const RECORDER_STATES = Object.freeze({
  IDLE: "idle",
  RECORDING: "recording",
  PROCESSING: "processing",
  PROPOSAL: "proposal",
  TESTING: "testing",
  APPROVED: "approved",
  INSTALLED: "installed",
});

const WORKFLOW_STATES = Object.freeze({
  DRAFT: "draft",
  TESTED: "tested",
  ENABLED: "enabled",
  DUE: "due",
  ADMITTED: "admitted",
  RUNNING: "running",
  VERIFYING: "verifying",
  SUCCEEDED: "succeeded",
  PARTIAL: "partial",
  FAILED: "failed",
  PAUSED: "paused",
  DISABLED: "disabled",
});

const TRIGGER_TYPES = Object.freeze({
  MANUAL: "manual",
  TEXT: "text",
  VOICE: "voice",
  GESTURE: "gesture",
  SHORTCUT: "shortcut",
  SCHEDULE: "schedule",
  EVENT: "event",
  WEBHOOK: "webhook",
  FILE: "file",
  INTEGRATION: "integration",
  DEVICE: "device",
  CONDITION: "condition",
});

const MISSED_RUN_POLICIES = Object.freeze({
  SKIP: "skip",
  RUN_LATEST: "run_latest",
  BOUNDED_CATCH_UP: "bounded_catch_up",
});

const CONTINUE_ON_ERROR = Object.freeze({
  NONE: "none",
  INDEPENDENT_SAFE: "independent_safe",
  ALL: "all",
});

function generateRecorderId() {
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateWorkflowId() {
  return `wf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateVersionId() {
  return `ver_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateOccurrenceId() {
  return `occ_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class AutomationEngine {
  constructor({ storage = safeStorage, now = () => Date.now(), setTimer = globalThis.setTimeout, clearTimer = globalThis.clearTimeout, recoverOnStart = true } = {}) {
    this.storage = storage;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.recorders = new Map();
    this.workflows = new Map();
    this.versions = new Map();
    this.runs = new Map();
    this.occurrences = new Map();
    this.dedupKeys = new Set();
    this.stepExecutor = null;
    this.listeners = new Set();
    this.timers = new Map();
    this.admitting = new Set();
    this.load();
    if (recoverOnStart) this.recoverScheduledOccurrences();
  }

  load() {
    try {
      const stored = this.storage.getItem("hey_automation");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.recorders) Object.entries(parsed.recorders).forEach(([k, v]) => this.recorders.set(k, v));
        if (parsed.workflows) Object.entries(parsed.workflows).forEach(([k, v]) => this.workflows.set(k, v));
        if (parsed.versions) Object.entries(parsed.versions).forEach(([k, v]) => this.versions.set(k, v));
        if (parsed.runs) Object.entries(parsed.runs).forEach(([k, v]) => this.runs.set(k, v));
        if (parsed.occurrences) Object.entries(parsed.occurrences).forEach(([k, v]) => this.occurrences.set(k, v));
        if (parsed.dedupKeys) parsed.dedupKeys.forEach((key) => this.dedupKeys.add(key));
      }
    } catch (err) {
      console.warn("Failed to load automation:", err);
    }
  }

  save() {
    try {
      this.storage.setItem("hey_automation", JSON.stringify({
        recorders: Object.fromEntries(this.recorders),
        workflows: Object.fromEntries(this.workflows),
        versions: Object.fromEntries(this.versions),
        runs: Object.fromEntries(this.runs),
        occurrences: Object.fromEntries(this.occurrences),
        dedupKeys: Array.from(this.dedupKeys),
      }));
    } catch (err) {
      console.warn("Failed to save automation:", err);
    }
  }

  startRecording(input = {}) {
    const recorderId = generateRecorderId();
    const now = new Date().toISOString();
    
    const recorder = {
      id: recorderId,
      name: input.name || "Untitled Recording",
      description: input.description || "",
      state: RECORDER_STATES.RECORDING,
      excludedApps: input.excludedApps || [],
      excludedPasswordFields: input.excludedPasswordFields !== false,
      steps: [],
      variables: {},
      constants: {},
      appDependencies: [],
      permissions: [],
      successCriteria: input.successCriteria || "",
      startedAt: now,
      stoppedAt: null,
    };

    this.recorders.set(recorderId, recorder);
    this.save();
    this.notify("recording_started", recorder);
    return recorder;
  }

  addRecordingStep(recorderId, step) {
    const recorder = this.recorders.get(recorderId);
    if (!recorder) return { error: "Recorder not found" };
    if (recorder.state !== RECORDER_STATES.RECORDING) return { error: "Not recording" };

    recorder.steps.push({
      id: `step_${Date.now()}`,
      action: step.action,
      target: step.target,
      input: step.input,
      output: step.output,
      timestamp: new Date().toISOString(),
      app: step.app,
      window: step.window,
    });

    this.recorders.set(recorderId, recorder);
    this.save();
    return recorder;
  }

  stopRecording(recorderId) {
    const recorder = this.recorders.get(recorderId);
    if (!recorder) return { error: "Recorder not found" };

    recorder.state = RECORDER_STATES.PROCESSING;
    recorder.stoppedAt = new Date().toISOString();
    this.recorders.set(recorderId, recorder);
    this.save();

    return this.processRecording(recorderId);
  }

  processRecording(recorderId) {
    const recorder = this.recorders.get(recorderId);
    if (!recorder) return { error: "Recorder not found" };

    const workflow = this.generateWorkflowFromRecording(recorder);
    recorder.state = RECORDER_STATES.PROPOSAL;
    recorder.proposedWorkflow = workflow.id;
    this.recorders.set(recorderId, recorder);
    this.save();

    return { recorder, workflow };
  }

  generateWorkflowFromRecording(recorder) {
    const workflowId = generateWorkflowId();
    const now = new Date().toISOString();

    const workflow = {
      id: workflowId,
      name: recorder.name,
      description: recorder.description,
      version: "1.0.0",
      state: WORKFLOW_STATES.DRAFT,
      trigger: { type: TRIGGER_TYPES.MANUAL },
      steps: recorder.steps.map((step, index) => ({
        id: `step_${index}`,
        name: step.action,
        type: "action",
        action: step.action,
        target: step.target,
        input: step.input,
        dependencies: [],
        condition: null,
        wait: null,
        timeout: 30000,
        retry: { maxAttempts: 2, backoff: 1000 },
        approval: null,
        verifier: null,
        compensation: null,
        continueOnError: CONTINUE_ON_ERROR.NONE,
      })),
      variables: recorder.variables,
      constants: recorder.constants,
      appDependencies: [...new Set(recorder.steps.map(s => s.app).filter(Boolean))],
      permissions: [...new Set(recorder.permissions)],
      successCriteria: recorder.successCriteria,
      budget: { maxCost: 100, maxTime: 300000 },
      overlapPolicy: "disallow",
      missedRunPolicy: MISSED_RUN_POLICIES.RUN_LATEST,
      createdAt: now,
      updatedAt: now,
      createdBy: "recorder",
      recorderId: recorder.id,
    };

    this.workflows.set(workflowId, workflow);
    this.save();
    return workflow;
  }

  getRecorder(id) {
    return this.recorders.get(id) || null;
  }

  getAllRecorders() {
    return Array.from(this.recorders.values());
  }

  createWorkflow(input) {
    const workflowId = generateWorkflowId();
    const now = new Date().toISOString();

    const workflow = {
      id: workflowId,
      name: input.name,
      description: input.description || "",
      version: "1.0.0",
      state: WORKFLOW_STATES.DRAFT,
      trigger: input.trigger || { type: TRIGGER_TYPES.MANUAL },
      steps: input.steps || [],
      variables: input.variables || {},
      constants: input.constants || {},
      appDependencies: input.appDependencies || [],
      permissions: input.permissions || [],
      successCriteria: input.successCriteria || "",
      budget: input.budget || { maxCost: 100, maxTime: 300000 },
      overlapPolicy: input.overlapPolicy || "disallow",
      missedRunPolicy: input.missedRunPolicy || MISSED_RUN_POLICIES.RUN_LATEST,
      continueOnError: input.continueOnError || CONTINUE_ON_ERROR.NONE,
      conditions: input.conditions || [],
      branches: input.branches || {},
      waits: input.waits || {},
      timeouts: input.timeouts || {},
      retries: input.retries || { maxAttempts: 2, backoff: 1000 },
      approvals: input.approvals || [],
      verifier: input.verifier || null,
      compensation: input.compensation || {},
      createdAt: now,
      updatedAt: now,
    };

    this.workflows.set(workflowId, workflow);
    this.save();
    this.notify("workflow_created", workflow);
    return workflow;
  }

  getWorkflow(id) {
    return this.workflows.get(id) || null;
  }

  getAllWorkflows() {
    return Array.from(this.workflows.values());
  }

  updateWorkflow(id, updates) {
    const workflow = this.workflows.get(id);
    if (!workflow) return null;

    const updated = { ...workflow, ...updates, updatedAt: new Date().toISOString() };
    this.workflows.set(id, updated);
    this.save();
    this.notify("workflow_updated", updated);
    return updated;
  }

  createVersion(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return { error: "Workflow not found" };

    const versionId = generateVersionId();
    const version = {
      id: versionId,
      workflowId,
      version: workflow.version,
      // Workflow definitions are persisted as JSON, so snapshot the complete
      // JSON-compatible shape instead of retaining mutable nested references.
      definition: JSON.parse(JSON.stringify(workflow)),
      createdAt: new Date().toISOString(),
      createdBy: "user",
    };

    this.versions.set(versionId, version);
    this.save();
    return version;
  }

  getVersions(workflowId) {
    return Array.from(this.versions.values()).filter(v => v.workflowId === workflowId);
  }

  async testWorkflow(workflowId, fixtures = {}) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return { error: "Workflow not found" };

    workflow.state = WORKFLOW_STATES.TESTED;
    this.workflows.set(workflowId, workflow);
    this.save();

    const runId = generateRunId();
    const run = {
      id: runId,
      workflowId,
      version: workflow.version,
      input: fixtures,
      state: "running",
      stepResults: {},
      startedAt: new Date().toISOString(),
      completedAt: null,
      success: false,
      error: null,
    };

    this.runs.set(runId, run);
    this.save();

    try {
      const results = await this.executeWorkflow(workflow, fixtures);
      run.state = "completed";
      run.stepResults = results;
      run.success = true;
      run.completedAt = new Date().toISOString();
    } catch (error) {
      run.state = "failed";
      run.error = error.message;
      run.completedAt = new Date().toISOString();
    }

    this.runs.set(runId, run);
    this.save();
    return run;
  }

  async executeWorkflow(workflow, input) {
    const results = {};
    
    for (const step of workflow.steps) {
      const stepResult = await this.executeStep(step, input, results);
      results[step.id] = stepResult;
      
      if (!stepResult.success) {
        if (workflow.continueOnError === CONTINUE_ON_ERROR.NONE) {
          throw new Error(`Step ${step.id} failed: ${stepResult.error}`);
        }
      }
    }

    return results;
  }

  setStepExecutor(executor) {
    if (typeof executor !== "function") throw new TypeError("Automation step executor must be a function.");
    this.stepExecutor = executor;
  }

  async executeStep(step, input, priorResults) {
    if (!this.stepExecutor) {
      return { success: false, verified: false, error: "No automation execution provider is configured." };
    }
    const result = await this.stepExecutor(step, input, priorResults);
    if (!result || result.success !== true || result.verified !== true) {
      return { success: false, verified: false, error: result?.error || "Automation step was not verified." };
    }
    return result;
  }

  enableWorkflow(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return { error: "Workflow not found" };

    if (workflow.trigger.type === TRIGGER_TYPES.SCHEDULE) {
      try {
        if (!workflow.trigger.schedule) throw new TypeError("A schedule definition is required.");
        if ((workflow.trigger.schedule.type || workflow.trigger.schedule.frequency) === "interval" && !workflow.trigger.schedule.startAt) {
          workflow.trigger.schedule = { ...workflow.trigger.schedule, startAt: new Date(this.now()).toISOString() };
        }
        this.calculateNextRun(workflow.trigger.schedule, new Date(this.now()));
      } catch (error) {
        return { error: `Invalid schedule: ${error.message}` };
      }
    }

    workflow.state = WORKFLOW_STATES.ENABLED;
    workflow.enabledAt = new Date().toISOString();
    this.workflows.set(workflowId, workflow);
    this.save();
    
    if (workflow.trigger.type === TRIGGER_TYPES.SCHEDULE) {
      this.scheduleWorkflow(workflowId);
    }
    
    this.notify("workflow_enabled", workflow);
    return workflow;
  }

  disableWorkflow(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return { error: "Workflow not found" };

    workflow.state = WORKFLOW_STATES.DISABLED;
    workflow.disabledAt = new Date().toISOString();
    this.workflows.set(workflowId, workflow);
    this.save();
    
    this.unscheduleWorkflow(workflowId);
    this.notify("workflow_disabled", workflow);
    return workflow;
  }

  scheduleWorkflow(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow || workflow.trigger.type !== TRIGGER_TYPES.SCHEDULE) return;

    const schedule = workflow.trigger.schedule;
    if (!schedule) return;

    if (Array.from(this.occurrences.values()).some((occurrence) => occurrence.workflowId === workflowId && occurrence.state === "pending")) return;
    const nextRun = this.calculateNextRun(schedule, new Date(this.now()));
    if (!nextRun) return;
    this.createOccurrence(workflowId, nextRun);
  }

  unscheduleWorkflow(workflowId) {
    for (const [id, occ] of this.occurrences) {
      if (occ.workflowId === workflowId && occ.state === "pending") {
        this.clearOccurrenceTimer(id);
        this.occurrences.delete(id);
      }
    }
    this.save();
  }

  calculateNextRun(schedule, after = new Date(this.now())) {
    return calculateScheduledNextRun(schedule, after);
  }

  createOccurrence(workflowId, runAt, details = {}) {
    const occurrenceId = generateOccurrenceId();
    const occurrence = {
      id: occurrenceId,
      workflowId,
      scheduledAt: runAt.toISOString(),
      state: "pending",
      createdAt: new Date(this.now()).toISOString(),
      ...details,
    };
    this.occurrences.set(occurrenceId, occurrence);
    this.save();
    this.scheduleOccurrenceTimer(occurrence);
    return occurrence;
  }

  scheduleOccurrenceTimer(occurrence) {
    this.clearOccurrenceTimer(occurrence.id);
    if (occurrence.state !== "pending") return;
    const dueAt = new Date(occurrence.scheduledAt).getTime();
    if (!Number.isFinite(dueAt)) {
      this.occurrences.set(occurrence.id, { ...occurrence, state: "invalid", error: "Stored schedule time is invalid." });
      this.save();
      return;
    }
    const delay = Math.max(0, dueAt - this.now());
    // Node/browser timers are bounded to a signed 32-bit millisecond delay.
    const boundedDelay = Math.min(delay, 2_147_000_000);
    const timer = this.setTimer(() => {
      this.timers.delete(occurrence.id);
      if (dueAt - this.now() > 0) this.scheduleOccurrenceTimer(occurrence);
      else void this.admitOccurrence(occurrence.id);
    }, boundedDelay);
    timer?.unref?.();
    this.timers.set(occurrence.id, timer);
  }

  clearOccurrenceTimer(occurrenceId) {
    const timer = this.timers.get(occurrenceId);
    if (timer !== undefined) this.clearTimer(timer);
    this.timers.delete(occurrenceId);
  }

  recoverScheduledOccurrences() {
    const now = this.now();
    for (const run of this.runs.values()) {
      if (["running", "verifying", "admitted"].includes(run.state)) {
        run.state = "recovery_required";
        run.recoveryReason = "The process restarted while the action outcome could be uncertain; automatic replay is blocked.";
        run.recoveredAt = new Date(now).toISOString();
        const occurrence = this.occurrences.get(run.occurrenceId);
        if (occurrence && ["pending", "admitted"].includes(occurrence.state)) {
          this.occurrences.set(occurrence.id, { ...occurrence, state: "recovery_required", recoveryReason: run.recoveryReason });
        }
      }
    }
    for (const occurrence of this.occurrences.values()) {
      if (occurrence.state === "admitted" && !Array.from(this.runs.values()).some((run) => run.occurrenceId === occurrence.id)) {
        this.occurrences.set(occurrence.id, { ...occurrence, state: "recovery_required", recoveryReason: "Occurrence was claimed without a durable run record; automatic replay is blocked." });
      }
    }
    for (const workflow of this.workflows.values()) {
      if (workflow.state !== WORKFLOW_STATES.ENABLED || workflow.trigger?.type !== TRIGGER_TYPES.SCHEDULE) continue;
      const pending = Array.from(this.occurrences.values()).find((occurrence) => occurrence.workflowId === workflow.id && occurrence.state === "pending");
      if (pending) {
        if (new Date(pending.scheduledAt).getTime() <= now) {
          const policy = workflow.missedRunPolicy || MISSED_RUN_POLICIES.RUN_LATEST;
          if (policy === MISSED_RUN_POLICIES.SKIP) {
            this.occurrences.set(pending.id, { ...pending, state: "missed", recoveredAt: new Date(now).toISOString() });
            const next = this.calculateNextRun(workflow.trigger.schedule, new Date(now));
            if (next) this.createOccurrence(workflow.id, next, { recovered: true });
          } else {
            const caught = { ...pending, scheduledAt: new Date(now).toISOString(), recovered: true };
            this.occurrences.set(caught.id, caught);
            this.scheduleOccurrenceTimer(caught);
          }
        } else this.scheduleOccurrenceTimer(pending);
      } else {
        const next = this.calculateNextRun(workflow.trigger.schedule, new Date(now));
        if (next) this.createOccurrence(workflow.id, next, { recovered: true });
      }
    }
    this.save();
  }

  async admitOccurrence(occurrenceId) {
    const occurrence = this.occurrences.get(occurrenceId);
    if (!occurrence || occurrence.state !== "pending" || this.admitting.has(occurrenceId)) return;
    this.admitting.add(occurrenceId);

    const workflow = this.workflows.get(occurrence.workflowId);
    if (!workflow || workflow.state !== WORKFLOW_STATES.ENABLED) {
      occurrence.state = "skipped";
      this.occurrences.set(occurrenceId, occurrence);
      this.save();
      this.admitting.delete(occurrenceId);
      return;
    }

    if (workflow.overlapPolicy === "disallow") {
      const running = Array.from(this.runs.values()).some(r => 
        r.workflowId === occurrence.workflowId && r.state === "running"
      );
      if (running) {
        occurrence.state = "skipped_overlap";
        this.occurrences.set(occurrenceId, occurrence);
        this.save();
        this.admitting.delete(occurrenceId);
        return;
      }
    }

    occurrence.state = "admitted";
    this.occurrences.set(occurrenceId, occurrence);
    this.save();

    this.admitting.delete(occurrenceId);
    void this.executeWorkflowRun(occurrenceId).catch((error) => {
      const current = this.occurrences.get(occurrenceId);
      if (current) this.occurrences.set(occurrenceId, { ...current, state: "failed", error: error.message });
      this.save();
    });
  }

  async executeWorkflowRun(occurrenceId) {
    const occurrence = this.occurrences.get(occurrenceId);
    if (!occurrence) return;

    const workflow = this.workflows.get(occurrence.workflowId);
    if (!workflow) return;

    const runId = generateRunId();
    const run = {
      id: runId,
      workflowId: occurrence.workflowId,
      occurrenceId,
      version: workflow.version,
      input: {},
      state: WORKFLOW_STATES.RUNNING,
      stepResults: {},
      startedAt: new Date().toISOString(),
      completedAt: null,
      success: false,
      error: null,
    };

    this.runs.set(runId, run);
    this.save();

    try {
      const results = await this.executeWorkflow(workflow, {});
      run.state = WORKFLOW_STATES.SUCCEEDED;
      run.stepResults = results;
      run.success = true;
      run.completedAt = new Date().toISOString();
    } catch (error) {
      run.state = WORKFLOW_STATES.FAILED;
      run.error = error.message;
      run.completedAt = new Date().toISOString();
    }

    this.runs.set(runId, run);
    this.occurrences.set(occurrenceId, { ...occurrence, state: run.success ? "completed" : "failed", completedAt: new Date().toISOString(), ...(run.error ? { error: run.error } : {}) });
    this.save();

    this.scheduleNextOccurrence(occurrence.workflowId);
    this.notify("workflow_run_completed", run);
  }

  scheduleNextOccurrence(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow || workflow.trigger.type !== TRIGGER_TYPES.SCHEDULE) return;

    const nextRun = this.calculateNextRun(workflow.trigger.schedule, new Date(this.now()));
    if (nextRun) this.createOccurrence(workflowId, nextRun);
  }

  getRun(id) {
    return this.runs.get(id) || null;
  }

  getAllRuns() {
    return Array.from(this.runs.values());
  }

  getOccurrence(id) {
    return this.occurrences.get(id) || null;
  }

  getAllOccurrences() {
    return Array.from(this.occurrences.values());
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Automation listener error:", err); }
    });
  }
}

export { AutomationEngine };
export const automationEngine = new AutomationEngine();

export function startRecording(input) {
  return automationEngine.startRecording(input);
}

export function addRecordingStep(recorderId, step) {
  return automationEngine.addRecordingStep(recorderId, step);
}

export function stopRecording(recorderId) {
  return automationEngine.stopRecording(recorderId);
}

export function getRecorder(id) {
  return automationEngine.getRecorder(id);
}

export function getAllRecorders() {
  return automationEngine.getAllRecorders();
}

export function createWorkflow(input) {
  return automationEngine.createWorkflow(input);
}

export function getWorkflow(id) {
  return automationEngine.getWorkflow(id);
}

export function getAllWorkflows() {
  return automationEngine.getAllWorkflows();
}

export function updateWorkflow(id, updates) {
  return automationEngine.updateWorkflow(id, updates);
}

export function createWorkflowVersion(workflowId) {
  return automationEngine.createVersion(workflowId);
}

export function getWorkflowVersions(workflowId) {
  return automationEngine.getVersions(workflowId);
}

export function testWorkflow(workflowId, fixtures) {
  return automationEngine.testWorkflow(workflowId, fixtures);
}

export function setAutomationStepExecutor(executor) {
  return automationEngine.setStepExecutor(executor);
}

export function enableWorkflow(workflowId) {
  return automationEngine.enableWorkflow(workflowId);
}

export function disableWorkflow(workflowId) {
  return automationEngine.disableWorkflow(workflowId);
}

export function getWorkflowRun(id) {
  return automationEngine.getRun(id);
}

export function getAllWorkflowRuns() {
  return automationEngine.getAllRuns();
}

export function subscribeToAutomation(listener) {
  return automationEngine.subscribe(listener);
}

export { RECORDER_STATES, WORKFLOW_STATES, TRIGGER_TYPES, MISSED_RUN_POLICIES, CONTINUE_ON_ERROR };

export default automationEngine;
