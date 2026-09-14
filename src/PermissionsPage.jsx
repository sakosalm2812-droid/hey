import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bell, Brain, Globe2, Lock, Mic, ShieldCheck, Smartphone } from "lucide-react";
import Sidebar from "./Sidebar";
import { useAuth } from "./AuthContext.jsx";
import { listDevices, listPermissions, setPermission } from "./lib/platformRecords.js";

const permissionDefinitions = [
  { id: "memory.read", title: "Personal memory", description: "Let HEY use relevant saved context in responses.", icon: Brain },
  { id: "web.search", title: "Web research", description: "Allow HEY to search approved web providers for current information.", icon: Globe2 },
  { id: "voice.microphone", title: "Microphone", description: "Allow voice sessions to use your browser microphone.", icon: Mic },
  { id: "proactive.suggestions", title: "Proactive suggestions", description: "Allow HEY to notice useful patterns and suggest next actions.", icon: Bell },
  { id: "device.control", title: "Device controls", description: "Allow registered device adapters to request approved actions.", icon: Smartphone },
];

export default function PermissionsPage() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState({});
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      setError("");
      try {
        const [permissions, registeredDevices] = await Promise.all([listPermissions(user.id), listDevices(user.id)]);
        if (cancelled) return;
        setEnabled(Object.fromEntries(permissions.map((item) => [item.permission, item.status === "granted"])));
        setDevices(registeredDevices);
      } catch {
        if (!cancelled) setError("Could not load your permission settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSettings();
    return () => { cancelled = true; };
  }, [user?.id]);

  async function togglePermission(permission) {
    if (!user?.id) return;
    const nextValue = !enabled[permission];
    setEnabled((current) => ({ ...current, [permission]: nextValue }));
    try {
      await setPermission(user.id, permission, nextValue ? "granted" : "revoked");
    } catch {
      setEnabled((current) => ({ ...current, [permission]: !nextValue }));
      setError("That permission could not be updated.");
    }
  }

  return (
    <div className="page-with-sidebar">
      <Sidebar />
      <main className="page-content">
        <motion.div className="px-8 py-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="section-label mb-3">Trust Center</div>
          <h1 className="font-heading text-6xl text-[var(--text-primary)]">Permissions</h1>
          <p className="mt-3 max-w-2xl text-[var(--text-secondary)]">You stay in control of what HEY can remember, access, and do. High-impact actions still require confirmation.</p>

          {error && <p className="mt-6 text-[var(--coral)]">{error}</p>}

          {loading ? (
            <p className="mt-8 text-[var(--text-secondary)]">Loading your permission settings...</p>
          ) : (
            <>
              <section className="mt-8 grid gap-4 md:grid-cols-2">
                {permissionDefinitions.map((permission) => {
                  const Icon = permission.icon;
                  const active = Boolean(enabled[permission.id]);
                  return (
                    <div key={permission.id} className="glass-card flex items-center justify-between gap-5 p-6">
                      <div className="flex items-start gap-4">
                        <Icon size={22} color="var(--gold)" />
                        <div>
                          <h2 className="text-lg text-[var(--text-primary)]">{permission.title}</h2>
                          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{permission.description}</p>
                        </div>
                      </div>
                      <button type="button" aria-pressed={active} aria-label={`Toggle ${permission.title}`} onClick={() => togglePermission(permission.id)} className={active ? "hey-btn-primary" : "hey-btn-ghost"}>
                        {active ? "Enabled" : "Disabled"}
                      </button>
                    </div>
                  );
                })}
              </section>

              <section className="glass-card mt-8 p-6">
                <div className="flex items-center gap-3">
                  <ShieldCheck size={22} color="var(--green-accent)" />
                  <h2 className="font-heading text-2xl text-[var(--text-primary)]">Registered devices</h2>
                </div>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">Only devices connected through an approved adapter can receive actions.</p>
                <div className="mt-5 space-y-3">
                  {devices.length ? devices.map((device) => (
                    <div key={device.id} className="flex items-center justify-between rounded-2xl bg-[rgba(255,255,255,.04)] p-4">
                      <div className="flex items-center gap-3"><Lock size={16} color="var(--gold)" /><span>{device.name}</span></div>
                      <span className="badge">{device.status}</span>
                    </div>
                  )) : <p className="text-sm text-[var(--text-secondary)]">No devices are registered yet.</p>}
                </div>
              </section>
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}
