import { supabaseClient } from "../lib/supabase.js";

class MemoryGraphService {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  async getMemoryNodes(userId, limit = 100, offset = 0) {
    const { data, error } = await supabaseClient
      .from('hey_memory_nodes')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data || [];
  }

  async getMemoryNode(userId, nodeId) {
    const { data, error } = await supabaseClient
      .from('hey_memory_nodes')
      .select('*')
      .eq('user_id', userId)
      .eq('id', nodeId)
      .single();

    if (error) throw error;
    return data;
  }

  async getMemoryNodeByKey(userId, nodeKey) {
    const { data, error } = await supabaseClient
      .from('hey_memory_nodes')
      .select('*')
      .eq('user_id', userId)
      .eq('node_key', nodeKey)
      .single();

    if (error) throw error;
    return data;
  }

  async upsertMemoryNode(userId, node) {
    const { data, error } = await supabaseClient
      .from('hey_memory_nodes')
      .upsert({
        user_id: userId,
        node_key: node.nodeKey || node.id,
        value: node.value,
        node_type: node.type || 'memory',
        confidence: node.confidence ?? 0.7,
        tags: node.tags || [],
        metadata: node.metadata || {},
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,node_key',
      })
      .select()
      .single();

    if (error) throw error;
    this.invalidateCache(userId);
    return data;
  }

  async deleteMemoryNode(userId, nodeId) {
    const { error } = await supabaseClient
      .from('hey_memory_nodes')
      .delete()
      .eq('user_id', userId)
      .eq('id', nodeId);

    if (error) throw error;
    this.invalidateCache(userId);
  }

  async getMemoryEdges(userId, nodeId) {
    const { data, error } = await supabaseClient
      .from('hey_memory_edges')
      .select('*')
      .eq('user_id', userId)
      .or(`from_node.eq.${nodeId},to_node.eq.${nodeId}`);

    if (error) throw error;
    return data || [];
  }

  async upsertMemoryEdge(userId, edge) {
    const { data, error } = await supabaseClient
      .from('hey_memory_edges')
      .upsert({
        user_id: userId,
        from_node: edge.fromNode,
        to_node: edge.toNode,
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
    const { error } = await supabaseClient
      .from('hey_memory_edges')
      .delete()
      .eq('user_id', userId)
      .eq('id', edgeId);

    if (error) throw error;
    this.invalidateCache(userId);
  }

  async searchMemoryNodes(userId, query, limit = 20) {
    const { data, error } = await supabaseClient
      .from('hey_memory_nodes')
      .select('*')
      .eq('user_id', userId)
      .or(`value.ilike.%${query}%,node_key.ilike.%${query}%`)
      .order('confidence', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  async getMemoryGraph(userId, limit = 500) {
    const [nodes, edges] = await Promise.all([
      this.getMemoryNodes(userId, limit),
      supabaseClient
        .from('hey_memory_edges')
        .select('*')
        .eq('user_id', userId)
        .limit(limit),
    ]);

    return {
      nodes: nodes || [],
      edges: edges.data || [],
    };
  }

  async getMemoryNeighborhood(userId, nodeId, depth = 2) {
    const visited = new Set();
    const neighborhood = [];
    const frontier = [nodeId];

    for (let level = 0; level <= depth && frontier.length > 0; level++) {
      const nextFrontier = [];
      
      for (const id of frontier) {
        if (visited.has(id)) continue;
        visited.add(id);

        const node = await this.getMemoryNode(userId, id);
        if (node) {
          neighborhood.push({ ...node, depth: level });
        }

        const edges = await this.getMemoryEdges(userId, id);
        for (const edge of edges) {
          const neighborId = edge.from_node === id ? edge.to_node : edge.from_node;
          if (!visited.has(neighborId)) {
            nextFrontier.push(neighborId);
          }
        }
      }
      
      frontier.splice(0, frontier.length, ...nextFrontier);
    }

    return neighborhood;
  }

  async batchUpsertNodes(userId, nodes) {
    if (!nodes.length) return [];
    
    const { data, error } = await supabaseClient
      .from('hey_memory_nodes')
      .upsert(nodes.map(n => ({
        user_id: userId,
        node_key: n.nodeKey || n.id,
        value: n.value,
        node_type: n.type || 'memory',
        confidence: n.confidence ?? 0.7,
        tags: n.tags || [],
        metadata: n.metadata || {},
        updated_at: new Date().toISOString(),
      })), {
        onConflict: 'user_id,node_key',
      })
      .select();

    if (error) throw error;
    this.invalidateCache(userId);
    return data || [];
  }

  async batchUpsertEdges(userId, edges) {
    if (!edges.length) return [];
    
    const { data, error } = await supabaseClient
      .from('hey_memory_edges')
      .upsert(edges.map(e => ({
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

export const memoryGraphService = new MemoryGraphService();