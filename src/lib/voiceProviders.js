import { VOICE_STATES, createVoiceState } from "../core/voiceState.js";
import { resolveUtteranceVoice, stripWakePhrase } from "../core/heyVoiceSettings.js";
import { getAccountScope, subscribeAccountScope } from "../core/accountScope.js";

const browserSpeechProviders = new WeakSet();

export function createBrowserSpeechProvider(environment = globalThis) {
  const Recognition = environment.SpeechRecognition || environment.webkitSpeechRecognition;
  if (!Recognition) return null;

  const provider = {
    kind: "browser",
    start({ onTranscript, onError, onEnd, language = "en-US" }) {
      const recognition = new Recognition();
      recognition.lang = normalizeSpeechLanguage(language);
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => onTranscript(event.results?.[0]?.[0]?.transcript?.trim() || "");
      recognition.onerror = (event) => onError(event.error || "speech_recognition_failed");
      recognition.onend = onEnd;
      recognition.start();
      return recognition;
    },
    stop(recognition) { recognition?.stop(); },
  };
  browserSpeechProviders.add(provider);
  return provider;
}

function normalizeSpeechLanguage(language) {
  if (typeof language !== "string" || language.length > 64) return "en-US";
  try { return Intl.getCanonicalLocales(language)[0] || "en-US"; }
  catch { return "en-US"; }
}

export function createBrowserSpeechSynthesisProvider(environment = globalThis) {
  if (!environment.speechSynthesis || typeof environment.SpeechSynthesisUtterance !== "function") return null;
  return {
    kind: "browser",
    speak(text, { onEnd, onError } = {}) {
      return new Promise((resolve) => {
        const utterance = new environment.SpeechSynthesisUtterance(text);
        resolveUtteranceVoice(utterance, environment);
        utterance.onend = () => { onEnd?.(); resolve({ success: true, verified: true }); };
        utterance.onerror = (event) => { onError?.(event.error || "speech_synthesis_failed"); resolve({ success: false, verified: false, error: event.error || "Speech output failed." }); };
        environment.speechSynthesis.speak(utterance);
      });
    },
    cancel() { environment.speechSynthesis.cancel(); },
  };
}

export async function requestMicrophonePermission(environment = globalThis) {
  if (!environment.navigator?.mediaDevices?.getUserMedia) return { status: VOICE_STATES.permissionRequired, granted: false, error: "Microphone access is unavailable in this runtime." };
  try {
    const stream = await environment.navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return { status: "granted", granted: true };
  } catch (error) {
    return { status: VOICE_STATES.permissionRequired, granted: false, error: error?.name === "NotAllowedError" ? "Microphone permission was denied." : "Microphone access failed." };
  }
}

export function stripWakeWord(text) {
  return stripWakePhrase(text);
}

