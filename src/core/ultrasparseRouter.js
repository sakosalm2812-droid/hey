import { createProviderPlan } from "./providerRouter.js";

// A deliberately small, transparent routing prototype. It selects expert
// labels only; it does not load weights, call a model, or claim inference.
const EXPERTS = Object.freeze([
  Object.freeze({ id: "coding", terms: Object.freeze(["code", "coding", "bug", "debug", "function", "program", "api", "typescript", "javascript"]) }),
  Object.freeze({ id: "research", terms: Object.freeze(["research", "source", "citation", "evidence", "compare", "study", "current", "reference"]) }),
  Object.freeze({ id: "math", terms: Object.freeze(["math", "calculate", "equation", "algebra", "probability", "statistics", "number", "proof"]) }),
  Object.freeze({ id: "writing", terms: Object.freeze(["write", "writing", "draft", "edit", "rewrite", "email", "story", "tone"]) }),
  Object.freeze({ id: "planning", terms: Object.freeze(["plan", "planning", "schedule", "organize", "steps", "project", "prioritize", "timeline"]) }),
]);

const MAX_QUERY_LENGTH = 4096;
const MAX_EXPERTS = 3;
const MAX_CATALOG_EXPERTS = 10_000;
const MAX_CATALOG_TERMS = 250_000;
const MIN_UNAMBIGUOUS_TERM_MATCHES = 2;
export const ULTRASPARSE_MAX_CATALOG_TERM_CHARACTERS = 4_000_000;
const PROVIDER_CAPABILITY_BY_EXPERT = Object.freeze({
  coding: "coding",
  research: "reasoning",
  math: "reasoning",
});
const ROUTING_OVERRIDE_TERMS = "ignore|bypass|override|disable|circumvent|evade";
const ROUTING_POLICY_TERMS = "permissions?|polic(?:y|ies)|safety|security|authority|guardrails?";
const ADVERSARIAL_ROUTING_TEXT = new RegExp(
  `\\b(?:${ROUTING_OVERRIDE_TERMS})\\b[\\s\\S]{0,96}\\b(?:${ROUTING_POLICY_TERMS})\\b|\\b(?:${ROUTING_POLICY_TERMS})\\b[\\s\\S]{0,96}\\b(?:${ROUTING_OVERRIDE_TERMS})\\b`,
  "i",
);
const EXPERT_BY_ID = new Map(EXPERTS.map((expert) => [expert.id, expert]));
const TOKEN_EXPERT_INDEX = new Map();
const TOKEN_EXPERT_MASK_INDEX = new Map();
const MASK_INDEX_SUPPORTED = EXPERTS.every((expert) => expert.terms.length <= 31);

for (const [expertIndex, expert] of EXPERTS.entries()) {
  for (const [termIndex, term] of expert.terms.entries()) {
    if (!TOKEN_EXPERT_INDEX.has(term)) TOKEN_EXPERT_INDEX.set(term, []);
    TOKEN_EXPERT_INDEX.get(term).push(expert.id);

    if (MASK_INDEX_SUPPORTED) {
      if (!TOKEN_EXPERT_MASK_INDEX.has(term)) TOKEN_EXPERT_MASK_INDEX.set(term, []);
      TOKEN_EXPERT_MASK_INDEX.get(term).push({ expertIndex, bit: 1 << termIndex });
    }
  }
}

function tokenize(text) {
  return text.toLowerCase().match(/[a-z0-9]+/g) || [];
}

function selectionInput(input, limit) {
  if (typeof input !== "string") return null;
  const query = input.slice(0, MAX_QUERY_LENGTH);
  return {
    tokenSet: new Set(tokenize(query)),
    requestedLimit: Number.isInteger(limit) ? Math.max(1, Math.min(MAX_EXPERTS, limit)) : 2,
    truncated: input.length > MAX_QUERY_LENGTH,
  };
}

