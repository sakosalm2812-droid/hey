const MAX_RECEIPT_DEPTH = 6;
const MAX_RECEIPT_NODES = 120;
const SECRET_FIELD = /(?:api[_-]?(?:key|token)|access[_-]?token|refresh[_-]?token|password|secret|authorization)/i;
const MAX_TEXT_LENGTH = 1_000;

function snapshotForDisplay(value, state, depth = 0, fieldName = "") {
  if (SECRET_FIELD.test(fieldName)) return "[redacted]";
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > MAX_TEXT_LENGTH ? `${value.slice(0, MAX_TEXT_LENGTH)}…[truncated]` : value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "undefined") return "[undefined]";
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value !== "object") return `[${typeof value}]`;
  if (depth >= MAX_RECEIPT_DEPTH) return "[depth limit]";
  if (state.seen.has(value)) return "[repeated reference]";
  if (state.nodes >= MAX_RECEIPT_NODES) return "[size limit]";

  state.seen.add(value);
  state.nodes += 1;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    const size = Math.min(value.length, MAX_RECEIPT_NODES - state.nodes);
    return Array.from({ length: size }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (!descriptor) return "[empty]";
      if (!Object.hasOwn(descriptor, "value")) return "[unavailable]";
      return snapshotForDisplay(descriptor.value, state, depth + 1, String(index));
    });
  }

  const output = {};
  const keys = Object.keys(descriptors).filter((key) => descriptors[key].enumerable).slice(0, MAX_RECEIPT_NODES - state.nodes);
  for (const key of keys) {
    const descriptor = descriptors[key];
    output[key] = Object.hasOwn(descriptor, "value")
      ? snapshotForDisplay(descriptor.value, state, depth + 1, key)
      : "[unavailable]";
  }
  return output;
}

export function formatToolLibraryReceipt(value) {
  try {
    const snapshot = snapshotForDisplay(value, { seen: new WeakSet(), nodes: 0 });
    const serialized = JSON.stringify(snapshot, null, 2);
    return typeof serialized === "string" ? serialized.slice(0, 4_000) : "No result data was returned.";
  } catch {
    return "HEY received result data that could not be displayed safely.";
  }
}

export function scopeToolLibraryRecord(accountId, record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const normalizedAccountId = typeof accountId === "string" && accountId ? accountId : null;
  const scoped = {};
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(record))) {
    if (!descriptor.enumerable || key === "accountId") continue;
    scoped[key] = Object.hasOwn(descriptor, "value") ? descriptor.value : "[unavailable]";
  }
  scoped.accountId = normalizedAccountId;
  return Object.freeze(scoped);
}

export function isToolLibraryRecordVisible(record, accountId, activeScope) {
  return Boolean(
    record && typeof accountId === "string" && accountId &&
    record.accountId === accountId && activeScope === `account:${accountId}`,
  );
}
