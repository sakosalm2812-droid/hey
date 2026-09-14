import { useState } from "react";
import { Check, Copy, MoveRight } from "lucide-react";
import { Panel, SmallButton, Tag } from "./primitives.jsx";

const SCHEMES = [
  { id: "ocean", name: "Ocean", background: "#061A2A", surface: "#0B2A3A", accent: "#8ED8FF", gold: "#F7C96F" },
  { id: "ember", name: "Ember", background: "#140A08", surface: "#24120C", accent: "#FF9E7A", gold: "#F2C14E" },
  { id: "moss", name: "Moss", background: "#0A120C", surface: "#12211A", accent: "#7CB87C", gold: "#E7C26A" },
  { id: "violet", name: "Violet", background: "#0E0A18", surface: "#1A1130", accent: "#C9D4E0", gold: "#D9B55D" },
];

export default function DesignWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [schemeId, setSchemeId] = useState(SCHEMES[0].id);
  const [copyText, setCopyText] = useState("");
  const scheme = SCHEMES.find((s) => s.id === schemeId);
  const saved = (state.items || []).filter((i) => i.kind === "scheme");

  function select(id) {
    setSchemeId(id);
    patch({ payload: { ...state.payload, scheme: id }, stage: 1 });
    log(`Design direction: ${SCHEMES.find((s) => s.id === id)?.name}.`);
  }

  function keep() {
    workspace.addItem({ kind: "scheme", name: scheme.name, background: scheme.background, accent: scheme.accent });
    workspace.log(`Saved ${scheme.name} to the palette drawer.`);
  }

  function copyScheme() {
    const token = `--bg-primary: ${scheme.background};\n--bg-secondary: ${scheme.surface};\n--accent: ${scheme.accent};\n--gold: ${scheme.gold};`;
    navigator.clipboard?.writeText(token).catch(() => {});
    setCopyText(token);
    log("Scheme tokens copied.");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {SCHEMES.map((s) => (
          <button key={s.id} type="button" onClick={() => select(s.id)} className="rounded-2xl border p-3 text-left transition" style={{ borderColor: schemeId === s.id ? "var(--gold)" : "rgba(255,255,255,.08)", background: s.background }}>
            <span className="text-xs font-semibold text-[var(--text-primary)]">{s.name}</span>
            <div className="mt-2 flex gap-1">
              <span className="h-5 w-5 rounded-full" style={{ background: s.background }} />
              <span className="h-5 w-5 rounded-full" style={{ background: s.surface }} />
              <span className="h-5 w-5 rounded-full" style={{ background: s.accent }} />
              <span className="h-5 w-5 rounded-full" style={{ background: s.gold }} />
            </div>
          </button>
        ))}
      </div>

      <Panel label="Live preview" right={scheme ? <Tag tone="green">{scheme.name}</Tag> : <MoveRight size={14} color="var(--text-muted)" />}>
        <div className="rounded-3xl p-6" style={{ background: scheme.background, border: "1px solid rgba(255,255,255,.1)" }}>
          <div className="rounded-2xl p-5" style={{ background: scheme.surface }}>
            <p style={{ color: scheme.text || "#fff", fontSize: 20, fontFamily: "var(--font-heading)" }}>Brand story</p>
            <p style={{ color: "rgba(255,255,255,.7)", fontSize: 13, lineHeight: 1.7 }}>The palette sets the mood before a single word is read.</p>
            <div className="mt-4 flex gap-2">
              <span className="rounded-full px-4 py-2 text-xs font-semibold" style={{ background: scheme.accent, color: "#000" }}>Primary</span>
              <span className="rounded-full px-4 py-2 text-xs font-semibold" style={{ background: scheme.gold, color: "#000" }}>Gold</span>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <SmallButton onClick={keep} kind="primary"><Check size={13} /> Keep to drawer</SmallButton>
          <SmallButton onClick={copyScheme}><Copy size={13} /> Copy tokens</SmallButton>
        </div>
        {copyText && <pre className="mt-3 rounded-2xl p-4 text-xs leading-6" style={{ background: "rgba(0,0,0,.3)", color: "var(--green-accent)", fontFamily: "monospace" }}>{copyText}</pre>}
      </Panel>

      {saved.length > 0 && (
        <Panel label="Palette drawer" right={<Tag tone="lavender">{saved.length}</Tag>}>
          <div className="space-y-2">
            {saved.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-[rgba(255,255,255,.08)] p-3">
                <span className="h-8 w-8 rounded-lg" style={{ background: item.background }} />
                <span className="h-8 w-8 rounded-lg" style={{ background: item.accent }} />
                <span className="text-sm text-[var(--text-primary)]">{item.name}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <p className="text-xs text-[var(--text-muted)]">Boundary: designs ship as prototypes until you approve the direction.</p>
    </div>
  );
}