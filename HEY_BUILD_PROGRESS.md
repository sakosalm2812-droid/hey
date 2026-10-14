# HEY build progress ledger

## Phase 1: urgent repair batch

Branch: `codex/production-readiness-2026-10-13`

| Area | Implementation state | Verification | Remaining external boundary |
|---|---|---|---|
| Diagnostics recovery | Implemented adapter-backed recovery with independent postcondition verification; missing adapters are blocked, unverified postconditions fail, and only verified work reports success. Added actual workflow pause and artifact restore adapters. | `tests/production-repairs.test.js` hostile adapter tests; full suite recorded below. | Provider-specific retry, reconnect, fallback, and checkpoint resume require real provider/executor adapters. |
| Developer package checks | Replaced placeholder successes with manifest/schema validation, installed dependency and semantic range checks, SPDX identifier validation, and Ed25519 signatures verified against host-supplied trust roots. Stage and install revalidate. | Signed/tampered/untrusted package tests in `tests/production-repairs.test.js`. | Production signing identities/trust-root configuration are deployment-owner inputs. |
| Automation schedules | Implemented IANA timezone recurrence, DST gap and overlap handling, once/interval/daily/weekly/monthly calculation, durable occurrences, timer rehydration, missed-run recovery without replaying uncertain actions, invalid-schedule rejection, and accurate failed occurrence state. | UTC/timezone/DST, invalid schedule, and failed execution tests in `tests/production-repairs.test.js`. | Cross-process exactly-once scheduling requires a shared transactional scheduler/lock service; current accessible client persistence is not a distributed lock. |

### Verification evidence

- `node --test tests/production-repairs.test.js`: 5 passed, 0 failed.
- `npm test`: 59 passed, 0 failed.
- `npm run lint`: passed.
- `npm run build`: passed. Sitemap generation was skipped because `SITE_URL` is unset; Vite reported the existing mixed static/dynamic import warning for `src/core/contextManager.js`.
- `git diff --check`: passed before ledger addition.

### Current checkpoint

Local repair commit SHA: `714f3461eb28c0c0cae84937afbab62fe78b8352`.

GitHub development-branch sync commit SHA: `9890ce4f5228c065ab8d6c9bf77cb7919cfb3532` (`sakosalm2812-droid/hey`, branch verified at this SHA). Its tree contains the same repair source/tests as the local repair commit; the SHA differs because the local checkout's parent commit did not match the branch's GitHub commit object. GitHub combined status returned no status checks yet.

Next: Step 01 — Global Foundation / Product Constitution / Shared Contracts. Begin by extending canonical shared authority, mandate, evidence, and mission persistence contracts in existing systems; no separate identity, permission, or mission authority is to be introduced. The 47-step program remains incomplete.
