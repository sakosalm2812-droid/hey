import { useState } from "react";
import { Heart, PenLine } from "lucide-react";
import { Field, Panel, SmallButton, Stat } from "./primitives.jsx";

export default function PersonalWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [oneThing, setOneThing] = useState("");
  const [journalText, setJournalText] = useState("");
  const entries = (state.items || []).filter((i) => i.kind === "journal");

  function setFocus(event) {
    event.preventDefault();
    const text = oneThing.trim();
    if (!text) return;
    patch({ payload: { ...state.payload, oneThing: text } });
    log(`One thing: "${text}".`);
    setOneThing("");
  }

  function journal(event) {
    event.preventDefault();
    const text = journalText.trim();
    if (!text) return;
    workspace.addItem({ kind: "journal", text, at: new Date().toISOString() });
    workspace.log("Journal entry kept private.");
    setJournalText("");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Stat label="One thing" value={state.payload?.oneThing ? "set" : "—"} tone={state.payload?.oneThing ? "var(--green-accent)" : "var(--text-muted)"} />
        <Stat label="Journal entries" value={entries.length} tone="var(--lavender)" />
      </div>

      <form onSubmit={setFocus}>
        <Field label="The one thing that matters today">
          <div className="flex gap-2">
            <input className="hey-input flex-1" value={oneThing} onChange={(e) => setOneThing(e.target.value)} placeholder="Your focus, held honestly…" aria-label="One thing" />
            <SmallButton kind="primary" type="submit"><Heart size={13} /> Keep</SmallButton>
          </div>
        </Field>
      </form>

      <form onSubmit={journal}>
        <Field label="Private journal" right={<SmallButton type="submit"><PenLine size={13} /> Add</SmallButton>}>
          <textarea className="hey-input w-full" rows={4} value={journalText} onChange={(e) => setJournalText(e.target.value)} placeholder="Whatever is on your mind — this stays inside your account." aria-label="Journal entry" />
        </Field>
      </form>

      {entries.length > 0 && (
        <Panel label="Journal">
          <div className="space-y-2">
            {entries.slice(-4).reverse().map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-[rgba(255,255,255,.08)] p-4">
                <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">{entry.text}</p>
                <span className="mt-2 block text-xs text-[var(--text-muted)]">{new Date(entry.at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <p className="text-xs text-[var(--text-muted)]">Boundary: this surface keeps your private content inside your account — never passed to a shared tool.</p>
    </div>
  );
}