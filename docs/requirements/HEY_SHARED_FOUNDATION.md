# HEY shared foundation and architecture

Complete shared Source A foundation files copied verbatim. Read this file and Source C before your task-specific brief.

# FILE: `00_FOUNDATION/00_READ_ME_FIRST.md`

# HEY — FINAL ABSOLUTE SOURCE OF TRUTH

This folder is the final authoritative product/engineering specification for **HEY** and supersedes every earlier HEY planning document. There is no V1/V2 split in this source: the product is simply HEY.

## Precedence
1. Files in `00_FOUNDATION`, `02_INTELLIGENCE_EVOLUTION`, `03_INTERACTION_PLATFORM`, `04_SECURITY_GOVERNANCE`, `05_EXECUTION` and `06_PROMPTS` contain the newest decisions and override conflicting older wording.
2. `01_DETAILED_SYSTEM_SPECS` preserves the exhaustive earlier capability, design, answer, motion and subsystem detail so no approved capability is lost. Where it conflicts with newer files, newer files win.
3. No `.txt` deliverables are used.

## Product rule
Do not stop because a subsystem merely works. Preserve what is strong, replace what is weak, integrate missing layers, test failures, independently verify the outcome, and stop only when the subsystem reaches the strongest production implementation justified by the platform and current engineering reality.

## HEY is one intelligence
Users interact with HEY, not with a giant catalog of bots. Internally HEY may use unlimited specialized agents, models, deterministic engines, tools, workflows and providers. Only the relevant subset is retrieved for a mission.

## Completion means end-to-end
A feature is complete only when applicable discovery, UX, backend, persistence, permissions, authorization, security, abuse/cost protection, recovery, verification, performance, accessibility, localization, tests, tutorials/help, observability and production behavior all pass. UI-only, backend-only, mocked, unverified and partially integrated features are not complete.

## Owners
There are exactly three top-level HEY owners. Any one owner can approve ordinary internal evolution. Public third-party extension publication requires all three. Proven critical security fixes may auto-deploy under emergency policy and must immediately notify all three owners with exact changes, evidence and rollback.

## Budget
HEY is no longer free-only. Paid infrastructure/models are allowed when their measurable improvement justifies cost. Architecture remains provider-agnostic and cost-aware.


---

# FILE: `00_FOUNDATION/01_COMPLETION_AND_REPLACEMENT_CONTRACT.md`

# Completion & Replacement Contract

For every subsystem the implementation agent must: audit current code → preserve unique strengths → replace weaker architecture when justified → connect every missing layer → remove obsolete duplicates after safe migration → test normal and failure paths → independently verify → benchmark where relevant → leave rollback evidence.

Maturity is `MISSING → DESIGNED → IMPLEMENTING → FUNCTIONAL → INTEGRATED → VERIFIED → PRODUCTION_READY`. Anything below `PRODUCTION_READY` continues to be worked on.

When two implementations overlap, keep the stronger one and transplant any unique useful behavior from the weaker one before removing it. A public rename is allowed when it materially improves the product; all public-facing renames must be reported afterward.

Long tasks must be cancellable. Pause/resume/checkpointing is required where technically useful. Destructive or large edits create restore points. External side effects are verified where possible.

A feature cannot be called complete from a page existing, a backend function existing, tests passing in isolation, or an HTTP 200. The actual user goal must work end-to-end.


---

# FILE: `02_INTELLIGENCE_EVOLUTION/01_COGNITIVE_FABRIC_AND_INTELLIGENCE_COUNCIL.md`

# Cognitive Fabric & Intelligence Council

HEY does not treat one LLM response as the definition of intelligence. It composes the best topology for the task: one fast model, deterministic engine, cheap→strong cascade, planner/executor/verifier, parallel experts, critic/reviser, tournament, simulation, or a full **Intelligence Council**.

## Meeting-room architecture
For difficult decisions, relevant specialists enter one shared deliberation room. They see the same Evidence Board containing facts, primary sources, constraints, assumptions, calculations, proposals, objections and unresolved questions. They can challenge one another, revise proposals and introduce ideas missed by the original prompt.

