import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";
import { getSetting } from "./settingsRegistry.js";
import { getAccountScope, getAccountStorageKey, subscribeAccountScope } from "./accountScope.js";
import { createBundledHandGestureAdapter } from "../lib/bundledHandGestureAdapter.js";

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

const GESTURE_COOLDOWN_MIN_MS = 200;
const GESTURE_COOLDOWN_MAX_MS = 2000;
const GESTURE_PROFILE_STORE_VERSION = 1;
const GESTURE_PROFILE_STORE_KEY = "hey_gesture_profiles";
const MAX_GESTURE_PROFILE_STORE_LENGTH = 128_000;
const MAX_GESTURE_PROFILES = 32;
const MAX_GESTURE_BINDINGS = 128;
const MAX_CUSTOM_GESTURES = 32;
const MAX_CUSTOM_GESTURE_SAMPLES = 64;
const MAX_CUSTOM_SAMPLE_VALUES = 128;
const SAFE_UI_ACTIONS = new Set([
  "summon", "cancel", "navigate_back", "navigate_forward", "minimize", "expand",
  "overview", "dismiss", "scroll",
]);

function validateGestureCooldownMs(value) {
  if (!Number.isSafeInteger(value) || value < GESTURE_COOLDOWN_MIN_MS || value > GESTURE_COOLDOWN_MAX_MS) {
    throw new RangeError(`Gesture cooldown must be between ${GESTURE_COOLDOWN_MIN_MS} and ${GESTURE_COOLDOWN_MAX_MS} milliseconds.`);
  }
  return value;
}

