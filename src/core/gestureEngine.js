import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";
import { getSetting } from "./settingsRegistry.js";

const GESTURES = Object.freeze({
  G01: { id: "G01", name: "open_palm_held", description: "Summon HEY/overview" },
  G02: { id: "G02", name: "open_palm_to_fist", description: "Grab target" },
  G03: { id: "G03", name: "fist_movement", description: "Move object/window/widget" },
  G04: { id: "G04", name: "thumb_index_pinch", description: "Primary select/click" },
  G05: { id: "G05", name: "pinch_movement", description: "Precision drag" },
  G06: { id: "G06", name: "two_hand_spread", description: "Enlarge/zoom" },
  G07: { id: "G07", name: "two_hand_inward_pinch", description: "Shrink/zoom out" },
  G08: { id: "G08", name: "swipe_left", description: "Back/previous" },
  G09: { id: "G09", name: "swipe_right", description: "Forward/next" },
  G10: { id: "G10", name: "swipe_down", description: "Minimize/dock" },
  G11: { id: "G11", name: "swipe_up", description: "Restore/maximize/expand" },
  G12: { id: "G12", name: "two_fingers_raised", description: "Play/pause" },
  G13: { id: "G13", name: "raised_hand_stop_palm", description: "Interrupt speech/stop manipulation" },
  G14: { id: "G14", name: "point_plus_pinch", description: "Target and activate" },
  G15: { id: "G15", name: "thumbs_up", description: "Optional low-risk confirm" },
  G16: { id: "G16", name: "thumbs_down", description: "Reject/dismiss" },
  G17: { id: "G17", name: "both_palms", description: "Overview or exit manipulation" },
  G18: { id: "G18", name: "horizontal_rotation", description: "Continuous control (volume)" },
  G19: { id: "G19", name: "vertical_air_scroll", description: "Scroll" },
  G20: { id: "G20", name: "custom_signature", description: "Custom command/workflow binding" },
});

const GESTURE_STATES = Object.freeze({
  INACTIVE: "inactive",
  CALIBRATING: "calibrating",
  ACTIVE: "active",
  PAUSED: "paused",
  ERROR: "error",
});

const SCOPES = Object.freeze({
  FOREGROUND: "foreground",
  LIVE_ONLY: "live-only",
  APP: "app",
  SYSTEM_VISIBLE: "system-visible",
});

