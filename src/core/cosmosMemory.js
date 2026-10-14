import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";
import { upsertMemoryNode, searchMemoryGraph, getMemoryGraph as getLocalMemoryGraph, deleteMemoryNode as deleteLocalMemoryNode } from "./memoryGraph.js";
import { rankMemories } from "./memoryRanking.js";
import { isAutoApproveEnabled, queueMemory, rejectMemory } from "./memoryInbox.js";
import { memoryGraphService } from "./memoryGraphService.js";
import { supabaseClient } from "../lib/supabase.js";
import { searchMemory, connectMemoryNodes as connectMemoryNodesEngine } from "./memoryEngine.js";
import { safeStorage } from "../lib/safeStorage.js";
import { getAccountScope, getAccountStorageKey } from "./accountScope.js";
import { removeMemoryFromContext } from "./contextManager.js";

const MEMORY_TYPES = Object.freeze({
  TEMPORARY: "temporary",
  IMPORTANT: "important",
  PATTERN: "pattern",
  PREFERENCE: "preference",
  FACT: "fact",
  DECISION: "decision",
  PERSON: "person",
  PROJECT: "project",
  GOAL: "goal",
  TASK: "task",
  HABIT: "habit",
  DEVICE: "device",
  FILE: "file",
  ARTIFACT: "artifact",
  CONVERSATION: "conversation",
  PLACE: "place",
  COMMAND: "command",
  WORKFLOW: "workflow",
  AGENT: "agent",
  SOURCE: "source",
  EVENT: "event",
});

const PRIVACY_SCOPES = Object.freeze({
  PRIVATE: "private",
  PROJECT: "project",
  SHARED: "shared",
  PUBLIC: "public",
});

const INGESTION_SOURCES = Object.freeze({
  USER_EXPLICIT: "user_explicit",
  CONVERSATION: "conversation",
  AGENT_INFERRED: "agent_inferred",
  FILE_IMPORT: "file_import",
  WEB_RESEARCH: "web_research",
  SCREEN_OBSERVATION: "screen_observation",
  CAMERA_OBSERVATION: "camera_observation",
  DEVICE_EVENT: "device_event",
  INTEGRATION: "integration",
  SYSTEM: "system",
});

