# Specialist 05: Gesture Control

Codex task: 01a14073-de07-7a90-b8bb-08faadea17bc
Branch: codex/next-05-gesture-control
Last known branch head: 8df2fe4

## Shared sources
Read the complete docs/requirements/HEY_SHARED_FOUNDATION.md and docs/requirements/HEY_SOURCE_C_RECOVERY_DIRECTIVE.md. Source A is the original detailed product specification. Source C later refines it and prevails on conflicts. Source B's relevant full subsystem prompts follow. All work applies to the existing HEY repository, not a separate package.

## Scoped implementation assignment
Wire the bundled hand detector into a standalone consent-gated Gesture Studio with calibration, handedness profiles, sensitivity/hold, mappings, pause/stop, visible camera state, false-trigger prevention and honest failures. Gesture control never bypasses high-risk authorization.

## Current code facts to validate
Branch 8df2fe4 adds a bundled MediaPipe path and consent-gated lifecycle. Runtime browser camera availability must be checked; keep real camera/device behavior unverified if unavailable.

## Source A: complete task-specific requirements
### Complete Source A document: `01_DETAILED_SYSTEM_SPECS/09_COMPLETE_PLATFORM_CAPABILITY_MATRIX.md`
# FILE: `01_DETAILED_SYSTEM_SPECS/09_COMPLETE_PLATFORM_CAPABILITY_MATRIX.md`

# Complete Platform Capability Matrix
## HEY V1 — Full-depth implementation specification

**Mission:** Define truthful, strongest-possible behavior for web, PWA, Windows, macOS, Linux, Android and iOS.

This specification is normative for HEY V1. A feature is not complete because a page renders or an API returns. It is complete only when discovery, interaction, state, permissions, failures, recovery, verification, accessibility, observability and end-to-end behavior all work.

# 1. Scope
- Chat, Voice, Live, screen/camera, computer control, background helper, Dynamic Island, notifications, files, gestures, local models, device handoff, install/update.
- Per-platform fallback behavior.

# 2. User experience contract
- UI labels unavailable capabilities honestly.
- Same conceptual feature can have platform-specific implementation.
- User sees the strongest supported fallback rather than a dead button.

# 3. Architecture / runtime contract
- Capability registry includes platform support: native/full, supported-with-limits, guided-only, unavailable.
- Runtime capability detection, not user-agent assumptions alone.
- Native helper interfaces are abstracted behind capability contracts.

# 4. Required state model
- supported
- supported-limited
- permission-required
- unsupported
- temporarily-unavailable
- degraded

# 5. Failure and recovery catalog
- OS API unavailable → fallback.
- Permission denied → guide.
- Browser restrictions → native/PWA suggestion.
- Background suspension → cloud/server durable task fallback.

# 6. Security / privacy / trust requirements
- No fake arbitrary iOS control.
- No security bypass.
- Platform permissions explicit.

# 7. Data model / persistence
- platform_capabilities
- device_capabilities
- capability_health
- permission_grants

# 8. Events / telemetry contracts
- capability.detected
- capability.unavailable
- fallback.selected
- native.helper.connected

# 9. Platform behavior
- Follow the strongest legitimate behavior available per platform; expose limitations honestly.

# 10. Implementation requirements
- Reuse shared HEY runtime, permissions, audit, verification, Project DNA, Pinpoint, Cosmos and error systems rather than creating isolated local logic.

# 11. Acceptance / regression tests
- Windows closed-window island.
- PWA install.
- Android assistant integration where supported.
- iOS fallback contracts.
- Linux/macOS background tests.

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

### Complete Source A document: `01_DETAILED_SYSTEM_SPECS/11_COMPLETE_BACKGROUND_STATE_MATRIX.md`
# FILE: `01_DETAILED_SYSTEM_SPECS/11_COMPLETE_BACKGROUND_STATE_MATRIX.md`

# Complete Background / Closed-App Runtime
## HEY V1 — Full-depth implementation specification

**Mission:** Make HEY coherent across foreground, minimized, closed-main-window, lock, termination and offline states.

This specification is normative for HEY V1. A feature is not complete because a page renders or an API returns. It is complete only when discovery, interaction, state, permissions, failures, recovery, verification, accessibility, observability and end-to-end behavior all work.

# 1. Scope
- Native helper, tray/menu bar, Dynamic Island, wake word, reminders, schedules, missions, cloud jobs, file transfers, notifications, device handoff.
- Background privacy and resource budgets.

