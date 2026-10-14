const PRIORITY = Object.freeze({ low: 0, normal: 1, high: 2, critical: 3 });

function localClockParts(date, timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce((parts, item) => {
    if (item.type === "hour") parts.hour = Number(item.value);
    if (item.type === "minute") parts.minute = Number(item.value);
    return parts;
  }, {});
}

function parseClock(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function isWithinQuietHours(now, quietHours, timeZone = "UTC") {
  if (!quietHours || typeof quietHours !== "object") return false;
  const start = parseClock(quietHours.start);
  const end = parseClock(quietHours.end);
  if (start === null || end === null || start === end) return false;
  try {
    const clock = localClockParts(now, timeZone);
    const minute = clock.hour * 60 + clock.minute;
    return start > end ? minute >= start || minute < end : minute >= start && minute < end;
  } catch {
    return true;
  }
}

/** Pure policy gate for a suggestion. It never authorizes or executes an action. */
export function evaluateAttentionCandidate(candidate, context = {}) {
  const now = context.now instanceof Date ? context.now : new Date(context.now ?? Date.now());
  const priority = String(candidate?.priority || "normal").toLowerCase();
  const priorityValue = PRIORITY[priority];
  if (!candidate || typeof candidate !== "object" || priorityValue === undefined) {
    return { decision: "suppress", reason: "invalid_candidate", priority: "low", redact: true };
  }
  const hasExpiry = candidate.expiresAt !== undefined && candidate.expiresAt !== null;
  const expiresAt = hasExpiry ? Date.parse(candidate.expiresAt) : Infinity;
  if (!Number.isFinite(now.getTime())) return { decision: "suppress", reason: "invalid_policy_context", priority, redact: true };
  if (hasExpiry && !Number.isFinite(expiresAt)) return { decision: "suppress", reason: "invalid_expiry", priority, redact: true };
  if (expiresAt <= now.getTime()) return { decision: "suppress", reason: "expired", priority, redact: true };
  const minimumConfidence = context.minimumConfidence ?? 0.65;
  const maxInterruptionCost = context.maxInterruptionCost ?? 0.8;
  const dailyCap = context.dailyCap;
  const suggestionsToday = context.suggestionsToday ?? 0;
  if (
    !Number.isFinite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 1 ||
    !Number.isFinite(maxInterruptionCost) || maxInterruptionCost < 0 || maxInterruptionCost > 1 ||
    (dailyCap !== undefined && (!Number.isSafeInteger(dailyCap) || dailyCap < 0)) ||
    !Number.isSafeInteger(suggestionsToday) || suggestionsToday < 0
  ) return { decision: "suppress", reason: "invalid_policy_context", priority, redact: true };
  if (context.mode === "off" || context.mode === "quiet") {
    if (priorityValue < PRIORITY.critical) return { decision: "suppress", reason: "proactivity_disabled", priority, redact: true };
  }
  if (dailyCap !== undefined && suggestionsToday >= dailyCap && priorityValue < PRIORITY.critical) {
    return { decision: "suppress", reason: "attention_budget_exhausted", priority, redact: true };
  }
  const confidence = Number(candidate.confidence);
  if (candidate.sponsored === true) return { decision: "suppress", reason: "sponsored_proactivity_forbidden", priority, redact: true };
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1 || confidence < minimumConfidence) {
    return { decision: "ask", reason: "low_confidence", priority, redact: candidate.privacy === "private" };
  }
  const inQuietHours = isWithinQuietHours(now, context.quietHours, context.timeZone || "UTC");
  const focus = ["focus", "school", "meeting", "presenting", "driving", "sleep", "gaming"].includes(context.activity);
  const interruptionCost = Number.isFinite(Number(candidate.interruptionCost)) ? Number(candidate.interruptionCost) : 0.5;
  if (interruptionCost < 0 || interruptionCost > 1) return { decision: "suppress", reason: "invalid_interruption_cost", priority, redact: true };
  if ((inQuietHours || focus) && priorityValue < PRIORITY.critical) {
    return { decision: "queue", reason: inQuietHours ? "quiet_hours" : "focus_context", priority, redact: candidate.privacy === "private" };
  }
  if (interruptionCost > maxInterruptionCost && priorityValue < PRIORITY.critical) {
    return { decision: "queue", reason: "interruption_cost", priority, redact: candidate.privacy === "private" };
  }
  return { decision: "surface", reason: "policy_allowed", priority, redact: candidate.privacy === "private" && context.sharedSurface === true };
}

export default { isWithinQuietHours, evaluateAttentionCandidate };