Consensus is **evidence-weighted**, not vote-counted. A strong minority objection cannot be erased merely because many agents agree. A Dissent Guardian preserves material disagreement. A Contrarian and Flaw Hunter deliberately attack the emerging consensus. A Deliberation Budgeter stops extra rounds once marginal improvement no longer justifies latency/cost.

## Example topologies
- Simple question: one fast low-cost model.
- Complex factual answer: researcher + source verifier + synthesis + fact checker.
- Coding: architect + implementers + test + security + reviewer + independent verifier.
- Company strategy: product, market, finance, technology, operations, customer, risk, contrarian, opportunity, long-term and synthesis specialists in debate rounds.
- High-assurance security: multiple independent threat models + exploit simulation + mitigation design + verifier.

## Required components
Expert Selector; Council Chair; Evidence Board; Dissent Guardian; Contrarian; Flaw Hunter; Assumption Breaker; Missing-Requirement Hunter; Opportunity Hunter; Second-Order Effects Agent; Consensus Synthesizer; Independent Verifier; Deliberation Budgeter; provenance/cost/latency tracing.

## Goal
Use orchestration, tools, memory, retrieval, specialization, verification and parallelism to outperform the underlying individual model whenever these mechanisms create a real task-level advantage. Measure the result rather than claiming universal superiority.


---

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

# FILE: `02_INTELLIGENCE_EVOLUTION/03_UNLIMITED_AGENT_FOUNDRY.md`

# Unlimited Agent Foundry

The old 229-agent catalog is a seed, not a ceiling. HEY starts with every useful known specialist family and can create narrower specialists whenever measured benefit is positive. There is no arbitrary numeric limit.

## Hierarchy
`HEY → domains → agent families → specialists → ultra-specialists → temporary task specialists`.

Only relevant agents are loaded into a mission. A million registered specializations must not mean a million prompts are injected into every context.

## Mandatory specialist families
Core orchestration; memory/Cosmos; research; engineering; security; risk; QA; provider/model; optimization; computer/browser/files; voice; vision; screen/camera guidance; platform-native; product/UX; accessibility/localization; creation; business; education; religious research; devices; automation; Forge; Evolution; governance; billing; observability; recovery; legal/privacy information; data/statistics; support/incident.

## New required specialist examples
Flaw Hunter, Missing Requirement Hunter, Assumption Breaker, Opportunity Hunter, Second-Order Effects, Latency Hunter, Token Efficiency, Prompt Compiler, Spec Retrieval, Duplicate Work Detector, Cost Leak Hunter, Context Quality, Risk Twin, Solution Twin, Data Exfiltration Hunter, Supply Chain Hunter, Sandbox Escape Hunter, Rate-Limit Architect, Public Claims Auditor, User Confusion Hunter, Future Compatibility, Staleness Propagation, Outcome Judge.

## Agent creation lifecycle
Need detected → registry/duplicate search → contract design → simulation → benchmark against existing agent/team → security/permissions review → temporary deployment → measured production shadow → promotion if useful → health monitoring → merge/retire/rollback when superseded.

Every agent declares typed inputs/outputs, tools, permissions, provider policy, privacy, risk, budget, timeout, retry, cancellation, checkpoint behavior, verification, tests, health, version and dependencies. Agents cannot grant themselves permissions or self-certify success.


---

# FILE: `02_INTELLIGENCE_EVOLUTION/04_RUNTIME_CAPABILITY_SYNTHESIS.md`

# Runtime Capability Synthesis

When a user requests an outcome for which HEY has no current capability, HEY should not default to “unavailable.” It should attempt to synthesize the missing capability safely.

## Flow
Request → capability search → gap confirmed → research implementation paths/APIs/libraries/local methods → choose architecture → create smallest capable tool/workflow/agent/adapter/code module → dependency/provenance checks → sandbox → Risk Twin → Solution Twin → adversarial tests → functional tests → execute the original user task → verify outcome.

The synthesized capability is **temporary by default**. The controlling user/owner can choose:
- Save;
- Modify, then Save;
- Delete.

