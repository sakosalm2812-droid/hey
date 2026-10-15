# Specialist 09: HEY One Model and Provider Fabric

Codex task: 01a14074-4bdf-7f33-bf83-bb7e1dff5097
Branch: codex/next-09-hey-one-models
Last known branch head: 8119cd1

## Shared sources
Read the complete docs/requirements/HEY_SHARED_FOUNDATION.md and docs/requirements/HEY_SOURCE_C_RECOVERY_DIRECTIVE.md. Source A is the original detailed product specification. Source C later refines it and prevails on conflicts. Source B's relevant full subsystem prompts follow. All work applies to the existing HEY repository, not a separate package.

## Scoped implementation assignment
Complete server-side provider/profile routing through authenticated Edge: allowlisted IDs, entitlement and cost ceilings, secret custody, bounded cancellation/timeouts, 429/500 and recovery. Keep one HEY identity; no client secret or fake inference.

## Current code facts to validate
Branch 8119cd1 wires configured selection through HEY Edge. No provider key, Supabase URL or deployed Edge Function is configured here; live inference is unverified.

## Source A: complete task-specific requirements
### Complete Source A document: `02_INTELLIGENCE_EVOLUTION/02_DECISION_FABRIC_BEYOND_TOKENS.md`
# FILE: `02_INTELLIGENCE_EVOLUTION/02_DECISION_FABRIC_BEYOND_TOKENS.md`

# Decision Fabric — Intelligence Beyond Token Generation

Tokens are only one mechanism used by generative language models. HEY must avoid spending generative-model tokens on work that can be solved faster or more reliably by other mechanisms.

## HEY decision stack
1. Deterministic code/rules/state machines for exact policy and workflow transitions.
2. Caches and memoized validated results.
3. Traditional algorithms for parsing, diffing, scheduling, hashing, graphs, compression, ranking and math.
4. Embeddings/vector retrieval for similarity and memory/search retrieval.
5. Rerankers/classifiers for relevance, spam, risk, intent and candidate ordering.
6. Typed decision models for bounded choices/scores/probabilities.
7. Small/local models for narrow uncertain tasks.
8. Strong generative models for open-ended reasoning/generation.
9. Intelligence Council for high-value/high-uncertainty tasks.

Jev-class systems are useful inspiration: a typed decision model can return probabilities over allowed decisions rather than generating prose token-by-token. HEY should support such engines through adapters for routing, ranking, policy, risk, approvals, relevance and other bounded decisions. They do not replace generative models; they remove unnecessary generative work.

## Speed techniques HEY should use where supported
KV/prefix caching, speculative decoding, batching, parallel tool/model execution, quantization for local models, sparse/MoE inference where provider/runtime supports it, streaming, prefetching, request coalescing, compiled prompts/contracts, context retrieval instead of giant prompts, deterministic fast paths, local heuristics, concurrency controls and latency-aware provider routing.

## Invention mandate
HEY may build its own **MicroDecision Fabric**: task-specific calibrated classifiers and deterministic policies trained/evaluated on HEY's own labelled outcomes. Uncertain cases escalate to stronger intelligence. Every decision engine is calibrated and benchmarked per task.


---

### Complete Source A document: `04_SECURITY_GOVERNANCE/03_RATE_LIMITS_COMPUTE_ALLOWANCES_CONTINUITY.md`
# FILE: `04_SECURITY_GOVERNANCE/03_RATE_LIMITS_COMPUTE_ALLOWANCES_CONTINUITY.md`

# Rate Limits, Compute Allowances & Atomic Completion

HEY uses distributed server-side rate limiting for expensive/sensitive routes. Limits are endpoint- and cost-aware, not one global frontend counter. Authenticated identity, organization/user ID and appropriate network/device signals are combined; anonymous auth/signup/recovery routes receive separate abuse protection. 429 responses are structured and include retry timing.

## Compute Allowances
User-facing plans should not fundamentally be measured in “hours” or raw tokens. Internal allowance accounting can combine provider spend, input/output tokens, image/video/audio generations, tool/API costs, parallel agents, GPU/compute and long-running background duration. The UI can present a simple understandable capacity meter.

## Atomic Completion / Continuity Reserve
HEY does not randomly stop halfway through a coherent unit when an allowance boundary is reached. It may use a bounded continuity reserve to finish the current file/slide/artifact step/tool transaction, then checkpoint.

It reports: what completed, why it paused, exact saved state, what remains and how to resume. The reserve is capped so a user cannot start an enormous costly job with almost no allowance remaining and force unlimited completion.


---

### Complete Source A document: `04_SECURITY_GOVERNANCE/04_CLOSED_SOURCE_API_LOCAL_MODELS_EXTENSIONS.md`
# FILE: `04_SECURITY_GOVERNANCE/04_CLOSED_SOURCE_API_LOCAL_MODELS_EXTENSIONS.md`

# Closed Source Core, APIs, Local Models & Third-Party Extensions

HEY's core codebase remains closed source. Users do not need source access to use local models.

HEY exposes stable API/SDK contracts for models, tools, agents, workflows, widgets and integrations. Local inference options can include Ollama, llama.cpp, LM Studio, vLLM/OpenAI-compatible endpoints, a HEY local runtime and trusted LAN/self-hosted endpoints.

A model profiler records context, tool calling, JSON reliability, modalities, speed, resource use and benchmark quality so the Router can use local models intelligently.

Third-party developers can build extensions through public SDKs/contracts. Before privileged public distribution: automated validation, dependency/supply-chain scan, sandbox, permissions review, security tests, compatibility tests and **all three owners' approval**. Approved packages are signed/versioned and can be revoked/quarantined.


---

### Complete Source A document: `01_DETAILED_SYSTEM_SPECS/14_COMPLETE_PROVIDER_FALLBACK_ROUTING_MATRIX.md`
# FILE: `01_DETAILED_SYSTEM_SPECS/14_COMPLETE_PROVIDER_FALLBACK_ROUTING_MATRIX.md`

# Complete Provider, Model & Fallback Routing
## HEY V1 — Full-depth implementation specification

**Mission:** Select the best real provider/tool path by quality, latency, cost, privacy, modality, health and user policy.

This specification is normative for HEY V1. A feature is not complete because a page renders or an API returns. It is complete only when discovery, interaction, state, permissions, failures, recovery, verification, accessibility, observability and end-to-end behavior all work.

# 1. Scope
- LLM, image, video, audio, speech, embedding, OCR/vision, local models, specialized tools.
- Auto routing, manual advanced override, fallback, budgets, privacy constraints, health.

# 2. User experience contract
- Normal users see HEY, not provider complexity.
- Advanced users can inspect why a route was selected.
- Manual provider pinning gives clear failure/fallback policy.
- Local-only project never routes cloud.

# 3. Architecture / runtime contract
- Provider adapter contract: capabilities, auth, request, streaming, cancellation, usage, errors, health, retry semantics.
- Router scores quality/latency/cost/privacy/health and requirement constraints.
- Circuit breakers remove unhealthy providers temporarily.
- Fallback does not silently change a materially important capability without notice.

# 4. Required state model
- healthy
- degraded
- rate-limited
- auth-failed
- unavailable
- circuit-open
- recovering

# 5. Failure and recovery catalog
- 429 → backoff/fallback.
- Auth failure → disable provider and alert admin/user where relevant.
- Timeout → cancel and fallback if safe.
- Partial generation → preserve result and retry missing part.

# 6. Security / privacy / trust requirements
- Keys server-side/native secure storage.
- No cross-project data leakage.
- Provider privacy policies represented in routing constraints.

# 7. Data model / persistence
- providers
- provider_models
- provider_health
- provider_routes
- provider_usage
- provider_budgets
- routing_policies

# 8. Events / telemetry contracts
- provider.selected
- provider.failed
- fallback.started
- route.explained
- budget.blocked
- circuit.opened

# 9. Platform behavior
- Follow the strongest legitimate behavior available per platform; expose limitations honestly.

# 10. Implementation requirements
- Reuse shared HEY runtime, permissions, audit, verification, Project DNA, Pinpoint, Cosmos and error systems rather than creating isolated local logic.

# 11. Acceptance / regression tests
- Primary failure fallback.
- Local-only blocks cloud.
- Budget threshold.
- Manual pin.
- Provider recovery.

# 12. Non-goals / prohibited shortcuts
- No fake success, no UI-only placeholders, no hidden unsupported behavior, no duplicate parallel subsystem that bypasses the HEY Brain.

# 13. Definition of done
A release candidate passes only when:
- normal users can discover the capability;
- the capability works from its natural HEY entry points;
- it survives supported resume/background states;
- permissions are scoped and revocable;
- errors recover without losing user work;
- meaningful actions are verified;
- analytics/diagnostics can explain failure without exposing secrets;
- keyboard/touch/RTL/reduced-motion behavior is correct where relevant;
- mobile/tablet/desktop adaptations are intentional;
- tests exercise real integration paths, not mocked happy paths only.



