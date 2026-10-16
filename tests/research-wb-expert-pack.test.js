import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fetchResearchResults } from "../src/core/researchEvidence.js";

const page = await readFile(new URL("../src/components/modes/wb/ResearchWB.jsx", import.meta.url), "utf8");

function expertPackFixture() {
  return {
    contractVersion: "hey.expert-pack.v1",
    id: "research-ui-test",
    version: "1.0.0",
    domain: "general research",
    scope: "candidate source discovery only",
    jurisdictions: ["*"],
    sourceHierarchy: [{ id: "wiki", authorityTier: "tertiary", origins: ["wikipedia.org", "en.wikipedia.org"], maxAgeDays: 30 }],
    highStakes: false,
    updateCadenceDays: 30,
    evaluation: { suiteVersion: "test-suite-1", evaluatedAt: "2026-10-01T00:00:00.000Z", expiresAt: "2027-10-01T00:00:00.000Z", evidenceIds: ["test-eval"] },
    certification: { status: "uncertified", evidenceIds: [] },
    escalation: { requiredForHighStakes: true, contactGuidance: "Seek a qualified professional for high-stakes decisions." },
  };
}

const fakeWikipedia = async () => ({
  ok: true,
  json: async () => ({ query: { search: [{ title: "Research", snippet: "A tertiary reference." }] } }),
});

test("Research screen preserves normal search when the optional manifest is empty", async () => {
  assert.match(page, /Expert Pack manifest \(optional JSON\)/);
  assert.match(page, /Leave empty for normal research/);
  assert.match(page, /fetchResearchResults\(text, \{\s*signal: controller\.signal,/);
  const hits = await fetchResearchResults("climate", { fetchImpl: fakeWikipedia, now: () => "2026-10-16T00:00:00.000Z" });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].sourceType, "tertiary_reference");
  assert.equal(hits[0].expertPackAssessment, undefined);
});

test("valid pack flow labels candidate assessments unverified, uncertified, and without authority", async () => {
  assert.match(page, /validateExpertPackManifest\(expertPack\)/);
  assert.match(page, /Using unverified, uncertified Expert Pack/);
  assert.match(page, /authority granted: no/);
  assert.match(page, /No result or advice is certified/);
  assert.match(page, /result\.expertPackAssessment\.certificationStatus/);
  const hits = await fetchResearchResults("climate", { fetchImpl: fakeWikipedia, now: () => "2026-10-16T00:00:00.000Z", expertPack: expertPackFixture() });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].expertPackAssessment.status, "unverified");
  assert.equal(hits[0].expertPackAssessment.certificationStatus, "uncertified");
  assert.equal(hits[0].expertPackAssessment.authorityGranted, false);
});

test("scoped Expert Packs require a declared jurisdiction and explain Wikipedia metadata limits", () => {
  assert.match(page, /Research jurisdiction \(required by scoped packs\)/);
  assert.match(page, /requestedJurisdiction/);
  assert.match(page, /jurisdictions\.includes\("\*"\)/);
  assert.match(page, /jurisdiction: researchJurisdiction\.trim\(\)/);
  assert.match(page, /Wikipedia results have no jurisdiction metadata and are filtered out for scoped requests/);
});

test("malformed, oversized, and invalid manifest input is rejected before fetchResearchResults", async () => {
  assert.match(page, /MAX_EXPERT_PACK_TEXT_LENGTH = 16_384/);
  assert.match(page, /JSON\.parse\(manifestText\)/);
  assert.match(page, /Expert Pack JSON could not be parsed/);
  assert.match(page, /Expert Pack manifest is invalid; no external search was started/);
  assert.ok(page.indexOf("validateExpertPackManifest(expertPack)") < page.indexOf("fetchResearchResults(text"));
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return fakeWikipedia(); };
  await assert.rejects(fetchResearchResults("climate", { fetchImpl, expertPack: { contractVersion: "invalid" } }), /Invalid expert pack/);
  assert.equal(calls, 0);
});

test("research cancellation, unmount, and account changes fence off stale results", () => {
  assert.match(page, /subscribeAccountScope\(\(\) => \{/);
  assert.match(page, /activeRequest\.current\?\.abort\(\)/);
  assert.match(page, /setResults\(\[\]\)/);
  assert.match(page, /getAccountScope\(\) !== requestScope/);
  assert.match(page, /activeRequest\.current !== controller/);
  assert.match(page, /function cancelResearch\(\)/);
  assert.match(page, /controller\.abort\(\)/);
  assert.match(page, /No results were added/);
  assert.match(page, /return \(\) => \{\s*unsubscribe\(\);\s*const controller = activeRequest\.current;/);
});

test("provider and evidence limits are visible and never grant pack authority", () => {
  assert.match(page, /searches Wikipedia only, a tertiary reference/);
  assert.match(page, /does not verify source quality, claim support, evaluation evidence, or certification/);
  assert.match(page, /independent verification required/);
});
