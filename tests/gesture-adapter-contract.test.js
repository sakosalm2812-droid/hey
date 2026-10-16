import test from "node:test";
import assert from "node:assert/strict";
const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, value); },
  removeItem(key) { storage.delete(key); },
};
const { setAccountScope, getAccountStorageKey } = await import("../src/core/accountScope.js");
setAccountScope("gesture-contract-test");
const { GestureEngine, GESTURE_STATES, gestureEngine } = await import("../src/core/gestureEngine.js");
const { subscribe, clearEventListeners } = await import("../src/core/eventBus.js");

function makeStorage({ discardWrites = false } = {}) {
  const values = new Map();
  return {
    values,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { if (!discardWrites) values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

function makeEngine(options) {
  const storage = options?.storageProvider ? null : makeStorage();
  const engine = new GestureEngine({ ...options, storageProvider: options?.storageProvider || (() => storage) });
  const profile = engine.createProfile({ name: "Contract test", confidence: 0.8 });
  return { engine, profile, storage };
}

function installCamera({ track = null } = {}) {
  let stopped = 0;
  const listeners = new Map();
  const videoTrack = track || {
    readyState: "live",
    stop() { stopped += 1; this.readyState = "ended"; },
    addEventListener(name, listener) { listeners.set(name, listener); },
  };
  const stream = {
    getTracks: () => [videoTrack],
    getVideoTracks: () => [videoTrack],
  };
  const video = {
    readyState: 1,
    srcObject: null,
    async play() {},
    pause() {},
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: { async getUserMedia() { return stream; } } },
  });
  globalThis.document = { createElement: () => video };
  globalThis.requestAnimationFrame = () => 1;
  return { videoTrack, video, stream, listeners, get stopped() { return stopped; } };
}

test("gesture recognition fails closed until explicit consent and a real adapter exist", async () => {
  const { engine, profile } = makeEngine();
  installCamera();

  assert.equal((await engine.startRecognition(profile.id)).code, "consent_required");
  assert.equal((await engine.startRecognition(profile.id, { consent: 1 })).code, "consent_required");
  assert.equal((await engine.startRecognition(profile.id, { consent: "true" })).code, "consent_required");
  assert.equal((await engine.startRecognition(profile.id, { consent: true })).code, "adapter_unavailable");
  assert.equal(engine.getRecognitionState(), GESTURE_STATES.INACTIVE);
});

test("calibration sensitivity and allowlisted mappings persist per account and reload by read-back", async () => {
  const memory = makeStorage();
  setAccountScope("gesture-owner-a");
  const engine = new GestureEngine({ storageProvider: () => memory });
  const profile = engine.createProfile({ name: "Personal", sensitivity: 0.45 });
  const mapping = engine.createBinding({ profileId: profile.id, gestureId: "G01", action: "summon", actionType: "ui" });
  const keyA = getAccountStorageKey("hey_gesture_profiles", "account:gesture-owner-a");
  const saved = memory.getItem(keyA);
  assert.equal(typeof saved, "string");
  assert.equal(memory.getItem(keyA), saved);

  const reloaded = new GestureEngine({ storageProvider: () => memory });
  assert.equal(reloaded.getProfile(profile.id).sensitivity, 0.45);
  assert.equal(reloaded.getBinding(mapping.id).action, "summon");

  const camera = installCamera();
  engine.setRecognitionAdapter({ async detect() { return null; } });
  assert.equal((await engine.startRecognition(profile.id, { consent: true })).success, true);
  assert.equal(engine.getRecognitionState(), GESTURE_STATES.ACTIVE);

  setAccountScope("gesture-owner-b");
  assert.equal(engine.refreshAccountScope().success, true);
  assert.equal(engine.getRecognitionState(), GESTURE_STATES.INACTIVE);
  assert.equal(camera.stopped, 1);
  assert.equal(engine.getProfile(profile.id), null);
  assert.deepEqual(engine.getBindingsForProfile(profile.id), []);
  const profileB = engine.createProfile({ sensitivity: 0.9 });

  setAccountScope("gesture-owner-a");
  assert.equal(engine.refreshAccountScope().success, true);
  assert.equal(engine.getProfile(profile.id).sensitivity, 0.45);
  assert.equal(engine.getProfile(profileB.id), null);
  setAccountScope("gesture-contract-test");
});

test("malformed or unreadable gesture storage blocks profile mutation without replacing saved bytes", () => {
  const memory = makeStorage();
  setAccountScope("gesture-hostile-store");
  const key = getAccountStorageKey("hey_gesture_profiles", "account:gesture-hostile-store");
  memory.values.set(key, "{not-json");
  const engine = new GestureEngine({ storageProvider: () => memory });
  assert.equal(engine.storageStatus, "invalid_store");
  assert.deepEqual(engine.getAllProfiles(), []);
  assert.throws(() => engine.createProfile(), /valid account-scoped store/u);
  assert.equal(memory.getItem(key), "{not-json");

  const validStorage = makeStorage();
  const valid = new GestureEngine({ storageProvider: () => validStorage });
  const validProfile = valid.createProfile();
  const envelope = JSON.parse(validStorage.getItem(getAccountStorageKey("hey_gesture_profiles", "account:gesture-hostile-store")));
  envelope.profiles[0].sensitivity = 1.5;
  memory.values.set(key, JSON.stringify(envelope));
  const malformed = new GestureEngine({ storageProvider: () => memory });
  assert.equal(malformed.storageStatus, "invalid_store");
  assert.deepEqual(malformed.getAllProfiles(), []);
  assert.throws(() => malformed.updateProfile(validProfile.id, { sensitivity: 0.6 }), /valid account-scoped store/u);

  const partial = makeStorage();
  const throwsAfterWrite = {
    getItem(storageKey) { return partial.getItem(storageKey); },
    removeItem(storageKey) { partial.removeItem(storageKey); },
    setItem(storageKey, value) { partial.setItem(storageKey, value); throw new Error("write interrupted"); },
  };
  const interrupted = new GestureEngine({ storageProvider: () => throwsAfterWrite });
  assert.throws(() => interrupted.createProfile(), /safely saved/u);
  assert.equal(partial.getItem(key), null);

  const discard = makeStorage({ discardWrites: true });
  const writer = new GestureEngine({ storageProvider: () => discard });
  assert.throws(() => writer.createProfile(), /safely saved/u);
  assert.deepEqual(writer.getAllProfiles(), []);
  setAccountScope("gesture-contract-test");
});

test("an account switch during profile persistence rolls back the old account write", () => {
  setAccountScope("gesture-write-race-a");
  const memory = makeStorage();
  const storage = {
    getItem(key) { return memory.getItem(key); },
    removeItem(key) { memory.removeItem(key); },
    setItem(key, value) {
      memory.setItem(key, value);
      setAccountScope("gesture-write-race-b");
    },
  };
  const engine = new GestureEngine({ storageProvider: () => storage });
  const oldKey = getAccountStorageKey("hey_gesture_profiles", "account:gesture-write-race-a");
  assert.throws(() => engine.createProfile(), /safely saved/u);
  assert.equal(memory.getItem(oldKey), null);
  assert.deepEqual(engine.getAllProfiles(), []);
  setAccountScope("gesture-contract-test");
});

test("the application gesture engine stops its camera and drops profiles on auth scope changes", async () => {
  setAccountScope("gesture-singleton-a");
  const profile = gestureEngine.createProfile({ name: "Account A" });
  const camera = installCamera();
  gestureEngine.setRecognitionAdapter({ async detect() { return null; } });

  try {
    assert.equal((await gestureEngine.startRecognition(profile.id, { consent: true })).success, true);
    setAccountScope("gesture-singleton-b");
    assert.equal(gestureEngine.getRecognitionState(), GESTURE_STATES.INACTIVE);
    assert.equal(camera.stopped, 1);
    assert.equal(gestureEngine.getProfile(profile.id), null);
  } finally {
    gestureEngine.stopRecognition("test_cleanup");
    gestureEngine.setRecognitionAdapter(null);
    setAccountScope("gesture-contract-test");
  }
});

test("profile edits and mappings cannot alter action authority or select device actions", () => {
  const { engine, profile } = makeEngine();
  const returned = engine.getProfile(profile.id);
  returned.sensitivity = 0.01;
  returned.scope = "system-visible";
  assert.equal(engine.getProfile(profile.id).sensitivity, 0.8);
  assert.equal(engine.getProfile(profile.id).scope, profile.scope);

  assert.throws(() => engine.updateProfile(profile.id, { scope: "system-visible" }), /protected or unsupported/u);
  assert.throws(() => engine.updateProfile(profile.id, { systemWide: true }), /protected or unsupported/u);
  assert.throws(() => engine.createBinding({ profileId: profile.id, gestureId: "G01", action: "device.execute", actionType: "device" }), /allowlisted/u);
  assert.throws(() => engine.createBinding({ profileId: profile.id, gestureId: "G01", action: "summon", actionType: "ui", scope: "system-visible" }), /match its profile/u);
  const unsubscribeEngine = engine.subscribe((event, value) => {
    if (event === "binding_created") value.action = "device.execute";
  });
  const safeBinding = engine.createBinding({ profileId: profile.id, gestureId: "G01", action: "summon", actionType: "ui" });
  assert.equal(safeBinding.action, "summon");
  assert.equal(engine.getBinding(safeBinding.id).action, "summon");
  assert.equal(engine.executeBinding(engine.bindings.get(safeBinding.id), { id: "G01", confidence: 1 }), false);

  const events = [];
  const unsubscribe = subscribe("gesture.action_requested", (event) => events.push(event));
  engine.recognitionState = GESTURE_STATES.ACTIVE;
  engine.activeProfileId = profile.id;
  engine.bindings.set("forged", {
    id: "forged", profileId: profile.id, gestureId: "G02", action: "device.execute", actionType: "device",
    target: "device-1", riskLevel: "high", requiresConfirmation: false, parameters: {}, enabled: true, scope: profile.scope,
  });
  try {
    engine.handleGestureDetection({ id: "G02", confidence: 1 }, profile);
    assert.deepEqual(events, []);
  } finally {
    unsubscribe();
    unsubscribeEngine();
    engine.stopRecognition("test_cleanup");
  }
});

test("gesture calibration samples are bounded and caller-supplied scores never claim detector validation", () => {
  const { engine, profile } = makeEngine();
  const custom = engine.createCustomGesture({ name: "Open hand alias", gestureId: "G01", action: "summon", actionType: "ui" });
  const added = engine.addGestureSample(custom.id, [0, 0.25, -0.5, 1]);
  assert.equal(added.samples.length, 1);
  assert.match(engine.addGestureSample(custom.id, [0, 2]).error, /bounded vector/u);
  assert.throws(() => engine.addGestureSample(custom.id, [NaN]), /plain JSON/u);
  const result = engine.testCustomGesture(custom.id, { truePositives: 10_000, falsePositives: 0 });
  assert.equal(result.status, "samples_required");
  assert.throws(() => engine.createBinding({ profileId: profile.id, gestureId: custom.id, action: "summon", actionType: "ui" }), /three real detector samples/u);
  assert.equal(engine.getCustomGesture(custom.id).tested, false);
  assert.throws(() => engine.createCustomGesture({ name: "Danger", gestureId: "G01", action: "device.execute", actionType: "device" }), /allowlisted/u);
});

test("camera permission denial leaves recognition inactive and reports no availability", async () => {
  const { engine, profile } = makeEngine();
  engine.setRecognitionAdapter({ kind: "fake-contract", async detect() { return null; } });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: { async getUserMedia() { const error = new Error("denied"); error.name = "NotAllowedError"; throw error; } } },
  });
  globalThis.document = { createElement: () => ({}) };
  globalThis.requestAnimationFrame = () => 1;

  const result = await engine.startRecognition(profile.id, { consent: true });
  assert.equal(result.success, false);
  assert.equal(result.code, "camera_permission_denied");
  assert.equal(engine.cameraCapabilityStatus, "permission_denied");
  assert.equal(engine.getRecognitionState(), GESTURE_STATES.ERROR);
});

