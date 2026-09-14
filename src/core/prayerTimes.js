/**
 * Prayer time + Hijri date calculation.
 *
 * Times follow the well-known astronomical method (PrayTimes
 * algorithm): sunrise/sunset from the solar geometry, and
 * Fajr/Isha from defined twilight angles.
 *
 * The times are computed locally and honestly: they are an
 * accurate estimate, but HEY advises confirming with your
 * local mosque or authority. Hijri dates use the arithmetic
 * (tabular) Islamic calendar and may differ by a day from
 * moon-sighting authorities.
 */

export const METHODS = {
  MWL: { name: "Muslim World League", fajr: 18, isha: 17, ishaMinutes: 0 },
  ISNA: { name: "Islamic Society of North America", fajr: 15, isha: 15, ishaMinutes: 0 },
  UQA: { name: "Umm al-Qura", fajr: 18.5, isha: 0, ishaMinutes: 90 },
  Karachi: { name: "University of Karachi", fajr: 18, isha: 18, ishaMinutes: 0 },
};

const HIJRI_MONTHS = [
  "Muharram", "Safar", "Rabi al-Awwal", "Rabi al-Thani",
  "Jumada al-Awwal", "Jumada al-Thani", "Rajab", "Sha'ban",
  "Ramadan", "Shawwal", "Dhu al-Qi'dah", "Dhu al-Hijjah",
];

function julian(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  let jd = (1461 * (year + 4800 + Math.trunc((month - 14) / 12))) / 4;
  jd += (367 * (month - 2 - 12 * Math.trunc((month - 14) / 12))) / 12;
  jd -= (3 * Math.trunc((year + 4900 + Math.trunc((month - 14) / 12)) / 100)) / 4;
  jd += day - 32075;
  return jd;
}

function sunPosition(jd) {
  const d = jd - 2451545.0;
  const g = norm360(357.529 + 0.98560028 * d);
  const q = norm360(280.459 + 0.98564736 * d);
  const l = norm360(q + 1.915 * Math.sin(radians(g)) + 0.02 * Math.sin(radians(2 * g)));
  const e = 23.439 - 0.00000036 * d;
  let ra = degrees(Math.atan2(Math.cos(radians(e)) * Math.sin(radians(l)), Math.cos(radians(l)))) / 15;
  const decl = degrees(Math.asin(Math.sin(radians(e)) * Math.sin(radians(l))));
  ra = fixHour(ra);
  const eqTime = q / 15 - fixHour(ra);
  return { decl, eqTime };
}

function norm360(value) {
  return ((value % 360) + 360) % 360;
}

function radians(value) {
  return (Math.PI / 180) * value;
}

function degrees(value) {
  return (180 / Math.PI) * value;
}

function fixHour(value) {
  return ((value + 24) % 24);
}

/** Midday / afternoon angle by angle method. */
function midDay(date) {
  const eqt = sunPosition(julian(date)).eqTime;
  return fixHour(12 - eqt);
}

function asrAngle(factor, date, lat) {
  const decl = sunPosition(julian(date)).decl;
  const t = Math.max(Math.tan(radians(Math.abs(lat - decl))), 0.0001);
  return degrees(Math.atan(1 / (factor + t)));
}

function asrTime(factor, date, lat, lon, tzHours) {
  const decl = sunPosition(julian(date)).decl;
  const elevation = asrAngle(factor, date, lat);
  const cosH = (Math.sin(radians(elevation)) - Math.sin(radians(decl)) * Math.sin(radians(lat))) /
    (Math.cos(radians(decl)) * Math.cos(radians(lat)));
  const hour = (1 / 15) * degrees(Math.acos(Math.max(-1, Math.min(1, cosH))));
  return fixHour(midDay(date) + hour + tzHours - lon / 15);
}

function sunAngleTime(angle, date, direction, lat, lon, tzHours) {
  const decl = sunPosition(julian(date)).decl;
  const noon = midDay(date);
  const t = (1 / 15) * degrees(
    Math.acos(
      (-Math.sin(radians(angle)) - Math.sin(radians(decl)) * Math.sin(radians(lat))) /
      (Math.cos(radians(decl)) * Math.cos(radians(lat))),
    ),
  );
  return fixHour(noon + (direction === "ccw" ? -t : t) + tzHours - lon / 15);
}

function intoDate(year, month, day, hour) {
  return new Date(year, month, day, Math.floor(hour), Math.round((hour - Math.floor(hour)) * 60), 0, 0);
}

