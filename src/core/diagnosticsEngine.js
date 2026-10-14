import { disableWorkflow, getWorkflow } from "./automationEngine.js";
import { getArtifact, getVersion, restoreVersion } from "./artifactEngine.js";

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

const RECOVERY_ADAPTERS = new Map();
const HEALTH_CHECKERS = new Map();

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

const SENSITIVE_CONTEXT_KEY = /(?:prompt|transcript|content|message|body|query|email|phone|address|location|health|medical|finance|ssn|biometric|secret|password|token|credential|api.?key|authorization|cookie|private|sensitive)/i;
const SAFE_CONTEXT_KEYS = new Set([
  "requestid", "traceid", "spanid", "component", "operation", "provider", "providerid",
  "status", "statuscode", "errorcode", "retrycount", "attempt", "attemptid", "workflowid",
  "missionid", "tool", "capability", "capabilityid", "durationms", "nested",
]);

function ownDataValue(value, key) {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return undefined;
  try {
    return Object.getOwnPropertyDescriptor(value, key)?.value;
  } catch {
    return undefined;
  }
}

function safeIsArray(value) {
  try {
    return Array.isArray(value);
  } catch {
    return true;
  }
}

function redactDiagnosticText(value, limit = 2000) {
  if (typeof value !== "string") return "[unavailable]";
  return value
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, "[REDACTED PRIVATE KEY]")
    .replace(/\b(Bearer|Basic)\s+[^\s"'<>]+/gi, "$1 [REDACTED]")
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/gi, "[REDACTED API KEY]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED TOKEN]")
    .replace(/\b(password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|cookie)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[REDACTED]")
    .replace(/([?&](?:token|key|secret|password|code|auth)=)[^&#\s]+/gi, "$1[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED EMAIL]")
    .replace(/\b\d{7,}\b/g, "[REDACTED NUMBER]")
    .slice(0, limit);
}

function sanitizeDiagnosticContext(value, seen = new WeakSet(), depth = 0) {
  if (typeof value === "string") return redactDiagnosticText(value, 500);
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value !== "object") return `[${typeof value}]`;
  if (depth >= 4) return "[maximum depth]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (safeIsArray(value)) {
    const result = value.slice(0, 20).map((item) => sanitizeDiagnosticContext(item, seen, depth + 1));
    if (value.length > 20) result.push("[truncated]");
    return result;
  }

  const result = {};
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return "[unavailable]";
  }
  for (const [key, descriptor] of Object.entries(descriptors).slice(0, 32)) {
    if (!("value" in descriptor)) continue;
    const safeKey = redactDiagnosticText(key, 80);
    result[safeKey] = SENSITIVE_CONTEXT_KEY.test(key) || !SAFE_CONTEXT_KEYS.has(key.toLowerCase())
      ? "[REDACTED]"
      : sanitizeDiagnosticContext(descriptor.value, seen, depth + 1);
  }
  return result;
}

