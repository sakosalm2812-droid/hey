import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, X } from "lucide-react";
import { createBrowserSpeechProvider, createDictationSession } from "../../lib/voiceProviders.js";
import { useAuth } from "../../AuthContext.jsx";
import { VOICE_STATES } from "../../core/voiceState.js";

const isRecognitionAvailable = (environment) => Boolean(
  environment?.SpeechRecognition || environment?.webkitSpeechRecognition
);

export default function DictationControl({ onInsert, disabled = false }) {
  const { user } = useAuth();
  const sessionRef = useRef(null);
  const triggerRef = useRef(null);
  const consentButtonRef = useRef(null);
  const stopButtonRef = useRef(null);
  const insertButtonRef = useRef(null);
  const requestStatusRef = useRef(null);
  const restoreActionFocusRef = useRef(false);
  const disclosureWasOpenRef = useRef(false);
  const cancelRequestRef = useRef(null);
  const [supported, setSupported] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [state, setState] = useState(VOICE_STATES.idle);
  const [status, setStatus] = useState("");
  const [transcript, setTranscript] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requestCancelled, setRequestCancelled] = useState(false);
  const isActive = state === VOICE_STATES.listening;

  useEffect(() => {
    const environment = window;
    const speechProvider = createBrowserSpeechProvider(environment);
    setSupported(isRecognitionAvailable(environment));
    setState(VOICE_STATES.idle);
    setStatus("");
    setTranscript("");
    setRequesting(false);
    setRequestCancelled(false);
    setDisclosureOpen(false);
    sessionRef.current = createDictationSession({
      speechProvider,
      environment,
      onTranscript: (text) => setTranscript((current) => {
        const combined = current ? `${current} ${text}` : text;
        return combined.slice(0, 8000);
      }),
      onStateChange: ({ state: nextState, error }) => {
        setState(nextState);
        setStatus(error || "");
      },
    });
    return () => {
      sessionRef.current?.destroy();
      sessionRef.current = null;
    };
  }, [user?.id]);

  useEffect(() => {
    if (disclosureOpen) {
      disclosureWasOpenRef.current = true;
      consentButtonRef.current?.focus();
      return;
    }
    if (requesting) {
      restoreActionFocusRef.current = true;
      cancelRequestRef.current?.focus();
      return;
    }
    if (isActive) {
      stopButtonRef.current?.focus();
      restoreActionFocusRef.current = true;
    } else if (restoreActionFocusRef.current) {
      restoreActionFocusRef.current = false;
      disclosureWasOpenRef.current = false;
      (transcript ? insertButtonRef.current : triggerRef.current)?.focus();
    } else if (disclosureWasOpenRef.current) {
      disclosureWasOpenRef.current = false;
      triggerRef.current?.focus();
    }
  }, [disclosureOpen, isActive, requesting, transcript]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      if (disclosureOpen) {
        setDisclosureOpen(false);
      } else if (requesting && !requestCancelled) {
        cancelRequest();
      } else if (isActive) {
        sessionRef.current?.stop();
        setStatus("Dictation stopped.");
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [disclosureOpen, isActive, requestCancelled, requesting]);
  async function startWithConsent() {
    setStatus("Requesting microphone access…");
    setDisclosureOpen(false);
    setRequestCancelled(false);
    setRequesting(true);
    try {
      const result = await sessionRef.current?.start({ consentGiven: true });
      if (result?.error) setStatus(result.error);
      if (result?.status === "cancelled") setStatus("Dictation start cancelled. If the browser permission prompt remains open, dismiss it there.");
    } finally {
      setRequesting(false);
    }
  }

  function cancelRequest() {
    sessionRef.current?.stop();
    setRequestCancelled(true);
    setStatus("Dictation start cancelled. If the browser permission prompt remains open, dismiss it there.");
    requestStatusRef.current?.focus();
  }

  function stopAndDiscard() {
    restoreActionFocusRef.current = true;
    sessionRef.current?.stop();
    setTranscript("");
    setDisclosureOpen(false);
    setStatus("Dictation cancelled. Transcript discarded.");
  }

  function insertTranscript() {
    const text = transcript.trim();
    if (!text) return;
    restoreActionFocusRef.current = false;
    disclosureWasOpenRef.current = false;
    sessionRef.current?.stop();
    onInsert(text);
    setTranscript("");
    setDisclosureOpen(false);
    setStatus("Transcript inserted into the message field. Review it before sending.");
  }

  if (!supported) {
    return (
      <div className="hey-dictation">
        <p className="hey-dictation__unsupported" role="status">
          Dictation is unavailable in this browser. Type your message or use the separate voice conversation mode.
        </p>
      </div>
    );
  }

  return (
    <div className="hey-dictation">
      <div className="hey-dictation__controls">
        {!disclosureOpen && !requesting && !isActive && !transcript && (
          <button
            ref={triggerRef}
            type="button"
            className="hey-dictation__trigger"
            onClick={() => { setStatus(""); setDisclosureOpen(true); }}
            disabled={disabled}
            aria-label="Review dictation privacy disclosure"
          >
            <Mic size={16} aria-hidden="true" />
            <span>Dictate</span>
          </button>
        )}
        {isActive && (
          <button
            ref={stopButtonRef}
            type="button"
            className="hey-dictation__stop"
            onClick={() => { sessionRef.current?.stop(); setStatus("Dictation stopped."); }}
            aria-label="Stop dictation"
            aria-pressed={isActive}
          >
            <MicOff size={16} aria-hidden="true" />
            <span><i aria-hidden="true" /> Microphone active · Stop</span>
          </button>
        )}
      </div>

      {disclosureOpen && (
        <section className="hey-dictation__disclosure" aria-labelledby="hey-dictation-heading">
          <h3 id="hey-dictation-heading">Before you dictate</h3>
          <p>
            Your browser provides speech recognition. It may send audio to the browser vendor for processing, and that vendor’s data handling can vary. The transcript stays in this browser until you choose to insert and send it to HEY. Dictation never sends your message automatically.
          </p>
          <div className="hey-dictation__actions">
            <button ref={consentButtonRef} type="button" onClick={startWithConsent} disabled={disabled}>
              I agree, start dictation
            </button>
            <button type="button" className="hey-dictation__quiet" onClick={() => setDisclosureOpen(false)}>
              Cancel
            </button>
          </div>
        </section>
      )}

      {requesting && (
        <div ref={requestStatusRef} className="hey-dictation__status" role="status" aria-live="polite" tabIndex={-1}>
          <span>{requestCancelled ? "Dictation start cancelled. Dismiss the browser permission prompt to continue." : "Waiting for microphone permission…"}</span>
          {!requestCancelled && <button ref={cancelRequestRef} type="button" className="hey-dictation__quiet" onClick={cancelRequest}>Cancel request</button>}
        </div>
      )}
      {!requesting && status && <p className="hey-dictation__status" role="status" aria-live="polite">{status}</p>}

      {transcript && (
        <section className="hey-dictation__result" aria-labelledby="hey-dictation-result-heading">
          <div className="hey-dictation__result-heading">
            <h3 id="hey-dictation-result-heading">Dictation transcript</h3>
            {isActive && <span className="hey-dictation__active-label"><i aria-hidden="true" /> Listening</span>}
          </div>
          <p className="hey-dictation__transcript" aria-live="polite">{transcript}</p>
          <div className="hey-dictation__actions">
            {isActive && (
              <button type="button" className="hey-dictation__quiet" onClick={stopAndDiscard}>
                <X size={14} aria-hidden="true" /> Cancel and discard
              </button>
            )}
            {!isActive && (
              <>
                <button ref={insertButtonRef} type="button" onClick={insertTranscript} disabled={disabled}>Insert into message</button>
                <button type="button" className="hey-dictation__quiet" onClick={stopAndDiscard}>Discard</button>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
