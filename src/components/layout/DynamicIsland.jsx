import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  X,
  CheckCheck,
  Trash2,
  Wifi,
  WifiOff,
  AlertTriangle,
  ArrowRight,
  BellOff,
  Loader2,
  CheckCircle2,
  Info,
  ShieldAlert,
} from "lucide-react";
import {
  notify,
  dismissNotification,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotifications,
  subscribeNotifications,
  unreadCount,
  getNotifications,
} from "../../core/notificationCenter.js";
import { subscribe } from "../../core/eventBus.js";
import { useLongPress } from "../../hooks/useLongPress.js";
import { buzz, confirmSound } from "../../lib/heyFeedback.js";
import { springs } from "../../lib/heyMotion.js";
import { loadStoredProactiveSettings } from "../../lib/proactiveStore.js";

const CATEGORY_STYLES = {
  success: { color: "var(--green-accent)", Icon: CheckCircle2 },
  error: { color: "var(--coral)", Icon: ShieldAlert },
  warning: { color: "var(--gold)", Icon: AlertTriangle },
  info: { color: "var(--lavender)", Icon: Info },
  "action-required": { color: "var(--gold)", Icon: AlertTriangle },
  loading: { color: "var(--lavender)", Icon: Loader2 },
};

function formatTime(iso) {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function computeQuiet(now = new Date()) {
  const settings = loadStoredProactiveSettings();
  if (!settings.enabled) return false;
  const start = String(settings.quietHours?.start || "22:00");
  const end = String(settings.quietHours?.end || "08:00");
  const startMin = Number(start.split(":")[0]) * 60 + Number(start.split(":")[1]);
  const endMin = Number(end.split(":")[0]) * 60 + Number(end.split(":")[1]);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (startMin === endMin) return false;
  return startMin > endMin ? nowMin >= startMin || nowMin < endMin : nowMin >= startMin && nowMin < endMin;
}

export default function DynamicIsland() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState(() =>
    getNotifications().filter((item) => !item.hidden),
  );
  const [runningCount, setRunningCount] = useState(0);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [quiet, setQuiet] = useState(() => computeQuiet());
  const [seenAt, setSeenAt] = useState(0);

  const longPressToggle = useLongPress(() => {
    buzz("light");
    setExpanded((current) => !current);
  }, { delay: 500 });

  function kick() {
    setItems(getNotifications().filter((item) => !item.hidden));
    setSeenAt(Date.now());
    if (unreadCount() > 0) {
      window.setTimeout(() => setExpanded(true), 0);
    }
  }

  useEffect(() => {
    const unsubscribeStore = subscribeNotifications(() => kick());
    const unsubscribeEvents = [
      subscribe("execution.request.started", (payload) => {
        setRunningCount((count) => count + 1);
        notify({ id: `run-${payload.requestId}`, category: "loading", priority: 1, title: "Working", body: `HEY is executing: ${String(payload.command || payload.input || "your request").slice(0, 60)}` });
      }),
      subscribe("execution.request.completed", (payload) => {
        setRunningCount((count) => Math.max(0, count - 1));
        notify({ id: `run-${payload.requestId}`, category: "success", priority: 1, title: "Done", body: "HEY finished your request.", path: "/chat" });
      }),
      subscribe("execution.request.failed", (payload) => {
        setRunningCount((count) => Math.max(0, count - 1));
        notify({ id: `run-${payload.requestId}`, category: "error", priority: 2, title: "Request failed", body: "HEY could not complete your request. Check HEY's permissions or try again.", path: "/permissions" });
      }),
      subscribe("execution.step.permission_required", (payload) => {
        notify({ id: `perm-${payload.requestId}`, category: "action-required", priority: 2, title: "Permission needed", body: `HEY needs permission to use ${payload.capability || payload.tool}.`, actions: [{ label: "Review permissions", path: "/permissions" }] });
      }),
    ];

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    const clock = window.setInterval(() => setQuiet(computeQuiet()), 60 * 1000);
    const first = window.setTimeout(kick, 0);

    return () => {
      unsubscribeStore();
      unsubscribeEvents.forEach((unsub) => unsub?.());
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.clearInterval(clock);
      window.clearTimeout(first);
    };
  }, []);

  useEffect(() => {
    if (!expanded) return undefined;
    const timer = window.setTimeout(() => setExpanded(false), 8000);
    return () => window.clearTimeout(timer);
  }, [expanded, seenAt]);

  const visible = items.filter((item) => !item.hidden).slice(0, 5);
  const unread = unreadCount();

  function openItem(item) {
    markNotificationRead(item.id);
    if (item.path) {
      navigate(item.path);
      buzz("light");
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 14,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 900,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: springs.gentle }}
            exit={{ opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.18 } }}
            className="glass-card"
            style={{
              width: 360,
              maxWidth: "92vw",
              padding: 16,
              marginBottom: 10,
              pointerEvents: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 12, letterSpacing: ".16em", color: "var(--gold)", textTransform: "uppercase" }}>
                {quiet ? "Quiet hours" : "Activity"}
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                <button type="button" className="hey-btn-ghost" style={{ padding: 6 }} aria-label="Mark all as read" onClick={() => { markAllNotificationsRead(); confirmSound(); }}>
                  <CheckCheck size={14} />
                </button>
                <button type="button" className="hey-btn-ghost" style={{ padding: 6 }} aria-label="Clear notifications" onClick={() => { clearNotifications(); confirmSound(); }}>
                  <Trash2 size={14} />
                </button>
                <button type="button" className="hey-btn-ghost" style={{ padding: 6 }} aria-label="Collapse island" onClick={() => setExpanded(false)}>
                  <X size={14} />
                </button>
              </div>
            </div>

            {visible.length === 0 ? (
              <div style={{ padding: "10px 4px 4px", color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
                {quiet
                  ? "HEY is holding non-urgent notices until quiet hours end. Urgent items can still appear."
                  : "Nothing is happening right now. HEY will surface running work, permissions, and finished requests here."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflow: "auto" }}>
                {visible.map((item) => {
                  const style = CATEGORY_STYLES[item.category] || CATEGORY_STYLES.info;
                  const Icon = style.Icon;
                  return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        padding: "10px 12px",
                        borderRadius: 14,
                        cursor: item.path || item.actions.length ? "pointer" : "default",
                        background: item.read ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.06)",
                      }}
                      onClick={() => openItem(item)}
                    >
                      <Icon size={16} style={{ marginTop: 2, flexShrink: 0 }} color={style.color} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <strong style={{ fontSize: 13.5, color: "var(--text-primary)" }}>{item.title}</strong>
                          <span style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{formatTime(item.createdAt)}</span>
                        </div>
                        {item.body && (
                          <p style={{ marginTop: 3, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{item.body}</p>
                        )}
                        {item.actions?.map((action) => (
                          <button
                            key={action.label}
                            type="button"
                            className="hey-btn-ghost"
                            style={{ marginTop: 8, gap: 6, padding: "5px 10px", fontSize: 12.5 }}
                            onClick={(event) => { event.stopPropagation(); markNotificationRead(item.id); if (action.path) navigate(action.path); }}
                          >
                            {action.label} <ArrowRight size={12} />
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        aria-label={`Dismiss ${item.title}`}
                        className="hey-btn-ghost"
                        style={{ padding: 4 }}
                        onClick={(event) => { event.stopPropagation(); dismissNotification(item.id); buzz("light"); }}
                      >
                        <X size={13} />
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pill */}
      <motion.button
        type="button"
        className="hey-island"
        {...longPressToggle}
        onClick={() => { buzz("light"); setExpanded((current) => !current); }}
        whileHover={{ scale: 1.03, transition: springs.snappy }}
        whileTap={{ scale: 0.96 }}
        aria-expanded={expanded}
        aria-label="HEY activity island"
        style={{ pointerEvents: "auto" }}
      >
        {online ? <Wifi size={13} color="var(--green-accent)" /> : <WifiOff size={13} color="var(--coral)" />}
        {runningCount > 0 && <Loader2 size={13} color="var(--lavender)" className="hey-spin" />}
        {quiet && <BellOff size={13} color="var(--gold)" />}
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>
          {unread > 0 ? `HEY · ${unread}` : "HEY"}
        </span>
        <Bell size={13} color={unread > 0 ? "var(--gold)" : "var(--text-secondary)"} />
        {unread > 0 && (
          <motion.span
            animate={{ opacity: [1, 0.35, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--coral)" }}
          />
        )}
      </motion.button>
    </div>
  );
}