const HEALTH_STATES = Object.freeze({
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  DIAGNOSING: "diagnosing",
  RECOVERING: "recovering",
  ACTION_REQUIRED: "action_required",
});

const COMPONENT_TYPES = Object.freeze({
  PROVIDER: "provider",
  DATABASE: "database",
  AUTH: "auth",
  COSMOS: "cosmos",
  AUDIO: "audio",
  CAMERA: "camera",
  WAKE_WORD: "wake_word",
  NOTIFICATIONS: "notifications",
  NATIVE_BRIDGE: "native_bridge",
  BROWSER_AUTOMATION: "browser_automation",
  OS_AUTOMATION: "os_automation",
  INTEGRATIONS: "integrations",
  DEVICES: "devices",
  STORAGE: "storage",
  AGENTS: "agents",
  WORKFLOWS: "workflows",
  BACKGROUND_WORKER: "background_worker",
});

const RECOVERY_ACTIONS = Object.freeze({
  RETRY: "retry",
  FALLBACK: "fallback",
  RECONNECT: "reconnect",
  CHECKPOINT_RESUME: "checkpoint_resume",
  PAUSE_WORKFLOW: "pause_workflow",
  RESTORE_VERSION: "restore_version",
});

function generateCheckId() {
  return `check_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateTraceId() {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateErrorId() {
  return `err_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateRecoveryId() {
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class DiagnosticsEngine {
  constructor() {
    this.healthChecks = new Map();
    this.traces = new Map();
    this.errorFingerprints = new Map();
    this.recoveryAttempts = new Map();
    this.releaseManifests = new Map();
    this.migrations = new Map();
    this.incidents = new Map();
    this.listeners = new Set();
    this.load();
    this.startPeriodicChecks();
  }

  load() {
    try {
      const stored = localStorage.getItem("hey_diagnostics");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.healthChecks) Object.entries(parsed.healthChecks).forEach(([k, v]) => this.healthChecks.set(k, v));
        if (parsed.traces) Object.entries(parsed.traces).forEach(([k, v]) => this.traces.set(k, v));
        if (parsed.errorFingerprints) Object.entries(parsed.errorFingerprints).forEach(([k, v]) => this.errorFingerprints.set(k, v));
        if (parsed.recoveryAttempts) Object.entries(parsed.recoveryAttempts).forEach(([k, v]) => this.recoveryAttempts.set(k, v));
        if (parsed.releaseManifests) Object.entries(parsed.releaseManifests).forEach(([k, v]) => this.releaseManifests.set(k, v));
        if (parsed.migrations) Object.entries(parsed.migrations).forEach(([k, v]) => this.migrations.set(k, v));
        if (parsed.incidents) Object.entries(parsed.incidents).forEach(([k, v]) => this.incidents.set(k, v));
      }
    } catch (err) {
      console.warn("Failed to load diagnostics:", err);
    }
  }

  save() {
    try {
      localStorage.setItem("hey_diagnostics", JSON.stringify({
        healthChecks: Object.fromEntries(this.healthChecks),
        traces: Object.fromEntries(this.traces),
        errorFingerprints: Object.fromEntries(this.errorFingerprints),
        recoveryAttempts: Object.fromEntries(this.recoveryAttempts),
        releaseManifests: Object.fromEntries(this.releaseManifests),
        migrations: Object.fromEntries(this.migrations),
        incidents: Object.fromEntries(this.incidents),
      }));
    } catch (err) {
      console.warn("Failed to save diagnostics:", err);
    }
  }

  startPeriodicChecks() {
    setInterval(() => this.runAllHealthChecks(), 60000);
  }

  async runAllHealthChecks() {
    const components = Object.values(COMPONENT_TYPES);
    for (const component of components) {
      await this.runHealthCheck(component);
    }
  }

  async runHealthCheck(component) {
    const checkId = generateCheckId();
    const check = {
      id: checkId,
      component,
      state: HEALTH_STATES.HEALTHY,
      checkedAt: new Date().toISOString(),
      impact: "none",
      nextAction: null,
      details: {},
      latency: 0,
    };

    try {
      const start = Date.now();
      const result = await this.checkComponent(component);
      check.latency = Date.now() - start;
      check.state = result.healthy ? HEALTH_STATES.HEALTHY : HEALTH_STATES.DEGRADED;
      check.details = result.details;
      check.nextAction = result.nextAction;
    } catch (error) {
      check.state = HEALTH_STATES.DEGRADED;
      check.details.error = error.message;
      check.nextAction = "investigate";
    }

    this.healthChecks.set(checkId, check);
    this.save();
    this.notify("health_check_completed", check);
    return check;
  }

  async checkComponent(_component) {
    return { healthy: true, details: {}, nextAction: null };
  }

  getHealthCheck(id) {
    return this.healthChecks.get(id) || null;
  }

  getLatestHealthCheck(component) {
    return Array.from(this.healthChecks.values())
      .filter(c => c.component === component)
      .sort((a, b) => new Date(b.checkedAt) - new Date(a.checkedAt))[0] || null;
  }

  getAllHealthChecks() {
    return Array.from(this.healthChecks.values());
  }

  getOverallHealth() {
    const latest = new Map();
    for (const check of this.healthChecks.values()) {
      const existing = latest.get(check.component);
      if (!existing || new Date(check.checkedAt) > new Date(existing.checkedAt)) {
        latest.set(check.component, check);
      }
    }

    const states = Array.from(latest.values()).map(c => c.state);
    if (states.includes(HEALTH_STATES.ACTION_REQUIRED)) return HEALTH_STATES.ACTION_REQUIRED;
    if (states.includes(HEALTH_STATES.DIAGNOSING)) return HEALTH_STATES.DIAGNOSING;
    if (states.includes(HEALTH_STATES.RECOVERING)) return HEALTH_STATES.RECOVERING;
    if (states.includes(HEALTH_STATES.DEGRADED)) return HEALTH_STATES.DEGRADED;
    return HEALTH_STATES.HEALTHY;
  }

  startTrace(input) {
    const traceId = generateTraceId();
    const trace = {
      id: traceId,
      operation: input.operation,
      correlationId: input.correlationId,
      startTime: Date.now(),
      spans: [],
      metadata: input.metadata || {},
    };
    this.traces.set(traceId, trace);
    return traceId;
  }

  addSpan(traceId, span) {
    const trace = this.traces.get(traceId);
    if (!trace) return;
    trace.spans.push({
      ...span,
      startTime: Date.now(),
      duration: null,
    });
  }

  endSpan(traceId, spanId, metadata = {}) {
    const trace = this.traces.get(traceId);
    if (!trace) return;
    const span = trace.spans.find(s => s.id === spanId);
    if (span) {
      span.endTime = Date.now();
      span.duration = span.endTime - span.startTime;
      span.metadata = metadata;
    }
  }

  endTrace(traceId) {
    const trace = this.traces.get(traceId);
    if (!trace) return null;
    trace.endTime = Date.now();
    trace.duration = trace.endTime - trace.startTime;
    return trace;
  }

  getTrace(id) {
    return this.traces.get(id) || null;
  }

  recordError(input) {
    const errorId = generateErrorId();
    const fingerprint = this.generateFingerprint(input.error);
    
    const error = {
      id: errorId,
      fingerprint,
      message: input.error.message,
      stack: input.error.stack,
      context: input.context,
      timestamp: new Date().toISOString(),
      count: 1,
      lastSeen: new Date().toISOString(),
    };

    const existing = this.errorFingerprints.get(fingerprint);
    if (existing) {
      existing.count++;
      existing.lastSeen = error.timestamp;
    } else {
      this.errorFingerprints.set(fingerprint, error);
    }

    this.save();
    this.notify("error_recorded", error);
    return error;
  }

  generateFingerprint(error) {
    const msg = error.message || String(error);
    const stack = error.stack || "";
    return `${msg}:${stack.split("\n")[0]}`.slice(0, 200);
  }

  getErrorFingerprint(id) {
    return this.errorFingerprints.get(id) || null;
  }

  getAllErrorFingerprints() {
    return Array.from(this.errorFingerprints.values())
      .sort((a, b) => b.count - a.count);
  }

async attemptRecovery(input) {
    const recoveryId = generateRecoveryId();
    const attempt = {
      id: recoveryId,
      action: input.action,
      target: input.target,
      state: "attempting",
      startedAt: new Date().toISOString(),
      completedAt: null,
      success: false,
      details: {},
    };

    this.recoveryAttempts.set(recoveryId, attempt);
    this.save();

    try {
      let result;
      switch (input.action) {
        case "retry":
          result = await this.retryOperation(input.target);
          break;
        case "fallback":
          result = await this.fallbackOperation(input.target);
          break;
        case "reconnect":
          result = await this.reconnectService(input.target);
          break;
        case "checkpoint_resume":
          result = await this.resumeFromCheckpoint(input.target);
          break;
        case "pause_workflow":
          result = await this.pauseWorkflow(input.target);
          break;
        case "restore_version":
          result = await this.restorePreviousVersion(input.target);
          break;
      }

      attempt.state = "completed";
      attempt.success = true;
      attempt.details = result;
    } catch (error) {
      attempt.state = "failed";
      attempt.success = false;
      attempt.error = error.message;
    }

    attempt.completedAt = new Date().toISOString();
    this.recoveryAttempts.set(recoveryId, attempt);
    this.save();
    this.notify("recovery_attempted", attempt);
    return attempt;
  }

  async retryOperation(_target) { return { retried: true }; }
  async fallbackOperation(_target) { return { fallback: true }; }
  async reconnectService(_target) { return { reconnected: true }; }
  async resumeFromCheckpoint(_target) { return { resumed: true }; }
  async pauseWorkflow(_target) { return { paused: true }; }
  async restorePreviousVersion(_target) { return { restored: true }; }

  getRecoveryAttempt(id) {
    return this.recoveryAttempts.get(id) || null;
  }

  getAllRecoveryAttempts() {
    return Array.from(this.recoveryAttempts.values());
  }

  createReleaseManifest(input) {
    const manifestId = `manifest_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const manifest = {
      id: manifestId,
      version: input.version,
      components: input.components || [],
      migrations: input.migrations || [],
      rollbackPlan: input.rollbackPlan || "",
      integrityChecks: input.integrityChecks || [],
      createdAt: new Date().toISOString(),
      stagedAt: null,
      rolledOutAt: null,
      monitoredAt: null,
      acceptedAt: null,
      rolledBackAt: null,
      state: "candidate",
    };
    this.releaseManifests.set(manifestId, manifest);
    this.save();
    return manifest;
  }

  getReleaseManifest(id) {
    return this.releaseManifests.get(id) || null;
  }

  getAllReleaseManifests() {
    return Array.from(this.releaseManifests.values());
  }

  createMigration(input) {
    const migrationId = `mig_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const migration = {
      id: migrationId,
      version: input.version,
      description: input.description,
      up: input.up,
      down: input.down,
      compatibility: input.compatibility || [],
      state: "pending",
      createdAt: new Date().toISOString(),
      executedAt: null,
      rolledBackAt: null,
    };
    this.migrations.set(migrationId, migration);
    this.save();
    return migration;
  }

  getMigration(id) {
    return this.migrations.get(id) || null;
  }

  getAllMigrations() {
    return Array.from(this.migrations.values());
  }

  createIncident(input) {
    const incidentId = `inc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const incident = {
      id: incidentId,
      title: input.title,
      description: input.description,
      severity: input.severity,
      components: input.components || [],
      state: "open",
      startedAt: new Date().toISOString(),
      resolvedAt: null,
      resolution: null,
      timeline: [],
    };
    this.incidents.set(incidentId, incident);
    this.save();
    return incident;
  }

  getIncident(id) {
    return this.incidents.get(id) || null;
  }

  getAllIncidents() {
    return Array.from(this.incidents.values());
  }

  updateIncident(id, updates) {
    const incident = this.incidents.get(id);
    if (!incident) return null;
    const updated = { ...incident, ...updates };
    this.incidents.set(id, updated);
    this.save();
    return updated;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Diagnostics listener error:", err); }
    });
  }
}

export const diagnosticsEngine = new DiagnosticsEngine();

export function runHealthCheck(component) {
  return diagnosticsEngine.runHealthCheck(component);
}

export function runAllHealthChecks() {
  return diagnosticsEngine.runAllHealthChecks();
}

export function getHealthCheck(id) {
  return diagnosticsEngine.getHealthCheck(id);
}

export function getLatestHealthCheck(component) {
  return diagnosticsEngine.getLatestHealthCheck(component);
}

export function getAllHealthChecks() {
  return diagnosticsEngine.getAllHealthChecks();
}

export function getOverallHealth() {
  return diagnosticsEngine.getOverallHealth();
}

export function startTrace(input) {
  return diagnosticsEngine.startTrace(input);
}

export function addTraceSpan(traceId, span) {
  return diagnosticsEngine.addSpan(traceId, span);
}

export function endTraceSpan(traceId, spanId, metadata) {
  return diagnosticsEngine.endSpan(traceId, spanId, metadata);
}

export function endTrace(traceId) {
  return diagnosticsEngine.endTrace(traceId);
}

export function getTrace(id) {
  return diagnosticsEngine.getTrace(id);
}

export function recordError(input) {
  return diagnosticsEngine.recordError(input);
}

export function getErrorFingerprint(id) {
  return diagnosticsEngine.getErrorFingerprint(id);
}

export function getAllErrorFingerprints() {
  return diagnosticsEngine.getAllErrorFingerprints();
}

export function attemptRecovery(input) {
  return diagnosticsEngine.attemptRecovery(input);
}

export function getRecoveryAttempt(id) {
  return diagnosticsEngine.getRecoveryAttempt(id);
}

export function getAllRecoveryAttempts() {
  return diagnosticsEngine.getAllRecoveryAttempts();
}

export function createReleaseManifest(input) {
  return diagnosticsEngine.createReleaseManifest(input);
}

export function getReleaseManifest(id) {
  return diagnosticsEngine.getReleaseManifest(id);
}

export function getAllReleaseManifests() {
  return diagnosticsEngine.getAllReleaseManifests();
}

export function createMigration(input) {
  return diagnosticsEngine.createMigration(input);
}

export function getMigration(id) {
  return diagnosticsEngine.getMigration(id);
}

export function getAllMigrations() {
  return diagnosticsEngine.getAllMigrations();
}

export function createIncident(input) {
  return diagnosticsEngine.createIncident(input);
}

export function getIncident(id) {
  return diagnosticsEngine.getIncident(id);
}

export function getAllIncidents() {
  return diagnosticsEngine.getAllIncidents();
}

export function updateIncident(id, updates) {
  return diagnosticsEngine.updateIncident(id, updates);
}

export function subscribeToDiagnostics(listener) {
  return diagnosticsEngine.subscribe(listener);
}

export { HEALTH_STATES, COMPONENT_TYPES, RECOVERY_ACTIONS };

export default diagnosticsEngine;