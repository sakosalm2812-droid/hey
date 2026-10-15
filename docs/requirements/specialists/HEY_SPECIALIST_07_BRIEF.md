# Specialist 07: VoiceOS and Computer Control

Codex task: 01a14074-1024-7e32-a5c1-c134d8e204a7
Branch: codex/next-07-voiceos-control
Last known branch head: 91deee5

## Shared sources
Read the complete docs/requirements/HEY_SHARED_FOUNDATION.md and docs/requirements/HEY_SOURCE_C_RECOVERY_DIRECTIVE.md. Source A is the original detailed product specification. Source C later refines it and prevails on conflicts. Source B's relevant full subsystem prompts follow. All work applies to the existing HEY repository, not a separate package.

## Scoped implementation assignment
Wire inert proposal → identity/permission/mandate and needed approval → authorized real adapter → independent postcondition → receipt/history → safe undo/revoke. Preserve Guide/Assist/Act separation and fail closed on replay, stale identity, lost lease or unverifiable result.

## Current code facts to validate
VoiceOS understanding makes inert account-bound previews; Trust Kernel gates reversible local actions. Test-only filesystem checks are not live UI or production-authority proof.

## Source A: complete task-specific requirements
### Complete Source A document: `03_INTERACTION_PLATFORM/01_CHAT_VOICE_LIVE_UNIFIED.md`
# FILE: `03_INTERACTION_PLATFORM/01_CHAT_VOICE_LIVE_UNIFIED.md`

# Unified Chat, Voice & Live

Chat and Voice are the same canonical conversation. Voice is not a separate history. A voice turn becomes part of chat history; text and voice share project, files, active artifacts, missions and Cosmos context.

## Different answer styles, same intelligence
Chat can be structured, detailed, source-rich and artifact-heavy. Voice is shorter, more natural, interruption-friendly and spoken in smaller turns. A full transcript/result can still appear in the shared conversation. Raw microphone audio is not retained by default after processing unless the user explicitly saves it. Private Mode can avoid durable transcript/memory according to settings.

Switching `Chat → Voice → Live → Chat` must preserve context.

## Live
HEY Live can combine voice with the user's chosen screen/window/monitor/region, camera, files and project context. Guide mode explains; Assist mode helps with bounded actions; Act mode performs authorized actions and verifies results.


---

### Complete Source A document: `03_INTERACTION_PLATFORM/02_SCREEN_CAMERA_GUIDANCE_OVERLAYS.md`
# FILE: `03_INTERACTION_PLATFORM/02_SCREEN_CAMERA_GUIDANCE_OVERLAYS.md`

# Screen & Camera Guidance / Overlay System

HEY can use the screen or camera (with visible permission) to guide users through digital or physical tasks.

## Screen guidance
HEY understands UI elements, highlights the exact control, draws arrows/outlines/callouts, dims unrelated regions, numbers steps, follows moving UI targets, watches whether the step succeeded and advances only after verification. It can guide settings changes, software workflows, forms, troubleshooting and accessibility tasks.

## Camera guidance
HEY understands the live scene, identifies relevant objects, anchors arrows/labels/step markers to them, tracks them across frames and tells the user what to do next. It can assist with setup, assembly, troubleshooting and other appropriate real-world procedures.

## Spatial Guidance Graph
Both screen and camera guidance share a graph of targets, anchors, instructions, confidence and verification state. Voice can say “the button I mean is here” while the overlay highlights it.

## Privacy/security
Visible sensing indicator, instant pause/stop, selected-source controls, app exclusions, sensitive mode, raw-feed non-retention by default, prompt-injection defense for on-screen text, local vision/pose inference where viable.

## Agents
Screen Understanding, Camera Understanding, Object Detection, Object Tracking, Spatial Anchor, Guidance Planner, Overlay Renderer, Procedure Verification, Accessibility Guide, Prompt-Injection Guard, Safety/Risk.


---

### Complete Source A document: `04_SECURITY_GOVERNANCE/02_SECURITY_AUTONOMY_AND_PERMISSIONS.md`
# FILE: `04_SECURITY_GOVERNANCE/02_SECURITY_AUTONOMY_AND_PERMISSIONS.md`

# Security, Autonomy & Permissions

HEY maximizes capability while enforcing least privilege. Security lifecycle: **prevent → minimize → contain → detect → stop → recover → learn**.

