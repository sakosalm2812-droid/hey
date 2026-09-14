import { useState } from "react";
import { Check, Crosshair, GitMerge, MessageSquare } from "lucide-react";
import { Field, Panel, SmallButton, Stat, Tag } from "./primitives.jsx";

export default function CoworkWB({ workspace }) {
  const { state, patch, log, addItem, addCheck, setCheckResult } = workspace;
  const [draft, setDraft] = useState("");
  const brief = state.payload?.brief || "";
  const suggestions = (state.items || []).filter((i) => i.kind === "suggestion");
  const accepted = suggestions.filter((i) => i.accepted).length;

  function setBrief(value) {
    patch({ payload: { ...state.payload, brief: value } });
    if (value.trim()) {
      patch({ stage: 1 });
      log("Mission brief captured.");
    }
  }

  function addSuggestion(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    addItem({ kind: "suggestion", text, accepted: false });
    log("Cross-check surfaced a consideration.");
    setDraft("");
  }

  function accept(id) {
    patch({ items: state.items.map((i) => (i.id === id ? { ...i, accepted: true } : i)) });
    log("Consideration accepted into the deliverable.");
  }

  function crossCheck() {
    patch({ stage: 2 });
    addCheck("Every accepted consideration is reflected in the deliverable.");
    const checkId = state.checks.find((c) => c.text.includes("Every accepted"))?.id;
    if (checkId) setCheckResult(checkId, suggestions.some((i) => i.accepted) ? "pass" : "fail");
    log(suggestions.some((i) => i.accepted) ? "Cross-check complete." : "Cross-check failed: nothing accepted yet.");
  }

  function deliver() {
    patch({ stage: 3 });
    log("Deliverable exported.");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Considerations" value={suggestions.length} tone="var(--lavender)" />
        <Stat label="Accepted" value={accepted} tone="var(--green-accent)" />
        <Stat label="Stage" value={["Brief", "Cross-check", "Deliverable"][state.stage] || "Brief"} tone="var(--gold)" />
      </div>

      <Panel label="Mission brief" right={<Crosshair size={15} color="var(--gold)" />}>
        <textarea
          className="hey-input w-full"
          rows={3}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="What are we building together?"
          aria-label="Mission brief"
        />
      </Panel>

      <form onSubmit={addSuggestion}>
        <Field label="Add a consideration HEY should weigh">
          <div className="flex gap-2">
            <input className="hey-input flex-1" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="A risk, an assumption, a better angle…" aria-label="Consideration" />
            <SmallButton>Add</SmallButton>
          </div>
        </Field>
      </form>

      {suggestions.length > 0 && (
        <Panel label="Cross-check queue">
          <div className="space-y-2">
            {suggestions.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[rgba(255,255,255,.08)] p-3">
                <div className="flex items-start gap-2">
                  <MessageSquare size={14} className="mt-0.5 shrink-0" color="var(--lavender)" />
                  <span className="text-sm leading-6 text-[var(--text-primary)]">{item.text}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.accepted ? <Tag tone="green">accepted</Tag> : <SmallButton onClick={() => accept(item.id)}><Check size={13} /> Accept</SmallButton>}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="flex items-center gap-2">
        <SmallButton onClick={crossCheck}><GitMerge size={13} /> Run cross-check</SmallButton>
        {state.stage >= 2 && <SmallButton onClick={deliver} kind="primary">Mark delivered</SmallButton>}
      </div>
      <p className="text-xs text-[var(--text-muted)]">Boundary: HEY never claims the deliverable is final without an honest cross-check of its own suggestions.</p>
    </div>
  );
}