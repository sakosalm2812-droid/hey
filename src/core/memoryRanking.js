/**
 * Memory ranking and decay policy.
 *
 * Ranking combines:
 * - recency (how recently the memory changed)
 * - significance (importance / confidence)
 * - signal frequency (how often the memory updated)
 * - query affinity (substring / type relevance)
 *
 * Decay deliberately reduces the prominence of
 * stale, low-significance memories so old data
 * never overrides explicit new information.
 */

const NOW_MS = Date.now;

function normalizeDate(value, fallback) {
  const date = value instanceof Date
    ? value
    : new Date(value || fallback);

  return Number.isNaN(date.getTime())
    ? new Date(fallback)
    : date;
}

export function applyMemoryDecay(memory, options = {}) {
  const now = normalizeDate(options.now, NOW_MS()).getTime();
  const updatedAt = normalizeDate(
    memory.updatedAt || memory.createdAt,
    now,
  ).getTime();

  const ageDays = Math.max(0, (now - updatedAt) / 86400000);
  const halfLifeDays = options.halfLifeDays || 30;

  const current = Number(memory.importance ?? memory.confidence ?? 0.5);
  const typeFactor = String(memory.type || "temporary") === "important"
    ? 1.25
    : Number(memory.type === "pattern") ? 1.1 : 1;

  const decayed = Math.max(
    0.05,
    Math.min(1, current * typeFactor * Math.pow(0.5, ageDays / halfLifeDays)),
  );

  const relation = Math.abs(decayed - current) > 0.0001
    ? "decayed"
    : "unchanged";

  return {
    score: decayed,
    importance: decayed,
    ageDays,
    updatedAt,
    relation,
    decayed: relation === "decayed",
  };
}

export function scoreMemory(memory, query = "", options = {}) {
  const base = applyMemoryDecay(memory, options).score;

  let affinity = 0;
  const normalizedQuery = String(query || "").trim().toLowerCase();

  if (normalizedQuery) {
    const text = [
      memory.value,
      memory.category,
      memory.type,
      ...(memory.tags || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (text.includes(normalizedQuery)) {
      affinity += 0.5;
    }

    if (text.startsWith(normalizedQuery)) {
      affinity += 0.25;
    }
  } else {
    affinity = 0.15;
  }

  const frequency = Number.isFinite(memory.accessCount)
    ? Math.min(0.2, memory.accessCount * 0.05)
    : 0.05;

  const recencyBonus = Math.max(0, (1 - base.ageDays / 14) * 0.1);

  return Math.max(0, Math.min(1, base * 0.6 + affinity * 0.25 + frequency + recencyBonus));
}

export function rankMemories(memories = [], query = "", options = {}) {
  const now = normalizeDate(options.now, NOW_MS()).getTime();

  return [...memories]
    .map((memory) => {
      const decay = applyMemoryDecay(memory, { ...options, now });
      return {
        memory,
        score: scoreMemory(memory, query, { ...options, now }),
        decayed: decay.decayed,
      };
    })
    .sort((left, right) => left.score - right.score)
    .reverse()
    .map((entry, index) => ({
      ...entry.memory,
      rank: index + 1,
      score: Number(entry.score.toFixed(3)),
      decayed: entry.decayed,
      updatedAt: entry.memory.updatedAt || entry.memory.createdAt,
    }));
}

export function rankGraphNodes(graph, query = "", options = {}) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const ranked = nodes
    .map((node) => ({
      node,
      degree: (graph.edges || []).filter(
        (edge) => edge.from === node.id || edge.to === node.id,
      ).length,
    }))
    .map((entry) => ({
      ...entry,
      score: scoreMemory(entry.node, query, options) + entry.degree * 0.03,
    }))
    .sort((left, right) => right.score - left.score);

  return ranked.map((entry, index) => ({
    ...entry.node,
    degree: entry.degree,
    rank: index + 1,
    score: Number(entry.score.toFixed(3)),
  }));
}

export default {
  applyMemoryDecay,
  scoreMemory,
  rankMemories,
  rankGraphNodes,
};