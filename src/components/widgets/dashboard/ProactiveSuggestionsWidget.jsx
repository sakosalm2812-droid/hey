import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  X,
  BellOff,
  ArrowRight,
  Moon,
  Sunrise,
} from "lucide-react";
import {
  evaluateContext,
  evaluateProactiveSignals,
  isSuggestionExpired,
} from "../../../core/proactiveEngine.js";
import { getContext } from "../../../core/contextManager.js";
import {
  loadStoredProactiveSettings,
  getSuggestionsToday,
  recordSuggestionsToday,
} from "../../../lib/proactiveStore.js";
import { buzz } from "../../../lib/heyFeedback.js";
import { springs } from "../../../lib/heyMotion.js";

function isDone(task) {
  return ["completed", "done", "cancelled", "canceled"].includes(task?.status);
}

function dueDateOf(task) {
  const value = task?.due_date || task?.dueDate || task?.due || task?.scheduledAt;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// eslint-disable-next-line react-refresh/only-export-components
export const evaluateDailySignals = function evaluateDailySignals(now = new Date()) {
  const settings = loadStoredProactiveSettings();
  const context = getContext();
  const tasks = Array.isArray(context.task?.pendingTasks)
    ? context.task.pendingTasks
    : [];

  const overdue = tasks.filter((task) => {
    if (isDone(task)) return false;
    const due = dueDateOf(task);
    return Boolean(due && due < now);
  });

  const upcoming = tasks.filter((task) => {
    if (isDone(task)) return false;
    const due = dueDateOf(task);
    return Boolean(due && due >= now && due <= new Date(now.getTime() + 24 * 3600000));
  });

  const morningMode = now.getHours() < 12;
  const signals = evaluateContext({
    overdueTasks: overdue.slice(0, 5),
    upcomingTasks: upcoming.slice(0, 5),
    morningMode,
    morningSummary: morningMode
      ? "Your focus for today is ready on the Morning page."
      : null,
  });

  const suggestions = evaluateProactiveSignals(signals, settings, {
    now,
    suggestionsToday: getSuggestionsToday(),
  });

  return { suggestions, settings, overdueCount: overdue.length, upcomingCount: upcoming.length };
};

export default function ProactiveSuggestionsWidget() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState([]);
  const [isQuiet, setIsQuiet] = useState(false);

  const refresh = useCallback(() => {
    const { suggestions, settings } = evaluateDailySignals(new Date());
    setItems(suggestions);
    const start = String(settings.quietHours?.start || "22:00").split(":").map(Number);
    const end = String(settings.quietHours?.end || "08:00").split(":").map(Number);
    const minutes = new Date().getHours() * 60 + new Date().getMinutes();
    const startMinutes = start[0] * 60 + start[1];
    const endMinutes = end[0] * 60 + end[1];
    setIsQuiet(
      startMinutes === endMinutes
        ? false
        : startMinutes > endMinutes
          ? minutes >= startMinutes || minutes < endMinutes
          : minutes >= startMinutes && minutes < endMinutes,
    );
    recordSuggestionsToday(suggestions.length);
  }, []);

  useEffect(() => {
    const first = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 5 * 60 * 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) =>
          !dismissed.includes(item.id) && !isSuggestionExpired(item),
      ),
    [items, dismissed],
  );

  function dismiss(item) {
    buzz("light");
    setDismissed((current) => [...current, item.id]);
  }

  if (visibleItems.length === 0) {
    return (
      <div className="glass-card" style={{ height: "100%", padding: 24, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, letterSpacing: ".16em", color: "var(--gold)", textTransform: "uppercase" }}>For you</span>
          {isQuiet && <Moon size={15} color="var(--lavender)" />}
        </div>
        <div style={{ marginTop: 16, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {isQuiet ? (
            <>
              <BellOff size={22} color="var(--lavender)" />
              <p style={{ marginTop: 12, color: "var(--text-primary)", fontWeight: 600 }}>
                Quiet hours
              </p>
              <p style={{ marginTop: 6, color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
                HEY is pausing suggestions until your quiet window ends. Urgent items can still break through.
              </p>
            </>
          ) : (
            <>
              <Sunrise size={22} color="var(--green-accent)" />
              <p style={{ marginTop: 12, color: "var(--text-primary)", fontWeight: 600 }}>
                Nothing needs your attention
              </p>
              <p style={{ marginTop: 6, color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
                HEY is watching for overdue work, upcoming tasks, and meaningful context. Tune quiet hours in Settings.
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          className="hey-btn-ghost"
          style={{ marginTop: 16, width: "100%", justifyContent: "center", gap: 8 }}
          onClick={() => navigate("/settings")}
        >
          Proactive settings <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ height: "100%", padding: 24, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, letterSpacing: ".16em", color: "var(--gold)", textTransform: "uppercase" }}>
          For you
        </span>
        <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2.4, repeat: Infinity }}>
          <Sparkles size={15} color="var(--gold)" />
        </motion.span>
      </div>

      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12, overflow: "auto" }}>
        {visibleItems.slice(0, 3).map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: springs.gentle }}
            className="badge badge-green"
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 10,
              padding: "12px 14px",
              background: "rgba(124,184,124,0.08)",
              borderRadius: 16,
              textAlign: "left",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 14 }}>{item.title}</p>
              <p style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 12.5, lineHeight: 1.5 }}>{item.body}</p>
              {item.action?.name ? (
                <button
                  type="button"
                  className="hey-btn-ghost"
                  style={{ marginTop: 8, gap: 6, padding: "6px 10px" }}
                  onClick={() => {
                    buzz("light");
                    const path = item.action.path || "/chat";
                    navigate(path);
                    dismiss(item);
                  }}
                >
                  {item.action.name} <ArrowRight size={12} />
                </button>
              ) : null}
            </div>
            <button
              type="button"
              aria-label={`Dismiss ${item.title}`}
              className="hey-btn-ghost"
              style={{ padding: 4 }}
              onClick={() => dismiss(item)}
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </div>

      <button
        type="button"
        className="hey-btn-ghost"
        style={{ marginTop: 14, width: "100%", justifyContent: "center", gap: 8 }}
        onClick={() => navigate("/settings")}
      >
        Quiet hours & limits <ArrowRight size={14} />
      </button>
    </div>
  );
}