import { recordAudit } from "./auditLog.js";
import { publish } from "./eventBus.js";
import { supabaseClient } from "../lib/supabase.js";

const ARTIFACT_TYPES = [
  "image",
  "frame",
  "video",
  "audio",
  "presentation",
  "document",
  "book_page",
  "ui_design",
  "website",
  "code_change",
  "workflow",
  "agent",
  "dashboard",
  "note",
  "research_brief",
  "dataset_transformation",
  "workspace_layout",
];

const ARTIFACT_STATUS = {
  DRAFT: "draft",
  GENERATED: "generated",
  MODIFIED: "modified",
  VERIFIED: "verified",
  APPROVED: "approved",
  FINAL: "final",
  ARCHIVED: "archived",
};

class ArtifactEngine {
  constructor() {
    this.artifacts = new Map();
    this.versionGraphs = new Map();
  }

  async createArtifact(params) {
    const artifact = {
      id: crypto.randomUUID(),
      projectId: params.projectId,
      type: params.type,
      title: params.title,
      description: params.description,
      content: params.content || {},
      metadata: params.metadata || {},
      status: ARTIFACT_STATUS.DRAFT,
      version: 1,
      parentVersionId: null,
      branchName: "main",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: params.createdBy,
      tags: params.tags || [],
    };

    if (!ARTIFACT_TYPES.includes(artifact.type)) {
      throw new Error(`Invalid artifact type: ${artifact.type}`);
    }

    this.artifacts.set(artifact.id, artifact);
    this.initializeVersionGraph(artifact.id);

    try {
      await this.persistArtifact(artifact);
    } catch (err) {
      console.warn('Failed to persist artifact:', err);
    }

    publish("artifact.created", { artifactId: artifact.id, projectId: artifact.projectId });
    recordAudit({
      action: "artifact.created",
      status: "completed",
      metadata: { artifactId: artifact.id, type: artifact.type, projectId: artifact.projectId },
    });

    return artifact;
  }

  async getArtifact(artifactId) {
    if (this.artifacts.has(artifactId)) {
      return this.artifacts.get(artifactId);
    }

    try {
      const { data } = await supabaseClient
        .from('hey_artifacts')
        .select('*')
        .eq('id', artifactId)
        .single();

      if (data) {
        const artifact = this.deserializeArtifact(data);
        this.artifacts.set(artifactId, artifact);
        return artifact;
      }
    } catch (err) {
      console.warn('Failed to load artifact:', err);
    }

    return null;
  }

  async updateArtifact(artifactId, updates) {
    const artifact = await this.getArtifact(artifactId);
    if (!artifact) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    const previousVersion = { ...artifact };

    const updated = {
      ...artifact,
      ...updates,
      version: artifact.version + 1,
      updatedAt: new Date().toISOString(),
      previousContent: artifact.content,
    };

    if (updates.content && updates.branchName) {
      updated.branchName = updates.branchName;
    }

    this.artifacts.set(artifactId, updated);
    this.addVersionToGraph(artifactId, updated, previousVersion);

    try {
      await this.persistArtifact(updated);
      await this.persistVersion(artifactId, updated, previousVersion);
    } catch (err) {
      console.warn('Failed to persist artifact update:', err);
    }

    publish("artifact.updated", { artifactId, version: updated.version });
    recordAudit({
      action: "artifact.updated",
      status: "completed",
      metadata: { artifactId, version: updated.version, changes: Object.keys(updates) },
    });

    return updated;
  }

