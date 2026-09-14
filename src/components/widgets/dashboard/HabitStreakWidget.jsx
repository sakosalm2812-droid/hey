import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { springs, press } from "../../../lib/heyMotion";
import { buzz } from "../../../lib/heyFeedback";
import { Flame, CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../AuthContext.jsx";
import { listRecords } from "../../../lib/heyRecords.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getWeekDays() {
  const today = new Date();
  const day = today.getDay();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - day + i);
    return { name: DAY_NAMES[i], date: d.toDateString(), isToday: i === day };
  });
}

export default function HabitStreakWidget() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [habits, setHabits] = useState([]);
  const [completedToday, setCompletedToday] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.id) return;
      try {
        const records = await listRecords(user.id, "habit");
        if (cancelled) return;
        setHabits(records.slice(0, 4).map((r) => ({
          id: r.id,
          name: r.title,
          streak: Number(r.metadata?.streak) || 0,
          completedDays: r.metadata?.completedDays || [],
        })));
      } catch { /* swallow */ }
    }
    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  const weekDays = useMemo(() => getWeekDays(), []);

  const toggleHabit = (id) => {
    buzz("light");
    setCompletedToday((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalToday = habits.length;
  const doneToday = completedToday.size;
  const progress = totalToday === 0 ? 0 : Math.round((doneToday / totalToday) * 100);

  return (
    <motion.div
      className="glass-card h-full p-6 flex flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, transition: springs.gentle }}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="badge mb-3 flex w-fit items-center gap-2" style={{ color: "var(--coral)" }}>
            <Flame size={14} />
            Habits
          </div>
          <h2 className="font-heading text-2xl">Weekly Streaks</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {habits.length === 0
              ? "Add habits on the Habits page."
              : `${doneToday} of ${totalToday} done today`}
          </p>
        </div>
      </div>

      <div className="mt-5 flex gap-1.5">
        {weekDays.map((day) => (
          <div
            key={day.date}
            className={`flex-1 text-center rounded-xl py-1.5 text-xs font-medium ${
              day.isToday
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
            }`}
          >
            {day.name}
          </div>
        ))}
      </div>

      <div className="mt-5 flex-1 space-y-2">
        {habits.length === 0 ? (
          <div className="flex-1 flex items-center justify-center rounded-2xl bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)] text-center">
            Your habits will appear here.
          </div>
        ) : (
          habits.map((habit) => (
            <button
              key={habit.id}
              onClick={() => toggleHabit(habit.id)}
              className="flex w-full items-center gap-3 rounded-2xl bg-[var(--bg-secondary)] p-3.5 text-left transition hover:bg-[rgba(255,255,255,.06)]"
            >
              {completedToday.has(habit.id) ? (
                <CheckCircle2 size={20} color="var(--green-accent)" />
              ) : (
                <Circle size={20} color="var(--text-secondary)" />
              )}
              <div className="flex-1">
                <div className="text-sm">{habit.name}</div>
              </div>
              {habit.streak > 0 && (
                <span className="text-xs font-medium" style={{ color: "var(--coral)" }}>
                  {habit.streak}d
                </span>
              )}
            </button>
          ))
        )}
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1.5">
          <span>Today&apos;s progress</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden bg-[rgba(255,255,255,.06)]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={springs.gentle}
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, var(--coral), #ff6b6b)" }}
          />
        </div>
      </div>

      <motion.button
        type="button"
        onClick={() => navigate("/habits")}
        className="hey-btn-ghost mt-4 flex items-center justify-center gap-2 w-full"
        whileHover={{ scale: 1.02, transition: springs.snappy }}
        whileTap={{ scale: 0.97, transition: press }}
        onPointerDown={() => buzz("light")}
      >
        Open Habits
        <ArrowRight size={16} />
      </motion.button>
    </motion.div>
  );
}
