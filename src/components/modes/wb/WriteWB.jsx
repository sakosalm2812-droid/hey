import { useState } from "react";
import { Copy, History, Save } from "lucide-react";
import { Field, Panel, SmallButton, Tag } from "./primitives.jsx";

export default function WriteWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [draft, setDraft] = useState("");
  const versions = (state.items || []).filter((i) => i.kind === "version");

  function saveVersion(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    workspace.addItem({ kind: "version", text, name: `v${versions.length + 1}` });
    workspace.log(`Version ${versions.length + 1} saved.`);
    patch({ stage: 1 });
    setDraft("");
  }

  function load(version) {
    setDraft(version.text);
    log(`Loaded ${version.name}.`);
  }

  function copy(version) {
    navigator.clipboard?.writeText(version.text).catch(() => {});
    log(`${version.name} copied.`);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={saveVersion}>
        <Field label="Draft" right={<SmallButton type="submit"><Save size={13} /> Save version</SmallButton>}>
          <textarea
            className="hey-input w-full"
            rows={10}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write here. Every save keeps the previous version."
            aria-label="Writing draft"
          />
        </Field>
      </form>

      {versions.length > 0 && (
        <Panel label="Versions" right={<Tag tone="lavender">{versions.length}</Tag>}>
          <div className="space-y-2">
            {[...versions].reverse().map((version) => (
              <div key={version.id} className="rounded-2xl border border-[rgba(255,255,255,.08)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <strong className="flex items-center gap-2 text-sm text-[var(--text-primary)]"><History size={13} color="var(--gold)" /> {version.name}</strong>
                  <div className="flex shrink-0 gap-2">
                    <SmallButton onClick={() => load(version)}>Open</SmallButton>
                    <SmallButton onClick={() => copy(version)}><Copy size={13} /> Copy</SmallButton>
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{version.text.slice(0, 180)}{version.text.length > 180 ? "…" : ""}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <p className="text-xs text-[var(--text-muted)]">Boundary: every rewrite keeps the previous version. You can always go back.</p>
    </div>
  );
}