  async createVersion(artifactId, params) {
    const artifact = await this.getArtifact(artifactId);
    if (!artifact) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    const version = {
      id: crypto.randomUUID(),
      artifactId,
      versionNumber: artifact.version + 1,
      branchName: params.branchName || artifact.branchName,
      parentVersionId: artifact.id,
      content: params.content || artifact.content,
      metadata: params.metadata || artifact.metadata,
      status: params.status || ARTIFACT_STATUS.DRAFT,
      message: params.message,
      createdAt: new Date().toISOString(),
      createdBy: params.createdBy,
      changes: this.computeChanges(artifact.content, params.content || artifact.content),
    };

    artifact.version = version.versionNumber;
    artifact.content = version.content;
    artifact.metadata = version.metadata;
    artifact.status = version.status;
    artifact.branchName = version.branchName;
    artifact.updatedAt = version.createdAt;
    artifact.parentVersionId = artifact.id;

    this.artifacts.set(artifactId, artifact);
    this.addVersionToGraph(artifactId, artifact, { content: params.content || artifact.content });

    try {
      await this.persistArtifact(artifact);
      await this.persistVersion(artifactId, version);
    } catch (err) {
      console.warn('Failed to persist version:', err);
    }

    publish("artifact.version.created", { artifactId, versionId: version.id });
    recordAudit({
      action: "artifact.version.created",
      status: "completed",
      metadata: { artifactId, versionId: version.id, branchName: version.branchName },
    });

    return version;
  }

  async branchArtifact(artifactId, params) {
    const artifact = await this.getArtifact(artifactId);
    if (!artifact) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    const branchName = params.branchName || `branch-${Date.now()}`;
    const baseVersionId = params.baseVersionId || artifact.id;

    const branchArtifact = {
      id: crypto.randomUUID(),
      projectId: artifact.projectId,
      type: artifact.type,
      title: params.title || `${artifact.title} (${branchName})`,
      description: params.description || artifact.description,
      content: params.content || artifact.content,
      metadata: params.metadata || artifact.metadata,
      status: ARTIFACT_STATUS.DRAFT,
      version: 1,
      parentVersionId: baseVersionId,
      branchName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: params.createdBy,
      tags: [...(artifact.tags || []), `branched-from-${artifact.id}`],
    };

    this.artifacts.set(branchArtifact.id, branchArtifact);
    this.initializeVersionGraph(branchArtifact.id);

    try {
      await this.persistArtifact(branchArtifact);
      await this.persistVersion(branchArtifact.id, {
        ...branchArtifact,
        id: crypto.randomUUID(),
        artifactId: branchArtifact.id,
        versionNumber: 1,
        parentVersionId: baseVersionId,
        branchName,
        createdAt: branchArtifact.createdAt,
        createdBy: params.createdBy,
        changes: [],
      });
    } catch (err) {
      console.warn('Failed to persist branched artifact:', err);
    }

    publish("artifact.branched", { originalId: artifactId, branchId: branchArtifact.id, branchName });
    recordAudit({
      action: "artifact.branched",
      status: "completed",
      metadata: { originalId: artifactId, branchId: branchArtifact.id, branchName },
    });

    return branchArtifact;
  }

  async mergeVersions(artifactId, params) {
    const artifact = await this.getArtifact(artifactId);
    if (!artifact) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    const sourceVersion = await this.getVersion(artifactId, params.sourceVersionId);
    const targetVersion = await this.getVersion(artifactId, params.targetVersionId);

    if (!sourceVersion || !targetVersion) {
      throw new Error("Source or target version not found");
    }

    const mergedContent = this.mergeContent(
      targetVersion.content,
      sourceVersion.content,
      params.strategy || "manual",
      params.conflictResolution || {}
    );

    const merged = await this.createVersion(artifactId, {
      content: mergedContent,
      branchName: artifact.branchName,
      status: ARTIFACT_STATUS.MODIFIED,
      message: `Merged ${params.sourceVersionId} into ${params.targetVersionId}`,
      createdBy: params.createdBy,
      metadata: { mergedFrom: params.sourceVersionId },
    });

    publish("artifact.merged", { artifactId, sourceVersionId: params.sourceVersionId, targetVersionId: params.targetVersionId });
    recordAudit({
      action: "artifact.merged",
      status: "completed",
      metadata: { artifactId, sourceVersionId: params.sourceVersionId, targetVersionId: params.targetVersionId },
    });

    return merged;
  }

