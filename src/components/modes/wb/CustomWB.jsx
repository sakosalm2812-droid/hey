import { useState } from "react";
import { Check, Save, Spline } from "lucide-react";
import { Field, Panel, SmallButton, Stat, Tag } from "./primitives.jsx";
import { allSurfaceModes, saveCustomModes } from "../../../core/surfaceModes.js";

export default function CustomWB({ workspace }) {
  const { patch, log } = workspace;
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [capability, setCapability] = useState("common.*");
  const [saved, setSaved] = useState([]);

  function refresh() {
    const custom = allSurfaceModes().filter((m) => m.custom);
    setSaved((current) => {
      if (current.length !== custom.length) return custom;
      return current;
    });
  }

  function assemble(event) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || !purpose.trim()) return;
    const mode = {
      custom: true,
      modeId: "CUSTOM-" + Math.random().toString(36).slice(2, 6).toUpperCase(),
      id: cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: cleanName,
      purpose: purpose.trim(),
      capabilities: [capability],
      surfaces: ["workspace"],
      states: ["brief", "active"],
      gates: "Custom modes inherit the same permission rules as every other mode.",
      wb: "custom",
    };
    const all = allSurfaceModes();
    saveCustomModes([...all.filter((m) => m.custom), mode]);
    refresh();
    log(`Custom mode created: ${cleanName}.`);
    patch({ stage: 1 });
    setName("");
    setPurpose("");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Stat label="Custom modes" value={saved.length} tone="var(--lavender)" />
        <Stat label="Scope" value="same permissions" tone="var(--gold)" />
      </div>

      <form onSubmit={assemble}>
        <Panel label="Mode Studio" right={<SmallButton type="submit" kind="primary"><Save size={13} /> Save mode</SmallButton>}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Mode name">
              <input className="hey-input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekend trip planner" aria-label="Mode name" />
            </Field>
            <Field label="Purpose">
              <input className="hey-input w-full" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="What should this surface help you do?" aria-label="Mode purpose" />
            </Field>
            <Field label="First capability">
              <select className="hey-input w-full" value={capability} onChange={(e) => setCapability(e.target.value)} aria-label="Capability">
                <option value="common.*">General (memory, chat)</option>
                <option value="research">Research</option>
                <option value="device.camera">Camera access</option>
                <option value="device.*">All device (permission-gated)</option>
              </select>
            </Field>
          </div>
          <p className="mt-4 text-xs leading-6 text-[var(--text-muted)]">
            The Studio assembles modes from the same capability catalog as every other mode — a custom mode never gets looser permissions.
          </p>
        </Panel>
      </form>

      {saved.length > 0 && (
        <Panel label="Your custom modes" right={<Spline size={15} color="var(--lavender)" />}>
          <div className="space-y-2">
            {saved.map((mode) => (
              <div key={mode.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[rgba(255,255,255,.08)] p-3">
                <div>
                  <strong className="flex items-center gap-2 text-sm text-[var(--text-primary)]"><Check size={13} color="var(--green-accent)" /> {mode.name}</strong>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{mode.purpose}</p>
                  <Tag tone="lavender">{mode.capabilities?.[0] || "common.*"}</Tag>
                </div>
                <span className="text-xs" style={{ color: "var(--gold)" }}>{mode.modeId}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <p className="text-xs text-[var(--text-muted)]">Boundary: custom modes inherit the same permission rules as every other mode — no back doors.</p>
    </div>
  );
}