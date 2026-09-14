import { useState } from "react";
import { Check, Eye } from "lucide-react";
import { Panel, SmallButton, Stat } from "./primitives.jsx";

export default function AccessWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [bigText, setBigText] = useState(false);
  const [contrast, setContrast] = useState(false);
  const [mono, setMono] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [applied, setApplied] = useState(false);

  function apply() {
    const html = document.documentElement;
    html.classList.toggle("hey-bigtext", bigText);
    html.classList.toggle("hey-high-contrast", contrast);
    html.classList.toggle("hey-mono", mono);
    if (reducedMotion) {
      html.classList.add("hey-reduce-motion");
    } else {
      html.classList.remove("hey-reduce-motion");
    }
    patch({ payload: { ...state.payload, bigText, contrast, mono, reducedMotion }, stage: 1 });
    setApplied(true);
    log("Access adjustments applied after confirmation.");
  }

  const Toggles = [
    { key: "bigText", label: "Larger text", value: bigText, set: setBigText, desc: "Increase base font size across the app." },
    { key: "contrast", label: "High contrast", value: contrast, set: setContrast, desc: "Strengthen foreground/background contrast." },
    { key: "mono", label: "Readable font", value: mono, set: setMono, desc: "Prefer a clear, readable typeface." },
    { key: "reducedMotion", label: "Reduce motion", value: reducedMotion, set: setReducedMotion, desc: "Minimize animations and transitions." },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Stat label="Adjustments" value={Toggles.filter((t) => t.value).length} tone="var(--lavender)" />
        <Stat label="Applied" value={applied ? "yes" : "pending"} tone={applied ? "var(--green-accent)" : "var(--gold)"} />
      </div>

      <Panel
        label="How HEY looks & feels for you"
        right={<SmallButton onClick={apply} kind="primary"><Check size={13} /> Apply</SmallButton>}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {Toggles.map((t) => (
            <label key={t.key} className="flex items-start gap-3 rounded-2xl border border-[rgba(255,255,255,.08)] p-4" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={t.value}
                onChange={() => t.set(!t.value)}
                aria-label={t.label}
                style={{ accentColor: "var(--gold)", marginTop: 4 }}
              />
              <span>
                <strong className="block text-sm text-[var(--text-primary)]">{t.label}</strong>
                <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{t.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </Panel>

      {applied && (
        <div className="rounded-2xl border border-[rgba(124,184,124,.3)] p-4 text-sm text-[var(--green-accent)]">
          <Eye size={14} className="mr-2 inline" /> Adjustments live. Switch this surface off and back on to preview the before state anytime.
        </div>
      )}

      <p className="text-xs text-[var(--text-muted)]">Boundary: every access change is reversible and applied only after your confirmation.</p>
    </div>
  );
}