test("camera denial recovery resets the failed session after a non-prompting permission recheck", async () => {
  const { engine, profile } = makeEngine();
  installCamera();
  let permission = "prompt";
  let cameraRequests = 0;
  const states = [];
  engine.subscribe((event, payload) => {
    if (event === "recognition_state_changed") states.push(payload);
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: { async getUserMedia() { cameraRequests += 1; const error = new Error("denied"); error.name = "NotAllowedError"; throw error; } },
      permissions: { async query() { return { state: permission }; } },
    },
  });
  engine.setRecognitionAdapter({ async detect() { return null; }, stop() {} });

  assert.equal((await engine.startRecognition(profile.id, { consent: true, mode: "test" })).code, "camera_permission_denied");
  assert.equal(engine.getRecognitionState(), GESTURE_STATES.ERROR);
  assert.equal(cameraRequests, 1);
  permission = "granted";
  const capability = await engine.recheckCameraAccess();

  assert.equal(capability.status, "supported");
  assert.equal(capability.permission, "granted");
  assert.equal(capability.sessionState, GESTURE_STATES.INACTIVE);
  assert.equal(engine.getRecognitionState(), GESTURE_STATES.INACTIVE);
  assert.equal(cameraRequests, 1); // Rechecking permission never opens the camera.
  assert.equal(states.at(-1)?.reason, "permission_recovered");
});

