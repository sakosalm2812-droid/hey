# Specialist 02: Spaces and Onboarding

Codex task: 01a14073-9827-7f42-bf35-4eb2faee522d
Branch: codex/next-02-onboarding-spaces
Last known branch head: c75a196

## Shared sources
Read the complete docs/requirements/HEY_SHARED_FOUNDATION.md and docs/requirements/HEY_SOURCE_C_RECOVERY_DIRECTIVE.md. Source A is the original detailed product specification. Source C later refines it and prevails on conflicts. Source B's relevant full subsystem prompts follow. All work applies to the existing HEY repository, not a separate package.

## Scoped implementation assignment
Complete signed-in Space create/edit/rename/reload and registered-tool membership with account-switch cleanup and visible recovery. Support empty/template/custom Space and preview-before-apply natural-language creation. Personalization must never grant data access.

## Current code facts to validate
Space create/membership are account-scoped with local readback tests; server sync and complete create UI remain unverified. c75a196 adds reload and account isolation tests.

## Source A: complete task-specific requirements
### Complete Source A document: `01_DETAILED_SYSTEM_SPECS/01_COMPLETE_NAVIGATION_INFORMATION_ARCHITECTURE.md`
# FILE: `01_DETAILED_SYSTEM_SPECS/01_COMPLETE_NAVIGATION_INFORMATION_ARCHITECTURE.md`

# Complete Navigation & Information Architecture
## HEY V1 — Full-depth implementation specification

**Mission:** Make every important HEY capability discoverable without exposing internal complexity.

This specification is normative for HEY V1. A feature is not complete because a page renders or an API returns. It is complete only when discovery, interaction, state, permissions, failures, recovery, verification, accessibility, observability and end-to-end behavior all work.

# 1. Scope
- Conversation Surface (Chat/Voice) is the default signed-in destination.
- Primary global navigation, contextual navigation, Create hierarchy, Explore More, + Add, Universal Search, Command Palette, recent/favorites, mobile bottom nav.
- Information scent, labels, hierarchy, advanced-mode disclosure, role/device/mode adaptations.
- Deep-link routing and return-to-previous-context behavior.

# 2. User experience contract
- Primary normal-user nav: Chat/Voice entry, Live, Projects, Create, Cosmos, Tasks/Missions, Widgets/Workspace, Search, Notifications, Settings.
- Important Create actions visible before Explore More: Image, Video, Presentation, Document, Audio.
- `+ Add` lets users pin additional capabilities without seeing raw agents.
- Advanced tools are discoverable through Advanced Mode, Search, Forge, Developer—not cluttering normal nav.
- Navigation never loses active project/conversation/artifact state.
- Breadcrumbs appear only where hierarchy is genuinely useful.
- Mobile uses bottom nav + More; desktop uses collapsible rail; tablet uses adaptive split shell.

# 3. Architecture / runtime contract
- Central route registry with capability metadata, permissions, feature flags, platform support and discovery rank.
- Navigation state is distinct from task/artifact state.
- Deep links restore intended resource with permission checks.
- Startup route resolver respects newest rule: default Conversation Surface, then explicit user override, then safe resume.
- Explore More reads from capability registry but filters by audience/platform/entitlements.

# 4. Required state model
- anonymous
- authenticating
- signed-in-first-run
- signed-in-returning
- conversation-active
- immersive-live
- embedded-studio
- full-studio
- modal
- offline
- unsupported-platform
- advanced-mode

# 5. Failure and recovery catalog
- Unknown/deprecated route → safe redirect with explanation.
- Feature flag off → remove dead nav and provide fallback if linked.
- Unauthorized deep link → permission/entitlement explanation.
- Stale project/artifact link → recovery and search, not blank page.
- Navigation state corruption → restore last valid route.

# 6. Security / privacy / trust requirements
- Never use client-only nav hiding as authorization.
- Sensitive routes require server/runtime enforcement.
- Do not leak advanced/debug routes to normal users.
- External URLs opened safely and clearly distinguished.

# 7. Data model / persistence
- navigation_preferences
- pinned_capabilities
- recent_capabilities
- startup_destination
- feature_flags
- entitlements
- capability_manifest
- workspace_route_state

# 8. Events / telemetry contracts
- nav.opened
- nav.pinned
- nav.unpinned
- search.opened
- capability.discovered
- capability.launched
- route.failed
- startup.resolved

# 9. Platform behavior
- Follow the strongest legitimate behavior available per platform; expose limitations honestly.

# 10. Implementation requirements
- Reuse shared HEY runtime, permissions, audit, verification, Project DNA, Pinpoint, Cosmos and error systems rather than creating isolated local logic.

# 11. Acceptance / regression tests
- Fresh sign-in lands Chat/Voice.
- Returning user resumes safe conversation state.
- Normal user finds Image/Video/Live/Cosmos without Explore More.
- + Add persists pinned tool.
- Deep link to project artifact restores context.
- Advanced Mode reveals developer areas without changing normal nav.

# 12. Non-goals / prohibited shortcuts
- Do not put all 229 agents in navigation.
- Do not make Explore More the only discovery path.
- Do not route sign-in to generic dashboard by default.

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

### Complete Source A document: `01_DETAILED_SYSTEM_SPECS/02_COMPLETE_HOME_DASHBOARD_INTELLIGENCE.md`
# FILE: `01_DETAILED_SYSTEM_SPECS/02_COMPLETE_HOME_DASHBOARD_INTELLIGENCE.md`

# Complete Home / Workspace Intelligence
## HEY V1 — Full-depth implementation specification

**Mission:** Make Home useful as a living workspace without making it the forced landing page.

This specification is normative for HEY V1. A feature is not complete because a page renders or an API returns. It is complete only when discovery, interaction, state, permissions, failures, recovery, verification, accessibility, observability and end-to-end behavior all work.

# 1. Scope
- Widget composition, contextual recommendations, active work, tasks/calendar, projects, weather, prayer where enabled, usage/system state, routines.
- User-controlled layouts and adaptive suggestions.
- Multiple workspace layouts and per-mode layouts.

# 2. User experience contract
- Home is available from navigation but is not default post-sign-in.
- Default shows one focal item plus 2–4 supporting modules, not a 12-card admin grid.
- Active mission/current project gets highest priority.
- `+ Add Widget` is obvious.
- HEY may suggest layout changes, but persistent changes require user acceptance unless explicitly enabled.
- Widgets can move/resize/stack/minimize/maximize.

# 3. Architecture / runtime contract
- Workspace state persisted per user/device/mode.
- Widget registry declares size variants, refresh policy, permissions, privacy and offline behavior.
- Contextual ranking uses real signals but does not reorder constantly.
- Workspace mutations are undoable and snapshot important layout changes.

# 4. Required state model
- first-run
- normal
- active-mission
- focus-mode
- morning-mode
- offline
- weak-hardware
- empty-calendar
- no-projects
- customized

# 5. Failure and recovery catalog
- Widget data source failure → local error tile without collapsing workspace.
- Slow widget → skeleton and timeout.
- Layout corruption → restore last good snapshot.
- Missing capability after update → placeholder with remove/replace choice.

