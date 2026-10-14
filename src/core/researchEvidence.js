const RETRACTED_STATES = new Set(["retracted", "withdrawn", "deleted"]);
const SENSITIVE_QUERY_PATTERNS = [
  /\b(password|passcode|secret|api[ _-]?key|access[ _-]?token|credential)\b/i,
  /\b(ssn|social security|credit card|bank account|routing number)\b/i,
  /\b(diagnosis|prescription|medical record|therapy session)\b/i,
];

export function containsSensitiveResearchText(value) {
  return SENSITIVE_QUERY_PATTERNS.some((pattern) => pattern.test(String(value || "")));
}

export async function fetchResearchResults(query, { signal, fetchImpl = globalThis.fetch, now = () => new Date().toISOString() } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("A research fetch provider is required.");
  if (signal?.aborted) throw Object.assign(new Error("Research cancelled."), { name: "AbortError" });
  const safeQuery = String(query || "").trim();
  if (!safeQuery || safeQuery.length > 500) throw new RangeError("Research query must contain 1 to 500 characters.");
  if (containsSensitiveResearchText(safeQuery)) throw new Error("Sensitive research queries are blocked before external search.");
  const response = await fetchImpl(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(safeQuery)}&format=json&origin=*&srlimit=5`,
    { signal },
  );
  if (!response.ok) throw new Error(`Search provider returned HTTP ${response.status}.`);
  const data = await response.json();
  if (signal?.aborted) throw Object.assign(new Error("Research cancelled."), { name: "AbortError" });
  return deduplicateSources((data?.query?.search || []).slice(0, 5).filter((hit) => typeof hit?.title === "string" && typeof hit?.snippet === "string").map((hit) => ({
    title: hit.title,
    snippet: hit.snippet.replace(/<[^>]+>/g, ""),
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replaceAll(" ", "_"))}`,
    retrievedAt: now(),
    sourceType: "tertiary_reference",
    authority: "unassessed",
  })));
}

export function canonicalizeSourceUrl(value) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|ref|source)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

function normalizedText(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function sourceFingerprint(source = {}) {
  const url = canonicalizeSourceUrl(source.url);
  if (url) return `url:${url}`;
  const title = normalizedText(source.title);
  const excerpt = normalizedText(source.excerpt || source.snippet);
  if (!title && !excerpt) return null;
  return `text:${title}|${excerpt.slice(0, 240)}`;
}

export function deduplicateSources(sources = []) {
  const result = new Map();
  for (const source of sources) {
    const key = sourceFingerprint(source);
    if (!key) continue;
    const existing = result.get(key);
    if (!existing) result.set(key, { ...source, fingerprint: key, copies: 1 });
    else result.set(key, { ...existing, copies: existing.copies + 1, aliases: [...(existing.aliases || []), source.url || source.title].filter(Boolean) });
  }
  return [...result.values()];
}

export function createClaimRecord({ id, text, source, accountScope, workspaceId, createdAt = new Date().toISOString() } = {}) {
  const claim = String(text || "").trim();
  if (!claim) throw new TypeError("Claim text is required.");
  if (claim.length > 4_000) throw new RangeError("Claim text exceeds 4000 characters.");
  if (!accountScope || !workspaceId) throw new TypeError("Account and workspace scope are required.");
  const sourceUrl = canonicalizeSourceUrl(source?.url);
  if (!sourceUrl || !String(source?.title || "").trim()) throw new TypeError("A claim requires a valid HTTP(S) source URL and title.");
  return {
    id: id || `claim_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`,
    kind: "claim",
    text: claim,
    accountScope,
    workspaceId,
    createdAt,
    status: "unverified",
    confidence: null,
    candidateCitations: [{ id: `citation_${sourceFingerprint(source)}`, source: { ...source, url: sourceUrl }, relation: "candidate_support", verification: "unverified", capturedAt: createdAt }],
    dependencies: [],
  };
}

/** A source excerpt is only a candidate: this function never asserts entailment. */
export function evaluateCitationCoverage(claim, evidence, { now = Date.now(), maxAgeDays = 3650 } = {}) {
  if (!claim?.text || !evidence?.source?.url) return { status: "invalid", reason: "missing_claim_or_source" };
  if (evidence.verification === "retracted" || RETRACTED_STATES.has(evidence.source.status)) {
    return { status: "invalidated", reason: "source_retracted" };
  }
  const age = now - Date.parse(evidence.capturedAt || evidence.source.retrievedAt || "");
  if (Number.isFinite(age) && age > maxAgeDays * 86_400_000) return { status: "stale", reason: "evidence_age_exceeded" };
  const excerpt = normalizedText(evidence.source.excerpt || evidence.source.snippet);
  const terms = normalizedText(claim.text).split(" ").filter((term) => term.length > 2);
  const coverage = terms.length ? terms.filter((term) => excerpt.includes(term)).length / terms.length : 0;
  return { status: "unverified", reason: coverage > 0 ? "lexical_overlap_is_not_entailment" : "no_lexical_overlap", lexicalCoverage: Number(coverage.toFixed(3)) };
}

export function invalidateClaimsForSource(claims = [], sourceUrl, status = "retracted") {
  const canonical = canonicalizeSourceUrl(sourceUrl);
  if (!canonical || !RETRACTED_STATES.has(status)) return claims;
  return claims.map((claim) => {
    const affected = (claim.candidateCitations || []).some((item) => canonicalizeSourceUrl(item.source?.url) === canonical);
    if (!affected) return claim;
    return {
      ...claim,
      status: "invalidated",
      confidence: null,
      candidateCitations: claim.candidateCitations.map((item) => canonicalizeSourceUrl(item.source?.url) === canonical
        ? { ...item, verification: "retracted", source: { ...item.source, status } }
        : item),
    };
  });
}

export default { canonicalizeSourceUrl, sourceFingerprint, deduplicateSources, createClaimRecord, evaluateCitationCoverage, invalidateClaimsForSource, containsSensitiveResearchText, fetchResearchResults };