Automation/workflow autonomy levels:
- Ask Every Time;
- Smart Approval (routine/reversible steps proceed, meaningful high-risk steps ask);
- Full Execution within the workflow's explicitly granted scope;
- Custom rules by app, destination, action class, budget, time and data scope.

Agents cannot grant themselves permission. Server/runtime authorization remains authoritative. Prompt/page/document content is untrusted data and cannot override user/system policy. High-impact target changes invalidate earlier approval.

Trust Center exposes microphone, camera, screen, background activity, integrations, devices, agent/workflow permissions, Cosmos privacy, local/cloud routing, once/session/timed/mission/persistent grants, Revoke All and Emergency Stop.


---

### Complete Source A document: `01_DETAILED_SYSTEM_SPECS/10_COMPLETE_PERMISSIONS_RISK_MATRIX.md`
# FILE: `01_DETAILED_SYSTEM_SPECS/10_COMPLETE_PERMISSIONS_RISK_MATRIX.md`

# Complete Permissions, Risk & Confirmation Matrix
## HEY V1 — Full-depth implementation specification

**Mission:** Apply least privilege and proportional confirmation to every HEY action.

This specification is normative for HEY V1. A feature is not complete because a page renders or an API returns. It is complete only when discovery, interaction, state, permissions, failures, recovery, verification, accessibility, observability and end-to-end behavior all work.

# 1. Scope
- Mic, camera, screen, files, browser, computer control, clipboard, terminal, messaging, payments, devices, smart home, memory, integrations.
- Once/session/timed/mission/persistent scopes and risk classes.

# 2. User experience contract
- User sees what permission is needed, why, scope, duration and revoke path.
- Low-risk repeated actions can be streamlined after explicit grant.
- High-impact actions show target/content/consequence before execution.
- Trust Center provides global view and Revoke All.

# 3. Architecture / runtime contract
- Central permission manager is authoritative; agents/tools cannot self-authorize.
- Risk engine combines action class, target sensitivity, reversibility, destination and user policy.
- Grant records include scope/expiry/source.

# 4. Required state model
- not-granted
- prompting
- granted-once
- granted-session
- granted-timed
- granted-mission
- granted-persistent
- expired
- revoked
- blocked

# 5. Failure and recovery catalog
- Permission service unavailable → fail closed.
- Grant expired mid-task → pause and request.
- Target changes after approval → invalidate approval.
- OS permission mismatch → reconcile.

# 6. Security / privacy / trust requirements
- Fail closed.
- No founder bypass.
- Secrets isolated.
- Audit sensitive grants/actions.
- Prompt-injected content cannot approve itself.

# 7. Data model / persistence
- permissions
- permission_grants
- risk_assessments
- approval_requests
- revocations
- audit_events

# 8. Events / telemetry contracts
- permission.requested
- permission.granted
- permission.expired
- action.approval.required
- action.approved
- action.blocked

# 9. Platform behavior
- Follow the strongest legitimate behavior available per platform; expose limitations honestly.

# 10. Implementation requirements
- Reuse shared HEY runtime, permissions, audit, verification, Project DNA, Pinpoint, Cosmos and error systems rather than creating isolated local logic.

# 11. Acceptance / regression tests
- Once/session/timed expiry.
- Message-send preview.
- Delete-file confirmation.
- Computer-control target-change invalidates prior confirmation.
- Revoke All halts active sensitive actions.

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

### Complete Source A document: `01_DETAILED_SYSTEM_SPECS/12_COMPLETE_EVENT_STATE_MACHINE_CONTRACTS.md`
# FILE: `01_DETAILED_SYSTEM_SPECS/12_COMPLETE_EVENT_STATE_MACHINE_CONTRACTS.md`

# Complete Event & State-Machine Contracts
## HEY V1 — Full-depth implementation specification

**Mission:** Give HEY deterministic lifecycle semantics across missions, generations, Live, permissions, Forge and artifacts.

This specification is normative for HEY V1. A feature is not complete because a page renders or an API returns. It is complete only when discovery, interaction, state, permissions, failures, recovery, verification, accessibility, observability and end-to-end behavior all work.

# 1. Scope
- Event naming/versioning, correlation IDs, idempotency, ordering, replay safety, state transitions.
- Mission, Task, Workflow, Generation, Artifact, Live, Permission, Forge, Device Handoff state machines.

# 2. User experience contract
- UI state must derive from canonical lifecycle, not ad-hoc booleans.
- Progress labels correspond to real states.
- Cancel/pause/resume behavior is consistent.