# 2. User experience contract
- Closing window does not silently terminate HEY unless user chose that behavior.
- Visible indicator for background sensing.
- Camera/screen normally stop on close unless explicit visible background mode.
- Cloud tasks can continue after local window closes.

# 3. Architecture / runtime contract
- Native supervisor owns durable local background capabilities.
- Server scheduler owns durable cloud jobs.
- Main UI reconnects to canonical task state rather than restarting.
- Background tasks have resumable checkpoints where possible.

# 4. Required state model
- F0 foreground
- F1 unfocused
- F2 minimized
- F3 main closed/helper alive
- F4 locked
- F5 terminated
- F6 offline
- F7 remote device

# 5. Failure and recovery catalog
- Helper crash → restart/recover state.
- Network loss → queue/retry.
- OS suspends app → server durable fallback where valid.
- Task cannot run background → explicit pause.

# 6. Security / privacy / trust requirements
- Background sensing requires persistent visible indicator and consent.
- No covert camera/screen.
- Lock-screen notifications redact sensitive data.

# 7. Data model / persistence
- background_preferences
- background_jobs
- task_checkpoints
- helper_sessions
- sensing_sessions

# 8. Events / telemetry contracts
- app.backgrounded
- helper.started
- helper.stopped
- task.resumed
- sensing.paused
- window.reopened

# 9. Platform behavior
- Follow the strongest legitimate behavior available per platform; expose limitations honestly.

# 10. Implementation requirements
- Reuse shared HEY runtime, permissions, audit, verification, Project DNA, Pinpoint, Cosmos and error systems rather than creating isolated local logic.

# 11. Acceptance / regression tests
- Close main window during timer/mission.
- Lock device.
- Network drop/resume.
- Helper restart.
- Full quit stops local background surfaces.

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

### Complete Source A subsection: `# 18. Gesture Control` (`01_DETAILED_SYSTEM_SPECS/COMPLETE_CAPABILITY_CATALOG_DETAIL.md`)
# 18. Gesture Control

**Status:** `PLANNED / exact historical map unresolved`

Proposed production defaults:
- open palm → show HEY / overview
- open palm to fist → grab widget
- fist movement → move widget
- pinch → click/select
- pinch and move → precision drag
- two-hand spread → enlarge
- two-hand pinch → shrink
- swipe left/right → navigation
- swipe down → minimize
- swipe up → restore/expand
- two fingers → pause/resume
- point + pinch → target + activate
- raised hand → interrupt/stop HEY speech
- thumbs up → optional low-risk confirmation
- thumbs down → dismiss/reject
- both palms → leave manipulation/show overview

Customization:
- remap
- train custom gesture
- sensitivity
- hold duration
- handedness
- per-device profile
- per-workspace mapping
- accessibility alternatives
- conflict detection
- test mode

Gestures never override high-risk confirmation policy.

---

### Complete Source A subsection: `# 87. Gesture Studio` (`01_DETAILED_SYSTEM_SPECS/FRONTEND_DESIGN_SYSTEM_DETAIL.md`)
# 87. Gesture Studio

**Purpose:** Train custom gesture

## Must include
- Camera preview, samples, confidence, conflict warnings, record/test/bind/save.

## Must not include
- Hidden recording.

## Layout / visual hierarchy
Clear sensing indicator.

## Core interaction rules
- Primary action must be visually dominant.
- Secondary actions use lower-elevation glass controls.
- Tertiary actions use ghost/text controls.
- Dangerous actions are separated spatially and semantically.
- Advanced controls stay collapsed until requested.
- The page must expose HEY help/tutorial contextually without covering the main task.

## States
- loading;
- empty;
- ready;
- active/working if applicable;
- success;
- partial success if applicable;
- offline;
- permission denied if applicable;
- unsupported if applicable;
- error/recovery.

## Motion
- page enter uses subtle fade + 8–16px spatial transition;
- cards/widgets animate only if hierarchy changes;
- reduced-motion mode uses opacity only.

## Responsive behavior
- desktop uses page-specific multi-pane layout where useful;
- tablet collapses inspectors into side sheets;
- mobile prioritizes the primary task and moves secondary panels into bottom sheets/full-screen subviews.

## Accessibility
- keyboard reachable;
- visible focus;
- semantic labels;
- 200% zoom resilient;
- reduced motion;
- RTL-safe.

## Special state notes
Use the global page-state rules defined above.

### Complete Source A subsection: `# 5. Gesture System` (`01_DETAILED_SYSTEM_SPECS/MASTER_CAPABILITY_ARCHITECTURE_DETAIL.md`)
# 5. Gesture System