function generateProfileId() {
  return `gesture_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateBindingId() {
  return `binding_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateSampleId() {
  return `sample_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export class GestureEngine {
  constructor() {
    this.profiles = new Map();
    this.bindings = new Map();
    this.customGestures = new Map();
    this.recognitionState = GESTURE_STATES.INACTIVE;
    this.mediaStream = null;
    this.videoElement = null;
    this.detector = null;
    this.recognitionAdapter = null;
    this.recognitionAbortController = null;
    this.recognitionGeneration = 0;
    this.activeProfileId = null;
    this.frameCanvas = null;
    this.lastFrameAt = 0;
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = localStorage.getItem("hey_gesture_profiles");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.profiles) {
          Object.entries(parsed.profiles).forEach(([id, profile]) => {
            this.profiles.set(id, profile);
          });
        }
        if (parsed.bindings) {
          Object.entries(parsed.bindings).forEach(([id, binding]) => {
            this.bindings.set(id, binding);
          });
        }
        if (parsed.customGestures) {
          Object.entries(parsed.customGestures).forEach(([id, gesture]) => {
            this.customGestures.set(id, gesture);
          });
        }
      }
    } catch (err) {
      console.warn("Failed to load gesture engine:", err);
    }
  }

  save() {
    try {
      localStorage.setItem("hey_gesture_profiles", JSON.stringify({
        profiles: Object.fromEntries(this.profiles),
        bindings: Object.fromEntries(this.bindings),
        customGestures: Object.fromEntries(this.customGestures),
      }));
    } catch (err) {
      console.warn("Failed to save gesture engine:", err);
    }
  }

  createProfile(input = {}) {
    const profileId = generateProfileId();
    const now = new Date().toISOString();
    
    const profile = {
      id: profileId,
      name: input.name || "Gesture Profile",
      handedness: input.handedness || "right",
      dominantHand: input.dominantHand || "right",
      singleHand: input.singleHand !== false,
      twoHand: input.twoHand !== false,
      sensitivity: input.sensitivity || 0.8,
      confidence: input.confidence || getSetting("gesture.confidence") || 0.90,
      activationZone: input.activationZone || "center",
      cameraId: input.cameraId || null,
      holdMs: input.holdMs || getSetting("gesture.hold_ms") || 400,
      cooldownMs: input.cooldownMs || getSetting("gesture.cooldown_ms") || 600,
      smoothing: input.smoothing || "moderate",
      accidentalTriggerGuard: input.accidentalTriggerGuard !== false,
      overlay: input.overlay !== false,
      sounds: input.sounds !== false,
      haptics: input.haptics !== false,
      tutorialMode: input.tutorialMode !== false,
      reducedMotion: input.reducedMotion || getSetting("appearance.motion") === "reduced",
      scope: input.scope || getSetting("gesture.scope") || SCOPES.FOREGROUND,
      perAppProfiles: input.perAppProfiles || {},
      perDeviceProfiles: input.perDeviceProfiles || {},
      temporaryDisable: false,
      liveOnly: input.liveOnly || false,
      systemWide: input.systemWide || false,
      createdAt: now,
      updatedAt: now,
      bindings: [],
    };

    this.profiles.set(profileId, profile);
    this.save();
    this.notify("profile_created", profile);
    return profile;
  }

  getProfile(id) {
    return this.profiles.get(id) || null;
  }

  getAllProfiles() {
    return Array.from(this.profiles.values());
  }

  updateProfile(id, updates) {
    const profile = this.profiles.get(id);
    if (!profile) return null;

    const updated = { ...profile, ...updates, updatedAt: new Date().toISOString() };
    this.profiles.set(id, updated);
    this.save();
    this.notify("profile_updated", updated);
    return updated;
  }

  deleteProfile(id) {
    this.profiles.delete(id);
    this.bindings.forEach((binding, bindingId) => {
      if (binding.profileId === id) this.bindings.delete(bindingId);
    });
    this.save();
    this.notify("profile_deleted", { id });
    return true;
  }

  createBinding(input) {
    const bindingId = generateBindingId();
    const now = new Date().toISOString();
    
    const binding = {
      id: bindingId,
      profileId: input.profileId,
      gestureId: input.gestureId,
      action: input.action,
      actionType: input.actionType,
      target: input.target,
      scope: input.scope || SCOPES.FOREGROUND,
      riskLevel: input.riskLevel || "low",
      requiresConfirmation: input.requiresConfirmation || false,
      parameters: input.parameters || {},
      enabled: true,
      createdAt: now,
      updatedAt: now,
      collisionChecked: false,
      testResults: null,
    };

    this.bindings.set(bindingId, binding);
    
    const profile = this.profiles.get(input.profileId);
    if (profile) {
      profile.bindings.push(bindingId);
      this.profiles.set(input.profileId, profile);
    }
    
    this.save();
    this.notify("binding_created", binding);
    return binding;
  }

  getBinding(id) {
    return this.bindings.get(id) || null;
  }

  getBindingsForProfile(profileId) {
    return Array.from(this.bindings.values()).filter(b => b.profileId === profileId);
  }

  updateBinding(id, updates) {
    const binding = this.bindings.get(id);
    if (!binding) return null;

    const updated = { ...binding, ...updates, updatedAt: new Date().toISOString() };
    this.bindings.set(id, updated);
    this.save();
    this.notify("binding_updated", updated);
    return updated;
  }

  deleteBinding(id) {
    const binding = this.bindings.get(id);
    if (binding) {
      const profile = this.profiles.get(binding.profileId);
      if (profile) {
        profile.bindings = profile.bindings.filter(b => b !== id);
      }
    }
    this.bindings.delete(id);
    this.save();
    this.notify("binding_deleted", { id });
    return true;
  }

  setRecognitionAdapter(adapter) {
    if (adapter !== null && (!adapter || typeof adapter.detect !== "function")) {
      throw new TypeError("Gesture adapter must implement detect(video, profile, context).");
    }
    if (this.recognitionState === GESTURE_STATES.ACTIVE || this.recognitionState === GESTURE_STATES.CALIBRATING) {
      throw new Error("Stop gesture recognition before replacing its adapter.");
    }
    this.recognitionAdapter = adapter;
    return { available: Boolean(adapter), kind: adapter?.kind || null };
  }

  async startRecognition(profileId, { consent = false } = {}) {
    const profile = this.profiles.get(profileId);
    if (!profile) return { success: false, error: "Profile not found", code: "profile_not_found" };
    if (this.recognitionState === GESTURE_STATES.ACTIVE || this.recognitionState === GESTURE_STATES.CALIBRATING) {
      return { success: false, error: "Gesture recognition is already active.", code: "already_active" };
    }
    if (!consent) return { success: false, error: "Explicit camera consent is required.", code: "consent_required" };
    if (!this.recognitionAdapter) {
      return { success: false, error: "No gesture recognition adapter is available on this platform.", code: "adapter_unavailable" };
    }
    if (!globalThis.navigator?.mediaDevices?.getUserMedia || typeof globalThis.document?.createElement !== "function" || typeof globalThis.requestAnimationFrame !== "function") {
      return { success: false, error: "Camera capture is unsupported in this environment.", code: "camera_unsupported" };
    }

    const generation = ++this.recognitionGeneration;
    const abortController = new AbortController();
    this.recognitionAbortController = abortController;
    this.activeProfileId = profileId;
    this.recognitionState = GESTURE_STATES.CALIBRATING;
    this.notify("recognition_state_changed", { state: this.recognitionState, profileId, camera: "requesting" });

    try {
      this.mediaStream = await globalThis.navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: profile.cameraId ? { exact: profile.cameraId } : undefined,
          facingMode: "user",
          width: { ideal: 640, max: 640 },
          height: { ideal: 480, max: 480 },
        },
      });

      if (abortController.signal.aborted || generation !== this.recognitionGeneration) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        return { success: false, error: "Gesture recognition was cancelled.", code: "cancelled" };
      }
      this.videoElement = globalThis.document.createElement("video");
      this.videoElement.srcObject = this.mediaStream;
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;
      await this.videoElement.play();

      const videoTrack = this.mediaStream.getVideoTracks?.()[0];
      if (!videoTrack || videoTrack.readyState === "ended") throw new Error("Camera track is unavailable.");
      videoTrack.addEventListener?.("ended", () => {
        if (generation === this.recognitionGeneration) this.stopRecognition("permission_revoked");
      }, { once: true });

      this.recognitionState = GESTURE_STATES.ACTIVE;
      this.notify("recognition_state_changed", { state: this.recognitionState, profileId, camera: "active", visible: true, processing: "local_adapter" });
      
      this.startDetectionLoop(profileId);
      
      publish("gesture.recognition_started", { profileId });
      recordAudit({ action: "gesture.recognition_started", status: "completed", metadata: { profileId } });
      
      return { success: true, profileId, camera: "active", visible: true, adapter: this.recognitionAdapter.kind || "custom" };
    } catch (error) {
      this.stopRecognition("start_failed");
      this.recognitionState = GESTURE_STATES.ERROR;
      this.notify("recognition_state_changed", { state: this.recognitionState, profileId, camera: "inactive", error: error.message });
      return { success: false, error: error.message, code: "camera_or_adapter_error" };
    }
  }

  startDetectionLoop(profileId) {
    const profile = this.profiles.get(profileId);
    const generation = this.recognitionGeneration;
    const signal = this.recognitionAbortController?.signal;
    if (!profile || !signal || typeof globalThis.requestAnimationFrame !== "function") return;

    const detect = async () => {
      if (generation !== this.recognitionGeneration || signal.aborted) return;

      const now = Date.now();
      if (this.recognitionState === GESTURE_STATES.ACTIVE && this.videoElement && this.videoElement.readyState >= 2 && now - this.lastFrameAt >= 100) {
        this.lastFrameAt = now;
        try {
          const gesture = await this.detectGesture(this.videoElement, profile, signal);
          if (gesture && generation === this.recognitionGeneration && this.recognitionState === GESTURE_STATES.ACTIVE) {
            this.handleGestureDetection(gesture, profile);
          }
        } catch (error) {
          if (!signal.aborted) {
            this.notify("recognition_adapter_error", { profileId, error: error?.message || "Gesture adapter failed." });
            this.stopRecognition("adapter_error");
          }
          return;
        }
      }

      if (generation === this.recognitionGeneration && !signal.aborted) globalThis.requestAnimationFrame(() => detect());
    };

    detect();
  }

  async detectGesture(video, profile, signal) {
    if (!this.recognitionAdapter || signal?.aborted) return null;
    let canvas = this.frameCanvas;
    if (!canvas) {
      canvas = typeof globalThis.OffscreenCanvas === "function"
        ? new globalThis.OffscreenCanvas(640, 480)
        : globalThis.document?.createElement?.("canvas");
      if (!canvas) return null;
      canvas.width = 640;
      canvas.height = 480;
      this.frameCanvas = canvas;
    }
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(video, 0, 0, 640, 480);
    const frame = context.getImageData(0, 0, 640, 480);
    const result = await this.recognitionAdapter.detect(frame, profile, { signal, maxFrameSize: { width: 640, height: 480 } });
    if (signal?.aborted || !result || !GESTURES[result.id] || !Number.isFinite(result.confidence) || result.confidence < profile.confidence) return null;
    return { id: result.id, confidence: result.confidence, timestamp: new Date().toISOString() };
  }

  handleGestureDetection(gesture, profile) {
    const binding = Array.from(this.bindings.values()).find(b => 
      b.profileId === profile.id && 
      b.gestureId === gesture.id && 
      b.enabled &&
      (b.scope === profile.scope || b.scope === SCOPES.SYSTEM_VISIBLE)
    );

    if (!binding) return;

    const now = Date.now();
    if (binding.lastTriggered && now - binding.lastTriggered < profile.cooldownMs) return;
    binding.lastTriggered = now;

    const conflicts = this.checkConflicts(gesture, profile);
    if (conflicts.length > 0 && !binding.allowConflict) {
      this.notify("conflict_detected", { gesture, conflicts, binding });
      return;
    }

    publish("gesture.detected", { gesture, binding, profileId: profile.id });
    recordAudit({ action: "gesture.detected", status: "completed", metadata: { gesture: gesture.id, binding: binding.id } });

    this.executeBinding(binding, gesture);
  }

  checkConflicts(gesture) {
    const conflicts = [];
    
    if (gesture.id === "G01" && this.isSpeakingOrManipulating()) {
      conflicts.push({ type: "semantic", message: "Open palm held conflicts with active speech/manipulation" });
    }
    
    if (gesture.id === "G13" && gesture.id === "G17") {
      conflicts.push({ type: "simultaneous", message: "Stop palm and both palms cannot trigger simultaneously" });
    }

    return conflicts;
  }

  isSpeakingOrManipulating() {
    return false;
  }

  executeBinding(binding, gesture) {
    const action = {
      type: binding.actionType,
      action: binding.action,
      target: binding.target,
      parameters: binding.parameters,
      gesture: gesture.id,
      confidence: gesture.confidence,
      timestamp: new Date().toISOString(),
    };

    if (binding.requiresConfirmation && binding.riskLevel !== "low") {
      this.notify("confirmation_required", { binding, action });
      return;
    }

    publish("gesture.action_executed", { binding, action });
    this.notify("action_executed", { binding, action });
  }

  stopRecognition(reason = "user_stop") {
    this.recognitionGeneration += 1;
    this.recognitionAbortController?.abort(reason);
    this.recognitionAbortController = null;
    this.recognitionState = GESTURE_STATES.INACTIVE;
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    
    if (this.videoElement) {
      this.videoElement.pause?.();
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    try {
      this.recognitionAdapter?.stop?.(reason);
    } catch (error) {
      this.notify("recognition_adapter_error", { profileId: this.activeProfileId, error: error?.message || "Gesture adapter cleanup failed." });
    }
    this.activeProfileId = null;
    this.frameCanvas = null;
    this.lastFrameAt = 0;
    
    this.notify("recognition_state_changed", { state: this.recognitionState, camera: "inactive", reason });
    publish("gesture.recognition_stopped", { reason });
  }

  pauseRecognition() {
    if (this.recognitionState !== GESTURE_STATES.ACTIVE) return false;
    this.recognitionState = GESTURE_STATES.PAUSED;
    this.notify("recognition_state_changed", { state: this.recognitionState, profileId: this.activeProfileId, camera: "active", visible: true });
    return true;
  }

  resumeRecognition() {
    if (this.recognitionState === GESTURE_STATES.PAUSED) {
      this.recognitionState = GESTURE_STATES.ACTIVE;
      this.notify("recognition_state_changed", { state: this.recognitionState, profileId: this.activeProfileId, camera: "active", visible: true });
      return true;
    }
    return false;
  }

  createCustomGesture(input) {
    const gestureId = `custom_${Date.now()}`;
    const now = new Date().toISOString();
    
    const gesture = {
      id: gestureId,
      name: input.name,
      samples: input.samples || [],
      signature: input.signature || null,
      action: input.action,
      actionType: input.actionType,
      scope: input.scope || SCOPES.FOREGROUND,
      riskLevel: input.riskLevel || "low",
      requiresConfirmation: input.requiresConfirmation || false,
      createdAt: now,
      updatedAt: now,
      tested: false,
      testResults: null,
    };

    this.customGestures.set(gestureId, gesture);
    this.save();
    this.notify("custom_gesture_created", gesture);
    return gesture;
  }

  addGestureSample(gestureId, sample) {
    const gesture = this.customGestures.get(gestureId);
    if (!gesture) return { error: "Custom gesture not found" };

    gesture.samples.push({
      id: generateSampleId(),
      data: sample,
      timestamp: new Date().toISOString(),
    });
    
    gesture.updatedAt = new Date().toISOString();
    this.customGestures.set(gestureId, gesture);
    this.save();
    return gesture;
  }

  testCustomGesture(gestureId, testData) {
    const gesture = this.customGestures.get(gestureId);
    if (!gesture) return { error: "Custom gesture not found" };

    gesture.testResults = {
      truePositives: testData.truePositives || 0,
      falsePositives: testData.falsePositives || 0,
      trueNegatives: testData.trueNegatives || 0,
      falseNegatives: testData.falseNegatives || 0,
      testedAt: new Date().toISOString(),
    };
    
    gesture.tested = true;
    gesture.updatedAt = new Date().toISOString();
    this.customGestures.set(gestureId, gesture);
    this.save();
    
    this.notify("custom_gesture_tested", { gestureId, results: gesture.testResults });
    return gesture.testResults;
  }

  getCustomGestures() {
    return Array.from(this.customGestures.values());
  }

  getCustomGesture(id) {
    return this.customGestures.get(id) || null;
  }

  deleteCustomGesture(id) {
    this.customGestures.delete(id);
    this.save();
    return true;
  }

  getGestures() {
    return Object.values(GESTURES);
  }

  getGesture(id) {
    return GESTURES[id] || null;
  }

  getRecognitionState() {
    return this.recognitionState;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Gesture listener error:", err); }
    });
  }
}

export const gestureEngine = new GestureEngine();

export function createGestureProfile(input) {
  return gestureEngine.createProfile(input);
}

export function getGestureProfile(id) {
  return gestureEngine.getProfile(id);
}

export function getAllGestureProfiles() {
  return gestureEngine.getAllProfiles();
}

export function updateGestureProfile(id, updates) {
  return gestureEngine.updateProfile(id, updates);
}

export function deleteGestureProfile(id) {
  return gestureEngine.deleteProfile(id);
}

export function createGestureBinding(input) {
  return gestureEngine.createBinding(input);
}

export function getGestureBinding(id) {
  return gestureEngine.getBinding(id);
}

export function getGestureBindingsForProfile(profileId) {
  return gestureEngine.getBindingsForProfile(profileId);
}

export function updateGestureBinding(id, updates) {
  return gestureEngine.updateBinding(id, updates);
}

export function deleteGestureBinding(id) {
  return gestureEngine.deleteBinding(id);
}

export function startGestureRecognition(profileId, options) {
  return gestureEngine.startRecognition(profileId, options);
}

export function setGestureRecognitionAdapter(adapter) {
  return gestureEngine.setRecognitionAdapter(adapter);
}

export function stopGestureRecognition() {
  return gestureEngine.stopRecognition();
}

export function pauseGestureRecognition() {
  return gestureEngine.pauseRecognition();
}

export function resumeGestureRecognition() {
  return gestureEngine.resumeRecognition();
}

export function createCustomGesture(input) {
  return gestureEngine.createCustomGesture(input);
}

export function addGestureSample(gestureId, sample) {
  return gestureEngine.addGestureSample(gestureId, sample);
}

export function testCustomGesture(gestureId, testData) {
  return gestureEngine.testCustomGesture(gestureId, testData);
}

export function getCustomGestures() {
  return gestureEngine.getCustomGestures();
}

export function getCustomGesture(id) {
  return gestureEngine.getCustomGesture(id);
}

export function deleteCustomGesture(id) {
  return gestureEngine.deleteCustomGesture(id);
}

export function getAllGestures() {
  return gestureEngine.getGestures();
}

export function getGesture(id) {
  return gestureEngine.getGesture(id);
}

export function getGestureRecognitionState() {
  return gestureEngine.getRecognitionState();
}

export function subscribeToGestures(listener) {
  return gestureEngine.subscribe(listener);
}

export { GESTURES, GESTURE_STATES, SCOPES };

export default gestureEngine;