function getHintSuppressionReason(input, selection) {
  if (selection.status === "invalid_input") return "invalid_input";
  if (selection.status !== "selected") return "no_match";
  if (selection.truncated) return "query_truncated";
  if (ADVERSARIAL_ROUTING_TEXT.test(input)) return "adversarial_policy_override_text";

  // Deterministic abstention only; this is not a calibrated confidence score.
  const [primary, runnerUp] = selection.experts;
  if (!primary || primary.score < MIN_UNAMBIGUOUS_TERM_MATCHES) return "weak_lexical_signal";
  if (runnerUp && primary.score <= runnerUp.score) return "ambiguous_lexical_signal";
  return null;
}

function formatSelection(ranked, requestedLimit, truncated) {
  const chosen = ranked.filter((expert) => expert.score > 0)
    .sort((left, right) => right.score - left.score || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .slice(0, requestedLimit);
  return {
    experts: chosen.map(({ id, score }) => ({ id, score })),
    matchedTerms: chosen.flatMap(({ id, matchedTerms }) => matchedTerms.map((term) => ({ expert: id, term }))),
    status: chosen.length ? "selected" : "no_match",
    truncated,
  };
}

function readCatalogArray(value, label, maximum, minimum = 1) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new TypeError(`Invalid ${label}`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys.some((key) => key !== "length" && !/^(0|[1-9][0-9]*)$/.test(key))) {
    throw new TypeError(`Invalid ${label}`);
  }
  const values = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) throw new TypeError(`Invalid ${label}`);
    values.push(descriptor.value);
  }
  return values;
}

function readCatalogExpert(value) {
  if (!value || typeof value !== "object") throw new TypeError("Invalid expert definition");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Invalid expert definition");
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 2 || !keys.includes("id") || !keys.includes("terms")) throw new TypeError("Invalid expert definition");
  const idDescriptor = Object.getOwnPropertyDescriptor(value, "id");
  const termsDescriptor = Object.getOwnPropertyDescriptor(value, "terms");
  if (!idDescriptor || !("value" in idDescriptor) || !termsDescriptor || !("value" in termsDescriptor)) {
    throw new TypeError("Invalid expert definition");
  }
  const id = idDescriptor.value;
  if (typeof id !== "string" || /^[a-z0-9][a-z0-9._-]{0,63}$/i.exec(id)?.[0] !== id) throw new TypeError("Invalid expert id");
  const terms = readCatalogArray(termsDescriptor.value, "expert terms", 31);
  let termCharacterCount = 0;
  for (const term of terms) {
    if (typeof term !== "string") throw new TypeError("Invalid expert terms");
    termCharacterCount += term.length;
    if (termCharacterCount > ULTRASPARSE_MAX_CATALOG_TERM_CHARACTERS) throw new TypeError("Invalid expert terms");
  }
  if (terms.some((term) => typeof term !== "string" || /^[a-z0-9]+$/.exec(term)?.[0] !== term) || new Set(terms).size !== terms.length) {
    throw new TypeError("Invalid expert terms");
  }
  return Object.freeze({ id, terms: Object.freeze(terms), termCharacterCount });
}

/**
 * Build a bounded lexical selector for a caller-supplied expert catalog.
 * Catalogs with twenty or more experts use an inverted candidate index;
 * smaller catalogs retain the linear scan until more measurements justify a
 * lower crossover. This selects labels only.
 */
