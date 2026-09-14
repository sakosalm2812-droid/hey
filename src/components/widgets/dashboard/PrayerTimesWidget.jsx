import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { springs, press } from "../../../lib/heyMotion";
import { buzz } from "../../../lib/heyFeedback";
import { Bell, BellRing, MapPin, Moon, RefreshCw } from "lucide-react";
import { notify } from "../../../core/notificationCenter.js";
import { computePrayerTimes, nextPrayer, toHijri, formatTime } from "../../../core/prayerTimes.js";

const COORDS_KEY = "hey_prayer_coords";
const METHOD_KEY = "hey_prayer_method";
const REMINDER_KEY = "hey_prayer_reminder";

const DEFAULT_COORDS = { lat: 21.3891, lon: 39.8579, label: "Makkah" };

const METHODS = [
  { id: "MWL", label: "Muslim World League" },
  { id: "ISNA", label: "ISNA (North America)" },
  { id: "UQA", label: "Umm al-Qura (Makkah)" },
  { id: "KARACHI", label: "University of Karachi" },
];

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

function countdown(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function PrayerTimesWidget() {
  const [coords, setCoords] = useState(() => readJson(COORDS_KEY, null) || { ...DEFAULT_COORDS });
  const [method, setMethod] = useState(() => localStorage.getItem(METHOD_KEY) || "MWL");
  const [reminder, setReminder] = useState(() => localStorage.getItem(REMINDER_KEY) === "1");
  const [permission, setPermission] = useState(() =>
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );
  const [locating, setLocating] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const notified = useRef(new Set());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const times = useMemo(() => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    return computePrayerTimes(today, { lat: coords.lat, lon: coords.lon }, { method });
  }, [now, method, coords.lat, coords.lon]);

  const hijri = useMemo(() => toHijri(now), [now]);

  const tomorrowTimes = useMemo(() => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
    return computePrayerTimes(day, { lat: coords.lat, lon: coords.lon }, { method });
  }, [now, method, coords.lat, coords.lon]);

  const { next, wait, isTomorrow } = useMemo(() => {
    const result = nextPrayer(times, now);
    if (result.next) return { next: result.next, wait: result.wait, isTomorrow: false };
    const fajr = tomorrowTimes[0];
    return { next: fajr, wait: Math.max(0, Math.round((fajr.time - now) / 1000)), isTomorrow: true };
  }, [now, times, tomorrowTimes]);

  useEffect(() => {
    if (!reminder) return;
    if (wait == null || wait > 610 || wait < 60) return;
    const key = `${next?.name}-${next?.time?.toDateString()}`;
    if (notified.current.has(key)) return;
    notified.current.add(key);

    if (permission === "granted" && typeof Notification !== "undefined") {
      try {
        new Notification(`${next.name} in 10 minutes`, {
          body: `Salaah at ${formatTime(next.time)} — take a moment to prepare.`,
        });
      } catch {
        /* older browsers / permission race */
      }
    }
    notify({
      id: `prayer-reminder-${key}`,
      category: "info",
      priority: 2,
      title: `${next.name} in 10 minutes`,
      body: `Salaah at ${formatTime(next.time)} — take a moment to prepare.`,
      path: "/dashboard",
    });
  }, [reminder, wait, next?.name, next?.time, permission]);

  function locate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const fresh = {
          lat: Number(position.coords.latitude.toFixed(4)),
          lon: Number(position.coords.longitude.toFixed(4)),
          label: "Current location",
        };
        setCoords(fresh);
        writeJson(COORDS_KEY, fresh);
        buzz("light");
      },
      () => setLocating(false),
      { timeout: 10000, maximumAge: 600000 },
    );
  }

  function toggleReminder() {
    const nextValue = !reminder;
    if (nextValue && typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().then((result) => {
        setPermission(result);
        if (result !== "granted") return;
        setReminder(true);
        localStorage.setItem(REMINDER_KEY, "1");
        buzz("light");
      });
      return;
    }
    setReminder(nextValue);
    localStorage.setItem(REMINDER_KEY, nextValue ? "1" : "0");
    if (nextValue) buzz("light");
  }

  function changeMethod(event) {
    const value = event.target.value;
    setMethod(value);
    localStorage.setItem(METHOD_KEY, value);
    notified.current.clear();
  }

  return (
    <motion.div
      className="glass-card h-full p-6 flex flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, transition: springs.gentle }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="badge mb-3 flex w-fit items-center gap-2" style={{ color: "var(--gold)" }}>
            <Moon size={14} />
            Prayer Times
          </div>
          <h2 className="font-heading text-2xl">Fajr to Isha</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {hijri.day} {hijri.monthName} {hijri.year} AH
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            <MapPin size={12} />
            <span>{coords.label}</span>
          </div>
          <motion.button
            type="button"
            onClick={locate}
            className="hey-btn-ghost flex items-center gap-2 text-xs py-1 px-3"
            whileHover={{ scale: 1.02, transition: springs.snappy }}
            whileTap={{ scale: 0.97, transition: press }}
            onPointerDown={() => buzz("light")}
          >
            <RefreshCw size={12} className={locating ? "hey-spin" : ""} />
            {locating ? "Locating…" : "Use my location"}
          </motion.button>
        </div>
      </div>

      <div className="mt-5 rounded-2xl p-4 text-center" style={{ background: "color-mix(in srgb, var(--gold) 10%, transparent)" }}>
        <div className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">
          {isTomorrow ? "Next prayer · tomorrow" : "Next prayer"}
        </div>
        <div className="font-heading text-4xl mt-1" style={{ color: "var(--gold)" }}>{next?.name}</div>
        <div className="text-2xl font-semibold mt-1 tabular-nums">
          {wait != null ? countdown(wait) : "—:—"}
        </div>
        <div className="text-sm text-[var(--text-secondary)] mt-1">at {formatTime(next?.time)}</div>
      </div>

      <ul className="mt-5 flex flex-col gap-1.5 text-sm">
        {times.map((entry) => {
          const active = next?.name === entry.name && !isTomorrow;
          return (
            <li
              key={entry.name}
              className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                active ? "font-semibold" : "text-[var(--text-secondary)]"
              }`}
              style={active ? { background: "color-mix(in srgb, var(--gold) 12%, transparent)", color: "var(--gold)" } : undefined}
            >
              <span>{entry.name}</span>
              <span className="tabular-nums">{formatTime(entry.time)}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            role="switch"
            aria-checked={reminder}
            aria-label="Remind me 10 minutes before each prayer"
            onClick={toggleReminder}
            style={{
              width: 52,
              height: 28,
              flexShrink: 0,
              padding: 0,
              borderRadius: 999,
              border: "none",
              background: reminder ? "var(--green-primary)" : "rgba(255,255,255,.15)",
              cursor: "pointer",
              transition: ".25s",
            }}
          >
            <span
              style={{
                display: "block",
                width: 22,
                height: 22,
                margin: 3,
                borderRadius: "50%",
                background: "white",
                transform: reminder ? "translateX(24px)" : "translateX(0)",
                transition: ".25s",
              }}
            />
          </button>
          {reminder ? <BellRing size={14} /> : <Bell size={14} />}
          &nbsp;10-minute reminder
        </div>
        <select
          value={method}
          onChange={changeMethod}
          aria-label="Calculation method"
          className="hey-input !h-8 !w-auto text-xs px-2 py-1"
        >
          {METHODS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
        Times are astronomical estimates for your area. Confirm with your local mosque;
        the Hijri date is a tabular approximation and may differ by a day from moon-sighting.
      </p>
    </motion.div>
  );
}