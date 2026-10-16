const CONTRACT_VERSION = "hey.expert-pack.v1";
const AUTHORITY_TIERS = new Set(["primary", "secondary", "tertiary"]);
const MAX_ARRAY_ITEMS = 100;

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readDataRecord(value, requiredKeys, errors, path) {
  if (!isPlainRecord(value)) {
    errors.push(`${path}: expected a plain object`);
    return null;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some((key) => typeof key !== "string" || !descriptors[key]?.enumerable || !("value" in descriptors[key]))) {
    errors.push(`${path}: accessors and non-enumerable or symbol properties are not allowed`);
    return null;
  }
  for (const key of requiredKeys) if (!Object.hasOwn(descriptors, key)) errors.push(`${path}.${key}: required`);
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]));
}

function readArray(value, path, errors, { min = 1 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > MAX_ARRAY_ITEMS) {
    errors.push(`${path}: expected an array with ${min} to ${MAX_ARRAY_ITEMS} items`);
    return [];
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const entries = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[index];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      errors.push(`${path}[${index}]: sparse or accessor array entries are not allowed`);
      continue;
    }
    entries.push(descriptor.value);
  }
  return entries;
}

function validText(value, max = 200) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function timestamp(value) {
  return typeof value === "string" && value.trim() ? Date.parse(value) : Number.NaN;
}

function canonicalHost(value) {
  if (!validText(value, 253)) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) return null;
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Syntactic validation only. A valid manifest is not certified or trusted policy. */
function validateExpertPackManifestUnsafe(value) {
  const errors = [];
  const manifest = readDataRecord(value, ["contractVersion", "id", "version", "domain", "scope", "jurisdictions", "sourceHierarchy", "highStakes", "updateCadenceDays", "evaluation", "certification", "escalation"], errors, "manifest");
  if (!manifest) return { valid: false, errors, status: "invalid" };

  if (manifest.contractVersion !== CONTRACT_VERSION) errors.push("manifest.contractVersion: unsupported contract");
  for (const key of ["id", "version", "domain", "scope"]) if (!validText(manifest[key])) errors.push(`manifest.${key}: invalid text`);
  if (typeof manifest.highStakes !== "boolean") errors.push("manifest.highStakes: expected boolean");
  if (!Number.isInteger(manifest.updateCadenceDays) || manifest.updateCadenceDays < 1 || manifest.updateCadenceDays > 3650) errors.push("manifest.updateCadenceDays: expected 1 to 3650 days");

  const jurisdictions = readArray(manifest.jurisdictions, "manifest.jurisdictions", errors);
  if (jurisdictions.some((item) => !validText(item, 64)) || new Set(jurisdictions).size !== jurisdictions.length) errors.push("manifest.jurisdictions: expected unique non-empty identifiers");

  const sources = readArray(manifest.sourceHierarchy, "manifest.sourceHierarchy", errors);
  const sourceIds = new Set();
  for (const [index, raw] of sources.entries()) {
    const source = readDataRecord(raw, ["id", "authorityTier", "origins", "maxAgeDays"], errors, `manifest.sourceHierarchy[${index}]`);
    if (!source) continue;
    if (!validText(source.id) || sourceIds.has(source.id)) errors.push(`manifest.sourceHierarchy[${index}].id: invalid or duplicate`);
    sourceIds.add(source.id);
    if (!AUTHORITY_TIERS.has(source.authorityTier)) errors.push(`manifest.sourceHierarchy[${index}].authorityTier: invalid`);
    const origins = readArray(source.origins, `manifest.sourceHierarchy[${index}].origins`, errors);
    if (!origins.length || origins.some((origin) => !canonicalHost(origin))) errors.push(`manifest.sourceHierarchy[${index}].origins: expected HTTPS hostnames`);
    if (!(source.maxAgeDays === Infinity || Number.isFinite(source.maxAgeDays) && source.maxAgeDays >= 0 && source.maxAgeDays <= 36500)) errors.push(`manifest.sourceHierarchy[${index}].maxAgeDays: invalid`);
  }

  const evaluation = readDataRecord(manifest.evaluation, ["suiteVersion", "evaluatedAt", "expiresAt", "evidenceIds"], errors, "manifest.evaluation");
  if (evaluation) {
    if (!validText(evaluation.suiteVersion)) errors.push("manifest.evaluation.suiteVersion: invalid");
    if (!Number.isFinite(timestamp(evaluation.evaluatedAt)) || !Number.isFinite(timestamp(evaluation.expiresAt)) || timestamp(evaluation.expiresAt) <= timestamp(evaluation.evaluatedAt)) errors.push("manifest.evaluation: invalid evidence window");
    const evidenceIds = readArray(evaluation.evidenceIds, "manifest.evaluation.evidenceIds", errors);
    if (evidenceIds.some((id) => !validText(id))) errors.push("manifest.evaluation.evidenceIds: invalid");
  }

  const certification = readDataRecord(manifest.certification, ["status", "evidenceIds"], errors, "manifest.certification");
  if (certification) {
    if (certification.status !== "uncertified") errors.push("manifest.certification.status: only uncertified packs may be declared by this runtime");
    const evidenceIds = readArray(certification.evidenceIds, "manifest.certification.evidenceIds", errors, { min: 0 });
    if (evidenceIds.some((id) => !validText(id))) errors.push("manifest.certification.evidenceIds: invalid");
  }

  const escalation = readDataRecord(manifest.escalation, ["requiredForHighStakes", "contactGuidance"], errors, "manifest.escalation");
  if (escalation && (escalation.requiredForHighStakes !== true || !validText(escalation.contactGuidance, 1000))) errors.push("manifest.escalation: high-stakes escalation is mandatory");
  return { valid: errors.length === 0, errors, status: errors.length ? "invalid" : "syntactically_valid_unverified" };
}

