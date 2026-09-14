export const PLAN_ORDER = ["free", "pro", "elite"];

export const PLAN_FEATURES = {
  free: ["chat", "core_memory", "basic_tasks"],
  pro: ["chat", "core_memory", "advanced_memory", "customization", "voice", "agents"],
  elite: ["chat", "core_memory", "advanced_memory", "customization", "voice", "agents", "forge", "cosmos", "desktop_control", "priority_support"],
};

export function normalizePlan(plan) {
  const normalized = String(plan ?? "free").trim().toLowerCase();
  if (normalized === "pro" || normalized === "premium") return "pro";
  if (normalized === "elite" || normalized === "vip" || normalized === "founder") return "elite";
  return "free";
}

export function getPlanFromEntitlements(entitlements = []) {
  const values = Array.isArray(entitlements) ? entitlements : [];
  const normalized = values.map((entry) => String(entry ?? "").trim().toLowerCase());
  if (normalized.includes("elite")) return "elite";
  if (normalized.includes("pro") || normalized.includes("premium")) return "pro";
  return "free";
}

export function resolveAccountPlan({ plan, entitlements = [] } = {}) {
  const explicitPlan = normalizePlan(plan);
  const entitlementPlan = getPlanFromEntitlements(entitlements);
  const ranking = {
    free: 0,
    pro: 1,
    elite: 2,
  };

  return ranking[explicitPlan] > ranking[entitlementPlan] ? explicitPlan : entitlementPlan;
}

export function getPlanFeatures(plan) {
  const resolvedPlan = normalizePlan(plan);
  return [...(PLAN_FEATURES[resolvedPlan] || PLAN_FEATURES.free)];
}

export function hasPlanFeature(plan, feature) {
  return getPlanFeatures(plan).includes(feature);
}
