import { useState } from "react";
import { CheckSquare, Plus, Target } from "lucide-react";
import { Field, Panel, SmallButton, Stat, Tag } from "./primitives.jsx";

export default function PlanWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [option, setOption] = useState("");
  const [crit, setCrit] = useState("");
  const options = (state.items || []).filter((i) => i.kind === "option");
  const criteria = (state.payload?.criteria) || [];

  function addOption(event) {
    event.preventDefault();
    const text = option.trim();
    if (!text) return;
    addOptionWorkspace(text);
    setOption("");
  }

  function addOptionWorkspace(text) {
    workspace.addItem({ kind: "option", text, scores: {} });
    workspace.log(`Option added: "${text}".`);
    patch({ stage: 1 });
  }

  function addCriteria(event) {
    event.preventDefault();
    const text = crit.trim();
    if (!text) return;
    patch({ payload: { ...state.payload, criteria: [...criteria, text] } });
    setCrit("");
    log(`Criterion added: "${text}".`);
  }

  function score(id, c, value) {
    patch({ items: (state.items || []).map((i) => (i.id === id ? { ...i, scores: { ...i.scores, [c]: value } } : i)) });
  }

  function total(option) {
    return criteria.reduce((sum, c) => sum + (Number(option.scores?.[c]) || 0), 0);
  }

  function decide() {
    const ranked = [...options].sort((a, b) => total(b) - total(a));
    const winner = ranked[0];
    patch({ payload: { ...state.payload, winner: winner?.text || "", ranking: ranked.map((r) => r.text) }, stage: 2 });
    log(winner ? `Plan aligned to: "${winner.text}".` : "Nothing ranked — add options first.");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Options" value={options.length} tone="var(--lavender)" />
        <Stat label="Criteria" value={criteria.length} tone="var(--gold)" />
        <Stat label="Chosen" value={state.payload?.winner ? "yes" : "—"} tone={state.payload?.winner ? "var(--green-accent)" : "var(--text-muted)"} />
      </div>

      <form onSubmit={addOption}>
        <Field label="An option on the table">
          <div className="flex gap-2">
            <input className="hey-input flex-1" value={option} onChange={(e) => setOption(e.target.value)} placeholder="e.g. Stay in current city, Move to Duhok, Remote-first" aria-label="Option" />
            <SmallButton kind="primary"><Plus size={13} /> Add</SmallButton>
          </div>
        </Field>
      </form>

      <form onSubmit={addCriteria}>
        <Field label="A criterion for deciding">
          <div className="flex gap-2">
            <input className="hey-input flex-1" value={crit} onChange={(e) => setCrit(e.target.value)} placeholder="e.g. distance to family, cost, growth potential" aria-label="Criterion" />
            <SmallButton><Target size={13} /> Add</SmallButton>
          </div>
        </Field>
      </form>

      {options.length > 0 && criteria.length > 0 && (
        <Panel label="Score the options" right={<SmallButton onClick={decide} kind="primary"><CheckSquare size={13} /> Decide</SmallButton>}>
          <div className="space-y-2">
            {options.map((option) => (
              <div key={option.id} className="rounded-2xl border border-[rgba(255,255,255,.08)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm text-[var(--text-primary)]">{option.text}</strong>
                  <Tag tone="gold">{total(option)}</Tag>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {criteria.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <span className="min-w-0 truncate">{c}</span>
                      <input
                        type="range" min={1} max={10} value={Number(option.scores?.[c]) || 5}
                        onChange={(e) => score(option.id, c, e.target.value)}
                        aria-label={`Score ${option.text} on ${c}`}
                        className="flex-1"
                      />
                      <span className="w-6 text-right">{Number(option.scores?.[c]) || 5}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {state.payload?.ranking && (
        <Panel label="Plan of record" right={<Tag tone="green">decided</Tag>}>
          <ol className="space-y-1">
            {state.payload.ranking.map((name, i) => (
              <li key={name} className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                <span className="w-5 text-center text-xs" style={{ color: i === 0 ? "var(--gold)" : "var(--text-muted)" }}>{i + 1}</span>
                {name}
              </li>
            ))}
          </ol>
        </Panel>
      )}

      <p className="text-xs text-[var(--text-muted)]">Boundary: every plan shows its options, criteria, and who owns the next step. Nothing is hidden.</p>
    </div>
  );
}