class DiagnosticsEngine {
  constructor({ storage = globalThis.localStorage } = {}) {
    this.storage = storage;
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
      const stored = this.storage?.getItem("hey_diagnostics");
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
      this.storage?.setItem("hey_diagnostics", JSON.stringify({
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
    const timer = setInterval(() => this.runAllHealthChecks(), 60000);
    // Diagnostics must not keep Node-based tests or server-side rendering alive.
    timer.unref?.();
    return timer;
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
      check.state = result?.healthy === true ? HEALTH_STATES.HEALTHY : HEALTH_STATES.DEGRADED;
      check.details = result?.details || { verification: "unavailable" };
      check.nextAction = result?.nextAction || (result?.healthy ? null : "investigate");
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

  async checkComponent(component) {
    const checker = HEALTH_CHECKERS.get(component);
    if (!checker) {
      return { healthy: false, details: { verification: "unconfigured" }, nextAction: "configure_health_check" };
    }
    const result = await checker();
    return result && typeof result.healthy === "boolean"
      ? result
      : { healthy: false, details: { verification: "invalid_checker_result" }, nextAction: "investigate" };
  }

  registerHealthChecker(component, checker) {
    if (!Object.values(COMPONENT_TYPES).includes(component)) throw new TypeError(`Unsupported health component: ${component}`);
    if (typeof checker !== "function") throw new TypeError("A health checker must be a function.");
    HEALTH_CHECKERS.set(component, checker);
    return () => {
      if (HEALTH_CHECKERS.get(component) === checker) HEALTH_CHECKERS.delete(component);
    };
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

  recordError(input = {}) {
    const errorId = generateErrorId();
    const sourceError = ownDataValue(input, "error");
    const rawMessage = typeof sourceError === "string"
      ? sourceError
      : ownDataValue(sourceError, "message");
    const rawCode = ownDataValue(sourceError, "code");
    const safeCode = (typeof rawCode === "string" || typeof rawCode === "number") && /^[A-Za-z0-9_.-]{1,64}$/.test(String(rawCode))
      ? String(rawCode)
      : null;
    const rawStack = ownDataValue(sourceError, "stack");
    const stackLines = typeof rawStack === "string" ? rawStack.split("\n") : [];
    if (stackLines[0] && typeof rawMessage === "string" && stackLines[0].includes(rawMessage)) stackLines.shift();
    const safeError = {
      name: redactDiagnosticText(ownDataValue(sourceError, "name") || "Error", 100),
      code: safeCode,
      // Exception messages are untrusted free-form text and can contain user
      // content. Keep machine diagnostics while omitting that text entirely.
      message: safeCode ? `${redactDiagnosticText(ownDataValue(sourceError, "name") || "Error", 100)} (${safeCode})` : "Error details redacted",
      stack: stackLines.slice(0, 30).map((line) => redactDiagnosticText(line, 300)).join("\n").slice(0, 4000),
    };
    const fingerprint = this.generateFingerprint(safeError);
    const sourceContext = ownDataValue(input, "context");
    const safeContext = sourceContext == null
      ? {}
      : sourceContext && typeof sourceContext === "object" && !safeIsArray(sourceContext)
        ? sanitizeDiagnosticContext(sourceContext)
        : "[REDACTED]";
    
    const error = {
      id: errorId,
      fingerprint,
      name: safeError.name,
      code: safeError.code,
      message: safeError.message,
      stack: safeError.stack,
      context: safeContext,
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
    const msg = redactDiagnosticText(ownDataValue(error, "message") || "Diagnostic error details unavailable.", 500);
    const stack = redactDiagnosticText(ownDataValue(error, "stack") || "", 500);
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
      const adapter = RECOVERY_ADAPTERS.get(input.action);
      if (!Object.values(RECOVERY_ACTIONS).includes(input.action)) {
        throw new Error(`Unsupported recovery action: ${String(input.action)}`);
      }
      if (!adapter || typeof adapter.run !== "function" || typeof adapter.verify !== "function") {
        attempt.state = "blocked";
        attempt.error = `No verified recovery adapter is configured for ${input.action}.`;
      } else {
        const operation = await adapter.run(input.target, input);
        const verification = await adapter.verify(input.target, operation, input);
        if (!verification || verification.verified !== true) {
          throw new Error(verification?.reason || "Recovery postcondition was not verified.");
        }
        attempt.state = "completed";
        attempt.success = true;
        attempt.details = { operation, verification };
      }
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

  registerRecoveryAdapter(action, adapter) {
    if (!Object.values(RECOVERY_ACTIONS).includes(action)) throw new TypeError(`Unsupported recovery action: ${action}`);
    if (!adapter || typeof adapter.run !== "function" || typeof adapter.verify !== "function") {
      throw new TypeError("A recovery adapter requires run and independent verify functions.");
    }
    RECOVERY_ADAPTERS.set(action, adapter);
    return () => {
      if (RECOVERY_ADAPTERS.get(action) === adapter) RECOVERY_ADAPTERS.delete(action);
    };
  }

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

export { DiagnosticsEngine };
export const diagnosticsEngine = new DiagnosticsEngine();

diagnosticsEngine.registerRecoveryAdapter("pause_workflow", {
  run: async (target) => {
    const workflowId = typeof target === "string" ? target : target?.workflowId;
    if (!workflowId) throw new TypeError("pause_workflow requires a workflowId.");
    const workflow = disableWorkflow(workflowId);
    if (!workflow || workflow.error) throw new Error(workflow?.error || "Workflow could not be disabled.");
    return { workflowId };
  },
  verify: async (_target, operation) => {
    const workflow = getWorkflow(operation.workflowId);
    return workflow?.state === "disabled"
      ? { verified: true, evidence: { workflowId: workflow.id, state: workflow.state, disabledAt: workflow.disabledAt } }
      : { verified: false, reason: "Workflow is not disabled after the recovery operation." };
  },
});

diagnosticsEngine.registerRecoveryAdapter("restore_version", {
  run: async (target) => {
    const artifactId = target?.artifactId;
    const versionId = target?.versionId;
    if (!artifactId || !versionId) throw new TypeError("restore_version requires artifactId and versionId.");
    await restoreVersion(artifactId, versionId);
    return { artifactId, versionId };
  },
  verify: async (_target, operation) => {
    const [artifact, version] = await Promise.all([
      getArtifact(operation.artifactId),
      getVersion(operation.artifactId, operation.versionId),
    ]);
    const sameContent = artifact && version && JSON.stringify(artifact.content) === JSON.stringify(version.content);
    return sameContent
      ? { verified: true, evidence: { artifactId: artifact.id, versionId: version.id, contentMatched: true } }
      : { verified: false, reason: "Restored artifact content does not match the selected version." };
  },
});

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

export function registerRecoveryAdapter(action, adapter) {
  return diagnosticsEngine.registerRecoveryAdapter(action, adapter);
}

export function registerHealthChecker(component, checker) {
  return diagnosticsEngine.registerHealthChecker(component, checker);
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