test("capability preflight reads camera permission without prompting and reports missing detector honestly", async () => {
  const { engine } = makeEngine();
  let cameraPromptCount = 0;
  let permissionQueryCount = 0;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: { async getUserMedia() { cameraPromptCount += 1; throw new Error("must not prompt"); } },
      permissions: { async query(descriptor) { permissionQueryCount += 1; assert.deepEqual(descriptor, { name: "camera" }); return { state: "prompt" }; } },
    },
  });
  globalThis.document = { createElement: () => ({}) };
  globalThis.requestAnimationFrame = () => 1;

  const capability = await engine.getRecognitionCapability();

  assert.equal(capability.status, "supported");
  assert.equal(capability.cameraSupported, true);
  assert.equal(capability.permission, "prompt");
  assert.equal(capability.adapterInstalled, false);
  assert.equal(capability.recognitionStatus, "unavailable");
  assert.equal(capability.consentRequired, true);
  assert.equal(capability.permissionPrompted, false);
  assert.equal(cameraPromptCount, 0);
  assert.equal(permissionQueryCount, 1);
});

test("capability preflight reports unavailable browser APIs without a camera prompt", async () => {
  const { engine } = makeEngine();
  let cameraPromptCount = 0;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: { async getUserMedia() { cameraPromptCount += 1; } } },
  });
  delete globalThis.document;

  const capability = await engine.getRecognitionCapability();

  assert.equal(capability.status, "unavailable");
  assert.equal(capability.cameraSupported, false);
  assert.equal(capability.recognitionStatus, "unavailable");
  assert.equal(cameraPromptCount, 0);
});

test("hostile permission query accessors fail preflight closed without requesting camera", async () => {
  const { engine } = makeEngine();
  let cameraPromptCount = 0;
  const permissions = Object.defineProperty({}, "query", { get() { throw new Error("hostile query accessor"); } });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: { async getUserMedia() { cameraPromptCount += 1; } }, permissions },
  });
  globalThis.document = { createElement: () => ({}) };
  globalThis.requestAnimationFrame = () => 1;

  const capability = await engine.getRecognitionCapability();

  assert.equal(capability.cameraSupported, true);
  assert.equal(capability.permission, "unknown");
  assert.equal(capability.permissionPrompted, false);
  assert.equal(cameraPromptCount, 0);
});

test("local detector preparation is consent-gated and camera stays closed when model startup fails", async () => {
  const { engine, profile } = makeEngine();
  let cameraPromptCount = 0;
  let prepareCount = 0;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: { async getUserMedia() { cameraPromptCount += 1; throw new Error("unexpected prompt"); } } },
  });
  globalThis.document = { createElement: () => ({}) };
  globalThis.requestAnimationFrame = () => 1;
  engine.setRecognitionAdapter({
    isReady() { return false; },
    async prepare() { prepareCount += 1; throw Object.assign(new Error("model missing"), { code: "gesture_adapter_unavailable" }); },
    async detect() { return null; },
  });

  const capability = await engine.getRecognitionCapability();
  assert.equal(capability.adapterInstalled, true);
  assert.equal(capability.adapterReady, false);
  assert.equal(capability.recognitionStatus, "adapter_initialization_required");
  assert.equal((await engine.startRecognition(profile.id)).code, "consent_required");
  assert.equal(prepareCount, 0);

  const result = await engine.startRecognition(profile.id, { consent: true });
  assert.equal(result.code, "adapter_unavailable");
  assert.equal(prepareCount, 1);
  assert.equal(cameraPromptCount, 0);
  assert.equal(engine.cameraCapabilityStatus, "supported");
  assert.equal(engine.getRecognitionState(), GESTURE_STATES.ERROR);
});

test("an unavailable detector can be retried after the user fixes the local runtime", async () => {
  const { engine, profile } = makeEngine();
  const camera = installCamera();
  let prepares = 0;
  engine.setRecognitionAdapter({
    async prepare() {
      prepares += 1;
      if (prepares === 1) throw new Error("Local model asset unavailable.");
      return true;
    },
    async detect() { return null; },
  });

  const failed = await engine.startRecognition(profile.id, { consent: true });
  assert.equal(failed.code, "adapter_unavailable");
  assert.equal(camera.stopped, 0);
  assert.equal(engine.getRecognitionState(), GESTURE_STATES.ERROR);

  const retried = await engine.startRecognition(profile.id, { consent: true });
  assert.equal(retried.success, true);
  assert.equal(prepares, 2);
  assert.equal(engine.getRecognitionState(), GESTURE_STATES.ACTIVE);
  engine.stopRecognition("test_cleanup");
  assert.equal(camera.stopped, 1);
});

test("account switch during capability query prevents the later camera request", async () => {
  const { engine, profile } = makeEngine();
  engine.setRecognitionAdapter({ kind: "fake-contract", async detect() { return null; } });
  let finishPermissionQuery;
  let cameraPromptCount = 0;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: { async getUserMedia() { cameraPromptCount += 1; throw new Error("unexpected request"); } },
      permissions: { query() { return new Promise((resolve) => { finishPermissionQuery = resolve; }); } },
    },
  });
  globalThis.document = { createElement: () => ({}) };
  globalThis.requestAnimationFrame = () => 1;

  const pendingStart = engine.startRecognition(profile.id, { consent: true });
  setAccountScope("gesture-contract-account-switched");
  finishPermissionQuery({ state: "prompt" });

  assert.equal((await pendingStart).code, "account_changed");
  assert.equal(cameraPromptCount, 0);
  setAccountScope("gesture-contract-test");
});