---


---

### Complete Source A document: `01_DETAILED_SYSTEM_SPECS/15_COMPLETE_FAILURE_RECOVERY_CATALOG.md`
# FILE: `01_DETAILED_SYSTEM_SPECS/15_COMPLETE_FAILURE_RECOVERY_CATALOG.md`

# Complete Failure, Recovery & Graceful-Degradation Catalog
## HEY V1 — Full-depth implementation specification

**Mission:** Ensure HEY fails visibly, safely and recoverably instead of becoming stuck or pretending success.

This specification is normative for HEY V1. A feature is not complete because a page renders or an API returns. It is complete only when discovery, interaction, state, permissions, failures, recovery, verification, accessibility, observability and end-to-end behavior all work.

# 1. Scope
- Network, auth, provider, database, filesystem, device, permission, native helper, browser, generation, memory, sync, billing, migration, notification and UI failures.
- Retry, fallback, checkpoint, undo, partial success.

# 2. User experience contract
- Error message says what failed, what remains safe, what HEY tried, and best next action.
- Partial success is not reported as complete.
- User work/drafts preserved wherever possible.
- Advanced detail available without dumping stack traces at normal users.

# 3. Architecture / runtime contract
- Central error taxonomy with retryability, severity, user-safe message, diagnostic code and owner.
- Recovery coordinator avoids retry storms.
- Checkpoints for long-running work.
- Action receipts include failures and verification.

# 4. Required state model
- transient
- persistent
- user-action-required
- permission-blocked
- degraded
- partial-success
- recovering
- unrecoverable

# 5. Failure and recovery catalog
- Network drop
- 401/403
- 429
- 5xx
- disk full
- database unavailable
- provider timeout
- helper crash
- sync conflict
- corrupt artifact
- billing webhook delay
- migration failure

# 6. Security / privacy / trust requirements
- Fail closed for security failures.
- Never expose secrets in error detail.
- No destructive auto-recovery without snapshot/approval.

# 7. Data model / persistence
- error_events
- recovery_attempts
- checkpoints
- incident_links
- action_receipts

# 8. Events / telemetry contracts
- error.raised
- recovery.started
- recovery.succeeded
- recovery.failed
- partial.success
- circuit.breaker

# 9. Platform behavior
- Follow the strongest legitimate behavior available per platform; expose limitations honestly.

# 10. Implementation requirements
- Reuse shared HEY runtime, permissions, audit, verification, Project DNA, Pinpoint, Cosmos and error systems rather than creating isolated local logic.

# 11. Acceptance / regression tests
- Every major subsystem has injected failure tests.
- Retry caps.
- Offline recovery.
- Crash restart.
- Partial result preservation.

# 12. Non-goals / prohibited shortcuts
- No fake success, no UI-only placeholders, no hidden unsupported behavior, no duplicate parallel subsystem that bypasses the HEY Brain.

# 13. Definition of done
A release candidate passes only when:
- normal users can discover the capability;
- the capability works from its natural HEY entry points;
- it survives supported resume/background states;
- permissions are scoped and revocable;
- errors recover without losing user work;
- meaningful actions are verified;
- analytics/diagnostics can explain failure without exposing secrets;
- keyboard/touch/RTL/reduced-motion behavior is correct where relevant;
- mobile/tablet/desktop adaptations are intentional;
- tests exercise real integration paths, not mocked happy paths only.



---


---

### Complete Source A document: `01_DETAILED_SYSTEM_SPECS/16_COMPLETE_PERFORMANCE_BUDGETS.md`
# FILE: `01_DETAILED_SYSTEM_SPECS/16_COMPLETE_PERFORMANCE_BUDGETS.md`

# Complete Performance, Battery & Thermal Budgets
## HEY V1 — Full-depth implementation specification

**Mission:** Keep HEY responsive on weak laptops and scalable on stronger hardware.

This specification is normative for HEY V1. A feature is not complete because a page renders or an API returns. It is complete only when discovery, interaction, state, permissions, failures, recovery, verification, accessibility, observability and end-to-end behavior all work.

# 1. Scope
- Startup, input latency, animation FPS, memory, CPU, GPU, bundle size, background usage, network, generation orchestration, battery/thermal adaptation.
- Performance tiers and instrumentation.

# 2. User experience contract
- Typing, scrolling and core navigation remain responsive while background work runs.
- Heavy studios lazy-load.
- Weak hardware automatically reduces nonessential glass/parallax/ambient effects.
- Performance degradation is not confused with feature failure.

# 3. Architecture / runtime contract
- Performance tier detector based on measured capability, not only hardware name.
- Task scheduler budgets background work.
- Virtualize large lists, defer offscreen rendering, cache carefully.
- Native and web telemetry measure actual latency.

# 4. Required state model
- full
- balanced
- lightweight
- battery-saver
- thermal-throttled
- background

# 5. Failure and recovery catalog
- Memory pressure → release caches.
- GPU jank → lower visual tier.
- CPU saturation → throttle background agents.
- Slow network → progressive/streamed UI.

# 6. Security / privacy / trust requirements
- Performance telemetry excludes sensitive content.
- User can disable diagnostics telemetry per policy.

# 7. Data model / persistence
- performance_profiles
- perf_samples
- resource_budgets
- thermal_state
- battery_state

# 8. Events / telemetry contracts
- perf.long_task
- perf.jank
- perf.memory_pressure
- tier.changed
- battery.saver

# 9. Platform behavior
- Follow the strongest legitimate behavior available per platform; expose limitations honestly.

# 10. Implementation requirements
- Reuse shared HEY runtime, permissions, audit, verification, Project DNA, Pinpoint, Cosmos and error systems rather than creating isolated local logic.

# 11. Acceptance / regression tests
- Old Toshiba-class weak device smoke test.
- 60Hz/120Hz UI.
- Long chat virtualization.
- Large project.
- Background mission while typing.
- Battery saver.

# 12. Non-goals / prohibited shortcuts
- No fake success, no UI-only placeholders, no hidden unsupported behavior, no duplicate parallel subsystem that bypasses the HEY Brain.

# 13. Definition of done
A release candidate passes only when:
- normal users can discover the capability;
- the capability works from its natural HEY entry points;
- it survives supported resume/background states;
- permissions are scoped and revocable;
- errors recover without losing user work;
- meaningful actions are verified;
- analytics/diagnostics can explain failure without exposing secrets;
- keyboard/touch/RTL/reduced-motion behavior is correct where relevant;
- mobile/tablet/desktop adaptations are intentional;
- tests exercise real integration paths, not mocked happy paths only.



---


---

## Source B: complete applicable Master Build Program prompts
Apply each exact step prompt to the real repository with Source A/C precedence; do not produce standalone HEY-NEXT packages.

HEY PROMPT 06/47 — Model & Provider Fabric, Adaptive Compute and MicroDecision Runtime

You are the principal production engineer for HEY responsible for: Model & Provider Fabric, Adaptive Compute and MicroDecision Runtime.

Create the production-grade integration-ready package:

`HEY-NEXT/06-model-provider-fabric/`

PACKAGE OWNERSHIP
Own HEY's canonical model/provider fabric: capability-aware routing across deterministic systems, local/browser/LAN/self-hosted/cloud models and specialists while optimizing quality, latency, privacy, reliability, device constraints, and cost.

DEPENDENCY INTENT
This package conceptually depends on: Prompts 01-05.
Because every Codex task is isolated and other package outputs may not be physically available, do not invent competing global systems. Use minimal clearly-labelled temporary mirrors only when compilation/testing requires them.


==================================================
ABSOLUTE FINAL PRODUCT CONTRACT — NON-NEGOTIABLE
==================================================

This is FINAL-PRODUCT engineering, not ideation, an MVP, a prototype, a demo, a mockup, a proof of concept, or a partial feature pass.

Forbidden:
- MVP shortcuts or knowingly incomplete production paths
- placeholders, fake-success states, dead buttons, disconnected screens, mock-backed “working” behavior, TODO-driven completion claims, or silent deferral of hard requirements
- frontend-only, backend-only, schema-only, or test-only completion claims
- a new duplicate global architecture when a canonical HEY contract already exists
- assuming code exists means behavior is integrated, verified, secure, recoverable, observable, accessible, performant, or production-ready
- replacing a stronger future-existing HEY implementation merely because this package differs
- inventing details about the unavailable real HEY repository
- claiming platform capabilities the platform does not expose
- claiming successful side effects without independent postcondition verification