# 6. Security / privacy / trust requirements
- Private widgets must respect project/user privacy.
- Sensitive data is hidden on TV/projector/public-display modes.
- Widgets cannot silently escalate permissions.

# 7. Data model / persistence
- workspace_layouts
- widget_instances
- widget_preferences
- mode_layouts
- layout_snapshots
- widget_registry

# 8. Events / telemetry contracts
- workspace.opened
- widget.added
- widget.moved
- widget.resized
- widget.failed
- layout.restored
- layout.suggestion.accepted

# 9. Platform behavior
- Follow the strongest legitimate behavior available per platform; expose limitations honestly.

# 10. Implementation requirements
- Reuse shared HEY runtime, permissions, audit, verification, Project DNA, Pinpoint, Cosmos and error systems rather than creating isolated local logic.

# 11. Acceptance / regression tests
- Fresh user sees calm default.
- Add widget and restart → persists.
- Switch Focus Mode → correct layout.
- Weak laptop uses lightweight effects.
- Broken widget does not break Home.

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

### Complete Source A document: `01_DETAILED_SYSTEM_SPECS/05_COMPLETE_MODES_SYSTEM.md`
# FILE: `01_DETAILED_SYSTEM_SPECS/05_COMPLETE_MODES_SYSTEM.md`

# Complete HEY Modes System
## HEY V1 — Full-depth implementation specification

**Mission:** Make modes coherent environment presets rather than cosmetic labels.

This specification is normative for HEY V1. A feature is not complete because a page renders or an API returns. It is complete only when discovery, interaction, state, permissions, failures, recovery, verification, accessibility, observability and end-to-end behavior all work.

# 1. Scope
- Study, Creator, Coding, Research, Business, Focus, Meeting, Presentation, Travel, Morning, Late Night, Accessibility, Private, Offline, Execution.
- Per-mode workspace, notifications, agents, provider policy, voice/personality, gestures, privacy.

# 2. User experience contract
- Mode switch visibly explains what changes.
- Same HEY identity remains; modes tune behavior.
- Mode can be temporary, scheduled, context-triggered or manually selected.
- User can create/customize mode and restore defaults.

# 3. Architecture / runtime contract
- Mode manifest with overrides and inheritance from global settings.
- Mode resolver prevents contradictory settings.
- Transition is atomic: workspace + policy + notifications + routing update coherently.
- Private/Offline modes enforce hard privacy/routing rules, not merely theme changes.

# 4. Required state model
- inactive
- activating
- active
- temporarily-overridden
- scheduled
- deactivating
- conflict

# 5. Failure and recovery catalog
- Mode config invalid → fall back to safe global defaults.
- Provider unavailable → mode degrades visibly.
- Private Mode cloud conflict → block cloud action.

# 6. Security / privacy / trust requirements
- Private and Offline modes have hard enforcement.
- Mode cannot grant permissions not already authorized.
- Meeting mode must show sensing/recording state.

# 7. Data model / persistence
- modes
- mode_overrides
- mode_schedules
- mode_history
- mode_layouts

# 8. Events / telemetry contracts
- mode.activated
- mode.deactivated
- mode.override
- mode.conflict
- mode.schedule.triggered

# 9. Platform behavior
- Follow the strongest legitimate behavior available per platform; expose limitations honestly.

# 10. Implementation requirements
- Reuse shared HEY runtime, permissions, audit, verification, Project DNA, Pinpoint, Cosmos and error systems rather than creating isolated local logic.

# 11. Acceptance / regression tests
- Study mode changes workspace/notifications.
- Private Mode prevents long-term memory write as configured.
- Offline Mode prevents cloud routing.
- Mode exit restores previous state.

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

### Complete Source A document: `01_DETAILED_SYSTEM_SPECS/06_COMPLETE_PROJECT_SYSTEM.md`
# FILE: `01_DETAILED_SYSTEM_SPECS/06_COMPLETE_PROJECT_SYSTEM.md`

# Complete Project System
## HEY V1 — Full-depth implementation specification

**Mission:** Give every substantial effort a persistent container for context, artifacts, decisions, memory, tasks and Project DNA.

This specification is normative for HEY V1. A feature is not complete because a page renders or an API returns. It is complete only when discovery, interaction, state, permissions, failures, recovery, verification, accessibility, observability and end-to-end behavior all work.

# 1. Scope
- Project creation, overview, files, artifacts, tasks, memory, agents, activity, members, settings, Project DNA, canonical source, archival/export.
- Project isolation and cross-project references.

# 2. User experience contract
- Project switch is obvious and never silently mixes context.
- Project overview shows goal, current work, blockers, recent artifacts, decisions and tasks.
- Accepted artifacts and decisions become first-class project state.
- Project DNA is editable, lockable and auditable.

# 3. Architecture / runtime contract
- Project ID scopes memory, files, tasks, missions, artifacts and provider/privacy policy.
- Canonical sources and approved references are versioned.
- Cross-project access requires explicit link or user action.
- Project snapshots support restore.

# 4. Required state model
- active
- paused
- archived
- shared
- local-only
- syncing
- conflicted
- deleted-pending

# 5. Failure and recovery catalog
- Sync conflict → compare/resolve.
- Missing canonical source → warning, not silent substitution.
- Member removed → revoke access immediately.
- Archive preserves data.

# 6. Security / privacy / trust requirements
- RLS/project membership enforcement.
- Project context firewall.
- Local-only projects never route content to cloud.
- Exports exclude unauthorized connected data.

# 7. Data model / persistence
- projects
- project_members
- project_dna
- canonical_sources
- project_decisions
- project_snapshots
- project_links

# 8. Events / telemetry contracts
- project.created
- project.switched
- dna.updated
- decision.recorded
- source.canonicalized
- project.archived

# 9. Platform behavior
- Follow the strongest legitimate behavior available per platform; expose limitations honestly.

# 10. Implementation requirements
- Reuse shared HEY runtime, permissions, audit, verification, Project DNA, Pinpoint, Cosmos and error systems rather than creating isolated local logic.

# 11. Acceptance / regression tests
- Project isolation test.
- Shared project permission test.
- Local-only routing test.
- Archive/restore.
- Project DNA drift detection.

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

### Complete Source A document: `01_DETAILED_SYSTEM_SPECS/08_COMPLETE_FIRST_RUN_ACCOUNT_LIFECYCLE.md`
# FILE: `01_DETAILED_SYSTEM_SPECS/08_COMPLETE_FIRST_RUN_ACCOUNT_LIFECYCLE.md`

# Complete First-Run, Sign-In & Account Lifecycle
## HEY V1 — Full-depth implementation specification

**Mission:** Make entry into HEY immediate, premium and safe from account creation through deletion.

This specification is normative for HEY V1. A feature is not complete because a page renders or an API returns. It is complete only when discovery, interaction, state, permissions, failures, recovery, verification, accessibility, observability and end-to-end behavior all work.

