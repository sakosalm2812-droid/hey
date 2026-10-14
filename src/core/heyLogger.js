import { subscribe } from "./eventBus.js";

const LOG_KEY_PREFIX = "hey_log:";
const MAX_ENTRIES = 200;
let activeScope = "anonymous";

function scopeKey(scope = activeScope) {
  return `${LOG_KEY_PREFIX}${encodeURIComponent(String(scope || "anonymous"))}`;
}

function readLog(scope = activeScope) {
  try {
    const raw = localStorage.getItem(scopeKey(scope));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLog(entries, scope = activeScope) {
  try {
    localStorage.setItem(scopeKey(scope), JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* storage unavailable */
  }
}

export function log(kind, message, data) {
  const entry = {
    at: new Date().toISOString(),
    kind,
    message: String(message || ""),
    data: data == null ? null : data,
  };
  const next = [...readLog(), entry].slice(-MAX_ENTRIES);
  writeLog(next);
  return entry;
}

/** Keep local diagnostic history separate when people share a browser profile. */
export function setLogScope(accountId) {
  const nextScope = accountId ? `account:${accountId}` : "anonymous";
  if (nextScope === activeScope) return;
  activeScope = nextScope;
  try {
    window.dispatchEvent(new CustomEvent("hey:log-scope-changed", { detail: { scope: nextScope } }));
  } catch {
    /* Scope changes still take effect when DOM events are unavailable. */
  }
}

export function getLogScope() {
  return activeScope;
}

export function getLog() {
  return readLog();
}

export function clearLog() {
  writeLog([]);
}

export function downloadLog() {
  const lines = readLog().map((entry) => `[${entry.at}] ${entry.kind} ${entry.message}${entry.data ? ` ${JSON.stringify(entry.data)}` : ""}`);
  try {
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hey-log-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    /* download unavailable */
  }
}

let booted = false;

const EVENT_LABELS = {
  "execution.request.started": "execution:request_started",
  "execution.request.completed": "execution:request_completed",
  "execution.request.failed": "execution:request_failed",
  "execution.step.permission_required": "execution:permission_required",
  "execution.step.completed": "execution:step_completed",
  "permission.updated": "permissions:updated",
  "memory.node.updated": "memory:node_updated",
  "memory.edge.created": "memory:edge_created",
  "action.updated": "actions:updated",
  "vision.capture.started": "vision:capture_started",
  "vision.capture.completed": "vision:capture_completed",
  "notification.updated": "notifications:updated",
  "audit.recorded": "audit:recorded",
};

export function bootLogger() {
  if (booted) return () => {};
  booted = true;
  let pending = [];
  let timer = null;

  function flush() {
    const snapshot = pending;
    pending = [];
    if (snapshot.length === 0) return;
    const byScope = new Map();
    for (const entry of snapshot) {
      const group = byScope.get(entry.scope) || [];
      group.push(entry.value);
      byScope.set(entry.scope, group);
    }
    for (const [scope, scopedEntries] of byScope) {
      writeLog([...readLog(scope), ...scopedEntries].slice(-MAX_ENTRIES), scope);
    }
  }

  const stops = Object.entries(EVENT_LABELS).map(([eventName, label]) =>
    subscribe(eventName, (payload) => {
      // Event payloads may contain prompts, transcripts, or memory values. Keep
      // the diagnostic stream useful without persisting user content.
      const safeData = {};
      for (const key of ["requestId", "actionId", "stepId", "tool", "status", "riskLevel", "verified"]) {
        const value = payload?.[key];
        if (["string", "number", "boolean"].includes(typeof value)) safeData[key] = value;
      }
      pending.push({ scope: activeScope, value: {
        at: new Date().toISOString(), kind: label, message: label,
        data: Object.keys(safeData).length ? safeData : null,
      } });
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, 1500);
    }),
  );

  return () => {
    stops.forEach((stop) => stop());
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    booted = false;
  };
}

export default {
  log,
  getLog,
  clearLog,
  downloadLog,
  bootLogger,
};