  async cherryPickChange(artifactId, params) {
    const artifact = await this.getArtifact(artifactId);
    if (!artifact) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    const sourceVersion = await this.getVersion(artifactId, params.sourceVersionId);
    if (!sourceVersion) {
      throw new Error(`Source version not found: ${params.sourceVersionId}`);
    }

    const change = params.change;
    const newContent = this.applyChange(artifact.content, change);

    const newVersion = await this.createVersion(artifactId, {
      content: newContent,
      branchName: artifact.branchName,
      status: ARTIFACT_STATUS.MODIFIED,
      message: `Cherry-picked ${change.description} from ${params.sourceVersionId}`,
      createdBy: params.createdBy,
      metadata: { cherryPickedFrom: params.sourceVersionId, change },
    });

    publish("artifact.cherry_picked", { artifactId, sourceVersionId: params.sourceVersionId, change });
    recordAudit({
      action: "artifact.cherry_picked",
      status: "completed",
      metadata: { artifactId, sourceVersionId: params.sourceVersionId, change },
    });

    return newVersion;
  }

  async getVersion(artifactId, versionId) {
    try {
      const { data } = await supabaseClient
        .from('hey_artifact_versions')
        .select('*')
        .eq('artifact_id', artifactId)
        .eq('id', versionId)
        .single();

      if (data) {
        return this.deserializeVersion(data);
      }
    } catch (err) {
      console.warn('Failed to load version:', err);
    }
    return null;
  }

  async getVersionHistory(artifactId, limit = 50) {
    try {
      const { data } = await supabaseClient
        .from('hey_artifact_versions')
        .select('*')
        .eq('artifact_id', artifactId)
        .order('created_at', { ascending: false })
        .limit(limit);

      return (data || []).map(d => this.deserializeVersion(d));
    } catch (err) {
      console.warn('Failed to load version history:', err);
      return [];
    }
  }

  async getBranches(artifactId) {
    try {
      const { data } = await supabaseClient
        .from('hey_artifact_versions')
        .select('branch_name')
        .eq('artifact_id', artifactId);

      const branches = [...new Set((data || []).map(d => d.branch_name))];
      return branches;
    } catch (err) {
      console.warn('Failed to load branches:', err);
      return ["main"];
    }
  }

  async compareVersions(artifactId, versionIdA, versionIdB) {
    const versionA = await this.getVersion(artifactId, versionIdA);
    const versionB = await this.getVersion(artifactId, versionIdB);

    if (!versionA || !versionB) {
      throw new Error("One or both versions not found");
    }

    return this.computeDiff(versionA.content, versionB.content);
  }

  async restoreVersion(artifactId, versionId) {
    const artifact = await this.getArtifact(artifactId);
    const version = await this.getVersion(artifactId, versionId);

    if (!artifact || !version) {
      throw new Error("Artifact or version not found");
    }

    const restored = await this.updateArtifact(artifactId, {
      content: version.content,
      metadata: version.metadata,
      status: ARTIFACT_STATUS.MODIFIED,
      branchName: version.branchName,
    });

    publish("artifact.restored", { artifactId, versionId });
    recordAudit({
      action: "artifact.restored",
      status: "completed",
      metadata: { artifactId, versionId },
    });

    return restored;
  }

  async markApproved(artifactId) {
    return this.updateArtifact(artifactId, { status: ARTIFACT_STATUS.APPROVED });
  }

  async markFinal(artifactId) {
    return this.updateArtifact(artifactId, { status: ARTIFACT_STATUS.FINAL });
  }

  async archiveArtifact(artifactId) {
    return this.updateArtifact(artifactId, { status: ARTIFACT_STATUS.ARCHIVED });
  }

  async deleteArtifact(artifactId) {
    this.artifacts.delete(artifactId);
    this.versionGraphs.delete(artifactId);

    try {
      await supabaseClient
        .from('hey_artifacts')
        .delete()
        .eq('id', artifactId);
    } catch (err) {
      console.warn('Failed to delete artifact:', err);
    }

    publish("artifact.deleted", { artifactId });
    recordAudit({
      action: "artifact.deleted",
      status: "completed",
      metadata: { artifactId },
    });
  }

  async listArtifacts(projectId, type = null) {
    try {
      let query = supabaseClient
        .from('hey_artifacts')
        .select('*')
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false });

      if (type) {
        query = query.eq('type', type);
      }

