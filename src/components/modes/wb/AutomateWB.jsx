import { useState } from "react";
import { Power, PowerOff, RefreshCw } from "lucide-react";
import { Field, Panel, SmallButton, Stat, Tag } from "./primitives.jsx";

export default function AutomateWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [tName, setTName] = useState("");
  const [tAction, setTAction] = useState("");
  const automations = (state.items || []).filter((i) => i.kind === "automation");
  const activeCount = automations.filter((i) => i.enabled).length;

  function addAutomation(event) {
    event.preventDefault();
    const name = tName.trim();
    const action = tAction.trim();
    if (!name || !action) return;
    workspace.addItem({ kind: "automation", name, action, enabled: false, simulated: false });
    workspace.log(`Automation registered: "${name}".`);
    setTName("");
    setTAction("");
    patch({ stage: 1 });
  }

  function toggle(id, enabled) {
    patch({ items: (state.items || []).map((i) => (i.id === id ? { ...i, enabled } : i)) });
    log(enabled ? `Automation "${automations.find((i) => i.id === id)?.name}" switched ON.` : "Automation switched OFF.");
  }

  function simulate(id) {
    patch({ items: (state.items || []).map((i) => (i.id === id ? { ...i, simulated: true } : i)) });
    log("Automation simulated before install — no real side effects.");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Stat label="Automations" value={automations.length} tone="var(--lavender)" />
        <Stat label="Active" value={activeCount} tone={activeCount ? "var(--green-accent)" : "var(--gold)"} />
      </div>

      <form onSubmit={addAutomation}>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Name">
            <input className="hey-input w-full" value={tName} onChange={(e) => setTName(e.target.value)} placeholder="e.g. Fajr focus block" aria-label="Automation name" />
          </Field>
          <Field label="When / trigger">
            <input className="hey-input w-full" value={tAction} onChange={(e) => setTAction(e.target.value)} placeholder="e.g. every morning 5:30 AM" aria-label="Automation trigger" />
          </Field>
          <div className="flex items-end">
            <SmallButton kind="primary" style={{ width: "100%" }}>Add automation</SmallButton>
          </div>
        </div>
      </form>

      {automations.length > 0 && (
        <Panel label="Automations" right={<Tag tone={activeCount ? "green" : "lavender"}>{activeCount} running</Tag>}>
          <div className="space-y-2">
            {automations.map((automation) => (
              <div key={automation.id} className="rounded-2xl border border-[rgba(255,255,255,.08)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <strong className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                      <RefreshCw size={13} color="var(--gold)" /> {automation.name}
                    </strong>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">{automation.action}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {automation.simulated ? <Tag tone="green">simulated</Tag> : <SmallButton onClick={() => simulate(automation.id)}>Simulate</SmallButton>}
                    {automation.enabled ? (
                      <SmallButton onClick={() => toggle(automation.id, false)}><PowerOff size={13} /> On — switch off</SmallButton>
                    ) : (
                      <SmallButton onClick={() => toggle(automation.id, true)} kind="primary"><Power size={13} /> Install</SmallButton>
                    )}
                  </div>
                </div>
                {!automation.simulated && <p className="mt-2 text-xs text-[var(--text-muted)]">Not installed yet — simulate first to see what it would do.</p>}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <p className="text-xs text-[var(--text-muted)]">Boundary: every automation has an off switch and runs only on permission. Install only after a simulation you saw.</p>
    </div>
  );
}