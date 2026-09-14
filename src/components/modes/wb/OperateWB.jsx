import { useState } from "react";
import { Battery, Camera, Clipboard, Lock, MapPin, Monitor, Unlock, Vibrate } from "lucide-react";
import { Panel, SmallButton, Stat, Tag } from "./primitives.jsx";
import { createBrowserOSAdapter } from "../../../core/osAdapter.js";

const os = createBrowserOSAdapter();

const CAPABILITIES = [
  { id: "camera", title: "Camera", icon: Camera, run: () => os.captureCamera() },
  { id: "location", title: "Location", icon: MapPin, run: () => os.getGeolocation() },
  { id: "clipboard", title: "Clipboard", icon: Clipboard, run: () => os.readClipboard() },
  { id: "battery", title: "Battery", icon: Battery, run: () => os.getBattery() },
  { id: "screen", title: "Screen share", icon: Monitor, run: () => os.captureScreen() },
  { id: "vibrate", title: "Vibration", icon: Vibrate, run: () => os.vibrate({ pattern: [40, 40, 80] }) },
];

export default function OperateWB({ workspace }) {
  const { log } = workspace;
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(null);
  const executed = Object.values(results).filter((r) => r?.success).length;

  function runCapability(capability) {
    setBusy(capability.id);
    setResults((current) => ({ ...current, [capability.id]: { pending: true } }));
    Promise.resolve()
      .then(() => capability.run())
      .then((result) => {
        setResults((current) => ({ ...current, [capability.id]: result }));
        log(result?.success
          ? `${capability.title} — access granted and executed.`
          : `${capability.title} — permission not granted.`);
      })
      .catch((err) => {
        setResults((current) => ({ ...current, [capability.id]: { success: false, error: err?.message || "Unavailable" } }));
        log(`${capability.title} — ${err?.message || "unavailable"}`);
      })
      .finally(() => setBusy(null));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Stat label="Capabilities" value={CAPABILITIES.length} tone="var(--lavender)" />
        <Stat label="Exercised" value={executed} tone={executed ? "var(--green-accent)" : "var(--coral)"} />
      </div>

      <Panel label="Permission-gated access" right={<Lock size={15} color="var(--gold)" />}>
        <p className="mb-4 text-sm leading-6 text-[var(--text-secondary)]">
          Every capability below asks the browser for permission first. HEY never runs silently — the native prompt stays between you and the action.
        </p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {CAPABILITIES.map((capability) => {
            const Icon = capability.icon;
            const result = results[capability.id];
            const loading = busy === capability.id;
            return (
              <div key={capability.id} className="rounded-2xl border border-[rgba(255,255,255,.08)] p-4">
                <div className="flex items-center justify-between">
                  <Icon size={18} color="var(--lavender)" />
                  {result?.success ? <Unlock size={15} color="var(--green-accent)" /> : result ? <Lock size={15} color="var(--coral)" /> : <Lock size={15} className="opacity-30" color="var(--text-muted)" />}
                </div>
                <h3 className="mt-4 font-heading text-xl text-[var(--text-primary)]">{capability.title}</h3>
                <div className="mt-3">
                  <SmallButton onClick={() => runCapability(capability)} kind={result?.success ? "ghost" : "primary"} style={{ width: "100%" }}>
                    {loading ? "Requesting…" : result?.success ? "Run again" : "Request access"}
                  </SmallButton>
                </div>
                {result && (
                  <p className="mt-3 text-xs leading-5" style={{ color: result.success || result.pending ? "var(--green-accent)" : "var(--coral)" }}>
                    {result.pending ? "Waiting for native prompt…" : result.success ? formatResult(result) : result.error || "Not granted."}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Tag tone="gold">permission-first</Tag>
        <span>HEY asks before it touches anything. No silent access — from the document's Mode 22 rule.</span>
      </div>
    </div>
  );
}

function formatResult(result) {
  const parts = Object.entries(result)
    .filter(([key, value]) => ["latitude", "longitude", "accuracy", "text", "level", "charging"].includes(key) && value !== undefined && value !== null)
    .map(([key, value]) => `${key}: ${key === "dataUrl" ? "captured" : String(value).slice(0, 60)}${String(value).length > 60 && key !== "dataUrl" ? "…" : ""}`);
  return parts.length ? parts.join(" · ") : "Available.";
}