function generateMemoryId() {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateCandidateId() {
  return `cand_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function scopedId(id) {
  return `${getAccountScope()}\u0000${id}`;
}

function validateMemoryUpdate(updates = {}) {
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) return "Memory updates must be an object.";
  const allowed = new Set(["value", "type", "confidence", "tags", "projectId", "privacyScope", "metadata", "expectedUpdatedAt"]);
  if (Object.keys(updates).some((key) => !allowed.has(key))) return "Memory updates contain immutable or unsupported fields.";
  if (updates.value !== undefined && (typeof updates.value !== "string" || !updates.value.trim() || updates.value.length > 20_000)) return "Memory content must be a non-empty string up to 20000 characters.";
  if (updates.type !== undefined && !Object.values(MEMORY_TYPES).includes(updates.type)) return "Unsupported memory type.";
  if (updates.confidence !== undefined && (!Number.isFinite(updates.confidence) || updates.confidence < 0 || updates.confidence > 1)) return "Confidence must be between 0 and 1.";
  if (updates.tags !== undefined && (!Array.isArray(updates.tags) || updates.tags.length > 50 || updates.tags.some((tag) => typeof tag !== "string" || tag.length > 100))) return "Tags must be at most 50 strings of 100 characters or fewer.";
  if (updates.privacyScope !== undefined && !Object.values(PRIVACY_SCOPES).includes(updates.privacyScope)) return "Unsupported privacy scope.";
  if (updates.projectId !== undefined && updates.projectId !== null && (typeof updates.projectId !== "string" || updates.projectId.length > 200)) return "Project scope is invalid.";
  if (updates.metadata !== undefined) {
    const allowedMetadata = new Set(["validFrom", "validTo", "expiresAt", "freshness", "correctionNote", "contradictionNote", "retentionPolicy"]);
    if (!updates.metadata || typeof updates.metadata !== "object" || Array.isArray(updates.metadata) || Object.keys(updates.metadata).some((key) => !allowedMetadata.has(key))) return "Memory provenance and authority metadata are immutable through this update API.";
    try { if (JSON.stringify(updates.metadata).length > 8_000) return "Memory metadata exceeds 8000 characters."; } catch { return "Memory metadata must be serializable JSON."; }
  }
  return null;
}

class CosmosMemory {
  constructor() {
    this.candidates = new Map();
    this.supersessions = new Map();
    this.deletionTombstones = new Map();
    this.listeners = new Set();
    this.initializedUsers = new Set();
    this.loadedScopes = new Set();
    this.load();
  }

  load() {
    const scope = getAccountScope();
    if (this.loadedScopes.has(scope)) return;
    try {
      const stored = safeStorage.getItem(getAccountStorageKey("cosmos_candidates", scope));
      if (stored) {
        const parsed = JSON.parse(stored);
        Object.entries(parsed).forEach(([id, candidate]) => {
          this.candidates.set(scopedId(id), { ...candidate, accountScope: scope });
        });
      }
      const tombstones = safeStorage.getItem(getAccountStorageKey("cosmos_tombstones", scope));
      if (tombstones) {
        const parsed = JSON.parse(tombstones);
        Object.entries(parsed).forEach(([id, tombstone]) => {
          this.deletionTombstones.set(scopedId(id), { ...tombstone, accountScope: scope });
        });
      }
      this.loadedScopes.add(scope);
    } catch (err) {
      console.warn("Failed to load Cosmos memory:", err);
    }
  }

  save() {
    const scope = getAccountScope();
    this.load();
    try {
      const inScope = (entries) => Object.fromEntries(Array.from(entries).filter(([, record]) => record.accountScope === scope).map(([, record]) => [record.id, record]));
      safeStorage.setItem(getAccountStorageKey("cosmos_candidates", scope), JSON.stringify(inScope(this.candidates)));
      safeStorage.setItem(getAccountStorageKey("cosmos_tombstones", scope), JSON.stringify(inScope(this.deletionTombstones)));
    } catch (err) {
      console.warn("Failed to save Cosmos memory:", err);
    }
  }

  async ingestMemory(input) {
    this.load();
    const {
      value,
      type = MEMORY_TYPES.FACT,
      source = INGESTION_SOURCES.CONVERSATION,
      confidence = 0.7,
      tags = [],
      projectId = null,
      privacyScope = PRIVACY_SCOPES.PRIVATE,
      metadata = {},
      explicit = false,
    } = input;

    const text = String(value || "").trim();
    if (!text) {
      return { success: false, error: "Memory content cannot be empty" };
    }

    const isSensitive = this.detectSensitivity(text, type);
    const shouldGate = (type === MEMORY_TYPES.IMPORTANT || type === MEMORY_TYPES.FACT || type === MEMORY_TYPES.DECISION || isSensitive) && !explicit;

    if (shouldGate && !isAutoApproveEnabled()) {
      const candidate = await this.createCandidate({
        value: text,
        type,
        source,
        confidence,
        tags,
        projectId,
        privacyScope,
        metadata,
        isSensitive,
      });
      return { pending: true, candidate };
    }

    return this.persistMemory({
      value: text,
      type,
      source,
      confidence,
      tags,
      projectId,
      privacyScope,
      metadata,
      explicit,
    });
  }

  async createCandidate(input) {
    this.load();
    const id = generateCandidateId();
    const candidate = {
      id,
      accountScope: getAccountScope(),
      ...input,
      createdAt: new Date().toISOString(),
      status: "pending",
    };

    this.candidates.set(scopedId(id), candidate);
    this.save();

    queueMemory({
      value: input.value,
      type: input.type,
      source: input.source,
    });

    publish("cosmos.candidate.created", candidate);
    recordAudit({
      action: "memory.candidate_created",
      status: "pending",
      metadata: { candidateId: id, type: input.type, isSensitive: input.isSensitive },
    });

    return candidate;
  }

  detectSensitivity(text, type) {
    const sensitivePatterns = [
      /\b(password|secret|key|token|credential|ssn|social security)\b/i,
      /\b(credit card|bank account|routing number)\b/i,
      /\b(medical|diagnosis|prescription|therapy)\b/i,
      /\b(legal|lawsuit|attorney|court)\b/i,
      /\b(personal|private|confidential)\b/i,
    ];

    if (type === MEMORY_TYPES.PERSON || type === MEMORY_TYPES.DECISION) {
      return true;
    }

    return sensitivePatterns.some(pattern => pattern.test(text));
  }

  async persistMemory(input) {
    this.load();
    const {
      value,
      type = MEMORY_TYPES.FACT,
      source = INGESTION_SOURCES.CONVERSATION,
      confidence = 0.7,
      tags = [],
      projectId = null,
      privacyScope = PRIVACY_SCOPES.PRIVATE,
      metadata = {},
      explicit = false,
    } = input;

    const id = generateMemoryId();
    const memory = {
      id,
      accountScope: getAccountScope(),
      value,
      type,
      source,
      confidence,
      tags,
      projectId,
      privacyScope,
      metadata: {
        ...metadata,
        accountScope: getAccountScope(),
        explicit,
        ingestedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      supersedes: null,
      supersededBy: null,
      expiresAt: null,
    };

    upsertMemoryNode(value, {
      id,
      type,
      confidence,
      tags,
      projectId,
      privacyScope,
      metadata: memory.metadata,
    });

    const userId = await this.getCurrentUserId();
    if (userId) {
      try {
        await memoryGraphService.upsertMemoryNode(userId, {
          id,
          nodeKey: id,
          value,
          type,
          confidence,
          tags,
          projectId,
          privacyScope,
          metadata: memory.metadata,
        });
      } catch (err) {
        console.warn("Failed to persist to Supabase:", err);
      }
    }

    publish("cosmos.memory.persisted", memory);
    recordAudit({
      action: "memory.persisted",
      status: "completed",
      metadata: { memoryId: id, type, projectId, privacyScope },
    });

    return { success: true, memory };
  }

  async getCurrentUserId() {
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      return user?.id || null;
    } catch {
      return null;
    }
  }

  async retrieveMemories(query, options = {}) {
    this.load();
    const queryText = String(query || "").trim();
    const requestedLimit = Number.isSafeInteger(options.limit) ? options.limit : 20;
    if (requestedLimit < 1 || requestedLimit > 100) return [];
    if (queryText.length > 2_000) return [];
    const minConfidence = options.minConfidence ?? 0;
    if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) return [];
    const {
      projectId = null,
      privacyScope = null,
      types = null,
      includeGraph = true,
      includeSupabase = true,
    } = options;

    let memories = [];

    const localResults = searchMemory(queryText);
    memories.push(...localResults);

    if (includeGraph) {
      const graphResults = searchMemoryGraph(queryText, requestedLimit);
      memories.push(...graphResults);
    }

    const userId = await this.getCurrentUserId();
    if (includeSupabase && userId) {
      try {
        const supabaseResults = await memoryGraphService.searchMemoryNodes(userId, queryText, requestedLimit);
        memories.push(...supabaseResults.map(r => ({
          id: r.id,
          value: r.value,
          type: r.node_type,
          confidence: r.confidence,
          tags: r.tags,
          privacyScope: r.privacy_scope || r.metadata?.privacyScope || "private",
          projectId: r.project_id || r.metadata?.projectId || null,
          accountScope: getAccountScope(),
          metadata: r.metadata,
          createdAt: new Date(r.created_at),
        })));
      } catch (err) {
        console.warn("Supabase search failed:", err);
      }
    }

    memories = memories.filter(m => {
      if (m.confidence < minConfidence) return false;
      if (projectId && m.projectId !== projectId) return false;
      if (privacyScope && m.privacyScope !== privacyScope) return false;
      if (types && Array.isArray(types) && !types.includes(m.type)) return false;
      if (this.deletionTombstones.has(scopedId(m.id))) return false;
      if (m.accountScope && m.accountScope !== getAccountScope()) return false;
      if (m.metadata?.supersededBy || m.metadata?.superseded_by || m.superseded_by) return false;
      return true;
    });

    memories = memories.filter((memory, index, arr) => 
      arr.findIndex(m => m.id === memory.id || m.node_key === memory.id) === index
    );

    const ranked = rankMemories(memories, queryText);

    return ranked.slice(0, requestedLimit);
  }

  async updateMemory(id, updates) {
    this.load();
    const validationError = validateMemoryUpdate(updates);
    if (validationError) return { success: false, error: validationError };
    const userId = await this.getCurrentUserId();
    if (!userId) return { success: false, error: "Not authenticated" };

    try {
      const existing = await memoryGraphService.getMemoryNode(userId, id);
      if (!existing) return { success: false, error: "Memory not found" };
      if (updates.expectedUpdatedAt && updates.expectedUpdatedAt !== existing.updated_at) return { success: false, error: "Memory changed since it was read.", conflict: true, currentVersion: existing.updated_at };

      const updated = {
        ...existing,
        ...updates,
        metadata: { ...(existing.metadata || {}), ...(updates.metadata || {}) },
        updatedAt: new Date().toISOString(),
      };
      delete updated.expectedUpdatedAt;

      await memoryGraphService.upsertMemoryNode(userId, updated);

      upsertMemoryNode(updated.value, {
        id: updated.id,
        type: updated.node_type,
        confidence: updated.confidence,
        tags: updated.tags,
        projectId: updated.project_id,
        privacyScope: updated.privacy_scope || updated.metadata?.privacyScope,
        metadata: updated.metadata,
      });

      publish("cosmos.memory.updated", { id, updates });
      recordAudit({
        action: "memory.updated",
        status: "completed",
        metadata: { memoryId: id, updates: Object.keys(updates) },
      });

      return { success: true, memory: updated };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async supersedeMemory(oldId, newId, reason = "superseded") {
    const userId = await this.getCurrentUserId();
    if (!userId) return { success: false, error: "Not authenticated" };

    try {
      const oldMemory = await memoryGraphService.getMemoryNode(userId, oldId);
      const newMemory = await memoryGraphService.getMemoryNode(userId, newId);

      if (!oldMemory || !newMemory) {
        return { success: false, error: "One or both memories not found" };
      }
      const alreadySupersededBy = oldMemory.metadata?.supersededBy || oldMemory.superseded_by;
      if (alreadySupersededBy) {
        if (alreadySupersededBy === newId) return { success: true, supersession: { id: oldMemory.metadata?.supersessionId || oldMemory.supersession_id, oldId, newId, reason, idempotent: true } };
        return { success: false, error: "Memory was already superseded by a different record." };
      }

      const supersession = {
        id: `super_${Date.now()}`,
        oldId,
        newId,
        reason,
        createdAt: new Date().toISOString(),
      };

      this.supersessions.set(supersession.id, supersession);

      const oldUpdated = { ...oldMemory, metadata: { ...(oldMemory.metadata || {}), supersededBy: newId, supersessionId: supersession.id } };
      const newUpdated = { ...newMemory, metadata: { ...(newMemory.metadata || {}), supersedes: oldId, supersessionId: supersession.id } };

      await memoryGraphService.upsertMemoryNode(userId, oldUpdated);
      try {
        await memoryGraphService.upsertMemoryNode(userId, newUpdated);
      } catch (error) {
        try {
          await memoryGraphService.upsertMemoryNode(userId, { ...oldMemory, metadata: oldMemory.metadata || {} });
        } catch (rollbackError) {
          return { success: false, error: error.message, rollback: "failed", rollbackError: rollbackError.message };
        }
        return { success: false, error: error.message, rollback: "completed" };
      }
      upsertMemoryNode(oldMemory.value, { id: oldMemory.id, type: oldMemory.node_type, confidence: oldMemory.confidence, tags: oldMemory.tags, metadata: oldUpdated.metadata });
      upsertMemoryNode(newMemory.value, { id: newMemory.id, type: newMemory.node_type, confidence: newMemory.confidence, tags: newMemory.tags, metadata: newUpdated.metadata });

      publish("cosmos.memory.superseded", supersession);
      recordAudit({
        action: "memory.superseded",
        status: "completed",
        metadata: supersession,
      });

      return { success: true, supersession };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async deleteMemory(id, options = {}) {
    this.load();
    const { hard = false, propagate = true } = options;
    if (!propagate) return { success: false, error: "Remote propagation is required; local tombstones cannot confirm a completed deletion." };
    const userId = await this.getCurrentUserId();
    if (!userId) return { success: false, error: "Not authenticated" };

    try {
      const tombstone = {
        id,
        accountScope: getAccountScope(),
        deletedAt: new Date().toISOString(),
        hard,
        reason: options.reason || "user_deleted",
      };

      this.deletionTombstones.set(scopedId(id), tombstone);
      this.save();

      deleteLocalMemoryNode(id);
      removeMemoryFromContext(id);

      if (propagate) {
        await memoryGraphService.deleteMemoryNode(userId, id);
      }

      publish("cosmos.memory.deleted", { id, tombstone });
      recordAudit({
        action: "memory.deleted",
        status: "completed",
        metadata: { memoryId: id, hard, propagate },
      });

      return { success: true, tombstone };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async connectMemories(fromId, toId, relation = "related", weight = 0.6) {
    this.load();
    const userId = await this.getCurrentUserId();
    if (!userId) return { success: false, error: "Not authenticated" };

    try {
      const edge = await connectMemoryNodesEngine(fromId, toId, relation, weight);
      
      if (userId) {
        await memoryGraphService.upsertMemoryEdge(userId, {
          fromNode: fromId,
          toNode: toId,
          relation,
          weight,
        });
      }

      return { success: true, edge };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getMemoryGraph(userId, options = {}) {
    this.load();
    const limit = Number.isSafeInteger(options.limit) ? options.limit : 500;
    if (limit < 1 || limit > 500) return { nodes: [], edges: [] };
    
    if (!userId) {
      return getLocalMemoryGraph();
    }
    const currentUserId = await this.getCurrentUserId();
    if (!currentUserId || currentUserId !== userId) return { nodes: [], edges: [] };

    try {
      return await memoryGraphService.getMemoryGraph(userId, limit);
    } catch (err) {
      console.warn("Supabase graph load failed:", err);
      return getLocalMemoryGraph();
    }
  }

  async getContradictions(query, limit = 10) {
    const memories = await this.retrieveMemories(query, { limit: 100 });
    const contradictions = [];

    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const m1 = memories[i];
        const m2 = memories[j];
        
        if (this.areContradictory(m1, m2)) {
          contradictions.push({
            memory1: m1,
            memory2: m2,
            confidence: Math.min(m1.confidence, m2.confidence),
            type: this.classifyContradiction(m1, m2),
          });
        }
      }
    }

    return contradictions.slice(0, limit);
  }

  areContradictory(m1, m2) {
    const v1 = String(m1.value || "").toLowerCase();
    const v2 = String(m2.value || "").toLowerCase();
    
    if (v1 === v2) return false;
    
    const negationPatterns = [
      { pos: "is", neg: "is not" },
      { pos: "can", neg: "cannot" },
      { pos: "will", neg: "will not" },
      { pos: "yes", neg: "no" },
      { pos: "true", neg: "false" },
      { pos: "enabled", neg: "disabled" },
      { pos: "active", neg: "inactive" },
    ];

    for (const { pos, neg } of negationPatterns) {
      if ((v1.includes(pos) && v2.includes(neg)) || (v1.includes(neg) && v2.includes(pos))) {
        return true;
      }
    }

    return false;
  }

  classifyContradiction(m1, m2) {
    if (m1.type === "decision" && m2.type === "decision") return "decision_conflict";
    if (m1.type === "fact" && m2.type === "fact") return "fact_conflict";
    if (m1.type === "preference" && m2.type === "preference") return "preference_conflict";
    return "general_conflict";
  }

  getCandidates() {
    this.load();
    return Array.from(this.candidates.values()).filter(c => c.accountScope === getAccountScope() && c.status === "pending");
  }

  getCandidate(id) {
    this.load();
    return this.candidates.get(scopedId(id)) || null;
  }

  async approveCandidate(id) {
    this.load();
    const key = scopedId(id);
    const candidate = this.candidates.get(key);
    if (!candidate) return { success: false, error: "Candidate not found" };

    const result = await this.persistMemory({
      value: candidate.value,
      type: candidate.type,
      source: candidate.source,
      confidence: candidate.confidence,
      tags: candidate.tags,
      projectId: candidate.projectId,
      privacyScope: candidate.privacyScope,
      metadata: candidate.metadata,
      explicit: true,
    });

    if (result.success) {
      candidate.status = "approved";
      candidate.approvedAt = new Date().toISOString();
      this.candidates.delete(key);
      this.save();
    }

    return result;
  }

  rejectCandidate(id, reason = "rejected_by_user") {
    this.load();
    const key = scopedId(id);
    const candidate = this.candidates.get(key);
    if (!candidate) return { success: false, error: "Candidate not found" };

    candidate.status = "rejected";
    candidate.rejectedAt = new Date().toISOString();
    candidate.rejectionReason = reason;
    this.candidates.delete(key);
    this.save();

    rejectMemory(id, reason);
    return { success: true };
  }

  getTombstones() {
    this.load();
    return Array.from(this.deletionTombstones.values()).filter((record) => record.accountScope === getAccountScope());
  }

  hasTombstone(id) {
    this.load();
    return this.deletionTombstones.has(scopedId(id));
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(event, data) {
    this.listeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (err) {
        console.error("Cosmos listener error:", err);
      }
    });
  }
}

export const cosmosMemory = new CosmosMemory();

export async function ingestMemory(input) {
  return cosmosMemory.ingestMemory(input);
}

export async function retrieveMemories(query, options) {
  return cosmosMemory.retrieveMemories(query, options);
}

export async function updateMemory(id, updates) {
  return cosmosMemory.updateMemory(id, updates);
}

export async function supersedeMemory(oldId, newId, reason) {
  return cosmosMemory.supersedeMemory(oldId, newId, reason);
}

export async function deleteMemory(id, options) {
  return cosmosMemory.deleteMemory(id, options);
}

export async function connectMemories(fromId, toId, relation, weight) {
  return cosmosMemory.connectMemories(fromId, toId, relation, weight);
}

export async function getMemoryGraph(userId, options) {
  return cosmosMemory.getMemoryGraph(userId, options);
}

export async function getContradictions(query, limit) {
  return cosmosMemory.getContradictions(query, limit);
}

export function getCandidates() {
  return cosmosMemory.getCandidates();
}

export function getCandidate(id) {
  return cosmosMemory.getCandidate(id);
}

export async function approveCandidate(id, userId) {
  return cosmosMemory.approveCandidate(id, userId);
}

export function rejectCandidate(id, reason) {
  return cosmosMemory.rejectCandidate(id, reason);
}

export function getTombstones() {
  return cosmosMemory.getTombstones();
}

export function hasTombstone(id) {
  return cosmosMemory.hasTombstone(id);
}

export function subscribeToCosmos(listener) {
  return cosmosMemory.subscribe(listener);
}

export { MEMORY_TYPES, PRIVACY_SCOPES, INGESTION_SOURCES };

export default cosmosMemory;