Until saved it is isolated, scoped and disposable. Saved capabilities are versioned, auditable and rollbackable.

## Safety without making the feature weaker
Undo is valuable but cannot reverse exfiltration, an external payment or public disclosure. Therefore generated capabilities use scoped permissions, network/filesystem/tool allowlists, resource budgets, snapshots, sandboxing and action verification before execution. The Solution Twin must find designs that preserve or improve useful capability rather than lazily deleting risky functionality.

## Capability provenance
Record why it was created, models/agents involved, source research, dependencies, permissions, code/config changes, test results, risk findings, mitigations, version, usage and save/delete decision.


---

# FILE: `02_INTELLIGENCE_EVOLUTION/05_RISK_TWIN_SOLUTION_TWIN.md`

# Risk Twin + Solution Twin

Every substantial new capability or architecture change is reviewed by two adversarially complementary systems.

**Risk Twin** searches for security, privacy, data-loss, reliability, compatibility, performance, cost, abuse, UX, accessibility, supply-chain, prompt-injection, permission, legal/policy and second-order failure modes.

**Solution Twin** receives every finding and has two responsibilities:
1. eliminate or contain the risk without unnecessarily reducing capability;
2. actively discover additional technologies, architectures or features that make the capability stronger, faster, simpler, cheaper, safer or more reliable.

Then a second Risk Twin pass attacks the revised design. An independent verifier decides whether the residual risk and functionality meet policy.

The default sequence is `maximize capability → enumerate risks → strengthen design + mitigate risks → attack again → verify`, not `see risk → delete feature`.


---

# FILE: `02_INTELLIGENCE_EVOLUTION/06_EVOLUTION_ENGINE_WHOLE_INTERNET.md`

# Evolution Engine — Continuous Whole-Internet Discovery

HEY continuously learns about the external world so the product does not freeze at today's capabilities.

## Two layers
**Continuous watchers** detect high-value changes immediately.
**Daily Deep Sweep** performs an exhaustive broad-category research cycle every 24 hours.

## Scope
The sweep is not limited to AI. It searches every category that could improve HEY or its users: software, hardware, operating systems, browsers, developer tools, APIs, open source, security, networking, databases, distributed systems, science, mathematics, education, productivity, business, finance, design, accessibility, language, media, communications, consumer apps, enterprise software, robotics, HCI, standards, protocols, legal/platform policy changes, healthcare-information tools, creative tools, automation, devices, new research fields and newly emerging categories not known when this document was written.

## Pipeline
Discovery → primary-source extraction → source/freshness verification → categorization → dedup against discovery history → compare against HEY → benchmark claims where possible → quantify improvement/risk/cost → architecture proposal → Risk Twin → Solution Twin (mitigate + strengthen) → independent critic → concise owner proposal.

Normal internal evolution needs any one of the three owners to approve. Approved work goes through implementation branch, security, tests, shadow deployment/canary, independent verification and rollback-ready promotion.

## Memory
The engine remembers discoveries, benchmarks, adopted/rejected proposals, rejection reasons, failed migrations and superseded systems so it does not waste resources rediscovering the same item. Rejected ideas resurface only when material new evidence changes the decision.


---

# FILE: `03_INTERACTION_PLATFORM/01_CHAT_VOICE_LIVE_UNIFIED.md`

# Unified Chat, Voice & Live

Chat and Voice are the same canonical conversation. Voice is not a separate history. A voice turn becomes part of chat history; text and voice share project, files, active artifacts, missions and Cosmos context.

## Different answer styles, same intelligence
Chat can be structured, detailed, source-rich and artifact-heavy. Voice is shorter, more natural, interruption-friendly and spoken in smaller turns. A full transcript/result can still appear in the shared conversation. Raw microphone audio is not retained by default after processing unless the user explicitly saves it. Private Mode can avoid durable transcript/memory according to settings.

Switching `Chat → Voice → Live → Chat` must preserve context.

## Live
HEY Live can combine voice with the user's chosen screen/window/monitor/region, camera, files and project context. Guide mode explains; Assist mode helps with bounded actions; Act mode performs authorized actions and verifies results.


