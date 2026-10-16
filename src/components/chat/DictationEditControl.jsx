import { useCallback, useEffect, useRef, useState } from "react";
import { createDictationEditSession } from "../../lib/dictationEditProposals.js";
import { dictationPreferenceStore } from "../../lib/dictationPreferences.js";
import { getAccountScope, subscribeAccountScope } from "../../core/accountScope.js";
import {
  CHAT_EDIT_APPLICATION_ID,
  digestSelection,
  readSelectionSnapshot,
  replaceSelection,
  selectionStillMatches,
} from "../../lib/dictationEditSelection.js";
import DictationControl from "./DictationControl.jsx";

export default function DictationEditControl({ inputRef, setValue, disabled, userId }) {
  const [selection, setSelection] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [confirmedText, setConfirmedText] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef(null);
  const editAbortControllerRef = useRef(null);
  const accountRef = useRef(getAccountScope());
  const generationRef = useRef(0);

  const refreshSelection = useCallback(() => {
    const next = readSelectionSnapshot(inputRef.current);
    setSelection(next);
    return next;
  }, [inputRef]);

  const discard = useCallback((message = "") => {
    generationRef.current += 1;
    editAbortControllerRef.current?.abort();
    editAbortControllerRef.current = null;
    sessionRef.current?.destroy();
    sessionRef.current = null;
    setProposal(null);
    setConfirmedText(null);
    setBusy(false);
    setStatus(message);
    refreshSelection();
  }, [refreshSelection]);

  useEffect(() => {
    accountRef.current = getAccountScope();
    const unsubscribe = subscribeAccountScope((_previous, next) => {
      accountRef.current = next;
      generationRef.current += 1;
      editAbortControllerRef.current?.abort();
      editAbortControllerRef.current = null;
      sessionRef.current?.destroy();
      sessionRef.current = null;
      setSelection(null);
      setProposal(null);
      setConfirmedText(null);
      setBusy(false);
      setStatus("Account changed. Select text again to start a new edit.");
    });
    return () => {
      unsubscribe();
      editAbortControllerRef.current?.abort();
      editAbortControllerRef.current = null;
      sessionRef.current?.destroy();
      sessionRef.current = null;
    };
  }, [userId]);

  useEffect(() => {
    if (disabled) discard();
  }, [disabled, discard]);

  async function createPreview(instruction) {
    const input = inputRef.current;
    const snapshot = readSelectionSnapshot(input);
    const scope = accountRef.current;
    if (!snapshot || !userId || getAccountScope() !== scope) {
      discard("Select text in the message draft before editing.");
      return;
    }
    const generation = ++generationRef.current;
    editAbortControllerRef.current?.abort();
    const editAbortController = new AbortController();
    editAbortControllerRef.current = editAbortController;
    setBusy(true);
    setStatus("Preparing a preview…");
    try {
      const digest = await digestSelection(snapshot.targetId, snapshot.sourceText);
      if (!digest) throw new Error("Secure selection checks are unavailable in this browser.");
      if (editAbortController.signal.aborted || generationRef.current !== generation) return;
      if (getAccountScope() !== scope || !selectionStillMatches(inputRef.current, snapshot)) {
        discard("The selection changed. Select the text again and retry.");
        return;
      }
      const preferences = dictationPreferenceStore.load({ applicationId: CHAT_EDIT_APPLICATION_ID });
      const session = createDictationEditSession({
        preferences: preferences.success ? preferences.preferences : undefined,
        applicationId: CHAT_EDIT_APPLICATION_ID,
      });
      sessionRef.current?.destroy();
      sessionRef.current = session;
      const result = await session.propose({
        sourceText: snapshot.sourceText,
        utterance: instruction,
        targetId: snapshot.targetId,
        selectionDigest: digest,
        cancelSignal: editAbortController.signal,
      });
      if (generationRef.current !== generation || getAccountScope() !== scope) {
        session.destroy();
        return;
      }
      if (!result.success) {
        setProposal(null);
        setConfirmedText(null);
        setStatus(result.status === "provider_unavailable"
          ? "This edit needs a rewrite provider, which is not configured. Your selected text is unchanged."
          : `Could not prepare an edit (${result.status}). Your selected text is unchanged.`);
        return;
      }
      if (!selectionStillMatches(inputRef.current, snapshot)) {
        discard("The selection changed. Select the text again and retry.");
        return;
      }
      setSelection({ ...snapshot, digest });
      setProposal(result.proposal);
      setStatus("Review the proposed text. Nothing has changed in your draft.");
    } catch (error) {
      if (generationRef.current === generation) {
        setProposal(null);
        setConfirmedText(null);
        setStatus(error?.message || "Could not prepare a preview. Your draft is unchanged.");
      }
    } finally {
      if (editAbortControllerRef.current === editAbortController) editAbortControllerRef.current = null;
      if (generationRef.current === generation) setBusy(false);
    }
  }

  async function confirmProposal() {
    const snapshot = selection;
    const input = inputRef.current;
    if (!proposal || !snapshot || !selectionStillMatches(input, snapshot) || getAccountScope() !== accountRef.current) {
      discard("The selection changed. Select the text again and retry.");
      return;
    }
    const digest = await digestSelection(snapshot.targetId, snapshot.sourceText);
    if (!digest || digest !== snapshot.digest || !selectionStillMatches(inputRef.current, snapshot)) {
      discard("The selection changed. Select the text again and retry.");
      return;
    }
    const result = sessionRef.current?.confirm(proposal, {
      confirmed: true,
      currentText: snapshot.sourceText,
      applicationId: CHAT_EDIT_APPLICATION_ID,
      targetId: snapshot.targetId,
      selectionDigest: digest,
    });
    if (!result?.success) {
      discard("This preview is no longer current. Select the text again and retry.");
      return;
    }
    setConfirmedText(result.text);
    setStatus("Confirmed. Choose Insert into draft to apply this edit.");
  }

  async function insertConfirmed() {
    const snapshot = selection;
    const input = inputRef.current;
    if (typeof confirmedText !== "string" || !selectionStillMatches(input, snapshot) || getAccountScope() !== accountRef.current) {
      discard("The draft or selection changed. Nothing was inserted; review the text and retry.");
      return;
    }
    const digest = await digestSelection(snapshot.targetId, snapshot.sourceText);
    if (!digest || digest !== snapshot.digest || !selectionStillMatches(inputRef.current, snapshot)) {
      discard("The selection changed. Nothing was inserted; select the text again.");
      return;
    }
    const nextValue = replaceSelection(input.value, snapshot, confirmedText);
    if (nextValue === null) {
      discard("The draft changed. Nothing was inserted; review the text and retry.");
      return;
    }
    const generation = generationRef.current;
    setValue(nextValue);
    requestAnimationFrame(() => {
      if (generationRef.current !== generation) return;
      if (inputRef.current?.value !== nextValue) {
        setStatus("The draft did not accept the edit. Check the text before sending.");
        return;
      }
      const caret = snapshot.start + confirmedText.length;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(caret, caret);
      discard("Edit inserted into the draft. Review it before sending.");
    });
  }

  useEffect(() => {
    const onSelection = () => {
      const next = refreshSelection();
      if (proposal && (!next || next.start !== selection?.start || next.end !== selection?.end || next.sourceText !== selection?.sourceText)) {
        discard("The selection changed. Select the text again and retry.");
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
  }, [discard, inputRef, proposal, refreshSelection, selection]);

  if (!userId || !selection || disabled) return null;
  return (
    <section className="hey-dictation-edit" aria-label="Edit selected draft text by voice">
      <p>Voice edit is limited to selected text in this HEY draft. Punctuation and saved snippets are processed locally. Rewrite is unavailable in this screen, and selected text is not sent to a rewrite provider.</p>
      {!proposal && !busy && <DictationControl applicationId={CHAT_EDIT_APPLICATION_ID} onCapture={createPreview} captureLabel="Use as edit instruction" disabled={disabled} />}
      {busy && <p role="status" aria-live="polite">Preparing preview…</p>}
      {busy && <button type="button" className="hey-dictation__quiet" onClick={() => discard("Edit cancelled. Your draft is unchanged.")}>Cancel</button>}
      {proposal && (
        <div className="hey-dictation-edit__preview">
          <p><strong>Proposed edit</strong></p>
          <blockquote>{proposal.proposedText}</blockquote>
          {!confirmedText && <button type="button" onClick={confirmProposal}>Confirm edit</button>}
          {confirmedText !== null && <button type="button" onClick={insertConfirmed}>Insert into draft</button>}
          <button type="button" className="hey-dictation__quiet" onClick={() => discard("Edit cancelled. Your draft is unchanged.")}>Cancel</button>
        </div>
      )}
      {status && <p role="status" aria-live="polite">{status}</p>}
    </section>
  );
}