Gestures are a first-class input alongside voice, text, mouse, keyboard
and touch.

## 5.1 Historical fact

Detailed hand-sign mappings were discussed during the
MediaPipe/prototype phase, but the exact historical mapping is not
safely recoverable from the retained source. **Do not invent it as
historical fact.**

## 5.2 Proposed production default gesture map

`PROPOSED-COMPETITIVE` default set, subject to user approval and
hardware support:

-   **Open palm held briefly** → wake/show HEY or reveal the compact
    control surface.
-   **Open palm → fist** → grab the currently targeted widget.
-   **Fist + hand movement** → move grabbed widget.
-   **Pinch thumb/index** → select/press targeted UI element.
-   **Pinch + move** → precision drag.
-   **Two-hand spread** → enlarge/zoom targeted widget/content.
-   **Two-hand pinch inward** → shrink/zoom out.
-   **Swipe left** → previous workspace/page/history context.
-   **Swipe right** → next/forward context.
-   **Swipe down** → minimize targeted widget.
-   **Swipe up** → restore/expand targeted widget.
-   **Two fingers raised / pause sign** → pause media/current resumable
    operation.
-   **Repeat pause sign** → resume.
-   **Horizontal hand rotation** → adjust volume or another continuous
    control only when that control is explicitly targeted.
-   **Point + pinch** → target then activate.
-   **Closed fist held** → cancel current gesture manipulation; should
    not automatically cancel dangerous background tasks unless
    confirmation rules permit.
-   **Both open palms** → leave manipulation mode / show overview.
-   **Thumbs-up** → optional confirm for low-risk prompts.
-   **Thumbs-down** → optional reject/dismiss.
-   **Hand raised and held** → interrupt HEY speech/listening flow,
    equivalent to "stop" in voice interaction.

Safety rule: gestures must **not** silently authorize high-risk actions.
A thumbs-up cannot approve file deletion, payment, lock control,
credential use, etc. when stronger confirmation is required.

## 5.3 Gesture targeting

Before a gesture changes something, HEY must know the target: - gaze is
not assumed - pointer/highlight may identify target - user can point at
a widget - voice can establish target: "this window" - last-focused
widget can be target when unambiguous - ambiguous gestures should not
act destructively

## 5.4 Gesture customization

Users can: - enable/disable gesture control globally - enable per
device - enable only while HEY is visible - choose left/right-handed
profile - change sensitivity - change hold duration - change gesture
confidence threshold - remap any non-reserved gesture - create a custom
gesture - attach a gesture to a HEY command/workflow - limit gesture to
an app/workspace/mode - require voice confirmation - disable gestures
that are physically difficult - reset defaults - export/import gesture
profiles - create accessibility profiles

Custom-gesture creation flow: 1. choose "Create gesture" 2. camera
permission explanation 3. user performs gesture multiple times 4. HEY
checks recognizability/conflicts 5. user names it 6. user selects
command/action 7. HEY displays risk/permission implications 8. test mode
9. save

Conflict handling: - warn if two gestures are too similar - never
silently replace an existing mapping - allow context-specific mappings
if conflicts are intentional - provide a safe fallback input method

Privacy: - prefer local pose/gesture inference - show camera-active
indicator - do not store raw video by default - stored custom gesture
models/templates require user control/deletion

## Source B: complete applicable Master Build Program prompts
Apply each exact step prompt to the real repository with Source A/C precedence; do not produce standalone HEY-NEXT packages.

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

## 14. ADVANCED GESTURE CONTROL

Gesture Control must function independently of HEY Chat.

A person can use it to control presentations, supported apps, media, widgets or other permitted actions.

Implement:

- Camera setup and permission explanation.
- Hand detection/tracking.
- Calibration.
- Gesture confidence thresholds.
- Left/right-handed profiles.
- Sensitivity and hold-duration adjustment.
- Gesture-to-action mappings.
- Per-app and per-workspace profiles.
- Custom gestures.
- Conflict detection.
- Test mode.
- Accidental-trigger prevention.
- Visible camera indicator.
- Pause/resume.
- Emergency Stop.
- Customization and saved profiles.

Relevant gestures include open palm, fist, pinch, swipe, two-hand spread/shrink, point-to-select and explicit pause/stop gestures, where reliably recognizable.

Smartboard/presentation workflows should include next slide, previous slide, zoom and appropriate teaching controls.

Gestures must never silently bypass high-risk authorization.

Prefer local pose tracking without unnecessary cloud video streaming.

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
