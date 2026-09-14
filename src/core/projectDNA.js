import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";
import { safeStorage } from "../lib/safeStorage.js";

const DNA_FIELDS = Object.freeze({
  PURPOSE: "purpose",
  GOALS: "goals",
  CANONICAL_SOURCES: "canonical_sources",
  ACCEPTED_TERMINOLOGY: "accepted_terminology",
  PROHIBITED_TERMINOLOGY: "prohibited_terminology",
  BRAND_GUIDELINES: "brand_guidelines",
  COLOR_PALETTE: "color_palette",
  TYPOGRAPHY: "typography",
  SPACING_GRID: "spacing_grid",
  ILLUSTRATION_STYLE: "illustration_style",
  PHOTOGRAPHIC_STYLE: "photographic_style",
  UI_DESIGN_TOKENS: "ui_design_tokens",
  CHARACTERS: "characters",
  OBJECTS: "objects",
  LAYOUT_TEMPLATES: "layout_templates",
  PAGE_DIMENSIONS: "page_dimensions",
  OUTPUT_FORMATS: "output_formats",
  VOICE_TONE: "voice_tone",
  CITATION_RULES: "citation_rules",
  NAMING_RULES: "naming_rules",
  APPROVED_EXAMPLES: "approved_examples",
  REJECTED_EXAMPLES: "rejected_examples",
  ACCEPTED_GENERATIONS: "accepted_generations",
  LOCKED_INVARIANTS: "locked_invariants",
  DECISION_HISTORY: "decision_history",
  DEPENDENCIES: "dependencies",
  PRIVACY_SCOPE: "privacy_scope",
});

const DRIFT_TYPES = Object.freeze({
  TYPOGRAPHY_DRIFT: "typography_drift",
  COLOR_DRIFT: "color_drift",
  SPACING_DRIFT: "spacing_drift",
  LAYOUT_DRIFT: "layout_drift",
  CHARACTER_DRIFT: "character_drift",
  TERMINOLOGY_DRIFT: "terminology_drift",
  MISSING_CONTENT: "missing_content",
  DUPLICATED_CONTENT: "duplicated_content",
  STYLE_DRIFT: "style_drift",
  VISUAL_ASSET_MISMATCH: "visual_asset_mismatch",
});

const RULE_PRECEDENCE = Object.freeze({
  USER_EDIT: 100,
  PROJECT_SPECIFIC: 80,
  TEMPLATE: 60,
  PERSONAL_DEFAULT: 40,
  SAFETY_PRIVACY: 120,
  EXISTING_LOCKS: 110,
});

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

