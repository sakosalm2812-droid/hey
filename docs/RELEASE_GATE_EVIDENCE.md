# Release gate evidence contract

`HEY.releaseGate.evaluate` computes a release recommendation from a caller-supplied gate inventory, public-claim mappings, and HEY signed evidence envelopes. A `READY` recommendation now also requires a fresh independent signature over the exact inventory and claim mappings. It is an enforcement primitive; it does not supply the product's gate inventory or certify that HEY as a whole is production-ready.

## Gate and evidence binding

Each gate has a unique `id`, `version`, and `subjectDigest`. The digest identifies the exact build, policy, contract, or other subject whose result is being checked. Evidence must be a canonical signed evidence envelope whose signed body has matching `gateId`, `gateVersion`, `subjectDigest`, and `result: "passed"`. The envelope signature key must also be listed in the caller's trusted independent verifier keys. Signature trust, account binding, freshness, revocation epoch, offline policy, invalidation, and body integrity are delegated to the existing `verifyEvidenceEnvelope` verifier.

The evaluator requires callers to provide the current authenticated account and revocation epoch, the canonical verifier options, the durable evidence invalidation store, the freshness policy, independent verifier key IDs, and `inventoryAttestation`, `trustedInventoryAttestorKeyIds`, and `inventoryAttestationChallenge`. The inventory signer must be trusted by the same evidence verifier and its key ID must be distinct from gate evidence verifier IDs. The signed body is produced with `HEY.releaseGate.createInventoryAttestationBody({ gates, publicClaims, challenge })`; it binds sorted gate IDs, versions, subject digests, effective required flags, claim IDs/text, and sorted gate mappings. The evaluator compares that signed body with the current input and challenge and enforces a five-minute maximum attestation age, even when the general verifier freshness setting is unbounded. A missing, stale, replayed against a rotated challenge, malformed, wrong-account, wrong-signer, or changed-inventory attestation blocks `READY`. A missing or stale item cannot pass by carrying a `verified`/`approved` boolean. Invalid or non-independent evidence is rejected and never appears in a passed gate's evidence IDs.

The integration must issue a unique current challenge for each evaluation request and reject reuse of prior challenges. It must provision inventory signing keys through an independent trust process and provide an authoritative complete gate catalog. Those properties cannot be established by this evaluator or by a caller-supplied boolean.

Public claims list the gate IDs that support them. A claim with an empty, unknown, blocked, or not-required gate mapping is blocked. Missing required gates or unsupported claims produce `NOT_READY`; missing optional gates produce `READY_WITH_EXPLICIT_LIMITATIONS`; every required gate and claim passing produces `READY`.

## Boundaries

- The authoritative complete gate inventory, subject-digest generation, public-claim semantics, challenge lifecycle, verifier-key governance, and durable evidence adapter remain deployment/integration responsibilities.
- A passing digest proves identity of the checked subject, not that the check itself was complete. Trusted verifier keys must be granted only to independent checkers operating against declared requirements.
- This evaluator does not run CI, device tests, migration/restore drills, production-assault scenarios, or semantic claim review. Those results need explicit gate definitions and independently signed evidence.
- The repository does not yet define a complete whole-product gate registry. The release-surface matrix and this helper must not be presented as final product certification.
