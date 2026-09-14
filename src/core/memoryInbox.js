import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";
import { upsertMemoryNode } from "./memoryGraph.js";

const STORAGE_KEY = "hey_memory_inbox";
const AUTOAPPROVE_KEY = "hey_memory_autoapprove";
const MAX_PENDING = 100;
const DEFAULT_AUTOAPPROVE = false;

let memory = [];
let autoApproveOverride = null;

function storage() {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function save() {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(memory.slice(0, MAX_PENDING)));
  } catch (err) {
    recordAudit({ action: "memory.inbox.persist_failed", status: "failed", metadata: { reason: err.message } });
  }
}

function load() {
  const store = storage();
  if (!store) return;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) memory = parsed;
  } catch (err) {
    recordAudit({ action: "memory.inbox.load_failed", status: "failed", metadata: { reason: err.message } });
  }
}

export function isAutoApproveEnabled() {
  const store = storage();
  if (!store) return autoApproveOverride ?? DEFAULT_AUTOAPPROVE;
  return store.getItem(AUTOAPPROVE_KEY) === "1";
}

export function setAutoApproveEnabled(value) {
  const next = Boolean(value);
  autoApproveOverride = next;
  const store = storage();
  if (store) store.setItem(AUTOAPPROVE_KEY, next ? "1" : "0");
  publish("memory.inbox.setting.updated", { autoApprove: next });
  return next;
}

export function queueMemory({ value, type = "important", source = "assistant" } = {}) {
  const text = String(value ?? "").trim();
  if (!text) {
    return { pending: false, error: "A memory needs content before it can be queued." };
  }
  load();
  const item = {
    id: globalThis.crypto?.randomUUID?.() || `pending-${Date.now()}`,
    value: text,
    type,
    source,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  memory.unshift(item);
  save();
  publish("memory.inbox.pending", item);
  recordAudit({ action: "memory.gated", status: "pending", metadata: { memoryId: item.id, source } });
  return { pending: true, id: item.id, value: item.value, type, source };
}

export function listInbox() {
  load();
  return memory.filter((item) => item.status === "pending");
}

export function countPending() {
  return listInbox().length;
}

function consume(id) {
  load();
  const index = memory.findIndex((item) => item.id === id && item.status === "pending");
  if (index === -1) return null;
  const [item] = memory.splice(index, 1);
  save();
  return item;
}

export async function approveMemory(id, userId) {
  const item = consume(id);
  if (!item) {
    return { success: false, reason: "That pending memory no longer exists." };
  }

  let saved = false;
  try {
    const { addMemory } = await import("../lib/heyMemory.js");
    saved = await addMemory(userId, item.value, item.type === "preference" ? "preference" : "important");
  } catch (err) {
    recordAudit({ action: "memory.inbox.approve_backend_failed", status: "failed", metadata: { memoryId: id, reason: err.message } });
  }

  const { addImportantFact } = await import("./contextManager.js");
  addImportantFact({ fact: item.value, source: item.source, approvedAt: new Date() });
  upsertMemoryNode(item.value, { type: item.type, confidence: 1, id: item.id, approved: true });

  publish("memory.inbox.approved", { ...item, saved });
  recordAudit({ action: "memory.approved", status: "completed", metadata: { memoryId: id, persisted: saved } });
  return { success: true, id: item.id, backedUp: saved };
}

export function rejectMemory(id, reason = "rejected_by_user") {
  const item = consume(id);
  if (!item) {
    return { success: false, reason: "That pending memory no longer exists." };
  }
  publish("memory.inbox.rejected", { ...item, reason });
  recordAudit({ action: "memory.rejected", status: "completed", metadata: { memoryId: id, reason } });
  return { success: true, id: item.id };
}

export function clearInbox() {
  memory = memory.filter((item) => item.status !== "pending");
  save();
  publish("memory.inbox.cleared", {});
  return memory.length;
}

export default {
  isAutoApproveEnabled,
  setAutoApproveEnabled,
  queueMemory,
  listInbox,
  countPending,
  approveMemory,
  rejectMemory,
  clearInbox,
};