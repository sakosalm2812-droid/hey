import { authorizeExecution } from "./permissionManager.js";
import { verifyAndConsumeMandate } from "./actionMandate.js";

const APPROVAL_MODES = Object.freeze({ ASK: "ask_every_time", SMART: "smart_approval", BOUNDED: "bounded_full_execution", CUSTOM: "custom_rules" });
const DECISIONS = Object.freeze({ ALLOW: "allow", DENY: "deny", APPROVAL: "require_approval", STEP_UP: "require_step_up", LIMIT: "limit" });

function normalizeScope(scope) {
  if (typeof scope !== "string" || !scope.trim() || scope.length > 512 || [...scope].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new TypeError("Permission scope must be a non-empty printable string up to 512 characters.");
  const normalized = scope.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/\/$/, "");
  if (normalized.split("/").some((part) => part === "." || part === "..")) throw new TypeError("Permission scope cannot contain traversal segments.");
  return normalized;
}

export class PermissionScopeRegistry {
  constructor() { this.scopes = new Map(); }
  register({ id, parent = null, resourceType, description = "" }) {
    id = normalizeScope(id);
    if (this.scopes.has(id)) throw new Error(`Scope already registered: ${id}`);
    if (parent !== null) {
      parent = normalizeScope(parent);
      if (!this.scopes.has(parent)) throw new Error(`Parent scope is not registered: ${parent}`);
      if (id === parent || id.startsWith(`${parent}/`) === false) throw new Error("A child scope must use its parent's canonical path prefix.");
    }
    if (typeof resourceType !== "string" || !resourceType.trim()) throw new TypeError("resourceType is required.");
    this.scopes.set(id, Object.freeze({ id, parent, resourceType: resourceType.trim(), description: String(description).slice(0, 500) }));
    return this.scopes.get(id);
  }
  get(id) { return this.scopes.get(normalizeScope(id)) || null; }
  isSubset(child, parent) {
    child = normalizeScope(child); parent = normalizeScope(parent);
    if (!this.scopes.has(child) || !this.scopes.has(parent)) return false;
    return child === parent || child.startsWith(`${parent}/`);
  }
  intersect(a, b) {
    a = normalizeScope(a); b = normalizeScope(b);
    if (this.isSubset(a, b)) return a;
    if (this.isSubset(b, a)) return b;
    return null;
  }
}

export function diffPermissions(previous = [], next = []) {
  const key = (item) => `${normalizeScope(item.permission)}\u0000${normalizeScope(item.scope || "account")}`;
  const oldMap = new Map(previous.map((item) => [key(item), item]));
  const newMap = new Map(next.map((item) => [key(item), item]));
  return Object.freeze({
    added: [...newMap].filter(([k]) => !oldMap.has(k)).map(([, value]) => value),
    removed: [...oldMap].filter(([k]) => !newMap.has(k)).map(([, value]) => value),
    changed: [...newMap].filter(([k, value]) => oldMap.has(k) && JSON.stringify(oldMap.get(k)) !== JSON.stringify(value)).map(([, value]) => value),
  });
}

