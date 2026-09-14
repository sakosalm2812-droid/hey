import { recordAudit } from "./auditLog.js";
import { publish } from "./eventBus.js";
import { resolveAccountPlan } from "../lib/accountRecords.js";
import { canGrantPermission } from "../lib/permissionPolicy.js";

const permissions = new Map();
let permissionOwnerId = null;

export const PERMISSION_RISK = Object.freeze({
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
});

const SECURITY_RESTRICTIONS = new Set([
  "terminal.execute",
  "input.control",
  "filesystem.delete",
  "window.control",
]);

const VALID_DECISIONS = Object.freeze({
  ALLOWED: "allowed",
  DENIED: "denied",
  CONFIRMATION_REQUIRED: "confirmation_required",
});

function normalizeString(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value).trim();
}

function normalizeRiskLevel(value) {
  const risk = normalizeString(value, "low").toLowerCase();

  return Object.hasOwn(PERMISSION_RISK, risk)
    ? risk
    : "critical";
}

function normalizePermissions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeString(entry))
    .filter(Boolean);
}

function getUserId(user = {}) {
  return normalizeString(
    user.id || user.userId || user.accountId,
  );
}

function getUserRole(user = {}) {
  return normalizeString(
    user.role,
    "user",
  ).toLowerCase();
}

function hasAuthenticatedIdentity(user = {}) {
  return Boolean(getUserId(user));
}

function resolveSessionPlan(user = {}) {
  const entitlements = normalizePermissions(
    user.entitlements,
  );

  const plan = normalizeString(
    user.plan,
    "free",
  ).toLowerCase();

  return resolveAccountPlan({
    plan,
    entitlements,
  });
}

function hasExplicitPermission(
  user,
  permission,
) {
  const userPermissions = new Set(
    normalizePermissions(user?.permissions),
  );

  return (
    userPermissions.has(permission) ||
    userPermissions.has("*") ||
    userPermissions.has("all")
  );
}

function isHighRisk(riskLevel) {
  return (
    PERMISSION_RISK[riskLevel] >=
    PERMISSION_RISK.high
  );
}

function isCriticalRisk(riskLevel) {
  return (
    PERMISSION_RISK[riskLevel] >=
    PERMISSION_RISK.critical
  );
}

function evaluateSecurityRestriction({
  capability,
  permission,
  riskLevel,
}) {
  const capabilityKey = normalizeString(
    capability,
  );

  const permissionKey = normalizeString(
    permission,
  );

  const restricted =
    SECURITY_RESTRICTIONS.has(capabilityKey) ||
    SECURITY_RESTRICTIONS.has(permissionKey);

  if (!restricted) {
    return {
      blocked: false,
      reason: null,
    };
  }

  /*
   * These capabilities require their own
   * dedicated, safety-gated execution paths.
   *
   * Permission ownership alone must never
   * turn a sensitive primitive into an
   * unrestricted execution surface.
   */
  if (isCriticalRisk(riskLevel)) {
    return {
      blocked: true,
      reason:
        "Security restriction: critical-risk execution requires a dedicated verified execution path.",
    };
  }

  return {
    blocked: false,
    reason: null,
  };
}

function auditAuthorization({
  permission,
  capability,
  riskLevel,
  status,
  decision,
  reason,
  user,
  plan,
  ignoredClientOverrides,
}) {
  recordAudit({
    action: "authorization.decision",
    tool: permission,
    riskLevel,
    status,
    metadata: {
      capability,
      decision,
      reason,
      plan,
      userId: getUserId(user),
      role: getUserRole(user),
      ignoredClientOverrides,
    },
  });
}

export function getPermissionKey(
  permission,
  scope = "account",
) {
  return `${normalizeString(permission)}:${normalizeString(
    scope,
    "account",
  )}`;
}

