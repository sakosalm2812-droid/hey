import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import { publish } from "../core/eventBus.js";

const DEFAULT_GESTURES = {
  "open-palm": { name: "Show HEY", action: "wake" },
  "open-palm-to-fist": { name: "Grab widget", action: "grab" },
  "fist-move": { name: "Move widget", action: "drag" },
  pinch: { name: "Select/click", action: "click" },
  "pinch-move": { name: "Precision drag", action: "precision-drag" },
  "two-hand-spread": { name: "Zoom in", action: "zoom-in" },
  "two-hand-pinch": { name: "Zoom out", action: "zoom-out" },
  "swipe-left": { name: "Previous", action: "navigate-prev" },
  "swipe-right": { name: "Next", action: "navigate-next" },
  "swipe-down": { name: "Minimize", action: "minimize" },
  "swipe-up": { name: "Restore/expand", action: "expand" },
  "pause-sign": { name: "Pause media", action: "pause" },
  "point-pinch": { name: "Target + activate", action: "target-activate" },
  "closed-fist-hold": { name: "Cancel gesture", action: "cancel" },
  "both-palms": { name: "Overview", action: "overview" },
  "thumbs-up": { name: "Confirm (low risk)", action: "confirm-low" },
  "thumbs-down": { name: "Reject/dismiss", action: "reject" },
  "hand-raised": { name: "Interrupt HEY", action: "interrupt" }
};

const GESTURE_STORAGE_KEY = "hey_gesture_settings";

function classifyGesture(landmarks) {
  if (!landmarks || landmarks.length < 21) return null;

  const fingers = getFingerStates(landmarks);
  const fingerCount = fingers.filter((f) => f).length;
  const handShape = getHandShape(fingers);

  if (fingers.every((f) => f)) return "open-palm";
  if (fingerCount === 0) return "closed-fist";
  if (fingers[1] && fingers[2] && !fingers[3] && !fingers[4]) return "two-fingers";
  if (fingers[1] && !fingers[2] && !fingers[3] && !fingers[4]) return "pointing";
  if (fingers[0] && fingers[1] && !fingers[2] && !fingers[3] && !fingers[4]) return "thumbs-up";
  if (fingers[0] && !fingers[1] && !fingers[2] && !fingers[3] && !fingers[4]) return "thumbs-up";

  return handShape;
}

function getFingerStates(landmarks) {
  const tips = [4, 8, 12, 16, 20];
  const bases = [2, 5, 9, 13, 17];
  return tips.map((tip, i) => {
    if (i === 0) {
      return landmarks[tip].x > landmarks[bases[i]].x;
    }
    return landmarks[tip].y < landmarks[bases[i]].y;
  });
}

function getHandShape(fingers) {
  const extended = fingers.filter((f) => f).length;
  if (extended >= 4) return "open-palm";
  if (extended === 2 && fingers[1] && fingers[2]) return "peace";
  if (extended === 1 && fingers[1]) return "pointing";
  return "unknown";
}

function detectPinch(landmarks) {
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const distance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
  return distance < 0.05;
}

