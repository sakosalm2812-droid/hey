# In-app dictation editing integration contract

This branch owns the edit-proposal contract and its failure behavior. The shared Chat/Voice layout remains with the Frontend Director; this file is the proposed seam for wiring edit-by-voice into that UI.

## User flow for the shared UI owner

1. Offer **Edit selected text by voice** only when HEY has a current editable target and a non-empty selection. Keep this distinct from **Dictate a message** and VoiceOS commands.
2. Create `HEY.voice.createDictationEditSession({ preferences, applicationId, rewriteProvider })` for the signed-in account and selected app. Explain whether the rewrite provider processes text locally or remotely before requesting consent for remote processing.
3. Capture the edit utterance with the existing consented dictation session. Call `propose({ sourceText, utterance, targetId, selectionDigest, cancelSignal })`, deriving `selectionDigest` from the exact selected text and current editor target. Give each rewrite action an `AbortController`; connect the user-facing Cancel action to `abort()` and pass its signal.
4. Render `proposal.proposedText` as a reviewable preview. Do not write to the editor, replace the selection, or submit a message yet. A timeout, provider error, cancellation, or stale context leaves the original text unchanged and the user able to retry or cancel.
5. On explicit confirmation, re-read the current text, app, target, and selection digest and pass them to `confirm(proposal, { confirmed: true, currentText, applicationId, targetId, selectionDigest })`. If validation fails, discard the proposal and ask the user to select/review the current text again.
6. Only after `confirm` succeeds may the host apply the returned text to the still-current selection. Keep message submission a separate user action. Destroy the edit session on account change, target teardown, or flow cancellation.

## Runtime contract

`createDictationEditSession` returns typed statuses without applying editor changes. Rewrite requests default to a 15-second timeout, accept a bounded `rewriteTimeoutMs` override for hosts/tests, abort the provider signal on timeout, and return `provider_timeout` without exposing provider diagnostics or producing a confirmable proposal. Late provider completion cannot revive the timed-out proposal.

The selection digest is a host-computed binding token; do not treat it as authorization. Confirmation still requires an explicit user action and fresh account/app/target/text/digest checks. The caller owns editor mutation and must verify the resulting selection text before reporting success.

Aborting `cancelSignal` during provider work aborts the provider signal and returns `status: "cancelled"` with no preview. A pre-aborted signal prevents provider invocation, and late provider completion cannot revive a cancelled proposal. Cancellation leaves the selected source unchanged and does not insert or submit text. Account changes continue to close the session and return `session_ended`.

## Verification and current limit

The contract tests cover timeout/abort, stale target and selection, replay denial, explicit confirmation, account changes, and preview-only behavior. The integrated UI action, browser text selection, rewrite provider, and post-insertion verification remain **UNVERIFIED** until the shared UI owner wires this contract and exercises it in a signed-in runtime.
