import { useState } from "react";
import { ExternalLink, Link2, Loader2, Search } from "lucide-react";
import { Field, Panel, SmallButton, Tag } from "./primitives.jsx";

export default function ResearchWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const claims = (state.items || []).filter((i) => i.kind === "claim");

  async function research(event) {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    setLoading(true);
    setError("");
    patch({ payload: { ...state.payload, question: text }, stage: 1 });
    log(`Researching: "${text}"`);
    try {
      const response = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(text)}&format=json&origin=*&srlimit=5`,
      );
      const data = await response.json();
      const hits = (data?.query?.search || []).map((hit) => ({
        title: hit.title,
        snippet: hit.snippet.replace(/<[^>]+>/g, ""),
      }));
      setResults(hits);
      log(hits.length ? `Found ${hits.length} sources.` : "No sources found.");
    } catch (err) {
      setError(err?.message || "Research unavailable right now.");
    } finally {
      setLoading(false);
    }
  }

  function attachClaim(title) {
    const text = `${state.payload?.question || "Research"} — ${title}`;
    workspace.addItem({ kind: "claim", text, source: title });
    workspace.log(`Claim attached to source: ${title}`);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={research}>
        <Field label="Research question">
          <div className="flex gap-2">
            <input className="hey-input flex-1" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. How does sleep affect memory consolidation?" aria-label="Research question" />
            <SmallButton kind="primary">{loading ? <Loader2 size={13} className="hey-spin" /> : <Search size={13} />} {loading ? "Searching…" : "Search"}</SmallButton>
          </div>
        </Field>
      </form>

      {error && <p className="text-sm" style={{ color: "var(--coral)" }}>{error}</p>}

      {results.length > 0 && (
        <Panel label="Sources" right={<Search size={15} color="var(--lavender)" />}>
          <div className="space-y-2">
            {results.map((result) => (
              <div key={result.title} className="rounded-2xl border border-[rgba(255,255,255,.08)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm text-[var(--text-primary)]">{result.title}</strong>
                  <div className="flex shrink-0 gap-2">
                    <SmallButton onClick={() => attachClaim(result.title)}><Link2 size={13} /> Attach claim</SmallButton>
                    <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(result.title)}`} target="_blank" rel="noreferrer" className="hey-btn-ghost" style={{ minHeight: 34, padding: "6px 10px", fontSize: 12 }}><ExternalLink size={13} /></a>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{result.snippet}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {claims.length > 0 && (
        <Panel label="Claims with receipts" right={<Tag tone="green">{claims.length}</Tag>}>
          <div className="space-y-2">
            {claims.map((claim) => (
              <div key={claim.id} className="rounded-2xl border border-[rgba(255,255,255,.08)] p-3">
                <p className="text-sm leading-6 text-[var(--text-primary)]">{claim.text}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Source: {claim.source}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <p className="text-xs text-[var(--text-muted)]">Boundary: every important claim stays attached to a source. No source, no claim.</p>
    </div>
  );
}