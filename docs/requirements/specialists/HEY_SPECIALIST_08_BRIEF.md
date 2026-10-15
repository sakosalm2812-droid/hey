# Specialist 08: Teacher Experience

Codex task: 01a14074-2bb4-7b73-af09-a38e11a10c3d
Branch: codex/next-08-teacher-experience
Last known branch head: 321a6c6

## Shared sources
Read the complete docs/requirements/HEY_SHARED_FOUNDATION.md and docs/requirements/HEY_SOURCE_C_RECOVERY_DIRECTIVE.md. Source A is the original detailed product specification. Source C later refines it and prevails on conflicts. Source B's relevant full subsystem prompts follow. All work applies to the existing HEY repository, not a separate package.

## Scoped implementation assignment
Make the three-artifact lesson journey atomic or explicitly resumable under partial failure. Verify teacher/class access for every read/export; ensure student worksheets never contain answer keys. Use fictional student data and preserve editable/exportable formats.

## Current code facts to validate
Teacher lesson, answer key and worksheet builders plus Forge save/readback exist. Saves were identified as sequential/non-transactional. No actual database, school deployment or signed-in Teacher journey is verified.

## Source A: complete task-specific requirements
### Complete Source A document: `01_DETAILED_SYSTEM_SPECS/07_COMPLETE_ARTIFACT_PINPOINT_VERSIONING.md`
# FILE: `01_DETAILED_SYSTEM_SPECS/07_COMPLETE_ARTIFACT_PINPOINT_VERSIONING.md`

# Complete Artifact / Pinpoint / Versioning System
## HEY V1 — Full-depth implementation specification

**Mission:** Guarantee exact-change editing, protected-state preservation, branches, comparison and recovery.

This specification is normative for HEY V1. A feature is not complete because a page renders or an API returns. It is complete only when discovery, interaction, state, permissions, failures, recovery, verification, accessibility, observability and end-to-end behavior all work.

# 1. Scope
- Artifacts across images, video, audio, slides, docs, UI, code, workflows, agents, data transforms.
- Locks, intended delta, protected state, actual delta, QA, repair, snapshots, branches, merge.

# 2. User experience contract
- User can say 'change only X' and HEY visibly understands what is protected.
- Before/After/Changes inspector available when useful.
- Approved versions can be named/finalized.
- Destructive edits create restore points automatically.

# 3. Architecture / runtime contract
- ChangeSet contains request, intended changes, invariants, allowed side effects, source version, output version, verification.
- Artifact graph supports branch/compare/restore/merge.
- Type-specific differ compares pixels/objects/text/code/layout/schema as appropriate.
- Verifier detects unintended changes before completion.

# 4. Required state model
- draft
- generating
- verifying
- needs-repair
- approved
- final
- branched
- merged
- restored
- failed

# 5. Failure and recovery catalog
- Diff unavailable → warn and require conservative verification.
- Merge conflict → explicit resolution.
- Provider regenerated too broadly → reject/repair.
- Corrupt version → restore parent.

# 6. Security / privacy / trust requirements
- Artifact permissions inherit project scope.
- Version history immutable audit where required.
- No cross-project reference leakage.

# 7. Data model / persistence
- artifacts
- artifact_versions
- change_sets
- locks
- diffs
- approvals
- snapshots
- branches
- merge_records

# 8. Events / telemetry contracts
- artifact.created
- change.requested
- change.verified
- change.rejected
- lock.added
- version.approved
- branch.created
- restore.completed

# 9. Platform behavior
- Follow the strongest legitimate behavior available per platform; expose limitations honestly.

# 10. Implementation requirements
- Reuse shared HEY runtime, permissions, audit, verification, Project DNA, Pinpoint, Cosmos and error systems rather than creating isolated local logic.

# 11. Acceptance / regression tests
- Single-object image edit preserves rest.
- Slide-three-only edit preserves other slides.
- Code API lock regression.
- Data schema lock regression.
- Branch/restore/merge tests.

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

### Complete Source A document: `01_DETAILED_SYSTEM_SPECS/13_COMPLETE_DATA_SCHEMA_CONTRACT.md`
# FILE: `01_DETAILED_SYSTEM_SPECS/13_COMPLETE_DATA_SCHEMA_CONTRACT.md`