# 1. Scope
- Sign up, verification, sign in, recovery, first run, onboarding, returning user, sign out, account switch, deletion/export.
- Startup destination and install prompts.

# 2. User experience contract
- Successful sign-in defaults to Chat/Voice Conversation Surface.
- Onboarding requests permissions just-in-time, not all at once.
- First real task teaches HEY by doing.
- Returning users skip onboarding and resume safely.
- PWA/native install suggestion occurs after demonstrated value.

# 3. Architecture / runtime contract
- Auth session managed server-side/securely.
- Startup resolver checks onboarding state, last safe conversation, active mission, explicit preference.
- Account deletion/export is durable and auditable.
- Plan/entitlement state cannot be forged client-side.

# 4. Required state model
- anonymous
- signing-up
- verification-pending
- onboarding
- active
- session-expired
- locked
- deletion-pending
- deleted

# 5. Failure and recovery catalog
- Expired session → reauth preserving local draft.
- Verification email failure → resend.
- Account deletion partial failure → retry/report.
- Entitlement mismatch → server truth wins.

# 6. Security / privacy / trust requirements
- Secure tokens, no secrets in local storage where avoidable.
- Rate-limit recovery/login abuse.
- Reauthentication for sensitive account actions.

# 7. Data model / persistence
- users
- profiles
- sessions
- onboarding_progress
- account_exports
- deletion_jobs
- startup_preferences

# 8. Events / telemetry contracts
- auth.signed_in
- onboarding.step
- startup.route
- session.expired
- account.exported
- account.deleted

# 9. Platform behavior
- Follow the strongest legitimate behavior available per platform; expose limitations honestly.

# 10. Implementation requirements
- Reuse shared HEY runtime, permissions, audit, verification, Project DNA, Pinpoint, Cosmos and error systems rather than creating isolated local logic.

# 11. Acceptance / regression tests
- Fresh sign-in → Conversation Surface.
- Returning sign-in → safe resume.
- Session expiry preserves draft.
- Delete/export test.
- PWA install prompt timing test.

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

### Complete Source A subsection: `## Semantic Workspace` (`01_DETAILED_SYSTEM_SPECS/MASTER_CAPABILITY_ARCHITECTURE_DETAIL.md`)
## Semantic Workspace

Drag information between meaningful widgets; spatial groups become
reusable workspaces.

### Complete Source A subsection: `## Private Team/Family Spaces` (`01_DETAILED_SYSTEM_SPECS/MASTER_CAPABILITY_ARCHITECTURE_DETAIL.md`)
## Private Team/Family Spaces

Separate memory/permissions with explicit sharing.

## Source B: complete applicable Master Build Program prompts
Apply each exact step prompt to the real repository with Source A/C precedence; do not produce standalone HEY-NEXT packages.

STEP 02 — ORIGINAL DETAILED PROMPT
####################################################################################################

You are the principal production engineer responsible for HEY’s canonical Identity, Accounts, Sessions, Authentication, Workspace Identity Boundaries, and Device Trust system.

This is Prompt 02 of the HEY-NEXT production program.

The existing newest HEY codebase is currently unavailable.

Do NOT invent or assume its architecture.

Build this subsystem as a production-grade, interface-stable, integration-ready package that can later be reconciled with the real HEY codebase by Claude Code.

Create:

`HEY-NEXT/02-identity-accounts-device-trust/`

This package must use and conform to the canonical contracts established by:

`HEY-NEXT/01-global-foundation/`

If Prompt 01 files are not physically available in this task environment, reproduce only the minimum shared type assumptions necessary for this package and mark them clearly as:

`TEMPORARY CONTRACT MIRRORS — MUST BE RECONCILED WITH PROMPT 01`

Do NOT create competing global contracts.

==================================================
ABSOLUTE FINAL PRODUCT CONTRACT
==================================================

This is FINAL-PRODUCT engineering.

Forbidden:

- MVPs
- prototypes presented as finished
- demo-only authentication
- fake login flows
- hard-coded users
- hard-coded organizations
- placeholder session logic
- frontend-only auth
- backend-only auth
- localStorage-only trust for consequential security state
- insecure “remember me”
- boolean authorization shortcuts
- fake device registration
- fake biometric support
- fake passkey support
- fake MFA
- silently deferred security work
- TODO-driven completion claims
- mocks presented as production behavior
- “works on my machine” as completion evidence
- creating duplicate identity or session systems
- security-by-obscurity
- trusting client-supplied identity claims
- trusting device names as device identity
- trusting model output as authentication or authorization
- assuming code exists means security is complete

For everything applicable, completion requires:

research →
architecture →
implementation →
data models →
authentication →
session security →
account lifecycle →
workspace/org boundaries →
device enrollment →
device trust →
revocation →
recovery →
security →
privacy →
failure handling →
offline/degraded behavior →
weak-device behavior →
observability →
auditability →
accessibility readiness →
localization readiness →
tests →
adversarial tests →
integration tests →
recovery tests →
evidence.

If you find a fixable defect within this package, fix it.

Discovery creates work.

Do not claim PRODUCTION_READY without evidence.

==================================================
PACKAGE RESPONSIBILITY
==================================================

Own exactly these concerns:

1. User identity
2. Account identity
3. Authentication
4. Sign-up
5. Sign-in
6. Sign-out
7. Session creation
8. Session renewal
9. Session expiry
10. Session revocation
11. Multi-device sessions
12. Device registration
13. Device identity
14. Device enrollment
15. Device trust
16. Device naming
17. Device metadata
18. Device capability identity linkage
19. Lost-device handling
20. Device revocation
21. Suspicious-session handling
22. Reauthentication
23. Step-up authentication
24. Passkey architecture
25. Password fallback if supported
26. MFA architecture
27. Recovery architecture
28. Account recovery
29. Recovery codes/keys where justified
30. Trusted recovery contacts where appropriate
31. Workspace membership identity
32. Organization membership identity
33. Personal/work/family account separation
34. Role identity
35. Service identities
36. Agent identities
37. Extension identities
38. External-agent identities
39. Machine/service accounts
40. Session scopes
41. Temporary delegated sessions
42. Guest/shared-device sessions
43. Public-display/session privacy
44. Owner/internal operator identity
45. Authentication audit trail
46. Identity security events
47. Identity export/migration contracts
48. Account deletion lifecycle
49. Identity-data retention
50. Cross-device identity continuity

Do NOT build the full authorization/permission engine here.

Prompt 01 owns the canonical authorization foundation.

This package authenticates WHO/WHAT something is.

The Trust Kernel later decides WHAT it may do.

==================================================
CORE ARCHITECTURAL RULE
==================================================

Authentication answers:

`Who are you?`

Session management answers:

`Is this authenticated context still valid?`

Device trust answers:

`Which physical/logical device is participating, and how much should HEY trust it?`

Authorization answers:

`What are you allowed to do?`

Do not merge these concepts into one boolean.

==================================================
IDENTITY MODEL
==================================================

Create typed identities for at least:

- HumanUserIdentity
- AccountIdentity
- WorkspaceIdentity
- OrganizationIdentity
- DeviceIdentity
- SessionIdentity
- ServiceIdentity
- AgentIdentity
- ExtensionIdentity
- ExternalAgentIdentity
- InternalOperatorIdentity

Every identity must have:

- stable ID
- type
- lifecycle state
- creation time
- update time
- provenance
- tenant/workspace scope where applicable
- security status
- version

Avoid exposing unnecessary internal IDs directly to UI.

==================================================
ACCOUNT TYPES
==================================================

HEY must support the future coexistence of:

PERSONAL
FAMILY
TEAM
BUSINESS
EDUCATION
ENTERPRISE
DEVELOPER
OWNER_INTERNAL

Do not assume one user belongs to only one account/workspace.

A person may simultaneously have:

- personal HEY
- family HEY
- school HEY
- work HEY
- developer workspace
- owner/internal access

These contexts must remain strongly separated.

No silent memory, permission, artifact, or organization-data crossover.

==================================================
AUTHENTICATION METHODS
==================================================

Design a modular authentication architecture supporting, where appropriate:

- passkeys
- password authentication
- email-based verification
- magic-link style flows if justified
- TOTP
- security keys
- biometric-backed passkeys
- platform authenticators
- enterprise SSO
- OAuth/OIDC federation
- recovery codes
- device-based reauthentication

Prefer phishing-resistant methods where supported.

Passkeys should be first-class, not an afterthought.

Do NOT assume every platform supports every method.

Use capability detection.

==================================================
PASSKEY SYSTEM
==================================================

Design proper passkey support including:

- registration
- authentication
- multiple passkeys per account
- device-synced passkeys
- hardware security keys
- passkey naming
- passkey deletion
- passkey last-used metadata
- passkey compromise response
- recovery when passkeys unavailable
- cross-device authentication where supported
- step-up auth with passkey
- organization policies requiring strong authentication

Do not fake passkey support with local flags.

==================================================
PASSWORD SYSTEM
==================================================

If passwords are supported:

- modern password hashing
- per-password salts
- appropriate work factors
- breach-resistance design
- rate limiting
- credential-stuffing defenses
- password reset security
- password-change session invalidation policy
- compromised-password handling
- no plaintext passwords
- no reversible password encryption
- no passwords in logs
- no secrets in client bundles

Document whether passwords are primary, fallback, or optional.

==================================================
SESSION SYSTEM
==================================================

Create a canonical session model supporting:

- session ID
- user identity
- account/workspace context
- device ID
- authentication method
- authentication strength
- issued time
- last activity
- expiry
- absolute expiry
- refresh behavior
- revocation state
- session scope
- risk state
- IP/network metadata only where privacy policy permits
- user agent/platform metadata
- step-up authentication state
- organization policy binding
- session version
- parent/delegation relationship where relevant

Sessions must support:

ACTIVE
EXPIRED
REVOKED
LOCKED
SUSPICIOUS
REAUTH_REQUIRED
TERMINATED

Refine if a better state model is justified.

==================================================
TOKEN / CREDENTIAL ARCHITECTURE
==================================================

Design secure credential handling.

Where token-based architecture is used, address:

- access tokens
- refresh tokens
- token rotation
- replay detection
- revocation
- theft resistance
- audience
- issuer
- scope
- expiry
- token binding where practical
- refresh-token reuse detection
- key rotation
- compromise recovery

Do not store sensitive long-lived tokens insecurely in browser localStorage if safer platform-specific alternatives exist.

Document web/PWA/native differences.

==================================================
DEVICE IDENTITY
==================================================

A device must have a stable HEY device identity independent from:

- display name
- IP address
- browser user agent
- model name

Device record should support:

- device ID
- owner/account relationship
- display name
- platform
- OS/version
- app/runtime version
- device class
- trust state
- enrollment time
- last seen
- last successful authentication
- capability summary
- public key / device-bound credential reference where applicable
- managed/unmanaged status
- personal/shared/public device classification
- compromise state
- revocation state
- attestation metadata where supported
- sync status

==================================================
DEVICE TRUST STATES
==================================================

Create a meaningful state model such as:

UNKNOWN
NEW
PROVISIONAL
TRUSTED
HIGH_TRUST
MANAGED
SHARED
RESTRICTED
SUSPICIOUS
COMPROMISED
LOST
REVOKED
RETIRED

Do not blindly use these exact names if research supports better semantics.

Define:

- how trust increases
- how trust decreases
- trust decay
- trust reset
- compromise response
- lost-device response
- admin-managed trust
- owner-managed trust
- re-enrollment
- reauthentication requirements

==================================================
DEVICE ENROLLMENT
==================================================

Support flows for:

- first device
- additional phone
- tablet
- desktop
- browser-only device
- legacy/lightweight HEY terminal
- managed organization device
- shared household device
- temporary device
- public/shared device
- remote server/home server

Enrollment must distinguish:

DEVICE REGISTRATION

from

DEVICE TRUST.

A registered device is not automatically highly trusted.

==================================================
DEVICE CRYPTOGRAPHIC IDENTITY
==================================================

Where technically viable, design device-bound cryptographic identity.

Examples may include:

- generated device keypair
- hardware-backed key storage
- secure enclave/keystore
- WebAuthn credentials
- signed enrollment challenges
- key rotation

Do not assume hardware-backed keys exist everywhere.

Provide graceful fallback with clearly lower trust.

==================================================
DEVICE ATTESTATION
==================================================

Support optional platform attestation when available.

Attestation must be treated as an additional signal, not magical proof of absolute safety.

Design:

- supported attestation provider abstraction
- attestation freshness
- failure handling
- unsupported-platform fallback
- privacy impact
- organization policy requirements

==================================================
DEVICE MESH IDENTITY
==================================================

Prompt 01 established HEY Device Mesh.

This package must support identity for a distributed HEY environment.

A mission may involve:

phone
+
tablet
+
desktop
+
home server
+
cloud

Each participating device must be individually identifiable and trust-evaluated.

Cross-device requests must preserve:

- initiating user
- initiating device
- executing device
- account/workspace
- session
- mission
- Action Mandate reference
- trust state
- verification result

==================================================
LEGACY / ULTRA-LIGHT DEVICES
==================================================

HEY must support extremely weak devices.

Do not require large crypto libraries, LLM runtimes, heavy frameworks, or modern GPUs just to participate.

For Class 0 legacy terminals:

support identity through gateway-mediated authentication where feasible.

For Class 1 HEY Edge:

support the smallest secure device identity possible.

For Class 2 and 3:

richer cryptographic/device-security options may be available.

Never claim an old Nokia can expose OS functionality its platform does not expose.

==================================================
MULTI-ACCOUNT / MULTI-WORKSPACE
==================================================

Support one human being connected to multiple contexts.

Switching contexts must be explicit and safe.

Examples:

Personal
School
Family
S&A
Client company

Prevent:

- sending work files into personal Cosmos accidentally
- using personal credentials in organization missions
- organization admins seeing personal HEY
- personal memory affecting restricted business decisions without policy permission
- wrong-account actions