function readGestureSettings() {
  try {
    const stored = localStorage.getItem(GESTURE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : getDefaultSettings();
  } catch {
    return getDefaultSettings();
  }
}

function writeGestureSettings(settings) {
  try {
    localStorage.setItem(GESTURE_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

function getDefaultSettings() {
  return {
    enabled: false,
    enabledGestures: Object.keys(DEFAULT_GESTURES),
    sensitivity: 0.7,
    holdDuration: 300,
    confidenceThreshold: 0.75,
    leftHanded: false,
    onlyWhileVisible: true,
    requireVoiceConfirm: false,
    customGestures: [],
  };
}

let handDetector = null;
let detectorLoading = false;

async function loadHandDetector() {
  if (handDetector) return handDetector;
  if (detectorLoading) {
    while (detectorLoading) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return handDetector;
  }

  detectorLoading = true;
  try {
    const { createDetector } = await import("@mediapipe/hands");
    handDetector = await createDetector({
      maxHands: 2,
      minHandDetectionConfidence: 0.7,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.7,
    });
    detectorLoading = false;
    return handDetector;
  } catch (err) {
    detectorLoading = false;
    console.warn("MediaPipe Hands not available:", err);
    return null;
  }
}

export function useGestureControl() {
  const [settings, setSettings] = useState(() => readGestureSettings());
  const [isActive, setIsActive] = useState(false);
  const [detectedGesture, setDetectedGesture] = useState(null);
  const isSupportedRef = useRef(false);
  const [isSupported, setIsSupported] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);
  const lastGestureRef = useRef(null);
  const gestureStartRef = useRef(null);

  const executeGestureActionRef = useRef(null);
  const handleGestureRef = useRef(null);
  const detectLoopRef = useRef(null);

  const executeGestureAction = useCallback((gesture, handedness) => {
    const config = DEFAULT_GESTURES[gesture];
    if (!config) return;

    const eventName = `gesture.${config.action}`;
    publish(eventName, { gesture, handedness, timestamp: Date.now() });
  }, []);

  useLayoutEffect(() => {
    executeGestureActionRef.current = executeGestureAction;
  }, [executeGestureAction]);

  const handleGesture = useCallback((gesture, handedness) => {
    if (!settings.enabledGestures.includes(gesture)) return;

    const now = Date.now();
    if (lastGestureRef.current === gesture) {
      if (!gestureStartRef.current) {
        gestureStartRef.current = now;
      } else if (now - gestureStartRef.current >= settings.holdDuration) {
        if (detectedGesture !== gesture) {
          setDetectedGesture(gesture);
          executeGestureActionRef.current?.(gesture, handedness);
          gestureStartRef.current = null;
        }
      }
    } else {
      lastGestureRef.current = gesture;
      gestureStartRef.current = now;
    }
  }, [settings.enabledGestures, settings.holdDuration, detectedGesture]);

  useLayoutEffect(() => {
    handleGestureRef.current = handleGesture;
  }, [handleGesture]);

  const detectLoop = useCallback((detector) => {
    if (!isActive || !videoRef.current || !detector) return;

    detector.estimateHands(videoRef.current).then((hands) => {
      if (!isActive) return;

      for (const hand of hands) {
        const gesture = classifyGesture(hand.keypoints);
        const isPinch = detectPinch(hand.keypoints);

        if (gesture || isPinch) {
          const detected = gesture || (isPinch ? "pinch" : null);
          handleGestureRef.current?.(detected, hand.handedness);
        }
      }

      if (isActive) {
        animationRef.current = requestAnimationFrame(() => detectLoopRef.current(detector));
      }
    });
  }, [isActive]);

  useLayoutEffect(() => {
    detectLoopRef.current = detectLoop;
  }, [detectLoop]);

  const startDetection = useCallback(async () => {
    if (!isSupportedRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detector = await loadHandDetector();
      if (!detector) {
        console.warn("Hand detection not available");
        return;
      }

      setIsActive(true);
      detectLoopRef.current?.(detector);
    } catch (err) {
      console.warn("Gesture detection failed:", err);
      setIsActive(false);
    }
  }, []);

  const stopDetection = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setIsActive(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      if (mounted) {
        isSupportedRef.current = true;
      }
    }
    if (settings.enabled) {
      startDetection();
    }
    return () => {
      mounted = false;
      stopDetection();
    };
  }, [settings.enabled, startDetection, stopDetection]);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      setIsSupported(true);
    }
  }, []);

  const updateSettings = useCallback((newSettings) => {
    const merged = { ...settings, ...newSettings };
    setSettings(merged);
    writeGestureSettings(merged);
  }, [settings]);

  const setVideoRef = useCallback((el) => {
    videoRef.current = el;
  }, []);

  return {
    settings,
    updateSettings,
    isActive,
    isSupported,
    detectedGesture,
    videoRef: setVideoRef,
    availableGestures: DEFAULT_GESTURES,
  };
}

export function getGestureSettings() {
  return readGestureSettings();
}

export function setGestureSettings(newSettings) {
  writeGestureSettings(newSettings);
  return getGestureSettings();
}

export function getAvailableGestures() {
  return DEFAULT_GESTURES;
}

export default {
  useGestureControl,
  getGestureSettings,
  setGestureSettings,
  getAvailableGestures,
};