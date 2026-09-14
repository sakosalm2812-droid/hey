import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { springs, press } from "../../lib/heyMotion";
import { buzz } from "../../lib/heyFeedback";
import { useAuth } from "../../AuthContext.jsx";
import { createRecord, listRecords } from "../../lib/heyRecords.js";
import CalendarEvent from "./CalendarEvent";
import { toHijri } from "../../core/prayerTimes.js";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dateToISO(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayISO() {
  const now = new Date();
  return dateToISO(now.getFullYear(), now.getMonth(), now.getDate());
}

function eventDateISO(event) {
  const explicit = event.metadata?.date;
  if (typeof explicit === "string" && /^\d{4}-\d{2}-\d{2}/.test(explicit)) return explicit.slice(0, 10);
  const content = typeof event.content === "string" ? event.content : "";
  const match = content.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

export default function CalendarMonth() {
  const { user } = useAuth();
  const today = new Date();
  const [cursor, setCursor] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() }));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => todayISO());
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [type, setType] = useState("Planning");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) {
        setEvents([]);
        setLoading(false);
        return;
      }
      try {
        const records = await listRecords(user.id, "event");
        if (!cancelled) setEvents(records);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const eventsByDate = useMemo(() => {
    const map = {};
    events.forEach((event) => {
      const iso = eventDateISO(event);
      if (!iso) return;
      if (!map[iso]) map[iso] = [];
      map[iso].push(event);
    });
    return map;
  }, [events]);

  const unscheduled = useMemo(
    () => events.filter((event) => !eventDateISO(event)),
    [events],
  );

  const { year, month } = cursor;
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);

  const selectedEvents = eventsByDate[selected] || [];
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(first);

  function move(delta) {
    const next = new Date(year, month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  }

  function goToday() {
    setCursor({ year: today.getFullYear(), month: today.getMonth() });
    setSelected(todayISO());
  }

  async function addEvent(event) {
    event.preventDefault();
    if (!user || !title.trim()) return;
    const iso = selected || todayISO();
    setError("");
    try {
      const savedEvent = await createRecord(user.id, "event", {
        title: title.trim(),
        content: time.trim() || iso,
        metadata: { type, date: iso },
      });
      setEvents((current) => [savedEvent, ...current]);
      setTitle("");
      setTime("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  return (
    <div className="hey-calendar-month">
      <div className="hey-calendar-toolbar">
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            className="hey-btn-ghost"
            onClick={() => move(-1)}
            onPointerDown={() => buzz("light")}
            whileHover={{ scale: 1.02, transition: springs.snappy }}
            whileTap={{ scale: 0.97, transition: press }}
            aria-label="Previous month"
          >
            ←
          </motion.button>
          <motion.button
            type="button"
            className="hey-btn-ghost"
            onClick={() => move(1)}
            onPointerDown={() => buzz("light")}
            whileHover={{ scale: 1.02, transition: springs.snappy }}
            whileTap={{ scale: 0.97, transition: press }}
            aria-label="Next month"
          >
            →
          </motion.button>
          <button type="button" className="hey-btn-ghost" onClick={goToday}>
            Today
          </button>
        </div>
        <h3 className="font-heading text-xl">{monthLabel}</h3>
      </div>

      <div className="hey-calendar-weekdays">
        {WEEKDAYS.map((name) => (
          <span key={name} className="hey-calendar-weekday">{name}</span>
        ))}
      </div>

      <div className="hey-calendar-grid" role="grid" aria-label={`${monthLabel} calendar`}>
        {cells.map((day, index) => {
          if (day === null) return <span key={`empty-${index}`} className="hey-calendar-day empty" />;
          const iso = dateToISO(year, month, day);
          const isToday = iso === todayISO();
          const isSelected = iso === selected;
          const dayEvents = eventsByDate[iso] || [];
          const hijri = toHijri(new Date(year, month, day));
          return (
            <button
              key={iso}
              type="button"
              className={`hey-calendar-day ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}
              onClick={() => setSelected(iso)}
              onPointerDown={() => buzz("light")}
            >
              <span className="hey-calendar-day-number">{day}</span>
              <span className="hey-calendar-hijri">{hijri.day}</span>
              {dayEvents.length > 0 && (
                <span className="hey-calendar-dots">
                  {dayEvents.slice(0, 3).map((event) => (
                    <span key={event.id} className="hey-calendar-dot" title={event.title} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {unscheduled.length > 0 && (
        <p className="mt-3 text-xs text-[var(--text-secondary)]">
          {unscheduled.length} event(s) without a date — add a date like 2026-09-10 to place them.
        </p>
      )}

      <form onSubmit={addEvent} className="hey-calendar-add">
        <div className="flex flex-wrap items-end gap-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={`Event on ${selected}`}
            aria-label="New event title"
            className="hey-input flex-1 min-w-[140px]"
          />
          <input
            value={time}
            onChange={(event) => setTime(event.target.value)}
            placeholder="Time or note"
            aria-label="Event time or note"
            className="hey-input !w-32"
          />
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            aria-label="Event category"
            className="hey-input !h-auto !w-28"
          >
            {["Planning", "Work", "Health", "Family", "Study"].map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <motion.button
            type="submit"
            className="hey-btn-primary"
            disabled={!title.trim()}
            onPointerDown={() => buzz("light")}
            whileHover={{ scale: 1.02, transition: springs.snappy }}
            whileTap={{ scale: 0.97, transition: press }}
          >
            {saved ? "Saved" : "Add"}
          </motion.button>
        </div>
      </form>

      {error && <p className="mt-2 text-sm" style={{ color: "var(--coral)" }}>{error}</p>}

      <div className="mt-5">
        <h4 className="text-sm uppercase tracking-wider text-[var(--text-secondary)] mb-2">
          {selected} · {selectedEvents.length} event(s)
        </h4>
        {loading && <p className="text-sm text-[var(--text-secondary)]">Loading your schedule…</p>}
        {!loading && selectedEvents.map((event) => (
          <CalendarEvent
            key={event.id}
            title={event.title}
            time={event.content || "Scheduled"}
            type={event.metadata?.type || "Planning"}
          />
        ))}
        {!loading && selectedEvents.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)]">Nothing scheduled on this day.</p>
        )}
      </div>
    </div>
  );
}