export function createUltraSparseSelector(catalog) {
  const definitions = readCatalogArray(catalog, "expert catalog", MAX_CATALOG_EXPERTS);
  let totalTerms = 0;
  let totalTermCharacters = 0;
  const experts = definitions.map((definition) => {
    const expert = readCatalogExpert(definition);
    totalTerms += expert.terms.length;
    if (totalTerms > MAX_CATALOG_TERMS) throw new TypeError("Invalid expert catalog");
    totalTermCharacters += expert.termCharacterCount;
    if (totalTermCharacters > ULTRASPARSE_MAX_CATALOG_TERM_CHARACTERS) throw new TypeError("Invalid expert catalog");
    return expert;
  });
  const ids = new Set(experts.map(({ id }) => id));
  if (ids.size !== experts.length) throw new TypeError("Invalid expert catalog");

  let tokenIndex = null;
  // The synchronous selector has no callbacks, so these scratch buffers cannot overlap calls.
  let expertMasks = null;
  let candidateExpertIndices = null;

  function prepareIndexed() {
    if (tokenIndex) return false;
    tokenIndex = new Map();
    expertMasks = new Uint32Array(experts.length);
    candidateExpertIndices = [];
    for (const [expertIndex, expert] of experts.entries()) {
      for (const [termIndex, term] of expert.terms.entries()) {
        if (!tokenIndex.has(term)) tokenIndex.set(term, []);
        tokenIndex.get(term).push((expertIndex << 5) | termIndex);
      }
    }
    return true;
  }

  function selectLinear(input, { limit = 2 } = {}) {
    const normalized = selectionInput(input, limit);
    if (!normalized) return { experts: [], matchedTerms: [], status: "invalid_input" };
    const ranked = experts.map((expert) => {
      const matchedTerms = expert.terms.filter((term) => normalized.tokenSet.has(term));
      return { id: expert.id, score: matchedTerms.length, matchedTerms };
    });
    return formatSelection(ranked, normalized.requestedLimit, normalized.truncated);
  }

  function selectIndexed(input, { limit = 2 } = {}) {
    const normalized = selectionInput(input, limit);
    if (!normalized) return { experts: [], matchedTerms: [], status: "invalid_input" };
    prepareIndexed();
    candidateExpertIndices.length = 0;
    for (const token of normalized.tokenSet) {
      for (const posting of tokenIndex.get(token) || []) {
        const expertIndex = posting >>> 5;
        const bit = 1 << (posting & 31);
        if (expertMasks[expertIndex] === 0) candidateExpertIndices.push(expertIndex);
        expertMasks[expertIndex] |= bit;
      }
    }
    const topCandidates = [];
    for (const expertIndex of candidateExpertIndices) {
      const mask = expertMasks[expertIndex];
      let score = 0;
      for (let remaining = mask; remaining !== 0; remaining &= remaining - 1) score += 1;
      const candidate = { expertIndex, mask, score, id: experts[expertIndex].id };
      let position = 0;
      while (position < topCandidates.length) {
        const current = topCandidates[position];
        if (candidate.score > current.score || (candidate.score === current.score && candidate.id < current.id)) break;
        position += 1;
      }
      if (position < normalized.requestedLimit) {
        topCandidates.splice(position, 0, candidate);
        if (topCandidates.length > normalized.requestedLimit) topCandidates.pop();
      }
    }
    for (const expertIndex of candidateExpertIndices) expertMasks[expertIndex] = 0;
    const ranked = topCandidates.map(({ expertIndex, mask, score, id }) => {
      const expert = experts[expertIndex];
      const matchedTerms = expert.terms.filter((_, termIndex) => (mask & (1 << termIndex)) !== 0);
      return { id, score, matchedTerms };
    });
    return formatSelection(ranked, normalized.requestedLimit, normalized.truncated);
  }

  const strategy = experts.length >= 20 ? "indexed-candidates" : "linear";
  return Object.freeze({
    expertCount: experts.length,
    strategy,
    prepareIndexed,
    selectLinear,
    selectIndexed,
    select(input, options) {
      return strategy === "linear" ? selectLinear(input, options) : selectIndexed(input, options);
    },
  });
}

/**
 * Route a bounded text request to a few lexical expert labels.
 * This is an interpretable CPU-only research baseline, not a trained router.
 */
export function selectUltraSparseExperts(input, { limit = 2 } = {}) {
  const normalized = selectionInput(input, limit);
  if (!normalized) return { experts: [], matchedTerms: [], status: "invalid_input" };
  const ranked = EXPERTS.map((expert) => {
    const matchedTerms = expert.terms.filter((term) => normalized.tokenSet.has(term));
    return { id: expert.id, score: matchedTerms.length, matchedTerms };
  });

  return formatSelection(ranked, normalized.requestedLimit, normalized.truncated);
}