For every applicable capability, the completion pipeline is:
discovery -> current research -> explicit requirements -> architecture -> implementation -> contracts -> data/state -> permissions/authentication/authorization boundaries -> privacy/security -> integration seams -> failure handling -> retry/timeout/cancellation -> recovery/rollback/compensation -> offline/degraded behavior -> weak-device behavior -> performance/cost controls -> observability/auditability -> accessibility/localization readiness -> unit tests -> integration tests -> adversarial/failure tests -> realistic end-to-end tests -> independent verification -> evidence.

If you discover a fixable defect inside this package, FIX IT. Discovery creates work; it is not a reason to stop.

Use the maturity ladder:
MISSING -> DESIGNED -> IMPLEMENTING -> FUNCTIONAL -> INTEGRATED -> VERIFIED -> PRODUCTION_READY.

PRODUCTION_READY requires current, reproducible evidence. Evidence becomes stale when affected implementation, dependencies, policy, environment, tests, schemas, contracts, or providers change.

Never use “confirmed: true”, “approved: true”, UI state, model output, retrieved content, or client-supplied claims as sufficient authority for consequential actions.

Every consequential action must be attributable to the human/service actor, the executing component/device/tool, the exact authority used, the exact target/parameters, the result, verification evidence, cost where relevant, and rollback/compensation status where applicable.

==================================================
SOURCE / INTEGRATION AUTHORITY
==================================================

The newest real HEY codebase is currently unavailable.

Therefore:
1. Build a production-grade, interface-stable, integration-ready HEY-NEXT package.
2. Do not invent the current repository structure, existing tables, current routes, current providers, or current implementations.
3. Clearly separate VERIFIED package behavior from UNVERIFIED future-integration assumptions.
4. If you need a shared contract from another HEY-NEXT package that is not physically present, create only a minimal TEMPORARY CONTRACT MIRROR and label it exactly:
   TEMPORARY CONTRACT MIRROR — MUST BE RECONCILED WITH CANONICAL HEY CONTRACT DURING INTEGRATION.
5. Do not create a competing identity, permission, event, mission, Cosmos, provider, device, artifact, or evidence system simply because the canonical package is unavailable.
6. Every external dependency, service, environment variable, database requirement, native entitlement, build requirement, model/runtime requirement, and installation step must be recorded for Claude Code in DEPENDENCIES.md and INTEGRATION_MANIFEST.md.
7. Future Claude Code integration must inspect the real HEY implementation first, preserve unique stronger behavior, migrate/consolidate safely, wire all layers, run regression/adversarial tests, and retire obsolete duplicates only after evidence.
8. Never destructively assume that HEY-NEXT automatically supersedes existing production code.

==================================================
GLOBAL HEY LAWS
==================================================

HEY is one intelligence, not a visible pile of disconnected bots.

All surfaces eventually share canonical identity, missions, permissions, policies, Cosmos, agents, tools, models, devices, artifacts, receipts, evidence, events, context, and user preferences.

HEY is provider-independent and device-independent.

Prefer, when suitable:
deterministic code/rules/cache/algorithms -> tiny classifiers/micro-models -> local/small models -> cheap strong cloud models -> specialist models -> frontier models -> multi-agent councils only when measured value justifies them.

HEY must work across web/PWA, Android, iOS/iPadOS within platform limits, Windows, macOS, Linux, tablets/phones/desktops, very weak devices, remote/cloud runtimes, local/self-hosted runtimes, and future device adapters.

Ultra-light device law:
The intelligence does not need to live on the device. The device needs only the smallest trusted local runtime necessary to expose supported capabilities, enforce authority, access permitted resources, execute typed actions, verify postconditions, and communicate securely.

Device classes:
CLASS 0 LEGACY TERMINAL — interaction/gateway only when local OS capabilities are unavailable.
CLASS 1 HEY EDGE — tiny deterministic action runtime, no LLM required.
CLASS 2 HEY EDGE+ — adds lightweight local intent/search/speech/classification where viable.
CLASS 3 FULL LOCAL HEY — can run local reasoning/vision/speech/agents/creation when hardware allows.

Offline is a core requirement. Every capability must truthfully declare its local/cloud/offline behavior and degrade explicitly.

No hidden dark patterns, coercion, fake scarcity, deceptive sponsorship influence, or addiction-maximizing mechanics. Psychology may optimize trust, clarity, motivation, reduced cognitive load, commitment, salience, legitimate social proof, reversible defaults, and attention efficiency.

Minors are supported. Build age-aware boundaries, not surveillance assumptions.

==================================================
BASE CONTRACT COMPATIBILITY
==================================================

Design against the intent of Prompt 01 Global Foundation and Prompt 02 Identity/Accounts/Device Trust:
- typed versioned contracts
- durable mission lifecycle
- canonical events/errors/receipts/evidence
- action-bound authorization
- device identity/trust
- workspace/account separation
- local/cloud classifications
- privacy classifications
- capability maturity
- independent verification

If those package files are absent, mirror only what is essential and flag reconciliation work.

==================================================
DEPENDENCY + INTEGRATION DISCIPLINE
==================================================

For every library/service/runtime:
record purpose, version strategy, license, security considerations, platform support, install command, optional/mandatory status, alternatives considered, and future migration cost.

INTEGRATION_MANIFEST.md must state:
- what this package owns and deliberately does NOT own
- contracts consumed/exported
- APIs/events emitted/consumed
- storage/schema requirements
- environment variables/secrets as names only
- dependencies/install steps
- web/backend/native/Edge wiring
- likely conflicts/duplicates Claude must inspect
- migration order/data migration/rollback
- post-integration tests
- capability maturity/evidence requirements
- unknowns requiring the real HEY repository

==================================================
RESEARCH STANDARD
==================================================

Where current research access exists, use current primary/authoritative sources first: official specifications, standards bodies, platform documentation, original technical papers, official provider/runtime docs, and maintained project documentation.

Compare alternatives on correctness, interoperability, security, privacy, platform reach, weak-device cost, latency, memory, battery, licensing, maintainability, vendor lock-in, ecosystem maturity, observability, testability, and migration risk. Record major accepted/rejected decisions.

==================================================
FINAL SELF-ATTACK
==================================================

Before completion, run a hostile self-review designed to prove your package is partial, insecure, duplicated, misleading, too heavyweight, provider-locked, platform-faked, difficult to integrate, or impossible to recover.

At minimum ask:
- Can a model/tool/retrieved document escalate authority?
- Can another user/workspace/device receive data or capability accidentally?
- Can retries duplicate side effects?
- Can cancellation still allow later side effects?
- Can “success” occur without verified postconditions?
- Can stale evidence remain valid?
- What happens offline, on weak hardware, under rate limits, after auth expiry, during provider outage, on corrupted state, and during partial success?
- Does this package duplicate a global HEY concern?
- Are mocks/test adapters clearly impossible to confuse with production?
- Are all install/migration/wiring steps written down?
- Is anything labelled complete that cannot actually be proven without the real HEY repository?

Fix every reproducible defect. Mark remaining codebase-dependent claims UNVERIFIED.


==================================================
MANDATORY CAPABILITIES / ARCHITECTURE
==================================================

Build, specify, test, and document at least all of the following. This is a floor, not a ceiling. Add any missing capability, state, edge case, contract, verifier, recovery path, performance mechanism, security boundary, migration concern, or test required to make this subsystem genuinely production-grade.

- Provider-neutral model interface and capability fingerprint: modalities, context, tools, structured-output reliability, languages, coding, vision, latency, cost, privacy, region, streaming, caching, quotas, deprecation.
- Adaptive Compute routing by plan, task, user preference, resources, locality, network, battery/thermal, cost ceiling, quality threshold, and urgency.
- MicroDecision Fabric for intent/risk/retrieval/context/action classifiers and deterministic policies.
- Pluggable local runtimes such as llama.cpp/OpenAI-compatible/vLLM/Ollama/LM Studio/browser WebGPU or future equivalents without lock-in.
- Dynamic local model load/unload, quantization metadata, RAM/GPU budgeting, warm pools, cold storage, and prefetching.
- Provider failover, latency hedging, safe request racing, circuit breakers, retry budgets, model disappearance and quota exhaustion.
- Prompt/prefix/KV/cache awareness, semantic/result caching hooks, batching, coalescing, streaming, speculative preparation.
- Per-task/per-user empirical routing based on eval evidence, not marketing/model size.
- Plan-aware pools: Free efficient curated; Pro broader; Elite specialists/frontier/council; Owner broad subject to security/cost safety.
- Privacy/locality constraints enforced before routing.
- Model safety envelope: models never own authority.
- Model version tracking, shadow eval, canary routing, rollback, provider retirement and exit plan.
- Quality/cost frontier measurement and expensive-mission estimates.
- Adapter/LoRA/specialist metadata and future hot-swapping strategy.
- Observability for tokens, latency, errors, cost, cache hits, corrections, verifier result.
- Capability tournament/bake-off hooks for Evolution Engine.

