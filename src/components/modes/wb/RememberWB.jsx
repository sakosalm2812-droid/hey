import { useState } from "react";
import { Brain, Inbox, RefreshCw, Save } from "lucide-react";
import { Field, Panel, SmallButton, Stat, Tag } from "./primitives.jsx";

export default function RememberWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [fact, setFact] = useState("");
  const [scope, setScope] = useState("personal");
  const memories = (state.items || []).filter((i) => i.kind === "memory");

  function capture(event) {
    event.preventDefault();
    const text = fact.trim();
    if (!text) return;
    workspace.addItem({
      kind: "memory",
      text,
      scope,
      expiry: "forever",
      at: new Date().toISOString(),
    });
    workspace.log(`Memory deposited (${scope}).`);
    setFact("");
    patch({ stage: 1 });
  }

  function toggleExpiry(id) {
    patch({ items: (state.items || []).map((i) => (i.id === id ? { ...i, expiry: i.expiry === "forever" ? "30 days" : "forever" } : i)) });
  }

  function forget(id) {
    patch({ items: (state.items || []).filter((i) => i.id !== id) });
    log("Memory superseded.");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Memories" value={memories.length} tone="var(--gold)" />
        <Stat label="Scopes" value={new Set(memories.map((m) => m.scope)).size} tone="var(--lavender)" />
        <Stat label="Durable" value={memories.filter((m) => m.expiry === "forever").length} tone="var(--green-accent)" />
      </div>

      <form onSubmit={capture}>
        <Field label="What should HEY remember?" right={
          <select className="hey-input" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Memory scope" style={{ width: 140, fontSize: 12 }}>
            <option value="personal">Personal</option>
            <option value="work">Work</option>
            <option value="deed">Deen</option>
            <option value="temporary">Temporary</option>
          </select>
        }>
          <div className="flex gap-2">
            <input className="hey-input flex-1" value={fact} onChange={(e) => setFact(e.target.value)} placeholder="A durable fact, a preference, a promise…" aria-label="Memory text" />
            <SmallButton kind="primary" type="submit"><Save size={13} /> Deposit</SmallButton>
          </div>
        </Field>
      </form>

      {memories.length > 0 && (
        <Panel label="The Cosmos" right={<Tag tone="gold">{memories.length} kept</Tag>}>
          <div className="space-y-2">
            {memories.map((memory) => (
              <div key={memory.id} className="rounded-2xl border border-[rgba(255,255,255,.08)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Brain size={16} className="mt-1 shrink-0" color="var(--gold)" />
                    <div>
                      <p className="text-sm leading-6 text-[var(--text-primary)]">{memory.text}</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {memory.scope} · {memory.expiry} · {new Date(memory.at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <SmallButton onClick={() => toggleExpiry(memory.id)}><RefreshCw size={13} /> {memory.expiry === "forever" ? "Make temporary" : "Make permanent"}</SmallButton>
                    <SmallButton onClick={() => forget(memory.id)}><Inbox size={13} /> Forget</SmallButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <p className="text-xs text-[var(--text-muted)]">Boundary: memories carry source, scope, and expiry. Nothing is assumed permanent unless you say so.</p>
    </div>
  );
}