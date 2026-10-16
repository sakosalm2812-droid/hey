import { useEffect, useRef, useState } from "react";
import { ExternalLink, Link2, Loader2, Search, X } from "lucide-react";
import { Field, Panel, SmallButton, Tag } from "./primitives.jsx";
import { getAccountScope, subscribeAccountScope } from "../../../core/accountScope.js";
import { validateExpertPackManifest } from "../../../core/expertPacks.js";
import { containsSensitiveResearchText, createClaimRecord, fetchResearchResults, invalidateClaimsForSource } from "../../../core/researchEvidence.js";

const MAX_EXPERT_PACK_TEXT_LENGTH = 16_384;

export default function ResearchWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [query, setQuery] = useState("");
  const [claimText, setClaimText] = useState("");
  const [expertPackText, setExpertPackText] = useState("");
  const [activePack, setActivePack] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeRequest = useRef(null);
  const claims = (state.items || []).filter((i) => i.kind === "claim");
  const savedSources = (state.items || []).filter((i) => i.kind === "source");

  useEffect(() => {
    const unsubscribe = subscribeAccountScope(() => {
      activeRequest.current?.abort();
      activeRequest.current = null;
      setResults([]);
      setActivePack(null);
      setLoading(false);
      setError("Research was cleared because the active account changed. Search again to continue.");
    });
    return () => {
      unsubscribe();
      const controller = activeRequest.current;
      activeRequest.current = null;
      controller?.abort();
    };
  }, []);

  async function research(event) {
    event.preventDefault();
    const previousRequest = activeRequest.current;
    activeRequest.current = null;
    previousRequest?.abort();
    setLoading(false);
    setResults([]);
    setActivePack(null);
    setError("");
    const text = query.trim();
    if (!text || text.length > 500) return;
    if (containsSensitiveResearchText(text)) {
      setError("This query looks sensitive, so HEY blocked sending it to the external search provider. Remove private details and try again.");
      return;
    }
    const manifestText = expertPackText.trim();
    let expertPack;
    if (manifestText) {
      if (expertPackText.length > MAX_EXPERT_PACK_TEXT_LENGTH) {
        setError(`Expert Pack JSON exceeds the ${MAX_EXPERT_PACK_TEXT_LENGTH.toLocaleString()} character limit. Shorten it before searching.`);
        return;
      }
      try {
        expertPack = JSON.parse(manifestText);
      } catch {
        setError("Expert Pack JSON could not be parsed. Fix the JSON before searching.");
        return;
      }
      const validation = validateExpertPackManifest(expertPack);
      if (!validation.valid) {
        setError(`Expert Pack manifest is invalid; no external search was started. ${validation.errors.slice(0, 4).join("; ")}`);
        return;
      }
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    const requestScope = getAccountScope();
    const requestedPack = expertPack || null;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 12_000);
    setLoading(true);
    setError("");
    setResults([]);
    setActivePack(requestedPack ? { id: requestedPack.id, version: requestedPack.version } : null);
    patch({ payload: { ...state.payload, question: text }, stage: 1 });
    log(`Researching: "${text}"`);
    try {
      const hits = await fetchResearchResults(text, { signal: controller.signal, ...(requestedPack ? { expertPack: requestedPack } : {}) });
      if (controller.signal.aborted || activeRequest.current !== controller || getAccountScope() !== requestScope) return;
      setResults(hits);
      log(hits.length ? `Found ${hits.length} candidate sources${requestedPack ? ` for unverified Expert Pack ${requestedPack.id}` : ""}.` : "No sources found.");
    } catch (err) {
      if (activeRequest.current === controller && getAccountScope() === requestScope) {
        if (timedOut) setError("Research timed out after 12 seconds. Try again with a shorter query.");
        else if (err?.name !== "AbortError") setError(err?.message || "Research unavailable right now.");
      }
    } finally {
      clearTimeout(timeout);
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }

  function cancelResearch() {
    const controller = activeRequest.current;
    if (!controller) return;
    activeRequest.current = null;
    controller.abort();
    setLoading(false);
    setResults([]);
    setActivePack(null);
    setError("Research cancelled. No results were added.");
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
        if (!savedSources.some((saved) => saved.url === source.url)) {
          workspace.addItem({ kind: "source", title, url: source.url, excerpt: source.snippet, retrievedAt: source.retrievedAt, authority: "unassessed", verification: "unverified" });
        }
        workspace.log(`Saved an unverified claim and candidate citation: ${title}`);
      } else {
        workspace.addItem({ kind: "source", title, url: source.url, excerpt: source.snippet, retrievedAt: source.retrievedAt, authority: "unassessed", verification: "unverified" });
        workspace.log(`Saved source for review: ${title}`);
      }
    } catch (err) {
      setError(err.message || "Could not save this claim and source.");
    }
  }

  function retractSource(source) {
    const nextClaims = invalidateClaimsForSource(claims, source.url, "retracted");
    nextClaims.forEach((claim, index) => {
      if (claim !== claims[index]) workspace.updateItem(claim.id, {
        status: claim.status,
        confidence: claim.confidence,
        candidateCitations: claim.candidateCitations,
      });
    });
    workspace.updateItem(source.id, { status: "retracted", verification: "retracted" });
    log(`Marked source as retracted and invalidated ${nextClaims.filter((claim, index) => claim !== claims[index]).length} linked claim(s).`);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={research}>
        <Field label="Research question">
          <div className="flex gap-2">
            <input className="hey-input flex-1" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={500} placeholder="e.g. How does sleep affect memory consolidation?" aria-label="Research question" />
          </div>
        </Field>
        <Field label="Claim to assess (optional)">
          <input className="hey-input w-full" value={claimText} onChange={(event) => setClaimText(event.target.value)} maxLength={4000} placeholder="Write the specific statement you want to check" aria-label="Claim to assess" />
        </Field>
        <Field label="Expert Pack manifest (optional JSON)">
          <textarea className="hey-input w-full" value={expertPackText} onChange={(event) => setExpertPackText(event.target.value)} maxLength={MAX_EXPERT_PACK_TEXT_LENGTH} rows={5} aria-label="Expert Pack manifest JSON" aria-describedby="research-pack-limits" placeholder='Paste a hey.expert-pack.v1 manifest. Leave empty for normal research.' />
        </Field>
        <p id="research-pack-limits" className="text-xs leading-5 text-[var(--text-muted)]">
          Expert Packs are syntax checked only. They are always unverified, uncertified, and grant no authority. Pack filtering uses the manifest declarations; this screen searches Wikipedia only, a tertiary reference. No result or advice is certified.
        </p>
        {activePack && <p role="status" className="text-xs text-[var(--gold)]">Using unverified, uncertified Expert Pack {activePack.id} v{activePack.version}. It grants no authority.</p>}
        <div className="flex gap-2">
          <button type="submit" className="hey-btn-primary" style={{ minHeight: 34, padding: "6px 13px", fontSize: 12 }} disabled={loading}>{loading ? <Loader2 size={13} className="hey-spin" /> : <Search size={13} />} {loading ? "Searching…" : "Search"}</button>
          {loading && <SmallButton onClick={cancelResearch}><X size={13} /> Cancel search</SmallButton>}
        </div>
      </form>

      {error && <p role="alert" className="text-sm" style={{ color: "var(--coral)" }}>{error}</p>}

      {activePack && !loading && !error && results.length === 0 && <p role="status" className="text-xs text-[var(--text-muted)]">No Wikipedia candidates matched this Expert Pack's declared source, jurisdiction, and freshness limits. This is not a certification result.</p>}
      {activePack && results.length > 0 && <p role="status" className="text-xs text-[var(--text-muted)]">Candidate results from Wikipedia only. Pack policy matching does not verify source quality, claim support, evaluation evidence, or certification; mismatches and stale candidates are omitted.</p>}

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
                {result.expertPackAssessment && <p className="mt-1 text-[11px] text-[var(--gold)]">Expert Pack evidence status: {result.expertPackAssessment.status} · certification: {result.expertPackAssessment.certificationStatus} · authority granted: no · independent verification required</p>}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {claims.length > 0 && (
        <Panel label="Claims and candidate evidence" right={<Tag tone="gold">{claims.filter((claim) => claim.status === "unverified").length} unverified</Tag>}>
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
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-[var(--text-muted)]">Authority unassessed · {source.status === "retracted" ? "retracted" : "not verified"}</p>
                  {source.status !== "retracted" && <SmallButton onClick={() => retractSource(source)}>Mark retracted</SmallButton>}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <p className="text-xs text-[var(--text-muted)]">Boundary: every important claim stays attached to a source. No source, no claim.</p>
    </div>
  );
}
