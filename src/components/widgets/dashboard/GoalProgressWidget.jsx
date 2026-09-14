import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { springs, press } from "../../../lib/heyMotion";
import { buzz } from "../../../lib/heyFeedback";
import { Target, ArrowRight, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../AuthContext.jsx";
import { listRecords } from "../../../lib/heyRecords.js";

const PRIORITY_COLORS = {
  high: "var(--coral)",
  medium: "var(--gold)",
  low: "var(--green-accent)",
};

export default function GoalProgressWidget() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.id) return;
      try {
        const records = await listRecords(user.id, "goal");
        if (cancelled) return;
        setGoals(records.slice(0, 4).map((r) => ({
          id: r.id,
          name: r.title,
          progress: Number(r.metadata?.progress) || 0,
          priority: r.metadata?.priority || "medium",
          target: r.metadata?.target || null,
        })));
      } catch { /* swallow */ }
    }
    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  const avgProgress = goals.length === 0
    ? 0
    : Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length);

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
          <div className="badge mb-3 flex w-fit items-center gap-2" style={{ color: "var(--lavender)" }}>
            <Target size={14} />
            Goals
          </div>
          <h2 className="font-heading text-2xl">Goal Progress</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {goals.length === 0
              ? "Set goals on the Goals page."
              : `${goals.length} active goal${goals.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: "rgba(139,92,246,.12)" }}
        >
          <TrendingUp size={22} color="var(--lavender)" />
        </div>
      </div>

      <div className="mt-5 flex-1 space-y-3">
        {goals.length === 0 ? (
          <div className="flex-1 flex items-center justify-center rounded-2xl bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)] text-center">
            Your goals will show up here.
          </div>
        ) : (
          goals.map((goal) => (
            <div
              key={goal.id}
              className="rounded-2xl bg-[var(--bg-secondary)] p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium truncate flex-1 mr-2">{goal.name}</span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    color: PRIORITY_COLORS[goal.priority] || PRIORITY_COLORS.medium,
                    background: `${PRIORITY_COLORS[goal.priority] || PRIORITY_COLORS.medium}18`,
                  }}
                >
                  {goal.priority}
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-[rgba(255,255,255,.06)]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${goal.progress}%` }}
                  transition={springs.gentle}
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, var(--lavender), #90a1b4)`,
                  }}
                />
              </div>
              <div className="flex justify-between mt-1.5 text-xs text-[var(--text-secondary)]">
                <span>{goal.progress}%</span>
                {goal.target && <span>Target: {goal.target}</span>}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1.5">
          <span>Overall progress</span>
          <span>{avgProgress}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden bg-[rgba(255,255,255,.06)]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${avgProgress}%` }}
            transition={springs.gentle}
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, var(--lavender), #90a1b4)" }}
          />
        </div>
      </div>

      <motion.button
        type="button"
        onClick={() => navigate("/goals")}
        className="hey-btn-ghost mt-4 flex items-center justify-center gap-2 w-full"
        whileHover={{ scale: 1.02, transition: springs.snappy }}
        whileTap={{ scale: 0.97, transition: press }}
        onPointerDown={() => buzz("light")}
      >
        Open Goals
        <ArrowRight size={16} />
      </motion.button>
    </motion.div>
  );
}
