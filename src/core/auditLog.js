import { publish } from "./eventBus.js";

const entries = [];

export function recordAudit(entry) {
  const auditEntry = {
    id: crypto.randomUUID(),
    action: entry.action || "unknown",
    tool: entry.tool || null,
    riskLevel: entry.riskLevel || "low",
    status: entry.status || "completed",
    requestId: entry.requestId || null,
    metadata: entry.metadata || {},
    createdAt: new Date(),
  };
  entries.unshift(auditEntry);
  publish("audit.recorded", auditEntry);
  return auditEntry;
}

export function listAuditEntries(limit = 100) {
  return entries.slice(0, Math.max(0, limit));
}

export function restoreAuditEntries(persisted = []) {
  if (!Array.isArray(persisted)) return;

  const restored = persisted.map((entry) => ({
    id: entry.id || crypto.randomUUID(),
    action: entry.action || "unknown",
    tool: entry.tool || null,
    riskLevel: entry.riskLevel || entry.risk_level || "low",
    status: entry.status || "completed",
    requestId: entry.requestId || entry.request_id || null,
    metadata: entry.metadata || {},
    createdAt: entry.createdAt
      ? new Date(entry.createdAt)
      : new Date(entry.created_at || Date.now()),
  }));

  for (const entry of restored.reverse()) {
    entries.unshift(entry);
  }

  const MAX_RESTORED = 2000;
  if (entries.length > MAX_RESTORED) {
    entries.length = MAX_RESTORED;
  }
}

export function clearAuditEntries() {
  entries.length = 0;
}

export default { recordAudit, listAuditEntries, restoreAuditEntries, clearAuditEntries };