# Complete Data / Entity / Schema Contract
## HEY V1 — Full-depth implementation specification

**Mission:** Define durable entities, ownership, versioning, integrity and deletion/export semantics.

This specification is normative for HEY V1. A feature is not complete because a page renders or an API returns. It is complete only when discovery, interaction, state, permissions, failures, recovery, verification, accessibility, observability and end-to-end behavior all work.

# 1. Scope
- Users, profiles, plans, entitlements, permissions, devices, projects, DNA, artifacts, missions, tasks, workflows, agents, skills, integrations, Cosmos, reminders, gestures, themes, widgets, audit, diagnostics, usage.
- Relationships, lifecycle, retention and migrations.

# 2. User experience contract
- User-facing deletion/export maps clearly to stored entities.
- Project-scoped data remains isolated.
- Derived/cache data identifies source/freshness.

# 3. Architecture / runtime contract
- Use stable IDs, created/updated timestamps, version where concurrent mutation matters.
- Foreign keys and constraints where appropriate.
- Soft delete only when product/legal semantics require it; otherwise real deletion.
- Migration forward/backward strategy and backup before destructive migrations.

# 4. Required state model
- active
- archived
- deleted-pending
- deleted
- versioned
- stale
- conflicted

# 5. Failure and recovery catalog
- Migration partial failure → rollback/repair.
- Orphan record → integrity job.
- Concurrent update → optimistic conflict handling.
- Export job failure → resumable.

# 6. Security / privacy / trust requirements
- RLS/authorization by user/project/organization.
- Minimize stored raw sensitive content.
- Encryption at rest/in transit per infrastructure.
- Audit access to sensitive data.

# 7. Data model / persistence
- users
- profiles
- plans
- entitlements
- permissions
- devices
- projects
- project_dna
- artifacts
- artifact_versions
- change_sets
- missions
- tasks
- workflows
- agents
- skills
- integrations
- memory_nodes
- memory_edges
- reminders
- notifications
- gesture_profiles
- themes
- workspace_layouts
- audit_events
- diagnostics
- usage

# 8. Events / telemetry contracts
- entity.created
- entity.updated
- entity.deleted
- migration.started
- migration.completed
- integrity.violation

# 9. Platform behavior
- Follow the strongest legitimate behavior available per platform; expose limitations honestly.

# 10. Implementation requirements
- Reuse shared HEY runtime, permissions, audit, verification, Project DNA, Pinpoint, Cosmos and error systems rather than creating isolated local logic.

# 11. Acceptance / regression tests
- Project RLS.
- Cascade semantics.
- Export completeness.
- Deletion completeness.
- Migration rollback.
- Concurrent edits.

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

### Complete Source A subsection: `## 4.4 Teacher` (`01_DETAILED_SYSTEM_SPECS/ANSWER_ENGINE_DETAIL.md`)
## 4.4 Teacher
Characteristics:
- adapts level;
- analogies;
- examples;
- diagrams when useful;
- retrieval questions;
- quizzes;
- asks user to explain back when in teaching mode;
- changes teaching method when the first explanation fails.

### Complete Source A subsection: `## 8.8 Teacher` (`01_DETAILED_SYSTEM_SPECS/ANSWER_ENGINE_DETAIL.md`)
## 8.8 Teacher
- explanation;
- examples;
- checks for understanding;
- adaptive difficulty.

### Complete Source A subsection: `# 31. Learning and Education` (`01_DETAILED_SYSTEM_SPECS/COMPLETE_CAPABILITY_CATALOG_DETAIL.md`)
# 31. Learning and Education

**Status:** `PLANNED`

Capabilities:
- tutor
- explain at chosen level
- quiz
- flashcards
- adaptive questions
- spaced repetition
- study plan
- exam revision
- source-based answer
- Learning Theater
- mind maps
- step-by-step visual breakdown
- story-based learning
- multilingual learning
- dyslexia-friendly layout
- audio-first learning
- accessibility adaptations
- “teach me, don’t answer for me”
- progress tracking

Historical ambitions included education access in low-resource/conflict-zone contexts.

---

## Source B: complete applicable Master Build Program prompts
Apply each exact step prompt to the real repository with Source A/C precedence; do not produce standalone HEY-NEXT packages.

