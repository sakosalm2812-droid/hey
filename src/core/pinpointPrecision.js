import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";
import { safeStorage } from "../lib/safeStorage.js";

const LOCK_TYPES = Object.freeze({
  CONTENT: "content",
  LAYOUT: "layout",
  STYLE: "style",
  CHARACTER: "character",
  OBJECT: "object",
  TYPOGRAPHY: "typography",
  PALETTE: "palette",
  CAMERA: "camera",
  LIGHTING: "lighting",
  TIMING: "timing",
  AUDIO: "audio",
  VOICE: "voice",
  STRUCTURE: "structure",
  CODE_API: "code_api",
  DATA_SCHEMA: "data_schema",
  FILE_STRUCTURE: "file_structure",
  NAMING: "naming",
  SOURCE: "source",
  REFERENCE: "reference",
  PROJECT_DNA: "project_dna",
});

const INVARIANT_CLASSES = Object.freeze({
  EXACT: "exact",
  SEMANTIC: "semantic",
  PERCEPTUAL: "perceptual",
});

const CHANGE_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  APPLIED: "applied",
  REPAIRING: "repairing",
  FAILED: "failed",
});

const REPAIR_ACTIONS = Object.freeze({
  REGENERATE: "regenerate",
  ADJUST: "adjust",
  RESTORE: "restore",
  MANUAL: "manual",
});