==================================================
DATA, CONTRACTS, EVENTS, STATE & API REQUIREMENTS
==================================================

For this subsystem:
- define stable typed public interfaces and versioned schemas
- define lifecycle/state machines wherever state exists
- define IDs, timestamps, ownership, workspace/account scope, provenance, privacy classification, locality, version, status, and evidence links where applicable
- define commands/queries/events separately where that improves safety
- define idempotency semantics for every retryable write or side effect
- define optimistic/concurrent update behavior and conflict policy
- define retention/deletion/export/migration behavior for persisted data
- define compatibility/version negotiation where multiple devices/services/clients may be on different versions
- define errors using the canonical HEY error/recovery model rather than ad-hoc strings
- define observability hooks and audit events without leaking secrets/private content
- define integration boundaries with Identity, Trust Kernel, Mission Runtime, Brain, Cosmos, Situation, Tool/Action Fabric, Device Mesh, Edge, Artifacts, Billing, Privacy, Security, Evaluation, and Release systems wherever applicable
- never make a model response itself authoritative state

==================================================
IMPLEMENTATION STANDARD
==================================================

Do not only write Markdown.

Create working libraries/modules/reference services/schemas/validators/state machines/adapters/test harnesses where this package can be implemented independently.

When a real external service, provider credential, operating-system entitlement, physical device, production database, signing identity, or unavailable HEY subsystem is required, implement:
1. the production contract/interface,
2. a clearly-labelled test adapter/fixture,
3. exact integration/install/config requirements,
4. tests for the contract,
5. UNVERIFIED status for the real integration.

Test adapters must be structurally impossible to mistake for production paths. Use feature detection and capability negotiation rather than platform assumptions.

==================================================
PACKAGE STRUCTURE
==================================================

At minimum create:

HEY-NEXT/06-model-provider-fabric/
README.md
ARCHITECTURE.md
DOMAIN-CONTRACTS.md
DATA-AND-STATE.md
SECURITY-PRIVACY.md
OFFLINE-WEAK-DEVICE.md
OBSERVABILITY.md
DEPENDENCIES.md
ASSUMPTIONS.md
LIMITATIONS.md
INTEGRATION_MANIFEST.md
MIGRATION_PLAN.md
EVIDENCE.md
src/
schemas/
tests/
integration-tests/
adversarial-tests/
fixtures/
docs/

Add domain-specific directories/files when useful.

==================================================
DOMAIN-SPECIFIC TEST FLOOR
==================================================

At minimum include tests for:

- Provider outage/quota/rate limit/latency spike/malformed output.
- Local model unavailable or OOM without violating privacy on fallback.
- Metered/offline network and battery/thermal constraints.
- Plan downgrade or allowance exhaustion mid-mission.
- Model removed/deprecated.
- LOCAL_ONLY data cloud-route attempt.
- Cheap model wrong then verifier escalates.
- Two providers race; loser cancellation/cost.
- Cache invalidation after dependency change.
- Council activates only when justified.

Also add invalid/malformed input; permission denied/revoked authority; authentication/session expiry where applicable; offline/network loss; provider/dependency outage; rate/quota exhaustion; cancellation/timeout; retry/duplicate delivery; partial success; concurrency/races; stale state/version mismatch; data corruption/recovery; cross-user/workspace isolation; weak-device behavior; privacy/locality violations; observability/evidence correctness; upgrade/migration/rollback behavior.

==================================================
PERFORMANCE / COST / WEAK-DEVICE REQUIREMENTS
==================================================

Define measurable budgets instead of vague “fast” claims. Where relevant measure startup, p50/p95/p99 latency, memory, CPU/GPU/NPU, network, storage, battery/thermal impact, model/tool/provider cost, concurrency, cache behavior, and failure/retry amplification.

Heavy intelligence may run remotely; weak devices must still be able to control/participate through the smallest trustworthy local surface possible.

==================================================
SECURITY / PRIVACY REQUIREMENTS
==================================================

Apply least privilege and defense in depth. Treat external content as untrusted. Never expose secrets in source, logs, prompts, evidence, fixtures, or final reports. Respect account/workspace/project boundaries. Record sensitive data flows/locality. Bind consequential actions to exact authority. Do not allow extension/agent/model/tool self-escalation. Include abuse/resource-exhaustion and denial-of-wallet considerations.

==================================================
RESEARCH DELIVERABLE
==================================================

Create an architecture-research record listing primary sources/specifications consulted, serious alternatives considered, why the chosen approach won, what remains uncertain, and what should be re-evaluated when the real HEY repository is available. Research enough to make current choices strong, then implement.


==================================================
FINAL RESPONSE REQUIRED
==================================================

Do not give a vague summary. Report:
1. Package created.
2. Exact files/directories created or modified.
3. Architecture implemented.
4. Public contracts/APIs/events exported.
5. Persistence/schema work.
6. Dependencies and installation requirements.
7. Tests executed with exact outcomes.
8. Failure/security/adversarial tests with exact outcomes.
9. Performance/weak-device/offline findings where applicable.
10. Remaining limitations.
11. Future integration tasks for Claude Code.
12. External blockers only.
13. Every UNVERIFIED item.
14. Evidence supporting each completion/maturity claim.

Do not claim the integrated HEY product is production-ready. This package can only be called internally verified to the extent its own tests and evidence prove.



==============================================================================================================

HEY PROMPT 39/47 — Evaluation, QA, Red Team, Evidence & Anti-Fake-Done

You are the principal production engineer for HEY responsible for: Evaluation, QA, Red Team, Evidence & Anti-Fake-Done.

Create the production-grade integration-ready package:

`HEY-NEXT/39-evaluation-qa/`

PACKAGE OWNERSHIP
Own HEY's independent quality/evidence system: executable requirements, evals, red-team/failure injection, golden journeys, evidence freshness, release gates and structural enforcement preventing incomplete work from being declared finished.

DEPENDENCY INTENT
This package conceptually depends on: All packages; independent evidence/verification infrastructure.
Because every Codex task is isolated and other package outputs may not be physically available, do not invent competing global systems. Use minimal clearly-labelled temporary mirrors only when compilation/testing requires them.


==================================================
ABSOLUTE FINAL PRODUCT CONTRACT — NON-NEGOTIABLE
==================================================

This is FINAL-PRODUCT engineering, not ideation, an MVP, a prototype, a demo, a mockup, a proof of concept, or a partial feature pass.

Forbidden:
- MVP shortcuts or knowingly incomplete production paths
- placeholders, fake-success states, dead buttons, disconnected screens, mock-backed “working” behavior, TODO-driven completion claims, or silent deferral of hard requirements
- frontend-only, backend-only, schema-only, or test-only completion claims
- a new duplicate global architecture when a canonical HEY contract already exists
- assuming code exists means behavior is integrated, verified, secure, recoverable, observable, accessible, performant, or production-ready
- replacing a stronger future-existing HEY implementation merely because this package differs
- inventing details about the unavailable real HEY repository
- claiming platform capabilities the platform does not expose
- claiming successful side effects without independent postcondition verification

For every applicable capability, the completion pipeline is:
discovery -> current research -> explicit requirements -> architecture -> implementation -> contracts -> data/state -> permissions/authentication/authorization boundaries -> privacy/security -> integration seams -> failure handling -> retry/timeout/cancellation -> recovery/rollback/compensation -> offline/degraded behavior -> weak-device behavior -> performance/cost controls -> observability/auditability -> accessibility/localization readiness -> unit tests -> integration tests -> adversarial/failure tests -> realistic end-to-end tests -> independent verification -> evidence.

If you discover a fixable defect inside this package, FIX IT. Discovery creates work; it is not a reason to stop.

Use the maturity ladder:
MISSING -> DESIGNED -> IMPLEMENTING -> FUNCTIONAL -> INTEGRATED -> VERIFIED -> PRODUCTION_READY.

PRODUCTION_READY requires current, reproducible evidence. Evidence becomes stale when affected implementation, dependencies, policy, environment, tests, schemas, contracts, or providers change.

Never use “confirmed: true”, “approved: true”, UI state, model output, retrieved content, or client-supplied claims as sufficient authority for consequential actions.

Every consequential action must be attributable to the human/service actor, the executing component/device/tool, the exact authority used, the exact target/parameters, the result, verification evidence, cost where relevant, and rollback/compensation status where applicable.

==================================================
SOURCE / INTEGRATION AUTHORITY
==================================================

The newest real HEY codebase is currently unavailable.

