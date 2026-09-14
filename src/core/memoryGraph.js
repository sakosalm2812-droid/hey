import { publish } from "./eventBus.js";

const nodes = new Map();
const edges = new Map();

function idFor(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export function upsertMemoryNode(value, metadata = {}) {
  const text = String(value || "").trim();
  if (!text) return null;
  const id = metadata.id || idFor(text) || crypto.randomUUID();
  const node = { id, value: text, type: metadata.type || "memory", confidence: metadata.confidence ?? 0.7, tags: metadata.tags || [], updatedAt: new Date(), ...metadata };
  nodes.set(id, node);
  publish("memory.node.updated", node);
  return node;
}

export function connectMemoryNodes(from, to, relation = "related", weight = 0.6) {
  const fromNode = typeof from === "object" ? upsertMemoryNode(from.value, from) : nodes.get(from) || upsertMemoryNode(from);
  const toNode = typeof to === "object" ? upsertMemoryNode(to.value, to) : nodes.get(to) || upsertMemoryNode(to);
  if (!fromNode || !toNode) return null;
  const key = `${fromNode.id}:${relation}:${toNode.id}`;
  const edge = { id: key, from: fromNode.id, to: toNode.id, relation, weight, updatedAt: new Date() };
  edges.set(key, edge);
  publish("memory.edge.created", edge);
  return edge;
}

export function searchMemoryGraph(query, limit = 12) {
  const normalized = String(query || "").toLowerCase();
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const slug = idFor(normalized);

  return Array.from(nodes.values())
    .map((entry) => {
      const value = entry.value.toLowerCase();
      const valueSlug = idFor(value);
      const tagText = (entry.tags || []).join(" ").toLowerCase();
      let score = 0;
      if (!normalized) {
        score = 0.5;
      } else if (value === normalized) {
        score = 1;
      } else if (value.startsWith(normalized)) {
        score = 0.95;
      } else if (slug && valueSlug.startsWith(slug)) {
        score = 0.9;
      } else if (tokens.length && tokens.every((token) => value.includes(token))) {
        score = 0.75;
      } else if (tagText.includes(normalized)) {
        score = 0.6;
      } else if (value.includes(normalized)) {
        score = 0.5;
      }
      return { entry, score };
    })
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        new Date(right.entry.updatedAt) - new Date(left.entry.updatedAt),
    )
    .slice(0, limit)
    .map((entry) => entry.entry);
}

export function getMemoryNeighborhood(nodeId, depth = 1) {
  const result = new Map();
  let frontier = [nodeId];
  for (let level = 0; level <= depth; level += 1) {
    const next = [];
    frontier.forEach((id) => {
      const node = nodes.get(id);
      if (node) result.set(id, node);
      edges.forEach((edge) => {
        if (edge.from === id && !result.has(edge.to)) next.push(edge.to);
        if (edge.to === id && !result.has(edge.from)) next.push(edge.from);
      });
    });
    frontier = next;
  }
  return Array.from(result.values());
}

export function getMemoryGraph() {
  return { nodes: Array.from(nodes.values()), edges: Array.from(edges.values()) };
}

export function clearMemoryGraph() {
  nodes.clear();
  edges.clear();
}

export default { upsertMemoryNode, connectMemoryNodes, searchMemoryGraph, getMemoryNeighborhood, getMemoryGraph, clearMemoryGraph };