---

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

# FILE: `03_INTERACTION_PLATFORM/03_PLATFORM_OUTCOME_PARITY.md`

# Platform Outcome Parity

HEY targets the same **user-level capabilities** across Windows, macOS, Linux, Android, iOS/iPadOS and web/PWA. The internal method can differ because operating systems expose different APIs.

Shared HEY Brain sits above platform Capability Adapters. Each adapter declares what native mechanisms are available, permission state and health. If one device cannot directly perform a step, HEY may compose official OS automation, app intents/shortcuts, accessibility APIs, screen/camera guidance, browser capabilities, a native companion, trusted-device handoff or institution-managed device controls to achieve the same user goal where technically legitimate.

### Examples
Windows: native helper, UI Automation, screen capture, PowerShell/terminal, window/process/filesystem APIs.
macOS: Accessibility API, ScreenCaptureKit, Shortcuts/AppleScript where appropriate, native helper/menu bar.
Linux: Wayland/X11/desktop portals, DBus, shell/native services.
Android: intents, accessibility service when justified/user-enabled, MediaProjection, camera/mic, foreground services, notifications, sideloadable APK before store distribution.
iOS/iPadOS: App Intents, Shortcuts, universal links/URL schemes, ReplayKit/screen broadcast where applicable, camera/mic, Live Activities/Dynamic Island, share extensions, document picker, background tasks within OS limits, and MDM/supervision for eligible institutional deployments.
Web/PWA: manifest/service worker/install, getDisplayMedia/getUserMedia, File System Access where supported, notifications/share/file handlers.

Do not assume an unrestricted iOS terminal exists for ordinary third-party apps. Use the strongest legitimate composition of supported mechanisms instead of building against a false privilege model.

Store publication is not required immediately. Architecture must support PWA, desktop installers and legitimate sideload/institutional distribution paths until App Store/Play Store distribution becomes feasible.


---

# FILE: `03_INTERACTION_PLATFORM/04_DYNAMIC_ISLAND_BACKGROUND.md`

# Dynamic Island & Background HEY

Dynamic Island is a native/persistent HEY surface on supported platforms, not merely a React component inside the main page. It remains when the main HEY window is minimized or closed while the helper/background runtime is enabled.

Modes include idle, listening, thinking, speaking, media, mission, generation, research, upload/download, timer, reminder, approval, cross-device handoff, error/recovery and completed result. Clicking expands context-specific controls rather than a generic Activity screen.

Long-running HEY work is durable state, not one immortal process. Local helpers and server schedulers checkpoint/resume work across crashes, deployments, device restarts and sleep where the platform permits. Owners and authorized users retain stop/revoke controls; an unkillable malfunctioning process is not a feature.

Camera/screen sharing stops when the session ends and normally on main-window close unless an explicit visible background session is active.


---

# FILE: `04_SECURITY_GOVERNANCE/01_OWNER_CONSOLE_AND_GOVERNANCE.md`

# HEY Owner Console & Governance

Exactly three top-level owner identities exist. The Owner Console has a distinct high-security UI and stronger authentication/re-auth policies than normal HEY.

It includes Evolution proposals, discovered vulnerabilities, emergency auto-patches, capability changes, third-party submissions, agent/provider health, global spend, releases, feature flags, rollback, quarantine, incident history and audit trails.

- Normal internal improvement: any one owner approval is sufficient.
- Third-party public extension publication: all three owners approve.
- Proven critical security patch: may auto-deploy under emergency policy, then immediately notify all three owners with what changed, why, evidence, tests, side effects, what should be removed/changed next and rollback.
- No normal admin flow can add a fourth owner.

Owner accounts should use the strongest available account security, including passkeys/MFA/re-auth/device trust where implemented.


---

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

# FILE: `04_SECURITY_GOVERNANCE/03_RATE_LIMITS_COMPUTE_ALLOWANCES_CONTINUITY.md`

# Rate Limits, Compute Allowances & Atomic Completion