export function grantPermission(
  permission,
  scope = "account",
  metadata = {},
) {
  const normalizedPermission =
    normalizeString(permission);

  if (!normalizedPermission) {
    throw new Error(
      "A permission is required.",
    );
  }

  const normalizedScope = normalizeString(
    scope,
    "account",
  );

  const key = getPermissionKey(
    normalizedPermission,
    normalizedScope,
  );

  const value = {
    permission: normalizedPermission,
    scope: normalizedScope,
    status: "granted",
    metadata,
    updatedAt: new Date(),
  };

  permissions.set(key, value);

  publish("permission.updated", value);

  recordAudit({
    action: "permission.granted",
    tool: normalizedPermission,
    status: "completed",
    metadata: {
      scope: normalizedScope,
    },
  });

  return value;
}

export function revokePermission(
  permission,
  scope = "account",
) {
  const normalizedPermission =
    normalizeString(permission);

  if (!normalizedPermission) {
    return false;
  }

  const normalizedScope = normalizeString(
    scope,
    "account",
  );

  const key = getPermissionKey(
    normalizedPermission,
    normalizedScope,
  );

  const value = {
    permission: normalizedPermission,
    scope: normalizedScope,
    status: "revoked",
    metadata: {},
    updatedAt: new Date(),
  };

  permissions.set(key, value);

  publish("permission.updated", value);

  recordAudit({
    action: "permission.revoked",
    tool: normalizedPermission,
    status: "completed",
    metadata: {
      scope: normalizedScope,
    },
  });

  return value;
}

export function hasPermission(
  permission,
  scope = "account",
  userId = null,
) {
  if (userId && permissionOwnerId !== normalizeString(userId)) {
    return false;
  }
  const key = getPermissionKey(
    permission,
    scope,
  );

  return (
    permissions.get(key)?.status ===
    "granted"
  );
}

export function listPermissions() {
  return Array.from(
    permissions.values(),
  );
}

export function clearPermissions() {
  permissions.clear();
  permissionOwnerId = null;
}

export function seedPermissions(records = [], userId = null) {
  clearPermissions();
  if (!Array.isArray(records)) return 0;
  permissionOwnerId = normalizeString(userId) || null;

  records.forEach((record) => {
    const permission = normalizeString(
      record.permission,
    );
    const scope = normalizeString(
      record.scope,
      "account",
    );
    if (!permission) return;

    const key = getPermissionKey(
      permission,
      scope,
    );

    permissions.set(key, {
      permission,
      scope,
      status: record.status === "granted" ? "granted" : "revoked",
      metadata: record.metadata || {},
      updatedAt:
        record.updatedAt instanceof Date
          ? record.updatedAt
          : new Date(
              record.updatedAt ||
                record.updated_at ||
                Date.now(),
            ),
    });
  });

  return permissions.size;
}

