import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, X } from "lucide-react";
import { createBrowserSpeechProvider, createDictationSession } from "../../lib/voiceProviders.js";
import { useAuth } from "../../AuthContext.jsx";
import { VOICE_STATES } from "../../core/voiceState.js";
import { getAccountScope, subscribeAccountScope } from "../../core/accountScope.js";
import { useLocale } from "../../i18n/LocaleContext.jsx";
import { DEFAULT_DICTATION_PREFERENCES, dictationPreferenceStore, normalizeDictationPreferences } from "../../lib/dictationPreferences.js";

const isRecognitionAvailable = (environment) => Boolean(
  environment?.SpeechRecognition || environment?.webkitSpeechRecognition
);

export default function DictationControl({ onInsert, disabled = false }) {
  const { user } = useAuth();
  const { t } = useLocale();
  const translateRef = useRef(t);
  translateRef.current = t;
  const sessionRef = useRef(null);
  const createSessionRef = useRef(null);
  const scopeRef = useRef(getAccountScope());
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
  const [preferences, setPreferences] = useState(DEFAULT_DICTATION_PREFERENCES);
  const [preferenceDraft, setPreferenceDraft] = useState(DEFAULT_DICTATION_PREFERENCES);
  const [preferenceOpen, setPreferenceOpen] = useState(false);
  const [preferenceStatus, setPreferenceStatus] = useState("");
  const [preferenceError, setPreferenceError] = useState("");
  const isActive = state === VOICE_STATES.listening;

  const getErrorMessage = useCallback((errorState) => {
    if (errorState === VOICE_STATES.permissionRequired) return translateRef.current("chat.dictation.permissionDenied");
    if (errorState === VOICE_STATES.offline) return translateRef.current("chat.dictation.offline");
    return translateRef.current("chat.dictation.startFailed");
  }, []);

  useEffect(() => {
    const environment = window;
    const speechProvider = createBrowserSpeechProvider(environment);
    const startingScope = getAccountScope();
    scopeRef.current = startingScope;
    const loaded = dictationPreferenceStore.load();
    const initialPreferences = loaded.success ? loaded.preferences : DEFAULT_DICTATION_PREFERENCES;
    setPreferences(initialPreferences);
    setPreferenceDraft(initialPreferences);
    setPreferenceError("");
    setPreferenceStatus("");
    setSupported(isRecognitionAvailable(environment));
    setState(VOICE_STATES.idle);
    setStatus("");
    setTranscript("");
    setRequesting(false);
    setRequestCancelled(false);
    setDisclosureOpen(false);
    const createSession = (snapshot) => createDictationSession({
      speechProvider,
      environment,
      language: snapshot.language,
      corrections: [
        ...snapshot.corrections,
        ...snapshot.snippets.map(({ name, text }) => ({ from: name, to: text })),
      ],
      onTranscript: (text) => setTranscript((current) => {
        if (getAccountScope() !== startingScope || scopeRef.current !== startingScope) return "";
        const combined = current ? `${current} ${text}` : text;
        return combined.slice(0, 8000);
      }),
      onStateChange: ({ state: nextState, error }) => {
        if (getAccountScope() !== startingScope || scopeRef.current !== startingScope) return;
        setState(nextState);
        setStatus(error ? getErrorMessage(nextState) : "");
      },
    });
    createSessionRef.current = createSession;
    sessionRef.current = createSession(initialPreferences);
    const unsubscribeScope = subscribeAccountScope((_previous, nextScope) => {
      if (nextScope === startingScope) return;
      scopeRef.current = nextScope;
      sessionRef.current?.destroy();
      sessionRef.current = null;
      setTranscript("");
      setState(VOICE_STATES.idle);
      setStatus("");
      setRequesting(false);
      setRequestCancelled(false);
      setDisclosureOpen(false);
      setPreferenceOpen(false);
      setPreferences(DEFAULT_DICTATION_PREFERENCES);
      setPreferenceDraft(DEFAULT_DICTATION_PREFERENCES);
      setPreferenceStatus("");
      setPreferenceError("");
    });
    return () => {
      unsubscribeScope();
      sessionRef.current?.destroy();
      sessionRef.current = null;
    };
  }, [user?.id, getErrorMessage]);

  function savePreferences() {
    const startingScope = scopeRef.current;
    let normalized;
    try {
      normalized = normalizeDictationPreferences(preferenceDraft);
    } catch (error) {
      setPreferenceError(error instanceof Error ? error.message : translateRef.current("chat.dictation.preferencesInvalid"));
      setPreferenceStatus("");
      return;
    }
    if (getAccountScope() !== startingScope) return;
    const result = dictationPreferenceStore.save(normalized);
    if (!result.success || getAccountScope() !== startingScope || scopeRef.current !== startingScope) {
      setPreferenceError(translateRef.current("chat.dictation.preferencesSaveFailed"));
      setPreferenceStatus("");
      return;
    }
    setPreferences(result.preferences);
    setPreferenceDraft(result.preferences);
    setPreferenceError("");
    setPreferenceStatus(translateRef.current("chat.dictation.preferencesSaved"));
  }

  function clearPreferences() {
    const startingScope = scopeRef.current;
    if (getAccountScope() !== startingScope) return;
    const result = dictationPreferenceStore.clear();
    if (!result.success || getAccountScope() !== startingScope || scopeRef.current !== startingScope) {
      setPreferenceError(translateRef.current("chat.dictation.preferencesSaveFailed"));
      return;
    }
    setPreferences(DEFAULT_DICTATION_PREFERENCES);
    setPreferenceDraft(DEFAULT_DICTATION_PREFERENCES);
    setPreferenceError("");
    setPreferenceStatus(translateRef.current("chat.dictation.preferencesCleared"));
  }

  function updateCorrection(index, field, value) {
    setPreferenceDraft((current) => ({ ...current, corrections: current.corrections.map((item, row) => row === index ? { ...item, [field]: value } : item) }));
  }

  function updateSnippet(index, field, value) {
    setPreferenceDraft((current) => ({ ...current, snippets: current.snippets.map((item, row) => row === index ? { ...item, [field]: value } : item) }));
  }

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
        setStatus(translateRef.current("chat.dictation.stopped"));
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [disclosureOpen, isActive, requestCancelled, requesting]);
  async function startWithConsent() {
    const startingScope = scopeRef.current;
    if (getAccountScope() !== startingScope) return;
    setStatus(translateRef.current("chat.dictation.requesting"));
    setDisclosureOpen(false);
    setRequestCancelled(false);
    setRequesting(true);
    try {
      sessionRef.current?.destroy();
      sessionRef.current = createSessionRef.current?.(preferences) || null;
      const result = await sessionRef.current?.start({ consentGiven: true });
      if (getAccountScope() !== startingScope || scopeRef.current !== startingScope) return;
      if (result?.error) setStatus(getErrorMessage(result.status));
      if (result?.status === "cancelled") setStatus(translateRef.current("chat.dictation.cancelledPrompt"));
    } finally {
      if (getAccountScope() === startingScope && scopeRef.current === startingScope) setRequesting(false);
    }
  }

  function cancelRequest() {
    sessionRef.current?.stop();
    setRequestCancelled(true);
    setStatus(translateRef.current("chat.dictation.cancelledPrompt"));
    requestStatusRef.current?.focus();
  }

  function stopAndDiscard() {
    restoreActionFocusRef.current = true;
    sessionRef.current?.stop();
    setTranscript("");
    setDisclosureOpen(false);
    setStatus(translateRef.current("chat.dictation.discarded"));
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
    setStatus(translateRef.current("chat.dictation.inserted"));
  }

  return (
    <div className="hey-dictation">
      <details className="hey-dictation__preferences" open={preferenceOpen} onToggle={(event) => setPreferenceOpen(event.currentTarget.open)}>
        <summary>{t("chat.dictation.preferencesTitle")}</summary>
        <fieldset disabled={disabled || isActive || requesting}>
          <legend>{t("chat.dictation.preferencesTitle")}</legend>
          <label>
            {t("chat.dictation.language")}
            <input aria-label={t("chat.dictation.language")} type="text" maxLength={64} value={preferenceDraft.language} onChange={(event) => setPreferenceDraft((current) => ({ ...current, language: event.target.value }))} />
          </label>
          <div className="hey-dictation__preference-group">
            <h4>{t("chat.dictation.corrections")}</h4>
            {preferenceDraft.corrections.map((item, index) => (
              <div className="hey-dictation__preference-row" key={`correction-${index}`}>
                <label>{t("chat.dictation.correctionFrom")}<input value={item.from} maxLength={80} onChange={(event) => updateCorrection(index, "from", event.target.value)} /></label>
                <label>{t("chat.dictation.correctionTo")}<input value={item.to} maxLength={160} onChange={(event) => updateCorrection(index, "to", event.target.value)} /></label>
                <button type="button" className="hey-dictation__quiet" aria-label={`${t("chat.dictation.removeCorrection")} ${item.from || index + 1}`} onClick={() => setPreferenceDraft((current) => ({ ...current, corrections: current.corrections.filter((_, row) => row !== index) }))}>{t("chat.dictation.remove")}</button>
              </div>
            ))}
            <button type="button" className="hey-dictation__quiet" onClick={() => setPreferenceDraft((current) => ({ ...current, corrections: [...current.corrections, { from: "", to: "" }] }))}>{t("chat.dictation.addCorrection")}</button>
          </div>
          <div className="hey-dictation__preference-group">
            <h4>{t("chat.dictation.snippets")}</h4>
            {preferenceDraft.snippets.map((item, index) => (
              <div className="hey-dictation__preference-row" key={`snippet-${index}`}>
                <label>{t("chat.dictation.snippetName")}<input value={item.name} maxLength={64} onChange={(event) => updateSnippet(index, "name", event.target.value)} /></label>
                <label>{t("chat.dictation.snippetText")}<textarea value={item.text} maxLength={2000} rows={2} onChange={(event) => updateSnippet(index, "text", event.target.value)} /></label>
                <button type="button" className="hey-dictation__quiet" aria-label={`${t("chat.dictation.removeSnippet")} ${item.name || index + 1}`} onClick={() => setPreferenceDraft((current) => ({ ...current, snippets: current.snippets.filter((_, row) => row !== index) }))}>{t("chat.dictation.remove")}</button>
              </div>
            ))}
            <button type="button" className="hey-dictation__quiet" onClick={() => setPreferenceDraft((current) => ({ ...current, snippets: [...current.snippets, { name: "", text: "" }] }))}>{t("chat.dictation.addSnippet")}</button>
          </div>
          <div className="hey-dictation__actions">
            <button type="button" onClick={savePreferences}>{t("chat.dictation.savePreferences")}</button>
            <button type="button" className="hey-dictation__quiet" onClick={clearPreferences}>{t("chat.dictation.clearPreferences")}</button>
          </div>
        </fieldset>
        {preferenceError && <p role="alert" className="hey-dictation__status">{preferenceError}</p>}
        {preferenceStatus && <p role="status" aria-live="polite" className="hey-dictation__status">{preferenceStatus}</p>}
      </details>
      {!supported && <p className="hey-dictation__unsupported" role="status">{t("chat.dictation.unavailable")}</p>}
      <div className="hey-dictation__controls">
        {!disclosureOpen && !requesting && !isActive && !transcript && (
          <button
            ref={triggerRef}
            type="button"
            className="hey-dictation__trigger"
            onClick={() => { setStatus(""); setDisclosureOpen(true); }}
            disabled={disabled || !supported}
            aria-label={t("chat.dictation.triggerAria")}
          >
            <Mic size={16} aria-hidden="true" />
            <span>{t("chat.dictation.trigger")}</span>
          </button>
        )}
        {isActive && (
          <button
            ref={stopButtonRef}
            type="button"
            className="hey-dictation__stop"
            onClick={() => { sessionRef.current?.stop(); setStatus(t("chat.dictation.stopped")); }}
            aria-label={t("chat.dictation.stopAria")}
            aria-pressed={isActive}
          >
            <MicOff size={16} aria-hidden="true" />
            <span><i aria-hidden="true" /> {t("chat.dictation.stop")}</span>
          </button>
        )}
      </div>

      {disclosureOpen && (
        <section className="hey-dictation__disclosure" aria-labelledby="hey-dictation-heading">
          <h3 id="hey-dictation-heading">{t("chat.dictation.heading")}</h3>
          <p>
            {t("chat.dictation.disclosure")}
          </p>
          <div className="hey-dictation__actions">
            <button ref={consentButtonRef} type="button" onClick={startWithConsent} disabled={disabled}>
              {t("chat.dictation.consent")}
            </button>
            <button type="button" className="hey-dictation__quiet" onClick={() => setDisclosureOpen(false)}>
              {t("chat.dictation.cancel")}
            </button>
          </div>
        </section>
      )}

      {requesting && (
        <div ref={requestStatusRef} className="hey-dictation__status" role="status" aria-live="polite" tabIndex={-1}>
          <span>{requestCancelled ? t("chat.dictation.cancelledPrompt") : t("chat.dictation.requesting")}</span>
          {!requestCancelled && <button ref={cancelRequestRef} type="button" className="hey-dictation__quiet" onClick={cancelRequest}>{t("chat.dictation.cancelRequest")}</button>}
        </div>
      )}
      {!requesting && status && <p className="hey-dictation__status" role="status" aria-live="polite">{status}</p>}

      {transcript && (
        <section className="hey-dictation__result" aria-labelledby="hey-dictation-result-heading">
          <div className="hey-dictation__result-heading">
            <h3 id="hey-dictation-result-heading">{t("chat.dictation.transcriptHeading")}</h3>
            {isActive && <span className="hey-dictation__active-label"><i aria-hidden="true" /> {t("chat.dictation.listening")}</span>}
          </div>
          <p className="hey-dictation__transcript" aria-live="polite">{transcript}</p>
          <div className="hey-dictation__actions">
            {isActive && (
                <button type="button" className="hey-dictation__quiet" onClick={stopAndDiscard}>
                <X size={14} aria-hidden="true" /> {t("chat.dictation.discardActive")}
              </button>
            )}
            {!isActive && (
              <>
                <button ref={insertButtonRef} type="button" onClick={insertTranscript} disabled={disabled}>{t("chat.dictation.insert")}</button>
                <button type="button" className="hey-dictation__quiet" onClick={stopAndDiscard}>{t("chat.dictation.discard")}</button>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
