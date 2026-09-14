import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";

export const ERROR_CODES = {
  AUTH_REQUIRED: {
    code: "AUTH_REQUIRED",
    message: "You need to sign in to continue.",
    automaticBehavior: "No execution. Preserve draft state.",
    userActions: ["sign_in", "preserve_draft"],
    recoverable: true,
    severity: "medium",
    category: "auth",
  },
  ENTITLEMENT_UNVERIFIED: {
    code: "ENTITLEMENT_UNVERIFIED",
    message: "Unable to verify your plan eligibility. Some features may be limited.",
    automaticBehavior: "Pause paid feature admission. Allow free-tier features.",
    userActions: ["refresh", "reconnect", "contact_support"],
    recoverable: true,
    severity: "medium",
    category: "billing",
  },
  PERMISSION_DENIED: {
    code: "PERMISSION_DENIED",
    message: "You don't have permission for this action.",
    automaticBehavior: "No unchanged retry. Show exact grant details.",
    userActions: ["review_grant", "request_permission", "contact_admin"],
    recoverable: true,
    severity: "medium",
    category: "permission",
  },
  PERMISSION_EXPIRED: {
    code: "PERMISSION_EXPIRED",
    message: "Your permission for this action has expired.",
    automaticBehavior: "No unchanged retry. Prompt for re-authorization.",
    userActions: ["reauthorize", "review_grant"],
    recoverable: true,
    severity: "medium",
    category: "permission",
  },
  POLICY_EGRESS_DENIED: {
    code: "POLICY_EGRESS_DENIED",
    message: "This action would send data to a destination not allowed by your privacy policy.",
    automaticBehavior: "Exclude route. Show allowed alternatives.",
    userActions: ["use_local_route", "edit_policy", "review_destinations"],
    recoverable: true,
    severity: "high",
    category: "privacy",
  },
  TARGET_AMBIGUOUS: {
    code: "TARGET_AMBIGUOUS",
    message: "HEY couldn't identify exactly what you want to act on.",
    automaticBehavior: "Re-observe safely. Highlight alternatives.",
    userActions: ["select_target", "provide_context", "cancel"],
    recoverable: true,
    severity: "medium",
    category: "execution",
  },
  TARGET_STALE: {
    code: "TARGET_STALE",
    message: "The target has changed since HEY last observed it.",
    automaticBehavior: "Re-observe safely. Don't act on stale observation.",
    userActions: ["reacquire_target", "provide_context", "cancel"],
    recoverable: true,
    severity: "high",
    category: "execution",
  },
  CAPABILITY_UNSUPPORTED: {
    code: "CAPABILITY_UNSUPPORTED",
    message: "This capability isn't available on your current platform or configuration.",
    automaticBehavior: "No fake execution. Show strongest legitimate alternative.",
    userActions: ["use_alternative", "install_adapter", "change_platform"],
    recoverable: false,
    severity: "medium",
    category: "capability",
  },
  PROVIDER_RATE_LIMIT: {
    code: "PROVIDER_RATE_LIMIT",
    message: "The AI provider has rate-limited your request.",
    automaticBehavior: "Bounded backoff with Retry-After respect.",
    userActions: ["wait", "use_fallback", "upgrade_plan"],
    recoverable: true,
    severity: "medium",
    category: "provider",
  },
  PROVIDER_AUTH_EXPIRED: {
    code: "PROVIDER_AUTH_EXPIRED",
    message: "Your connection to this provider has expired.",
    automaticBehavior: "Stop affected calls. Prompt for reconnection.",
    userActions: ["reconnect_provider", "check_credentials"],
    recoverable: true,
    severity: "medium",
    category: "provider",
  },
  NETWORK_LOST: {
    code: "NETWORK_LOST",
    message: "No network connection available.",
    automaticBehavior: "Checkpoint state. Authorize local-only subset.",
    userActions: ["retry_online", "queue_for_later", "use_local_mode"],
    recoverable: true,
    severity: "high",
    category: "network",
  },
  TOOL_UNKNOWN_EFFECT: {
    code: "TOOL_UNKNOWN_EFFECT",
    message: "The action may have executed but HEY couldn't verify the result.",
    automaticBehavior: "Reconcile using external ID. Don't resend blindly.",
    userActions: ["inspect_state", "manual_verify", "retry_with_idempotency"],
    recoverable: true,
    severity: "high",
    category: "execution",
  },
  QA_LOCK_VIOLATION: {
    code: "QA_LOCK_VIOLATION",
    message: "The result changed something that was locked for protection.",
    automaticBehavior: "Reject candidate. Offer bounded repair.",
    userActions: ["inspect_changes", "adjust_scope", "keep_prior_version"],
    recoverable: true,
    severity: "high",
    category: "precision",
  },
  BUDGET_EXHAUSTED: {
    code: "BUDGET_EXHAUSTED",
    message: "No approved budget remains for paid operations.",
    automaticBehavior: "Stop additional paid dispatch. Preserve completed work.",
    userActions: ["increase_budget", "accept_partial", "review_costs"],
    recoverable: true,
    severity: "medium",
    category: "budget",
  },
  STORAGE_FULL: {
    code: "STORAGE_FULL",
    message: "Not enough storage space to complete this operation.",
    automaticBehavior: "Stop destructive admission. Don't auto-delete.",
    userActions: ["free_space", "choose_storage", "cancel"],
    recoverable: true,
    severity: "high",
    category: "storage",
  },
  SYNC_CONFLICT: {
    code: "SYNC_CONFLICT",
    message: "Concurrent changes detected that can't be automatically merged.",
    automaticBehavior: "Preserve both versions. Don't overwrite.",
    userActions: ["compare_merge", "select_canonical", "keep_both"],
    recoverable: true,
    severity: "medium",
    category: "sync",
  },
  DEPENDENCY_BROKEN: {
    code: "DEPENDENCY_BROKEN",
    message: "A required model, plugin, source, or service is unavailable.",
    automaticBehavior: "Block dependent steps. Show what's missing.",
    userActions: ["repair", "install", "reconnect", "use_alternative"],
    recoverable: true,
    severity: "high",
    category: "dependency",
  },
  CANCEL_UNCONFIRMED: {
    code: "CANCEL_UNCONFIRMED",
    message: "Remote cancellation sent but not yet acknowledged.",
    automaticBehavior: "Stop new work. Show active uncertainty.",
    userActions: ["check_status", "wait_for_ack", "force_local_cancel"],
    recoverable: true,
    severity: "high",
    category: "execution",
  },
  SAFETY_VALIDATION_MISSING: {
    code: "SAFETY_VALIDATION_MISSING",
    message: "This high-impact claim lacks required safety validation.",
    automaticBehavior: "No protective/diagnostic claim. Show informational path only.",
    userActions: ["use_informational_path", "contact_professional", "review_limits"],
    recoverable: false,
    severity: "critical",
    category: "safety",
  },
};

