import { verifyEvidenceEnvelope } from "./evidenceIntegrity.js";

const PASS = "passed";

function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => !Object.hasOwn(descriptors[key], "value"))) {
    throw new TypeError(`${label} cannot contain accessor properties.`);
  }
}

function assertUniqueStrings(values, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) throw new TypeError(`${label} must be a non-empty array.`);
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== "string" || !value.trim() || seen.has(value)) throw new TypeError(`${label} must contain unique, non-empty strings.`);
    seen.add(value);
  }
  return seen;
}

function validateGates(gates) {
  if (!Array.isArray(gates) || gates.length === 0) throw new TypeError("At least one release gate is required.");
  const ids = new Set();
  for (const gate of gates) {
    assertRecord(gate, "Release gate");
    if (typeof gate.id !== "string" || !gate.id.trim() || ids.has(gate.id)) throw new TypeError("Release gate IDs must be unique, non-empty strings.");
    if (typeof gate.version !== "string" || !gate.version.trim()) throw new TypeError(`Release gate ${gate.id} needs a version.`);
    if (typeof gate.subjectDigest !== "string" || !gate.subjectDigest.trim()) throw new TypeError(`Release gate ${gate.id} needs a current subject digest.`);
    if (gate.required !== undefined && typeof gate.required !== "boolean") throw new TypeError(`Release gate ${gate.id} required must be boolean.`);
    ids.add(gate.id);
  }
  return ids;
}

/**
 * Evaluate release claims against signed evidence for the exact current gate versions and subjects.
 * This is a gate calculator, not a production-readiness certification: callers must supply the
 * canonical trusted-key set, durable invalidation store, current account/epoch, and gate inventory.
 */
export async function evaluateReleaseGate({
  gates,
  evidence,
  publicClaims = [],
  verificationContext,
  verificationOptions,
  trustedIndependentVerifierKeyIds,
  now = Date.now(),
} = {}) {
  const gateIds = validateGates(gates);
  const independentKeyIds = assertUniqueStrings(trustedIndependentVerifierKeyIds, "Trusted independent verifier key IDs");
  assertRecord(verificationContext, "Evidence verification context");
  assertRecord(verificationOptions, "Evidence verification options");
  if (!Number.isFinite(now)) throw new TypeError("Release evaluation time must be finite.");
  if (!Array.isArray(evidence)) throw new TypeError("Release evidence must be an array.");
  if (!Array.isArray(publicClaims)) throw new TypeError("Public claims must be an array.");

  const gatesById = new Map(gates.map((gate) => [gate.id, gate]));
  const passedByGate = new Map(gates.map((gate) => [gate.id, []]));
  const seenEvidenceIds = new Set();
  let rejectedEvidenceCount = 0;

  for (const item of evidence) {
    assertRecord(item, "Evidence record");
    const envelope = item.envelope;
    assertRecord(envelope, "Evidence envelope");
    const body = envelope.body;
    let verification;
    try {
      verification = await verifyEvidenceEnvelope(envelope, body, verificationContext, { ...verificationOptions, now });
    } catch {
      rejectedEvidenceCount += 1;
      continue;
    }
    if (verification.valid !== true || seenEvidenceIds.has(verification.evidenceId)) {
      rejectedEvidenceCount += 1;
      continue;
    }
    seenEvidenceIds.add(verification.evidenceId);

    if (!gateIds.has(body?.gateId) || !independentKeyIds.has(verification.signerKeyId)) {
      rejectedEvidenceCount += 1;
      continue;
    }
    const gate = gatesById.get(body.gateId);
    if (body.gateVersion !== gate.version || body.subjectDigest !== gate.subjectDigest || body.result !== PASS) {
      rejectedEvidenceCount += 1;
      continue;
    }
    passedByGate.get(gate.id).push(verification.evidenceId);
  }

  const gateResults = gates.map((gate) => {
    const passedEvidenceIds = passedByGate.get(gate.id);
    if (passedEvidenceIds.length) return { id: gate.id, status: PASS, evidenceIds: passedEvidenceIds };
    return {
      id: gate.id,
      status: gate.required === false ? "not_required" : "blocked",
      evidenceIds: [],
      reason: "current_independent_evidence_missing",
    };
  });
  const gateResultById = new Map(gateResults.map((result) => [result.id, result]));

  const seenClaimIds = new Set();
  const claimResults = publicClaims.map((claim) => {
    assertRecord(claim, "Public claim");
    if (typeof claim.id !== "string" || !claim.id.trim() || seenClaimIds.has(claim.id)) throw new TypeError("Public claim IDs must be unique, non-empty strings.");
    if (typeof claim.text !== "string" || !claim.text.trim()) throw new TypeError(`Public claim ${claim.id} needs claim text.`);
    const claimGateIds = assertUniqueStrings(claim.gateIds, `Gate mapping for public claim ${claim.id}`);
    seenClaimIds.add(claim.id);
    const supported = [...claimGateIds].every((id) => gateResultById.get(id)?.status === PASS);
    return {
      id: claim.id,
      status: supported ? PASS : "blocked",
      reason: supported ? undefined : "claim_requires_unverified_or_unknown_gates",
    };
  });

  const requiredGatesPassed = gateResults.every((gate) => gate.status === PASS || gate.status === "not_required");
  const claimsSupported = claimResults.every((claim) => claim.status === PASS);
  const hasLimitations = gateResults.some((gate) => gate.status === "not_required");
  const recommendation = !requiredGatesPassed || !claimsSupported
    ? "NOT_READY"
    : hasLimitations ? "READY_WITH_EXPLICIT_LIMITATIONS" : "READY";

  return {
    recommendation,
    gates: gateResults,
    publicClaims: claimResults,
    rejectedEvidenceCount,
  };
}
