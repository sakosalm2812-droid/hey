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
- Remaining independently implementable Step 01 items: evidence integrity/freshness/invalidation contract, mission persistence/recovery schema contract, policy validation, malformed input/property-based cases, and improved independent runtime verification. Do not advance the 47-step sequence until these are implemented and verified.
- External Step 01 constraints: real production authority storage/transaction semantics and deployment signing keys need the connected HEY backend and owner-managed keys; continue defining adapters and conformance tests without claiming them verified.

### Current checkpoint

Local repair commit SHA: `714f3461eb28c0c0cae84937afbab62fe78b8352`.

GitHub development-branch sync commit SHA: `9890ce4f5228c065ab8d6c9bf77cb7919cfb3532` (`sakosalm2812-droid/hey`, branch verified at this SHA). Its tree contains the same repair source/tests as the local repair commit; the SHA differs because the local checkout's parent commit did not match the branch's GitHub commit object. GitHub combined status returned no status checks yet.

Next: continue Step 01 in this branch; no separate identity, permission, or mission authority is to be introduced. The 47-step program remains incomplete.
