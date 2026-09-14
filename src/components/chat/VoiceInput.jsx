import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader } from "lucide-react";
import { motion } from "framer-motion";
import { buzz } from "../../lib/heyFeedback";
import { press, springs } from "../../lib/heyMotion";
import {
  createBrowserSpeechProvider,
  createBrowserSpeechSynthesisProvider,
  createVoiceSession,
} from "../../lib/voiceProviders.js";
import { VOICE_STATES } from "../../core/voiceState.js";

export default function VoiceInput({ onTranscript, onSpeaking, disabled = false }) {
  const [voiceState, setVoiceState] = useState(VOICE_STATES.idle);
  const sessionRef = useRef(null);

  const isSupported = Boolean(
    typeof window !== "undefined" && 
    (window.SpeechRecognition || window.webkitSpeechRecognition) &&
    window.speechSynthesis && 
    typeof window.SpeechSynthesisUtterance === "function"
  );

  useEffect(() => {
    if (!isSupported) return;

    sessionRef.current = createVoiceSession({
      speechProvider: createBrowserSpeechProvider(window),
      synthesisProvider: createBrowserSpeechSynthesisProvider(window),
      ask: () => Promise.resolve(""),
      environment: window,
      onStateChange: ({ state, transcript: nextTranscript }) => {
        setVoiceState(state);
        if (nextTranscript) {
          onTranscript(nextTranscript);
        }
        if (state === VOICE_STATES.speaking) {
          onSpeaking(true);
        } else if (state === VOICE_STATES.idle || state === VOICE_STATES.error) {
          onSpeaking(false);
        }
      },
    });

    return () => {
      if (sessionRef.current?.destroy) {
        sessionRef.current.destroy();
      }
    };
  }, [isSupported, onTranscript, onSpeaking]);

  async function toggleListening() {
    if (
      voiceState === VOICE_STATES.listening ||
      voiceState === VOICE_STATES.processing
    ) {
      sessionRef.current?.stop();
      return;
    }

    const result = await sessionRef.current?.start();
    if (result?.error) {
      setVoiceState(VOICE_STATES.error);
    }
  }

  if (!isSupported) {
    return null;
  }

  const isListening = voiceState === VOICE_STATES.listening;
  const isProcessing = voiceState === VOICE_STATES.processing;

  return (
    <div className="voice-input-wrap">
      {isListening && (
        <>
          <span className="voice-ring" />
          <span className="voice-ring" />
          <span className="voice-ring" />
        </>
      )}
      <motion.button
        type="button"
        onClick={toggleListening}
        disabled={disabled || isProcessing}
        className={`voice-input-button ${isListening ? "listening" : ""}`}
        title={
          isProcessing
            ? "Processing..."
            : isListening
            ? "Click to stop listening"
            : "Click to speak"
        }
        aria-label={
          isProcessing
            ? "Processing your voice"
            : isListening
            ? "Stop listening"
            : "Start voice input"
        }
        onPointerDown={() => buzz("medium")}
        whileHover={{ scale: 1.04, transition: springs.snappy }}
        whileTap={{ scale: 0.97, transition: press }}
      >
        {isProcessing ? (
          <Loader size={20} className="animate-spin" />
        ) : isListening ? (
          <MicOff size={20} />
        ) : (
          <Mic size={20} />
        )}
      </motion.button>
    </div>
  );
}