function copyGestureJson(value, label = "Gesture data") {
  let visited = 0;
  const ancestors = new WeakSet();
  function visit(current, depth) {
    visited += 1;
    if (visited > 5000 || depth > 12) throw new TypeError(`${label} exceeds the supported size.`);
    if (current === null || typeof current === "string" || typeof current === "boolean") return current;
    if (typeof current === "number" && Number.isFinite(current)) return current;
    if (!current || typeof current !== "object" || ancestors.has(current)) throw new TypeError(`${label} must be bounded plain JSON data.`);
    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        const keys = Reflect.ownKeys(current);
        if (keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(0|[1-9]\d*)$/u.test(key)))) {
          throw new TypeError(`${label} arrays cannot have custom properties.`);
        }
        const result = [];
        for (let index = 0; index < current.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
          if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label} arrays must be dense data.`);
          result.push(visit(descriptor.value, depth + 1));
        }
        return result;
      }
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must use plain objects.`);
      const result = {};
      for (const key of Reflect.ownKeys(current)) {
        if (typeof key !== "string" || ["__proto__", "prototype", "constructor"].includes(key)) throw new TypeError(`${label} has an unsupported field.`);
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label} cannot contain accessors or hidden fields.`);
        Object.defineProperty(result, key, { value: visit(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true });
      }
      return result;
    } finally { ancestors.delete(current); }
  }
  return visit(value, 0);
}

function validateSensitivity(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0.1 || value > 1) {
    throw new RangeError("Gesture sensitivity must be between 0.1 and 1.0.");
  }
  return value;
}

function validateSafeUiMapping(actionType, action) {
  if (actionType !== "ui" || typeof action !== "string" || !SAFE_UI_ACTIONS.has(action)) {
    throw new TypeError("Gesture mappings may only request an allowlisted, low-risk UI action.");
  }
}

function validateGestureProfile(value, expectedId) {
  const profile = copyGestureJson(value, "Gesture profile");
  const allowed = new Set([
    "id", "name", "handedness", "dominantHand", "singleHand", "twoHand", "sensitivity", "confidence",
    "activationZone", "cameraId", "holdMs", "cooldownMs", "smoothing", "accidentalTriggerGuard", "overlay",
    "sounds", "haptics", "tutorialMode", "reducedMotion", "scope", "perAppProfiles", "perDeviceProfiles",
    "temporaryDisable", "liveOnly", "systemWide", "createdAt", "updatedAt", "bindings",
  ]);
  if (Object.keys(profile).some((key) => !allowed.has(key)) || profile.id !== expectedId
    || typeof profile.name !== "string" || !profile.name.trim() || profile.name.length > 80
    || !["left", "right", "both"].includes(profile.handedness) || !["left", "right", "both"].includes(profile.dominantHand)
    || typeof profile.singleHand !== "boolean" || typeof profile.twoHand !== "boolean"
    || typeof profile.sensitivity !== "number" || !Number.isFinite(profile.sensitivity) || profile.sensitivity < 0.1 || profile.sensitivity > 1
    || typeof profile.confidence !== "number" || !Number.isFinite(profile.confidence) || profile.confidence < 0.7 || profile.confidence > 0.99
    || typeof profile.holdMs !== "number" || !Number.isSafeInteger(profile.holdMs) || profile.holdMs < 200 || profile.holdMs > 1500
    || !Number.isSafeInteger(profile.cooldownMs) || profile.cooldownMs < GESTURE_COOLDOWN_MIN_MS || profile.cooldownMs > GESTURE_COOLDOWN_MAX_MS
    || (profile.cameraId != null && (typeof profile.cameraId !== "string" || profile.cameraId.length > 256))
    || !["center", "left", "right"].includes(profile.activationZone)
    || !["low", "moderate", "high"].includes(profile.smoothing)
    || ["accidentalTriggerGuard", "overlay", "sounds", "haptics", "tutorialMode", "reducedMotion", "temporaryDisable", "liveOnly", "systemWide"]
      .some((key) => typeof profile[key] !== "boolean")
    || profile.temporaryDisable || profile.liveOnly || profile.systemWide
    || !Object.values(SCOPES).includes(profile.scope)
    || typeof profile.createdAt !== "string" || !Number.isFinite(Date.parse(profile.createdAt))
    || typeof profile.updatedAt !== "string" || !Number.isFinite(Date.parse(profile.updatedAt))
    || !Array.isArray(profile.bindings) || profile.bindings.length > MAX_GESTURE_BINDINGS
    || profile.bindings.some((bindingId) => typeof bindingId !== "string" || !bindingId.trim())) {
    throw new TypeError("Stored gesture profile is invalid.");
  }
  validateGestureCooldownMs(profile.cooldownMs);
  validateSensitivity(profile.sensitivity);
  profile.perAppProfiles = {};
  profile.perDeviceProfiles = {};
  return profile;
}

function validateGestureBinding(value, expectedId, profiles) {
  const binding = copyGestureJson(value, "Gesture mapping");
  const allowed = new Set([
    "id", "profileId", "gestureId", "action", "actionType", "target", "scope", "riskLevel",
    "requiresConfirmation", "parameters", "enabled", "createdAt", "updatedAt", "collisionChecked", "testResults",
  ]);
  if (Object.keys(binding).some((key) => !allowed.has(key)) || binding.id !== expectedId
    || !profiles.has(binding.profileId) || !Object.hasOwn(GESTURES, binding.gestureId)
    || binding.scope !== profiles.get(binding.profileId)?.scope
    || binding.target !== null || binding.riskLevel !== "low" || binding.requiresConfirmation !== false
    || typeof binding.enabled !== "boolean" || binding.collisionChecked !== false || binding.testResults !== null
    || !Object.values(SCOPES).includes(binding.scope)
    || typeof binding.createdAt !== "string" || !Number.isFinite(Date.parse(binding.createdAt))
    || typeof binding.updatedAt !== "string" || !Number.isFinite(Date.parse(binding.updatedAt))
    || !binding.parameters || typeof binding.parameters !== "object" || Array.isArray(binding.parameters)
    || Object.keys(binding.parameters).length !== 0) {
    throw new TypeError("Stored gesture mapping is invalid.");
  }
  validateSafeUiMapping(binding.actionType, binding.action);
  return binding;
}

function validateCustomGesture(value, expectedId) {
  const gesture = copyGestureJson(value, "Custom gesture mapping");
  const allowed = new Set([
    "id", "name", "gestureId", "samples", "signature", "action", "actionType", "scope", "riskLevel",
    "requiresConfirmation", "createdAt", "updatedAt", "tested", "testResults",
  ]);
  if (Object.keys(gesture).some((key) => !allowed.has(key)) || gesture.id !== expectedId
    || typeof gesture.name !== "string" || !gesture.name.trim() || gesture.name.length > 80
    || !Object.hasOwn(GESTURES, gesture.gestureId) || !Array.isArray(gesture.samples)
    || gesture.samples.length > MAX_CUSTOM_GESTURE_SAMPLES || gesture.signature !== null
    || gesture.riskLevel !== "low" || gesture.requiresConfirmation !== false
    || !Object.values(SCOPES).includes(gesture.scope)
    || typeof gesture.createdAt !== "string" || !Number.isFinite(Date.parse(gesture.createdAt))
    || typeof gesture.updatedAt !== "string" || !Number.isFinite(Date.parse(gesture.updatedAt))
    || gesture.tested !== false || gesture.testResults !== null) {
    throw new TypeError("Stored custom gesture mapping is invalid.");
  }
  validateSafeUiMapping(gesture.actionType, gesture.action);
  for (const sample of gesture.samples) {
    if (!sample || typeof sample.id !== "string" || !sample.id.trim()
      || typeof sample.timestamp !== "string" || !Number.isFinite(Date.parse(sample.timestamp))
      || !Array.isArray(sample.data) || sample.data.length > MAX_CUSTOM_SAMPLE_VALUES
      || sample.data.some((number) => typeof number !== "number" || !Number.isFinite(number) || number < -1 || number > 1)) {
      throw new TypeError("Stored gesture calibration sample is invalid.");
    }
  }
  return gesture;
}

function classifyCameraFailure(error) {
  let name = "";
  try { name = typeof error?.name === "string" ? error.name : ""; } catch { /* Host errors can be accessor-backed. */ }
  if (name === "NotAllowedError" || name === "SecurityError") {
    return { status: "permission_denied", code: "camera_permission_denied" };
  }
  return { status: "unavailable", code: "camera_unavailable" };
}

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
  constructor({ detectionTimeoutMs = 1500, storageProvider = () => globalThis.localStorage } = {}) {
    if (!Number.isSafeInteger(detectionTimeoutMs) || detectionTimeoutMs < 1 || detectionTimeoutMs > 10_000) {
      throw new RangeError("Gesture detection timeout must be between 1 and 10000 milliseconds.");
    }
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
    this.cameraPermissionStatus = null;
    this.cameraPermissionHandler = null;
    this.cameraCapabilityStatus = "unknown";
    this.activeProfileId = null;
    this.frameCanvas = null;
    this.lastFrameAt = 0;
    this.detectionTimeoutMs = detectionTimeoutMs;
    this.detectionEpoch = 0;
    this.gestureCooldowns = new Map();
    this.listeners = new Set();
    this.storageProvider = storageProvider;
    this.loadedAccountScope = null;
    this.storageStatus = "unloaded";
    this.load();
  }

  load() {
    if (this.recognitionState !== GESTURE_STATES.INACTIVE) this.stopRecognition("profile_store_reloaded");
    this.profiles.clear();
    this.bindings.clear();
    this.customGestures.clear();
    const scope = getAccountScope();
    this.loadedAccountScope = scope;
    if (!scope.startsWith("account:") || !scope.slice("account:".length).trim()) {
      this.storageStatus = "account_required";
      return { success: false, status: this.storageStatus };
    }

    try {
      const storage = this.storageProvider();
      if (typeof storage?.getItem !== "function") throw new TypeError("Gesture profile storage is unavailable.");
      const raw = Reflect.apply(storage.getItem, storage, [getAccountStorageKey(GESTURE_PROFILE_STORE_KEY, scope)]);
      if (getAccountScope() !== scope) return { success: false, status: "account_changed" };
      if (raw == null) {
        this.storageStatus = "default";
        return { success: true, status: this.storageStatus };
      }
      if (typeof raw !== "string" || raw.length > MAX_GESTURE_PROFILE_STORE_LENGTH) throw new TypeError("Gesture profile store exceeds the supported size.");
      const envelope = copyGestureJson(JSON.parse(raw), "Stored gesture profile store");
      if (!envelope || envelope.version !== GESTURE_PROFILE_STORE_VERSION || envelope.scope !== scope
        || Object.keys(envelope).some((key) => !["version", "scope", "profiles", "bindings", "customGestures"].includes(key))
        || !Array.isArray(envelope.profiles) || envelope.profiles.length > MAX_GESTURE_PROFILES
        || !Array.isArray(envelope.bindings) || envelope.bindings.length > MAX_GESTURE_BINDINGS
        || !Array.isArray(envelope.customGestures) || envelope.customGestures.length > MAX_CUSTOM_GESTURES) {
        throw new TypeError("Stored gesture profile store is invalid.");
      }
      const profiles = new Map(envelope.profiles.map((profile) => {
        const normalized = validateGestureProfile(profile, profile?.id);
        return [normalized.id, normalized];
      }));
      if (profiles.size !== envelope.profiles.length) throw new TypeError("Stored gesture profile IDs must be unique.");
      const bindings = new Map(envelope.bindings.map((binding) => {
        const normalized = validateGestureBinding(binding, binding?.id, profiles);
        return [normalized.id, normalized];
      }));
      if (bindings.size !== envelope.bindings.length) throw new TypeError("Stored gesture mapping IDs must be unique.");
      for (const profile of profiles.values()) {
        const actual = [...bindings.values()].filter((binding) => binding.profileId === profile.id).map((binding) => binding.id).sort();
        if ([...profile.bindings].sort().join("\u0000") !== actual.join("\u0000")) throw new TypeError("Stored gesture profile bindings do not match their mappings.");
      }
      const customGestures = new Map(envelope.customGestures.map((gesture) => {
        const normalized = validateCustomGesture(gesture, gesture?.id);
        return [normalized.id, normalized];
      }));
      if (customGestures.size !== envelope.customGestures.length) throw new TypeError("Stored custom gesture IDs must be unique.");
      if (getAccountScope() !== scope) return { success: false, status: "account_changed" };
      this.profiles = profiles;
      this.bindings = bindings;
      this.customGestures = customGestures;
      this.storageStatus = "loaded";
      return { success: true, status: this.storageStatus };
    } catch {
      this.profiles.clear();
      this.bindings.clear();
      this.customGestures.clear();
      this.storageStatus = "invalid_store";
      return { success: false, status: this.storageStatus };
    }
  }

  save() {
    const scope = getAccountScope();
    if (!scope.startsWith("account:") || scope !== this.loadedAccountScope || !["default", "loaded", "saved"].includes(this.storageStatus)) return false;
    let storage;
    let key;
    let previous;
    let previousRead = false;
    let writeAttempted = false;
    const rollback = () => {
      if (!previousRead || !writeAttempted) return;
      try {
        if (previous == null) Reflect.apply(storage.removeItem, storage, [key]);
        else Reflect.apply(storage.setItem, storage, [key, previous]);
      } catch { /* The operation still reports failure if storage cannot roll back. */ }
    };
    try {
      if (this.profiles.size > MAX_GESTURE_PROFILES || this.bindings.size > MAX_GESTURE_BINDINGS || this.customGestures.size > MAX_CUSTOM_GESTURES) return false;
      const profiles = [...this.profiles.values()].map((profile) => validateGestureProfile(profile, profile.id));
      const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
      const bindings = [...this.bindings.values()].map((binding) => validateGestureBinding(binding, binding.id, profileMap));
      const customGestures = [...this.customGestures.values()].map((gesture) => validateCustomGesture(gesture, gesture.id));
      const serialized = JSON.stringify({ version: GESTURE_PROFILE_STORE_VERSION, scope, profiles, bindings, customGestures });
      if (serialized.length > MAX_GESTURE_PROFILE_STORE_LENGTH || getAccountScope() !== scope) return false;
      storage = this.storageProvider();
      if (typeof storage?.getItem !== "function" || typeof storage?.setItem !== "function" || typeof storage?.removeItem !== "function") return false;
      key = getAccountStorageKey(GESTURE_PROFILE_STORE_KEY, scope);
      previous = Reflect.apply(storage.getItem, storage, [key]);
      previousRead = true;
      if (getAccountScope() !== scope) return false;
      writeAttempted = true;
      Reflect.apply(storage.setItem, storage, [key, serialized]);
      const readBack = Reflect.apply(storage.getItem, storage, [key]);
      if (readBack !== serialized || getAccountScope() !== scope) {
        rollback();
        return false;
      }
      this.storageStatus = "saved";
      return true;
    } catch {
      rollback();
      return false;
    }
  }

  refreshAccountScope() {
    const scope = getAccountScope();
    if (scope === this.loadedAccountScope) return { success: true, status: this.storageStatus };
    if (this.recognitionState !== GESTURE_STATES.INACTIVE) this.stopRecognition("account_changed");
    this.gestureCooldowns.clear();
    this.detectionEpoch += 1;
    return this.load();
  }

  requireWritableAccountScope() {
    this.refreshAccountScope();
    if (!getAccountScope().startsWith("account:") || !["default", "loaded", "saved"].includes(this.storageStatus)) {
      throw new Error("Gesture profile changes require an available, valid account-scoped store.");
    }
    if (this.recognitionState !== GESTURE_STATES.INACTIVE) {
      throw new Error("Stop gesture recognition before changing profile preferences or mappings.");
    }
  }

  setCameraCapabilityStatus(status, reason = null) {
    if (!["supported", "unavailable", "permission_denied", "revoked"].includes(status)) return;
    if (this.cameraCapabilityStatus === status) return;
    this.cameraCapabilityStatus = status;
    const event = { status, reason, sessionState: this.recognitionState };
    this.notify("camera_capability_changed", { ...event });
    publish("gesture.camera_capability_changed", { ...event });
  }

  async getRecognitionCapability() {
    this.refreshAccountScope();
    let cameraSupported;
    let permission = "unknown";
    let navigatorObject;
    try {
      navigatorObject = globalThis.navigator;
      cameraSupported = typeof navigatorObject?.mediaDevices?.getUserMedia === "function"
        && typeof globalThis.document?.createElement === "function"
        && typeof globalThis.requestAnimationFrame === "function";
    } catch { cameraSupported = false; }

    if (cameraSupported) {
      try {
        const permissions = navigatorObject?.permissions;
        if (typeof permissions?.query === "function") {
          const permissionStatus = await Reflect.apply(permissions.query, permissions, [{ name: "camera" }]);
          const state = permissionStatus?.state;
          if (["granted", "denied", "prompt"].includes(state)) permission = state;
        }
      } catch { permission = "unknown"; }
    }

    let status;
    if (!cameraSupported) status = "unavailable";
    else if (permission === "denied") status = this.cameraCapabilityStatus === "revoked" ? "revoked" : "permission_denied";
    else if (this.cameraCapabilityStatus === "revoked" && permission !== "granted") status = "revoked";
    else status = "supported";
    this.setCameraCapabilityStatus(status);

    const adapterInstalled = Boolean(this.recognitionAdapter && typeof this.recognitionAdapter.detect === "function");
    let adapterReady = adapterInstalled;
    try {
      if (adapterInstalled && typeof this.recognitionAdapter.isReady === "function") adapterReady = this.recognitionAdapter.isReady() === true;
    } catch { adapterReady = false; }
    return {
      status,
      cameraSupported,
      permission,
      adapterInstalled,
      adapterReady,
      recognitionStatus: !cameraSupported || !adapterInstalled || status !== "supported"
        ? "unavailable"
        : adapterReady ? "adapter_ready" : "adapter_initialization_required",
      consentRequired: true,
      permissionPrompted: false,
      sessionState: this.recognitionState,
    };
  }

  createProfile(input = {}) {
    this.requireWritableAccountScope();
    if (this.profiles.size >= MAX_GESTURE_PROFILES) throw new RangeError("Gesture profile limit reached.");
    input = copyGestureJson(input, "Gesture profile input");
    const allowedInput = new Set([
      "name", "handedness", "dominantHand", "singleHand", "twoHand", "sensitivity", "confidence",
      "activationZone", "cameraId", "holdMs", "cooldownMs", "smoothing", "accidentalTriggerGuard",
      "overlay", "sounds", "haptics", "tutorialMode", "reducedMotion", "scope",
    ]);
    if (Object.keys(input).some((key) => !allowedInput.has(key))) throw new TypeError("Gesture profile contains unsupported preferences.");
    const profileId = generateProfileId();
    const now = new Date().toISOString();
    const cooldownMs = validateGestureCooldownMs(input.cooldownMs ?? getSetting("gesture.cooldown_ms") ?? 600);
    const sensitivity = validateSensitivity(input.sensitivity ?? 0.8);
    const confidence = input.confidence ?? getSetting("gesture.confidence") ?? 0.9;
    const holdMs = input.holdMs ?? getSetting("gesture.hold_ms") ?? 400;
    if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0.7 || confidence > 0.99) throw new RangeError("Gesture confidence must be between 0.7 and 0.99.");
    if (!Number.isSafeInteger(holdMs) || holdMs < 200 || holdMs > 1500) throw new RangeError("Gesture hold time must be between 200 and 1500 milliseconds.");
    const name = input.name ?? "Gesture Profile";
    const handedness = input.handedness ?? "right";
    const dominantHand = input.dominantHand ?? "right";
    const scope = input.scope ?? getSetting("gesture.scope") ?? SCOPES.FOREGROUND;
    if (typeof name !== "string" || !name.trim() || name.length > 80) throw new TypeError("Gesture profile name is invalid.");
    if (!["left", "right", "both"].includes(handedness) || !["left", "right", "both"].includes(dominantHand)) throw new TypeError("Gesture handedness is invalid.");
    if (!Object.values(SCOPES).includes(scope)) throw new TypeError("Gesture profile scope is invalid.");
    if (input.cameraId != null && (typeof input.cameraId !== "string" || input.cameraId.length > 256)) throw new TypeError("Gesture camera selection is invalid.");
    if (input.activationZone != null && !["center", "left", "right"].includes(input.activationZone)) throw new TypeError("Gesture activation zone is invalid.");
    if (input.smoothing != null && !["low", "moderate", "high"].includes(input.smoothing)) throw new TypeError("Gesture smoothing preference is invalid.");
    for (const key of ["singleHand", "twoHand", "accidentalTriggerGuard", "overlay", "sounds", "haptics", "tutorialMode", "reducedMotion"]) {
      if (input[key] != null && typeof input[key] !== "boolean") throw new TypeError(`Gesture preference ${key} must be boolean.`);
    }
    
    const profile = {
      id: profileId,
      name,
      handedness,
      dominantHand,
      singleHand: input.singleHand !== false,
      twoHand: input.twoHand !== false,
      sensitivity,
      confidence,
      activationZone: input.activationZone || "center",
      cameraId: input.cameraId || null,
      holdMs,
      cooldownMs,
      smoothing: input.smoothing || "moderate",
      accidentalTriggerGuard: input.accidentalTriggerGuard !== false,
      overlay: input.overlay !== false,
      sounds: input.sounds !== false,
      haptics: input.haptics !== false,
      tutorialMode: input.tutorialMode !== false,
      reducedMotion: input.reducedMotion || getSetting("appearance.motion") === "reduced",
      scope: input.scope || getSetting("gesture.scope") || SCOPES.FOREGROUND,
      perAppProfiles: {},
      perDeviceProfiles: {},
      temporaryDisable: false,
      liveOnly: input.liveOnly || false,
      systemWide: input.systemWide || false,
      createdAt: now,
      updatedAt: now,
      bindings: [],
    };

    this.profiles.set(profileId, profile);
    if (!this.save()) {
      this.profiles.delete(profileId);
      throw new Error("Gesture profile could not be safely saved.");
    }
    this.notify("profile_created", copyGestureJson(profile, "Gesture profile"));
    return copyGestureJson(profile, "Gesture profile");
  }

  getProfile(id) {
    this.refreshAccountScope();
    const profile = this.profiles.get(id);
    return profile ? copyGestureJson(profile, "Gesture profile") : null;
  }

  getAllProfiles() {
    this.refreshAccountScope();
    return Array.from(this.profiles.values(), (profile) => copyGestureJson(profile, "Gesture profile"));
  }

  updateProfile(id, updates) {
    this.requireWritableAccountScope();
    const profile = this.profiles.get(id);
    if (!profile) return null;
    const safeUpdates = copyGestureJson(updates, "Gesture profile update");
    const allowed = new Set(["name", "sensitivity", "cooldownMs"]);
    if (Object.keys(safeUpdates).some((key) => !allowed.has(key))) throw new TypeError("Gesture profile update contains a protected or unsupported field.");
    if (Object.hasOwn(safeUpdates, "cooldownMs")) validateGestureCooldownMs(safeUpdates.cooldownMs);
    if (Object.hasOwn(safeUpdates, "sensitivity")) validateSensitivity(safeUpdates.sensitivity);
    if (Object.hasOwn(safeUpdates, "name") && (typeof safeUpdates.name !== "string" || !safeUpdates.name.trim() || safeUpdates.name.length > 80)) throw new TypeError("Gesture profile name is invalid.");
    const updated = { ...profile, ...safeUpdates, updatedAt: new Date().toISOString() };
    this.profiles.set(id, updated);
    if (!this.save()) {
      this.profiles.set(id, profile);
      throw new Error("Gesture profile update could not be safely saved.");
    }
    this.notify("profile_updated", copyGestureJson(updated, "Gesture profile"));
    return copyGestureJson(updated, "Gesture profile");
  }

  deleteProfile(id) {
    this.requireWritableAccountScope();
    const profile = this.profiles.get(id);
    if (!profile) return false;
    const removedBindings = [...this.bindings.values()].filter((binding) => binding.profileId === id);
    this.profiles.delete(id);
    for (const binding of removedBindings) this.bindings.delete(binding.id);
    if (!this.save()) {
      this.profiles.set(id, profile);
      for (const binding of removedBindings) this.bindings.set(binding.id, binding);
      throw new Error("Gesture profile could not be safely deleted.");
    }
    this.notify("profile_deleted", { id });
    return true;
  }

  createBinding(input) {
    this.requireWritableAccountScope();
    input = copyGestureJson(input, "Gesture mapping input");
    const allowed = new Set(["profileId", "gestureId", "action", "actionType", "scope", "riskLevel", "requiresConfirmation"]);
    if (Object.keys(input).some((key) => !allowed.has(key))) throw new TypeError("Gesture mapping contains unsupported fields.");
    const profile = this.profiles.get(input.profileId);
    if (!profile) throw new TypeError("Gesture mapping must reference an active account profile.");
    if (!Object.hasOwn(GESTURES, input.gestureId)) throw new TypeError("Gesture mapping must use a recognized gesture.");
    validateSafeUiMapping(input.actionType, input.action);
    if ((input.riskLevel ?? "low") !== "low" || input.requiresConfirmation === true) throw new TypeError("Gesture mappings cannot set risk or confirmation authority.");
    if ([...this.bindings.values()].some((binding) => binding.profileId === profile.id && binding.gestureId === input.gestureId)) {
      throw new TypeError("Each recognized gesture may have only one mapping per profile.");
    }
    if (this.bindings.size >= MAX_GESTURE_BINDINGS) throw new RangeError("Gesture mapping limit reached.");
    const scope = input.scope ?? profile.scope;
    if (scope !== profile.scope) throw new TypeError("Gesture mapping scope must match its profile scope.");
    const bindingId = generateBindingId();
    const now = new Date().toISOString();

    const binding = {
      id: bindingId,
      profileId: input.profileId,
      gestureId: input.gestureId,
      action: input.action,
      actionType: input.actionType,
      target: null,
      scope,
      riskLevel: "low",
      requiresConfirmation: false,
      parameters: {},
      enabled: true,
      createdAt: now,
      updatedAt: now,
      collisionChecked: false,
      testResults: null,
    };

    this.bindings.set(bindingId, binding);
    profile.bindings.push(bindingId);
    this.profiles.set(input.profileId, profile);
    if (!this.save()) {
      this.bindings.delete(bindingId);
      profile.bindings = profile.bindings.filter((id) => id !== bindingId);
      throw new Error("Gesture mapping could not be safely saved.");
    }
    this.notify("binding_created", copyGestureJson(binding, "Gesture mapping"));
    return copyGestureJson(binding, "Gesture mapping");
  }

  getBinding(id) {
    this.refreshAccountScope();
    const binding = this.bindings.get(id);
    return binding ? copyGestureJson(binding, "Gesture mapping") : null;
  }

  getBindingsForProfile(profileId) {
    this.refreshAccountScope();
    return Array.from(this.bindings.values()).filter((binding) => binding.profileId === profileId).map((binding) => copyGestureJson(binding, "Gesture mapping"));
  }

  updateBinding(id, updates) {
    this.requireWritableAccountScope();
    const binding = this.bindings.get(id);
    if (!binding) return null;
    const safeUpdates = copyGestureJson(updates, "Gesture mapping update");
    const allowed = new Set(["gestureId", "action", "actionType", "enabled"]);
    if (Object.keys(safeUpdates).some((key) => !allowed.has(key))) throw new TypeError("Gesture mapping update contains protected fields.");
    const nextGestureId = safeUpdates.gestureId ?? binding.gestureId;
    const nextAction = safeUpdates.action ?? binding.action;
    const nextActionType = safeUpdates.actionType ?? binding.actionType;
    if (!Object.hasOwn(GESTURES, nextGestureId)) throw new TypeError("Gesture mapping must use a recognized gesture.");
    validateSafeUiMapping(nextActionType, nextAction);
    if (safeUpdates.enabled !== undefined && typeof safeUpdates.enabled !== "boolean") throw new TypeError("Gesture mapping enabled state must be boolean.");
    if ([...this.bindings.values()].some((other) => other.id !== id && other.profileId === binding.profileId && other.gestureId === nextGestureId)) {
      throw new TypeError("Each recognized gesture may have only one mapping per profile.");
    }
    const updated = { ...binding, ...safeUpdates, updatedAt: new Date().toISOString() };
    this.bindings.set(id, updated);
    if (!this.save()) {
      this.bindings.set(id, binding);
      throw new Error("Gesture mapping update could not be safely saved.");
    }
    this.notify("binding_updated", copyGestureJson(updated, "Gesture mapping"));
    return copyGestureJson(updated, "Gesture mapping");
  }

  deleteBinding(id) {
    this.requireWritableAccountScope();
    const binding = this.bindings.get(id);
    if (!binding) return false;
    const profile = this.profiles.get(binding.profileId);
    if (binding) {
      if (profile) {
        profile.bindings = profile.bindings.filter(b => b !== id);
      }
    }
    this.bindings.delete(id);
    if (!this.save()) {
      this.bindings.set(id, binding);
      if (profile) profile.bindings.push(id);
      throw new Error("Gesture mapping could not be safely deleted.");
    }
    this.notify("binding_deleted", { id });
    return true;
  }

  setRecognitionAdapter(adapter) {
    if (adapter !== null && (!adapter || typeof adapter.detect !== "function")) {
      throw new TypeError("Gesture adapter must implement detect(video, profile, context).");
    }
    if (this.recognitionState !== GESTURE_STATES.INACTIVE) {
      throw new Error("Stop gesture recognition before replacing its adapter.");
    }
    this.recognitionAdapter = adapter;
    return { available: Boolean(adapter), kind: adapter?.kind || null };
  }

  async startRecognition(profileId, { consent = false } = {}) {
    this.refreshAccountScope();
    const startingAccountScope = getAccountScope();
    if (!getAccountScope().startsWith("account:") || !["default", "loaded", "saved"].includes(this.storageStatus)) {
      return { success: false, error: "Gesture recognition requires a valid account profile store.", code: "profile_store_unavailable" };
    }
    const profile = this.profiles.get(profileId);
    if (!profile) return { success: false, error: "Profile not found", code: "profile_not_found" };
    if (this.recognitionState !== GESTURE_STATES.INACTIVE) {
      return { success: false, error: "Gesture recognition is already active.", code: "already_active" };
    }
    if (consent !== true) return { success: false, error: "Explicit camera consent is required.", code: "consent_required" };
    if (!this.recognitionAdapter) {
      return { success: false, error: "No gesture recognition adapter is available on this platform.", code: "adapter_unavailable" };
    }
    const capability = await this.getRecognitionCapability();
    if (getAccountScope() !== startingAccountScope || !this.profiles.has(profileId)) {
      return { success: false, error: "Gesture session ended after the account changed.", code: "account_changed" };
    }
    if (!capability.cameraSupported) {
      this.setCameraCapabilityStatus("unavailable", "camera_api_unavailable");
      return { success: false, error: "Camera capture is unsupported in this environment.", code: "camera_unsupported" };
    }
    if (capability.permission === "denied") {
      this.setCameraCapabilityStatus("permission_denied", "permission_denied");
      return { success: false, error: "Camera permission is denied in this browser.", code: "camera_permission_denied" };
    }

    const generation = ++this.recognitionGeneration;
    const abortController = new AbortController();
    this.recognitionAbortController = abortController;
    this.activeProfileId = profileId;
    this.recognitionState = GESTURE_STATES.CALIBRATING;
    this.notify("recognition_state_changed", { state: this.recognitionState, profileId, camera: "inactive", detector: "initializing" });

    try {
      if (typeof this.recognitionAdapter.prepare === "function") {
        const adapterReady = await this.recognitionAdapter.prepare({ signal: abortController.signal, profile });
        if (abortController.signal.aborted || generation !== this.recognitionGeneration) {
          return { success: false, error: "Gesture recognition was cancelled.", code: "cancelled" };
        }
        if (adapterReady === false) throw Object.assign(new Error("Gesture detector could not be initialized."), { code: "gesture_adapter_unavailable" });
      }

      if (getAccountScope() !== startingAccountScope || !this.profiles.has(profileId)) {
        this.stopRecognition("account_changed");
        return { success: false, error: "Gesture session ended after the account changed.", code: "account_changed" };
      }

      this.notify("recognition_state_changed", { state: this.recognitionState, profileId, camera: "requesting", detector: "ready" });
      const stream = await globalThis.navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: profile.cameraId ? { exact: profile.cameraId } : undefined,
          facingMode: "user",
          width: { ideal: 640, max: 640 },
          height: { ideal: 480, max: 480 },
        },
      });

      if (abortController.signal.aborted || generation !== this.recognitionGeneration) {
        stream.getTracks().forEach(track => { if (track.readyState !== "ended") track.stop(); });
        return { success: false, error: "Gesture recognition was cancelled.", code: "cancelled" };
      }
      this.mediaStream = stream;
      this.videoElement = globalThis.document.createElement("video");
      const video = this.videoElement;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      if (abortController.signal.aborted || generation !== this.recognitionGeneration) {
        stream.getTracks().forEach(track => { if (track.readyState !== "ended") track.stop(); });
        video.pause?.();
        video.srcObject = null;
        if (this.mediaStream === stream) this.mediaStream = null;
        if (this.videoElement === video) this.videoElement = null;
        return { success: false, error: "Gesture recognition was cancelled.", code: "cancelled" };
      }

      const videoTrack = stream.getVideoTracks?.()[0];
      if (!videoTrack || videoTrack.readyState === "ended") throw new Error("Camera track is unavailable.");
      videoTrack.addEventListener?.("ended", () => {
        if (generation === this.recognitionGeneration) this.stopRecognition("permission_revoked");
      }, { once: true });

      const permissionAllowed = await this.watchCameraPermission(generation);
      if (abortController.signal.aborted || generation !== this.recognitionGeneration) {
        stream.getTracks().forEach(track => { if (track.readyState !== "ended") track.stop(); });
        video.pause?.();
        video.srcObject = null;
        if (this.mediaStream === stream) this.mediaStream = null;
        if (this.videoElement === video) this.videoElement = null;
        return { success: false, error: "Gesture recognition was cancelled.", code: "cancelled" };
      }
      if (!permissionAllowed) {
        this.setCameraCapabilityStatus("revoked", "permission_revoked");
        this.stopRecognition("permission_revoked");
        return { success: false, error: "Camera permission is denied.", code: "permission_denied" };
      }

      this.recognitionState = GESTURE_STATES.ACTIVE;
      this.setCameraCapabilityStatus("supported");
      this.notify("recognition_state_changed", { state: this.recognitionState, profileId, camera: "active", visible: true, processing: "local_adapter" });
      
      this.startDetectionLoop(profileId);
      
      publish("gesture.recognition_started", { profileId });
      recordAudit({ action: "gesture.recognition_started", status: "completed", metadata: { profileId } });
      
      return { success: true, profileId, camera: "active", visible: true, adapter: this.recognitionAdapter.kind || "custom" };
    } catch (error) {
      if (abortController.signal.aborted || generation !== this.recognitionGeneration) {
        return { success: false, error: "Gesture recognition was cancelled.", code: "cancelled" };
      }
      let errorCode = "";
      try { errorCode = typeof error?.code === "string" ? error.code : ""; } catch { /* Host errors can be accessor-backed. */ }
      if (errorCode === "gesture_adapter_unavailable") {
        this.stopRecognition("adapter_initialization_failed");
        this.recognitionState = GESTURE_STATES.ERROR;
        this.notify("recognition_state_changed", { state: this.recognitionState, profileId, camera: "inactive", error: "adapter_unavailable" });
        return { success: false, error: "The local hand detector could not be initialized.", code: "adapter_unavailable" };
      }
      const failure = classifyCameraFailure(error);
      this.setCameraCapabilityStatus(failure.status, failure.code);
      this.stopRecognition("start_failed");
      this.recognitionState = GESTURE_STATES.ERROR;
      this.notify("recognition_state_changed", { state: this.recognitionState, profileId, camera: "inactive", error: failure.code });
      return { success: false, error: failure.code === "camera_permission_denied" ? "Camera permission was denied." : "Camera capture is unavailable.", code: failure.code };
    }
  }

  async watchCameraPermission(generation) {
    let permissions;
    let query;
    try {
      permissions = globalThis.navigator?.permissions;
      query = permissions?.query;
    } catch { return true; }
    if (typeof query !== "function") return true;

    try {
      const status = await Reflect.apply(query, permissions, [{ name: "camera" }]);
      if (!status || generation !== this.recognitionGeneration) return false;
      if (status.state === "denied") {
        this.setCameraCapabilityStatus("revoked", "permission_revoked");
        return false;
      }

      const onChange = () => {
        if (generation === this.recognitionGeneration && status.state === "denied") {
          this.setCameraCapabilityStatus("revoked", "permission_revoked");
          this.stopRecognition("permission_revoked");
        }
      };
      status.addEventListener?.("change", onChange);
      this.cameraPermissionStatus = status;
      this.cameraPermissionHandler = onChange;
      return true;
    } catch {
      // The Permissions API does not expose camera permission state in every browser.
      // getUserMedia and the live track remain the authoritative capability checks.
      return true;
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
        const detectionEpoch = this.detectionEpoch;
        try {
          const gesture = await this.detectGesture(this.videoElement, profile, signal);
          if (gesture
            && generation === this.recognitionGeneration
            && detectionEpoch === this.detectionEpoch
            && this.recognitionState === GESTURE_STATES.ACTIVE) {
            this.handleGestureDetection(gesture, profile);
          }
        } catch (error) {
          if (!signal.aborted) {
            this.notify("recognition_adapter_error", {
              profileId,
              code: error?.code || "adapter_error",
              error: error?.message || "Gesture adapter failed.",
            });
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
    let timeoutId;
    let abortHandler;
    let result;
    try {
      result = await Promise.race([
        Promise.resolve(this.recognitionAdapter.detect(frame, profile, { signal, maxFrameSize: { width: 640, height: 480 } })),
        new Promise((resolve) => {
          abortHandler = () => resolve(null);
          signal?.addEventListener?.("abort", abortHandler, { once: true });
          if (signal?.aborted) abortHandler();
        }),
        new Promise((_, reject) => {
          timeoutId = globalThis.setTimeout(() => {
            const error = new Error("Gesture detector did not respond before the frame deadline.");
            error.code = "adapter_timeout";
            reject(error);
          }, this.detectionTimeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
      if (abortHandler) signal?.removeEventListener?.("abort", abortHandler);
    }
    if (signal?.aborted || !result || typeof result !== "object" || Array.isArray(result)) return null;
    const prototype = Object.getPrototypeOf(result);
    const id = Object.getOwnPropertyDescriptor(result, "id");
    const confidence = Object.getOwnPropertyDescriptor(result, "confidence");
    if ((prototype !== Object.prototype && prototype !== null)
      || !id || !Object.hasOwn(id, "value")
      || !confidence || !Object.hasOwn(confidence, "value")
      || typeof id.value !== "string" || !GESTURES[id.value]
      || !Number.isFinite(confidence.value) || confidence.value < profile.confidence || confidence.value > 1) return null;
    return { id: id.value, confidence: confidence.value, timestamp: new Date().toISOString() };
  }

  handleGestureDetection(gesture, profile) {
    this.refreshAccountScope();
    if (this.recognitionState !== GESTURE_STATES.ACTIVE || this.activeProfileId !== profile?.id) return;

    const cooldownMs = profile.cooldownMs ?? getSetting("gesture.cooldown_ms") ?? 600;
    try {
      validateGestureCooldownMs(cooldownMs);
    } catch {
      this.notify("recognition_profile_error", { profileId: profile.id, code: "invalid_gesture_cooldown" });
      return;
    }

    const binding = Array.from(this.bindings.values()).find(b => 
      b.profileId === profile.id && 
      b.gestureId === gesture.id && 
      b.enabled &&
      (b.scope === profile.scope || b.scope === SCOPES.SYSTEM_VISIBLE)
    );

    if (!binding) return;

    const now = Date.now();
    const cooldownKey = `${profile.id}:${gesture.id}`;
    if (this.gestureCooldowns.has(cooldownKey)
      && now - this.gestureCooldowns.get(cooldownKey) < cooldownMs) return;
    this.gestureCooldowns.set(cooldownKey, now);

    const conflicts = this.checkConflicts(gesture, profile);
    if (conflicts.length > 0 && !binding.allowConflict) {
      this.notify("conflict_detected", { gesture, conflicts, binding });
      return;
    }

    const reportedBinding = copyGestureJson(binding, "Gesture mapping");
    publish("gesture.detected", { gesture: copyGestureJson(gesture, "Gesture detection"), binding: reportedBinding, profileId: profile.id });
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
    this.refreshAccountScope();
    if (this.recognitionState !== GESTURE_STATES.ACTIVE || this.activeProfileId !== binding?.profileId
      || this.bindings.get(binding?.id) !== binding || !this.profiles.has(binding.profileId)) return false;
    if (!binding || !Object.hasOwn(GESTURES, gesture?.id)) return false;
    try { validateSafeUiMapping(binding.actionType, binding.action); }
    catch { return false; }
    if (binding.target !== null || binding.riskLevel !== "low" || binding.requiresConfirmation !== false
      || !binding.parameters || Object.keys(binding.parameters).length !== 0) return false;
    const action = {
      type: binding.actionType,
      action: binding.action,
      gesture: gesture.id,
      confidence: gesture.confidence,
      timestamp: new Date().toISOString(),
    };

    publish("gesture.action_executed", { binding: copyGestureJson(binding, "Gesture mapping"), action: copyGestureJson(action, "Gesture action") });
    this.notify("action_executed", { binding: copyGestureJson(binding, "Gesture mapping"), action: copyGestureJson(action, "Gesture action") });
    return true;
  }

  stopRecognition(reason = "user_stop") {
    if (reason === "permission_revoked") this.setCameraCapabilityStatus("revoked", reason);
    this.recognitionGeneration += 1;
    this.detectionEpoch += 1;
    this.gestureCooldowns.clear();
    this.recognitionAbortController?.abort(reason);
    this.recognitionAbortController = null;
    this.recognitionState = GESTURE_STATES.INACTIVE;

    if (this.cameraPermissionStatus && this.cameraPermissionHandler) {
      this.cameraPermissionStatus.removeEventListener?.("change", this.cameraPermissionHandler);
    }
    this.cameraPermissionStatus = null;
    this.cameraPermissionHandler = null;
    
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
    this.detectionEpoch += 1;
    this.gestureCooldowns.clear();
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
    this.requireWritableAccountScope();
    input = copyGestureJson(input, "Custom gesture mapping input");
    const allowed = new Set(["name", "gestureId", "action", "actionType", "scope"]);
    if (Object.keys(input).some((key) => !allowed.has(key))) throw new TypeError("Custom gesture mapping contains unsupported fields.");
    if (this.customGestures.size >= MAX_CUSTOM_GESTURES) throw new RangeError("Custom gesture mapping limit reached.");
    if (!Object.hasOwn(GESTURES, input.gestureId)) throw new TypeError("Custom mappings must reference a recognized gesture.");
    validateSafeUiMapping(input.actionType, input.action);
    const name = input.name;
    const scope = input.scope ?? SCOPES.FOREGROUND;
    if (typeof name !== "string" || !name.trim() || name.length > 80 || !Object.values(SCOPES).includes(scope)) {
      throw new TypeError("Custom gesture mapping details are invalid.");
    }
    const gestureId = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    
    const gesture = {
      id: gestureId,
      name,
      gestureId: input.gestureId,
      samples: [],
      signature: null,
      action: input.action,
      actionType: input.actionType,
      scope,
      riskLevel: "low",
      requiresConfirmation: false,
      createdAt: now,
      updatedAt: now,
      tested: false,
      testResults: null,
    };

    this.customGestures.set(gestureId, gesture);
    if (!this.save()) {
      this.customGestures.delete(gestureId);
      throw new Error("Custom gesture mapping could not be safely saved.");
    }
    this.notify("custom_gesture_created", copyGestureJson(gesture, "Custom gesture mapping"));
    return copyGestureJson(gesture, "Custom gesture mapping");
  }

  addGestureSample(gestureId, sample) {
    this.requireWritableAccountScope();
    const gesture = this.customGestures.get(gestureId);
    if (!gesture) return { error: "Custom gesture not found" };
    if (gesture.samples.length >= MAX_CUSTOM_GESTURE_SAMPLES) return { error: "Gesture calibration sample limit reached." };
    const data = copyGestureJson(sample, "Gesture calibration sample");
    if (!Array.isArray(data) || data.length === 0 || data.length > MAX_CUSTOM_SAMPLE_VALUES
      || data.some((number) => typeof number !== "number" || !Number.isFinite(number) || number < -1 || number > 1)) {
      return { error: "Gesture calibration sample must be a bounded vector of finite values from -1 to 1." };
    }

    const sampleRecord = {
      id: generateSampleId(),
      data,
      timestamp: new Date().toISOString(),
    };
    const previousUpdatedAt = gesture.updatedAt;
    gesture.samples.push(sampleRecord);

    gesture.updatedAt = new Date().toISOString();
    this.customGestures.set(gestureId, gesture);
    if (!this.save()) {
      gesture.samples.pop();
      gesture.updatedAt = previousUpdatedAt;
      throw new Error("Gesture calibration sample could not be safely saved.");
    }
    return copyGestureJson(gesture, "Custom gesture mapping");
  }

  testCustomGesture(gestureId) {
    this.refreshAccountScope();
    if (!this.customGestures.has(gestureId)) return { success: false, status: "not_found" };
    return { success: false, status: "unavailable", reason: "No custom gesture detector is installed; caller-supplied test scores are not accepted." };
  }

  getCustomGestures() {
    this.refreshAccountScope();
    return Array.from(this.customGestures.values(), (gesture) => copyGestureJson(gesture, "Custom gesture mapping"));
  }

  getCustomGesture(id) {
    this.refreshAccountScope();
    const gesture = this.customGestures.get(id);
    return gesture ? copyGestureJson(gesture, "Custom gesture mapping") : null;
  }

  deleteCustomGesture(id) {
    this.requireWritableAccountScope();
    const gesture = this.customGestures.get(id);
    if (!gesture) return false;
    this.customGestures.delete(id);
    if (!this.save()) {
      this.customGestures.set(id, gesture);
      throw new Error("Custom gesture mapping could not be safely deleted.");
    }
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
if (typeof globalThis.document?.createElement === "function") {
  gestureEngine.setRecognitionAdapter(createBundledHandGestureAdapter());
}
subscribeAccountScope(() => gestureEngine.refreshAccountScope());

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

export function getGestureRecognitionCapability() {
  return gestureEngine.getRecognitionCapability();
}

export function subscribeToGestures(listener) {
  return gestureEngine.subscribe(listener);
}

export { GESTURES, GESTURE_STATES, SCOPES };

export default gestureEngine;