export function validateExpertPackManifest(value) {
  try {
    return validateExpertPackManifestUnsafe(value);
  } catch {
    return { valid: false, errors: ["manifest: inspection failed"], status: "invalid" };
  }
}

/**
 * Classifies candidate source evidence against a pack's declared source policy.
 * It deliberately never verifies truth, evaluation quality, or certification.
 */
function assessExpertPackEvidenceUnsafe({ manifest: rawManifest, source, jurisdiction, now = Date.now() } = {}) {
  const validation = validateExpertPackManifest(rawManifest);
  if (!validation.valid) return { status: "invalid", reason: "invalid_expert_pack_manifest", errors: validation.errors };
  const sourceErrors = [];
  const safeSource = readDataRecord(source, ["url"], sourceErrors, "source");
  if (!safeSource) return { status: "invalid", reason: "invalid_source" };
  const url = typeof safeSource.url === "string" ? (() => { try { return new URL(safeSource.url); } catch { return null; } })() : null;
  if (!url || url.protocol !== "https:" || url.username || url.password) return { status: "invalid", reason: "invalid_source_url" };
  if (!Number.isFinite(now)) return { status: "invalid", reason: "invalid_evaluation_time" };

  const manifest = rawManifest;
  const sourceRule = manifest.sourceHierarchy.find((item) => item.origins.some((origin) => canonicalHost(origin) === url.hostname.toLowerCase()));
  if (!sourceRule) return { status: "invalid", reason: "source_outside_pack_hierarchy" };
  if (jurisdiction !== undefined && jurisdiction !== null) {
    if (!validText(jurisdiction, 64)) return { status: "invalid", reason: "invalid_required_jurisdiction" };
    if (!manifest.jurisdictions.includes("*") && !manifest.jurisdictions.includes(jurisdiction)) return { status: "invalid", reason: "pack_jurisdiction_mismatch" };
    const sourceJurisdictions = safeSource.jurisdictions ?? safeSource.jurisdiction;
    const values = Array.isArray(sourceJurisdictions) ? sourceJurisdictions : [sourceJurisdictions];
    if (!values.includes(jurisdiction)) return { status: "invalid", reason: sourceJurisdictions ? "source_jurisdiction_mismatch" : "source_jurisdiction_missing" };
  }
  const capturedAt = timestamp(safeSource.retrievedAt ?? safeSource.capturedAt);
  if (!Number.isFinite(capturedAt) || capturedAt > now + 60_000 || now - capturedAt > sourceRule.maxAgeDays * 86_400_000) return { status: "stale", reason: "source_freshness_failed" };
  if (safeSource.expiresAt !== undefined && (!Number.isFinite(timestamp(safeSource.expiresAt)) || now >= timestamp(safeSource.expiresAt))) return { status: "stale", reason: "source_expired" };
  if (safeSource.freshness === "volatile" && !safeSource.expiresAt) return { status: "stale", reason: "volatile_source_missing_expiry" };
  const evalExpiresAt = timestamp(manifest.evaluation.expiresAt);
  if (now >= evalExpiresAt) return { status: "stale", reason: "pack_evaluation_expired" };
  return {
    status: "unverified",
    reason: "candidate_evidence_requires_independent_verification",
    sourceTier: sourceRule.authorityTier,
    evaluationEvidenceIds: [...manifest.evaluation.evidenceIds],
    certificationStatus: "uncertified",
    professionalEscalationRequired: manifest.highStakes,
    authorityGranted: false,
  };
}

export function assessExpertPackEvidence(input) {
  try {
    return assessExpertPackEvidenceUnsafe(input);
  } catch {
    return { status: "invalid", reason: "expert_pack_evidence_inspection_failed" };
  }
}

export const EXPERT_PACK_CONTRACT_VERSION = CONTRACT_VERSION;
