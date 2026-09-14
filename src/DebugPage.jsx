import { useEffect, useMemo, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import HEY from "./core/index.js";
import { subscribe } from "./core/eventBus.js";
import { useAuth } from "./AuthContext.jsx";
import { getLog, clearLog, downloadLog } from "./core/heyLogger.js";
import { getNotifications, unreadCount } from "./core/notificationCenter.js";
import { loadVoiceSettings } from "./core/heyVoiceSettings.js";
import { computePrayerTimes, nextPrayer, formatTime } from "./core/prayerTimes.js";

export default function DebugPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [execution, setExecution] = useState(null);
  const [logs, setLogs] = useState(() => getLog());
  const [online, setOnline] = useState(() => navigator.onLine);
  const [swStatus, setSwStatus] = useState("checking");
  const [notificationCount, setNotificationCount] = useState(() => getNotifications().length);
  const [capabilities] = useState(() => HEY.capabilities.all());
  const [tools] = useState(() => HEY.tools.all());
  const context = HEY.state();
  const platform = typeof navigator === "undefined" ? "server" : navigator.userAgent;

  useEffect(() => {
    const eventNames = [
      "execution.request.started",
      "execution.step.started",
      "execution.step.permission_required",
      "execution.step.failed",
      "execution.step.verification_failed",
      "execution.request.completed",
      "execution.request.failed",
    ];
    const unsubscribers = eventNames.map((eventName) => HEY.events.subscribe(eventName, (payload) => {
      setExecution(payload);
      setEvents((current) => [{ eventName, payload, at: new Date() }, ...current].slice(0, 20));
    }));
    const stopLogs = setInterval(() => setLogs(getLog()), 2000);
    const stopNotifications = subscribe("notification.updated", () => setNotificationCount(unreadCount()));
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        setSwStatus(registration ? "active" : "not-registered");
      }).catch(() => setSwStatus("unavailable"));
    } else {
      setTimeout(() => setSwStatus("unsupported"), 0);
    }
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      clearInterval(stopLogs);
      stopNotifications();
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const voiceSettings = useMemo(() => loadVoiceSettings(), []);
  const prayer = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    const times = computePrayerTimes(today, { lat: 21.3891, lon: 39.8579 }, { method: "MWL" });
    const { next, wait } = nextPrayer(times, now);
    return { times, next, wait };
  }, []);

  const storageUsed = useMemo(() => {
    let bytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        bytes += (key ? key.length : 0) + (localStorage.getItem(key) || "").length;
      }
    } catch {
      return 0;
    }
    return bytes;
  }, []);

  const latestLog = logs.slice(-25).reverse();

  return (
    <main className="page-content px-8 py-8">
      <div className="section-label mb-3">Developer Diagnostics</div>
      <h1 className="font-heading text-5xl text-[var(--text-primary)]">HEY Runtime</h1>
      <p className="mt-3 text-[var(--text-secondary)]">Live state from the core registries, execution event bus, and local activity log.</p>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <article className="glass-card p-6">
          <h2 className="text-xl text-[var(--text-primary)]">Runtime</h2>
          <dl className="mt-4 grid gap-2 text-sm text-[var(--text-secondary)]">
            <div><dt className="inline">Platform: </dt><dd className="inline">{platform}</dd></div>
            <div><dt className="inline">Mode: </dt><dd className="inline">{context.intelligence.activeMode}</dd></div>
            <div><dt className="inline">Agent: </dt><dd className="inline">{context.intelligence.activeAgent?.name || "none"}</dd></div>
            <div><dt className="inline">Tools: </dt><dd className="inline">{tools.length}</dd></div>
            <div><dt className="inline">Capabilities: </dt><dd className="inline">{capabilities.length}</dd></div>
            <div><dt className="inline">Network: </dt><dd className="inline">{online ? "online" : "offline"}</dd></div>
            <div><dt className="inline">Timezone: </dt><dd className="inline">{Intl.DateTimeFormat().resolvedOptions().timeZone || "system"}</dd></div>
            <div><dt className="inline">Locale: </dt><dd className="inline">{navigator.language}</dd></div>
            <div><dt className="inline">Service worker: </dt><dd className="inline">{swStatus}</dd></div>
            <div><dt className="inline">Notifications: </dt><dd className="inline">{[notificationCount, "unread"].join(" ")}</dd></div>
            <div><dt className="inline">Local storage: </dt><dd className="inline">{(storageUsed / 1024).toFixed(1)} KB</dd></div>
            <div><dt className="inline">Account: </dt><dd className="inline">{user ? user.email || user.id : "signed out"}</dd></div>
          </dl>
        </article>

        <article className="glass-card p-6">
          <h2 className="text-xl text-[var(--text-primary)]">Prayer & voice snapshot</h2>
          <dl className="mt-4 grid gap-2 text-sm text-[var(--text-secondary)]">
            <div><dt className="inline">Next prayer: </dt><dd className="inline">{prayer.next?.name} {formatTime(prayer.next?.time)} (in {prayer.wait != null ? Math.round(prayer.wait / 60) : "—"} min)</dd></div>
            <div><dt className="inline">Voice: </dt><dd className="inline">{voiceSettings.voiceURI || "auto"}</dd></div>
            <div><dt className="inline">Wake phrase: </dt><dd className="inline">"{voiceSettings.wakePhrase || "hey"}"</dd></div>
            <div><dt className="inline">Auto-listen: </dt><dd className="inline">{voiceSettings.autoListen ? "on" : "off"}</dd></div>
          </dl>
          <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-[var(--text-secondary)]">{execution ? JSON.stringify(execution, null, 2) : "No execution events yet."}</pre>
        </article>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <article className="glass-card p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl text-[var(--text-primary)]">Recent local activity</h2>
            <div className="flex gap-2">
              <button type="button" className="hey-btn-ghost flex items-center gap-2 text-xs px-3 py-1.5" onClick={downloadLog}>
                <Download size={14} />
                Download
              </button>
              <button
                type="button"
                className="hey-btn-ghost flex items-center gap-2 text-xs px-3 py-1.5"
                onClick={() => {
                  clearLog();
                  setLogs([]);
                }}
              >
                <Trash2 size={14} />
                Clear
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-1">
            {latestLog.length === 0 && <p className="text-sm text-[var(--text-secondary)]">No local activity recorded yet.</p>}
            {latestLog.map((entry, index) => (
              <div key={`${entry.at}-${index}`} className="border-b border-white/10 py-1.5 text-xs text-[var(--text-secondary)]">
                <span className="text-[var(--text-primary)]">{new Date(entry.at).toLocaleTimeString()}</span>
                <span className="ml-2">{entry.kind}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="glass-card p-6">
          <h2 className="text-xl text-[var(--text-primary)]">Recent execution events</h2>
          <div className="mt-4 grid gap-2">
            {events.length ? events.map((item, index) => (
              <div key={`${item.eventName}-${index}`} className="border-b border-white/10 py-2 text-sm text-[var(--text-secondary)]">
                <strong className="text-[var(--text-primary)]">{item.eventName}</strong>
                <span className="ml-3">{new Date(item.at).toLocaleTimeString()}</span>
              </div>
            )) : <p className="text-sm text-[var(--text-secondary)]">No events recorded in this session.</p>}
          </div>
        </article>
      </section>
    </main>
  );
}