HEY uses distributed server-side rate limiting for expensive/sensitive routes. Limits are endpoint- and cost-aware, not one global frontend counter. Authenticated identity, organization/user ID and appropriate network/device signals are combined; anonymous auth/signup/recovery routes receive separate abuse protection. 429 responses are structured and include retry timing.

## Compute Allowances
User-facing plans should not fundamentally be measured in “hours” or raw tokens. Internal allowance accounting can combine provider spend, input/output tokens, image/video/audio generations, tool/API costs, parallel agents, GPU/compute and long-running background duration. The UI can present a simple understandable capacity meter.

## Atomic Completion / Continuity Reserve
HEY does not randomly stop halfway through a coherent unit when an allowance boundary is reached. It may use a bounded continuity reserve to finish the current file/slide/artifact step/tool transaction, then checkpoint.

It reports: what completed, why it paused, exact saved state, what remains and how to resume. The reserve is capped so a user cannot start an enormous costly job with almost no allowance remaining and force unlimited completion.


---

# FILE: `04_SECURITY_GOVERNANCE/04_CLOSED_SOURCE_API_LOCAL_MODELS_EXTENSIONS.md`

# Closed Source Core, APIs, Local Models & Third-Party Extensions

HEY's core codebase remains closed source. Users do not need source access to use local models.

HEY exposes stable API/SDK contracts for models, tools, agents, workflows, widgets and integrations. Local inference options can include Ollama, llama.cpp, LM Studio, vLLM/OpenAI-compatible endpoints, a HEY local runtime and trusted LAN/self-hosted endpoints.

A model profiler records context, tool calling, JSON reliability, modalities, speed, resource use and benchmark quality so the Router can use local models intelligently.

Third-party developers can build extensions through public SDKs/contracts. Before privileged public distribution: automated validation, dependency/supply-chain scan, sandbox, permissions review, security tests, compatibility tests and **all three owners' approval**. Approved packages are signed/versioned and can be revoked/quarantined.


---

# FILE: `05_EXECUTION/01_REPOSITORY_IMPLEMENTATION_ORDER.md`

# Repository Implementation Order

The coding agent starts from the current HEY codebase, not from a greenfield rewrite assumption.

1. Inventory routes/components/APIs/edge functions/database/migrations/RLS/auth/providers/agents/tools/workflows/native commands/service worker/config/tests.
2. Search contextually for TODO/FIXME/HACK/TEMP/MOCK/STUB/PLACEHOLDER/coming soon/dummy/localhost/dead flags/duplicate implementations.
3. Build spec↔code map.
4. Fix shared contracts/data/events/auth/security/permissions/rate limits first.
5. Provider/decision/cognitive runtime.
6. Agent registry/verifier/recovery.
7. Cosmos/projects/Pinpoint/artifacts.
8. Chat/Voice/Live/screen-camera guidance/Island/background.
9. Studios/generation.
10. computer/browser/files/device/platform adapters.
11. automations/Forge/capability synthesis/Evolution Engine.
12. plans/billing/API/Education/owner console.
13. discoverability/tutorial/accessibility/localization.
14. whole-system failure/security/performance/production gates.

Every subsystem is audited, improved/replaced, migrated, tested, independently verified and only then marked production-ready.


---

# FILE: `05_EXECUTION/02_FINAL_WHOLE_PRODUCT_GATE.md`

# Final Whole-Product Gate

Before HEY is called finished, a fresh independent verifier runs realistic journeys with no developer cache, plus returning-user projects/memory/artifacts/integrations.

Required stress cases include provider 429/500, selected model disappearance, network drop, offline, expired auth, denied/revoked permission, database outage, duplicate submission, simultaneous requests, tab/window close, native helper restart, corrupted local state, allowance boundary, migration rollback, backup restore, malicious page prompt injection, generated-capability adversarial test, third-party package rejection, cross-project privacy, public-display privacy, mobile/tablet/desktop, RTL/reduced motion and weak hardware.

The final question is:

> If HEY went live to thousands of users right now, what could fail, leak data, waste money, confuse users, falsely claim success, corrupt work, become unrecoverable or make the product feel unfinished?

Every discovered issue is fixed or explicitly accepted/documented by the owners before release.


---
