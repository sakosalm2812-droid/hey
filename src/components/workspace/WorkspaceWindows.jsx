import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Minus,
  Square,
  Copy,
} from "lucide-react";
import { springs } from "../../lib/heyMotion.js";
import { buzz } from "../../lib/heyFeedback.js";
import {
  openWindow,
  closeWindow,
  toggleMinimize,
  focusWindow,
  moveWindow,
  resizeWindow,
  getWindows,
  subscribeWindows,
} from "../../core/workspaceManager.js";
import ProactiveSuggestionsWidget from "../widgets/dashboard/ProactiveSuggestionsWidget.jsx";
import DailyPlanWidget from "../widgets/dashboard/DailyPlanWidget.jsx";
import FocusTimerWidget from "../widgets/dashboard/FocusTimerWidget.jsx";
import MemoryGalaxyWidget from "../widgets/dashboard/MemoryGalaxyWidget.jsx";
import ActivityWidget from "../widgets/dashboard/ActivityWidget.jsx";
import QuickNoteWidget from "../widgets/dashboard/QuickNoteWidget.jsx";
import HabitStreakWidget from "../widgets/dashboard/HabitStreakWidget.jsx";
import GoalProgressWidget from "../widgets/dashboard/GoalProgressWidget.jsx";

const CONTENT = {
  proactive: ProactiveSuggestionsWidget,
  dailyplan: DailyPlanWidget,
  focus: FocusTimerWidget,
  memory: MemoryGalaxyWidget,
  activity: ActivityWidget,
  quicknote: QuickNoteWidget,
  habit: HabitStreakWidget,
  goal: GoalProgressWidget,
};

const SEED_WINDOWS = [
  { id: "workspace-proactive", title: "For you", contentId: "proactive" },
  { id: "workspace-dailyplan", title: "Today's plan", contentId: "dailyplan" },
  { id: "workspace-focus", title: "Focus timer", contentId: "focus" },
  { id: "workspace-quicknote", title: "Quick note", contentId: "quicknote" },
];

// eslint-disable-next-line react-refresh/only-export-components
export function openWorkspace() {
  const current = new Set(getWindows().map((item) => item.id));
  SEED_WINDOWS.forEach((seed, index) => {
    if (current.has(seed.id)) return;
    const screenW = window.innerWidth;
    openWindow({
      ...seed,
      x: 40 + (index % 2) * 120 + (index % 3) * 30,
      y: 70 + (index % 2) * 90,
      width: 420,
      height: 340,
      z: Date.now() + index,
      ...(screenW < 768 ? { width: Math.min(360, screenW - 24) } : {}),
    });
  });
}

function TrafficLight({ color, action, label }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="hey-window-light"
      style={{ background: color }}
      onClick={(event) => {
        event.stopPropagation();
        buzz("light");
        action();
      }}
    >
      <span />
    </button>
  );
}

function WorkspaceWindow({ entry, focused }) {
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const pending = useRef({ mode: null, startX: 0, startY: 0, originX: 0, originY: 0, width: 0, height: 0 });

  const Content = CONTENT[entry.contentId] || CONTENT.quicknote;

  function beginDrag(event) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    focusWindow(entry.id);
    pending.current = { mode: "move", startX: event.clientX, startY: event.clientY, originX: entry.x, originY: entry.y };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function beginResize(event) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    focusWindow(entry.id);
    pending.current = { mode: "resize", startX: event.clientX, startY: event.clientY, width: entry.width, height: entry.height };
    setResizing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    const state = pending.current;
    if (state.mode === "move") {
      moveWindow(entry.id, state.originX + (event.clientX - state.startX), state.originY + (event.clientY - state.startY));
    } else if (state.mode === "resize") {
      resizeWindow(entry.id, state.width + (event.clientX - state.startX), state.height + (event.clientY - state.startY));
    }
  }

  function endPointer(event) {
    pending.current = { mode: null };
    setDragging(false);
    setResizing(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  if (entry.minimized) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        style={{
          position: "fixed",
          left: entry.x,
          top: entry.y,
          zIndex: entry.z,
          minWidth: 180,
        }}
      >
        <button
          type="button"
          className="glass-card"
          onClick={() => toggleMinimize(entry.id)}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", cursor: "pointer" }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--gold)" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{entry.title}</span>
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={springs.gentle}
      className="hey-window"
      style={{
        position: "fixed",
        left: entry.x,
        top: entry.y,
        width: entry.width,
        height: entry.height,
        zIndex: entry.z,
        boxShadow: focused
          ? "0 24px 70px rgba(0,0,0,.5)"
          : "0 12px 40px rgba(0,0,0,.35)",
      }}
      onPointerDown={() => focusWindow(entry.id)}
    >
      <div
        className="hey-window-chrome"
        ref={dragRef}
        onPointerDown={beginDrag}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
      >
        <div className="hey-traffic-lights">
          <TrafficLight color="#ff5f57" label="Close window" action={() => closeWindow(entry.id)} />
          <TrafficLight color="#febc2e" label="Minimize window" action={() => toggleMinimize(entry.id)} />
          <TrafficLight color="#28c840" label="Duplicate window" action={() => {
            openWindow({
              ...entry,
              id: `${entry.id}-${Date.now()}`,
              x: entry.x + 24,
              y: entry.y + 24,
              title: `${entry.title} (copy)`,
            });
          }} />
        </div>
        <span className="hey-window-title">{entry.title}</span>
        <div className="hey-window-chrome-actions">
          <button type="button" aria-label="Duplicate" className="hey-window-tool" onClick={() => openWindow({ ...entry, id: `${entry.id}-${Date.now()}`, x: entry.x + 24, y: entry.y + 24 })}>
            <Copy size={12} />
          </button>
          <button type="button" aria-label="Maximize" className="hey-window-tool" onClick={() => {
            openWindow({ ...entry, x: 16, y: 16, width: Math.min(720, window.innerWidth - 32), height: Math.min(640, window.innerHeight - 100), title: entry.title });
            closeWindow(entry.id);
          }}>
            <Square size={12} />
          </button>
          <button type="button" aria-label="Minimize" className="hey-window-tool" onClick={() => toggleMinimize(entry.id)}>
            <Minus size={12} />
          </button>
          <button type="button" aria-label="Close" className="hey-window-tool" onClick={() => closeWindow(entry.id)}>
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="hey-window-body">
        <Content />
      </div>

      <div
        className="hey-window-resize"
        role="separator"
        aria-label="Resize window"
        onPointerDown={beginResize}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        style={{ touchAction: "none", cursor: resizing ? "nwse-resize" : "nwse-resize" }}
      />
    </motion.div>
  );
}

export default function WorkspaceWindows() {
  const [windows, setWindows] = useState(getWindows());
  const [focusedId, setFocusedId] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeWindows((next, withFocus) => {
      setWindows(next);
      if (withFocus && next.length) {
        const top = [...next].sort((a, b) => a.z - b.z).pop();
        setFocusedId(top?.id || null);
      }
      if (next.length === 0) setFocusedId(null);
    });
    return unsubscribe;
  }, []);

  return (
    <AnimatePresence>
      {windows.map((entry) => (
        <WorkspaceWindow key={entry.id} entry={entry} focused={focusedId === entry.id} />
      ))}
    </AnimatePresence>
  );
}

export { SEED_WINDOWS };