==================================================
ORGANIZATION IDENTITY
==================================================

Organizations need:

- organization ID
- membership ID
- role identity
- membership lifecycle
- invitation
- suspension
- removal
- role change
- managed device relationship
- SSO relationship
- admin role
- audit identity

Do not implement the whole organization policy/admin system yet.

Build identity/membership contracts.

==================================================
FAMILY IDENTITY
==================================================

Support future:

- adult account
- child/minor account
- guardian relationship
- household membership
- shared household devices
- private personal spaces
- shared spaces

Guardian relationship must NOT mean unlimited hidden surveillance.

Build boundaries explicitly.

==================================================
MINOR ACCOUNT REQUIREMENTS
==================================================

HEY must support minors.

Design age-aware identity/account metadata carefully.

Do not expose unnecessary age data broadly.

Prepare for jurisdiction-sensitive rules.

Support:

- minor account classification
- guardian/consent relationship where required
- age-appropriate defaults
- restricted commerce authority
- stricter privacy
- stronger ad/sponsorship controls
- school account separation from personal account

Do not hard-code one country's legal thresholds.

==================================================
GUEST / SHARED DEVICE MODE
==================================================

Design sessions for:

- shared tablets
- school smart displays
- borrowed computers
- public terminals
- presentation mode
- family devices

Requirements:

- reduced local persistence
- no silent Cosmos leakage
- hidden notifications
- no long-lived credentials unless explicitly allowed
- automatic timeout
- strong sign-out cleanup
- limited remembered state
- capability restrictions
- easy emergency sign-out

==================================================
SESSION RISK ENGINE FOUNDATION
==================================================

Provide typed inputs for future risk assessment.

Possible signals:

- new device
- impossible travel
- unusual platform
- repeated auth failure
- stolen refresh token
- unusual session creation
- revoked device
- compromised credential
- abrupt location/network change
- abnormal privilege request
- suspicious automation behavior

Do NOT over-collect personal data.

Support privacy-preserving evaluation.

Outputs could include:

LOW
ELEVATED
HIGH
CRITICAL

and required response:

ALLOW
ALLOW_LIMITED
REAUTH
STEP_UP
LOCK
REVOKE

==================================================
STEP-UP AUTHENTICATION
==================================================

Some actions may require stronger proof even during a valid session.

Examples:

- large purchases
- deleting account
- exporting sensitive Cosmos data
- modifying security settings
- adding trusted device
- changing recovery method
- disabling protections
- high-risk enterprise action

Provide contract:

`requireAuthenticationStrength(...)`

Do not implement authorization logic here beyond exposing authentication strength.

==================================================
RECOVERY SYSTEM
==================================================

Design robust recovery for:

- forgotten password
- lost phone
- all passkeys unavailable
- security key lost
- stolen device
- compromised account
- inaccessible email
- enterprise-managed recovery
- child/minor account recovery
- owner/internal emergency recovery

Recovery must not become the weakest authentication path.

Design:

- recovery proofs
- delays for high-risk changes
- notification of recovery attempts
- recovery cancellation where appropriate
- recovery codes/keys
- trusted recovery contacts if justified
- old-session invalidation
- device trust reset
- audit records

==================================================
ACCOUNT COMPROMISE RESPONSE
==================================================

Create workflows/contracts for:

- revoke all sessions
- revoke selected sessions
- revoke devices
- rotate credentials
- revoke API tokens
- revoke extensions where relevant
- invalidate recovery methods
- change passwords/passkeys
- reset device trust
- inspect security timeline
- restore safe access

Do not require rebuilding account identity.

==================================================
ACCOUNT LIFECYCLE
==================================================

Support:

PENDING
ACTIVE
LOCKED
SUSPENDED
RECOVERY_PENDING
DELETION_PENDING
DELETED
DISABLED
COMPROMISED

Refine if needed.

Implement lifecycle state validation.

==================================================
ACCOUNT DELETION
==================================================

Deletion must distinguish:

ACCOUNT IDENTITY DELETION

from data owned by:

- personal Cosmos
- organizations
- shared family spaces
- legal retention obligations
- artifacts shared with others
- purchased marketplace items
- enterprise records

Create deletion contracts but do not implement unrelated data systems.

Support:

- deletion request
- confirmation
- cooling-off period if justified
- session termination
- device revocation
- ownership transfer where needed
- export-before-delete option
- audit evidence
- final deletion state

==================================================
SERVICE / AGENT IDENTITIES
==================================================

HEY has non-human actors.

Create secure identity types for:

- internal service
- HEY agent
- extension
- automation
- integration
- external agent
- background worker

These actors must NOT impersonate the user.

Their actions must always preserve:

human/user authority source
+
service/agent identity

Example:

User Sako
authorized
Agent X
to ask
Device Y
to execute action Z.

The receipt must show all identities.

==================================================
IMPERSONATION
==================================================

Avoid unrestricted impersonation.

For support/admin scenarios, use explicit:

- delegated support session
- scoped access
- expiry
- reason
- audit
- user notification where appropriate
- no raw password sharing

Never implement “log in as user” as an invisible unrestricted backdoor.

==================================================
OWNER / INTERNAL OPERATOR IDENTITY
==================================================

HEY owners/operators need elevated internal capabilities.

But OWNER does NOT mean:

- bypass user encryption
- bypass user privacy
- bypass security invariants
- unrestricted production-data browsing

Build owner/internal identities separately.

Require:

- strong authentication
- short-lived privileged sessions
- explicit reason
- audit
- least privilege
- optional approval for sensitive production access

==================================================
AUTH AUDIT EVENTS
==================================================

Define events for:

- account created
- login success
- login failure
- passkey registered
- passkey removed
- password changed
- password reset
- MFA added
- MFA removed
- recovery initiated
- recovery completed
- recovery cancelled
- session created
- session refreshed
- session revoked
- all sessions revoked
- device registered
- device trust changed
- device revoked
- device lost
- suspicious session detected
- step-up required
- organization membership changed

Use Prompt 01 event/receipt conventions.

==================================================
PRIVACY REQUIREMENTS
==================================================

Identity data is sensitive.

Minimize collection.

Separate:

required operational data

from

optional risk/analytics signals.

Never log:

- passwords
- passkey secrets
- full authentication tokens
- recovery secrets
- private keys
- raw biometric data

Biometric verification should remain platform-managed where possible.

==================================================
OFFLINE AUTHENTICATION
==================================================

HEY offline mode is core.

Design what a previously trusted device may do while disconnected.

Offline behavior must distinguish:

- locally authenticated user
- cached session
- expired session
- revoked-but-device-does-not-yet-know scenario
- local-only actions
- cloud-required actions
- organization policy
- high-risk actions

Offline authority should be narrowly bounded.

On reconnection:

- reconcile revocations
- synchronize security events
- refresh policy
- invalidate stale authority
- resolve pending actions safely

==================================================
SESSION CONTINUITY
==================================================

HEY missions may last hours/days.

Do not couple mission lifetime directly to a short-lived access token.