      const { data } = await query;
      return (data || []).map(d => this.deserializeArtifact(d));
    } catch (err) {
      console.warn('Failed to list artifacts:', err);
      return Array.from(this.artifacts.values()).filter(a => 
        a.projectId === projectId && (!type || a.type === type)
      );
    }
  }

  initializeVersionGraph(artifactId) {
    this.versionGraphs.set(artifactId, {
      nodes: new Map(),
      edges: [],
    });
  }

  addVersionToGraph(artifactId, current, previous) {
    const graph = this.versionGraphs.get(artifactId) || { nodes: new Map(), edges: [] };
    
    const nodeId = `${artifactId}:v${current.version}`;
    graph.nodes.set(nodeId, {
      id: nodeId,
      version: current.version,
      branchName: current.branchName,
      status: current.status,
      createdAt: current.updatedAt,
      contentHash: this.hashContent(current.content),
    });

    if (previous && previous.content) {
      const prevNodeId = `${artifactId}:v${current.version - 1}`;
      graph.edges.push({
        from: prevNodeId,
        to: nodeId,
        type: "parent",
      });
    }

    this.versionGraphs.set(artifactId, graph);
  }

  getVersionGraph(artifactId) {
    const graph = this.versionGraphs.get(artifactId);
    if (!graph) return { nodes: [], edges: [] };

    return {
      nodes: Array.from(graph.nodes.values()),
      edges: graph.edges,
    };
  }

  computeChanges(oldContent, newContent) {
    const changes = [];
    const oldKeys = new Set(Object.keys(oldContent || {}));
    const newKeys = new Set(Object.keys(newContent || {}));

    for (const key of newKeys) {
      if (!oldKeys.has(key)) {
        changes.push({ type: "added", property: key, value: newContent[key] });
      } else if (JSON.stringify(oldContent[key]) !== JSON.stringify(newContent[key])) {
        changes.push({ 
          type: "modified", 
          property: key, 
          oldValue: oldContent[key], 
          newValue: newContent[key] 
        });
      }
    }

    for (const key of oldKeys) {
      if (!newKeys.has(key)) {
        changes.push({ type: "removed", property: key, oldValue: oldContent[key] });
      }
    }

    return changes;
  }

  computeDiff(contentA, contentB) {
    const changes = this.computeChanges(contentA, contentB);
    return {
      added: changes.filter(c => c.type === "added"),
      modified: changes.filter(c => c.type === "modified"),
      removed: changes.filter(c => c.type === "removed"),
      summary: {
        total: changes.length,
        added: changes.filter(c => c.type === "added").length,
        modified: changes.filter(c => c.type === "modified").length,
        removed: changes.filter(c => c.type === "removed").length,
      },
    };
  }

  mergeContent(target, source, strategy, conflictResolution) {
    if (strategy === "source") return source;
    if (strategy === "target") return target;

    const merged = { ...target };
    
    for (const [key, value] of Object.entries(source)) {
      if (merged[key] === undefined) {
        merged[key] = value;
      } else if (JSON.stringify(merged[key]) !== JSON.stringify(value)) {
        const resolution = conflictResolution[key];
        if (resolution === "source") {
          merged[key] = value;
        } else if (resolution === "target") {
          // keep target
        } else if (typeof resolution === "function") {
          merged[key] = resolution(merged[key], value);
        } else {
          // Default: keep target, log conflict
          console.warn(`Conflict in ${key}: keeping target value`);
        }
      }
    }

    return merged;
  }

  applyChange(content, change) {
    const newContent = { ...content };
    
    if (change.type === "added") {
      newContent[change.property] = change.value;
    } else if (change.type === "modified") {
      newContent[change.property] = change.newValue;
    } else if (change.type === "removed") {
      delete newContent[change.property];
    }

    return newContent;
  }

  hashContent(content) {
    const str = JSON.stringify(content);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  deserializeArtifact(data) {
    return {
      id: data.id,
      projectId: data.project_id,
      type: data.type,
      title: data.title,
      description: data.description,
      content: data.content,
      metadata: data.metadata,
      status: data.status,
      version: data.version,
      parentVersionId: data.parent_version_id,
      branchName: data.branch_name,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      createdBy: data.created_by,
      tags: data.tags,
    };
  }

  deserializeVersion(data) {
    return {
      id: data.id,
      artifactId: data.artifact_id,
      versionNumber: data.version_number,
      branchName: data.branch_name,
      parentVersionId: data.parent_version_id,
      content: data.content,
      metadata: data.metadata,
      status: data.status,
      message: data.message,
      createdAt: data.created_at,
      createdBy: data.created_by,
      changes: data.changes,
    };
  }

  async persistArtifact(artifact) {
    await supabaseClient
      .from('hey_artifacts')
      .upsert({
        id: artifact.id,
        project_id: artifact.projectId,
        type: artifact.type,
        title: artifact.title,
        description: artifact.description,
        content: artifact.content,
        metadata: artifact.metadata,
        status: artifact.status,
        version: artifact.version,
        parent_version_id: artifact.parentVersionId,
        branch_name: artifact.branchName,
        created_at: artifact.createdAt,
        updated_at: artifact.updatedAt,
        created_by: artifact.createdBy,
        tags: artifact.tags,
      }, {
        onConflict: 'id',
      });
  }

  async persistVersion(artifactId, version, previous = null) {
    await supabaseClient
      .from('hey_artifact_versions')
      .upsert({
        id: version.id || crypto.randomUUID(),
        artifact_id: artifactId,
        version_number: version.versionNumber || version.version,
        branch_name: version.branchName,
        parent_version_id: version.parentVersionId,
        content: version.content,
        metadata: version.metadata || {},
        status: version.status,
        message: version.message,
        created_at: version.createdAt,
        created_by: version.createdBy,
        changes: version.changes || this.computeChanges(previous?.content || {}, version.content),
      }, {
        onConflict: 'id',
      });
  }
}