HEY PROMPT 23/47 — Documents, Spreadsheets, Presentations & Structured Office Artifacts

You are the principal production engineer for HEY responsible for: Documents, Spreadsheets, Presentations & Structured Office Artifacts.

Create the production-grade integration-ready package:

`HEY-NEXT/23-office-artifacts/`

PACKAGE OWNERSHIP
Own production-grade document, spreadsheet, presentation, PDF, report, table, form, worksheet and structured office-artifact creation/editing within Universal Creation Fabric.

DEPENDENCY INTENT
This package conceptually depends on: Universal Creation contracts from Prompt 22 + global contracts.
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

- Rich documents with semantic headings, citations, tables, figures, comments, tracked revisions, footnotes/endnotes, headers/footers, cross-references, TOC, styles and accessibility metadata.
- Spreadsheets with formulas, named ranges, tables, pivots, charts, validation, scenarios, dependency graph, error detection and reproducible calculations.
- Presentations with narrative architecture, layouts, master/theme, speaker notes, charts, visuals, animations where appropriate and accessibility.
- PDF structured export, forms, annotations, signature hooks, OCR only when needed, extraction fidelity and redaction.
- Semantic import preserving structure.
- Data/source linkage for charts/tables.
- Template/design-system support.
- Semantic point editing by paragraph/table/chart/slide/element.
- Version/branch/review/approval.
- Vendor-neutral office compatibility strategy.
- Formula/calculation verifier and unit checks where applicable.
- Export/render verification.
- Collaboration comments/tasks/change ownership.
- Localization/RTL/accessibility.
- Document privacy/redaction/classification.
- Large-file/chunked processing/weak-device remote editing.
- Conversion lossiness detection.
- Receipts/evidence including render previews.

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

HEY-NEXT/23-office-artifacts/
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

- Formula breaks after row insert.
- Presentation export rendering difference.
- RTL mixed-language table.
- Large doc interrupted/resume.
- PDF redaction removes underlying text.
- Chart refreshes from source.
- Roundtrip preserves semantics.
- Accessibility reading order/alt text.
- Tracked changes/comments survive.
- Unsupported feature warns on conversion.

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

HEY PROMPT 29/47 — Learning, Study, Skill Growth & Personal Development

You are the principal production engineer for HEY responsible for: Learning, Study, Skill Growth & Personal Development.

Create the production-grade integration-ready package:

`HEY-NEXT/29-learning-skill-growth/`

PACKAGE OWNERSHIP
Own HEY's individual learning and skill-development system: tutoring, mastery tracking, study planning, practice, project-based learning, adaptive explanation, source literacy and integrity-aware school support.

DEPENDENCY INTENT
This package conceptually depends on: Cosmos, Situation, Planner, Expert Pack hooks and global contracts.
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

- Skill/knowledge graph with prerequisites, mastery confidence, evidence, misconceptions and goals.
- Adaptive tutor modes including Socratic.
- Practice generation/evaluation aligned to mastery.
- Spaced retrieval/review scheduling where useful.
- Study planner integrating syllabus/deadlines/calendar/mastery.
- Lecture/textbook companion with concept graph/questions.
- Project-based learning.
- Learning integrity mode for assignments/exams.
- Misconception detection/correction history.
- Memory-to-learning separation.
- Skill-growth mode that reduces help as competence rises.
- Career skill graph/portfolio evidence.
- Language-learning integration.
- Minor-aware/school boundaries.
- Offline learning packs.
- Accessibility/reading-level adaptation.
- Source literacy/plagiarism/citation support.
- Teacher/mentor hooks without including the separate Leaders product.

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

HEY-NEXT/29-learning-skill-growth/
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

- Integrity-restricted assignment request.
- Mastery confidence falls after failure.
- Cross-language explanation.
- Offline study sync.
- Persistent misconception.
- Overbooked study plan.
- Minor privacy.
- Textbook rights/citation boundary.
- Portfolio evidence provenance.
- Accessibility mode.

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

HEY PROMPT 31/47 — Organizations, Enterprise, Teams, Education & Managed Environments

You are the principal production engineer for HEY responsible for: Organizations, Enterprise, Teams, Education & Managed Environments.

Create the production-grade integration-ready package:

`HEY-NEXT/31-organizations-enterprise/`

