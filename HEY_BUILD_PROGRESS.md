# HEY build progress ledger

## Phase 1: urgent repair batch

Branch: `codex/production-readiness-2026-10-13`

| Area | Implementation state | Verification | Remaining external boundary |
|---|---|---|---|
| Diagnostics recovery | Implemented adapter-backed recovery with independent postcondition verification; missing adapters are blocked, unverified postconditions fail, and only verified work reports success. Added actual workflow pause and artifact restore adapters. | `tests/production-repairs.test.js` hostile adapter tests; full suite recorded below. | Provider-specific retry, reconnect, fallback, and checkpoint resume require real provider/executor adapters. |
| Developer package checks | Replaced placeholder successes with manifest/schema validation, installed dependency and semantic range checks, SPDX identifier validation, and Ed25519 signatures verified against host-supplied trust roots. Stage and install revalidate. | Signed/tampered/untrusted package tests in `tests/production-repairs.test.js`. | Production signing identities/trust-root configuration are deployment-owner inputs. |
| Automation schedules | Implemented IANA timezone recurrence, DST gap and overlap handling, once/interval/daily/weekly/monthly calculation, durable occurrences, timer rehydration, missed-run recovery without replaying uncertain actions, invalid-schedule rejection, and accurate failed occurrence state. | UTC/timezone/DST, invalid schedule, and failed execution tests in `tests/production-repairs.test.js`. | Cross-process exactly-once scheduling requires a shared transactional scheduler/lock service; current accessible client persistence is not a distributed lock. |

### Verification evidence

- `node --test tests/production-repairs.test.js`: 7 passed, 0 failed (expanded later in this same work session).
- `npm test`: 61 passed, 0 failed.
- `npm run lint`: passed.
- `npm run build`: passed. Sitemap generation was skipped because `SITE_URL` is unset; Vite reported the existing mixed static/dynamic import warning for `src/core/contextManager.js`.
- `git diff --check`: passed.

## Step 01: Global Foundation / Product Constitution / Shared Contracts

Status: **in progress**. The first shared authority contract is implemented in `src/core/actionMandate.js` and exposed through the existing `hey.actions` execution path and `hey.mandates` API. It provides versioned canonical serialization, Ed25519 signing/verification, account/action/resource binding, bounded delegation with signing-key attenuation, expiry, max-use enforcement, revocation and epoch checks, offline opt-in, replay prevention, and atomic use consumption across the delegation chain. A durable store contract is explicit; the in-memory adapter is for local runtime/test use and is not represented as durable production storage. Action and undo admission re-checks after async mandate verification to prevent double execution.

- Step 01 focused tests: 7 passed, including 32-way shared-store use race, tamper, replay, expiry, revocation, delegation attenuation, offline denial, missing store, and execution-boundary denial.
- Whole suite after Step 01 slice: 61 passed, 0 failed.
- Lint and production build: passed; same sitemap input and existing chunking warning noted above.
- Benchmark: 1,000 signature verifications and atomic consumes; 1000/1000 authorized, p50 0.353 ms, p95 0.606 ms, about 2,457 ops/sec in this environment. This measures the in-memory adapter only; durable database latency/concurrency is not measured.
- Adversarial regression: asynchronous mandate verification initially opened a double-dispatch race in the action layer; the existing concurrent action test reproduced a hang/double admission. Admission now rechecks after async authorization, and `tests/security-regressions.test.js` passes 10/10.
- Evidence integrity slice now implemented as `src/core/evidenceIntegrity.js`, exported through `HEY.evidence`, with signed canonical envelopes, account/source binding, digest integrity, freshness, revocation epoch, offline policy, invalidation checks, and fail-closed store behavior. Tests attack cycles, accessors, account mismatch, body tampering, stale limits, offline denial, invalidation, and storage failure.
- Remaining independently implementable Step 01 items: mission persistence/recovery schema contract, policy validation, additional malformed input/property-based cases, and improved independent runtime verification. Do not advance the 47-step sequence until these are implemented and verified.
- Evidence slice verification: focused tests 2 passed; full suite 63 passed, 0 failed; lint passed; production build passed. Sitemap generation skipped because `SITE_URL` is unset; Vite reported the existing contextManager mixed-import warning. No claim of durable evidence storage: current adapter is explicitly in-memory for local/test use.
- External Step 01 constraints: real production authority storage/transaction semantics and deployment signing keys need the connected HEY backend and owner-managed keys; continue defining adapters and conformance tests without claiming them verified.
- Step 01 implementation checkpoint (not completion): local commit `5b3084471b26fada0e189f441a7e8cb6f692161d`; GitHub branch sync commit `096a66904339e7aa3b854b5876c5ba534e2a5e57`.

### Current checkpoint

Local repair commit SHA: `714f3461eb28c0c0cae84937afbab62fe78b8352`.