export const artifactEngine = new ArtifactEngine();

export async function createArtifact(params) {
  return artifactEngine.createArtifact(params);
}

export async function getArtifact(artifactId) {
  return artifactEngine.getArtifact(artifactId);
}

export async function updateArtifact(artifactId, updates) {
  return artifactEngine.updateArtifact(artifactId, updates);
}

export async function createVersion(artifactId, params) {
  return artifactEngine.createVersion(artifactId, params);
}

export async function branchArtifact(artifactId, params) {
  return artifactEngine.branchArtifact(artifactId, params);
}

export async function mergeVersions(artifactId, params) {
  return artifactEngine.mergeVersions(artifactId, params);
}

export async function cherryPickChange(artifactId, params) {
  return artifactEngine.cherryPickChange(artifactId, params);
}

export async function getVersion(artifactId, versionId) {
  return artifactEngine.getVersion(artifactId, versionId);
}

export async function getVersionHistory(artifactId, limit) {
  return artifactEngine.getVersionHistory(artifactId, limit);
}

export async function getBranches(artifactId) {
  return artifactEngine.getBranches(artifactId);
}

export async function compareVersions(artifactId, versionIdA, versionIdB) {
  return artifactEngine.compareVersions(artifactId, versionIdA, versionIdB);
}

export async function restoreVersion(artifactId, versionId) {
  return artifactEngine.restoreVersion(artifactId, versionId);
}

export async function markApproved(artifactId) {
  return artifactEngine.markApproved(artifactId);
}

export async function markFinal(artifactId) {
  return artifactEngine.markFinal(artifactId);
}

export async function archiveArtifact(artifactId) {
  return artifactEngine.archiveArtifact(artifactId);
}

export async function deleteArtifact(artifactId) {
  return artifactEngine.deleteArtifact(artifactId);
}

export async function listArtifacts(projectId, type) {
  return artifactEngine.listArtifacts(projectId, type);
}

export function getVersionGraph(artifactId) {
  return artifactEngine.getVersionGraph(artifactId);
}

export { ARTIFACT_TYPES, ARTIFACT_STATUS };

export default {
  createArtifact,
  getArtifact,
  updateArtifact,
  createVersion,
  branchArtifact,
  mergeVersions,
  cherryPickChange,
  getVersion,
  getVersionHistory,
  getBranches,
  compareVersions,
  restoreVersion,
  markApproved,
  markFinal,
  archiveArtifact,
  deleteArtifact,
  listArtifacts,
  getVersionGraph,
  ARTIFACT_TYPES,
  ARTIFACT_STATUS,
};