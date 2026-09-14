import {
    addMemory,
    addImportantFact,
    addPattern,
    getContext,
  } from "./contextManager.js";
  import {
    upsertMemoryNode,
    searchMemoryGraph,
  } from "./memoryGraph.js";
  import { rankMemories } from "./memoryRanking.js";
  import { isAutoApproveEnabled, queueMemory } from "./memoryInbox.js";
  import { memoryGraphService } from "./memoryGraphService.js";
  import { supabaseClient } from "../lib/supabase.js";
  
  const memoryTypes = {
    temporary: "temporary",
    important: "important",
    pattern: "pattern",
    preference: "preference",
  };
  
  const initializedUsers = new Set();
  
  function createMemory(value, type = memoryTypes.temporary) {
    return {
      id: crypto.randomUUID(),
      value,
      type,
      createdAt: new Date(),
      importance:
        type === memoryTypes.important ? 1 : 0.5,
    };
  }
  
  function getCurrentUserIdSync() {
    try {
      if (typeof window !== 'undefined' && window.supabaseAuthUser) {
        return window.supabaseAuthUser.id;
      }
    } catch {
      // ignore
    }
    return null;
  }
  
  async function getCurrentUserId() {
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      return user?.id || null;
    } catch {
      return null;
    }
  }
  
  async function ensureUserInitialized(userId) {
    if (initializedUsers.has(userId)) return;
    
    try {
      const graph = await memoryGraphService.getMemoryGraph(userId, 200);
      const context = getContext();
      
      for (const node of graph.nodes) {
        const memory = {
          id: node.id,
          value: node.value,
          type: node.node_type,
          confidence: node.confidence,
          tags: node.tags,
          metadata: node.metadata,
          createdAt: new Date(node.created_at),
          updatedAt: new Date(node.updated_at),
        };
        
        if (node.node_type === 'important' || node.node_type === 'preference') {
          context.memory.importantFacts.push(memory);
        } else if (node.node_type === 'pattern') {
          context.memory.patterns.push(memory);
        } else {
          context.memory.shortTerm.push(memory);
        }
      }
      
      for (const edge of graph.edges) {
        upsertMemoryNode(edge.from_node, { id: edge.from_node });
        upsertMemoryNode(edge.to_node, { id: edge.to_node });
      }
      
      initializedUsers.add(userId);
    } catch (err) {
      console.warn('Failed to load memory graph for user:', err);
    }
  }
  
export function storeMemory(value, type = memoryTypes.temporary, options = {}) {
    const memory = createMemory(value, type);
    const userId = getCurrentUserIdSync();
    
    const autoApprove = isAutoApproveEnabled();
    
    if (
      type === memoryTypes.important &&
      !options.explicit &&
      !autoApprove
    ) {
      return queueMemory({
        value: typeof value === "string" ? value : JSON.stringify(value),
        type,
        source: options.source || "assistant",
      });
    }
  
    upsertMemoryNode(typeof value === "string" ? value : JSON.stringify(value), { 
      type, 
      confidence: memory.importance, 
      id: memory.id 
    });
  
    if (userId) {
      memoryGraphService.upsertMemoryNode(userId, {
        id: memory.id,
        nodeKey: memory.id,
        value: typeof value === "string" ? value : JSON.stringify(value),
        type,
        confidence: memory.importance,
        tags: [],
        metadata: { ...options, source: options.source || 'assistant' },
      }).catch(err => console.warn('Failed to persist memory to Supabase:', err));
    }
  
    if (type === memoryTypes.important) {
      addImportantFact(memory);
    } else {
      addMemory(memory);
    }
  
    return memory;
  }
  
  
export async function storeMemoryAsync(value, type = memoryTypes.temporary, options = {}) {
    const memory = createMemory(value, type);
    const userId = await getCurrentUserId();
    
    if (
      type === memoryTypes.important &&
      !options.explicit &&
      !isAutoApproveEnabled()
    ) {
      return queueMemory({
        value: typeof value === "string" ? value : JSON.stringify(value),
        type,
        source: options.source || "assistant",
      });
    }
  
    upsertMemoryNode(typeof value === "string" ? value : JSON.stringify(value), { 
      type, 
      confidence: memory.importance, 
      id: memory.id 
    });
  
    if (userId) {
      try {
        await memoryGraphService.upsertMemoryNode(userId, {
          id: memory.id,
          nodeKey: memory.id,
          value: typeof value === "string" ? value : JSON.stringify(value),
          type,
          confidence: memory.importance,
          tags: [],
          metadata: { ...options, source: options.source || 'assistant' },
        });
        await ensureUserInitialized(userId);
      } catch (err) {
        console.warn('Failed to persist memory to Supabase:', err);
      }
    }
  
    if (type === memoryTypes.important) {
      addImportantFact(memory);
    } else {
      addMemory(memory);
    }
  
    return memory;
  }
  
  
export async function rememberPreference(preference) {
    const memory = createMemory(
      preference,
      memoryTypes.preference
    );
  
    addImportantFact(memory);
    
    const userId = await getCurrentUserId();
    if (userId) {
      try {
        await memoryGraphService.upsertMemoryNode(userId, {
          id: memory.id,
          nodeKey: memory.id,
          value: preference,
          type: memoryTypes.preference,
          confidence: 0.9,
          tags: ['preference'],
          metadata: { source: 'user' },
        });
        await ensureUserInitialized(userId);
      } catch (err) {
        console.warn('Failed to persist preference:', err);
      }
    }
  
    return memory;
  }
  
  