function generateContractId() {
  return `contract_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateLockId() {
  return `lock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateInspectionId() {
  return `inspect_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateVersionId() {
  return `ver_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateBranchId() {
  return `branch_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class PinpointPrecisionEngine {
  constructor() {
    this.contracts = new Map();
    this.locks = new Map();
    this.lockPresets = new Map();
    this.inspections = new Map();
    this.versions = new Map();
    this.branches = new Map();
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = safeStorage.getItem("hey_pinpoint_precision");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.contracts) Object.entries(parsed.contracts).forEach(([k, v]) => this.contracts.set(k, v));
        if (parsed.locks) Object.entries(parsed.locks).forEach(([k, v]) => this.locks.set(k, v));
        if (parsed.lockPresets) Object.entries(parsed.lockPresets).forEach(([k, v]) => this.lockPresets.set(k, v));
        if (parsed.inspections) Object.entries(parsed.inspections).forEach(([k, v]) => this.inspections.set(k, v));
        if (parsed.versions) Object.entries(parsed.versions).forEach(([k, v]) => this.versions.set(k, v));
        if (parsed.branches) Object.entries(parsed.branches).forEach(([k, v]) => this.branches.set(k, v));
      }
    } catch (err) {
      console.warn("Failed to load Pinpoint Precision:", err);
    }
  }

  save() {
    try {
      safeStorage.setItem("hey_pinpoint_precision", JSON.stringify({
        contracts: Object.fromEntries(this.contracts),
        locks: Object.fromEntries(this.locks),
        lockPresets: Object.fromEntries(this.lockPresets),
        inspections: Object.fromEntries(this.inspections),
        versions: Object.fromEntries(this.versions),
        branches: Object.fromEntries(this.branches),
      }));
    } catch (err) {
      console.warn("Failed to save Pinpoint Precision:", err);
    }
  }

  createContract(input) {
    const {
      targetId,
      targetType,
      requestedDelta,
      protectedState = [],
      allowedDependentChanges = [],
      locks = [],
      implicitInvariants = [],
      outputFormat = null,
      restorePoint = null,
      invariantClass = INVARIANT_CLASSES.EXACT,
      budget = { maxRepairs: 2, costCap: null },
    } = input;

    const contract = {
      id: generateContractId(),
      targetId,
      targetType,
      requestedDelta,
      protectedState,
      allowedDependentChanges,
      locks,
      implicitInvariants,
      outputFormat,
      restorePoint,
      invariantClass,
      budget,
      status: CHANGE_STATUS.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      verificationResults: [],
      repairAttempts: 0,
    };

    this.contracts.set(contract.id, contract);
    this.save();
    this.notify("contract_created", contract);
    
    publish("pinpoint.contract_created", contract);
    recordAudit({ action: "pinpoint.contract_created", status: "completed", metadata: { contractId: contract.id, targetId, targetType } });
    
    return contract;
  }

  getContract(id) {
    return this.contracts.get(id) || null;
  }

  updateContract(id, updates) {
    const contract = this.contracts.get(id);
    if (!contract) return null;

    const updated = { ...contract, ...updates, updatedAt: new Date().toISOString() };
    this.contracts.set(id, updated);
    this.save();
    this.notify("contract_updated", updated);
    return updated;
  }

  applyLock(input) {
    const { targetId, targetType, lockType, scope, metadata = {}, createdBy = "user" } = input;

    if (!Object.values(LOCK_TYPES).includes(lockType)) {
      return { success: false, error: "Invalid lock type" };
    }

    const lock = {
      id: generateLockId(),
      targetId,
      targetType,
      lockType,
      scope,
      metadata,
      createdBy,
      createdAt: new Date().toISOString(),
      active: true,
    };

    const key = `${targetId}:${lockType}`;
    this.locks.set(key, lock);
    this.save();
    this.notify("lock_applied", lock);
    
    publish("pinpoint.lock_applied", lock);
    recordAudit({ action: "pinpoint.lock_applied", status: "completed", metadata: lock });
    
    return lock;
  }

  removeLock(targetId, lockType) {
    const key = `${targetId}:${lockType}`;
    const lock = this.locks.get(key);
    if (!lock) return false;

    lock.active = false;
    lock.removedAt = new Date().toISOString();
    this.locks.set(key, lock);
    this.save();
    this.notify("lock_removed", lock);
    
    publish("pinpoint.lock_removed", lock);
    recordAudit({ action: "pinpoint.lock_removed", status: "completed", metadata: { targetId, lockType } });
    
    return true;
  }

  getLocks(targetId) {
    return Array.from(this.locks.values()).filter(l => l.targetId === targetId && l.active);
  }

  getAllLocks() {
    return Array.from(this.locks.values()).filter(l => l.active);
  }

  saveLockPreset(name, lockTypes, metadata = {}) {
    const preset = {
      id: `preset_${Date.now()}`,
      name,
      lockTypes,
      metadata,
      createdAt: new Date().toISOString(),
    };

    this.lockPresets.set(preset.id, preset);
    this.save();
    this.notify("preset_saved", preset);
    return preset;
  }

  getLockPreset(id) {
    return this.lockPresets.get(id) || null;
  }

  getAllLockPresets() {
    return Array.from(this.lockPresets.values());
  }

  copyLocks(fromTargetId, toTargetId, lockTypes = null) {
    const sourceLocks = this.getLocks(fromTargetId);
    const typesToCopy = lockTypes || sourceLocks.map(l => l.lockType);
    const copied = [];

    typesToCopy.forEach(lockType => {
      const sourceLock = sourceLocks.find(l => l.lockType === lockType);
      if (sourceLock) {
        const newLock = this.applyLock({
          targetId: toTargetId,
          targetType: sourceLock.targetType,
          lockType: sourceLock.lockType,
          scope: sourceLock.scope,
          metadata: { ...sourceLock.metadata, copiedFrom: fromTargetId },
          createdBy: "copy",
        });
        copied.push(newLock);
      }
    });

    this.notify("locks_copied", { from: fromTargetId, to: toTargetId, copied });
    return copied;
  }

  inspectChanges(input) {
    const { beforeId, afterId, targetType, contractId = null } = input;

    const before = this.versions.get(beforeId);
    const after = this.versions.get(afterId);

    if (!before || !after) {
      return { success: false, error: "Version not found" };
    }

    const inspection = {
      id: generateInspectionId(),
      contractId,
      beforeId,
      afterId,
      targetType,
      timestamp: new Date().toISOString(),
      changes: this.computeDiff(before, after, targetType),
      protectedStateViolations: [],
      verificationStatus: "pending",
    };

    inspection.protectedStateViolations = this.checkProtectedState(inspection.changes, contractId);
    inspection.verificationStatus = inspection.protectedStateViolations.length === 0 ? "passed" : "failed";

    this.inspections.set(inspection.id, inspection);
    this.save();
    this.notify("inspection_completed", inspection);
    
    publish("pinpoint.inspection_completed", inspection);
    recordAudit({ action: "pinpoint.inspection_completed", status: "completed", metadata: { inspectionId: inspection.id, status: inspection.verificationStatus, changeCount: inspection.changes.length } });
    
    return inspection;
  }

  computeDiff(before, after) {
    const changes = [];
    const allKeys = new Set([...Object.keys(before.content || {}), ...Object.keys(after.content || {})]);

    allKeys.forEach(key => {
      const beforeVal = before.content?.[key];
      const afterVal = after.content?.[key];

      if (beforeVal === undefined && afterVal !== undefined) {
        changes.push({ type: "added", key, value: afterVal });
      } else if (beforeVal !== undefined && afterVal === undefined) {
        changes.push({ type: "removed", key, value: beforeVal });
      } else if (beforeVal !== afterVal) {
        changes.push({ type: "modified", key, before: beforeVal, after: afterVal, diff: this.deepDiff(beforeVal, afterVal) });
      }
    });

    return changes;
  }

  deepDiff(a, b, path = "") {
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
      return a === b ? null : { before: a, after: b };
    }

    const diffs = {};
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);

    allKeys.forEach(key => {
      const newPath = path ? `${path}.${key}` : key;
      const subDiff = this.deepDiff(a[key], b[key], newPath);
      if (subDiff) diffs[key] = subDiff;
    });

    return Object.keys(diffs).length > 0 ? diffs : null;
  }

  checkProtectedState(changes, contractId) {
    if (!contractId) return [];

    const contract = this.contracts.get(contractId);
    if (!contract) return [];

    const violations = [];

    contract.protectedState.forEach(protectedItem => {
      const matchingChanges = changes.filter(c => {
        if (protectedItem.key) return c.key === protectedItem.key;
        if (protectedItem.path) return c.key.startsWith(protectedItem.path);
        return false;
      });

      matchingChanges.forEach(change => {
        violations.push({
          protectedItem,
          change,
          severity: protectedItem.severity || "high",
          message: `Protected state violated: ${protectedItem.key || protectedItem.path} was ${change.type}`,
        });
      });
    });

    return violations;
  }

  verifyChange(contractId, result) {
    const contract = this.contracts.get(contractId);
    if (!contract) return { success: false, error: "Contract not found" };

    const inspection = this.inspectChanges({
      beforeId: contract.restorePoint,
      afterId: result.versionId,
      targetType: contract.targetType,
      contractId,
    });

    const passed = inspection.verificationStatus === "passed";
    
    this.updateContract(contractId, {
      status: passed ? CHANGE_STATUS.APPROVED : CHANGE_STATUS.REJECTED,
      verificationResults: [...contract.verificationResults, { inspectionId: inspection.id, passed, timestamp: new Date().toISOString() }],
    });

    if (!passed && contract.repairAttempts < contract.budget.maxRepairs) {
      this.updateContract(contractId, { 
        status: CHANGE_STATUS.REPAIRING,
        repairAttempts: contract.repairAttempts + 1,
      });
      
      return { success: false, inspection, repairAttempted: true, repairAttempts: contract.repairAttempts + 1, maxRepairs: contract.budget.maxRepairs };
    }

    return { success: passed, inspection };
  }

  createVersion(input) {
    const { content, parentId = null, branchId = null, metadata = {} } = input;

    const version = {
      id: generateVersionId(),
      content,
      parentId,
      branchId,
      metadata: { ...metadata, createdAt: new Date().toISOString() },
      status: "draft",
    };

    this.versions.set(version.id, version);
    this.save();
    this.notify("version_created", version);
    return version;
  }

  getVersion(id) {
    return this.versions.get(id) || null;
  }

  createBranch(input) {
    const { name, baseVersionId, description = "" } = input;

    const baseVersion = this.versions.get(baseVersionId);
    if (!baseVersion) return { success: false, error: "Base version not found" };

    const branch = {
      id: generateBranchId(),
      name,
      description,
      baseVersionId,
      headVersionId: baseVersionId,
      versions: [baseVersionId],
      createdAt: new Date().toISOString(),
      status: "active",
      metadata: {},
    };

    this.branches.set(branch.id, branch);
    this.save();
    this.notify("branch_created", branch);
    return branch;
  }

  getBranch(id) {
    return this.branches.get(id) || null;
  }

  addVersionToBranch(branchId, versionId) {
    const branch = this.branches.get(branchId);
    if (!branch) return null;

    const version = this.versions.get(versionId);
    if (!version) return null;

    branch.versions.push(versionId);
    branch.headVersionId = versionId;
    branch.updatedAt = new Date().toISOString();

    this.branches.set(branchId, branch);
    this.save();
    this.notify("branch_updated", branch);
    return branch;
  }

  mergeBranches(sourceBranchId, targetBranchId, options = {}) {
    const source = this.branches.get(sourceBranchId);
    const target = this.branches.get(targetBranchId);

    if (!source || !target) return { success: false, error: "Branch not found" };

    const mergedVersion = this.createVersion({
      content: options.resolvedContent || target.content,
      parentId: target.headVersionId,
      branchId: target.id,
      metadata: { mergedFrom: sourceBranchId, mergeStrategy: options.strategy || "manual" },
    });

    target.versions.push(mergedVersion.id);
    target.headVersionId = mergedVersion.id;
    target.updatedAt = new Date().toISOString();

    this.branches.set(target.id, target);
    this.versions.set(mergedVersion.id, mergedVersion);
    this.save();
    this.notify("branches_merged", { source: sourceBranchId, target: targetBranchId, mergedVersion: mergedVersion.id });

    return { success: true, mergedVersion };
  }

  cherryPickChange(sourceBranchId, targetBranchId, versionId) {
    const source = this.branches.get(sourceBranchId);
    const target = this.branches.get(targetBranchId);

    if (!source || !target) return { success: false, error: "Branch not found" };

    const version = this.versions.get(versionId);
    if (!version || !source.versions.includes(versionId)) {
      return { success: false, error: "Version not in source branch" };
    }

    const cherryPicked = this.createVersion({
      content: version.content,
      parentId: target.headVersionId,
      branchId: target.id,
      metadata: { cherryPickedFrom: versionId, sourceBranch: sourceBranchId },
    });

    target.versions.push(cherryPicked.id);
    target.headVersionId = cherryPicked.id;
    target.updatedAt = new Date().toISOString();

    this.branches.set(target.id, target);
    this.versions.set(cherryPicked.id, cherryPicked);
    this.save();
    this.notify("change_cherry_picked", { source: sourceBranchId, target: targetBranchId, version: versionId, cherryPicked: cherryPicked.id });

    return { success: true, version: cherryPicked };
  }

  compareVersions(versionId1, versionId2) {
    const v1 = this.versions.get(versionId1);
    const v2 = this.versions.get(versionId2);

    if (!v1 || !v2) return { success: false, error: "Version not found" };

    return this.inspectChanges({ beforeId: versionId1, afterId: versionId2, targetType: v1.metadata?.targetType || "unknown" });
  }

  restoreVersion(versionId) {
    const version = this.versions.get(versionId);
    if (!version) return { success: false, error: "Version not found" };

    return { success: true, version };
  }

  markApproved(versionId) {
    const version = this.versions.get(versionId);
    if (!version) return null;

    version.status = "approved";
    version.approvedAt = new Date().toISOString();
    this.versions.set(versionId, version);
    this.save();
    this.notify("version_approved", version);
    return version;
  }

  markFinal(versionId) {
    const version = this.versions.get(versionId);
    if (!version) return null;

    version.status = "final";
    version.finalizedAt = new Date().toISOString();
    this.versions.set(versionId, version);
    this.save();
    this.notify("version_finalized", version);
    return version;
  }

  archiveVersion(versionId) {
    const version = this.versions.get(versionId);
    if (!version) return null;

    version.status = "archived";
    version.archivedAt = new Date().toISOString();
    this.versions.set(versionId, version);
    this.save();
    this.notify("version_archived", version);
    return version;
  }

  deleteVersion(versionId) {
    const version = this.versions.get(versionId);
    if (!version) return false;

    this.versions.delete(versionId);
    this.save();
    this.notify("version_deleted", { id: versionId });
    return true;
  }

  listVersions(branchId = null) {
    let versions = Array.from(this.versions.values());
    if (branchId) {
      const branch = this.branches.get(branchId);
      if (branch) versions = versions.filter(v => branch.versions.includes(v.id));
    }
    return versions.sort((a, b) => new Date(b.metadata.createdAt) - new Date(a.metadata.createdAt));
  }

  getVersionHistory(versionId) {
    const history = [];
    let current = this.versions.get(versionId);
    
    while (current && current.parentId) {
      history.push(current);
      current = this.versions.get(current.parentId);
    }
    
    if (current) history.push(current);
    
    return history.reverse();
  }

  getBranches() {
    return Array.from(this.branches.values());
  }

  getVersionGraph(branchId = null) {
    const versions = this.listVersions(branchId);
    const nodes = versions.map(v => ({ id: v.id, parentId: v.parentId, branchId: v.branchId, status: v.status, createdAt: v.metadata.createdAt }));
    const edges = versions.filter(v => v.parentId).map(v => ({ from: v.parentId, to: v.id }));
    return { nodes, edges };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Pinpoint listener error:", err); }
    });
  }
}

export const pinpointPrecisionEngine = new PinpointPrecisionEngine();

export function createPinpointContract(input) {
  return pinpointPrecisionEngine.createContract(input);
}

export function getPinpointContract(id) {
  return pinpointPrecisionEngine.getContract(id);
}

export function updatePinpointContract(id, updates) {
  return pinpointPrecisionEngine.updateContract(id, updates);
}

export function applyLock(input) {
  return pinpointPrecisionEngine.applyLock(input);
}

export function removeLock(targetId, lockType) {
  return pinpointPrecisionEngine.removeLock(targetId, lockType);
}

export function getLocks(targetId) {
  return pinpointPrecisionEngine.getLocks(targetId);
}

export function getAllLocks() {
  return pinpointPrecisionEngine.getAllLocks();
}

export function saveLockPreset(name, lockTypes, metadata) {
  return pinpointPrecisionEngine.saveLockPreset(name, lockTypes, metadata);
}

export function getLockPreset(id) {
  return pinpointPrecisionEngine.getLockPreset(id);
}

export function copyLocks(fromTargetId, toTargetId, lockTypes) {
  return pinpointPrecisionEngine.copyLocks(fromTargetId, toTargetId, lockTypes);
}

export function inspectChanges(input) {
  return pinpointPrecisionEngine.inspectChanges(input);
}

export function verifyPinpointChange(contractId, result) {
  return pinpointPrecisionEngine.verifyChange(contractId, result);
}

export function createVersion(input) {
  return pinpointPrecisionEngine.createVersion(input);
}

export function getVersion(id) {
  return pinpointPrecisionEngine.getVersion(id);
}

export function createBranch(input) {
  return pinpointPrecisionEngine.createBranch(input);
}

export function getBranch(id) {
  return pinpointPrecisionEngine.getBranch(id);
}

export function addVersionToBranch(branchId, versionId) {
  return pinpointPrecisionEngine.addVersionToBranch(branchId, versionId);
}

export function mergeVersions(sourceBranchId, targetBranchId, options) {
  return pinpointPrecisionEngine.mergeBranches(sourceBranchId, targetBranchId, options);
}

export function cherryPickChange(sourceBranchId, targetBranchId, versionId) {
  return pinpointPrecisionEngine.cherryPickChange(sourceBranchId, targetBranchId, versionId);
}

export function compareVersions(versionId1, versionId2) {
  return pinpointPrecisionEngine.compareVersions(versionId1, versionId2);
}

export function restoreVersion(versionId) {
  return pinpointPrecisionEngine.restoreVersion(versionId);
}

export function markApproved(versionId) {
  return pinpointPrecisionEngine.markApproved(versionId);
}

export function markFinal(versionId) {
  return pinpointPrecisionEngine.markFinal(versionId);
}

export function archiveVersion(versionId) {
  return pinpointPrecisionEngine.archiveVersion(versionId);
}

export function deleteVersion(versionId) {
  return pinpointPrecisionEngine.deleteVersion(versionId);
}

export function listVersions(branchId) {
  return pinpointPrecisionEngine.listVersions(branchId);
}

export function getVersionHistory(versionId) {
  return pinpointPrecisionEngine.getVersionHistory(versionId);
}

export function getBranches() {
  return pinpointPrecisionEngine.getBranches();
}

export function getVersionGraph(branchId) {
  return pinpointPrecisionEngine.getVersionGraph(branchId);
}

export function subscribeToPinpoint(listener) {
  return pinpointPrecisionEngine.subscribe(listener);
}

export { LOCK_TYPES, INVARIANT_CLASSES, CHANGE_STATUS, REPAIR_ACTIONS };

export default pinpointPrecisionEngine;
