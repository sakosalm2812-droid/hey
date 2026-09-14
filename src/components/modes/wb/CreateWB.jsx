import { useState } from "react";
import { Copy, Sparkles, Trash2 } from "lucide-react";
import { Field, Panel, SmallButton, Tag } from "./primitives.jsx";

export default function CreateWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [seed, setSeed] = useState("");
  const artifacts = (state.items || []).filter((i) => i.kind === "artifact");
  const [scratch, setScratch] = useState("");

  function iterate(event) {
    event.preventDefault();
    const text = seed.trim();
    if (!text) return;
    const directions = ["make the opening land harder", "find one surprising twist", "make the middle earn the end", "say the same thing quieter", "swap the first and last beat"];
    const pick = directions[Math.floor(Math.random() * directions.length)];
    const next = `${text} — then ${pick}.`;
    patch({ payload: { ...state.payload, last: next }, stage: 1 });
    log(`Direction: ${pick}`);
    setSeed("");
  }

  function commit() {
    if (!scratch.trim()) return;
    workspace.addItem({ kind: "artifact", text: scratch.trim() });
    workspace.log("Artifact committed to the surface.");
    setScratch("");
  }

  function remove(id) {
    patch({ items: (state.items || []).filter((i) => i.id !== id) });
    log("Artifact archived.");
  }

  function copy(text) {
    navigator.clipboard?.writeText(text).catch(() => {});
    log("Copied to clipboard.");
  }

  return (
    <div className="space-y-4">
      <form onSubmit={iterate}>
        <Field label="A seed">
          <div className="flex gap-2">
            <input className="hey-input flex-1" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="One line: an idea, an image, a problem…" aria-label="Creative seed" />
            <SmallButton kind="primary"><Sparkles size={13} /> Iterate</SmallButton>
          </div>
        </Field>
      </form>

      {state.payload?.last && (
        <Panel label="Current direction" right={<Tag tone="gold">draft</Tag>}>
          <p className="text-sm leading-6 text-[var(--text-primary)]">{state.payload.last}</p>
          <div className="mt-3 flex gap-2">
            <SmallButton onClick={() => setScratch(state.payload.last)}>Keep this</SmallButton>
            <SmallButton onClick={() => copy(state.payload.last)}><Copy size={13} /> Copy</SmallButton>
          </div>
        </Panel>
      )}

      <Panel label="Shape the artifact">
        <textarea
          className="hey-input w-full"
          rows={6}
          value={scratch}
          onChange={(e) => setScratch(e.target.value)}
          placeholder="Work the piece here before committing it…"
          aria-label="Artifact work area"
        />
        <div className="mt-3">
          <SmallButton onClick={commit} kind="primary">Commit to surface</SmallButton>
        </div>
      </Panel>

      {artifacts.length > 0 && (
        <Panel label="Committed artifacts" right={<Tag tone="lavender">{artifacts.length}</Tag>}>
          <div className="space-y-2">
            {artifacts.map((artifact) => (
              <div key={artifact.id} className="rounded-2xl border border-[rgba(255,255,255,.08)] p-3">
                <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">{artifact.text}</p>
                <div className="mt-2 flex gap-2">
                  <SmallButton onClick={() => copy(artifact.text)}><Copy size={13} /> Copy</SmallButton>
                  <SmallButton onClick={() => remove(artifact.id)}><Trash2 size={13} /> Remove</SmallButton>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <p className="text-xs text-[var(--text-muted)]">Boundary: generated work is labeled as generated, never silently passed off as finished.</p>
    </div>
  );
}