PACKAGE OWNERSHIP
Own HEY's organization/workspace platform: teams, businesses, institutions, enterprise governance, roles, managed devices, data boundaries, shared knowledge, auditability, licensing/entitlements and organization policy without compromising personal HEY privacy.

DEPENDENCY INTENT
This package conceptually depends on: Identity, Trust, Cosmos, Device, Marketplace/API, Billing and global contracts.
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

- Organization/workspace model consuming canonical identities and Trust Kernel.
- Role/attribute policy integration without duplicate authorization.
- Departments/teams/projects with tenant isolation.
- Role-scoped organization knowledge.
- Managed device enrollment/policy/shared-display privacy.
- SSO/SCIM/invite/member lifecycle hooks.
- Admin surfaces for billing/usage/devices/logs/policies/approved extensions/models/providers/retention/residency.
- Separation of duties and approval chains.
- Enterprise audit/evidence export.
- Retention/legal-hold hooks.
- Offboarding with revoke/transfer/preserve organization data/protect personal data.
- Private marketplace/allowlists.
- BYO model/storage/identity/observability/compute hooks.
- Generic education roles/workflows and managed/shared devices.
- Explicitly exclude the separate Leaders smartboard/classroom-control product unless later reconnected.
- Workspace Cosmos boundaries; employer cannot access personal Cosmos.
- Service accounts/quotas.
- SaaS/dedicated/self-hosted/sovereign deployment hooks.
- Organization outcome/health dashboards.

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

HEY-NEXT/31-organizations-enterprise/
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

- Member removed mid-mission.
- Admin attempts personal Cosmos access.
- Cross-tenant retrieval/cache leak.
- Managed device lost.
- Role change invalidates mandates.
- Org policy vs personal preference.
- Offboarding shared artifact.
- Private extension revoked.
- Residency blocks provider.
- Shared educational display privacy.

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

## 17. COMPLETE TEACHER MODE

Teacher Mode is a complete customizable experience for teachers, including potential school-managed workspaces.

Include:

- Lesson plans.
- Presentations.
- Worksheets.
- Quizzes.
- Assessments.
- Activities.
- Teaching explanations.
- Subject-specific preparation.
- Classroom resources.
- Teacher-specific preferences.
- Exportable/editable materials.
- Smartboard controls.
- Gesture integration.
- Reusable templates.
- Safe school organization administration.

Teachers can add any other permitted tool, including developer tools and model tools.

Do not create a separate incompatible teacher AI.

Teachers should not need technical expertise.

For real school deployment, organization access controls and student privacy must be verified. Use fictional student information for early testing.

School association or partnership branding must be authorized.

## 18. THE ORIGINAL CREATION, MEMORY AND AGENT SYSTEMS MUST REMAIN

The newer features DO NOT replace the original advanced HEY vision.

Preserve and fully implement the original source specifications for:

**Cosmos:** Long-term, permission-aware second-brain memory, temporal corrections, recall, provenance, user controls, relevant retrieval, synchronization, export and deletion.

**HEY Brain:** Intent understanding, task planning, agent/tool orchestration, adaptive reasoning, verification, situation awareness and appropriate response modes.

**Agent Fabric:** Dynamic specialists, councils, critics, verifiers, delegation, reputation, timeouts, cancellation and controlled resource budgets.

**Forge:** Creating tools, workflows, agents and other capabilities from user goals; dependency validation, sandbox tests, preview, installation, versioning, rollback and governance.

**Evolution:** Discovering and proposing product improvements, measuring benefits, respecting approvals, maintaining historical decisions and using independent verification.

**Creation:** Images, image editing, video, storyboard, motion graphics, audio, presentations, documents, spreadsheets, code, applications and websites.

**Pinpoint Precision:** Edit exactly the requested part of an artifact while preserving untouched regions, approved shots, styles, assets and constraints.

**Project DNA:** Maintain visual, editorial, technical and other project-wide consistency where applicable.

**Automation:** Scheduled and event-driven workflows, durable state, retries, approvals, cross-service actions and accurate execution records.

**Home and Widgets:** Personalized tasks, calendar, weather, prayer where enabled, news, project status, activity, notifications and contextual widgets.

**All remaining systems:** Use the detailed original source—not this summary—to implement their exact behavior, edge cases and acceptance requirements.

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
