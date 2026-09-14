import { useState } from "react";
import { Compass, Sparkles } from "lucide-react";
import { Field, Panel, SmallButton, Tag } from "./primitives.jsx";

const DIRECTIONS = [
  "follow the surprising contrast in it",
  "turn it sideways and ask 'what if it's the opposite?'",
  "connect it to something from your past work",
  "ask who would disagree and why",
  "find the small, concrete next question",
];

function pickDirection() {
  return DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
}

export default function ExploreWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [seed, setSeed] = useState("");
  const sparks = (state.items || []).filter((i) => i.kind === "spark");

  function spark(event) {
    event.preventDefault();
    const text = seed.trim();
    if (!text) return;
    log(`Exploration seed: "${text}".`);
    patch({ stage: 1 });
    workspace.addItem({
      kind: "spark",
      text,
      path: pickDirection(),
    });
    workspace.log("Spark captured with a direction.");
    setSeed("");
  }

  function fanOut(spark) {
    const branch = `${spark.text} — ${pickDirection()}`;
    workspace.addItem({ kind: "spark", text: branch, path: "branch" });
    workspace.log("Branched a new direction.");
  }

  return (
    <div className="space-y-4">
      <form onSubmit={spark}>
        <Field label="What are you curious about?" right={<SmallButton kind="primary" type="submit"><Compass size={13} /> Explore</SmallButton>}>
          <input className="hey-input w-full" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="A word, a question, a half-formed hunch…" aria-label="Curiosity seed" />
        </Field>
      </form>

      {sparks.length > 0 && (
        <Panel label="Spark radar" right={<Tag tone="gold">{sparks.length} sparks</Tag>}>
          <div className="space-y-2">
            {sparks.map((spark) => (
              <div key={spark.id} className="rounded-2xl border border-[rgba(255,255,255,.08)] p-4">
                <div className="flex items-start gap-2">
                  <Sparkles size={14} className="mt-1 shrink-0" color="var(--gold)" />
                  <div>
                    <p className="text-sm leading-6 text-[var(--text-primary)]">{spark.text}</p>
                    <p className="mt-1 text-xs italic text-[var(--text-muted)]">{spark.path}</p>
                  </div>
                </div>
                <div className="mt-3">
                  <SmallButton onClick={() => fanOut(spark)}>Branch this</SmallButton>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <p className="text-xs text-[var(--text-muted)]">Boundary: exploration follows your seed — it never redirects to a sales agenda.</p>
    </div>
  );
}