export const ERROR_SEVERITY = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export const ERROR_CATEGORIES = [
  "auth",
  "billing",
  "permission",
  "privacy",
  "execution",
  "capability",
  "provider",
  "network",
  "precision",
  "budget",
  "storage",
  "sync",
  "dependency",
  "safety",
];

class ErrorTaxonomy {
  constructor() {
    this.errorHistory = [];
    this.maxHistory = 100;
  }

  createError(code, details = {}) {
    const definition = ERROR_CODES[code];
    if (!definition) {
      return this.createError("CAPABILITY_UNSUPPORTED", { originalCode: code, ...details });
    }

    const error = {
      code,
      ...definition,
      timestamp: new Date().toISOString(),
      details,
      id: crypto.randomUUID(),
    };

    this.recordError(error);
    return error;
  }

  recordError(error) {
    this.errorHistory.unshift(error);
    if (this.errorHistory.length > this.maxHistory) {
      this.errorHistory.pop();
    }

    publish("error.recorded", error);

    recordAudit({
      action: "error.recorded",
      status: "completed",
      metadata: {
        code: error.code,
        severity: error.severity,
        category: error.category,
        recoverable: error.recoverable,
      },
    });
  }

  getError(code) {
    return ERROR_CODES[code] || null;
  }

  getAllErrors() {
    return { ...ERROR_CODES };
  }

  getErrorsByCategory(category) {
    return Object.entries(ERROR_CODES)
      .filter(([, def]) => def.category === category)
      .reduce((acc, [code, def]) => ({ ...acc, [code]: def }), {});
  }

  getErrorsBySeverity(minSeverity) {
    const minLevel = ERROR_SEVERITY[minSeverity] || 0;
    return Object.entries(ERROR_CODES)
      .filter(([, def]) => ERROR_SEVERITY[def.severity] >= minLevel)
      .reduce((acc, [code, def]) => ({ ...acc, [code]: def }), {});
  }

  getHistory(limit = 50) {
    return this.errorHistory.slice(0, limit);
  }

  clearHistory() {
    this.errorHistory = [];
  }

  getUserFriendlyMessage(code) {
    const def = ERROR_CODES[code];
    return def?.message || "An unknown error occurred.";
  }

  getUserActions(code) {
    const def = ERROR_CODES[code];
    return def?.userActions || ["retry", "contact_support"];
  }

  getAutomaticBehavior(code) {
    const def = ERROR_CODES[code];
    return def?.automaticBehavior || "No automatic behavior defined.";
  }

  isRecoverable(code) {
    const def = ERROR_CODES[code];
    return def?.recoverable ?? false;
  }

  getSeverityLevel(code) {
    const def = ERROR_CODES[code];
    return ERROR_SEVERITY[def?.severity] ?? 0;
  }

  matchesPattern(code, pattern) {
    if (typeof pattern === "string") {
      return code === pattern;
    }
    if (pattern instanceof RegExp) {
      return pattern.test(code);
    }
    if (Array.isArray(pattern)) {
      return pattern.some(p => this.matchesPattern(code, p));
    }
    return false;
  }
}

export const errorTaxonomy = new ErrorTaxonomy();

export function createError(code, details) {
  return errorTaxonomy.createError(code, details);
}

export function getError(code) {
  return errorTaxonomy.getError(code);
}

export function getAllErrorCodes() {
  return errorTaxonomy.getAllErrors();
}

export function getErrorHistory(limit) {
  return errorTaxonomy.getHistory(limit);
}

export function getErrorsByCategory(category) {
  return errorTaxonomy.getErrorsByCategory(category);
}

export function getErrorsBySeverity(severity) {
  return errorTaxonomy.getErrorsBySeverity(severity);
}

export function getUserFriendlyError(code) {
  return {
    code,
    message: errorTaxonomy.getUserFriendlyMessage(code),
    actions: errorTaxonomy.getUserActions(code),
    automaticBehavior: errorTaxonomy.getAutomaticBehavior(code),
    recoverable: errorTaxonomy.isRecoverable(code),
    severity: errorTaxonomy.getSeverityLevel(code),
  };
}

export function handleError(code, details = {}) {
  const error = createError(code, details);
  const userError = getUserFriendlyError(code);

  publish("error.handled", { error, userError });

  return { error, userError };
}

export default errorTaxonomy;