function hasControlCharacters(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

/**
 * Apply an in-memory, user-supplied dictation vocabulary to one transcript.
 * Sources are matched as whole Unicode words/phrases, case-insensitively, in
 * one pass so a replacement can never trigger another replacement. This
 * helper deliberately does not persist either the vocabulary or transcript.
 */
export function applyDictationCorrections(transcript, corrections = []) {
  if (typeof transcript !== "string") return "";
  if (!Array.isArray(corrections) || corrections.length > 64) {
    throw new TypeError("Dictation corrections must be an array of at most 64 entries.");
  }
  if (corrections.length === 0) return transcript;

  const bySource = new Map();
  for (const correction of corrections) {
    if (!correction || typeof correction !== "object" || Array.isArray(correction)) {
      throw new TypeError("Each dictation correction must have a source and replacement.");
    }
    const { from, to } = correction;
    if (typeof from !== "string" || typeof to !== "string"
      || !from.trim() || from.length > 80 || to.length > 160
      || hasControlCharacters(from) || hasControlCharacters(to)) {
      throw new TypeError("Dictation correction entries must contain short, plain text.");
    }
    const key = from.trim().toLowerCase();
    if (bySource.has(key)) throw new TypeError("Dictation correction sources must be unique.");
    bySource.set(key, { from: from.trim(), to });
  }

  const alternatives = [...bySource.values()]
    .sort((left, right) => right.from.length - left.from.length)
    .map(({ from }) => from.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  const matcher = new RegExp(`(^|[^\\p{L}\\p{N}_])(${alternatives.join("|")})(?=$|[^\\p{L}\\p{N}_])`, "giu");
  return transcript.replace(matcher, (match, prefix, source) => {
    const replacement = bySource.get(source.trim().toLowerCase())?.to;
    return `${prefix}${replacement ?? source}`;
  });
}

export function createVoiceSession({ speechProvider, synthesisProvider, ask, environment = globalThis, onStateChange } = {}) {
  const state = createVoiceState();
  let recognition = null;
  let destroyed = false;
  let generation = 0;
  let starting = null;
  let activeTurn = null;

  function transition(nextState, error = null) {
    const result = state.transition(nextState);
    if (result.success && !destroyed) onStateChange?.({ ...result, error });
    return result;
  }

  async function start() {
    if (destroyed) return { success: false, status: state.state, error: "Voice session has ended." };
    if (state.state === VOICE_STATES.listening) return { success: true, status: state.state, reused: true };
    if ([VOICE_STATES.processing, VOICE_STATES.speaking].includes(state.state)) {
      return { success: false, status: state.state, error: "Interrupt the active voice turn before starting another." };
    }
    if (starting) return starting;
    starting = startListening();
    try { return await starting; } finally { starting = null; }
  }

  async function startListening() {
    if (!speechProvider) {
      transition(VOICE_STATES.error, "Speech recognition is unavailable in this runtime.");
      return { success: false, status: VOICE_STATES.error, error: "Speech recognition is unavailable in this runtime." };
    }
    if (environment.navigator?.onLine === false) {
      transition(VOICE_STATES.offline, "The browser is offline.");
      return { success: false, status: VOICE_STATES.offline, error: "The browser is offline." };
    }
    const permission = await requestMicrophonePermission(environment);
    if (!permission.granted) {
      transition(VOICE_STATES.permissionRequired, permission.error);
      return { success: false, status: VOICE_STATES.permissionRequired, error: permission.error };
    }
    if (state.state === VOICE_STATES.error || state.state === VOICE_STATES.offline || state.state === VOICE_STATES.permissionRequired) {
      state.transition(VOICE_STATES.idle);
    }
    transition(VOICE_STATES.listening);
    const currentGeneration = ++generation;
    try {
      recognition = speechProvider.start({
      onTranscript: async (transcript) => {
        const command = stripWakeWord(transcript);
        if (!command || destroyed || currentGeneration !== generation || activeTurn) return;
        activeTurn = new AbortController();
        const turnController = activeTurn;
        transition(VOICE_STATES.processing);
        try {
          const answer = await ask(command, { signal: turnController.signal });
          if (destroyed || currentGeneration !== generation || turnController.signal.aborted) return;
          if (!synthesisProvider) {
            transition(VOICE_STATES.idle);
            onStateChange?.({ state: VOICE_STATES.idle, transcript: command, answer, ttsUnavailable: true });
            return;
          }
          transition(VOICE_STATES.speaking);
          const spoken = await synthesisProvider.speak(answer, { onError: (error) => transition(VOICE_STATES.error, error) });
          if (destroyed || currentGeneration !== generation || turnController.signal.aborted) return;
          if (!spoken.success) transition(VOICE_STATES.error, spoken.error);
          else transition(VOICE_STATES.idle);
          onStateChange?.({ state: state.state, transcript: command, answer, tts: spoken });
        } catch (error) {
          if (!turnController.signal.aborted && currentGeneration === generation) {
            transition(VOICE_STATES.error, error?.message || "Voice request failed.");
          }
        } finally {
          if (activeTurn === turnController) activeTurn = null;
        }
      },
      onError: (error) => { if (currentGeneration === generation && !destroyed) transition(VOICE_STATES.error, error); },
      onEnd: () => { if (currentGeneration === generation) { recognition = null; if (state.state === VOICE_STATES.listening) transition(VOICE_STATES.idle); } },
      });
    } catch (error) {
      transition(VOICE_STATES.error, error?.message || "Speech recognition could not start.");
      return { success: false, status: VOICE_STATES.error, error: error?.message || "Speech recognition could not start." };
    }
    return { success: true, status: VOICE_STATES.listening };
  }

  function stop() {
    generation += 1;
    activeTurn?.abort();
    activeTurn = null;
    try { speechProvider?.stop(recognition); } catch { /* A stopped provider cannot keep the session alive. */ }
    recognition = null;
    if ([VOICE_STATES.listening, VOICE_STATES.processing, VOICE_STATES.speaking].includes(state.state)) {
      transition(VOICE_STATES.interrupted);
      transition(VOICE_STATES.idle);
    }
    try { synthesisProvider?.cancel?.(); } catch { /* Stop remains locally complete. */ }
  }

  function destroy() { destroyed = true; stop(); }
  return { start, stop, interrupt: stop, destroy, snapshot: () => state.snapshot() };
}

/**
 * A dictation-only session. It requires an explicit per-start consent signal,
 * forwards recognized text only to the caller, and never stores or submits it.
 * Browser speech recognition may send audio to the browser vendor; callers
 * should disclose that before asking the user to consent.
 */
export function createDictationSession({ speechProvider, environment = globalThis, onTranscript, onStateChange, onMetrics, corrections = [], language = "en-US" } = {}) {
  // Validate once when the session is created. The immutable snapshot keeps
  // later caller mutation from changing what an active microphone session emits.
  applyDictationCorrections("", corrections);
  const correctionSnapshot = corrections.map(({ from, to }) => ({ from: from.trim(), to }));
  const state = createVoiceState();
  const startingScope = getAccountScope();
  let recognition = null;
  let generation = 0;
  let starting = null;
  let destroyed = false;
  let active = false;
  let attempt = null;

  function now() {
    try {
      const performance = environment.performance;
      const read = performance?.now;
      if (typeof read === "function") {
        const value = Reflect.apply(read, performance, []);
        if (Number.isFinite(value)) return value;
      }
    } catch { /* Use the wall clock when a runtime clock is unavailable. */ }
    try {
      const value = Date.now();
      return Number.isFinite(value) ? value : null;
    } catch { return null; }
  }

  function elapsed(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return Math.round(Math.max(0, Math.min(86_400_000, end - start)));
  }

  function finishAttempt(status, endedAt = now()) {
    if (!attempt || attempt.finished) return;
    attempt.finished = true;
    const metrics = Object.freeze({
      schemaVersion: 1,
      provider: !speechProvider ? "unavailable" : browserSpeechProviders.has(speechProvider) ? "browser" : "custom",
      status,
      startupLatencyMs: elapsed(attempt.startedAt, attempt.providerStartedAt),
      firstTranscriptLatencyMs: elapsed(attempt.providerRequestedAt, attempt.firstTranscriptAt),
      transcriptCount: attempt.transcriptCount,
      emptyTranscriptCount: attempt.emptyTranscriptCount,
      durationMs: elapsed(attempt.startedAt, endedAt),
    });
    try { onMetrics?.(metrics); } catch { /* Optional instrumentation cannot affect dictation. */ }
  }

  function transition(nextState, error = null) {
    const result = state.transition(nextState);
    if (result.success && !destroyed) onStateChange?.({ ...result, error });
    return result;
  }

  function stop(terminalStatus = "stopped") {
    generation += 1;
    finishAttempt(terminalStatus === "account_changed" ? terminalStatus : active ? terminalStatus : "cancelled");
    attempt = null;
    active = false;
    try { speechProvider?.stop(recognition); } catch { /* The local session is still stopped. */ }
    recognition = null;
    if ([VOICE_STATES.listening, VOICE_STATES.interrupted].includes(state.state)) {
      if (state.state === VOICE_STATES.listening) transition(VOICE_STATES.interrupted);
      transition(VOICE_STATES.idle);
    }
  }

  const unsubscribeScope = subscribeAccountScope(() => {
    if (getAccountScope() !== startingScope) {
      stop("account_changed");
      destroyed = true;
      unsubscribeScope();
    }
  });

  async function start({ consentGiven = false } = {}) {
    if (destroyed || getAccountScope() !== startingScope) {
      return { success: false, status: "session_ended", error: "Dictation session ended after the account changed." };
    }
    if (consentGiven !== true) {
      return { success: false, status: "consent_required", error: "Consent is required before dictation starts." };
    }
    if (state.state === VOICE_STATES.listening) return { success: true, status: state.state, reused: true };
    if (starting) return starting;
    starting = startListening();
    try { return await starting; } finally { starting = null; }
  }

  async function startListening() {
    attempt = {
      startedAt: now(),
      providerRequestedAt: null,
      providerStartedAt: null,
      firstTranscriptAt: null,
      transcriptCount: 0,
      emptyTranscriptCount: 0,
      finished: false,
    };
    if (!speechProvider) {
      finishAttempt("unavailable");
      transition(VOICE_STATES.error, "Speech recognition is unavailable in this runtime.");
      return { success: false, status: VOICE_STATES.error, error: "Speech recognition is unavailable in this runtime." };
    }
    if (environment.navigator?.onLine === false) {
      finishAttempt("offline");
      transition(VOICE_STATES.offline, "The browser is offline.");
      return { success: false, status: VOICE_STATES.offline, error: "The browser is offline." };
    }
    const currentGeneration = ++generation;
    const permission = await requestMicrophonePermission(environment);
    if (destroyed || currentGeneration !== generation || getAccountScope() !== startingScope) {
      finishAttempt("cancelled");
      return { success: false, status: "cancelled", error: "Dictation start was cancelled." };
    }
    if (!permission.granted) {
      finishAttempt("permission_failed");
      transition(VOICE_STATES.permissionRequired, permission.error);
      return { success: false, status: VOICE_STATES.permissionRequired, error: permission.error };
    }
    if (destroyed || getAccountScope() !== startingScope) {
      finishAttempt("cancelled");
      return { success: false, status: "session_ended", error: "Dictation session ended after the account changed." };
    }
    if ([VOICE_STATES.error, VOICE_STATES.offline, VOICE_STATES.permissionRequired].includes(state.state)) state.transition(VOICE_STATES.idle);
    active = true;
    transition(VOICE_STATES.listening);
    const currentAttempt = attempt;
    currentAttempt.providerRequestedAt = now();
    try {
      recognition = speechProvider.start({
        language: normalizeSpeechLanguage(language),
        onTranscript: (transcript) => {
          const text = typeof transcript === "string" ? transcript.trim() : "";
          if (!active || destroyed || currentGeneration !== generation || getAccountScope() !== startingScope) return;
          if (!text) {
            currentAttempt.emptyTranscriptCount = Math.min(1000, currentAttempt.emptyTranscriptCount + 1);
            return;
          }
          currentAttempt.transcriptCount = Math.min(1000, currentAttempt.transcriptCount + 1);
          if (currentAttempt.firstTranscriptAt === null) currentAttempt.firstTranscriptAt = now();
          onTranscript?.(applyDictationCorrections(text, correctionSnapshot));
        },
        onError: (error) => {
          if (currentGeneration === generation && !destroyed) {
            active = false;
            finishAttempt("recognition_error");
            transition(VOICE_STATES.error, error);
          }
        },
        onEnd: () => {
          if (currentGeneration !== generation) return;
          active = false;
          recognition = null;
          finishAttempt("ended");
          if (state.state === VOICE_STATES.listening) transition(VOICE_STATES.idle);
        },
      });
      currentAttempt.providerStartedAt = now();
    } catch (error) {
      active = false;
      finishAttempt("start_failed");
      transition(VOICE_STATES.error, error?.message || "Speech recognition could not start.");
      return { success: false, status: VOICE_STATES.error, error: error?.message || "Speech recognition could not start." };
    }
    return { success: true, status: VOICE_STATES.listening };
  }

  function destroy() {
    if (destroyed) return;
    stop();
    destroyed = true;
    unsubscribeScope();
  }

  return { start, stop, destroy, snapshot: () => state.snapshot() };
}

export default { createBrowserSpeechProvider, createBrowserSpeechSynthesisProvider, requestMicrophonePermission, stripWakeWord, applyDictationCorrections, createVoiceSession, createDictationSession };
