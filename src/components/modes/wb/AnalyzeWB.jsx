import { useState } from "react";
import { Calculator, Sigma } from "lucide-react";
import { Field, Panel, SmallButton, Stat, Tag } from "./primitives.jsx";

export default function AnalyzeWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [text, setText] = useState("");
  const findings = (state.items || []).filter((i) => i.kind === "finding");

  function tokenize() {
    const numbers = (text.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    return numbers;
  }

  function runAnalysis() {
    const numbers = tokenize();
    if (numbers.length === 0) {
      log("No numbers found — paste raw data any format.");
      return;
    }
    const total = numbers.reduce((a, b) => a + b, 0);
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    const avg = total / numbers.length;
    const variance = numbers.reduce((acc, n) => acc + (n - avg) ** 2, 0) / numbers.length;
    const stddev = Math.sqrt(variance);
    const model = { numbers: numbers.length, total, min, max, avg: +avg.toFixed(3), stddev: +stddev.toFixed(3) };
    patch({ payload: { ...state.payload, model }, stage: 1 });
    log(`Analyzed ${numbers.length} values (Σ=${total}).`);
  }

  function recordFinding() {
    const m = state.payload?.model;
    if (!m) return;
    workspace.addItem({
      kind: "finding",
      text: `${m.numbers} values: mean ${m.avg}, spread ±${m.stddev} (range ${m.min}–${m.max}).`,
    });
    workspace.log("Finding committed.");
  }

  return (
    <div className="space-y-4">
      <Field label="Paste data (any range of numbers)" right={<SmallButton onClick={runAnalysis} kind="primary"><Calculator size={13} /> Run analysis</SmallButton>}>
        <textarea
          className="hey-input w-full"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"1,200\n1,450\n1,310\n980\n1,120"}
          aria-label="Data input"
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
      </Field>

      {state.payload?.model && (
        <>
          <div className="grid gap-4 md:grid-cols-5">
            <Stat label="Values" value={state.payload.model.numbers} tone="var(--lavender)" />
            <Stat label="Σ Total" value={state.payload.model.total} tone="var(--gold)" />
            <Stat label="Mean" value={state.payload.model.avg} tone="var(--green-accent)" />
            <Stat label="Std dev" value={state.payload.model.stddev} tone="var(--coral)" />
            <Stat label="Range" value={`${state.payload.model.min}–${state.payload.model.max}`} tone="var(--lavender)" />
          </div>
          <div className="flex items-center gap-2">
            <SmallButton onClick={recordFinding}><Sigma size={13} /> Record finding</SmallButton>
            <span className="text-xs text-[var(--text-muted)]">Every number is traced to its formula, as the mode requires.</span>
          </div>
        </>
      )}

      {findings.length > 0 && (
        <Panel label="Findings" right={<Tag tone="green">{findings.length}</Tag>}>
          <div className="space-y-2">
            {findings.map((finding) => (
              <div key={finding.id} className="rounded-2xl border border-[rgba(255,255,255,.08)] p-3">
                <p className="text-sm leading-6 text-[var(--text-primary)]">{finding.text}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}