# 3. Architecture / runtime contract
- Events include schema version, actor, timestamp, correlation/causation IDs, project/user scope.
- State transitions validated server/runtime-side.
- Idempotent handlers for retries.
- Dead-letter/failed-event visibility in diagnostics.

# 4. Required state model
- created
- queued
- running
- waiting-user
- waiting-resource
- paused
- verifying
- completed
- partially-completed
- failed
- cancelled
- recovering

# 5. Failure and recovery catalog
- Duplicate event → idempotent no-op.
- Out-of-order event → reject/defer.
- Crash mid-transition → recover from durable state.
- Invalid transition → diagnostics alert.

# 6. Security / privacy / trust requirements
- Events must not contain secrets/raw sensitive context unnecessarily.
- Audit security-relevant transitions.

# 7. Data model / persistence
- events
- state_snapshots
- transition_history
- correlation_context
- dead_letters

# 8. Events / telemetry contracts
- hey.input.received
- intent.resolved
- mission.*
- task.*
- workflow.*
- tool.*
- permission.*
- artifact.*
- generation.*
- memory.*
- device.*
- live.*
- provider.*
- security.alert

# 9. Platform behavior
- Follow the strongest legitimate behavior available per platform; expose limitations honestly.

# 10. Implementation requirements
- Reuse shared HEY runtime, permissions, audit, verification, Project DNA, Pinpoint, Cosmos and error systems rather than creating isolated local logic.

# 11. Acceptance / regression tests
- Retry duplicate command.
- Crash/restart during generation.
- Cancel during verify.
- Permission wait/resume.
- Event schema backward compatibility.

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

### Complete Source A subsection: `## 10. Tools, tasks, workflows, execution, and quality` (`01_DETAILED_SYSTEM_SPECS/MASTER_CAPABILITY_ARCHITECTURE_DETAIL.md`)
## 10. Tools, tasks, workflows, execution, and quality

-   HEY should use capability/tool registries rather than ad hoc direct
    execution.

-   Tool execution must pass centralized authorization.

-   Execution requires normalized errors, cancellation, retries,
    verification hooks, recovery hooks, history, terminal states, and
    maximum-step controls.

-   Tasks are first-class: status, priority, dependencies,
    workflow/parent relationships, progress, attempts/maxAttempts,
    pause/block/cancel/queue, filters, runnable selection, and stats.

-   Workflows are first-class: lifecycle, per-step state, progress,
    cancellation/resume, handler resolution, confirmations,
    continue-on-error policy, verification, and auditing.

-   Quality Engine evaluates response quality, plans, agent results, and
    execution results; checks internal leaks/filler/unsupported
    claims/context alignment/risk tone; supports grades and regeneration
    thresholds.

## Source B: complete applicable Master Build Program prompts
Apply each exact step prompt to the real repository with Source A/C precedence; do not produce standalone HEY-NEXT packages.

HEY PROMPT 03/47 — Trust Kernel, Authorization, Permissions & Action Mandates

You are the principal production engineer for HEY responsible for: Trust Kernel, Authorization, Permissions & Action Mandates.

Create the production-grade integration-ready package:

`HEY-NEXT/03-trust-kernel-authorization/`

PACKAGE OWNERSHIP
Own HEY's single canonical authorization and policy-enforcement layer. It consumes identity/device/session facts and decides whether an exact actor may perform an exact consequential action in an exact context. It must not recreate authentication.

DEPENDENCY INTENT
This package conceptually depends on: Prompt 01 Global Foundation + Prompt 02 Identity/Accounts/Device Trust.
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

