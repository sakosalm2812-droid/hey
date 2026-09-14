import { supabase } from "./supabase.js";
import { subscribe } from "../core/eventBus.js";
import { upsertMemoryNode, connectMemoryNodes } from "../core/memoryGraph.js";
import { restoreAuditEntries } from "../core/auditLog.js";
import { seedPermissions } from "../core/permissionManager.js";
import { addImportantFact, addPattern } from "../core/contextManager.js";
import {
  saveMemoryNode,
  saveMemoryEdge,
  saveAuditEntry,
  saveActionRun,
} from "./intelligenceRecords.js";
import { setPermission } from "./platformRecords.js";

const HYDRATE_NODE_LIMIT = 500;
const HYDRATE_EDGE_LIMIT = 1000;
const HYDRATE_AUDIT_LIMIT = 100;

let enabled = false;
let unsubscribers = [];

function safeSync(promise) {
  if (promise?.catch) {
    promise.catch((error) => {
      console.error("HEY persistence sync failed", error);
    });
  }
}

export function enablePersistenceSync() {
  if (enabled) return;
  enabled = true;

  unsubscribers = [
    subscribe("memory.node.updated", (node) => {
      if (node?.id) safeSync(saveMemoryNode(node));
    }),
    subscribe("memory.edge.created", (edge) => {
      safeSync(saveMemoryEdge(edge));
    }),
    subscribe("audit.recorded", (entry) => {
      safeSync(saveAuditEntry(entry));
    }),
    subscribe("permission.updated", (value) => {
      if (!value?.permission) return;
      safeSync(
        currentUser().then((userId) => {
          if (!userId) return null;
          return setPermission(
            userId,
            value.permission,
            value.status === "revoked" ? "revoked" : "granted",
            value.scope || "account",
          );
        }),
      );
    }),
    subscribe("action.updated", (action) => {
      if (action?.id) safeSync(saveActionRun(action));
    }),
  ];
}

export function disablePersistenceSync() {
  unsubscribers.forEach((stop) => stop());
  unsubscribers = [];
  enabled = false;
}

async function currentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

/**
 * Load the signed-in account's granted permissions, memory graph, and audit
 * trail into the in-memory brain so the experience survives a reload.
 */
export async function hydrateFromSupabase(options = {}) {
  const authenticatedUserId = await currentUser();
  const userId = options.userId || authenticatedUserId;
  if (!userId || authenticatedUserId !== userId) {
    return { hydrated: false, reason: "no_session" };
  }

  const [
    { data: permissions },
    { data: nodes },
    { data: edges },
    { data: auditEntries },
  ] = await Promise.all([
    supabase
      .from("hey_permissions")
      .select("permission, status, scope, updated_at")
      .eq("user_id", userId)
      .eq("status", "granted"),
    supabase
      .from("hey_memory_nodes")
      .select("id, node_key, value, node_type, confidence, tags")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(HYDRATE_NODE_LIMIT),
    supabase
      .from("hey_memory_edges")
      .select("from_node, to_node, relation, weight")
      .eq("user_id", userId)
      .limit(HYDRATE_EDGE_LIMIT),
    supabase
      .from("hey_audit")
      .select("id, action, tool, risk_level, status, request_id, metadata, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(HYDRATE_AUDIT_LIMIT),
  ]);

  if (options.isCurrent && !options.isCurrent()) {
    return { hydrated: false, reason: "stale_session" };
  }

  if (Array.isArray(permissions)) {
    seedPermissions(permissions, userId);
  }

  const nodeKeyByRowId = new Map();
  (nodes || []).forEach((node) => {
    const restored = upsertMemoryNode(node.value, {
      id: node.node_key,
      type: node.node_type,
      confidence: node.confidence,
      tags: node.tags || [],
    });
    if (restored) {
      nodeKeyByRowId.set(node.id, node.node_key);
    }
    if (node.node_type === "important" || node.node_type === "preference") {
      addImportantFact(
        node.value ? { value: node.value, id: node.node_key } : node,
        { id: node.node_key },
      );
    }
    if (node.node_type === "pattern") {
      addPattern(node.value, { id: node.node_key });
    }
  });

  (edges || []).forEach((edge) => {
    const fromKey = nodeKeyByRowId.get(edge.from_node);
    const toKey = nodeKeyByRowId.get(edge.to_node);
    if (fromKey && toKey) {
      connectMemoryNodes(fromKey, toKey, edge.relation || "related", typeof edge.weight === "number" ? edge.weight : 0.6);
    }
  });

  if (Array.isArray(auditEntries)) {
    restoreAuditEntries(auditEntries);
  }

  return {
    hydrated: true,
    permissions: Array.isArray(permissions) ? permissions.length : 0,
    nodes: Array.isArray(nodes) ? nodes.length : 0,
    edges: Array.isArray(edges) ? edges.length : 0,
    audit: Array.isArray(auditEntries) ? auditEntries.length : 0,
  };
}