Support safe reauthentication and continuation.

A mission may pause for:

- expired auth
- reauthentication
- changed workspace membership
- revoked device
- policy change

Mission state survives.

Authority does not.

==================================================
WEAK-DEVICE PERFORMANCE
==================================================

The identity client for HEY Edge must remain lightweight.

Avoid requiring:

- full app framework
- heavy cryptography package when platform primitive exists
- huge dependency trees
- large databases
- model runtime

Define minimal Edge identity protocol.

==================================================
STORAGE SECURITY
==================================================

Document per-platform expectations for secure storage:

- browser/PWA
- Android
- iOS/iPadOS
- Windows
- macOS
- Linux
- server/headless
- legacy gateway

Do not pretend secure storage is identical across all platforms.

==================================================
DATABASE / STORAGE MODEL
==================================================

Design production-ready schemas for at least:

users
accounts
account_memberships
organizations
organization_memberships
workspaces
workspace_memberships
sessions
devices
device_credentials
authentication_methods
passkeys
mfa_methods
recovery_methods
recovery_events
security_events
identity_links
service_identities

You may refine names/normalization.

Include:

- keys
- indexes
- constraints
- lifecycle state
- tenant boundaries
- soft/hard deletion considerations
- timestamps
- versioning
- uniqueness rules

Do NOT assume Supabase until integration.

Provide database-agnostic schema intent plus concrete migration-ready reference implementation.

==================================================
API / SERVICE CONTRACTS
==================================================

Implement or specify production-ready interfaces for operations such as:

createAccount
authenticate
registerPasskey
removePasskey
registerMfaMethod
removeMfaMethod
createSession
refreshSession
revokeSession
revokeAllSessions
registerDevice
enrollDevice
renameDevice
updateDeviceTrust
revokeDevice
markDeviceLost
listSessions
listDevices
beginRecovery
completeRecovery
cancelRecovery
requireReauthentication
verifyAuthenticationStrength
switchWorkspaceContext
createServiceIdentity
revokeServiceIdentity
deleteAccount

Use typed results/errors.

==================================================
SECURITY REQUIREMENTS
==================================================

Test against:

- session fixation
- token replay
- refresh token reuse
- credential stuffing
- brute force
- account enumeration
- weak reset flows
- stolen device
- cloned device identity
- fake device name
- forged session metadata
- cross-workspace token misuse
- cross-organization identity confusion
- privilege confusion
- confused deputy
- stale membership
- revoked device still acting
- compromised passkey
- recovery abuse
- CSRF where applicable
- XSS token theft considerations
- malicious extensions
- fake agent identities
- service identity escalation
- session race conditions
- logout race
- password-reset race
- recovery race
- device-enrollment replay
- invitation replay

==================================================
RATE LIMITING / ABUSE
==================================================

Design identity-sensitive rate controls for:

- login attempts
- signup abuse
- recovery
- email verification
- OTP/TOTP verification
- device enrollment
- passkey registration
- session refresh
- API authentication

Do not make rate limiting depend solely on IP address.

==================================================
OBSERVABILITY
==================================================

Instrument:

- auth success rate
- auth failure types
- refresh failures
- recovery attempts
- recovery success
- session revocations
- suspicious sessions
- device enrollment
- device trust changes
- passkey adoption
- authentication latency

Protect personal information.

==================================================
USER EXPERIENCE STATES
==================================================

Define all major UX states:

- first signup
- returning login
- passkey available
- passkey unavailable
- offline trusted session
- expired session
- reauth required
- suspicious login
- device enrollment
- lost device
- recovery
- account locked
- organization SSO
- shared device
- session expired during mission
- removed from workspace
- deleted account

Create UX contracts and state descriptions.

Do not build the full HEY visual shell.

==================================================
ACCESSIBILITY
==================================================

Authentication cannot depend solely on:

- color
- fine motor gestures
- voice
- biometric
- one specific second factor

Flows must remain accessible to:

- keyboard users
- screen readers
- low-vision users
- users unable to use biometrics
- motor-impaired users

==================================================
LOCALIZATION
==================================================

Design for:

- RTL
- multilingual messages
- locale-aware dates/times
- no English-only auth assumptions
- Unicode-safe identifiers/display names

Security error messages must avoid leaking account existence.

==================================================
PACKAGE STRUCTURE
==================================================

Create:

HEY-NEXT/
  02-identity-accounts-device-trust/
    README.md
    ARCHITECTURE.md
    IDENTITY-MODEL.md
    ACCOUNT-LIFECYCLE.md
    AUTHENTICATION-STANDARD.md
    PASSKEY-STANDARD.md
    SESSION-STANDARD.md
    DEVICE-IDENTITY.md
    DEVICE-TRUST.md
    DEVICE-ENROLLMENT.md
    DEVICE-MESH-IDENTITY.md
    RECOVERY-STANDARD.md
    ACCOUNT-COMPROMISE-RECOVERY.md
    OFFLINE-IDENTITY.md
    SHARED-DEVICE-MODE.md
    MINOR-ACCOUNT-BOUNDARIES.md
    SERVICE-AGENT-IDENTITIES.md
    SECURITY-MODEL.md
    STORAGE-MODEL.md
    API-CONTRACTS.md
    UX-STATES.md
    OBSERVABILITY.md
    DEPENDENCIES.md
    ASSUMPTIONS.md
    LIMITATIONS.md
    INTEGRATION_MANIFEST.md
    MIGRATION_PLAN.md
    EVIDENCE.md

    src/
      domain/
      auth/
      sessions/
      devices/
      recovery/
      services/
      validation/
      security/

    schemas/
    migrations/
    tests/
    integration-tests/
    adversarial-tests/
    fixtures/
    docs/

Refine structure if justified.

==================================================
DEPENDENCY RULE
==================================================

If this package needs external libraries/services:

Record every requirement in:

`DEPENDENCIES.md`

Include:

- package/library
- purpose
- exact or compatible version strategy
- platform
- license
- security considerations
- whether mandatory or optional
- installation command
- alternatives considered

Claude Code will later install and reconcile these dependencies in the real HEY repository.

Do not assume installation magically happens.

==================================================
INTEGRATION MANIFEST
==================================================

`INTEGRATION_MANIFEST.md` must tell Claude Code exactly:

1. What this package owns.
2. What Prompt 01 contracts it consumes.
3. What contracts it exports.
4. Dependencies to install.
5. Database tables/migrations.
6. Environment variables.
7. Authentication-provider assumptions.
8. Web wiring.
9. Backend wiring.
10. PWA wiring.
11. Android wiring.
12. iOS wiring.
13. desktop/native wiring.
14. HEY Edge wiring.
15. Device Mesh wiring.
16. Organization/family integration points.
17. Trust Kernel integration points.
18. Cosmos boundaries.
19. Mission-runtime boundaries.
20. Security events emitted.
21. Session invalidation hooks.
22. Account deletion hooks.
23. Existing identity/auth systems Claude must inspect before migration.
24. Data that must be migrated.
25. Features that must not be duplicated.
26. Required migration order.
27. Required post-integration tests.
28. Rollback procedure.
29. Unknowns requiring inspection of actual HEY.
30. Anything that must be preserved if existing HEY is stronger.

