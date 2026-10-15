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
const EXPERT_BY_ID = new Map(EXPERTS.map((expert) => [expert.id, expert]));
const TOKEN_EXPERT_INDEX = new Map();

for (const expert of EXPERTS) {
  for (const term of expert.terms) {
    if (!TOKEN_EXPERT_INDEX.has(term)) TOKEN_EXPERT_INDEX.set(term, []);
    TOKEN_EXPERT_INDEX.get(term).push(expert.id);
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

function formatSelection(ranked, requestedLimit, truncated) {
  const chosen = ranked.filter((expert) => expert.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, requestedLimit);
  return {
    experts: chosen.map(({ id, score }) => ({ id, score })),
    matchedTerms: chosen.flatMap(({ id, matchedTerms }) => matchedTerms.map((term) => ({ expert: id, term }))),
    status: chosen.length ? "selected" : "no_match",
    truncated,
  };
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

/**
 * Connects the prototype expert labels to HEY's canonical provider plan.
 * The result is a routing proposal only; callers must still execute and
 * validate provider inference through the existing trusted runtime.
 */
export function createUltraSparsePlan(input, { intent = "conversation", limit = 2 } = {}) {
  return {
    prototype: "lexical-ultrasparse-v1",
    experts: selectUltraSparseExperts(input, { limit }),
    providerPlan: createProviderPlan({ intent }),
    inferencePerformed: false,
  };
}

export default { selectUltraSparseExperts, selectUltraSparseExpertsIndexed, createUltraSparsePlan };