export function authorizeExecution(
  input = {},
) {
  const user = input.user || {};

  const capability = normalizeString(
    input.capability,
    "unknown",
  );

  const permission = normalizeString(
    input.permission,
    capability || "unknown",
  );

  const riskLevel = normalizeRiskLevel(
    input.riskLevel,
  );

  const confirmed =
    input.confirmed === true;

  const requiresExplicitConfirmation =
    input.requiresConfirmation === true ||
    isHighRisk(riskLevel);

  const clientPlan =
    input.clientPlan ?? null;

  const clientEntitlements =
    input.clientEntitlements ?? null;

  const hasClientOverrides =
    clientPlan !== null ||
    clientEntitlements !== null;

  const ignoredClientOverrides =
    hasClientOverrides;

  /*
   * Never authorize an action without a
   * server-authenticated identity.
   */
  if (!hasAuthenticatedIdentity(user)) {
    const reason =
      "Authenticated user identity is required before any HEY action can execute.";

    // A non-authenticated request must never execute. For an action that also
    // needs confirmation, retain that state so the interface can explain the
    // complete next step instead of presenting a misleading hard failure.
    const requiresConfirmation =
      requiresExplicitConfirmation &&
      !confirmed;

    const decision = {
      authorized: false,
      decision: requiresConfirmation
        ? VALID_DECISIONS.CONFIRMATION_REQUIRED
        : VALID_DECISIONS.DENIED,
      requiresConfirmation,
      plan: "free",
      reason,
      ignoredClientOverrides: false,
      capability,
      permission,
      riskLevel,
      role: getUserRole(user),
      userId: null,
      confirmed,
    };

    auditAuthorization({
      permission,
      capability,
      riskLevel,
      status: requiresConfirmation
        ? "awaiting_confirmation"
        : "denied",
      decision: decision.decision,
      reason,
      user,
      plan: "free",
      ignoredClientOverrides: false,
    });

    return decision;
  }

  const effectivePlan =
    resolveSessionPlan(user);

  const role = getUserRole(user);
  const userId = getUserId(user);

  const reasonParts = [];

  if (hasClientOverrides) {
    reasonParts.push(
      "client-supplied plan or entitlements are ignored because authenticated account state is authoritative",
    );
  }

  const planAllowed = canGrantPermission({
    plan: effectivePlan,
    permission,
  });

  const permissionGranted =
    hasExplicitPermission(
      user,
      permission,
    ) ||
    hasPermission(
      permission,
      "account",
      userId,
    );

  if (!planAllowed) {
    reasonParts.push(
      `plan ${effectivePlan} does not include ${permission}`,
    );
  }

  if (!permissionGranted) {
    reasonParts.push(
      `missing permission ${permission}`,
    );
  }

  /*
   * High-risk actions require an explicit
   * confirmation signal in addition to normal
   * entitlement and permission checks.
   */
  if (requiresExplicitConfirmation && !confirmed) {
    reasonParts.push(
      "execution requires explicit confirmation",
    );
  }

  if (requiresExplicitConfirmation && !confirmed) {
    const reason =
      `Risk and action policy require explicit user confirmation before ${permission}.`;

    const decision = {
      authorized: false,
      decision:
        VALID_DECISIONS.CONFIRMATION_REQUIRED,
      requiresConfirmation: true,
      plan: effectivePlan,
      reason,
      ignoredClientOverrides,
      capability,
      permission,
      riskLevel,
      role,
      userId,
      confirmed,
    };

    auditAuthorization({
      permission,
      capability,
      riskLevel,
      status: "awaiting_confirmation",
      decision: decision.decision,
      reason,
      user,
      plan: effectivePlan,
      ignoredClientOverrides,
    });

    return decision;
  }

  const securityCheck =
    evaluateSecurityRestriction({
      capability,
      permission,
      riskLevel,
    });

  if (securityCheck.blocked) {
    const reason = [
      securityCheck.reason,
      "The operation was rejected before execution.",
    ].join(" ");

    const decision = {
      authorized: false,
      decision: VALID_DECISIONS.DENIED,
      requiresConfirmation: false,
      plan: effectivePlan,
      reason,
      ignoredClientOverrides,
      capability,
      permission,
      riskLevel,
      role,
      userId,
      confirmed,
    };

    auditAuthorization({
      permission,
      capability,
      riskLevel,
      status: "denied",
      decision: decision.decision,
      reason,
      user,
      plan: effectivePlan,
      ignoredClientOverrides,
    });

    return decision;
  }

  if (!planAllowed || !permissionGranted) {
    const decision = {
      authorized: false,
      decision: VALID_DECISIONS.DENIED,
      requiresConfirmation: false,
      plan: effectivePlan,
      reason:
        reasonParts.join("; ") ||
        `Execution is not authorized for ${permission}.`,
      ignoredClientOverrides,
      capability,
      permission,
      riskLevel,
      role,
      userId,
      confirmed,
    };

    auditAuthorization({
      permission,
      capability,
      riskLevel,
      status: "denied",
      decision: decision.decision,
      reason: decision.reason,
      user,
      plan: effectivePlan,
      ignoredClientOverrides,
    });

    return decision;
  }

  const reason =
    `Execution allowed for ${permission} under the authenticated ${effectivePlan} plan and security policy.`;

  const decision = {
    authorized: true,
    decision: VALID_DECISIONS.ALLOWED,
    requiresConfirmation: false,
    plan: effectivePlan,
    reason,
    ignoredClientOverrides,
    capability,
    permission,
    riskLevel,
    role,
    userId,
    confirmed,
  };

  auditAuthorization({
    permission,
    capability,
    riskLevel,
    status: "completed",
    decision: decision.decision,
    reason,
    user,
    plan: effectivePlan,
    ignoredClientOverrides,
  });

  return decision;
}