/** Experimental inverted-index implementation; the linear selector remains the default. */
export function selectUltraSparseExpertsIndexed(input, { limit = 2 } = {}) {
  const normalized = selectionInput(input, limit);
  if (!normalized) return { experts: [], matchedTerms: [], status: "invalid_input" };

  const matchedByExpert = new Map();
  for (const token of normalized.tokenSet) {
    for (const expertId of TOKEN_EXPERT_INDEX.get(token) || []) {
      if (!matchedByExpert.has(expertId)) matchedByExpert.set(expertId, new Set());
      matchedByExpert.get(expertId).add(token);
    }
  }

  const ranked = Array.from(matchedByExpert, ([expertId, matched]) => {
    const expert = EXPERT_BY_ID.get(expertId);
    // Filtering the expert's fixed vocabulary preserves the linear baseline's
    // deterministic term order while touching only matched experts.
    const matchedTerms = expert.terms.filter((term) => matched.has(term));
    return { id: expert.id, score: matchedTerms.length, matchedTerms };
  });
  return formatSelection(ranked, normalized.requestedLimit, normalized.truncated);
}

/** Experimental bit-mask index; output is kept byte-for-byte equivalent to the linear baseline. */
export function selectUltraSparseExpertsMasked(input, { limit = 2 } = {}) {
  if (!MASK_INDEX_SUPPORTED) return selectUltraSparseExperts(input, { limit });
  const normalized = selectionInput(input, limit);
  if (!normalized) return { experts: [], matchedTerms: [], status: "invalid_input" };

  const masks = new Array(EXPERTS.length).fill(0);
  for (const token of normalized.tokenSet) {
    for (const { expertIndex, bit } of TOKEN_EXPERT_MASK_INDEX.get(token) || []) {
      masks[expertIndex] |= bit;
    }
  }

  const ranked = [];
  for (const [expertIndex, expert] of EXPERTS.entries()) {
    const mask = masks[expertIndex];
    if (mask === 0) continue;
    const matchedTerms = [];
    for (let termIndex = 0; termIndex < expert.terms.length; termIndex += 1) {
      if ((mask & (1 << termIndex)) !== 0) matchedTerms.push(expert.terms[termIndex]);
    }
    ranked.push({ id: expert.id, score: matchedTerms.length, matchedTerms });
  }
  return formatSelection(ranked, normalized.requestedLimit, normalized.truncated);
}

/**
 * Connects the prototype expert labels to HEY's canonical provider plan.
 * The result is a routing proposal only; callers must still execute and
 * validate provider inference through the existing trusted runtime.
 */
export function createUltraSparsePlan(input, { intent = "conversation", limit = 2 } = {}) {
  const selection = selectUltraSparseExperts(input, { limit });
  const primaryExpert = selection.experts[0]?.id || null;
  const suppressedReason = getHintSuppressionReason(input, selection);
  const eligibleExpert = suppressedReason ? null : primaryExpert;
  const capabilityHint = eligibleExpert ? PROVIDER_CAPABILITY_BY_EXPERT[eligibleExpert] || null : null;
  const hintedProviderPlan = capabilityHint
    ? createProviderPlan({ intent, capability: capabilityHint })
    : null;
  const useHintedPlan = Boolean(hintedProviderPlan?.selected);
  const selectedProviderPlan = useHintedPlan
    ? hintedProviderPlan
    : createProviderPlan({ intent });

  return {
    prototype: "lexical-ultrasparse-v1",
    experts: selection,
    providerPlan: {
      ...selectedProviderPlan,
      adaptiveRouting: {
        kind: "lexical-capability-hint",
        expert: eligibleExpert,
        requestedCapability: capabilityHint,
        applied: useHintedPlan,
        fallback: capabilityHint && !useHintedPlan ? "no_capable_permitted_model" : null,
        suppressedReason,
      },
    },
    inferencePerformed: false,
  };
}

export default { selectUltraSparseExperts, selectUltraSparseExpertsIndexed, selectUltraSparseExpertsMasked, createUltraSparseSelector, createUltraSparsePlan };
