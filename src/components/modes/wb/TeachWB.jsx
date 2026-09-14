import { useState } from "react";
import { BookOpen, Check, GraduationCap, Plus, Repeat } from "lucide-react";
import { Field, Panel, SmallButton, Stat, Tag } from "./primitives.jsx";

export default function TeachWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [concept, setConcept] = useState("");
  const [flash, setFlash] = useState("");
  const [revealed, setRevealed] = useState(null);
  const cards = (state.items || []).filter((i) => i.kind === "card");
  const known = cards.filter((i) => i.known).length;

  function focusTopic(event) {
    event.preventDefault();
    const text = concept.trim();
    if (!text) return;
    patch({ payload: { ...state.payload, topic: text }, stage: 1 });
    log(`Study topic: "${text}"`);
    setConcept("");
  }

  function addCard(event) {
    event.preventDefault();
    const text = flash.trim();
    if (!text) return;
    workspace.addItem({ kind: "card", text, known: false });
    workspace.log(`Flashcard added: "${text}"`);
    setFlash("");
  }

  function markKnown(id) {
    patch({ items: (state.items || []).map((i) => (i.id === id ? { ...i, known: true } : i)) });
    log("Card mastered.");
  }

  function checkGraduation() {
    if (cards.length > 0 && known === cards.length) {
      patch({ stage: 2 });
      log("All cards mastered — teaching session complete.");
    } else {
      log(`Graduation needs ${cards.length - known} more mastered card${cards.length - known === 1 ? "" : "s"}.`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Topic" value={state.payload?.topic || "—"} tone="var(--lavender)" />
        <Stat label="Cards" value={cards.length} tone="var(--gold)" />
        <Stat label="Mastered" value={known} tone={known === cards.length && cards.length > 0 ? "var(--green-accent)" : "var(--coral)"} />
      </div>

      <form onSubmit={focusTopic}>
        <Field label="What do you want to learn?">
          <div className="flex gap-2">
            <input className="hey-input flex-1" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="e.g. Arabic verb forms, the water cycle, Python closures" aria-label="Study topic" />
            <SmallButton kind="primary">Focus</SmallButton>
          </div>
        </Field>
      </form>

      <form onSubmit={addCard}>
        <Field label="Add a flashcard" right={
          <SmallButton type="submit"><Plus size={13} /> Add</SmallButton>
        }>
          <input className="hey-input w-full" value={flash} onChange={(e) => setFlash(e.target.value)} placeholder="A fact worth remembering…" aria-label="Flashcard" />
        </Field>
      </form>

      {cards.length > 0 && (
        <Panel label="Recall deck" right={<Repeat size={15} color="var(--lavender)" />}>
          <div className="space-y-2">
            {cards.map((card) => (
              <div key={card.id} className="rounded-2xl border border-[rgba(255,255,255,.08)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm leading-6 text-[var(--text-primary)]">{card.text}</span>
                  {card.known ? <Tag tone="green">mastered</Tag> : <div className="flex gap-2"><SmallButton onClick={() => setRevealed(revealed === card.id ? null : card.id)}>Reveal</SmallButton><SmallButton onClick={() => markKnown(card.id)} kind="primary"><Check size={13} /> Know it</SmallButton></div>}
                </div>
                {revealed === card.id && !card.known && <p className="mt-2 text-xs text-[var(--text-muted)]">Remember from your study material, then say it out loud before marking it mastered.</p>}
              </div>
            ))}
          </div>

          <div className="mt-4">
            <SmallButton onClick={checkGraduation}><GraduationCap size={13} /> Graduation check</SmallButton>
            {state.stage >= 2 && (
              <p className="mt-2 text-sm" style={{ color: "var(--green-accent)" }}>Session complete — all cards recalled.</p>
            )}
          </div>
        </Panel>
      )}

      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <BookOpen size={12} /> Progress is honest: you graduate by recall, not by hours spent.</div>
    </div>
  );
}