export function requestPermission({
  permission,
  scope = "account",
  riskLevel = "medium",
  reason = "",
  confirmed = false,
}) {
  const normalizedPermission =
    normalizeString(permission);

  const normalizedScope =
    normalizeString(
      scope,
      "account",
    );

  const normalizedRisk =
    normalizeRiskLevel(
      riskLevel,
    );

  if (!normalizedPermission) {
    return {
      permission: "",
      scope: normalizedScope,
      riskLevel: normalizedRisk,
      reason,
      granted: false,
      requiresConfirmation: false,
      error: "A permission is required.",
    };
  }

  const granted = hasPermission(
    normalizedPermission,
    normalizedScope,
  );

  const requiresConfirmation =
    !confirmed &&
    (
      !granted ||
      isHighRisk(normalizedRisk)
    );

  const request = {
    permission: normalizedPermission,
    scope: normalizedScope,
    riskLevel: normalizedRisk,
    reason,
    granted:
      granted &&
      !requiresConfirmation,
    requiresConfirmation,
  };

  recordAudit({
    action: "permission.requested",
    tool: normalizedPermission,
    riskLevel: normalizedRisk,
    status: request.granted
      ? "approved"
      : "awaiting_confirmation",
    metadata: {
      scope: normalizedScope,
      reason,
    },
  });

  return request;
}

export async function executeWithPermission(
  {
    permission,
    scope = "account",
    riskLevel = "medium",
    reason = "",
    confirmed = false,
    user = null,
    capability = permission,
    clientPlan = null,
    clientEntitlements = null,
  },
  action,
) {
  if (typeof action !== "function") {
    return {
      success: false,
      requiresConfirmation: false,
      error:
        "A valid execution action is required.",
    };
  }

  /*
   * No legacy execution path.
   *
   * Every actual action must pass through
   * authenticated authorization.
   */
  const authorization =
    authorizeExecution({
      user,
      capability,
      permission,
      riskLevel,
      confirmed,
      clientPlan,
      clientEntitlements,
    });

  if (!authorization.authorized) {
    recordAudit({
      action: "permissioned_action",
      tool: permission,
      riskLevel,
      status:
        authorization.requiresConfirmation
          ? "awaiting_confirmation"
          : "denied",
      metadata: {
        scope,
        reason,
        decision:
          authorization.decision,
        plan: authorization.plan,
        userId: authorization.userId,
      },
    });

    return {
      success: false,
      requiresConfirmation:
        authorization.requiresConfirmation,
      authorization,
      request: {
        permission,
        scope,
        riskLevel,
        reason,
        granted: false,
        requiresConfirmation:
          authorization.requiresConfirmation,
      },
      error: authorization.reason,
    };
  }

  try {
    const result = await action();

    recordAudit({
      action: "permissioned_action",
      tool: permission,
      riskLevel,
      status: "completed",
      metadata: {
        scope,
        authorization:
          authorization.decision,
        plan: authorization.plan,
        userId: authorization.userId,
      },
    });

    return {
      success: true,
      result,
      authorization,
      request: {
        permission,
        scope,
        riskLevel,
        reason,
        granted: true,
        requiresConfirmation: false,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    recordAudit({
      action: "permissioned_action",
      tool: permission,
      riskLevel,
      status: "failed",
      metadata: {
        scope,
        error: message,
        plan: authorization.plan,
        userId: authorization.userId,
      },
    });

    return {
      success: false,
      error: message,
      authorization,
      request: {
        permission,
        scope,
        riskLevel,
        reason,
        granted: true,
        requiresConfirmation: false,
      },
    };
  }
}

export default {
  grantPermission,
  revokePermission,
  hasPermission,
  listPermissions,
  clearPermissions,
  seedPermissions,
  requestPermission,
  authorizeExecution,
  executeWithPermission,
  getPermissionKey,
};
