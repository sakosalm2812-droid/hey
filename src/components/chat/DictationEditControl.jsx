import { useCallback, useEffect, useRef, useState } from "react";
import { getAccountScope, subscribeAccountScope } from "../../core/accountScope.js";
import { createDictationEditSession } from "../../lib/dictationEditProposals.js";
import { dictationPreferenceStore } from "../../lib/dictationPreferences.js";
import { rewriteHEYText } from "../../lib/heyAI.js";
import { focusDictationEditTarget } from "../../lib/dictationEditFocus.js";
import {
  CHAT_EDIT_APPLICATION_ID,
  captureEditOperationFence,
  digestSelectionSnapshot,
  editOperationFenceIsCurrent,
  readSelectionSnapshot,
  replaceSelection,
  selectionStillMatches,
} from "../../lib/dictationEditSelection.js";
import DictationControl from "./DictationControl.jsx";

const REWRITE_DISCLOSURE = Object.freeze({
  providerId: "hey-configured-provider",
  providerName: "HEY configured AI provider",
  processingLocation: "external",
  retentionSummary: "Selected text and your edit instruction are sent to the configured AI provider. Provider identity and retention depend on HEY server configuration.",
  disclosureVersion: "selected-text-rewrite-v1",
});

export default function DictationEditControl({ inputRef, setValue, disabled, userId, conversationId = null, providerProfile = "automatic", fusionEnabled = false }) {
  const [selection, setSelection] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [confirmedText, setConfirmedText] = useState(null);
  const [instruction, setInstruction] = useState("");
  const [consented, setConsented] = useState(false);
  const [undoEntry, setUndoEntry] = useState(null);
  const [stage, setStage] = useState("idle");
  const [status, setStatus] = useState("");
  const sessionRef = useRef(null);
  const abortRef = useRef(null);
  const accountRef = useRef(getAccountScope());
  const generationRef = useRef(0);
  const flowHeadingRef = useRef(null);
  const statusRef = useRef(null);

  const refreshSelection = useCallback(() => {
    const next = readSelectionSnapshot(inputRef.current, conversationId);
    setSelection(next);
    return next;
  }, [conversationId, inputRef]);

  const destroySession = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sessionRef.current?.destroy();
    sessionRef.current = null;
  }, []);

  const resetFlow = useCallback((message = "") => {
    generationRef.current += 1;
    destroySession();
    setProposal(null);
    setConfirmedText(null);
    setInstruction("");
    setConsented(false);
    setStage("idle");
    setStatus(message);
    refreshSelection();
  }, [destroySession, refreshSelection]);

  useEffect(() => {
    accountRef.current = getAccountScope();
    const unsubscribe = subscribeAccountScope((_previous, next) => {
      accountRef.current = next;
      generationRef.current += 1;
      destroySession();
      setSelection(null);
      setProposal(null);
      setConfirmedText(null);
      setInstruction("");
      setConsented(false);
      setUndoEntry(null);
      setStage("idle");
      setStatus("Account changed. Select text again to start a new edit.");
    });
    return () => {
      unsubscribe();
      destroySession();
    };
  }, [destroySession, userId]);

  useEffect(() => {
    const onSelection = () => {
      const next = refreshSelection();
      if (proposal && (!next || !selection || next.start !== selection.start || next.end !== selection.end || next.currentText !== selection.currentText)) {
        resetFlow("The selection changed. Select the text again and retry.");
      }
    };
    const input = inputRef.current;
    input?.addEventListener("select", onSelection);
    input?.addEventListener("keyup", onSelection);
    input?.addEventListener("mouseup", onSelection);
    return () => {
      input?.removeEventListener("select", onSelection);
      input?.removeEventListener("keyup", onSelection);
      input?.removeEventListener("mouseup", onSelection);
    };
  }, [inputRef, proposal, refreshSelection, resetFlow, selection]);

  useEffect(() => {
    if (!selection && !proposal && !confirmedText && !undoEntry && stage === "idle") return;
    if (selection?.conversationId === conversationId) return;
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    destroySession();
    setSelection(null);
    setProposal(null);
    setConfirmedText(null);
    setInstruction("");
    setConsented(false);
    setUndoEntry(null);
    setStage("idle");
    setStatus("Conversation changed. Select text again before continuing the edit.");
  }, [conversationId, confirmedText, destroySession, proposal, selection, stage, undoEntry]);

  useEffect(() => {
    if (disabled && stage !== "idle") resetFlow();
  }, [disabled, resetFlow, stage]);

  useEffect(() => {
    focusDictationEditTarget(stage, status, {
      flowHeading: flowHeadingRef.current,
      statusMessage: statusRef.current,
    });
  }, [stage, status]);

  async function beginEdit() {
    setStatus("");
    setProposal(null);
    setConfirmedText(null);
    setInstruction("");
    setConsented(false);
    try {
      const expectedConversationId = conversationId;
      const snapshot = readSelectionSnapshot(inputRef.current, expectedConversationId);
      if (!snapshot || !userId || getAccountScope() !== accountRef.current) {
        setStatus("Select text in the message draft before editing.");
        return;
      }
      const selectionDigest = await digestSelectionSnapshot(snapshot);
      if (!selectionDigest || conversationId !== expectedConversationId || getAccountScope() !== accountRef.current || !selectionStillMatches(inputRef.current, snapshot, conversationId)) {
        setStatus("The selection changed or secure selection checks are unavailable. Select it again.");
        return;
      }
      setSelection({ ...snapshot, selectionDigest });
      sessionRef.current?.destroy();
      const loaded = dictationPreferenceStore.load({ applicationId: CHAT_EDIT_APPLICATION_ID });
      sessionRef.current = createDictationEditSession({
        preferences: loaded.success ? loaded.preferences : undefined,
        applicationId: CHAT_EDIT_APPLICATION_ID,
        rewriteProvider: { proposeRewrite: (request) => rewriteHEYText({ ...request, providerProfile }) },
        rewriteDisclosure: REWRITE_DISCLOSURE,
        resolveCurrentTarget: async () => {
          const current = readSelectionSnapshot(inputRef.current, expectedConversationId);
          if (!current || conversationId !== expectedConversationId || getAccountScope() !== accountRef.current) return null;
          const digest = await digestSelectionSnapshot(current);
          if (conversationId !== expectedConversationId || !selectionStillMatches(inputRef.current, current, conversationId)) return null;
          return digest ? {
            applicationId: CHAT_EDIT_APPLICATION_ID,
            targetId: current.targetId,
            selectionDigest: digest,
            currentText: current.sourceText,
          } : null;
        },
      });
      setStage("capture");
    } catch {
      setStatus("Voice edit is unavailable right now. Your draft is unchanged.");
    }
  }

  async function createPreview() {
    const snapshot = selection;
    if (!snapshot || !instruction || !consented || getAccountScope() !== accountRef.current) return;
    const generation = ++generationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStage("previewing");
    setStatus("");
    try {
      const currentDigest = await digestSelectionSnapshot(snapshot);
      if (generationRef.current !== generation || controller.signal.aborted || getAccountScope() !== accountRef.current) return;
      if (conversationId !== snapshot.conversationId || !currentDigest || currentDigest !== snapshot.selectionDigest || !selectionStillMatches(inputRef.current, snapshot, conversationId)) {
        resetFlow("The selection changed. Select the text again and retry.");
        return;
      }
      const result = await sessionRef.current?.propose({
        sourceText: snapshot.sourceText,
        utterance: instruction,
        targetId: snapshot.targetId,
        selectionDigest: snapshot.selectionDigest,
        rewriteConsent: {
          providerId: REWRITE_DISCLOSURE.providerId,
          disclosureVersion: REWRITE_DISCLOSURE.disclosureVersion,
          sourceText: snapshot.sourceText,
          instruction,
          applicationId: CHAT_EDIT_APPLICATION_ID,
          targetId: snapshot.targetId,
          selectionDigest: snapshot.selectionDigest,
          confirmed: true,
        },
        cancelSignal: controller.signal,
      });
      if (generationRef.current !== generation || getAccountScope() !== accountRef.current) return;
      if (!result?.success) {
        setStage("capture");
        setInstruction("");
        setConsented(false);
        setStatus(result?.status === "cancelled" ? "Edit cancelled. Your draft is unchanged." : `Could not prepare a preview (${result?.status || "unavailable"}). Your draft is unchanged.`);
        return;
      }
      if (!selectionStillMatches(inputRef.current, snapshot, conversationId)) {
        resetFlow("The selection changed. Select the text again and retry.");
        return;
      }
      setProposal(result.proposal);
      setStage("review");
      setStatus("Review the proposed edit. Nothing has changed in your draft.");
    } catch (error) {
      if (generationRef.current === generation) {
        setStage("capture");
        setInstruction("");
        setConsented(false);
        setStatus(error?.message || "Could not prepare a preview. Your draft is unchanged.");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function confirmProposal() {
    if (!proposal || !selection || !selectionStillMatches(inputRef.current, selection, conversationId) || getAccountScope() !== accountRef.current) {
      resetFlow("The selection changed. Select the text again and retry.");
      return;
    }
    const operationFence = captureEditOperationFence(generationRef.current, getAccountScope());
    const digest = await digestSelectionSnapshot(selection);
    if (!editOperationFenceIsCurrent(operationFence, generationRef.current, getAccountScope())
      || operationFence.accountScope !== accountRef.current) return;
    if (conversationId !== selection.conversationId || !digest || digest !== selection.selectionDigest || !selectionStillMatches(inputRef.current, selection, conversationId)) {
      resetFlow("The selection changed. Select the text again and retry.");
      return;
    }
    const result = sessionRef.current?.confirm(proposal, {
      confirmed: true,
      currentText: selection.sourceText,
      applicationId: CHAT_EDIT_APPLICATION_ID,
      targetId: selection.targetId,
      selectionDigest: digest,
    });
    if (!result?.success) {
      resetFlow("This preview is no longer current. Select the text again and retry.");
      return;
    }
    setConfirmedText(result.text);
    setStage("confirmed");
    setStatus("Confirmed. Choose Replace selected text to apply this edit.");
  }

  async function replaceConfirmed() {
    const snapshot = selection;
    if (typeof confirmedText !== "string" || !snapshot || snapshot.conversationId !== conversationId || !selectionStillMatches(inputRef.current, snapshot, conversationId) || getAccountScope() !== accountRef.current) {
      resetFlow("The draft or selection changed. Nothing was replaced.");
      return;
    }
    const operationFence = captureEditOperationFence(generationRef.current, getAccountScope());
    const digest = await digestSelectionSnapshot(snapshot);
    if (!editOperationFenceIsCurrent(operationFence, generationRef.current, getAccountScope())
      || operationFence.accountScope !== accountRef.current) return;
    if (conversationId !== snapshot.conversationId || !digest || digest !== snapshot.selectionDigest || !selectionStillMatches(inputRef.current, snapshot, conversationId)) {
      resetFlow("The selection changed. Nothing was replaced.");
      return;
    }
    const nextValue = replaceSelection(inputRef.current.value, snapshot, confirmedText);
    if (nextValue === null) {
      resetFlow("The draft changed. Nothing was replaced.");
      return;
    }
    setUndoEntry({ previousValue: inputRef.current.value, nextValue, start: snapshot.start, originalEnd: snapshot.end, conversationId: snapshot.conversationId });
    setValue(nextValue);
    requestAnimationFrame(() => {
      if (!editOperationFenceIsCurrent(operationFence, generationRef.current, getAccountScope())
        || operationFence.accountScope !== accountRef.current) return;
      if (inputRef.current?.value !== nextValue) {
        setStatus("The draft did not accept the edit. Check it before sending.");
        return;
      }
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(snapshot.start, snapshot.start + confirmedText.length);
      resetFlow("Edit inserted into the draft. Review it before sending.");
    });
  }

  function undoAppliedEdit() {
    if (!undoEntry || undoEntry.conversationId !== conversationId || inputRef.current?.value !== undoEntry.nextValue) {
      setUndoEntry(null);
      setStatus("The draft changed after the edit, so it cannot be undone here.");
      return;
    }
    setValue(undoEntry.previousValue);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(undoEntry.start, undoEntry.originalEnd);
    });
    setUndoEntry(null);
    setStatus("Edit undone.");
  }

  if (!userId || disabled) return null;
  return (
    <section className="hey-dictation-edit" aria-label="Edit selected draft text by voice">
      {stage === "idle" && (
        <>
          <p id="hey-dictation-edit-help">Select text in your message draft, then choose voice edit. You’ll review a preview before replacing anything.</p>
          <div className="hey-dictation-edit__actions">
            <button type="button" className="hey-dictation__quiet" onClick={beginEdit} aria-describedby="hey-dictation-edit-help">Voice edit selected text</button>
            {undoEntry && <button type="button" className="hey-dictation__quiet" onClick={undoAppliedEdit}>Undo edit</button>}
          </div>
        </>
      )}
      {stage === "capture" && (
        <div className="hey-dictation-edit__flow">
          <h3 ref={flowHeadingRef} tabIndex={-1}>Voice edit: capture instruction</h3>
          <p>Speak the edit instruction. The transcript stays here until you choose to use it.</p>
          <DictationControl applicationId={CHAT_EDIT_APPLICATION_ID} onCapture={(text) => { setInstruction(text); setStage("consent"); }} captureLabel="Use as edit instruction" disabled={disabled} />
          <button type="button" className="hey-dictation__quiet" onClick={() => resetFlow("Edit cancelled. Your draft is unchanged.")}>Cancel</button>
        </div>
      )}
      {stage === "consent" && (
        <div className="hey-dictation-edit__flow">
          <h3 ref={flowHeadingRef} tabIndex={-1}>Review privacy before sending</h3>
          <p>{REWRITE_DISCLOSURE.retentionSummary} The selected model choice applies to this rewrite preview. Fusion is separate and does not run for edit previews.</p>
          {fusionEnabled && <p>Fusion remains enabled only for the chat message you send.</p>}
          <label><input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} /> I agree to send the selected text and edit instruction for a rewrite preview.</label>
          <div className="hey-dictation__actions">
            <button type="button" disabled={!consented || disabled} onClick={createPreview}>Create preview</button>
            <button type="button" className="hey-dictation__quiet" onClick={() => resetFlow("Edit cancelled. Your draft is unchanged.")}>Cancel</button>
          </div>
        </div>
      )}
      {stage === "previewing" && (
        <div className="hey-dictation-edit__flow">
          <h3 ref={flowHeadingRef} tabIndex={-1}>Preparing preview</h3>
          <span role="status" aria-live="polite">Preparing preview…</span>
          <button type="button" className="hey-dictation__quiet" onClick={() => { abortRef.current?.abort(); resetFlow("Edit cancelled. Your draft is unchanged."); }}>Cancel request</button>
        </div>
      )}
      {stage === "review" && proposal && (
        <div className="hey-dictation-edit__flow">
          <h3 ref={flowHeadingRef} tabIndex={-1}>Review proposed edit</h3>
          <p><strong>Proposed edit</strong></p>
          <blockquote>{proposal.proposedText}</blockquote>
          <div className="hey-dictation__actions">
            <button type="button" onClick={confirmProposal}>Confirm edit</button>
            <button type="button" className="hey-dictation__quiet" onClick={() => resetFlow("Edit cancelled. Your draft is unchanged.")}>Discard</button>
          </div>
        </div>
      )}
      {stage === "confirmed" && (
        <div className="hey-dictation-edit__flow">
          <h3 ref={flowHeadingRef} tabIndex={-1}>Confirm replacement</h3>
          <p><strong>Confirmed replacement</strong></p>
          <blockquote>{confirmedText}</blockquote>
          <div className="hey-dictation__actions">
            <button type="button" onClick={replaceConfirmed}>Replace selected text</button>
            <button type="button" className="hey-dictation__quiet" onClick={() => resetFlow("Edit cancelled. Your draft is unchanged.")}>Cancel</button>
          </div>
        </div>
      )}
      {status && <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="hey-dictation__status">{status}</p>}
    </section>
  );
}
