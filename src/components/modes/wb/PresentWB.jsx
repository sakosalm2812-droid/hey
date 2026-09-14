import { useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Plus, Trash2 } from "lucide-react";
import { Field, Panel, SmallButton, Stat } from "./primitives.jsx";

export default function PresentWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [line, setLine] = useState("");
  const [index, setIndex] = useState(0);
  const slides = (state.items || []).filter((i) => i.kind === "slide");

  function addSlide(event) {
    event.preventDefault();
    const text = line.trim();
    if (!text) return;
    workspace.addItem({ kind: "slide", text });
    workspace.log(`Slide added: "${text.slice(0, 48)}${text.length > 48 ? "…" : ""}".`);
    setLine("");
  }

  function removeSlide(id) {
    patch({ items: (state.items || []).filter((i) => i.id !== id) });
    setIndex((current) => Math.max(0, Math.min(current, slides.length - 2)));
    log("Slide removed.");
  }

  function startPresenting() {
    patch({ stage: 1 });
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    log("Presenter mode started. You control the pace.");
  }

  function step(dir) {
    setIndex((current) => Math.max(0, Math.min(current + dir, slides.length - 1)));
  }

  const current = slides[index];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Stat label="Slides" value={slides.length} tone="var(--lavender)" />
        <Stat label="On screen" value={slides.length ? index + 1 : 0} tone="var(--gold)" />
      </div>

      <form onSubmit={addSlide}>
        <Field label="Add a slide" right={<SmallButton type="submit"><Plus size={13} /> Add</SmallButton>}>
          <input className="hey-input w-full" value={line} onChange={(e) => setLine(e.target.value)} placeholder="One idea per slide…" aria-label="Slide text" />
        </Field>
      </form>

      <Panel label="Storyboard" right={slides.length >= 2 && <SmallButton onClick={startPresenting} kind="primary"><Maximize2 size={13} /> Present</SmallButton>}>
        {slides.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Add a few slides, then present. Nothing advances on its own — you hold the pace.</p>
        ) : (
          <div className="grid gap-2">
            {slides.map((slide, i) => (
              <div key={slide.id} className={`flex items-center gap-3 rounded-2xl border p-3 ${i === index ? "" : ""}`} style={{ borderColor: i === index ? "var(--gold)" : "rgba(255,255,255,.08)", background: i === index ? "rgba(247,201,111,.06)" : "rgba(255,255,255,.02)" }}>
                <span className="w-6 shrink-0 text-center text-xs" style={{ color: i === index ? "var(--gold)" : "var(--text-muted)" }}>{i + 1}</span>
                <span className="flex-1 text-sm leading-6 text-[var(--text-primary)]">{slide.text}</span>
                <SmallButton onClick={() => removeSlide(slide.id)}><Trash2 size={12} /></SmallButton>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {current && state.stage >= 1 && (
        <div className="glass-card p-10" style={{ minHeight: 280, textAlign: "center" }}>
          <p className="mx-auto max-w-xl font-heading text-4xl leading-tight text-[var(--text-primary)]">{current.text}</p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <SmallButton onClick={() => step(-1)} style={{ minWidth: 80 }}><ChevronLeft size={14} /> Back</SmallButton>
            <span className="text-xs text-[var(--text-muted)]">{index + 1} / {slides.length}</span>
            <SmallButton onClick={() => step(1)} style={{ minWidth: 80 }}>Next <ChevronRight size={14} /></SmallButton>
          </div>
        </div>
      )}
    </div>
  );
}