/**
 * Compute the six daily prayer times.
 *
 * @param {Date} date local date to compute for
 * @param {{ lat: number, lon: number }} coords
 * @param {{ method?: keyof typeof METHODS, asr?: 1|2 }} options
 * @returns Array<{ name: string, time: Date, minutes: number }>
 */
export function computePrayerTimes(date, coords, options = {}) {
  const method = METHODS[options.method] || METHODS.MWL;
  const asrFactor = options.asr === 2 ? 2 : 1;
  const { lat, lon } = coords;
  const tzHours = new Date(0).getTimezoneOffset() / -60;

  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const dayDate = new Date(year, month, day, 12);

  const meanNoon = midDay(dayDate);

  const base = {
    fajr: sunAngleTime(method.fajr, dayDate, "ccw", lat, lon, tzHours),
    sunrise: sunAngleTime(0.833, dayDate, "ccw", lat, lon, tzHours),
    dhuhr: fixHour(meanNoon + tzHours - lon / 15),
    asr: asrTime(asrFactor, dayDate, lat, lon, tzHours),
    maghrib: sunAngleTime(0.833, dayDate, "cw", lat, lon, tzHours),
  };

  const ishaBase = method.ishaMinutes > 0
    ? base.maghrib + method.ishaMinutes / 60
    : sunAngleTime(method.isha, dayDate, "cw", lat, lon, tzHours);

  const times = {
    fajr: base.fajr,
    sunrise: base.sunrise,
    dhuhr: base.dhuhr,
    asr: base.asr,
    maghrib: base.maghrib,
    isha: ishaBase,
  };

  return [
    { name: "Fajr", time: intoDate(year, month, day, times.fajr) },
    { name: "Sunrise", time: intoDate(year, month, day, times.sunrise) },
    { name: "Dhuhr", time: intoDate(year, month, day, times.dhuhr) },
    { name: "Asr", time: intoDate(year, month, day, times.asr) },
    { name: "Maghrib", time: intoDate(year, month, day, times.maghrib) },
    { name: "Isha", time: intoDate(year, month, day, times.isha) },
  ];
}

/**
 * Next prayer and seconds until it starts.
 */
export function nextPrayer(times, now = new Date()) {
  const sorted = [...times].sort((a, b) => a.time - b.time);
  const next = sorted.find((entry) => entry.time > now) || null;
  const wait = next ? Math.max(0, Math.round((next.time - now) / 1000)) : null;
  return { next, wait };
}

/**
 * Arithmetic (tabular) Hijri conversion.
 * Returns { year, month, day, monthName }.
 */
const HIJRI_LEAP_YEARS = new Set([2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29]);

function hijriYearLength(yearInCycle) {
  return HIJRI_LEAP_YEARS.has(yearInCycle) ? 355 : 354;
}

/**
 * Arithmetic (tabular) Hijri conversion
 * (Kuwaiti-style 30-year cycle, civil epoch 16 July 622).
 * Returns { year, month, day, monthName }. May differ by a
 * day from moon-sighting authorities.
 */
export function toHijri(date) {
  const gy = date.getFullYear();
  const gm = date.getMonth() + 1;
  const gd = date.getDate();
  const jdn = Math.floor(julian(new Date(gy, gm - 1, gd, 12)));
  const days = jdn - 1948439;

  const cycle = Math.floor(days / 10631);
  let remaining = days - cycle * 10631;

  let yearIdx = 0;
  let acc = 0;
  for (let y = 0; y < 30; y += 1) {
    const length = hijriYearLength(y);
    if (remaining < acc + length) {
      yearIdx = y;
      break;
    }
    acc += length;
  }

  const monthLengths = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, HIJRI_LEAP_YEARS.has(yearIdx) ? 30 : 29];
  let doy = remaining - acc;
  let month = 1;
  for (let m = 0; m < 12; m += 1) {
    if (doy < monthLengths[m]) {
      month = m + 1;
      break;
    }
    doy -= monthLengths[m];
  }

  return {
    year: cycle * 30 + yearIdx + 1,
    month,
    day: doy + 1,
    monthName: HIJRI_MONTHS[month - 1],
  };
}

export function formatTime(date) {
  try {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default {
  METHODS,
  computePrayerTimes,
  nextPrayer,
  toHijri,
  formatTime,
  asrAngle,
};