export async function rememberPattern(pattern) {
    addPattern(pattern, {
      id: crypto.randomUUID(),
      detectedAt: new Date(),
    });
  
    const userId = await getCurrentUserId();
    if (userId) {
      try {
        await memoryGraphService.upsertMemoryNode(userId, {
          id: crypto.randomUUID(),
          nodeKey: pattern.id || crypto.randomUUID(),
          value: pattern,
          type: memoryTypes.pattern,
          confidence: 0.7,
          tags: ['pattern'],
          metadata: { detectedAt: new Date().toISOString() },
        });
        await ensureUserInitialized(userId);
      } catch (err) {
        console.warn('Failed to persist pattern:', err);
      }
    }
  
    return getContext().memory.patterns;
  }
  
  
export function searchMemory(query) {
    const context = getContext();

    const allMemory = [
      ...context.memory.shortTerm,
      ...context.memory.importantFacts,
      ...context.memory.patterns,
    ];

    const graphMatches = searchMemoryGraph(query);

    const combined = [...allMemory, ...graphMatches].filter(
      (memory, index, collection) =>
        collection.findIndex(
          (item) => item.id === memory.id,
        ) === index,
    );

    const ranked = rankMemories(combined, query);

    return ranked.map((entry) => ({
      ...entry,
      value:
        entry.value ?? entry.description ?? entry.text,
    }));
  }


export async function searchMemoryAsync(query) {
    const context = getContext();
    const userId = await getCurrentUserId();

    const allMemory = [
      ...context.memory.shortTerm,
      ...context.memory.importantFacts,
      ...context.memory.patterns,
    ];

    const graphMatches = searchMemoryGraph(query);
    
    let supabaseMatches = [];
    if (userId) {
      try {
        supabaseMatches = await memoryGraphService.searchMemoryNodes(userId, query, 20);
      } catch (err) {
        console.warn('Failed to search Supabase memory:', err);
      }
    }

    const combined = [...allMemory, ...graphMatches, ...supabaseMatches].filter(
      (memory, index, collection) =>
        collection.findIndex(
          (item) => item.id === memory.id || item.node_key === memory.id,
        ) === index,
    );

    const ranked = rankMemories(combined, query);

    return ranked.map((entry) => ({
      ...entry,
      value:
        entry.value ?? entry.description ?? entry.text,
    }));
  }
  
  
export async function exportMemories() {
    const context = getContext();
    const userId = await getCurrentUserId();
    
    let supabaseMemories = [];
    if (userId) {
      try {
        supabaseMemories = await memoryGraphService.getMemoryNodes(userId, 500);
      } catch (err) {
        console.warn('Failed to load memories from Supabase:', err);
      }
    }
  
    return {
      exportedAt: new Date().toISOString(),
      memories: [
        ...context.memory.shortTerm,
        ...context.memory.importantFacts,
        ...context.memory.patterns,
        ...supabaseMemories.map(n => ({
          id: n.id,
          value: n.value,
          type: n.node_type,
          confidence: n.confidence,
          createdAt: new Date(n.created_at),
        })),
      ],
    };
  }
  
  
export function getImportantMemories() {
    return getContext().memory.importantFacts;
  }
  
  
export function getRecentMemories(limit = 10) {
    return getContext()
      .memory
      .shortTerm
      .slice(-limit);
  }
  
  
export function clearTemporaryMemory() {
    getContext().memory.shortTerm = [];
  }
  
  
export function buildMemorySummary() {
    const context = getContext();
  
    return {
      important:
        context.memory.importantFacts,
  
      patterns:
        context.memory.patterns,
  
      recent:
        context.memory.shortTerm.slice(-5),
    };
  }
  
export async function connectMemoryNodes(fromId, toId, relation = 'related', weight = 0.6) {
    const userId = await getCurrentUserId();
    if (!userId) return null;
  
    try {
      return await memoryGraphService.upsertMemoryEdge(userId, {
        fromNode: fromId,
        toNode: toId,
        relation,
        weight,
      });
    } catch (err) {
      console.warn('Failed to connect memory nodes:', err);
      return null;
    }
  }
  
export async function getMemoryConnections(nodeId) {
    const userId = await getCurrentUserId();
    if (!userId) return [];
  
    try {
      return await memoryGraphService.getMemoryEdges(userId, nodeId);
    } catch (err) {
      console.warn('Failed to get memory connections:', err);
      return [];
    }
  }
  
export async function initializeUserMemory() {
    const userId = await getCurrentUserId();
    if (userId) {
      await ensureUserInitialized(userId);
    }
  }
  
  export default {
    storeMemory,
    storeMemoryAsync,
    rememberPreference,
    rememberPattern,
    searchMemory,
    searchMemoryAsync,
    exportMemories,
    getImportantMemories,
    getRecentMemories,
    clearTemporaryMemory,
    buildMemorySummary,
    connectMemoryNodes,
    getMemoryConnections,
    initializeUserMemory,
  };