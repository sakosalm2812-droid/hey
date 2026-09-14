import { VOICE_STATES, createVoiceState } from "../core/voiceState.js";
import { resolveUtteranceVoice, stripWakePhrase } from "../core/heyVoiceSettings.js";

export function createBrowserSpeechProvider(environment = globalThis) {
  const Recognition = environment.SpeechRecognition || environment.webkitSpeechRecognition;
  if (!Recognition) return null;

  return {
    kind: "browser",
    start({ onTranscript, onError, onEnd }) {
      const recognition = new Recognition();
      recognition.lang = "en-US";
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

export function createVoiceSession({ speechProvider, synthesisProvider, ask, environment = globalThis, onStateChange } = {}) {
  const state = createVoiceState();
  let recognition = null;
  let destroyed = false;

  function transition(nextState, error = null) {
    const result = state.transition(nextState);
    if (result.success && !destroyed) onStateChange?.({ ...result, error });
    return result;
  }

  async function start() {
    if (!speechProvider) {
      transition(VOICE_STATES.error, "Speech recognition is unavailable in this runtime.");
      return { success: false, status: VOICE_STATES.error, error: "Speech recognition is unavailable in this runtime." };
    }
    if (!environment.navigator?.onLine) {
      transition(VOICE_STATES.offline, "The browser is offline.");
      return { success: false, status: VOICE_STATES.offline, error: "The browser is offline." };
    }
    const permission = await requestMicrophonePermission(environment);
    if (!permission.granted) {
      transition(VOICE_STATES.permissionRequired, permission.error);
      return { success: false, status: VOICE_STATES.permissionRequired, error: permission.error };
    }
    transition(VOICE_STATES.listening);
    recognition = speechProvider.start({
      onTranscript: async (transcript) => {
        const command = stripWakeWord(transcript);
        if (!command || destroyed) return;
        transition(VOICE_STATES.processing);
        try {
          const answer = await ask(command);
          if (destroyed) return;
          if (!synthesisProvider) {
            transition(VOICE_STATES.idle);
            onStateChange?.({ state: VOICE_STATES.idle, transcript: command, answer, ttsUnavailable: true });
            return;
          }
          transition(VOICE_STATES.speaking);
          const spoken = await synthesisProvider.speak(answer, { onError: (error) => transition(VOICE_STATES.error, error) });
          if (!spoken.success) transition(VOICE_STATES.error, spoken.error);
          else transition(VOICE_STATES.idle);
          onStateChange?.({ state: state.state, transcript: command, answer, tts: spoken });
        } catch (error) {
          transition(VOICE_STATES.error, error?.message || "Voice request failed.");
        }
      },
      onError: (error) => transition(VOICE_STATES.error, error),
      onEnd: () => { recognition = null; if (state.state === VOICE_STATES.listening) transition(VOICE_STATES.idle); },
    });
    return { success: true, status: VOICE_STATES.listening };
  }

  function stop() {
    speechProvider?.stop(recognition);
    recognition = null;
    if ([VOICE_STATES.listening, VOICE_STATES.processing, VOICE_STATES.speaking].includes(state.state)) transition(VOICE_STATES.interrupted);
    transition(VOICE_STATES.idle);
    synthesisProvider?.cancel?.();
  }

  function destroy() { destroyed = true; stop(); }
  return { start, stop, destroy, snapshot: () => state.snapshot() };
}

export default { createBrowserSpeechProvider, createBrowserSpeechSynthesisProvider, requestMicrophonePermission, stripWakeWord, createVoiceSession };