test("camera capture fails closed when this platform has no browser capture capability", async () => {
  const { engine, profile } = makeEngine();
  engine.setRecognitionAdapter({ kind: "fake-contract", async detect() { return null; } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });

  const result = await engine.startRecognition(profile.id, { consent: true });

  assert.equal(result.code, "camera_unsupported");
  assert.equal(engine.getRecognitionState(), GESTURE_STATES.INACTIVE);
});

test("supported adapter lifecycle is visible, pausable, revocable, and stopped without OS side effects", async () => {
  const { engine, profile } = makeEngine();
  const camera = installCamera();
  let adapterStops = 0;
  let detectCalls = 0;
  engine.setRecognitionAdapter({
    kind: "test-only fake",
    async detect(_video, _profile, { signal, maxFrameSize }) {
      detectCalls += 1;
      assert.equal(signal.aborted, false);
      assert.deepEqual(maxFrameSize, { width: 640, height: 480 });
      return { id: "G01", confidence: 0.99 };
    },
    stop() { adapterStops += 1; },
  });
  const states = [];
  engine.subscribe((event, value) => { if (event === "recognition_state_changed") states.push(value); });

  assert.equal((await engine.startRecognition(profile.id, { consent: true })).success, true);
  assert.equal(engine.getRecognitionState(), GESTURE_STATES.ACTIVE);
  assert.throws(() => engine.updateProfile(profile.id, { sensitivity: 0.4 }), /Stop gesture recognition/u);
  assert.equal(engine.pauseRecognition(), true);
  assert.equal(engine.resumeRecognition(), true);
  camera.listeners.get("ended")(); // The capture track ended while the permission state remained unknown.

  assert.equal(engine.getRecognitionState(), GESTURE_STATES.INACTIVE);
  assert.equal(camera.stopped, 1);
  assert.equal(adapterStops, 1);
  assert.equal(detectCalls, 0); // Test camera never supplied a ready frame.
  assert(states.some((state) => state.camera === "active" && state.visible === true));
  assert(states.some((state) => state.reason === "camera_track_ended"));
});

