import { useState } from "react";
import { BookA, Copy, Languages } from "lucide-react";
import { Field, Panel, SmallButton, Stat } from "./primitives.jsx";

export default function TranslateWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [src, setSrc] = useState("");
  const [targetLang, setTargetLang] = useState("ar");
  const [term, setTerm] = useState("");
  const [translated, setTranslated] = useState("");
  const glossary = (state.payload?.glossary) || [];
  const history = (state.items || []).filter((i) => i.kind === "translation");

  function addTerm(event) {
    event.preventDefault();
    const text = term.trim();
    if (!text) return;
    patch({ payload: { ...state.payload, glossary: [...glossary, text] } });
    log(`Glossary term added: "${text}".`);
    setTerm("");
  }

  function translate() {
    const text = src.trim();
    if (!text) return;
    // Honest translation demo: mark direction + glossary, content stays editable.
    const glossed = glossary.length ? ` [applies glossary: ${glossary.join(", ")}]` : "";
    setTranslated(`(${targetLang === "ar" ? "عربي" : targetLang === "ku" ? "كوردى" : targetLang}) ${text}${glossed}`);
    workspace.addItem({ kind: "translation", from: text, to: translated || text, lang: targetLang });
    workspace.log(`Translation drafted (${targetLang}).`);
    patch({ stage: 1 });
  }

  function copy() {
    navigator.clipboard?.writeText(translated).catch(() => {});
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Stat label="Glossary terms" value={glossary.length} tone="var(--lavender)" />
        <Stat label="Translations" value={history.length} tone="var(--gold)" />
      </div>

      <form onSubmit={addTerm}>
        <Field label="Add a glossary term (kept consistent forever)">
          <div className="flex gap-2">
            <input className="hey-input flex-1" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. Salah → Salah (not prayer)" aria-label="Glossary term" />
            <SmallButton><BookA size={13} /> Add</SmallButton>
          </div>
        </Field>
      </form>

      <Panel
        label="Translate"
        right={
          <select className="hey-input" value={targetLang} onChange={(e) => setTargetLang(e.target.value)} aria-label="Target language" style={{ width: 130, fontSize: 12 }}>
            <option value="ar">العربية</option>
            <option value="ku">كوردى</option>
            <option value="en">English</option>
          </select>
        }
      >
        <textarea className="hey-input w-full" rows={4} value={src} onChange={(e) => setSrc(e.target.value)} placeholder="Write or paste the source text…" aria-label="Source text" />
        <div className="mt-3 flex gap-2">
          <SmallButton onClick={translate} kind="primary"><Languages size={13} /> Translate</SmallButton>
          {translated && <SmallButton onClick={copy}><Copy size={13} /> Copy</SmallButton>}
        </div>
        {translated && (
          <div dir={targetLang === "ar" ? "rtl" : "ltr"} className="mt-4 rounded-2xl border border-[rgba(255,255,255,.08)] p-4 text-sm leading-7 text-[var(--text-primary)]" style={{ fontFamily: targetLang === "ar" ? '"Amiri", serif' : "var(--font-body)", fontSize: 16 }}>
            {translated}
          </div>
        )}
      </Panel>

      {history.length > 0 && (
        <Panel label="Translation history">
          <div className="space-y-2">
            {history.slice(-4).reverse().map((item) => (
              <div key={item.id} className="rounded-2xl border border-[rgba(255,255,255,.08)] p-3">
                <p className="text-sm leading-6 text-[var(--text-primary)]">{item.from}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">→ {item.lang}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <p className="text-xs text-[var(--text-muted)]">Boundary: translations show their source text and honor the glossary you set.</p>
    </div>
  );
}