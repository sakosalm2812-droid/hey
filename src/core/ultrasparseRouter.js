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

function tokenize(text) {
  return text.toLowerCase().match(/[a-z0-9]+/g) || [];
}

/**
 * Route a bounded text request to a few lexical expert labels.
 * This is an interpretable CPU-only research baseline, not a trained router.
 */
export function selectUltraSparseExperts(input, { limit = 2 } = {}) {
  if (typeof input !== "string") return { experts: [], matchedTerms: [], status: "invalid_input" };

  const query = input.slice(0, MAX_QUERY_LENGTH);
  const tokens = tokenize(query);
  const tokenSet = new Set(tokens);
  const requestedLimit = Number.isInteger(limit) ? Math.max(1, Math.min(MAX_EXPERTS, limit)) : 2;
  const ranked = EXPERTS.map((expert) => {
    const matchedTerms = expert.terms.filter((term) => tokenSet.has(term));
    return { id: expert.id, score: matchedTerms.length, matchedTerms };
  }).filter((expert) => expert.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

  const chosen = ranked.slice(0, requestedLimit);
  return {
    experts: chosen.map(({ id, score }) => ({ id, score })),
    matchedTerms: chosen.flatMap(({ id, matchedTerms }) => matchedTerms.map((term) => ({ expert: id, term }))),
    status: chosen.length ? "selected" : "no_match",
    truncated: input.length > MAX_QUERY_LENGTH,
  };
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

export default { selectUltraSparseExperts, createUltraSparsePlan };
