# HEY Execution Handoff

Updated: 2026-10-14 (America/Los_Angeles)
Coordinator task: `01a13bf9-ee55-7cc0-82b5-1308bab20328` (local, “Resume HEY development”)
Recovery chat: `6ac68fc8-9170-83eb-815d-81e94e6be7ba` (“Codex Setup Blocked”)
Repository: `sakosalm2812-droid/hey` (`https://github.com/sakosalm2812-droid/hey`)

## Current checkpoint and branch

- Working branch: `codex/resume-emergency-2026-10-14`.
- Latest pushed coordinator commit: `ae32aeb0f32be0e0ec5607e6026346ddf5eeb464` (mandate payload validation / hostile-input fix).
- Base: `origin/codex/production-readiness-2026-10-13` at `97a4f3856398505ffa4dcd4d78348098699d4890` (parent `fa54f27ff0f8fac3acb8dabaf348bbc0f9a0f429`).
- Verified common checkpoint recorded in `HEY_BUILD_PROGRESS.md`: `3320c8ce44df5d3a37a3513b1023300c29cb10fa`.
- Branch commits after that checkpoint: `4369a3f` event outbox; `ebf36be` evidence-integrity contract; `fa54f27` defensive event snapshots; `4ae2d58` integration ledger; `97a4f38` worker completion checkpoints.
- Earlier repair/Step 01 checkpoints on the common history: `9890ce4` diagnostics/package/scheduler repairs; `096a669` mandate implementation; current ledger pointer `3320c8c`.
- Latest known verified Step 01 state: mandate authority, evidence-integrity envelopes, event outbox and ledger snapshots implemented. The resumed Steps 02–04 worker added strict mission-checkpoint schema/progress validation and bounded policy integers on that branch; integration review is pending. Step 01 remains **in progress**. Durable production adapters and signing-key custody remain deployment dependencies.
- New coordinator change: `src/core/actionMandate.js` now enforces the exact v1 payload/envelope schema, rejects accessors, cycles, sparse/custom arrays, non-canonical timestamps/scope lists and invalid delegation metadata, and fails closed on revocation-store read errors. Added `tests/action-mandate-hardening.test.js` with getter, cycle, sparse-list and authority-store failure attacks.
- `main` at `62ebb360` is the repository snapshot and is not the development checkpoint. Continue from the production-readiness line; do not replace it with `main`.

## Master program/source files

- Recovery chat tool read returned `attachments: []`; no uploaded HEY Master Build Program was exposed there.
- Connected Google Drive search for `HEY Master Build Program`, `HEY_FINAL_ABSOLUTE_SOURCE_OF_TRUTH`, and `HEY master program` failed with `UNAUTHORIZED` (reauthentication required).
- Filename search under `Documents/Codex` and `Downloads` found no master-program source file. Do not treat this as evidence that the source does not exist.
- Existing code task `01a11c30-7681-7697-b1b3-34d216e68033` (“Set up hey-next-production-program”, durable host) produced Steps 34–35 standalone `HEY-NEXT` reference packages in an isolated cloud workspace. Its final report recorded 224 successful local reference-package test executions and no production integrations; the task workspace reported `HEY-NEXT/` untracked and no commit SHA. This is not integrated HEY code and is not a HEY step completion checkpoint.

## Steps and active work

- Current critical path: finish Step 01; do not claim later steps complete based on package artifacts or PR descriptions alone.
- Active branch work recoverable from GitHub:
  - Steps 02–04: `codex/par-steps-02-04` at `2ae50e3d665693279f582b19e787ef81918af2ab`; PR #2 remains draft/open/unmerged, completion pass verified with focused 18/18, full 79/79, lint/build/diff-check.
  - Steps 12–14: `codex/par-steps-12-14` at `7e45e1dfadf6264eafc67dc508366bece2dba739`; PR #3 remains draft/open/unmerged, completion pass verified with focused 13/13, full 74/74, lint/build/diff-check.
  - Steps 15–18: `codex/par-steps-15-18` at `1a95a149f10ed45fd7d2d3ef32b0effdd4e71154`; PR #1 remains draft/open/unmerged, coordinator base integrated without conflicts, GitHub now says `mergeable:true`; focused 6/6, full 72/72, lint/build/diff-check.
  - Steps 05–08, 09–11, 19–21, 22–27: branches exist but point to `3320c8c`; prior ledger labels work active/completion-pass but no later GitHub commits were found at recovery. Original worker task/thread IDs are not exposed in this session, so only branch checkpoints are resumable here.
  - Steps 28–30, 31–35, 36–38, 39–42, 43–45: prepared branches exist at `3320c8c`; prior ledger shows no assigned worker.
  - Step 46–47 integration/enforcement: no separate branch or task recovered.
- Prior ledger says available engineering agents used GPT-6 Luna (`gpt-6-luna`, high reasoning); it also explicitly says no Codex task-creation/model-picker MCP was available and no UI model picker change was made. Do not claim model selection via UI.

## Known test evidence and limitations

