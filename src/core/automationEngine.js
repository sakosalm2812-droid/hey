import { safeStorage } from "../lib/safeStorage.js";

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
  constructor() {
    this.recorders = new Map();
    this.workflows = new Map();
    this.versions = new Map();
    this.runs = new Map();
    this.occurrences = new Map();
    this.dedupKeys = new Set();
    this.stepExecutor = null;
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = safeStorage.getItem("hey_automation");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.recorders) Object.entries(parsed.recorders).forEach(([k, v]) => this.recorders.set(k, v));
        if (parsed.workflows) Object.entries(parsed.workflows).forEach(([k, v]) => this.workflows.set(k, v));
      }
    } catch (err) {
      console.warn("Failed to load automation:", err);
    }
  }

  save() {
    try {
      safeStorage.setItem("hey_automation", JSON.stringify({
        recorders: Object.fromEntries(this.recorders),
        workflows: Object.fromEntries(this.workflows),
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
      definition: { ...workflow },
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

    const nextRun = this.calculateNextRun(schedule);
    if (!nextRun) return;

    const occurrenceId = generateOccurrenceId();
    const occurrence = {
      id: occurrenceId,
      workflowId,
      scheduledAt: nextRun.toISOString(),
      state: "pending",
      createdAt: new Date().toISOString(),
    };

    this.occurrences.set(occurrenceId, occurrence);
    this.save();

    const delay = nextRun.getTime() - Date.now();
    if (delay > 0) {
      setTimeout(() => this.admitOccurrence(occurrenceId), delay);
    }
  }

  unscheduleWorkflow(workflowId) {
    for (const [id, occ] of this.occurrences) {
      if (occ.workflowId === workflowId && occ.state === "pending") {
        this.occurrences.delete(id);
      }
    }
    this.save();
  }

  calculateNextRun() {
    return new Date(Date.now() + 60000);
  }

  async admitOccurrence(occurrenceId) {
    const occurrence = this.occurrences.get(occurrenceId);
    if (!occurrence) return;

    const workflow = this.workflows.get(occurrence.workflowId);
    if (!workflow || workflow.state !== WORKFLOW_STATES.ENABLED) {
      occurrence.state = "skipped";
      this.occurrences.set(occurrenceId, occurrence);
      this.save();
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
        return;
      }
    }

    occurrence.state = "admitted";
    this.occurrences.set(occurrenceId, occurrence);
    this.save();

    this.executeWorkflowRun(occurrenceId);
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
    this.occurrences.set(occurrenceId, { ...occurrence, state: "completed", completedAt: new Date().toISOString() });
    this.save();

    this.scheduleNextOccurrence(occurrence.workflowId);
    this.notify("workflow_run_completed", run);
  }

  scheduleNextOccurrence(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow || workflow.trigger.type !== TRIGGER_TYPES.SCHEDULE) return;

    const nextRun = this.calculateNextRun(workflow.trigger.schedule);
    if (nextRun) {
      const occurrenceId = generateOccurrenceId();
      const occurrence = {
        id: occurrenceId,
        workflowId,
        scheduledAt: nextRun.toISOString(),
        state: "pending",
        createdAt: new Date().toISOString(),
      };
      this.occurrences.set(occurrenceId, occurrence);
      this.save();

      const delay = nextRun.getTime() - Date.now();
      if (delay > 0) {
        setTimeout(() => this.admitOccurrence(occurrenceId), delay);
      }
    }
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