export function evaluateApprovalPolicy(input, policy = {}, { verifySmartApproval, scopeRegistry } = {}) {
  if (!input || typeof input !== "object" || !input.actorId || !input.action || !input.resource) return { decision: DECISIONS.DENY, reason: "actor_action_resource_required" };
  const risk = ["low", "medium", "high", "critical"].includes(input.risk) ? input.risk : "critical";
  const mode = Object.values(APPROVAL_MODES).includes(policy.mode) ? policy.mode : APPROVAL_MODES.ASK;
  const allowed = Array.isArray(policy.allowedActions) && policy.allowedActions.includes(input.action);
  const resources = Array.isArray(policy.resources) && policy.resources.some((resource) => resource === input.resource || scopeRegistry?.isSubset(input.resource, resource) === true);
  if (input.offline && (risk === "high" || risk === "critical")) return { decision: DECISIONS.DENY, reason: "high_risk_offline_denied" };
  if (policy.revoked === true || policy.enabled === false || !allowed || !resources) return { decision: DECISIONS.DENY, reason: "policy_scope_denied" };
  if (risk === "critical" || (risk === "high" && input.authStrength !== "strong")) return { decision: DECISIONS.STEP_UP, reason: "authentication_strength_required" };
  if (mode === APPROVAL_MODES.ASK) return { decision: DECISIONS.APPROVAL, reason: "explicit_approval_required" };
  if (mode === APPROVAL_MODES.SMART) {
    const approved = (() => {
      try { return typeof verifySmartApproval === "function" && verifySmartApproval(input, policy) === true; }
      catch { return false; }
    })();
    if (!approved) return { decision: DECISIONS.APPROVAL, reason: "trusted_smart_approval_evaluator_required" };
  }
  if (mode === APPROVAL_MODES.CUSTOM && policy.rules?.[input.action] !== "allow") return { decision: DECISIONS.APPROVAL, reason: "custom_rule_did_not_allow" };
  if (mode === APPROVAL_MODES.BOUNDED && (!Number.isSafeInteger(policy.maxUses) || policy.maxUses < 1 || policy.maxUses > 100 || !Number.isFinite(policy.expiresAt) || policy.expiresAt <= (input.now ?? Date.now()))) return { decision: DECISIONS.DENY, reason: "bounded_authority_invalid" };
  return { decision: DECISIONS.ALLOW, reason: "policy_allowed", policyVersion: policy.version || null };
}

/** A deterministic decision preview; it never consumes mandates or executes an action. */
export async function simulateAuthorization({ input, policy, mandate, verifyMandate } = {}) {
  const preview = evaluateApprovalPolicy(input, policy);
  if (preview.decision !== DECISIONS.ALLOW) return { ...preview, simulated: true };
  if (!mandate) return { decision: DECISIONS.DENY, reason: "action_mandate_required", simulated: true };
  if (typeof verifyMandate !== "function") return { decision: DECISIONS.DENY, reason: "non_consuming_mandate_verifier_required", simulated: true };
  try {
    const result = await verifyMandate(mandate, input);
    return { decision: result?.valid === true ? DECISIONS.ALLOW : DECISIONS.DENY, reason: result?.reason || (result?.valid === true ? "mandate_valid_for_simulated_context" : "mandate_invalid"), simulated: true };
  } catch { return { decision: DECISIONS.DENY, reason: "mandate_verification_failed", simulated: true }; }
}

/** Execution boundary: canonical identity/permission gate, policy decision, then atomic mandate consumption. */
export async function authorizeWithTrustKernel({ authorization, input, policy, policyOptions, mandate, mandateContext, mandateOptions } = {}) {
  const identityDecision = authorizeExecution(authorization || {});
  if (!identityDecision.authorized) return { authorized: false, decision: DECISIONS.DENY, reason: identityDecision.reason || "canonical_authorization_denied", identityDecision };
  const policyDecision = evaluateApprovalPolicy(input, policy, policyOptions);
  if (policyDecision.decision !== DECISIONS.ALLOW) return { authorized: false, ...policyDecision, identityDecision };
  if (!mandate || !mandateContext || !mandateOptions?.store || !mandateOptions?.trustedKeys) return { authorized: false, decision: DECISIONS.DENY, reason: "signed_action_mandate_required", identityDecision, policyDecision };
  const mandateDecision = await verifyAndConsumeMandate(mandate, mandateContext, mandateOptions);
  if (!mandateDecision.authorized) return { authorized: false, decision: DECISIONS.DENY, reason: mandateDecision.reason, identityDecision, policyDecision, mandateDecision };
  return { authorized: true, decision: DECISIONS.ALLOW, reason: "identity_policy_and_mandate_verified", identityDecision, policyDecision, mandateDecision };
}

export class PolicyStoreContract {
  async getActive() { throw new Error("Implement strongly consistent active-policy lookup."); }
  async activate() { throw new Error("Implement atomic policy activation and version compare-and-swap."); }
  async rollback() { throw new Error("Implement audited rollback to a previously validated policy version."); }
  async incrementRevocationEpoch() { throw new Error("Implement monotonic durable revocation epoch propagation."); }
}

export const APPROVAL_POLICY_MODES = APPROVAL_MODES;
export const AUTHORIZATION_DECISIONS = DECISIONS;