Therefore:
1. Build a production-grade, interface-stable, integration-ready HEY-NEXT package.
2. Do not invent the current repository structure, existing tables, current routes, current providers, or current implementations.
3. Clearly separate VERIFIED package behavior from UNVERIFIED future-integration assumptions.
4. If you need a shared contract from another HEY-NEXT package that is not physically present, create only a minimal TEMPORARY CONTRACT MIRROR and label it exactly:
   TEMPORARY CONTRACT MIRROR — MUST BE RECONCILED WITH CANONICAL HEY CONTRACT DURING INTEGRATION.
5. Do not create a competing identity, permission, event, mission, Cosmos, provider, device, artifact, or evidence system simply because the canonical package is unavailable.
6. Every external dependency, service, environment variable, database requirement, native entitlement, build requirement, model/runtime requirement, and installation step must be recorded for Claude Code in DEPENDENCIES.md and INTEGRATION_MANIFEST.md.
7. Future Claude Code integration must inspect the real HEY implementation first, preserve unique stronger behavior, migrate/consolidate safely, wire all layers, run regression/adversarial tests, and retire obsolete duplicates only after evidence.
8. Never destructively assume that HEY-NEXT automatically supersedes existing production code.

==================================================
GLOBAL HEY LAWS
==================================================

HEY is one intelligence, not a visible pile of disconnected bots.

All surfaces eventually share canonical identity, missions, permissions, policies, Cosmos, agents, tools, models, devices, artifacts, receipts, evidence, events, context, and user preferences.

HEY is provider-independent and device-independent.

Prefer, when suitable:
deterministic code/rules/cache/algorithms -> tiny classifiers/micro-models -> local/small models -> cheap strong cloud models -> specialist models -> frontier models -> multi-agent councils only when measured value justifies them.

HEY must work across web/PWA, Android, iOS/iPadOS within platform limits, Windows, macOS, Linux, tablets/phones/desktops, very weak devices, remote/cloud runtimes, local/self-hosted runtimes, and future device adapters.

Ultra-light device law:
The intelligence does not need to live on the device. The device needs only the smallest trusted local runtime necessary to expose supported capabilities, enforce authority, access permitted resources, execute typed actions, verify postconditions, and communicate securely.

Device classes:
CLASS 0 LEGACY TERMINAL — interaction/gateway only when local OS capabilities are unavailable.
CLASS 1 HEY EDGE — tiny deterministic action runtime, no LLM required.
CLASS 2 HEY EDGE+ — adds lightweight local intent/search/speech/classification where viable.
CLASS 3 FULL LOCAL HEY — can run local reasoning/vision/speech/agents/creation when hardware allows.

Offline is a core requirement. Every capability must truthfully declare its local/cloud/offline behavior and degrade explicitly.

No hidden dark patterns, coercion, fake scarcity, deceptive sponsorship influence, or addiction-maximizing mechanics. Psychology may optimize trust, clarity, motivation, reduced cognitive load, commitment, salience, legitimate social proof, reversible defaults, and attention efficiency.

Minors are supported. Build age-aware boundaries, not surveillance assumptions.

==================================================
BASE CONTRACT COMPATIBILITY
==================================================

Design against the intent of Prompt 01 Global Foundation and Prompt 02 Identity/Accounts/Device Trust:
- typed versioned contracts
- durable mission lifecycle
- canonical events/errors/receipts/evidence
- action-bound authorization
- device identity/trust
- workspace/account separation
- local/cloud classifications
- privacy classifications
- capability maturity
- independent verification

If those package files are absent, mirror only what is essential and flag reconciliation work.

==================================================
DEPENDENCY + INTEGRATION DISCIPLINE
==================================================

For every library/service/runtime:
record purpose, version strategy, license, security considerations, platform support, install command, optional/mandatory status, alternatives considered, and future migration cost.

INTEGRATION_MANIFEST.md must state:
- what this package owns and deliberately does NOT own
- contracts consumed/exported
- APIs/events emitted/consumed
- storage/schema requirements
- environment variables/secrets as names only
- dependencies/install steps
- web/backend/native/Edge wiring
- likely conflicts/duplicates Claude must inspect
- migration order/data migration/rollback
- post-integration tests
- capability maturity/evidence requirements
- unknowns requiring the real HEY repository

==================================================
RESEARCH STANDARD
==================================================

Where current research access exists, use current primary/authoritative sources first: official specifications, standards bodies, platform documentation, original technical papers, official provider/runtime docs, and maintained project documentation.

Compare alternatives on correctness, interoperability, security, privacy, platform reach, weak-device cost, latency, memory, battery, licensing, maintainability, vendor lock-in, ecosystem maturity, observability, testability, and migration risk. Record major accepted/rejected decisions.

==================================================
FINAL SELF-ATTACK
==================================================

Before completion, run a hostile self-review designed to prove your package is partial, insecure, duplicated, misleading, too heavyweight, provider-locked, platform-faked, difficult to integrate, or impossible to recover.

At minimum ask:
- Can a model/tool/retrieved document escalate authority?
- Can another user/workspace/device receive data or capability accidentally?
- Can retries duplicate side effects?
- Can cancellation still allow later side effects?
- Can “success” occur without verified postconditions?
- Can stale evidence remain valid?
- What happens offline, on weak hardware, under rate limits, after auth expiry, during provider outage, on corrupted state, and during partial success?
- Does this package duplicate a global HEY concern?
- Are mocks/test adapters clearly impossible to confuse with production?
- Are all install/migration/wiring steps written down?
- Is anything labelled complete that cannot actually be proven without the real HEY repository?

Fix every reproducible defect. Mark remaining codebase-dependent claims UNVERIFIED.


==================================================
MANDATORY CAPABILITIES / ARCHITECTURE
==================================================

Build, specify, test, and document at least all of the following. This is a floor, not a ceiling. Add any missing capability, state, edge case, contract, verifier, recovery path, performance mechanism, security boundary, migration concern, or test required to make this subsystem genuinely production-grade.

- Requirement registry mapping requirement -> implementation -> tests -> evidence -> maturity.
- Evidence record with requirement/test/source fingerprint/environment/platform/steps/timestamp/result/artifact/verifier/expiry/dependencies.
- Evidence invalidation after code/dependency/schema/prompt/model/environment/policy/test changes.
- Machine-readable Definition of Done/dependency closure.
- Independent verifier identity/context.
- Golden journeys for memory, creation, research, computer use, voice, proactivity, offline, weak hardware, cross-device, organization, minors, permissions, recovery, billing, marketplace.
- Unit/integration/E2E/property/fuzz/mutation/metamorphic/visual/voice/trajectory tests as applicable.
- Failure injection for provider/network/DB/auth/device/queue/storage corruption/quota/timeout/cancel/concurrency/out-of-order/duplicate events.
- Security adversarial suite.
- Agent efficiency evaluation.
- Judge calibration/multi-judge only when useful.
- Human-gold and hidden holdout sets.
- Cross-language/device/user-cohort/accessibility quality tests.
- Long-horizon pause/resume.
- Verification false-positive tests.
- Structural lints for fake success, mock leakage, permission bypass, duplicate global systems, dead features, stale docs/contracts.
- Evidence-based release confidence.
- Audit artifact privacy.
- Regression corpus from every serious failure.

==================================================
DATA, CONTRACTS, EVENTS, STATE & API REQUIREMENTS
==================================================

For this subsystem:
- define stable typed public interfaces and versioned schemas
- define lifecycle/state machines wherever state exists
- define IDs, timestamps, ownership, workspace/account scope, provenance, privacy classification, locality, version, status, and evidence links where applicable
- define commands/queries/events separately where that improves safety
- define idempotency semantics for every retryable write or side effect
- define optimistic/concurrent update behavior and conflict policy
- define retention/deletion/export/migration behavior for persisted data
- define compatibility/version negotiation where multiple devices/services/clients may be on different versions
- define errors using the canonical HEY error/recovery model rather than ad-hoc strings
- define observability hooks and audit events without leaking secrets/private content
- define integration boundaries with Identity, Trust Kernel, Mission Runtime, Brain, Cosmos, Situation, Tool/Action Fabric, Device Mesh, Edge, Artifacts, Billing, Privacy, Security, Evaluation, and Release systems wherever applicable
- never make a model response itself authoritative state

==================================================
IMPLEMENTATION STANDARD
==================================================

Do not only write Markdown.

Create working libraries/modules/reference services/schemas/validators/state machines/adapters/test harnesses where this package can be implemented independently.

When a real external service, provider credential, operating-system entitlement, physical device, production database, signing identity, or unavailable HEY subsystem is required, implement:
1. the production contract/interface,
2. a clearly-labelled test adapter/fixture,
3. exact integration/install/config requirements,
4. tests for the contract,
5. UNVERIFIED status for the real integration.

Test adapters must be structurally impossible to mistake for production paths. Use feature detection and capability negotiation rather than platform assumptions.

==================================================
PACKAGE STRUCTURE
==================================================

At minimum create:

HEY-NEXT/39-evaluation-qa/
README.md
ARCHITECTURE.md
DOMAIN-CONTRACTS.md
DATA-AND-STATE.md
SECURITY-PRIVACY.md
OFFLINE-WEAK-DEVICE.md
OBSERVABILITY.md
DEPENDENCIES.md
ASSUMPTIONS.md
LIMITATIONS.md
INTEGRATION_MANIFEST.md
MIGRATION_PLAN.md
EVIDENCE.md
src/
schemas/
tests/
integration-tests/
adversarial-tests/
fixtures/
docs/

Add domain-specific directories/files when useful.

==================================================
DOMAIN-SPECIFIC TEST FLOOR
==================================================

At minimum include tests for:

- Stale evidence after dependency change.
- Builder/verifier shared wrong assumption.
- Mock passes with no production adapter.
- Route exists but no execution path.
- Visual E2E passes while side effect fails.
- Privacy leak.
- Offline/weak-device regression.
- Verifier fooled by self-report.
- Long mission resumes after deploy.
- Evidence contains secret.

Also add invalid/malformed input; permission denied/revoked authority; authentication/session expiry where applicable; offline/network loss; provider/dependency outage; rate/quota exhaustion; cancellation/timeout; retry/duplicate delivery; partial success; concurrency/races; stale state/version mismatch; data corruption/recovery; cross-user/workspace isolation; weak-device behavior; privacy/locality violations; observability/evidence correctness; upgrade/migration/rollback behavior.

==================================================
PERFORMANCE / COST / WEAK-DEVICE REQUIREMENTS
==================================================

Define measurable budgets instead of vague “fast” claims. Where relevant measure startup, p50/p95/p99 latency, memory, CPU/GPU/NPU, network, storage, battery/thermal impact, model/tool/provider cost, concurrency, cache behavior, and failure/retry amplification.

Heavy intelligence may run remotely; weak devices must still be able to control/participate through the smallest trustworthy local surface possible.

==================================================
SECURITY / PRIVACY REQUIREMENTS
==================================================

Apply least privilege and defense in depth. Treat external content as untrusted. Never expose secrets in source, logs, prompts, evidence, fixtures, or final reports. Respect account/workspace/project boundaries. Record sensitive data flows/locality. Bind consequential actions to exact authority. Do not allow extension/agent/model/tool self-escalation. Include abuse/resource-exhaustion and denial-of-wallet considerations.

==================================================
RESEARCH DELIVERABLE
==================================================

Create an architecture-research record listing primary sources/specifications consulted, serious alternatives considered, why the chosen approach won, what remains uncertain, and what should be re-evaluated when the real HEY repository is available. Research enough to make current choices strong, then implement.


==================================================
FINAL RESPONSE REQUIRED
==================================================

Do not give a vague summary. Report:
1. Package created.
2. Exact files/directories created or modified.
3. Architecture implemented.
4. Public contracts/APIs/events exported.
5. Persistence/schema work.
6. Dependencies and installation requirements.
7. Tests executed with exact outcomes.
8. Failure/security/adversarial tests with exact outcomes.
9. Performance/weak-device/offline findings where applicable.
10. Remaining limitations.
11. Future integration tasks for Claude Code.
12. External blockers only.
13. Every UNVERIFIED item.
14. Evidence supporting each completion/maturity claim.

Do not claim the integrated HEY product is production-ready. This package can only be called internally verified to the extent its own tests and evidence prove.



==============================================================================================================

HEY PROMPT 42/47 — Platform & Native Adapters: PWA, Android, iOS, Windows, macOS, Linux, Wearables & Future Surfaces

You are the principal production engineer for HEY responsible for: Platform & Native Adapters: PWA, Android, iOS, Windows, macOS, Linux, Wearables & Future Surfaces.

Create the production-grade integration-ready package:

`HEY-NEXT/42-platform-native-adapters/`

PACKAGE OWNERSHIP
Own HEY's platform adaptation layer: truthful outcome parity where possible, explicit differences where not, and native bridges/adapters connecting canonical HEY operations to each OS without duplicating HEY Brain.

DEPENDENCY INTENT
This package conceptually depends on: Edge, Device Mesh, Trust, Identity, Mission and global contracts.
Because every Codex task is isolated and other package outputs may not be physically available, do not invent competing global systems. Use minimal clearly-labelled temporary mirrors only when compilation/testing requires them.


==================================================
ABSOLUTE FINAL PRODUCT CONTRACT — NON-NEGOTIABLE
==================================================

This is FINAL-PRODUCT engineering, not ideation, an MVP, a prototype, a demo, a mockup, a proof of concept, or a partial feature pass.

Forbidden:
- MVP shortcuts or knowingly incomplete production paths
- placeholders, fake-success states, dead buttons, disconnected screens, mock-backed “working” behavior, TODO-driven completion claims, or silent deferral of hard requirements
- frontend-only, backend-only, schema-only, or test-only completion claims
- a new duplicate global architecture when a canonical HEY contract already exists
- assuming code exists means behavior is integrated, verified, secure, recoverable, observable, accessible, performant, or production-ready
- replacing a stronger future-existing HEY implementation merely because this package differs
- inventing details about the unavailable real HEY repository
- claiming platform capabilities the platform does not expose
- claiming successful side effects without independent postcondition verification

For every applicable capability, the completion pipeline is:
discovery -> current research -> explicit requirements -> architecture -> implementation -> contracts -> data/state -> permissions/authentication/authorization boundaries -> privacy/security -> integration seams -> failure handling -> retry/timeout/cancellation -> recovery/rollback/compensation -> offline/degraded behavior -> weak-device behavior -> performance/cost controls -> observability/auditability -> accessibility/localization readiness -> unit tests -> integration tests -> adversarial/failure tests -> realistic end-to-end tests -> independent verification -> evidence.

If you discover a fixable defect inside this package, FIX IT. Discovery creates work; it is not a reason to stop.

Use the maturity ladder:
MISSING -> DESIGNED -> IMPLEMENTING -> FUNCTIONAL -> INTEGRATED -> VERIFIED -> PRODUCTION_READY.

PRODUCTION_READY requires current, reproducible evidence. Evidence becomes stale when affected implementation, dependencies, policy, environment, tests, schemas, contracts, or providers change.

Never use “confirmed: true”, “approved: true”, UI state, model output, retrieved content, or client-supplied claims as sufficient authority for consequential actions.

Every consequential action must be attributable to the human/service actor, the executing component/device/tool, the exact authority used, the exact target/parameters, the result, verification evidence, cost where relevant, and rollback/compensation status where applicable.

==================================================
SOURCE / INTEGRATION AUTHORITY
==================================================

The newest real HEY codebase is currently unavailable.

Therefore:
1. Build a production-grade, interface-stable, integration-ready HEY-NEXT package.
2. Do not invent the current repository structure, existing tables, current routes, current providers, or current implementations.
3. Clearly separate VERIFIED package behavior from UNVERIFIED future-integration assumptions.
4. If you need a shared contract from another HEY-NEXT package that is not physically present, create only a minimal TEMPORARY CONTRACT MIRROR and label it exactly:
   TEMPORARY CONTRACT MIRROR — MUST BE RECONCILED WITH CANONICAL HEY CONTRACT DURING INTEGRATION.
5. Do not create a competing identity, permission, event, mission, Cosmos, provider, device, artifact, or evidence system simply because the canonical package is unavailable.
6. Every external dependency, service, environment variable, database requirement, native entitlement, build requirement, model/runtime requirement, and installation step must be recorded for Claude Code in DEPENDENCIES.md and INTEGRATION_MANIFEST.md.
7. Future Claude Code integration must inspect the real HEY implementation first, preserve unique stronger behavior, migrate/consolidate safely, wire all layers, run regression/adversarial tests, and retire obsolete duplicates only after evidence.
8. Never destructively assume that HEY-NEXT automatically supersedes existing production code.

==================================================
GLOBAL HEY LAWS
==================================================

HEY is one intelligence, not a visible pile of disconnected bots.

All surfaces eventually share canonical identity, missions, permissions, policies, Cosmos, agents, tools, models, devices, artifacts, receipts, evidence, events, context, and user preferences.

HEY is provider-independent and device-independent.

Prefer, when suitable:
deterministic code/rules/cache/algorithms -> tiny classifiers/micro-models -> local/small models -> cheap strong cloud models -> specialist models -> frontier models -> multi-agent councils only when measured value justifies them.

HEY must work across web/PWA, Android, iOS/iPadOS within platform limits, Windows, macOS, Linux, tablets/phones/desktops, very weak devices, remote/cloud runtimes, local/self-hosted runtimes, and future device adapters.

Ultra-light device law:
The intelligence does not need to live on the device. The device needs only the smallest trusted local runtime necessary to expose supported capabilities, enforce authority, access permitted resources, execute typed actions, verify postconditions, and communicate securely.