GitHub development-branch sync commit SHA: `9890ce4f5228c065ab8d6c9bf77cb7919cfb3532` (`sakosalm2812-droid/hey`, branch verified at this SHA). Its tree contains the same repair source/tests as the local repair commit; the SHA differs because the local checkout's parent commit did not match the branch's GitHub commit object. GitHub combined status returned no status checks yet.

Next: finish Step 01 remaining contracts and property/adversarial tests; no separate identity, permission, or mission authority is to be introduced. The 47-step program remains incomplete.

## Parallel execution checkpoint — 2026-10-14

Coordinator branch: `codex/production-readiness-2026-10-13`.

Verified common source tree: `dd81624c0ba54a1d99f998998f89a3364cee4867`, matching GitHub development checkpoint `3320c8ce44df5d3a37a3513b1023300c29cb10fa`.

Execution deadline: 2026-10-15 morning, Asia/Baghdad. Local Git push is unavailable because no GitHub CLI credential is present; publish reviewed work using the connected GitHub integration. Never force-push.

| Worker | Steps | Branch | Worktree | State | Commit / test evidence |
|---|---:|---|---|---|---|
| Coordinator | Step 01 completion + integration | `codex/production-readiness-2026-10-13` | `/tmp/hey-production-work` | Active | Prior emergency fixes and mandate checkpoint recorded above. |
| GPT-6 Luna agent | 02–04 | `codex/par-steps-02-04` | `/tmp/hey-parallel/steps-02-04` | Active | Awaiting implementation. |
| GPT-6 Luna agent | 05–08 | `codex/par-steps-05-08` | `/tmp/hey-parallel/steps-05-08` | Active | Awaiting implementation. |
| GPT-6 Luna agent | 09–11 | `codex/par-steps-09-11` | `/tmp/hey-parallel/steps-09-11` | Active | Awaiting implementation. |
| GPT-6 Luna agent | 12–14 | `codex/par-steps-12-14` | `/tmp/hey-parallel/steps-12-14` | Active | Awaiting implementation. |
| GPT-6 Luna agent | 15–18 | `codex/par-steps-15-18` | `/tmp/hey-parallel/steps-15-18` | Active | Awaiting implementation. |
| GPT-6 Luna agent | 19–21 | `codex/par-steps-19-21` | `/tmp/hey-parallel/steps-19-21` | Active | Awaiting implementation. |
| Next worker slot | 22–27 | `codex/par-steps-22-27` | `/tmp/hey-parallel/steps-22-27` | Prepared | Based on common checkpoint; no worker assigned yet. |
| Next worker slot | 28–30 | `codex/par-steps-28-30` | `/tmp/hey-parallel/steps-28-30` | Prepared | Based on common checkpoint; no worker assigned yet. |
| Next worker slot | 31–35 | `codex/par-steps-31-35` | `/tmp/hey-parallel/steps-31-35` | Prepared | Based on common checkpoint; no worker assigned yet. |
| Next worker slot | 36–38 | `codex/par-steps-36-38` | `/tmp/hey-parallel/steps-36-38` | Prepared | Based on common checkpoint; no worker assigned yet. |
| Next worker slot | 39–42 | `codex/par-steps-39-42` | `/tmp/hey-parallel/steps-39-42` | Prepared | Based on common checkpoint; no worker assigned yet. |
| Next worker slot | 43–45 | `codex/par-steps-43-45` | `/tmp/hey-parallel/steps-43-45` | Prepared | Based on common checkpoint; no worker assigned yet. |

Branch conflict control: each worker has a dedicated worktree and is instructed not to push or merge; shared-file changes will be inspected and merged by the coordinator only after tests and contract review. The current canonical seams are `src/core/permissionManager.js`, `src/core/actionMandate.js`, `src/core/missionCenter.js`, `src/core/executionEngine.js`, `src/core/eventBus.js`, and `src/core/capabilityRegistry.js`. Step 01 is not complete; downstream workers must report assumptions that depend on unfinished contracts.

Coordinator evidence-integrity checkpoint: local commit `ba3ad69fbda2616b6c95f9520c51e73f57554899`; GitHub commit `ebf36be13483ee6caec8d3d165cea553613db367` on this development branch (verified fetched commit and file diff). Verification at this checkpoint: focused evidence tests 2/2, full suite 63/63, ESLint passed, Vite production build passed, `git diff --check` passed. Build caveats: `SITE_URL` unset skips sitemap generation; existing contextManager mixed-import warning. Durable invalidation and signing-key integration remain adapter/deployment work.

Codex Cloud task-creation/model-picker MCP is not exposed in this session. The available parallel agent API accepted the explicit `gpt-6-luna` model and `high` reasoning selection for all six active engineering workers. No UI model picker was opened or claimed to be changed. No PRs are open yet; branch sync/PR creation follows review of actual commits.