- Canonical Trust Kernel service and portable policy evaluator.
- Action Mandates bound to actor, user, session, device, environment, mission, workflow step, operation, exact target, normalized parameter digest, scope, risk, policy version, issue/expiry, replay rules, maximum uses, cost ceiling, privacy/locality constraints, required verification/rollback, approval evidence, delegation parent, and revocation state.
- Permission scopes for files, apps, browser origins, devices, sensors, communications, purchases, secrets, Cosmos, organization resources, extensions, models/tools, and future capabilities.
- Approval modes: Ask Every Time, Smart Approval, Full Execution within bounded rules, and Custom Rules; never translate these into blanket authority.
- Policy precedence across safety/security invariants, legal/regulatory restrictions, organization/workspace rules, Personal Constitution, mission constraints, and temporary preferences.
- Capability-based authorization and least privilege. Child agents/tools/extensions/automations/external agents inherit no more authority than explicitly delegated.
- Revocation propagation across sessions, devices, missions, queued work, offline caches, automations, extensions, and remote Edge nodes.
- Offline authority leases with strict expiry/scope and fail-closed behavior for high-risk operations.
- Step-up requirements based on risk/authentication strength without owning authentication.
- Policy simulation explaining ALLOW, DENY, REQUIRE_APPROVAL, REQUIRE_STEP_UP, LIMIT, or BLOCKED_BY_PLATFORM decisions.
- Permission-diff contracts for install/update of apps/extensions/devices.
- Audit/receipt integration showing why authority existed and which policy won.
- Confused-deputy defenses, deputy identity preservation, tenant/workspace isolation, and no agent impersonation.
- Authorization caching with invalidation on policy/membership/device/session/revocation changes.
- Policy-as-code schema, validation, versioning, migration, tests, rollback, and Trust Center inspection hooks.

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

HEY-NEXT/03-trust-kernel-authorization/
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

- Wrong actor/session/device/workspace/environment/mission/step/target/parameter digest.
- Expired/revoked/replayed/overused mandates and stale policy versions.
- Delegation escalation, sibling-agent privilege theft, extension escalation, prompt/tool-output injection.
- Offline lease expiry and revocation discovered after reconnect.
- Concurrent use/replay races and idempotency.
- Policy precedence conflicts and personal/workspace boundaries.
- High-risk action without step-up; low-risk action overblocked.
- Revoked permission still queued or executing.

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

HEY PROMPT 08/47 — Tool & Action Fabric, Universal Command Protocol and Verification

You are the principal production engineer for HEY responsible for: Tool & Action Fabric, Universal Command Protocol and Verification.

Create the production-grade integration-ready package:

`HEY-NEXT/08-tool-action-fabric/`

PACKAGE OWNERSHIP
Own the canonical Tool/Action Fabric connecting HEY intelligence to real side effects across APIs, files, browsers, OSs, devices, services, and future adapters with exact authority, typed validation, idempotency, verification, receipts, and compensation.

DEPENDENCY INTENT
This package conceptually depends on: Prompts 01-07.
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

- Universal Operation schema: ID/version, actor, mission/step, capability, target, typed parameters, digest, risk, locality/privacy, mandate, timeout, retry class, idempotency key, expected postconditions, verifier, rollback/compensation, cost.
- Capability registry with schemas, platforms, side-effect class, required permissions, risk, observability, version, health, rate limits, tests.
- Execution hierarchy: API/protocol first, filesystem/CLI/DOM/accessibility next, pixel/vision fallback where suitable.
- Preflight validation of capability, parameters, authority, target freshness, budget and platform.
- Idempotent execution and duplicate-delivery safety.
- Postcondition verification separate from executor self-report.
- Compensating action and Universal Undo hooks.
- Action receipts with data access, exact changes, cost, verifier, device/tool/provider and rollback status.
- Dry-run/simulation mode where meaningful.
- Sandboxing, network/filesystem boundaries, Secret Broker integration.
- Tool versioning/compatibility, health, circuit breakers, backpressure, rate-limit awareness, fallbacks.
- Bulk operations with preview, chunking, per-item failure, partial success, resumability and rollback.
- Physical/high-impact action classification.
- Developer SDK foundation without owning marketplace.
- Execution playback metadata without replaying side effects.
- Outcome Cache hooks.

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

HEY-NEXT/08-tool-action-fabric/
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

- Duplicate command delivery/idempotency.
- Executor says success but state unchanged.
- Target changes between approval/execution.
- Mandate valid for A but command targets B.
- Partial bulk failure/resume.
- Timeout after side effect before response.
- Cancellation race.
- Secret/tool injection.
- Unsupported platform capability.
- Compensation failure remains visible.

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

HEY PROMPT 11/47 — Computer Use, Browser, GUI, Filesystem & OS Control

You are the principal production engineer for HEY responsible for: Computer Use, Browser, GUI, Filesystem & OS Control.

Create the production-grade integration-ready package:

`HEY-NEXT/11-computer-use/`

PACKAGE OWNERSHIP
Own HEY's computer-use stack: reliable browser/files/app/terminal/GUI/accessibility/system control using the most structured method available, with semantic/visual verification and strict side-effect controls.

DEPENDENCY INTENT
This package conceptually depends on: Prompts 01-10.
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

