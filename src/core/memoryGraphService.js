import { supabaseClient } from "../lib/supabase.js";

function toDomainNode(row) {
  if (!row) return row;
  return { ...row, rowId: row.id, id: row.node_key || row.id };
}

class MemoryGraphService {
  constructor(client = supabaseClient) {
    this.client = client;
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  async getMemoryNodes(userId, limit = 100, offset = 0) {
    const { data, error } = await this.client
      .from('hey_memory_nodes')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return (data || []).map(toDomainNode);
  }

  async getMemoryNode(userId, nodeId) {
    const { data, error } = await this.client
      .from('hey_memory_nodes')
      .select('*')
      .eq('user_id', userId)
      .eq('node_key', nodeId)
      .single();

    if (error) throw error;
    return toDomainNode(data);
  }

  async getMemoryNodeByKey(userId, nodeKey) {
    const { data, error } = await this.client
      .from('hey_memory_nodes')
      .select('*')
      .eq('user_id', userId)
      .eq('node_key', nodeKey)
      .single();

    if (error) throw error;
    return toDomainNode(data);
  }

  async upsertMemoryNode(userId, node) {
    const { data, error } = await this.client
      .from('hey_memory_nodes')
      .upsert({
        user_id: userId,
        node_key: node.node_key || node.nodeKey || node.id,
        value: node.value,
        node_type: node.type || node.node_type || 'memory',
        confidence: node.confidence ?? 0.7,
        tags: node.tags || [],
        metadata: { ...(node.metadata || {}), projectId: node.projectId ?? node.metadata?.projectId ?? null, privacyScope: node.privacyScope ?? node.metadata?.privacyScope ?? "private" },
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,node_key',
      })
      .select()
      .single();

    if (error) throw error;
    this.invalidateCache(userId);
    return toDomainNode(data);
  }

  async deleteMemoryNode(userId, nodeId) {
    const { error } = await this.client
      .from('hey_memory_nodes')
      .delete()
      .eq('user_id', userId)
      .eq('node_key', nodeId);

    if (error) throw error;
    this.invalidateCache(userId);
  }

  async getMemoryEdges(userId, nodeId) {
    const node = await this.getMemoryNode(userId, nodeId);
    if (!node?.rowId) return [];
    const { data, error } = await this.client
      .from('hey_memory_edges')
      .select('*')
      .eq('user_id', userId)
      .or(`from_node.eq.${node.rowId},to_node.eq.${node.rowId}`);

    if (error) throw error;
    return data || [];
  }

  async upsertMemoryEdge(userId, edge) {
    const [fromNode, toNode] = await Promise.all([
      this.getMemoryNode(userId, edge.fromNode),
      this.getMemoryNode(userId, edge.toNode),
    ]);
    if (!fromNode?.rowId || !toNode?.rowId) throw new Error("Both memory graph endpoints must exist for this account.");
    const { data, error } = await this.client
      .from('hey_memory_edges')
      .upsert({
        user_id: userId,
        from_node: fromNode.rowId,
        to_node: toNode.rowId,
        relation: edge.relation || 'related',
        weight: edge.weight ?? 0.6,
        metadata: edge.metadata || {},
      }, {
        onConflict: 'user_id,from_node,to_node,relation',
      })
      .select()
      .single();

    if (error) throw error;
    this.invalidateCache(userId);
    return data;
  }

  async deleteMemoryEdge(userId, edgeId) {
    const { error } = await this.client
      .from('hey_memory_edges')
      .delete()
      .eq('user_id', userId)
      .eq('id', edgeId);

    if (error) throw error;
    this.invalidateCache(userId);
  }

  async searchMemoryNodes(userId, query, limit = 20) {
    const text = String(query || "").trim().slice(0, 256);
    if (!text) return [];
    const safeLimit = Math.min(100, Math.max(1, Number.isInteger(limit) ? limit : 20));
    const pattern = `%${text.replace(/[\\%_]/g, "\\$&")}%`;
    const [byValue, byKey] = await Promise.all([
      this.client.from('hey_memory_nodes').select('*').eq('user_id', userId).ilike('value', pattern).order('confidence', { ascending: false }).limit(safeLimit),
      this.client.from('hey_memory_nodes').select('*').eq('user_id', userId).ilike('node_key', pattern).order('confidence', { ascending: false }).limit(safeLimit),
    ]);
    if (byValue.error) throw byValue.error;
    if (byKey.error) throw byKey.error;
    const unique = new Map();
    [...(byValue.data || []), ...(byKey.data || [])].forEach((node) => unique.set(node.id, node));
    return Array.from(unique.values()).slice(0, safeLimit).map(toDomainNode);
  }

  async getMemoryGraph(userId, limit = 500) {
    const [nodes, edges] = await Promise.all([
      this.getMemoryNodes(userId, limit),
      this.client
        .from('hey_memory_edges')
        .select('*')
        .eq('user_id', userId)
        .limit(limit),
    ]);

    if (edges.error) throw edges.error;
    return { nodes: nodes || [], edges: edges.data || [] };
  }

  async getMemoryNeighborhood(userId, nodeId, depth = 2) {
    const safeDepth = Number.isSafeInteger(depth) ? Math.max(0, Math.min(depth, 10)) : 2;
    const graph = await this.getMemoryGraph(userId, 500);
    const keyByRowId = new Map(graph.nodes.map((node) => [node.rowId, node.id]));
    const edges = graph.edges.map((edge) => ({ from: keyByRowId.get(edge.from_node), to: keyByRowId.get(edge.to_node) }))
      .filter((edge) => edge.from && edge.to);
    const visited = new Map();
    let frontier = [nodeId];
    for (let level = 0; level <= safeDepth && frontier.length; level += 1) {
      const next = [];
      for (const id of frontier) {
        if (visited.has(id)) continue;
        const node = graph.nodes.find((entry) => entry.id === id);
        if (!node) continue;
        visited.set(id, { ...node, depth: level });
        for (const edge of edges) {
          const neighbor = edge.from === id ? edge.to : edge.to === id ? edge.from : null;
          if (neighbor && !visited.has(neighbor)) next.push(neighbor);
        }
      }
      frontier = [...new Set(next)];
    }
    return [...visited.values()];
  }

  async batchUpsertNodes(userId, nodes) {
    if (!nodes.length) return [];
    
    const { data, error } = await this.client
      .from('hey_memory_nodes')
      .upsert(nodes.map(n => ({
        user_id: userId,
        node_key: n.node_key || n.nodeKey || n.id,
        value: n.value,
        node_type: n.type || n.node_type || 'memory',
        confidence: n.confidence ?? 0.7,
        tags: n.tags || [],
        metadata: { ...(n.metadata || {}), projectId: n.projectId ?? n.metadata?.projectId ?? null, privacyScope: n.privacyScope ?? n.metadata?.privacyScope ?? "private" },
        updated_at: new Date().toISOString(),
      })), {
        onConflict: 'user_id,node_key',
      })
      .select();

    if (error) throw error;
    this.invalidateCache(userId);
    return (data || []).map(toDomainNode);
  }

  async batchUpsertEdges(userId, edges) {
    if (!edges.length) return [];
    const resolved = await Promise.all(edges.map(async (edge) => {
      const [fromNode, toNode] = await Promise.all([
        this.getMemoryNode(userId, edge.fromNode),
        this.getMemoryNode(userId, edge.toNode),
      ]);
      if (!fromNode?.rowId || !toNode?.rowId) throw new Error("Both memory graph endpoints must exist for this account.");
      return { ...edge, fromNode: fromNode.rowId, toNode: toNode.rowId };
    }));
    const { data, error } = await this.client
      .from('hey_memory_edges')
      .upsert(resolved.map(e => ({
        user_id: userId,
        from_node: e.fromNode,
        to_node: e.toNode,
        relation: e.relation || 'related',
        weight: e.weight ?? 0.6,
        metadata: e.metadata || {},
      })), {
        onConflict: 'user_id,from_node,to_node,relation',
      })
      .select();

    if (error) throw error;
    this.invalidateCache(userId);
    return data || [];
  }

  invalidateCache(userId) {
    this.cache.delete(userId);
  }

  getCachedGraph(userId) {
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }
    return null;
  }

  setCachedGraph(userId, data) {
    this.cache.set(userId, { data, timestamp: Date.now() });
  }
}

export { MemoryGraphService };
export const memoryGraphService = new MemoryGraphService();