==================================================
RESEARCH REQUIREMENT
==================================================

Where current research is available, investigate primary/authoritative material relevant to:

- WebAuthn
- passkeys
- FIDO2
- OAuth 2.x
- OpenID Connect
- modern browser session security
- refresh-token rotation
- device-bound authentication
- Android Keystore
- Apple Secure Enclave/Keychain
- Windows secure credential storage
- enterprise SSO
- session-risk architecture
- account recovery best practices
- device attestation
- password hashing
- rate limiting
- multi-tenant identity

Do not adopt technology based on marketing.

Document important architectural decisions and rejected alternatives.

==================================================
TEST REQUIREMENTS
==================================================

At minimum test:

ACCOUNT:
- create
- duplicate
- suspend
- lock
- recover
- delete
- invalid transition

AUTHENTICATION:
- valid
- invalid
- brute-force behavior
- account enumeration resistance
- passkey path
- fallback path
- step-up path

SESSION:
- creation
- refresh
- expiry
- absolute expiry
- revocation
- revoke all
- stolen refresh-token reuse
- concurrent refresh
- workspace switch
- removed membership
- logout

DEVICE:
- register
- enroll
- trust upgrade
- trust downgrade
- rename
- mark lost
- revoke
- cloned identity
- stale credentials
- shared-device mode
- offline mode

RECOVERY:
- valid recovery
- invalid proof
- expired recovery
- reused recovery
- compromised device
- attacker attempts takeover
- recovery notification
- session invalidation

WORKSPACE:
- personal/work separation
- organization context
- family context
- cross-context misuse

SERVICE/AGENT:
- agent identity cannot impersonate human
- service identity cannot escalate
- revoked service cannot act

SECURITY:
- replay
- CSRF where applicable
- stolen token
- session fixation
- enrollment replay
- cross-tenant access
- stale membership
- race conditions

OFFLINE:
- valid cached local session
- expired offline authority
- revoked server-side device reconnecting
- offline low-risk action
- offline high-risk action
- reconnect reconciliation

==================================================
INDEPENDENT VERIFICATION
==================================================

After implementation:

Run a separate verification pass whose purpose is to disprove the package’s security and correctness.

Try to prove:

- identity boundaries can be crossed
- sessions survive revocation incorrectly
- device trust can be forged
- recovery can be abused
- organization membership leaks
- a service account can impersonate a user
- a shared device leaks personal Cosmos
- offline mode grants too much authority
- passkey removal creates account lockout
- old sessions survive credential reset
- account deletion leaves active credentials
- client claims can override server identity

Fix every reproducible defect.

==================================================
FINAL RESPONSE
==================================================

Report:

1. Package created.
2. Exact files created.
3. Architecture implemented.
4. Authentication methods supported by the package.
5. Session model.
6. Device identity/trust model.
7. Recovery design.
8. Database/schema work.
9. Dependencies.
10. Tests and exact results.
11. Adversarial/security tests and exact results.
12. Performance/weak-device findings.
13. Offline findings.
14. Remaining limitations.
15. Items requiring real HEY integration.
16. Anything UNVERIFIED.
17. Evidence for every completion claim.

Do not claim the entire HEY identity system is production-ready until it has been integrated into the actual HEY application and independently verified there.

Build the package to the maximum production quality possible without the unavailable real HEY repository.



STEP 02 MANDATORY COMPLETION PASS
Continue the same package. Do not restart or create a duplicate.
The missing real HEY repository only excuses actual HEY wiring and genuine provider/platform verification.
Finish every independently implementable identity/security capability, especially the Step 02 completion items in the global guide.
Do not fake real email/SMS, enterprise SSO, biometrics, attestation, OS secure storage, or production DB deployment; instead implement exact production interfaces, conformance tests, isolated TEST-ONLY adapters, and explicit integration requirements.
Run hostile attacks for replay, refresh reuse, fixation, brute force, recovery takeover, device cloning, stale membership, cross-workspace, offline over-authorization, service impersonation, deletion-surviving credentials, and races. Fix every reproducible defect.


####################################################################################################
SPECIAL MANDATORY COMPLETION PASSES FOR STEPS 03-04
####################################################################################################

HEY PROMPT 05/47 — HEY Brain, Orchestration & Intent-to-Reality Graph

You are the principal production engineer for HEY responsible for: HEY Brain, Orchestration & Intent-to-Reality Graph.

Create the production-grade integration-ready package:

`HEY-NEXT/05-hey-brain-orchestration/`

PACKAGE OWNERSHIP
Own HEY Brain: the canonical orchestrator that converts user intent into the smallest sufficient plan, selects reasoning mechanisms, routes to missions/tools/models/agents/devices, maintains an Intent-to-Reality Graph, and never confuses a plan or model statement with a real outcome.

DEPENDENCY INTENT
This package conceptually depends on: Prompts 01-04.
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

- Intent parsing into goal, constraints, success criteria, risk, evidence need, locality/privacy, urgency, and ambiguity.
- Clarification optimizer: ask only when uncertainty materially changes outcome; otherwise state assumptions and proceed.
- Goal decomposition, dependencies, critical path, reversibility, and replanning.
- Intent-to-Reality Graph linking intent -> assumptions -> plan -> authority -> actions -> observations -> verified outcomes -> evidence -> learning.
- Decision Fabric Beyond Tokens: deterministic code/rules/cache/algorithms/retrieval/solvers/classifiers/local/cloud/specialists/councils.
- Deliberation Budgeter controlling depth, parallelism, model strength, research breadth, verification intensity, and cost.
- Planner/executor/verifier separation for consequential work.
- Conditional contrarian, flaw hunter, missing-requirement, second-order, assumption-breaker, opportunity-hunter, and independent-verifier passes.
- Outcome-centric routing: prefer direct tool/API/deterministic execution over conversational output when the user asked for action.
- Plan adaptation after events, changed constraints, failures, new evidence, revoked authority, or interruption.
- State continuity across Chat, Voice, Live, Dynamic Island, automations, devices, and future surfaces.
- Explainability contract for why plan/tool/model/device/clarification/escalation was chosen without exposing hidden chain-of-thought.
- Anti-fake-done: completion only from verified mission results.
- Unsupported-platform planning with alternate devices/tools instead of fake parity.
- Root-cause workflow for debugging.
- Decision-journal hooks and Forge/Mission Compiler handoff for repeated stable plans.

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

HEY-NEXT/05-hey-brain-orchestration/
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

- One ambiguity requires clarification; another does not.
- Model proposes action but no tool executes.
- Tool reports success but postcondition fails.
- Provider/model/tool/device unavailable; reroute.
- User constraint conflicts with organization policy.
- Plan changes after approval; old mandate cannot authorize new target.
- Repeated task suitable for deterministic fast path.
- High-stakes decision invokes stronger evidence/contrarian pass.
- User cancels during replan.
- Cross-surface continuation preserves mission identity.

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

