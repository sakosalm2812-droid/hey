import { useCallback, useEffect, useState } from "react";
import { subscribe } from "../core/eventBus.js";
import { GESTURE_STATES, gestureEngine } from "../core/gestureEngine.js";

const DEFAULT_GESTURES = Object.freeze({
  "open-palm": { id: "G01", name: "Summon HEY" },
  "open-palm-to-fist": { id: "G02", name: "Grab" },
  "two-fingers-raised": { id: "G12", name: "Play or pause" },
  "thumbs-up": { id: "G15", name: "Confirm" },
  "thumbs-down": { id: "G16", name: "Reject or dismiss" },
});

const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  enabledGestures: Object.keys(DEFAULT_GESTURES),
  sensitivity: 0.7,
  holdDuration: 300,
  confidenceThreshold: 0.75,
  leftHanded: false,
  onlyWhileVisible: true,
  requireVoiceConfirm: false,
  customGestures: [],
});

let gestureSettings = { ...DEFAULT_SETTINGS, enabledGestures: [...DEFAULT_SETTINGS.enabledGestures] };

function copySettings(settings) {
  return {
    ...settings,
    enabledGestures: [...settings.enabledGestures],
    customGestures: [...settings.customGestures],
  };
}

export function useGestureControl({ profileId = null } = {}) {
  const [settings, setSettings] = useState(() => copySettings(gestureSettings));
  const [isActive, setIsActive] = useState(gestureEngine.getRecognitionState() === GESTURE_STATES.ACTIVE);
  const [detectedGesture, setDetectedGesture] = useState(null);
  const [capability, setCapability] = useState({
    status: "unknown",
    cameraSupported: false,
    permission: "unknown",
    adapterInstalled: false,
    adapterReady: false,
    recognitionStatus: "unavailable",
    permissionPrompted: false,
  });

  useEffect(() => {
    let mounted = true;
    gestureEngine.getRecognitionCapability().then((report) => {
      if (mounted) setCapability(report);
    });
    const unsubscribeEngine = gestureEngine.subscribe((event, payload) => {
      if (!mounted) return;
      if (event === "recognition_state_changed") {
        setIsActive(payload?.state === GESTURE_STATES.ACTIVE);
      }
      if (event === "camera_capability_changed") {
        gestureEngine.getRecognitionCapability().then((report) => {
          if (mounted) setCapability(report);
        });
      }
    });
    const unsubscribeDetection = subscribe("gesture.detected", (event) => {
      if (mounted) setDetectedGesture(event?.gesture || null);
    });
    return () => {
      mounted = false;
      unsubscribeEngine();
      unsubscribeDetection();
    };
  }, []);

  const updateSettings = useCallback((newSettings) => {
    if (!newSettings || typeof newSettings !== "object" || Array.isArray(newSettings)) return settings;
    gestureSettings = { ...gestureSettings, ...newSettings };
    const next = copySettings(gestureSettings);
    setSettings(next);
    return next;
  }, [settings]);

  const startDetection = useCallback((options = {}) => {
    if (!profileId) return Promise.resolve({ success: false, error: "A gesture profile is required.", code: "profile_required" });
    return gestureEngine.startRecognition(profileId, options);
  }, [profileId]);

  const stopDetection = useCallback((reason = "user_stop") => gestureEngine.stopRecognition(reason), []);
  const pauseDetection = useCallback(() => gestureEngine.pauseRecognition(), []);
  const resumeDetection = useCallback(() => gestureEngine.resumeRecognition(), []);

  return {
    settings,
    updateSettings,
    isActive,
    isSupported: capability.cameraSupported,
    capability,
    detectedGesture,
    startDetection,
    pauseDetection,
    resumeDetection,
    stopDetection,
    availableGestures: DEFAULT_GESTURES,
  };
}

export function getGestureSettings() {
  return copySettings(gestureSettings);
}

export function setGestureSettings(newSettings) {
  if (!newSettings || typeof newSettings !== "object" || Array.isArray(newSettings)) return getGestureSettings();
  gestureSettings = { ...gestureSettings, ...newSettings };
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