Device classes:
CLASS 0 LEGACY TERMINAL — interaction/gateway only when local OS capabilities are unavailable.
CLASS 1 HEY EDGE — tiny deterministic action runtime, no LLM required.
CLASS 2 HEY EDGE+ — adds lightweight local intent/search/speech/classification where viable.
CLASS 3 FULL LOCAL HEY — can run local reasoning/vision/speech/agents/creation when hardware allows.

Offline is a core requirement. Every capability must truthfully declare its local/cloud/offline behavior and degrade explicitly.

No hidden dark patterns, coercion, fake scarcity, deceptive sponsorship influence, or addiction-maximizing mechanics. Psychology may optimize trust, clarity, motivation, reduced cognitive load, commitment, salience, legitimate social proof, reversible defaults, and attention efficiency.

Minors are supported. Build age-aware boundaries, not surveillance assumptions.

==================================================
BASE CONTRACT COMPATIBILITY
==================================================

Design against the intent of Prompt 01 Global Foundation and Prompt 02 Identity/Accounts/Device Trust:
- typed versioned contracts
- durable mission lifecycle
- canonical events/errors/receipts/evidence
- action-bound authorization
- device identity/trust
- workspace/account separation
- local/cloud classifications
- privacy classifications
- capability maturity
- independent verification

If those package files are absent, mirror only what is essential and flag reconciliation work.

==================================================
DEPENDENCY + INTEGRATION DISCIPLINE
==================================================

For every library/service/runtime:
record purpose, version strategy, license, security considerations, platform support, install command, optional/mandatory status, alternatives considered, and future migration cost.

INTEGRATION_MANIFEST.md must state:
- what this package owns and deliberately does NOT own
- contracts consumed/exported
- APIs/events emitted/consumed
- storage/schema requirements
- environment variables/secrets as names only
- dependencies/install steps
- web/backend/native/Edge wiring
- likely conflicts/duplicates Claude must inspect
- migration order/data migration/rollback
- post-integration tests
- capability maturity/evidence requirements
- unknowns requiring the real HEY repository

==================================================
RESEARCH STANDARD
==================================================

Where current research access exists, use current primary/authoritative sources first: official specifications, standards bodies, platform documentation, original technical papers, official provider/runtime docs, and maintained project documentation.

Compare alternatives on correctness, interoperability, security, privacy, platform reach, weak-device cost, latency, memory, battery, licensing, maintainability, vendor lock-in, ecosystem maturity, observability, testability, and migration risk. Record major accepted/rejected decisions.

==================================================
FINAL SELF-ATTACK
==================================================

Before completion, run a hostile self-review designed to prove your package is partial, insecure, duplicated, misleading, too heavyweight, provider-locked, platform-faked, difficult to integrate, or impossible to recover.

At minimum ask:
- Can a model/tool/retrieved document escalate authority?
- Can another user/workspace/device receive data or capability accidentally?
- Can retries duplicate side effects?
- Can cancellation still allow later side effects?
- Can “success” occur without verified postconditions?
- Can stale evidence remain valid?
- What happens offline, on weak hardware, under rate limits, after auth expiry, during provider outage, on corrupted state, and during partial success?
- Does this package duplicate a global HEY concern?
- Are mocks/test adapters clearly impossible to confuse with production?
- Are all install/migration/wiring steps written down?
- Is anything labelled complete that cannot actually be proven without the real HEY repository?

Fix every reproducible defect. Mark remaining codebase-dependent claims UNVERIFIED.


==================================================
MANDATORY CAPABILITIES / ARCHITECTURE
==================================================

Build, specify, test, and document at least all of the following. This is a floor, not a ceiling. Add any missing capability, state, edge case, contract, verifier, recovery path, performance mechanism, security boundary, migration concern, or test required to make this subsystem genuinely production-grade.

- Capability matrix by platform/version/device class and runtime feature detection.
- Web/PWA install/offline shell/push/background limits/WebGPU-WASM/local storage/service-worker updates.
- Android intents/share/widgets/quick settings/notifications/files/background/accessibility opt-in/managed mode/Keystore/thermal/process death.
- iOS/iPadOS App Intents/Shortcuts/share/widgets/Live Activities/files/background limits/Keychain/Secure Enclave/handoff/offline models where viable; no fake unrestricted control.
- Windows shell/files/processes/accessibility/global shortcuts/tray/notifications/screen/secure storage.
- macOS app/files/accessibility/menu/shortcuts/keychain/signing.
- Linux distro/display-server variations.
- Tablet split panes/drag-drop/pen/keyboard.
- Wearables for approval/capture/voice/status.
- TV/shared/kiosk/public mode.
- Future AR/glasses/car/robot adapters consuming canonical command contracts.
- Platform permission translation/health.
- Native update/crash/background mission integration.
- Shared/public privacy.
- Platform-specific verification/undo.
- Hardware resource reporting.
- Distribution-compliance hooks without fake signing.
- Real-hardware test gates.

==================================================
DATA, CONTRACTS, EVENTS, STATE & API REQUIREMENTS
==================================================

For this subsystem:
- define stable typed public interfaces and versioned schemas
- define lifecycle/state machines wherever state exists
- define IDs, timestamps, ownership, workspace/account scope, provenance, privacy classification, locality, version, status, and evidence links where applicable
- define commands/queries/events separately where that improves safety
- define idempotency semantics for every retryable write or side effect
- define optimistic/concurrent update behavior and conflict policy
- define retention/deletion/export/migration behavior for persisted data
- define compatibility/version negotiation where multiple devices/services/clients may be on different versions
- define errors using the canonical HEY error/recovery model rather than ad-hoc strings
- define observability hooks and audit events without leaking secrets/private content
- define integration boundaries with Identity, Trust Kernel, Mission Runtime, Brain, Cosmos, Situation, Tool/Action Fabric, Device Mesh, Edge, Artifacts, Billing, Privacy, Security, Evaluation, and Release systems wherever applicable
- never make a model response itself authoritative state

==================================================
IMPLEMENTATION STANDARD
==================================================

Do not only write Markdown.

Create working libraries/modules/reference services/schemas/validators/state machines/adapters/test harnesses where this package can be implemented independently.

When a real external service, provider credential, operating-system entitlement, physical device, production database, signing identity, or unavailable HEY subsystem is required, implement:
1. the production contract/interface,
2. a clearly-labelled test adapter/fixture,
3. exact integration/install/config requirements,
4. tests for the contract,
5. UNVERIFIED status for the real integration.

Test adapters must be structurally impossible to mistake for production paths. Use feature detection and capability negotiation rather than platform assumptions.

==================================================
PACKAGE STRUCTURE
==================================================

At minimum create:

HEY-NEXT/42-platform-native-adapters/
README.md
ARCHITECTURE.md
DOMAIN-CONTRACTS.md
DATA-AND-STATE.md
SECURITY-PRIVACY.md
OFFLINE-WEAK-DEVICE.md
OBSERVABILITY.md
DEPENDENCIES.md
ASSUMPTIONS.md
LIMITATIONS.md
INTEGRATION_MANIFEST.md
MIGRATION_PLAN.md
EVIDENCE.md
src/
schemas/
tests/
integration-tests/
adversarial-tests/
fixtures/
docs/

Add domain-specific directories/files when useful.

==================================================
DOMAIN-SPECIFIC TEST FLOOR
==================================================

At minimum include tests for:

- Unsupported capability honest fallback.
- Android process death.
- iOS background restriction.
- Desktop accessibility permission revoke.
- PWA eviction/update.
- Linux environment mismatch.
- Shared TV privacy.
- Tablet pen/accessibility.
- Native helper version skew.
- Unavailable hardware remains UNVERIFIED.

Also add invalid/malformed input; permission denied/revoked authority; authentication/session expiry where applicable; offline/network loss; provider/dependency outage; rate/quota exhaustion; cancellation/timeout; retry/duplicate delivery; partial success; concurrency/races; stale state/version mismatch; data corruption/recovery; cross-user/workspace isolation; weak-device behavior; privacy/locality violations; observability/evidence correctness; upgrade/migration/rollback behavior.

==================================================
PERFORMANCE / COST / WEAK-DEVICE REQUIREMENTS
==================================================

Define measurable budgets instead of vague “fast” claims. Where relevant measure startup, p50/p95/p99 latency, memory, CPU/GPU/NPU, network, storage, battery/thermal impact, model/tool/provider cost, concurrency, cache behavior, and failure/retry amplification.

Heavy intelligence may run remotely; weak devices must still be able to control/participate through the smallest trustworthy local surface possible.

==================================================
SECURITY / PRIVACY REQUIREMENTS
==================================================

