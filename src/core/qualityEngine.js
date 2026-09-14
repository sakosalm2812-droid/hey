import { recordAudit } from "./auditLog.js";

const INTERNAL_TERMS =
  /\b(response style|routing|agent result|internal mode|system prompt|system message|hidden prompt|chain of thought|internal reasoning)\b/i;

const FALLBACK_TERMS =
  /\b(temporarily unavailable|try again later|could not generate|failed to generate)\b/i;

const GENERIC_FILLER_TERMS =
  /\b(as an ai|i'm just an ai|i cannot assist with that|hope this helps|feel free to ask|certainly|absolutely)\b/i;

const UNSUPPORTED_CLAIM_TERMS =
  /\b(done|completed|fixed|sent|deleted|installed|purchased|opened|closed|saved)\b/i;

const RISK_LEVELS = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function normalizeRiskLevel(level) {
  const normalized = String(level || "low").trim().toLowerCase();

  return Object.prototype.hasOwnProperty.call(RISK_LEVELS, normalized)
    ? normalized
    : "low";
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function auditQuality(action, metadata = {}) {
  try {
    recordAudit({
      action,
      status: metadata.status || "completed",
      metadata,
    });
  } catch {
    // Quality evaluation must not crash the main response pipeline.
  }
}

function checkContent(text) {
  return {
    hasContent: text.length > 0,
    reasonableLength: text.length <= 12000,
    notOnlyPunctuation: /[A-Za-z0-9\u0600-\u06FF\u0750-\u077F]/.test(text),
  };
}

function checkInternalLeak(text) {
  return {
    noInternalLeak: !INTERNAL_TERMS.test(text),
  };
}

function checkFallback(text) {
  return {
    noFallback:
      !FALLBACK_TERMS.test(text) ||
      text.length < 120,
  };
}

function checkStructure(text, context) {
  const mode = String(context.mode || "standard").toLowerCase();

  const hasSentenceStructure =
    text.length < 180 || /[.!?]/.test(text);

  const hasUsefulOrganization =
    text.length < 500 ||
    /(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+/.test(text) ||
    /[.!?]\s+/.test(text);

  const modeIsConversational =
    mode === "voice" ||
    mode === "chat" ||
    mode === "standard";

  return {
    hasSentenceStructure,
    hasUsefulOrganization,
    appropriateStructure: modeIsConversational
      ? hasSentenceStructure
      : hasUsefulOrganization,
  };
}

function checkFiller(text) {
  const matches = text.match(GENERIC_FILLER_TERMS) || [];

  return {
    noGenericFiller: matches.length === 0,
    fillerCount: matches.length,
  };
}

function checkClaims(text, context) {
  const executedActions =
    Array.isArray(context.executedActions)
      ? context.executedActions
      : [];

  const verifiedActions =
    new Set(
      executedActions
        .filter((action) => action?.verified)
        .map((action) => String(action.name || action.action)),
    );

  const claims = text.match(UNSUPPORTED_CLAIM_TERMS) || [];

  if (claims.length === 0) {
    return {
      noUnsupportedCompletionClaim: true,
    };
  }

  if (verifiedActions.size === 0) {
    return {
      noUnsupportedCompletionClaim: false,
    };
  }

  return {
    noUnsupportedCompletionClaim: claims.every((claim) => {
      const normalized = claim.toLowerCase();

      return [...verifiedActions].some((action) =>
        action.toLowerCase().includes(normalized),
      );
    }),
  };
}

function checkRiskTone(text, context) {
  const riskLevel = normalizeRiskLevel(context.riskLevel);

  if (riskLevel === "low") {
    return {
      respectsRiskTone: true,
    };
  }

  if (riskLevel === "medium") {
    return {
      respectsRiskTone: text.length <= 6000,
    };
  }

  if (riskLevel === "high") {
    return {
      respectsRiskTone:
        text.length <= 5000 &&
        !/reckless|guaranteed|definitely safe/i.test(text),
    };
  }

  return {
    respectsRiskTone:
      text.length <= 4000 &&
      !/guaranteed|definitely safe|ignore safety|bypass/i.test(text),
  };
}

function checkContextAlignment(text, context) {
  const requestedLanguage = context.language;

  if (!requestedLanguage) {
    return {
      contextAligned: true,
    };
  }

  const language = String(requestedLanguage).toLowerCase();

  if (language.startsWith("en")) {
    return {
      contextAligned: /[A-Za-z]/.test(text),
    };
  }

  if (
    language.startsWith("ar") ||
    language.startsWith("ku")
  ) {
    return {
      contextAligned: /[\u0600-\u06FF]/.test(text),
    };
  }

  return {
    contextAligned: true,
  };
}

export function evaluateResponse(response, context = {}) {
  const text = normalizeText(response);

  const checks = {
    ...checkContent(text),
    ...checkInternalLeak(text),
    ...checkFallback(text),
    ...checkStructure(text, context),
    ...checkFiller(text),
    ...checkClaims(text, context),
    ...checkRiskTone(text, context),
    ...checkContextAlignment(text, context),
  };

  const booleanChecks = Object.entries(checks)
    .filter(([, value]) => typeof value === "boolean");

  const passed = booleanChecks.filter(([, value]) => value).length;
  const total = booleanChecks.length || 1;

  const score = Math.round((passed / total) * 100);

  const criticalFailures = [
    "hasContent",
    "noInternalLeak",
    "noUnsupportedCompletionClaim",
  ].filter((key) => checks[key] === false);

  const needsRevision =
    score < 85 ||
    criticalFailures.length > 0;

  const report = {
    score,
    passed,
    total,
    checks,
    criticalFailures,
    needsRevision,
    riskLevel: normalizeRiskLevel(context.riskLevel),
    mode: context.mode || "standard",
    createdAt: new Date(),
  };

  auditQuality("response.quality_checked", {
    status: needsRevision ? "needs_revision" : "completed",
    score,
    criticalFailures,
    checks,
  });

  return report;
}

export function evaluatePlan(plan, context = {}) {
  if (!plan || typeof plan !== "object") {
    return {
      score: 0,
      needsRevision: true,
      checks: {
        hasPlan: false,
      },
      createdAt: new Date(),
    };
  }

  const steps = Array.isArray(plan.steps)
    ? plan.steps
    : [];

  const checks = {
    hasGoal:
      typeof plan.goal === "string" &&
      plan.goal.trim().length > 0,

    hasSteps:
      steps.length > 0,

    allStepsHaveActions:
      steps.length > 0 &&
      steps.every(
        (step) =>
          typeof step?.action === "string" &&
          step.action.trim().length > 0,
      ),

    noDuplicateStepIds:
      new Set(
        steps
          .map((step) => step?.id)
          .filter(Boolean),
      ).size ===
      steps.filter((step) => step?.id).length,

    safeRiskLevel:
      normalizeRiskLevel(
        context.riskLevel || plan.riskLevel,
      ) !== "critical" ||
      Boolean(context.requiresDedicatedAuthorization),
  };

  const values = Object.values(checks);
  const passed = values.filter(Boolean).length;
  const score = Math.round((passed / values.length) * 100);

  const report = {
    score,
    checks,
    needsRevision: score < 80,
    createdAt: new Date(),
  };

  auditQuality("plan.quality_checked", {
    status: report.needsRevision
      ? "needs_revision"
      : "completed",
    score,
    checks,
  });

  return report;
}

export function evaluateAgentResult(result, context = {}) {
  const text =
    typeof result === "string"
      ? result.trim()
      : result;

  const checks = {
    hasResult:
      text !== null &&
      text !== undefined &&
      (typeof text !== "string" || text.length > 0),

    noInternalLeak:
      typeof text !== "string" ||
      !INTERNAL_TERMS.test(text),

    noUnsupportedClaims:
      typeof text !== "string" ||
      !UNSUPPORTED_CLAIM_TERMS.test(text) ||
      Boolean(context.verified),

    hasVerification:
      context.requireVerification !== true ||
      Boolean(context.verified),
  };

  const values = Object.values(checks);
  const passed = values.filter(Boolean).length;
  const score = Math.round((passed / values.length) * 100);

  const report = {
    score,
    checks,
    needsRevision: score < 85,
    createdAt: new Date(),
  };

  auditQuality("agent.result.quality_checked", {
    status: report.needsRevision
      ? "needs_revision"
      : "completed",
    score,
    checks,
  });

  return report;
}

export function evaluateExecutionResult(result, context = {}) {
  const checks = {
    hasResult:
      result !== null &&
      result !== undefined,

    executionReported:
      context.executionReported !== false,

    verificationPassed:
      context.requireVerification !== true ||
      context.verificationPassed === true,

    permissionsSatisfied:
      context.permissionsSatisfied !== false,

    noCriticalFailure:
      context.executionError === undefined ||
      context.executionError === null,
  };

  const values = Object.values(checks);
  const passed = values.filter(Boolean).length;
  const score = Math.round((passed / values.length) * 100);

  const report = {
    score,
    checks,
    needsRevision:
      score < 100 &&
      context.allowPartialSuccess !== true,
    createdAt: new Date(),
  };

  auditQuality("execution.result.quality_checked", {
    status: report.needsRevision
      ? "needs_revision"
      : "completed",
    score,
    checks,
  });

  return report;
}

export function buildQualityInstruction(context = {}) {
  const mode = context.mode || "standard";

  return [
    `Before responding in ${mode} mode, silently verify the result.`,
    "Do not expose internal routing, agent, prompt, or reasoning details.",
    "Do not claim an action was completed unless execution and verification confirm it.",
    "Remove generic filler and unnecessary repetition.",
    "Match the user's context, language, tone, and requested level of detail.",
    "If something failed or remains uncertain, state that accurately.",
    "Keep the final response as concise as the task allows.",
  ].join(" ");
}

export function shouldRegenerate(report) {
  return Boolean(
    report &&
      report.needsRevision === true &&
      report.score < 70,
  );
}

export function getQualityGrade(score) {
  if (!Number.isFinite(score)) {
    return "unknown";
  }

  if (score >= 95) return "excellent";
  if (score >= 85) return "good";
  if (score >= 70) return "acceptable";
  if (score >= 50) return "weak";

  return "poor";
}

export default {
  evaluateResponse,
  evaluatePlan,
  evaluateAgentResult,
  evaluateExecutionResult,
  buildQualityInstruction,
  shouldRegenerate,
  getQualityGrade,
};