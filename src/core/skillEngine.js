import { recordAudit } from "./auditLog.js";
import { runVerifiedWorkflow } from "./executionLoop.js";

const skills = new Map();

export function createSkill(input = {}) {
  if (!input.name || !input.purpose || !Array.isArray(input.steps) || !input.steps.length) {
    throw new TypeError("A skill needs a name, purpose, and at least one step.");
  }
  const skill = {
    id: input.id || crypto.randomUUID(),
    name: String(input.name).trim(),
    purpose: String(input.purpose).trim(),
    requiredTools: input.requiredTools || [],
    preconditions: input.preconditions || [],
    steps: input.steps,
    permissions: input.permissions || [],
    verification: input.verification || "Verify each step and the final outcome.",
    history: [],
    enabled: input.enabled !== false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  skills.set(skill.id, skill);
  recordAudit({ action: "skill.created", status: "completed", metadata: { skillId: skill.id, name: skill.name } });
  return skill;
}

export function listSkills() { return Array.from(skills.values()); }
export function getSkill(id) { return skills.get(id) || null; }
export function updateSkill(id, changes = {}) {
  const skill = getSkill(id);
  if (!skill) return null;
  Object.assign(skill, changes, { updatedAt: new Date() });
  return skill;
}

export async function runSkill(id, executor, options = {}) {
  const skill = getSkill(id);
  if (!skill || !skill.enabled) return { success: false, status: "unavailable", error: "Skill is not available." };
  const result = await runVerifiedWorkflow(skill.steps, executor, options);
  skill.history.push({ ...result, ranAt: new Date() });
  skill.updatedAt = new Date();
  recordAudit({ action: "skill.executed", status: result.success ? "completed" : "failed", metadata: { skillId: id, verified: result.success } });
  return { ...result, skill };
}

export function clearSkills() {
  skills.clear();
}

export default { createSkill, listSkills, getSkill, updateSkill, runSkill, clearSkills };