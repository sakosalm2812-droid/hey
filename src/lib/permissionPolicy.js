import { normalizePlan } from "./accountRecords.js";

const PERMISSION_PLAN_RULES = {
  free: {
    allowed: ["memory.read", "web.search", "voice.microphone", "proactive.suggestions"],
  },
  pro: {
    allowed: [
      "memory.read",
      "web.search",
      "voice.microphone",
      "proactive.suggestions",
      "device.control",
      "browser.open_url",
      "browser.navigate",
      "notifications.create",
    ],
  },
  elite: {
    allowed: [
      "memory.read",
      "web.search",
      "voice.microphone",
      "proactive.suggestions",
      "device.control",
      "browser.open_url",
      "browser.navigate",
      "notifications.create",
      "terminal.execute",
      "filesystem.read",
      "filesystem.write",
      "filesystem.create_directory",
      "filesystem.list",
      "filesystem.delete",
      "app.open",
      "window.control",
      "input.control",
      "screen.capture",
    ],
  },
};

export function getPermissionPolicy(plan) {
  const normalized = normalizePlan(plan);
  return {
    plan: normalized,
    allowed: [...(PERMISSION_PLAN_RULES[normalized]?.allowed || PERMISSION_PLAN_RULES.free.allowed)],
  };
}

export function isPermissionAllowed({ plan, permission, granted = false }) {
  if (!permission) return false;
  const policy = getPermissionPolicy(plan);
  const allowedByPlan = policy.allowed.includes(permission);
  return allowedByPlan && granted;
}

export function canGrantPermission({ plan, permission }) {
  return getPermissionPolicy(plan).allowed.includes(permission);
}
