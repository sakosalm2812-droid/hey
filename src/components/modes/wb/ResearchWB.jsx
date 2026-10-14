import { useEffect, useRef, useState } from "react";
import { ExternalLink, Link2, Loader2, Search } from "lucide-react";
import { Field, Panel, SmallButton, Tag } from "./primitives.jsx";
import { getAccountScope } from "../../../core/accountScope.js";
import { containsSensitiveResearchText, createClaimRecord, deduplicateSources } from "../../../core/researchEvidence.js";

export default function ResearchWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [query, setQuery] = useState("");
  const [claimText, setClaimText] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeRequest = useRef(null);
  const claims = (state.items || []).filter((i) => i.kind === "claim");
  const savedSources = (state.items || []).filter((i) => i.kind === "source");

  useEffect(() => () => activeRequest.current?.abort(), []);

  async function research(event) {
    event.preventDefault();
    const text = query.trim();
    if (!text || text.length > 500) return;
    if (containsSensitiveResearchText(text)) {
      setError("This query looks sensitive, so HEY blocked sending it to the external search provider. Remove private details and try again.");
      return;
    }
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 12_000);
    setLoading(true);
    setError("");
    patch({ payload: { ...state.payload, question: text }, stage: 1 });
    log(`Researching: "${text}"`);
    try {
      const response = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(text)}&format=json&origin=*&srlimit=5`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error(`Search provider returned HTTP ${response.status}.`);
      const data = await response.json();
      const hits = deduplicateSources((data?.query?.search || []).map((hit) => ({
        title: hit.title,
        snippet: hit.snippet.replace(/<[^>]+>/g, ""),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replaceAll(" ", "_"))}`,
        retrievedAt: new Date().toISOString(),
        sourceType: "tertiary_reference",
        authority: "unassessed",
      })));
      setResults(hits);
      log(hits.length ? `Found ${hits.length} sources.` : "No sources found.");
    } catch (err) {
      if (timedOut) setError("Research timed out after 12 seconds. Try again with a shorter query.");
      else if (err?.name !== "AbortError") setError(err?.message || "Research unavailable right now.");
    } finally {
      clearTimeout(timeout);
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }

  function attachClaim(title) {
    const source = results.find((result) => result.title === title);
    if (!source) return;
    try {
      if (claimText.trim()) {
        const claim = createClaimRecord({
          text: claimText,
          accountScope: getAccountScope(),
          workspaceId: "research",
          source: { ...source, excerpt: source.snippet },
        });
        workspace.addItem({ ...claim, source: title });
        workspace.log(`Saved an unverified claim and candidate citation: ${title}`);
      } else {
        workspace.addItem({ kind: "source", title, url: source.url, excerpt: source.snippet, retrievedAt: source.retrievedAt, authority: "unassessed", verification: "unverified" });
        workspace.log(`Saved source for review: ${title}`);
      }
    } catch (err) {
      setError(err.message || "Could not save this claim and source.");
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={research}>
        <Field label="Research question">
          <div className="flex gap-2">
            <input className="hey-input flex-1" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={500} placeholder="e.g. How does sleep affect memory consolidation?" aria-label="Research question" />
            <SmallButton kind="primary">{loading ? <Loader2 size={13} className="hey-spin" /> : <Search size={13} />} {loading ? "Searching…" : "Search"}</SmallButton>
          </div>
        </Field>
        <Field label="Claim to assess (optional)">
          <input className="hey-input w-full" value={claimText} onChange={(event) => setClaimText(event.target.value)} maxLength={4000} placeholder="Write the specific statement you want to check" aria-label="Claim to assess" />
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
                    <SmallButton onClick={() => attachClaim(result.title)}><Link2 size={13} /> {claimText.trim() ? "Attach evidence" : "Save source"}</SmallButton>
                    <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(result.title)}`} target="_blank" rel="noreferrer" className="hey-btn-ghost" style={{ minHeight: 34, padding: "6px 10px", fontSize: 12 }}><ExternalLink size={13} /></a>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{result.snippet}</p>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">Tertiary reference · source authority and claim support have not been verified</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {claims.length > 0 && (
        <Panel label="Claims and candidate evidence" right={<Tag tone="gold">{claims.length} unverified</Tag>}>
          <div className="space-y-2">
            {claims.map((claim) => (
              <div key={claim.id} className="rounded-2xl border border-[rgba(255,255,255,.08)] p-3">
                <p className="text-sm leading-6 text-[var(--text-primary)]">{claim.text}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Candidate source: {claim.source} · Status: {claim.status || "unverified"}</p>
                {claim.candidateCitations?.[0]?.source?.url && <a className="mt-1 inline-block text-xs underline" href={claim.candidateCitations[0].source.url} target="_blank" rel="noreferrer">Open unverified candidate source</a>}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {savedSources.length > 0 && (
        <Panel label="Saved sources" right={<Tag>{savedSources.length}</Tag>}>
          <div className="space-y-2">
            {savedSources.map((source) => (
              <div key={source.id} className="rounded-2xl border border-[rgba(255,255,255,.08)] p-3">
                <a className="text-sm underline" href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{source.excerpt}</p>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">Authority unassessed · not verified</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <p className="text-xs text-[var(--text-muted)]">Boundary: every important claim stays attached to a source. No source, no claim.</p>
    </div>
  );
}
