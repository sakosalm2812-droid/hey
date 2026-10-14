const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

function parseDate(value, field) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) throw new TypeError(field + " must be a valid ISO date/time.");
  return date;
}

function timeParts(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new TypeError("schedule.time must use 24-hour HH:mm format.");
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function formatterFor(timeZone) {
  if (typeof timeZone !== "string" || !timeZone.trim()) throw new TypeError("Recurring schedules require an IANA timeZone.");
  return new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function localParts(date, formatter) {
  const parts = Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

function sameMinute(a, b) {
  return a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour && a.minute === b.minute;
}

function candidatesForLocalMinute(dateParts, timeZone, formatter) {
  const target = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, dateParts.hour, dateParts.minute);
  const offsets = new Set();
  // Collect offsets on both sides of DST transitions so ambiguous fall-back
  // times can be resolved and nonexistent spring-forward times detected.
  for (let delta = -36 * 60; delta <= 36 * 60; delta += 180) {
    const instant = target + delta * MINUTE_MS;
    const parts = localParts(new Date(instant), formatter);
    const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    offsets.add(localAsUtc - Math.floor(instant / 1000) * 1000);
  }
  return [...offsets].map((offset) => new Date(target - offset)).filter((candidate) => sameMinute(localParts(candidate, formatter), dateParts)).sort((a, b) => a - b);
}

function localMinuteToDate(dateParts, timeZone, formatter, after) {
  let cursor = { ...dateParts };
  for (let skipped = 0; skipped <= 180; skipped += 1) {
    const candidates = candidatesForLocalMinute(cursor, timeZone, formatter);
    if (candidates.length) return candidates.find((candidate) => candidate > after) || null;
    // Spring-forward gaps have no instant for the requested wall-clock time.
    // Move forward to the first real local minute instead of silently shifting
    // by an implementation-dependent UTC offset.
    const next = new Date(Date.UTC(cursor.year, cursor.month - 1, cursor.day, cursor.hour, cursor.minute + 1));
    cursor = { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: next.getUTCHours(), minute: next.getUTCMinutes() };
  }
  return null;
}

function addLocalDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function dateMatches(schedule, date) {
  if (schedule.type === "weekly") {
    const days = schedule.daysOfWeek;
    if (!Array.isArray(days) || days.length === 0 || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new TypeError("Weekly schedules require daysOfWeek with values 0 (Sunday) through 6 (Saturday).");
    }
    const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
    return days.includes(weekday);
  }
  if (schedule.type === "monthly") {
    if (!Number.isInteger(schedule.dayOfMonth) || schedule.dayOfMonth < 1 || schedule.dayOfMonth > 31) {
      throw new TypeError("Monthly schedules require dayOfMonth from 1 through 31.");
    }
    return date.day === schedule.dayOfMonth;
  }
  return true;
}

export function calculateNextRun(schedule, after = new Date()) {
  if (!schedule || typeof schedule !== "object") throw new TypeError("A schedule definition is required.");
  const afterDate = after instanceof Date ? new Date(after) : parseDate(after, "after");
  if (!Number.isFinite(afterDate.getTime())) throw new TypeError("after must be a valid date.");
  const type = schedule.type || schedule.frequency;

  if (type === "once") {
    const run = parseDate(schedule.at || schedule.startAt, "schedule.at");
    return run > afterDate && (!schedule.endAt || run <= parseDate(schedule.endAt, "schedule.endAt")) ? run : null;
  }
  if (type === "interval") {
    const intervalMs = Number.isFinite(schedule.intervalMs) ? schedule.intervalMs : Number(schedule.intervalMinutes) * MINUTE_MS;
    if (!Number.isFinite(intervalMs) || intervalMs < MINUTE_MS || intervalMs > 366 * DAY_MS) throw new TypeError("Interval schedules require intervalMinutes or intervalMs between one minute and one year.");
    const anchor = schedule.startAt ? parseDate(schedule.startAt, "schedule.startAt") : afterDate;
    const steps = Math.max(0, Math.floor((afterDate.getTime() - anchor.getTime()) / intervalMs) + 1);
    const run = new Date(anchor.getTime() + steps * intervalMs);
    return !schedule.endAt || run <= parseDate(schedule.endAt, "schedule.endAt") ? run : null;
  }
  if (!["daily", "weekly", "monthly"].includes(type)) throw new TypeError("Schedule type must be once, interval, daily, weekly, or monthly.");

  const formatter = formatterFor(schedule.timeZone);
  const clock = timeParts(schedule.time);
  const startAt = schedule.startAt ? parseDate(schedule.startAt, "schedule.startAt") : null;
  const endAt = schedule.endAt ? parseDate(schedule.endAt, "schedule.endAt") : null;
  if (startAt && endAt && endAt < startAt) throw new TypeError("schedule.endAt must be after startAt.");
  const nowLocal = localParts(afterDate, formatter);
  let date = { year: nowLocal.year, month: nowLocal.month, day: nowLocal.day };

  for (let offset = 0; offset <= 370; offset += 1) {
    if (dateMatches({ ...schedule, type }, date)) {
      const candidate = localMinuteToDate({ ...date, ...clock }, schedule.timeZone, formatter, afterDate);
      if (candidate && (!startAt || candidate >= startAt) && (!endAt || candidate <= endAt)) return candidate;
    }
    date = addLocalDays(date, 1);
  }
  return null;
}