function generateDNAId() {
  return `dna_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateRevisionId() {
  return `rev_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateDriftId() {
  return `drift_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class ProjectDNAEngine {
  constructor() {
    this.projects = new Map();
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = safeStorage.getItem("hey_project_dna");
      if (stored) {
        const parsed = JSON.parse(stored);
        Object.entries(parsed).forEach(([id, project]) => {
          this.projects.set(id, project);
        });
      }
    } catch (err) {
      console.warn("Failed to load Project DNA:", err);
    }
  }

  save() {
    try {
      safeStorage.setItem("hey_project_dna", JSON.stringify(Object.fromEntries(this.projects)));
    } catch (err) {
      console.warn("Failed to save Project DNA:", err);
    }
  }

  createProjectDNA(input) {
    const id = generateDNAId();
    const now = new Date().toISOString();
    
    const dna = {
      id,
      name: input.name || "Untitled Project",
      description: input.description || "",
      fields: {
        [DNA_FIELDS.PURPOSE]: input.purpose || "",
        [DNA_FIELDS.GOALS]: input.goals || [],
        [DNA_FIELDS.CANONICAL_SOURCES]: input.canonicalSources || [],
        [DNA_FIELDS.ACCEPTED_TERMINOLOGY]: input.acceptedTerminology || {},
        [DNA_FIELDS.PROHIBITED_TERMINOLOGY]: input.prohibitedTerminology || [],
        [DNA_FIELDS.BRAND_GUIDELINES]: input.brandGuidelines || {},
        [DNA_FIELDS.COLOR_PALETTE]: input.colorPalette || {},
        [DNA_FIELDS.TYPOGRAPHY]: input.typography || {},
        [DNA_FIELDS.SPACING_GRID]: input.spacingGrid || {},
        [DNA_FIELDS.ILLUSTRATION_STYLE]: input.illustrationStyle || {},
        [DNA_FIELDS.PHOTOGRAPHIC_STYLE]: input.photographicStyle || {},
        [DNA_FIELDS.UI_DESIGN_TOKENS]: input.uiDesignTokens || {},
        [DNA_FIELDS.CHARACTERS]: input.characters || {},
        [DNA_FIELDS.OBJECTS]: input.objects || {},
        [DNA_FIELDS.LAYOUT_TEMPLATES]: input.layoutTemplates || {},
        [DNA_FIELDS.PAGE_DIMENSIONS]: input.pageDimensions || {},
        [DNA_FIELDS.OUTPUT_FORMATS]: input.outputFormats || [],
        [DNA_FIELDS.VOICE_TONE]: input.voiceTone || {},
        [DNA_FIELDS.CITATION_RULES]: input.citationRules || {},
        [DNA_FIELDS.NAMING_RULES]: input.namingRules || {},
        [DNA_FIELDS.APPROVED_EXAMPLES]: input.approvedExamples || [],
        [DNA_FIELDS.REJECTED_EXAMPLES]: input.rejectedExamples || [],
        [DNA_FIELDS.ACCEPTED_GENERATIONS]: input.acceptedGenerations || [],
        [DNA_FIELDS.LOCKED_INVARIANTS]: input.lockedInvariants || {},
        [DNA_FIELDS.DECISION_HISTORY]: [],
        [DNA_FIELDS.DEPENDENCIES]: input.dependencies || [],
        [DNA_FIELDS.PRIVACY_SCOPE]: input.privacyScope || "project",
      },
      revisions: [{
        id: generateRevisionId(),
        fields: { ...input.fields },
        createdAt: now,
        createdBy: input.createdBy || "user",
        description: "Initial version",
      }],
      currentRevision: 0,
      members: input.members || [],
      locks: {},
      createdAt: now,
      updatedAt: now,
      settings: {
        strictMode: input.strictMode || false,
        adaptiveConstraints: input.adaptiveConstraints || true,
        driftNotifications: input.driftNotifications !== false,
        autoSnapshot: input.autoSnapshot !== false,
      },
    };

    this.projects.set(id, dna);
    this.save();
    this.notify("created", dna);
    
    publish("project_dna.created", dna);
    recordAudit({ action: "project_dna.created", status: "completed", metadata: { projectId: id, name: dna.name } });
    
    return dna;
  }

  getProjectDNA(id) {
    return this.projects.get(id) || null;
  }

  getAllProjects() {
    return Array.from(this.projects.values());
  }

  getProjectByMember(userId) {
    return this.getAllProjects().filter(p => p.members.includes(userId));
  }

  updateProjectDNA(id, updates) {
    const project = this.projects.get(id);
    if (!project) return null;

    const allowedFields = Object.values(DNA_FIELDS);
    const fieldUpdates = {};
    
    Object.entries(updates).forEach(([key, value]) => {
      if (allowedFields.includes(key) && key !== DNA_FIELDS.DECISION_HISTORY && key !== DNA_FIELDS.LOCKED_INVARIANTS) {
        fieldUpdates[key] = value;
      }
    });

    const newFields = { ...project.fields, ...fieldUpdates };
    
    const revision = {
      id: generateRevisionId(),
      fields: newFields,
      createdAt: new Date().toISOString(),
      createdBy: updates.updatedBy || "user",
      description: updates.description || "Manual update",
    };

    const updated = {
      ...project,
      fields: newFields,
      revisions: [...project.revisions, revision],
      currentRevision: project.revisions.length,
      updatedAt: new Date().toISOString(),
    };

    this.projects.set(id, updated);
    this.save();
    this.notify("updated", updated);
    
    publish("project_dna.updated", { projectId: id, revision: revision.id, updates: Object.keys(fieldUpdates) });
    recordAudit({ action: "project_dna.updated", status: "completed", metadata: { projectId: id, revision: revision.id } });
    
    return updated;
  }

  deleteProjectDNA(id) {
    const project = this.projects.get(id);
    if (!project) return false;

    this.projects.delete(id);
    this.save();
    this.notify("deleted", { id });
    
    publish("project_dna.deleted", { projectId: id });
    recordAudit({ action: "project_dna.deleted", status: "completed", metadata: { projectId: id } });
    
    return true;
  }

  listProjectDNAs() {
    return this.getAllProjects().map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      memberCount: p.members.length,
      revisionCount: p.revisions.length,
    }));
  }

  addDecision(id, decision) {
    const project = this.projects.get(id);
    if (!project) return null;

    const decisionRecord = {
      id: `decision_${Date.now()}`,
      ...decision,
      timestamp: new Date().toISOString(),
      dnaRevision: project.currentRevision,
    };

    const history = [...project.fields[DNA_FIELDS.DECISION_HISTORY], decisionRecord];
    
    return this.updateProjectDNA(id, {
      [DNA_FIELDS.DECISION_HISTORY]: history,
      updatedBy: decision.madeBy || "user",
      description: `Decision: ${decision.title}`,
    });
  }

  getDecisionHistory(id) {
    const project = this.projects.get(id);
    return project?.fields[DNA_FIELDS.DECISION_HISTORY] || [];
  }

  checkConsistency(artifact, projectId) {
    const project = this.projects.get(projectId);
    if (!project) return { consistent: true, drifts: [] };

    const drifts = [];
    const fields = project.fields;

    if (artifact.typography && fields[DNA_FIELDS.TYPOGRAPHY]) {
      const drift = this.compareTypography(artifact.typography, fields[DNA_FIELDS.TYPOGRAPHY]);
      if (drift) drifts.push({ type: DRIFT_TYPES.TYPOGRAPHY_DRIFT, ...drift });
    }

    if (artifact.colors && fields[DNA_FIELDS.COLOR_PALETTE]) {
      const drift = this.compareColors(artifact.colors, fields[DNA_FIELDS.COLOR_PALETTE]);
      if (drift) drifts.push({ type: DRIFT_TYPES.COLOR_DRIFT, ...drift });
    }

    if (artifact.spacing && fields[DNA_FIELDS.SPACING_GRID]) {
      const drift = this.compareSpacing(artifact.spacing, fields[DNA_FIELDS.SPACING_GRID]);
      if (drift) drifts.push({ type: DRIFT_TYPES.SPACING_DRIFT, ...drift });
    }

    if (artifact.layout && fields[DNA_FIELDS.LAYOUT_TEMPLATES]) {
      const drift = this.compareLayout(artifact.layout, fields[DNA_FIELDS.LAYOUT_TEMPLATES]);
      if (drift) drifts.push({ type: DRIFT_TYPES.LAYOUT_DRIFT, ...drift });
    }

    if (artifact.characters && fields[DNA_FIELDS.CHARACTERS]) {
      const drift = this.compareCharacters(artifact.characters, fields[DNA_FIELDS.CHARACTERS]);
      if (drift) drifts.push({ type: DRIFT_TYPES.CHARACTER_DRIFT, ...drift });
    }

    if (artifact.terminology && fields[DNA_FIELDS.ACCEPTED_TERMINOLOGY]) {
      const drift = this.compareTerminology(artifact.terminology, fields[DNA_FIELDS.ACCEPTED_TERMINOLOGY]);
      if (drift) drifts.push({ type: DRIFT_TYPES.TERMINOLOGY_DRIFT, ...drift });
    }

    const hasDrifts = drifts.length > 0;
    
    if (hasDrifts) {
      const driftRecords = drifts.map(d => ({
        id: generateDriftId(),
        ...d,
        projectId,
        artifactId: artifact.id,
        detectedAt: new Date().toISOString(),
        resolved: false,
      }));
      
      publish("project_dna.drift_detected", { projectId, artifactId: artifact.id, drifts: driftRecords });
      recordAudit({ action: "project_dna.drift_detected", status: "completed", metadata: { projectId, artifactId: artifact.id, driftCount: drifts.length } });
    }

    return { consistent: !hasDrifts, drifts };
  }

  compareTypography(artifact, project) {
    const diffs = [];
    const props = ["fontFamily", "fontSize", "lineHeight", "letterSpacing", "fontWeight"];
    
    props.forEach(prop => {
      if (artifact[prop] && project[prop] && artifact[prop] !== project[prop]) {
        diffs.push({ property: prop, expected: project[prop], actual: artifact[prop] });
      }
    });
    
    return diffs.length > 0 ? { differences: diffs } : null;
  }

  compareColors(artifact, project) {
    const diffs = [];
    const roles = ["primary", "secondary", "accent", "background", "text", "border"];
    
    roles.forEach(role => {
      if (artifact[role] && project[role] && artifact[role] !== project[role]) {
        diffs.push({ role, expected: project[role], actual: artifact[role] });
      }
    });
    
    return diffs.length > 0 ? { differences: diffs } : null;
  }

  compareSpacing(artifact, project) {
    const diffs = [];
    const props = ["baseUnit", "scale", "margins", "padding", "gaps"];
    
    props.forEach(prop => {
      if (artifact[prop] && project[prop]) {
        const a = JSON.stringify(artifact[prop]);
        const p = JSON.stringify(project[prop]);
        if (a !== p) {
          diffs.push({ property: prop, expected: project[prop], actual: artifact[prop] });
        }
      }
    });
    
    return diffs.length > 0 ? { differences: diffs } : null;
  }

  compareLayout(artifact, project) {
    if (!artifact.templateId || !project[artifact.templateId]) return null;
    
    const template = project[artifact.templateId];
    const diffs = [];
    
    if (artifact.regions) {
      Object.entries(artifact.regions).forEach(([regionId, region]) => {
        if (template.regions[regionId]) {
          const t = template.regions[regionId];
          ["x", "y", "width", "height"].forEach(prop => {
            if (region[prop] !== undefined && t[prop] !== undefined && region[prop] !== t[prop]) {
              diffs.push({ region: regionId, property: prop, expected: t[prop], actual: region[prop] });
            }
          });
        }
      });
    }
    
    return diffs.length > 0 ? { differences: diffs } : null;
  }

  compareCharacters(artifact, project) {
    const diffs = [];
    
    Object.entries(artifact.characters || {}).forEach(([charId, char]) => {
      if (project[charId]) {
        const p = project[charId];
        ["name", "appearance", "traits", "voice"].forEach(prop => {
          if (char[prop] && p[prop] && JSON.stringify(char[prop]) !== JSON.stringify(p[prop])) {
            diffs.push({ character: charId, property: prop, expected: p[prop], actual: char[prop] });
          }
        });
      }
    });
    
    return diffs.length > 0 ? { differences: diffs } : null;
  }

  compareTerminology(artifact, project) {
    const diffs = [];
    
    Object.entries(artifact.terminology || {}).forEach(([term, value]) => {
      if (project[term] && project[term] !== value) {
        diffs.push({ term, expected: project[term], actual: value });
      }
    });
    
    Object.keys(project).forEach(term => {
      if (project[term] && !artifact.terminology?.[term] && project[term].required) {
        diffs.push({ term, expected: project[term], actual: "missing", severity: "high" });
      }
    });
    
    return diffs.length > 0 ? { differences: diffs } : null;
  }

  applyCorrections(artifact, projectId, corrections) {
    const project = this.projects.get(projectId);
    if (!project) return { success: false, error: "Project not found" };

    const corrected = { ...artifact };
    const applied = [];

    corrections.forEach(correction => {
      if (correction.type === DRIFT_TYPES.TYPOGRAPHY_DRIFT) {
        correction.differences.forEach(d => {
          if (corrected.typography) corrected.typography[d.property] = d.expected;
          applied.push({ type: DRIFT_TYPES.TYPOGRAPHY_DRIFT, property: d.property });
        });
      } else if (correction.type === DRIFT_TYPES.COLOR_DRIFT) {
        correction.differences.forEach(d => {
          if (corrected.colors) corrected.colors[d.role] = d.expected;
          applied.push({ type: DRIFT_TYPES.COLOR_DRIFT, role: d.role });
        });
      } else if (correction.type === DRIFT_TYPES.SPACING_DRIFT) {
        correction.differences.forEach(d => {
          if (corrected.spacing) corrected.spacing[d.property] = d.expected;
          applied.push({ type: DRIFT_TYPES.SPACING_DRIFT, property: d.property });
        });
      } else if (correction.type === DRIFT_TYPES.LAYOUT_DRIFT) {
        correction.differences.forEach(d => {
          if (corrected.layout?.regions?.[d.region]) {
            corrected.layout.regions[d.region][d.property] = d.expected;
            applied.push({ type: DRIFT_TYPES.LAYOUT_DRIFT, region: d.region, property: d.property });
          }
        });
      } else if (correction.type === DRIFT_TYPES.CHARACTER_DRIFT) {
        correction.differences.forEach(d => {
          if (corrected.characters?.[d.character]) {
            corrected.characters[d.character][d.property] = d.expected;
            applied.push({ type: DRIFT_TYPES.CHARACTER_DRIFT, character: d.character, property: d.property });
          }
        });
      } else if (correction.type === DRIFT_TYPES.TERMINOLOGY_DRIFT) {
        correction.differences.forEach(d => {
          if (corrected.terminology) corrected.terminology[d.term] = d.expected;
          applied.push({ type: DRIFT_TYPES.TERMINOLOGY_DRIFT, term: d.term });
        });
      }
    });

    return { success: true, corrected, applied };
  }

  exportProjectDNA(id) {
    const project = this.projects.get(id);
    if (!project) return null;

    return {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        fields: project.fields,
        revisions: project.revisions,
        settings: project.settings,
      },
    };
  }

  importProjectDNA(data, options = {}) {
    if (!data?.project) return { success: false, error: "Invalid import data" };

    const { project } = data;
    const id = options.preserveId ? project.id : generateDNAId();
    
    const imported = {
      id,
      name: project.name,
      description: project.description,
      fields: project.fields,
      revisions: project.revisions || [],
      currentRevision: project.currentRevision || 0,
      members: options.preserveMembers ? project.members : [],
      locks: {},
      createdAt: project.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: project.settings || {},
    };

    this.projects.set(id, imported);
    this.save();
    this.notify("imported", imported);
    
    publish("project_dna.imported", { projectId: id });
    recordAudit({ action: "project_dna.imported", status: "completed", metadata: { projectId: id } });
    
    return { success: true, project: imported };
  }

  setLock(id, lockType, lockData) {
    const project = this.projects.get(id);
    if (!project) return null;

    const locks = { ...project.locks, [lockType]: { ...project.locks[lockType], ...lockData } };
    
    return this.updateProjectDNA(id, { locks }, { description: `Lock updated: ${lockType}` });
  }

  getLocks(id) {
    const project = this.projects.get(id);
    return project?.locks || {};
  }

  removeLock(id, lockType) {
    const project = this.projects.get(id);
    if (!project) return null;

    const locks = { ...project.locks };
    delete locks[lockType];
    
    return this.updateProjectDNA(id, { locks }, { description: `Lock removed: ${lockType}` });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Project DNA listener error:", err); }
    });
  }
}

export const projectDNAEngine = new ProjectDNAEngine();

export function createProjectDNA(input) {
  return projectDNAEngine.createProjectDNA(input);
}

export function getProjectDNA(id) {
  return projectDNAEngine.getProjectDNA(id);
}

export function updateProjectDNA(id, updates) {
  return projectDNAEngine.updateProjectDNA(id, updates);
}

export function deleteProjectDNA(id) {
  return projectDNAEngine.deleteProjectDNA(id);
}

export function listProjectDNAs() {
  return projectDNAEngine.listProjectDNAs();
}

export function addDecision(id, decision) {
  return projectDNAEngine.addDecision(id, decision);
}

export function getDecisionHistory(id) {
  return projectDNAEngine.getDecisionHistory(id);
}

export function checkProjectConsistency(artifact, projectId) {
  return projectDNAEngine.checkConsistency(artifact, projectId);
}

export function applyCorrections(artifact, projectId, corrections) {
  return projectDNAEngine.applyCorrections(artifact, projectId, corrections);
}

export function exportProjectDNA(id) {
  return projectDNAEngine.exportProjectDNA(id);
}

export function importProjectDNA(data, options) {
  return projectDNAEngine.importProjectDNA(data, options);
}

export function setProjectLock(id, lockType, lockData) {
  return projectDNAEngine.setLock(id, lockType, lockData);
}

export function getProjectLocks(id) {
  return projectDNAEngine.getLocks(id);
}

export function removeProjectLock(id, lockType) {
  return projectDNAEngine.removeLock(id, lockType);
}

export function subscribeToProjectDNA(listener) {
  return projectDNAEngine.subscribe(listener);
}

export { DNA_FIELDS, DRIFT_TYPES, RULE_PRECEDENCE, LOCK_TYPES };

export default projectDNAEngine;
