import { useState } from "react";
import { Check, X } from "lucide-react";
import { Field, Panel, SmallButton, Tag } from "./primitives.jsx";

export default function FixWB({ workspace }) {
  const { state, patch, log, addCheck, setCheckResult } = workspace;
  const [symptom, setSymptom] = useState("");
  const items = state.items || [];

  function describe(event) {
    event.preventDefault();
    const text = symptom.trim();
    if (!text) return;
    log(`Symptom recorded: "${text}"`);
    patch({
      stage: 1,
      items: items.some((i) => i.kind === "symptom")
        ? items.map((i) => (i.kind === "symptom" ? { ...i, text } : i))
        : [...items, { id: crypto.randomUUID?.() || Date.now(), kind: "symptom", text, at: new Date().toISOString() }],
    });
    addCheck("A repair is demonstrated and verified.");
    setSymptom("");
  }

  function setHypothesis(id, value) {
    log(`Hypothesis set: "${value}"`);
    patch({ items: items.map((i) => (i.id === id ? { ...i, hypothesis: value } : i)) });
  }

  function markRepaired(id) {
    log("Repair applied — awaiting verification.");
    patch({ stage: 2, items: items.map((i) => (i.id === id ? { ...i, repaired: true } : i)) });
  }

  function verify(id, ok) {
    log(ok ? "Verification passed." : "Verification failed — back to hypothesis.");
    patch({ stage: ok ? 3 : 1 });
    const check = state.checks[0];
    if (check) setCheckResult(check.id, ok ? "pass" : "fail");
    if (ok) patch({ items: items.map((i) => (i.id === id ? { ...i, verified: true } : i)) });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={describe}>
        <Field label="What is broken?">
          <div className="flex gap-2">
            <input
              className="hey-input flex-1"
              value={symptom}
              onChange={(e) => setSymptom(e.target.value)}
              placeholder="e.g. Every morning my routine script stops at the same line."
              aria-label="Symptom"
            />
            <SmallButton kind="primary">Record</SmallButton>
          </div>
        </Field>
      </form>

      {items.filter((i) => i.kind === "symptom").map((item) => (
        <Panel key={item.id} label="Repair track" right={<Tag tone={item.verified ? "green" : item.repaired ? "gold" : "coral"}>{item.verified ? "verified" : item.repaired ? "repaired" : "in diagnosis"}</Tag>}>
          <p className="text-sm leading-6 text-[var(--text-primary)]">{item.text}</p>

          <div className="mt-4">
            <Field label="Best hypothesis">
              <input
                className="hey-input w-full"
                value={item.hypothesis || ""}
                onChange={(e) => setHypothesis(item.id, e.target.value)}
                placeholder="What most likely causes it?"
                aria-label="Hypothesis"
              />
            </Field>
          </div>

          {/* Hypothesis must be answered before a repair can stop */}
          {item.hypothesis && !item.repaired && (
            <div className="mt-3 flex flex-wrap gap-2">
              <SmallButton onClick={() => markRepaired(item.id)}><Check size={13} /> Repair applied</SmallButton>
              <SmallButton onClick={() => verify(item.id, false)}><X size={13} /></SmallButton>
            </div>
          )}

          {item.repaired && !item.verified && (
            <div className="mt-3 flex flex-wrap gap-2">
              <SmallButton onClick={() => verify(item.id, true)} kind="primary"><Check size={13} /> Verify fix</SmallButton>
              <SmallButton onClick={() => verify(item.id, false)}><X size={13} /> Still failing</SmallButton>
            </div>
          )}

          {item.verified && (
            <div className="mt-3 flex items-center gap-2 text-sm" style={{ color: "var(--green-accent)" }}>
              <Check size={14} /> Fix verified. The document boundary: done is only done when a verification step proves it.
            </div>
          )}
        </Panel>
      ))}

      {items.filter((i) => i.kind === "symptom").length === 0 && (
        <Panel label="Repair method"><p className="text-sm leading-6 text-[var(--text-secondary)]">Name the symptom → give the best hypothesis → repair → verify. No repair is declared finished without a verification step.</p></Panel>
      )}
    </div>
  );
}