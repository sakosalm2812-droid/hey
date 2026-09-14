import { useState } from "react";
import { Check, MessageSquarePlus, ShieldCheck, X } from "lucide-react";
import { Field, Panel, SmallButton, Stat, Tag } from "./primitives.jsx";

export default function ReviewWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [rev, setRev] = useState("");
  const items = (state.items || []).filter((i) => i.kind === "review");
  const passed = items.filter((i) => i.result === "pass").length;
  const failed = items.filter((i) => i.result === "fail").length;

  function addReviewItem(event) {
    event.preventDefault();
    const text = rev.trim();
    if (!text) return;
    workspace.addItem({ kind: "review", text, result: null, appeal: "" });
    workspace.log(`Under review: "${text}".`);
    setRev("");
  }

  function decide(id, result) {
    patch({ items: (state.items || []).map((i) => (i.id === id ? { ...i, result } : i)) });
    log(result === "pass" ? "Item passed review." : "Item flagged for appeal.");
  }

  function appeal(event, id) {
    event.preventDefault();
    const text = event.currentTarget.elements.namedItem("appeal")?.value?.trim();
    if (!text) return;
    patch({ items: (state.items || []).map((i) => (i.id === id ? { ...i, appeal: text, result: "pending_appeal" } : i)) });
    log("Appeal filed with new evidence.");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="In review" value={items.length - passed - failed} tone="var(--lavender)" />
        <Stat label="Passed" value={passed} tone="var(--green-accent)" />
        <Stat label="Failed" value={failed} tone="var(--coral)" />
      </div>

      <form onSubmit={addReviewItem}>
        <Field label="Something to review" right={<SmallButton type="submit"><ShieldCheck size={13} /> Add</SmallButton>}>
          <input className="hey-input w-full" value={rev} onChange={(e) => setRev(e.target.value)} placeholder="A decision, a deliverable, a claim worth double-checking…" aria-label="Review item" />
        </Field>
      </form>

      {items.length > 0 && (
        <Panel label="Review queue">
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-[rgba(255,255,255,.08)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm leading-6 text-[var(--text-primary)]">{item.text}</span>
                  {item.result === "pass" && <Tag tone="green">passed</Tag>}
                  {item.result === "fail" && <Tag tone="coral">failed</Tag>}
                  {item.result === "pending_appeal" && <Tag tone="gold">appeal pending</Tag>}
                </div>

                {!item.result && (
                  <div className="mt-3 flex gap-2">
                    <SmallButton onClick={() => decide(item.id, "pass")} kind="primary"><Check size={13} /> Pass</SmallButton>
                    <SmallButton onClick={() => decide(item.id, "fail")}><X size={13} /> Fail</SmallButton>
                  </div>
                )}

                {item.result === "fail" && !item.appeal && (
                  <form className="mt-3 flex gap-2" onSubmit={(e) => appeal(e, item.id)}>
                    <input name="appeal" className="hey-input flex-1" placeholder="New evidence that changes the verdict…" aria-label="Appeal evidence" />
                    <SmallButton type="submit" kind="primary"><MessageSquarePlus size={13} /> Appeal</SmallButton>
                  </form>
                )}

                {item.appeal && <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">Appeal: {item.appeal}</p>}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <p className="text-xs text-[var(--text-muted)]">Boundary: a failed check can always be appealed with new evidence. Second eyes on everything that matters.</p>
    </div>
  );
}