- Existing `HEY_BUILD_PROGRESS.md` records focused repair tests 7/7, earlier full suite 61/61, lint/build pass, plus Step 01 mandate, evidence-integrity and event-outbox tests. Later progress records 66/66 full suite before the latest coordinator snapshot guard; see the ledger for exact scope.
- Worker PR descriptions report their local verification. No PR changes have been merged into the coordinator branch during this recovery; PR #1's feature branch now contains the 97a4f38 coordinator base.
- `main` contains no handoff document; this file is the continuity source for the current coordinator branch.
- Replacement coordinator verification on `ae32aeb`: `npm ci` installed 263 packages, audit reported 0 vulnerabilities; `npm test` passed 68/68; `npm run lint` passed; `npm run build` passed. Build skipped sitemap generation because `SITE_URL` is unset and reports the existing `contextManager.js` mixed static/dynamic import warning. `git diff --check` passed before commit.
- External constraints: connected Drive is unauthorized; actual machine path `E:\hey` is not mounted in this session. Repository clone is at this session's `work/hey` path. Production identity providers, signing keys, shared transactional storage, external providers, and deployed services remain unverified.

## Active workers and references

- Coordinator: current Codex task `01a13bf9-ee55-7cc0-82b5-1308bab20328`; branch `codex/resume-emergency-2026-10-14`.
- Previous coordinator/recovery instructions: ChatGPT conversation `6ac68fc8-9170-83eb-815d-81e94e6be7ba`.
- Prior worker rows and branch assignments are preserved in `HEY_BUILD_PROGRESS.md`. Their individual Codex task references were not present in recovered chat/task listings; do not invent IDs or claim those workers are still running.
- Resumed Steps 02–04 worker: `/root/resume_steps_02_04` (collaboration task reference; original Codex task ID unavailable), branch `codex/par-steps-02-04`, worktree `.../work/hey-steps-02-04`, commit `2ae50e3d665693279f582b19e787ef81918af2ab`. Implemented challenge burning after Ed25519 verification, fail-closed recovery-store/smart-approval handling, bounded policy integers, caller abort bridging/terminal cancellation and strict checkpoint schema/progress validation. Focused 18/18; full 79/79; lint/build/diff-check pass; PR #2 updated but still draft/open/unmerged. No dirty/unpushed work.
- Resumed PR #1 integration worker: `/root/repair_pr1_integration` (collaboration task reference; original Codex task ID unavailable), branch `codex/par-steps-15-18`, worktree `.../work/pr1-integration`, merge commit `1a95a149f10ed45fd7d2d3ef32b0effdd4e71154`. Integrated coordinator `97a4f38` with no conflicts and pushed fast-forward. Focused 6/6, full 72/72, lint/build/diff-check pass. PR #1 remains draft/open; GitHub now reports `mergeable:true`. No PR state changed.
- Resumed Steps 12–14 worker: `/root/resume_steps_12_14` (collaboration task reference; original Codex task ID unavailable), branch `codex/par-steps-12-14`, worktree `.../work/hey-steps-12-14`, start SHA `ec08fa888a32d1fdd9cc7ab4bb5e711c20144ca7`, commit `7e45e1dfadf6264eafc67dc508366bece2dba739`. Fixed database key mapping/edge endpoints, graph neighborhood contract, research cancellation and sensitive-query checks, and source retraction invalidation. Focused 13/13, full 74/74, lint/build/diff-check passed. PR #3 remains draft/open; production DB/provider gates remain unverified.
- Resumed Steps 05–08 worker: `/root/resume_steps_05_08` (current agent task), branch `codex/resume-steps-05-08-2026-10-14` based on coordinator `ae32aeb`; active, concrete gap exploration and implementation; no result yet.
- Resumed Steps 19–21 worker: `/root/resume_steps_19_21` (current agent task), branch `codex/resume-steps-19-21-2026-10-14` based on coordinator `ae32aeb`; active, preserving scheduler/package repairs; no result yet.

## Uncommitted/unmerged work

- Coordinator source/tests were committed and pushed at `ae32aeb`; the only root-checkout untracked path is `work/`, containing isolated agent worktrees and excluded from commits. Do not stage it.
- Draft PRs #1–#3 are open and unmerged. Review and verify before merging.
- The durable Steps 34–35 package workspace is isolated, untracked there, and not available in this repository clone; do not copy it in without first checking against canonical product contracts.

## Exact next actions

1. Finish the Steps 12–14 worker review and verify its pushed SHA, tests and PR #3 state.
2. Inspect Steps 02–04 commit `2ae50e3` against coordinator Step 01 changes; merge only after reviewing overlap in `actionMandate.js` and mission contracts, then rerun full tests/lint/build.
3. Inspect Steps 12–14 commit `7e45e1d` against canonical storage and evidence contracts; integrate only after review and full tests.
4. Review PR #1 merge commit `1a95a149` against the current source branch; PR #1 is mergeable but remains draft. Keep PR state unchanged until code integration verification supports it.
5. Complete Step 01 shared persistence/recovery schema and remaining policy validation from code, including adapters/contracts and adversarial tests, without claiming durable production wiring.
6. Recover source program contents from the user’s connected Drive once reauthentication is restored, or from a newly accessible attachment; reconcile acceptance criteria without restarting audits.
7. Resume later existing branches from their recorded tips only where branch ownership is clear; record the current worker task reference, model, branch, commit, tests and remaining items.
8. Update this file and `HEY_BUILD_PROGRESS.md` after every verified checkpoint, including current branch/SHA, tests, blockers, worker IDs, and next concrete action.
