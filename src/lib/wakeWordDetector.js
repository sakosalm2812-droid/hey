import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import { publish } from "../core/eventBus.js";

const WAKE_WORD_STORAGE_KEY = "hey_wake_word_settings";

function readWakeWordSettings() {
  try {
    const stored = localStorage.getItem(WAKE_WORD_STORAGE_KEY);
    return stored ? JSON.parse(stored) : getDefaultSettings();
  } catch {
    return getDefaultSettings();
  }
}

function writeWakeWordSettings(settings) {
  try {
    localStorage.setItem(WAKE_WORD_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

function getDefaultSettings() {
  return {
    enabled: false,
    wakeWords: ["hey"],
    customWakeWord: "",
    sensitivity: 0.7,
    language: "en-US",
    continuous: true,
    requireConfirmation: false,
  };
}

function matchesWakeWord(transcript, words) {
  const text = transcript.toLowerCase().trim();
  return words.some((word) => {
    const wakeWord = word.toLowerCase().trim();
    return text === wakeWord || text.startsWith(wakeWord + " ") || text.endsWith(" " + wakeWord);
  });
}

export function useWakeWordDetector() {
  const [settings, setSettings] = useState(() => readWakeWordSettings());
  const [isListening, setIsListening] = useState(false);
  const [lastDetected, setLastDetected] = useState(null);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const restartTimeoutRef = useRef(null);
  const startListeningRef = useRef(null);
  const handleResultRef = useRef(null);
  const handleErrorRef = useRef(null);
  const handleEndRef = useRef(null);

  const wakeWords = settings.wakeWords.filter((w) => w && w.trim().length > 0);
  const allWakeWords = useRef([...new Set([...wakeWords, ...(settings.customWakeWord ? [settings.customWakeWord] : [])])]);

  useLayoutEffect(() => {
    allWakeWords.current = [...new Set([...wakeWords, ...(settings.customWakeWord ? [settings.customWakeWord] : [])])];
  }, [wakeWords, settings.customWakeWord]);

  const stopListening = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition not supported in this browser");
      return false;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }

      const recognition = new SpeechRecognition();
      recognition.lang = settings.language;
      recognition.continuous = settings.continuous;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = handleResultRef.current;
      recognition.onerror = handleErrorRef.current;
      recognition.onend = handleEndRef.current;

      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
      setError(null);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [settings.language, settings.continuous]);

  useLayoutEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const handleResult = useCallback((event) => {
    const transcript = event.results[0]?.[0]?.transcript?.trim() || "";
    if (!transcript) return;

    if (matchesWakeWord(transcript, allWakeWords.current)) {
      const detectedWakeWord = allWakeWords.current.find((w) => transcript.toLowerCase().includes(w.toLowerCase()));
      setLastDetected({ transcript, timestamp: Date.now(), wakeWord: detectedWakeWord });
      publish("wake_word.detected", { transcript, wakeWord: detectedWakeWord, timestamp: Date.now() });
      if (!settings.continuous) {
        stopListening();
      }
    }
  }, [settings.continuous, stopListening]);

  useLayoutEffect(() => {
    handleResultRef.current = handleResult;
  }, [handleResult]);

  const handleError = useCallback((event) => {
    setError(event.error);
    if ((event.error === "no-speech" || event.error === "audio-capture") && settings.continuous && isListening) {
      restartTimeoutRef.current = setTimeout(() => {
        if (isListening && startListeningRef.current) {
          startListeningRef.current();
        }
      }, 1000);
    }
  }, [settings.continuous, isListening]);

  useLayoutEffect(() => {
    handleErrorRef.current = handleError;
  }, [handleError]);

  const handleEnd = useCallback(() => {
    if (settings.continuous && isListening) {
      restartTimeoutRef.current = setTimeout(() => {
        if (isListening && startListeningRef.current) {
          startListeningRef.current();
        }
      }, 500);
    } else {
      setIsListening(false);
    }
  }, [settings.continuous, isListening]);

  useLayoutEffect(() => {
    handleEndRef.current = handleEnd;
  }, [handleEnd]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const updateSettings = useCallback((newSettings) => {
    const merged = { ...settings, ...newSettings };
    setSettings(merged);
    writeWakeWordSettings(merged);
  }, [settings]);

  const [enabledRef, setEnabledRef] = useState(settings.enabled);

  useEffect(() => {
    setEnabledRef(settings.enabled);
  }, [settings.enabled]);

  useEffect(() => {
    if (enabledRef && !isListening) {
      startListening();
    } else if (!enabledRef && isListening) {
      stopListening();
    }
    return () => {
      stopListening();
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
    };
  }, [enabledRef, isListening, startListening, stopListening]);

  return {
    settings,
    updateSettings,
    isListening,
    lastDetected,
    error,
    startListening,
    stopListening,
    toggleListening,
  };
}

export function getWakeWordSettings() {
  return readWakeWordSettings();
}

export function setWakeWordSettings(newSettings) {
  writeWakeWordSettings(newSettings);
  return getWakeWordSettings();
}

export function getSupportedWakeWordLanguages() {
  return [
    { code: "en-US", name: "English (US)" },
    { code: "en-GB", name: "English (UK)" },
    { code: "ar-SA", name: "Arabic" },
    { code: "ku-IQ", name: "Kurdish (Sorani)" },
    { code: "es-ES", name: "Spanish" },
    { code: "fr-FR", name: "French" },
    { code: "de-DE", name: "German" },
    { code: "zh-CN", name: "Chinese (Mandarin)" },
    { code: "ja-JP", name: "Japanese" },
    { code: "hi-IN", name: "Hindi" },
  ];
}

export default {
  useWakeWordDetector,
  getWakeWordSettings,
  setWakeWordSettings,
  getSupportedWakeWordLanguages,
};