test("browser camera journey requires consent, rejects a stale paused frame, then executes one authorized UI action", async () => {
  const { engine, profile } = makeEngine();
  engine.updateProfile(profile.id, { holdMs: 200 });
  const bindings = engine.createBinding({ profileId: profile.id, gestureId: "G01", action: "summon", actionType: "ui" });
  const scheduledFrames = [];
  const trackListeners = new Map();
  let cameraRequests = 0;
  let cameraStops = 0;
  let detectorStops = 0;
  let resolveStaleDetection;
  let detectorStarted;
  const firstDetectionStarted = new Promise((resolve) => { detectorStarted = resolve; });
  const video = {
    readyState: 2,
    srcObject: null,
    async play() {},
    pause() {},
  };
  const track = {
    readyState: "live",
    stop() { cameraStops += 1; this.readyState = "ended"; },
    addEventListener(name, listener) { trackListeners.set(name, listener); },
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const canvas = {
    getContext() {
      return {
        drawImage() {},
        getImageData() { return { width: 640, height: 480, data: new Uint8ClampedArray(640 * 480 * 4) }; },
      };
    },
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: { async getUserMedia() { cameraRequests += 1; return stream; } },
      permissions: { async query() { return { state: "granted" }; } },
    },
  });
  globalThis.document = { createElement(kind) { return kind === "video" ? video : canvas; } };
  globalThis.requestAnimationFrame = (callback) => { scheduledFrames.push(callback); return scheduledFrames.length; };
  globalThis.cancelAnimationFrame = () => {};

  let detectionCount = 0;
  engine.setRecognitionAdapter({
    kind: "browser-contract-detector",
    detect() {
      detectionCount += 1;
      if (detectionCount === 1) {
        detectorStarted();
        return new Promise((resolve) => { resolveStaleDetection = resolve; });
      }
      return { id: "G01", confidence: 0.99 };
    },
    stop() { detectorStops += 1; },
  });
  const actions = [];
  const unsubscribe = subscribe("gesture.action_requested", (event) => actions.push(event));

  assert.equal((await engine.getRecognitionCapability()).recognitionStatus, "adapter_ready");
  assert.equal(cameraRequests, 0); // Capability inspection is read-only.
  assert.equal((await engine.startRecognition(profile.id)).code, "consent_required");
  assert.equal(cameraRequests, 0); // No camera request before explicit consent.
  assert.equal((await engine.startRecognition(profile.id, { consent: true })).success, true);
  assert.equal(cameraRequests, 1);
  await firstDetectionStarted;
  assert.equal(engine.pauseRecognition(), true);
  resolveStaleDetection({ id: "G01", confidence: 0.99 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(actions, []); // The in-flight pre-pause result is stale.
  assert.equal(engine.resumeRecognition(), true);

  await new Promise((resolve) => setTimeout(resolve, 110)); // Respect the runtime's 100 ms frame sampling limit.
  const nextFrame = scheduledFrames.shift();
  assert.equal(typeof nextFrame, "function");
  nextFrame();
  for (let sample = 0; sample < 4; sample += 1) {
    await new Promise((resolve) => setTimeout(resolve, 110));
    const stableFrame = scheduledFrames.shift();
    assert.equal(typeof stableFrame, "function");
    stableFrame();
  }
  for (let attempt = 0; attempt < 50 && actions.length === 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(actions.length, 1);
  assert.equal(actions[0].binding.id, bindings.id);
  assert.equal(actions[0].action.type, "ui");
  assert.equal(actions[0].action.action, "summon");

  engine.stopRecognition("user_stop");
  unsubscribe();
  assert.equal(engine.getRecognitionState(), GESTURE_STATES.INACTIVE);
  assert.equal(cameraStops, 1);
  assert.equal(detectorStops, 1);
  trackListeners.get("ended")(); // An old track callback cannot revoke a stopped session.
  assert.equal(engine.cameraCapabilityStatus, "supported");
});

test("camera track ending during preview startup is observed and reported before recognition starts", async () => {
  const { engine, profile } = makeEngine();
  let resolvePlay;
  let signalPlayStarted;
  const playStarted = new Promise((resolve) => { signalPlayStarted = resolve; });
  const video = {
    readyState: 1,
    srcObject: null,
    play() {
      signalPlayStarted();
      return new Promise((resolve) => { resolvePlay = resolve; });
    },
    pause() {},
  };
  const listeners = new Map();
  let cameraStops = 0;
  const track = {
    readyState: "live",
    stop() { cameraStops += 1; this.readyState = "ended"; },
    addEventListener(name, listener) { listeners.set(name, listener); },
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  installCamera();
  globalThis.document = { createElement: () => video };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: { async getUserMedia() { return stream; } } },
  });
  const states = [];
  engine.subscribe((event, payload) => {
    if (event === "recognition_state_changed") states.push(payload);
  });
  let adapterStops = 0;
  engine.setRecognitionAdapter({ async detect() { return null; }, stop() { adapterStops += 1; } });

  const starting = engine.startRecognition(profile.id, { consent: true, mode: "test" });
  await playStarted;
  assert.equal(typeof listeners.get("ended"), "function");
  track.readyState = "ended";
  listeners.get("ended")();
  resolvePlay();
  const result = await starting;

  assert.equal(result.code, "camera_track_ended");
  assert.equal(engine.getRecognitionState(), GESTURE_STATES.INACTIVE);
  assert.equal(engine.cameraCapabilityStatus, "supported");
  assert.equal(cameraStops, 1);
  assert.equal(adapterStops, 1);
  assert.equal(states.at(-1)?.reason, "camera_track_ended");
});
test("browser detector errors release camera resources and report a stale-safe adapter error", async () => {
  const { engine, profile } = makeEngine();
  const camera = installCamera();
  camera.video.readyState = 2;
  const canvas = {
    getContext: () => ({
      drawImage() {},
      getImageData: () => ({ width: 640, height: 480, data: new Uint8ClampedArray(640 * 480 * 4) }),
    }),
  };
  const createElement = globalThis.document.createElement;
  globalThis.document.createElement = (kind) => kind === "canvas" ? canvas : createElement(kind);
  engine.setRecognitionAdapter({ async detect() { throw new Error("detector failed"); } });
  const adapterErrors = [];
  engine.subscribe((event, value) => { if (event === "recognition_adapter_error") adapterErrors.push(value); });

  assert.equal((await engine.startRecognition(profile.id, { consent: true })).success, true);
  for (let attempt = 0; attempt < 50 && engine.getRecognitionState() !== GESTURE_STATES.INACTIVE; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(engine.getRecognitionState(), GESTURE_STATES.INACTIVE);
  assert.equal(camera.stopped, 1);
  assert.equal(adapterErrors.length, 1);
  assert.equal(adapterErrors[0].error, "detector failed");
});

test("a detector that exceeds its frame deadline aborts the session and releases the camera", async () => {
  const { engine, profile } = makeEngine({ detectionTimeoutMs: 15 });
  const camera = installCamera();
  camera.video.readyState = 2;
  globalThis.requestAnimationFrame = () => 1;
  const previousOffscreenCanvas = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = class {
    getContext() {
      return {
        drawImage() {},
        getImageData() { return { data: new Uint8ClampedArray(4) }; },
      };
    }
  };
  let adapterSignal;
  const adapterErrors = [];
  engine.subscribe((event, value) => { if (event === "recognition_adapter_error") adapterErrors.push(value); });
  engine.setRecognitionAdapter({
    detect(_frame, _profile, { signal }) {
      adapterSignal = signal;
      return new Promise(() => {});
    },
  });
  engine.gestureCooldowns.set(`${profile.id}:G01`, Date.now());
  const executed = [];
  const unsubscribe = subscribe("gesture.action_requested", (event) => executed.push(event));

  try {
    assert.equal((await engine.startRecognition(profile.id, { consent: true })).success, true);
    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.equal(engine.getRecognitionState(), GESTURE_STATES.INACTIVE);
    assert.equal(camera.stopped, 1);
    assert.equal(adapterSignal.aborted, true);
    assert.equal(adapterErrors[0]?.code, "adapter_timeout");
    assert.equal(engine.gestureCooldowns.size, 0);
    assert.deepEqual(executed, []);
  } finally {
    unsubscribe();
    engine.stopRecognition("test_cleanup");
    if (previousOffscreenCanvas === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = previousOffscreenCanvas;
  }
});

test("detector deadlines reject invalid and unbounded configuration", () => {
  assert.throws(() => new GestureEngine({ detectionTimeoutMs: 0 }), RangeError);
  assert.throws(() => new GestureEngine({ detectionTimeoutMs: 10_001 }), RangeError);
  assert.throws(() => new GestureEngine({ detectionTimeoutMs: Infinity }), RangeError);
});

test("gesture hold and cooldown suppress fleeting and repeated frames, then reset on pause and stop", () => {
  const { engine, profile } = makeEngine();
  const activeProfile = { ...profile, holdMs: 200 };
  const binding = engine.createBinding({ profileId: profile.id, gestureId: "G01", action: "summon", actionType: "ui" });
  const executed = [];
  const unsubscribe = subscribe("gesture.action_requested", (event) => executed.push(event));
  const originalNow = Date.now;
  let now = 1000;
  engine.recognitionState = GESTURE_STATES.ACTIVE;
  engine.activeProfileId = profile.id;

  try {
    Date.now = () => now;
    engine.handleGestureDetection({ id: "G01", confidence: 1 }, activeProfile);
    now = 1100;
    engine.handleGestureDetection({ id: "G01", confidence: 1 }, activeProfile);
    now = 1200;
    engine.handleGestureDetection({ id: "G01", confidence: 1 }, activeProfile);
    assert.equal(executed.length, 1);
    assert.equal(engine.gestureCooldowns.size, 1);

    assert.equal(engine.pauseRecognition(), true);
    assert.equal(engine.gestureCooldowns.size, 0);
    assert.equal(engine.resumeRecognition(), true);
    now = 2000;
    engine.handleGestureDetection({ id: "G01", confidence: 1 }, activeProfile);
    now = 2100;
    engine.handleGestureDetection({ id: "G01", confidence: 1 }, activeProfile);
    now = 2200;
    engine.handleGestureDetection({ id: "G01", confidence: 1 }, activeProfile);
    assert.equal(executed.length, 2);

    engine.stopRecognition("test_cleanup");
    assert.equal(engine.gestureCooldowns.size, 0);
    assert.equal(binding.enabled, true);
  } finally {
    Date.now = originalNow;
    unsubscribe();
    engine.stopRecognition("test_cleanup");
  }
});

test("test mode reports a steady gesture but never requests its mapped action", () => {
  const { engine, profile } = makeEngine();
  const activeProfile = { ...profile, holdMs: 200 };
  engine.createBinding({ profileId: profile.id, gestureId: "G01", action: "summon", actionType: "ui" });
  engine.recognitionState = GESTURE_STATES.ACTIVE;
  engine.recognitionMode = "test";
  engine.activeProfileId = profile.id;
  const requests = [];
  const detections = [];
  const offRequest = subscribe("gesture.action_requested", (event) => requests.push(event));
  const offDetection = subscribe("gesture.test_detection", (event) => detections.push(event));
  const originalNow = Date.now;
  let now = 1_000;
  try {
    Date.now = () => now;
    engine.handleGestureDetection({ id: "G01", confidence: 1 }, activeProfile);
    now = 1_100;
    engine.handleGestureDetection({ id: "G01", confidence: 1 }, activeProfile);
    now = 1_200;
    engine.handleGestureDetection({ id: "G01", confidence: 1 }, activeProfile);
    assert.equal(detections.length, 1);
    assert.equal(requests.length, 0);
    assert.equal(engine.gestureCooldowns.size, 0);
  } finally {
    Date.now = originalNow;
    offRequest(); offDetection();
    engine.stopRecognition("test_cleanup");
  }
});

test("low-confidence or interrupted frames reset the gesture hold before action", () => {
  const { engine, profile } = makeEngine();
  const activeProfile = { ...profile, holdMs: 200 };
  engine.createBinding({ profileId: profile.id, gestureId: "G01", action: "summon", actionType: "ui" });
  engine.recognitionState = GESTURE_STATES.ACTIVE;
  engine.activeProfileId = profile.id;
  const executed = [];
  const unsubscribe = subscribe("gesture.action_requested", (event) => executed.push(event));
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    engine.handleGestureDetection({ id: "G01", confidence: 1 }, activeProfile);
    now = 1100;
    engine.handleGestureDetection({ id: "G01", confidence: 0.5 }, activeProfile);
    now = 1200;
    engine.handleGestureDetection({ id: "G01", confidence: 1 }, activeProfile);
    now = 1300;
    engine.handleGestureDetection(null, activeProfile);
    now = 1400;
    engine.handleGestureDetection({ id: "G01", confidence: 1 }, activeProfile);
    now = 1600;
    engine.handleGestureDetection({ id: "G01", confidence: 1 }, activeProfile);
    assert.equal(executed.length, 1);
  } finally {
    Date.now = originalNow;
    unsubscribe();
    engine.stopRecognition("test_cleanup");
  }
});

test("gesture cooldown accepts only integer timings inside the configured range", () => {
  const { engine, profile } = makeEngine();
  assert.throws(() => engine.createProfile({ cooldownMs: 199 }), RangeError);
  assert.throws(() => engine.createProfile({ cooldownMs: 2001 }), RangeError);
  assert.throws(() => engine.createProfile({ cooldownMs: 200.5 }), RangeError);
  assert.throws(() => engine.updateProfile(profile.id, { cooldownMs: -1 }), RangeError);
  assert.throws(() => engine.updateProfile(profile.id, { cooldownMs: 2001 }), RangeError);
  let cooldownGetterCalled = false;
  const accessorUpdate = Object.defineProperty({}, "cooldownMs", {
    enumerable: true,
    get() { cooldownGetterCalled = true; return 350; },
  });
  assert.throws(() => engine.updateProfile(profile.id, accessorUpdate), TypeError);
  assert.equal(cooldownGetterCalled, false);
  assert.equal(engine.updateProfile(profile.id, { cooldownMs: 350 }).cooldownMs, 350);
});

test("a frame completing after pause and resume cannot trigger an action", async () => {
  const { engine, profile } = makeEngine();
  const camera = installCamera();
  camera.video.readyState = 2;
  globalThis.requestAnimationFrame = () => 1;
  const previousOffscreenCanvas = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = class {
    getContext() {
      return {
        drawImage() {},
        getImageData() { return { data: new Uint8ClampedArray(4) }; },
      };
    }
  };
  let resolveDetection;
  let detectStarted;
  const pending = new Promise((resolve) => { resolveDetection = resolve; });
  const started = new Promise((resolve) => { detectStarted = resolve; });
  engine.setRecognitionAdapter({ detect() { detectStarted(); return pending; } });
  engine.createBinding({ profileId: profile.id, gestureId: "G01", action: "summon", actionType: "ui" });
  const executed = [];
  const unsubscribe = subscribe("gesture.action_requested", (event) => executed.push(event));

  try {
    assert.equal((await engine.startRecognition(profile.id, { consent: true })).success, true);
    await started;
    assert.equal(engine.pauseRecognition(), true);
    assert.equal(engine.resumeRecognition(), true);
    resolveDetection({ id: "G01", confidence: 1 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(executed, []);
    assert.equal(engine.gestureCooldowns.size, 0);
  } finally {
    unsubscribe();
    engine.stopRecognition("test_cleanup");
    if (previousOffscreenCanvas === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = previousOffscreenCanvas;
  }
});

test("hiding the page stops active gesture capture and rejects the in-flight detection", async () => {
  const { engine, profile } = makeEngine();
  const camera = installCamera();
  camera.video.readyState = 2;
  const visibilityListeners = new Map();
  const canvas = {
    getContext: () => ({ drawImage() {}, getImageData() { return { data: new Uint8ClampedArray(4) }; } }),
  };
  const previousDocument = globalThis.document;
  const previousOffscreenCanvas = globalThis.OffscreenCanvas;
  globalThis.document = {
    visibilityState: "visible",
    hidden: false,
    createElement(kind) { return kind === "video" ? camera.video : canvas; },
    addEventListener(name, listener) { visibilityListeners.set(name, listener); },
    removeEventListener(name, listener) { if (visibilityListeners.get(name) === listener) visibilityListeners.delete(name); },
  };
  globalThis.OffscreenCanvas = class {
    getContext() {
      return { drawImage() {}, getImageData() { return { data: new Uint8ClampedArray(4) }; } };
    }
  };
  let resolveDetection;
  let signalDetectionStarted;
  let detectionSignal;
  const detectionStarted = new Promise((resolve) => { signalDetectionStarted = resolve; });
  let adapterStops = 0;
  const states = [];
  const observations = [];
  engine.subscribe((event, payload) => {
    if (event === "recognition_state_changed") states.push(payload);
    if (event === "gesture_frame_observed") observations.push(payload);
  });
  engine.setRecognitionAdapter({
    kind: "mediapipe-hands-bundled",
    detect(_frame, _profile, { signal }) {
      detectionSignal = signal;
      signalDetectionStarted();
      return new Promise((resolve) => { resolveDetection = resolve; });
    },
    getLatestObservation() {
      return { pose: Array(63).fill(0), handedness: "right", handConfidence: 0.99, timestamp: Date.now() };
    },
    stop() { adapterStops += 1; },
  });
  engine.createBinding({ profileId: profile.id, gestureId: "G01", action: "summon", actionType: "ui" });
  const actions = [];
  const offAction = subscribe("gesture.action_requested", (event) => actions.push(event));

  try {
    assert.equal((await engine.startRecognition(profile.id, { consent: true, mode: "active" })).success, true);
    await detectionStarted;
    assert.equal(visibilityListeners.size, 1);
    globalThis.document.visibilityState = "hidden";
    globalThis.document.hidden = true;
    visibilityListeners.get("visibilitychange")();
    resolveDetection({ id: "G01", confidence: 1 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(engine.getRecognitionState(), GESTURE_STATES.INACTIVE);
    assert.equal(engine.cameraCapabilityStatus, "supported");
    assert.equal(camera.stopped, 1);
    assert.equal(adapterStops, 1);
    assert.equal(detectionSignal.aborted, true);
    assert.equal(states.at(-1)?.reason, "page_hidden");
    assert.equal(visibilityListeners.size, 0);
    assert.deepEqual(observations, []);
    assert.deepEqual(actions, []);
    assert.equal(engine.getLatestDetectorObservation(), null);
  } finally {
    offAction();
    engine.stopRecognition("test_cleanup");
    globalThis.document = previousDocument;
    if (previousOffscreenCanvas === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = previousOffscreenCanvas;
  }
});
test("browser camera permission revocation stops the session and unregisters its observer", async () => {
  const { engine, profile } = makeEngine();
  const camera = installCamera();
  const listeners = new Map();
  const permissionStatus = {
    state: "granted",
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name, listener) {
      if (listeners.get(name) === listener) listeners.delete(name);
    },
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: { async getUserMedia() { return camera.stream; } },
      permissions: { async query({ name }) { assert.equal(name, "camera"); return permissionStatus; } },
    },
  });
  let adapterStops = 0;
  engine.setRecognitionAdapter({ async detect() { return null; }, stop() { adapterStops += 1; } });

  assert.equal((await engine.startRecognition(profile.id, { consent: true })).success, true);
  assert.equal(listeners.size, 1);
  engine.gestureCooldowns.set(`${profile.id}:G01`, Date.now());
  permissionStatus.state = "denied";
  listeners.get("change")();

  assert.equal(engine.getRecognitionState(), GESTURE_STATES.INACTIVE);
  assert.equal(engine.cameraCapabilityStatus, "revoked");
  assert.equal((await engine.getRecognitionCapability()).status, "revoked");
  assert.equal(camera.stopped, 1);
  assert.equal(adapterStops, 1);
  assert.equal(listeners.size, 0);
  assert.equal(engine.gestureCooldowns.size, 0);
});

test("an ended camera track stops recognition without misreporting permission revocation", async () => {
  const { engine, profile } = makeEngine();
  const camera = installCamera();
  const states = [];
  const off = engine.subscribe((event, payload) => {
    if (event === "recognition_state_changed") states.push(payload);
  });
  engine.setRecognitionAdapter({ async detect() { return null; } });

  assert.equal((await engine.startRecognition(profile.id, { consent: true })).success, true);
  const ended = camera.listeners.get("ended");
  assert.equal(typeof ended, "function");
  camera.videoTrack.readyState = "ended";
  ended();

  assert.equal(engine.getRecognitionState(), GESTURE_STATES.INACTIVE);
  assert.equal(engine.cameraCapabilityStatus, "supported");
  assert.equal(camera.stopped, 1);
  assert.equal(states.at(-1)?.reason, "camera_track_ended");
  off();
});

test("active camera track loss releases capture and suppresses the in-flight detector result", async () => {
  const { engine, profile } = makeEngine();
  const camera = installCamera();
  camera.video.readyState = 2;
  const listeners = camera.listeners;
  let resolveDetection;
  let signalDetectionStarted;
  const detectionStarted = new Promise((resolve) => { signalDetectionStarted = resolve; });
  let adapterStops = 0;
  const scheduledFrames = [];
  const previousOffscreenCanvas = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = class {
    getContext() {
      return {
        drawImage() {},
        getImageData() { return { data: new Uint8ClampedArray(4) }; },
      };
    }
  };
  globalThis.requestAnimationFrame = (callback) => { scheduledFrames.push(callback); return scheduledFrames.length; };
  const states = [];
  const frameObservations = [];
  engine.subscribe((event, payload) => {
    if (event === "recognition_state_changed") states.push(payload);
    if (event === "gesture_frame_observed") frameObservations.push(payload);
  });
  engine.setRecognitionAdapter({
    kind: "mediapipe-hands-bundled",
    detect() {
      signalDetectionStarted();
      return new Promise((resolve) => { resolveDetection = resolve; });
    },
    getLatestObservation() {
      return { pose: Array(63).fill(0), handedness: "right", handConfidence: 0.99, timestamp: Date.now() };
    },
    stop() { adapterStops += 1; },
  });
  engine.createBinding({ profileId: profile.id, gestureId: "G01", action: "summon", actionType: "ui" });
  const actions = [];
  const offAction = subscribe("gesture.action_requested", (event) => actions.push(event));

  try {
    assert.equal((await engine.startRecognition(profile.id, { consent: true, mode: "active" })).success, true);
    await detectionStarted;
    assert.equal(engine.getRecognitionState(), GESTURE_STATES.ACTIVE);
    assert.equal(typeof listeners.get("ended"), "function");
    camera.videoTrack.readyState = "ended";
    listeners.get("ended")();
    resolveDetection({ id: "G01", confidence: 1 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(engine.getRecognitionState(), GESTURE_STATES.INACTIVE);
    assert.equal(engine.cameraCapabilityStatus, "supported");
    assert.equal(camera.stopped, 1);
    assert.equal(adapterStops, 1);
    assert.equal(states.at(-1)?.reason, "camera_track_ended");
    assert.deepEqual(frameObservations, []);
    assert.deepEqual(actions, []);
    assert.deepEqual(scheduledFrames, []);
  } finally {
    offAction();
    engine.stopRecognition("test_cleanup");
    if (previousOffscreenCanvas === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = previousOffscreenCanvas;
  }
});
test("gesture bindings cannot publish an action outside their active consented session", () => {
  const { engine, profile } = makeEngine();
  const binding = engine.createBinding({ profileId: profile.id, gestureId: "G01", action: "summon", actionType: "ui" });
  const events = [];
  const unsubscribe = subscribe("gesture.action_requested", (event) => events.push(event));

  engine.handleGestureDetection({ id: "G01", confidence: 1 }, profile);

  unsubscribe();
  clearEventListeners("gesture.action_requested");
  assert.equal(binding.enabled, true);
  assert.deepEqual(events, []);
});

test("stop during pending camera permission cancels startup and releases the late stream", async () => {
  const { engine, profile } = makeEngine();
  let resolveCamera;
  const track = {
    readyState: "live",
    stopped: 0,
    stop() { this.stopped += 1; this.readyState = "ended"; },
    addEventListener() {},
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: { getUserMedia: () => new Promise((resolve) => { resolveCamera = resolve; }) } },
  });
  globalThis.document = { createElement: () => ({ async play() {}, pause() {} }) };
  globalThis.requestAnimationFrame = () => 1;
  engine.setRecognitionAdapter({ async detect() { return null; } });

  const pending = engine.startRecognition(profile.id, { consent: true });
  await Promise.resolve(); // Let the read-only capability preflight reach getUserMedia.
  engine.stopRecognition("user_emergency_stop");
  resolveCamera(stream);

  const result = await pending;
  assert.equal(result.code, "cancelled");
  assert.equal(track.stopped, 1);
  assert.equal(engine.getRecognitionState(), GESTURE_STATES.INACTIVE);
});

test("late camera permission from a cancelled startup cannot replace a newer session", async () => {
  const { engine, profile } = makeEngine();
  const pendingStreams = [];
  const makeStream = () => {
    const track = {
      readyState: "live",
      stopped: 0,
      stop() { this.stopped += 1; this.readyState = "ended"; },
      addEventListener() {},
    };
    return { track, getTracks: () => [track], getVideoTracks: () => [track] };
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia() { return new Promise((resolve) => pendingStreams.push(resolve)); },
      },
    },
  });
  globalThis.document = { createElement: () => ({ async play() {}, pause() {} }) };
  globalThis.requestAnimationFrame = () => 1;
  engine.setRecognitionAdapter({ async detect() { return null; } });

  const staleStart = engine.startRecognition(profile.id, { consent: true });
  await Promise.resolve(); // Let the read-only capability preflight reach getUserMedia.
  engine.stopRecognition("user_emergency_stop");
  const currentStart = engine.startRecognition(profile.id, { consent: true });
  await Promise.resolve();
  const currentStream = makeStream();
  pendingStreams[1](currentStream);
  assert.equal((await currentStart).success, true);

  const staleStream = makeStream();
  pendingStreams[0](staleStream);
  assert.equal((await staleStart).code, "cancelled");
  assert.equal(staleStream.track.stopped, 1);
  assert.equal(currentStream.track.stopped, 0);
  assert.equal(engine.getRecognitionState(), GESTURE_STATES.ACTIVE);
  engine.stopRecognition("test_cleanup");
});

test("adapter output is validated against known gestures and profile confidence", async () => {
  const { engine, profile } = makeEngine();
  const controller = new AbortController();
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        drawImage() {},
        getImageData: () => ({ width: 640, height: 480, data: new Uint8ClampedArray(640 * 480 * 4) }),
      }),
    }),
  };
  let adapterCalls = 0;
  engine.setRecognitionAdapter({ async detect(frame) { adapterCalls += 1; assert.equal(frame.width, 640); return { id: "arbitrary-action", confidence: 1 }; } });
  assert.equal(await engine.detectGesture({}, profile, controller.signal), null);

  engine.setRecognitionAdapter({ async detect() { adapterCalls += 1; return { id: "G01", confidence: 0.2 }; } });
  assert.equal(await engine.detectGesture({}, profile, controller.signal), null);
  let getterRan = false;
  const accessorResult = Object.defineProperties({}, {
    id: { enumerable: true, get() { getterRan = true; return "G01"; } },
    confidence: { enumerable: true, value: 1 },
  });
  engine.setRecognitionAdapter({ async detect() { return accessorResult; } });
  assert.equal(await engine.detectGesture({}, profile, controller.signal), null);
  assert.equal(getterRan, false);
  engine.setRecognitionAdapter({ async detect() { return { id: "G01", confidence: 1.01 }; } });
  assert.equal(await engine.detectGesture({}, profile, controller.signal), null);
  controller.abort();
  assert.equal(await engine.detectGesture({}, profile, controller.signal), null);
  assert.equal(adapterCalls, 2);

  const abortedDuringCall = new AbortController();
  engine.setRecognitionAdapter({ detect() { abortedDuringCall.abort("adapter_cancelled"); return new Promise(() => {}); } });
  assert.equal(await engine.detectGesture({}, profile, abortedDuringCall.signal), null);

  const inFlight = new AbortController();
  let finishDetection;
  engine.setRecognitionAdapter({ detect() { return new Promise((resolve) => { finishDetection = resolve; }); } });
  const pendingDetection = engine.detectGesture({}, profile, inFlight.signal);
  inFlight.abort("emergency_stop");
  finishDetection({ id: "G01", confidence: 1 });
  assert.equal(await pendingDetection, null);
});
