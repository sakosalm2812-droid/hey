import { publish } from "./eventBus.js";
import { getAccountScope } from "./accountScope.js";

const nodes = new Map();
const edges = new Map();

function scopedKey(id, scope = getAccountScope()) {
  return `${scope}\u0000${id}`;
}

function idFor(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export function upsertMemoryNode(value, metadata = {}) {
  const text = String(value || "").trim();
  if (!text) return null;
  const id = metadata.id || idFor(text) || crypto.randomUUID();
  const scope = getAccountScope();
  const node = { value: text, type: metadata.type || "memory", confidence: metadata.confidence ?? 0.7, tags: metadata.tags || [], updatedAt: new Date(), ...metadata, id, accountScope: scope };
  nodes.set(scopedKey(id, scope), node);
  publish("memory.node.updated", node);
  return node;
}

export function connectMemoryNodes(from, to, relation = "related", weight = 0.6) {
  const scope = getAccountScope();
  const fromNode = typeof from === "object" ? upsertMemoryNode(from.value, from) : nodes.get(scopedKey(from, scope)) || upsertMemoryNode(from);
  const toNode = typeof to === "object" ? upsertMemoryNode(to.value, to) : nodes.get(scopedKey(to, scope)) || upsertMemoryNode(to);
  if (!fromNode || !toNode) return null;
  const key = scopedKey(`${fromNode.id}:${relation}:${toNode.id}`, scope);
  const edge = { id: `${fromNode.id}:${relation}:${toNode.id}`, accountScope: scope, from: fromNode.id, to: toNode.id, relation, weight, updatedAt: new Date() };
  edges.set(key, edge);
  publish("memory.edge.created", edge);
  return edge;
}

export function searchMemoryGraph(query, limit = 12) {
  const normalized = String(query || "").toLowerCase();
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const slug = idFor(normalized);

  return Array.from(nodes.values()).filter((node) => node.accountScope === getAccountScope())
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
  const scope = getAccountScope();
  let frontier = [nodeId];
  for (let level = 0; level <= depth; level += 1) {
    const next = [];
    frontier.forEach((id) => {
      const node = nodes.get(scopedKey(id, scope));
      if (node) result.set(id, node);
      edges.forEach((edge) => {
        if (edge.accountScope !== scope) return;
        if (edge.from === id && !result.has(edge.to)) next.push(edge.to);
        if (edge.to === id && !result.has(edge.from)) next.push(edge.from);
      });
    });
    frontier = next;
  }
  return Array.from(result.values());
}

export function getMemoryGraph() {
  const scope = getAccountScope();
  return {
    nodes: Array.from(nodes.values()).filter((node) => node.accountScope === scope),
    edges: Array.from(edges.values()).filter((edge) => edge.accountScope === scope),
  };
}

export function deleteMemoryNode(id) {
  const scope = getAccountScope();
  const key = scopedKey(id, scope);
  const existed = nodes.delete(key);
  edges.forEach((edge, edgeKey) => {
    if (edge.accountScope === scope && (edge.from === id || edge.to === id)) edges.delete(edgeKey);
  });
  return existed;
}

export function clearMemoryGraph() {
  const scope = getAccountScope();
  nodes.forEach((node, key) => { if (node.accountScope === scope) nodes.delete(key); });
  edges.forEach((edge, key) => { if (edge.accountScope === scope) edges.delete(key); });
}

export default { upsertMemoryNode, connectMemoryNodes, searchMemoryGraph, getMemoryNeighborhood, getMemoryGraph, deleteMemoryNode, clearMemoryGraph };