- Execution hierarchy official API/protocol -> CLI/filesystem -> DOM/accessibility tree -> vision/pixel fallback.
- Browser tabs/navigation/forms/downloads/uploads/sessions/multi-site missions/origin permissions/profiles/state snapshots/DOM and screenshot verification.
- GUI semantic map using stable typed targets instead of raw coordinates where possible.
- Visual fallback with confidence thresholds, action preview, dialog recovery, redesign detection.
- Filesystem read/write/create/move/copy/rename/delete/search/archive/duplicate/quarantine/bulk/restore/provenance.
- Terminal/shell scoped execution, cwd boundaries, env sanitation, output limits, timeout/cancel, secret redaction, dangerous-command policy.
- App/process launch/focus/close when platform permits, window/multi-monitor awareness.
- Clipboard and semantic history integration.
- Screen/window capture with privacy zones/prompt-injection defense.
- Accessibility-tree adapters.
- Human takeover/pause/resume.
- Recorded demonstration -> structured candidate workflow.
- Browser prompt-injection shield.
- Credential broker without raw-password exposure to models.
- Download scanning/quarantine/provenance.
- Staging/synthetic UI test harness.
- Receipts/screenshots/postcondition evidence.

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

HEY-NEXT/11-computer-use/
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

- UI redesign changes button.
- Page prompt injection.
- Purchase price changes after approval.
- Download says complete but corrupt.
- Terminal timeout after partial effect.
- Bulk deletion interrupted.
- Wrong active window prevented.
- Accessibility permission revoked.
- Browser login expires.
- Human takeover then returns control.

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

## 6. UNIVERSAL TOOL LIBRARY

HEY requires one discoverable capability library.

Someone who downloads HEY only for gestures or dictation should be able to use that capability without learning the entire assistant.

Every available tool should be searchable through plain language.

Examples:

"I want to write by speaking."
"Control my computer without touching it."
"Create a presentation."
"Build a website."
"Help me prepare my lessons."

The library should find and explain relevant capabilities.

Tools declare:

- Name, description and category.
- Compatible platforms/devices.
- Required permissions.
- Required services/models.
- Entitlement requirements.
- Configuration.
- Startup and shutdown behavior.
- Current operational state.
- Supported actions.
- Version and dependencies.
- Help/tutorial information.
- Activity and error reporting.

Provide appropriate Start, Stop, Customize, Permissions, Activity and Help interactions.

Support favorites, recent tools, recommendations, category browsing and global search.

One capability may appear in multiple categories but has ONE canonical implementation.

No fake controls or buttons that claim unsupported actions worked.

## 13. HEY EDGE — LIGHTWEIGHT LOCAL DEVICE COMPANION

HEY Edge exists to perform authorized device-side operations.

It must NOT require the complete HEY model to run locally.

Edge handles, as permitted by operating system and device:

- File access.
- Application launching.
- Window and input control.
- Clipboard operations.
- Screenshots and screen context.
- Device status.
- Native shortcuts.
- Local gesture processing.
- Local microphone/wake-word functions where appropriate.
- Computer-use execution.
- Action confirmation and postcondition checks.
- Secure communication with hosted HEY intelligence.
- Background helper lifecycle.

Requirements:

- Small footprint.
- Low idle CPU/RAM usage.
- Resource-aware execution.
- Clear permissions.
- Revocation.
- Emergency Stop.
- Secure pairing/device trust.
- No unnecessary raw audio/video retention.
- Strong privacy boundaries.
- Real OS-specific adapters.

Support the strongest legitimate methods available on Windows, macOS, Linux, Android, iOS/iPadOS and the web.

Do not pretend a browser has unrestricted native control capabilities.

## 16. VOICEOS, LIVE AND COMPUTER CONTROL

VoiceOS must support natural-language computer interaction through actual authorized device adapters.

Examples:

"Open VS Code."
"Organize these files."
"Rename this document."
"Find my presentation."
"Explain what's on my screen."

Support Guide, Assist and Act interaction levels where applicable.

Sensitive actions require correct permission and approval.

Actions must verify their real outcomes and report failures accurately.

Live interaction should allow supported screen, camera, files and voice context.

Screen guidance should highlight the actual interface element and verify progress through the task.

Voice, Chat and Live remain synchronized in one conversation.

Voice should have natural interruption, captions, real listening/thinking/speaking states, and the intended polished, deep British voice option.

Dynamic Island or compact HEY overlays must function outside the main window where supported by a real native helper, not depend solely on an open browser page.

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