HEY PROMPT 32/47 — Families, Minors, Household, Social & Community

You are the principal production engineer for HEY responsible for: Families, Minors, Household, Social & Community.

Create the production-grade integration-ready package:

`HEY-NEXT/32-family-social-community/`

PACKAGE OWNERSHIP
Own HEY's family/household/minor and optional social/community foundations with explicit privacy, transparent guardian relationships, shared coordination and safe minor defaults.

DEPENDENCY INTENT
This package conceptually depends on: Identity, Trust, Cosmos, Device, Billing and global contracts.
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

- Family/household membership, roles, shared/private spaces, calendars/tasks/lists/docs/devices.
- Guardian/minor metadata and jurisdiction-aware hooks.
- Transparent parental controls; no covert surveillance.
- Minor-safe privacy/commerce/sponsorship/public-sharing/retention/high-risk defaults.
- Household shared-device guest/privacy modes.
- Elder assistance and trusted-contact escalation with consent.
- Family emergency info/plan offline.
- Household knowledge base with shared ownership.
- No automatic sharing of private Cosmos.
- Family billing hooks with separate identities/data.
- Optional community spaces/projects/knowledge/templates/collaboration.
- Community discovery without selling private profiles.
- Group decisions with evidence/dissent/consensus.
- Human-governed moderation assistance.
- Anti-spam/scam/abuse.
- Contribution-based reputation if used.
- Social/contact boundaries/blocklists.
- Data export/deletion and minor-to-adult transition.

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

HEY-NEXT/32-family-social-community/
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

- Guardian private-data boundary.
- Minor purchase.
- Household member leaves.
- Shared-device notification leak.
- Private memory suggested in shared space.
- Community scam attack.
- Moderation uncertainty.
- Minor ages into adult.
- Concurrent family calendar edits.
- Sponsored community item labelled.

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

HEY PROMPT 44/47 — Product Design, Premium UX, Onboarding, Discoverability & Psychology

You are the principal production engineer for HEY responsible for: Product Design, Premium UX, Onboarding, Discoverability & Psychology.

Create the production-grade integration-ready package:

`HEY-NEXT/44-product-design-ux/`

PACKAGE OWNERSHIP
Own HEY's product experience system: premium visual language, information architecture, onboarding, discoverability, states, interaction consistency, personalization, perceived performance and ethical behavioral psychology.

DEPENDENCY INTENT
This package conceptually depends on: All user-facing systems and global design/accessibility/privacy contracts.
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

- Design system: near-black graphite glass, restrained nature accents, strong type, realistic depth, premium motion, customizable themes.
- Tokens/components across web/native/artifacts.
- Home mixes conversation with editable Now/dynamic workspace; compact Island/extensions stay focused.
- IA for Chat/Search/Create/Cosmos/Automate/Projects/Trust/Settings/Marketplace/Developer/Owner without clutter.
- First-run onboarding that learns goals progressively.
- Progressive permissions with clear value/risk.
- Capability discovery via context, command search and tutorials through real tasks.
- Advanced Mode for providers/agents/logs/tools/permissions/debug while normal UI stays simple.
- Truthful empty/loading/progress/waiting/degraded/offline/error/recovery states.
- Perceived performance via streaming/background continuation, never fake progress.
- Personal layouts/widgets/modes/themes/voice/accessibility.
- Ethical psychology: cognitive load, salience, commitment, implementation intentions, reversible defaults, real social proof, meaningful celebration.
- Ban fake scarcity/urgency/coercion/addiction/hidden sponsorship.
- Attention-respect metric.
- Public/shared privacy and presentation mode.
- Responsive mobile/tablet/desktop ergonomics.
- Privacy-safe confusion/friction instrumentation.
- Microcopy standards for permissions/security/errors/irreversible actions.

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

HEY-NEXT/44-product-design-ux/
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

- Meaningful first task with minimal setup.
- Permission request comprehensible/reversible.
- Long mission status truthful.
- Offline/degraded UX.
- Mobile one-handed.
- Tablet multi-pane/pen.
- Accessibility modes.
- Sponsored separation.
- Advanced Mode hidden from ordinary user.
- Recovery copy works.

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

## 3. FINAL NAVIGATION AND STARTUP BEHAVIOR

After sign-in, the default destination is the unified HEY Chat/Voice conversation surface—not a generic dashboard.

Chat and Voice share the same conversation, memory, active project, files, artifacts, tools and mission state.

Also provide five prominent, accessible product destinations:

**Home:** HEY conversation, voice, contextual Now content, favorites and active work.

**Tools:** Every available built-in application, capability, integration and workflow.

**Spaces:** Custom environments containing projects, tools, widgets, shortcuts and saved work.

**Activity:** Missions, approvals, automations, notifications, results, errors and recovery.

**Settings:** Account, devices, models, preferences, subscriptions, integrations, privacy and permissions.

A user may choose another preferred startup destination.

Desktop uses appropriate sidebar navigation; mobile uses appropriately adapted navigation; tablets receive layouts optimized for available space.

Do not force users to navigate through a dashboard before interacting with HEY.

## 4. NEW PERSONALIZED ONBOARDING

The first important personalization question is:

**"Why do you want to use HEY?"**

Offer these choices:

- AI Assistant — chat, research, questions and general help.
- AI Models — model selection, comparison, adaptation and experimentation.
- Control & Automation — gestures, dictation, VoiceOS, computer control and workflows.
- Create & Build — images, videos, presentations, documents, software and other content.
- Teaching & Learning — lessons, quizzes, teaching tools and study.
- Life & Work — planning, projects, productivity and personal organization.
- Custom — describe what HEY should help accomplish.
- Skip — enter HEY without personalization.

Allow multiple selections.

Based on the selections, configure relevant recommendations, pinned tools, shortcuts, workspace suggestions and initial setup.

DO NOT restrict the user's accessible capabilities to their selected categories.

DO NOT create separate intelligence systems or identities for each choice.

After onboarding, users can change every preference.

Personalization must never override account authorization or organizational data boundaries.

## 5. UNIVERSAL CUSTOMIZABLE HEY SPACES

Modes are starting configurations, not permanent restrictions.

For example, a Developer user may add Lesson Creator, smartboard controls, video generation or any other permitted tool.

A Teacher user may add Software Studio or Model Lab.

Support:

- Create and delete Spaces.
- Rename Spaces.
- Start with a template or empty Space.
- Add/remove tools from any category.
- Pin and reorder tools.
- Move and resize widgets.
- Save personalized shortcuts.
- Add projects and artifacts.
- Configure layouts.
- Change appearance and presentation preferences.
- Save configurations across sessions and appropriate devices.
- Import or duplicate compatible Space layouts.
- Undo and restore layout changes.
- Create a Space from natural-language instructions, with preview before application.

Examples:

Personal Space.
Developer Space.
Teacher Space.
Creator Space.
Business Space.
Completely Custom Space.

A visual Space change must not silently change what data the user is authorized to access.

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