Apply least privilege and defense in depth. Treat external content as untrusted. Never expose secrets in source, logs, prompts, evidence, fixtures, or final reports. Respect account/workspace/project boundaries. Record sensitive data flows/locality. Bind consequential actions to exact authority. Do not allow extension/agent/model/tool self-escalation. Include abuse/resource-exhaustion and denial-of-wallet considerations.

==================================================
RESEARCH DELIVERABLE
==================================================

Create an architecture-research record listing primary sources/specifications consulted, serious alternatives considered, why the chosen approach won, what remains uncertain, and what should be re-evaluated when the real HEY repository is available. Research enough to make current choices strong, then implement.


==================================================
FINAL RESPONSE REQUIRED
==================================================

Do not give a vague summary. Report:
1. Package created.
2. Exact files/directories created or modified.
3. Architecture implemented.
4. Public contracts/APIs/events exported.
5. Persistence/schema work.
6. Dependencies and installation requirements.
7. Tests executed with exact outcomes.
8. Failure/security/adversarial tests with exact outcomes.
9. Performance/weak-device/offline findings where applicable.
10. Remaining limitations.
11. Future integration tasks for Claude Code.
12. External blockers only.
13. Every UNVERIFIED item.
14. Evidence supporting each completion/maturity claim.

Do not claim the integrated HEY product is production-ready. This package can only be called internally verified to the extent its own tests and evidence prove.



==============================================================================================================

## Source C: complete applicable approved refinements
The complete newer directive is in the shared Source C file. The directly applicable sections are copied below verbatim.

## 2. HEY'S FINAL PRODUCT IDENTITY

HEY is an AI Life Operating System and personal intelligence environment developed by S&A.

It combines:

- One unified AI assistant.
- Chat, Voice and Live interaction.
- Personal context and Cosmos memory.
- Intelligent tools and AI agents.
- Real computer and device control.
- Creation studios.
- User-customizable Spaces.
- Automations and proactive intelligence.
- Model selection and multi-model collaboration.
- Education and organizational experiences.
- Local/native integrations.
- An extensible capability platform.
- Rich interactive answer experiences.

The user must experience ONE HEY, even when many internal agents, models, tools, specialists and workflows participate.

The normal interface must remain approachable to people without AI or technical knowledge.

Advanced complexity is available when requested, not imposed on everyone.

## 10. HEY ONE — OUR OWN MODEL SYSTEM

We do NOT require the user's device to run the entire large AI model.

HEY's principal intelligence is hosted or distributed across suitable remote compute infrastructure.

Build HEY One around an appropriately licensed existing open-weight foundation, not giant from-scratch pretraining on a laptop.

Implement:

- Model adaptation/fine-tuning pipeline.
- Versioned model evaluations.
- Specialized adapters.
- Safe provider-independent inference interfaces.
- Hosted inference.
- Tool/structured-output reliability.
- Model profiling.
- Fast-path execution.
- Low-cost model selection.
- Efficient caching.
- Adaptive compute.
- Reliable fallback.
- Quality, speed and cost benchmarking.

HEY One should behave like one coherent intelligence even when multiple underlying systems contribute.

Our ambition is exceptional capability and speed. Do not claim HEY has trained a 400B or 10T parameter foundation without actual model artifacts and verifiable evidence.

## 12. HEY FUSION — MULTIPLE AI MODELS WORKING AS ONE

HEY must support combining multiple compatible cloud/open/local models when that improves the actual task.

Required strategies:

- One fast model for ordinary tasks.
- Small-to-strong escalation.
- Parallel independent attempts.
- Specialist model delegation.
- Planner/executor/verifier collaboration.
- Multi-model research.
- Model disagreement analysis.
- Evidence-weighted synthesis.
- Independent outcome verification.
- Provider fallback and outage handling.
- Adaptive latency and budget control.

For a difficult software task, one model may architect, another implement, another test and another challenge the design.

For research, several specialists may investigate sources and reconcile disagreements.

For simple chat, one inexpensive model should usually suffice.

The user experiences one HEY response.

Model settings should expose Auto, Local Only, Hybrid, Fusion and Manual where genuinely available.

Offer Fast, Balanced and Maximum Quality preferences.

Advanced users may inspect provider usage, costs, latency and verification details.

Fusion must not imply inaccessible proprietary model weights have been merged.

## 19. INFRASTRUCTURE CONSTRAINTS

Initial S&A infrastructure budget: approximately $25–50/month.

Prefer:

- Managed web/API hosting.
- Managed PostgreSQL/Auth.
- Protected file/object storage.
- Durable mission and job infrastructure.
- Prepaid usage-based AI inference.
- Provider-independent model routing.
- Transactional authority/policy persistence.
- Secure secret management.
- Monitoring and recovery.
- Separate development, staging and production environments.

A proposed starting allocation is $25 for Supabase Pro, $5 for Cloudflare Workers Paid, $12 for AI inference, $2/month domain reserve, and $5 contingency, subject to actual account eligibility and vendor charges.

Do not purchase services without approval.

Do not promise unrestricted expensive AI/media generation within this budget.

Payment processing must use a provider legally and operationally available to S&A; do not assume unsupported merchant accounts will work.

## 20. SECURITY AND GOVERNANCE

Maintain the canonical HEY authorization model.

Use:

- Verified user/session/device identity.
- Least privilege.
- Signed, bounded action mandates.
- Scope-bound delegated authority.
- Revocation and expiry.
- Durable transactionally correct state.
- Independent postcondition verification.
- Privacy and data isolation.
- Prompt-injection defenses.
- Secret protection.
- Recovery and rollback.
- Audit trails.
- Safe extension sandboxing.

There are three top-level S&A owner identities. Preserve the governance rules in the original specification.

No agent may grant itself additional permission or self-certify its own success.

## 21. EXACT COMPLETION PROCEDURE FOR EVERY CAPABILITY

Each worker must produce:

**A. Source coverage**
Which original sections and newer refinements define this feature?

**B. Final specification**
Exact user behavior, workflows, controls, permissions, state, errors, integrations and platform requirements.

**C. Implementation**
Actual integrated frontend, backend, data, providers and native capabilities where applicable.

**D. Verification**
Unit, integration, adversarial and genuine end-to-end tests, with real services/devices when required.

**E. Evidence**
Commit SHA, tested build, actual feature entrypoint, test results, unresolved blockers and supported platforms.

**F. Refinement**
Improve reliability, speed, usability, accessibility, security and efficiency beyond a merely basic implementation, while preserving the approved product intent.

No blank specification, registry entry, visual mock, stub, or isolated test pass may count as a completed feature.

## 22. PREVENT THE AGENTS FROM FORGETTING AGAIN

Before dispatching work, write a separate detailed specialist brief.

The brief must contain the actual relevant requirements, not just a heading such as "Complete Teacher Mode."

Maintain a versioned requirement record with source references, later amendments, implementation owners, status, code links and acceptance evidence.

Whenever a new requirement is approved, update the relevant specialist briefs and affected acceptance criteria.

Do not assume agents share conversational memory.

When agents finish a session, commit work and a durable handoff containing precise remaining tasks.

When multiple specialists overlap, preserve one canonical implementation and integrate verified changes safely.

## 23. THE FIRST EXECUTION ACTION

Immediately:

1. Check whether both original attached source documents are fully accessible.
2. Create a comprehensive indexed specification from Source A.
3. Extract the complete relevant requirements for each active worker.
4. Apply the newer requirements above with explicit precedence.
5. Identify and repair any incorrect assumptions previously made because workers lacked these requirements.
6. Redistribute corrected, self-contained assignments to the existing specialists.
7. Continue actual implementation and integration.
8. Preserve all completed verified work.
9. Verify full user journeys.
10. Maintain a truthful completion record.

If a source is inaccessible or truncated, identify exactly which document and sections are missing. Do not claim the requirements were reviewed.

**THE CENTRAL REQUIREMENT: EVERY AGENT MUST KNOW EXACTLY WHAT IT IS BUILDING.**

Do not replace specifications with feature names.

Do not mistake an agent's interpretation for the user's approved design.

Do not abandon original advanced functionality while implementing new features.

Do not stop at an MVP, superficial integration, or passing tests.

Deliver one coherent HEY containing the original vision and all approved refinements, with independently verified real functionality.

Begin applying this directive to the running engineering operation now.

## Implementation and proof requirements
Work only in your existing assigned checkout/branch. Inspect only your present implementation and preserve stronger work. Implement and wire the complete real user journey in scope; attack authorization, privacy, recovery and failure boundaries. Unit or stubbed tests are contract evidence only. Do not send secrets or claim external/native/provider behavior that was not actually exercised. Commit source changes, preserve handoff, and report exact SHA, tests, live entrypoint/output, frontend/backend/device integration evidence, unresolved blockers and next actions.
