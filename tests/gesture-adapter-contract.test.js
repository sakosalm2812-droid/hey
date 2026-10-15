import test from "node:test";
import assert from "node:assert/strict";
const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, value); },
};
const { GestureEngine, GESTURE_STATES } = await import("../src/core/gestureEngine.js");
const { subscribe, clearEventListeners } = await import("../src/core/eventBus.js");

function makeEngine() {
  const engine = new GestureEngine();
  const profile = engine.createProfile({ name: "Contract test", confidence: 0.8 });
  return { engine, profile };
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
  assert.equal((await engine.startRecognition(profile.id, { consent: true })).code, "adapter_unavailable");
  assert.equal(engine.getRecognitionState(), GESTURE_STATES.INACTIVE);
});

test("camera permission denial leaves recognition inactive and reports no availability", async () => {
  const { engine, profile } = makeEngine();
  engine.setRecognitionAdapter({ kind: "fake-contract", async detect() { return null; } });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: { async getUserMedia() { throw new Error("Permission denied"); } } },
  });
  globalThis.document = { createElement: () => ({}) };
  globalThis.requestAnimationFrame = () => 1;

  const result = await engine.startRecognition(profile.id, { consent: true });
  assert.equal(result.success, false);
  assert.equal(result.code, "camera_or_adapter_error");
  assert.equal(engine.getRecognitionState(), GESTURE_STATES.ERROR);
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
  assert.equal(engine.pauseRecognition(), true);
  assert.equal(engine.resumeRecognition(), true);
  camera.listeners.get("ended")(); // Camera permission/device revocation.

  assert.equal(engine.getRecognitionState(), GESTURE_STATES.INACTIVE);
  assert.equal(camera.stopped, 1);
  assert.equal(adapterStops, 1);
  assert.equal(detectCalls, 0); // Test camera never supplied a ready frame.
  assert(states.some((state) => state.camera === "active" && state.visible === true));
  assert(states.some((state) => state.reason === "permission_revoked"));
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
  permissionStatus.state = "denied";
  listeners.get("change")();

  assert.equal(engine.getRecognitionState(), GESTURE_STATES.INACTIVE);
  assert.equal(camera.stopped, 1);
  assert.equal(adapterStops, 1);
  assert.equal(listeners.size, 0);
});

test("gesture bindings cannot publish an action outside their active consented session", () => {
  const { engine, profile } = makeEngine();
  const binding = engine.createBinding({ profileId: profile.id, gestureId: "G01", action: "summon", actionType: "ui" });
  const events = [];
  const unsubscribe = subscribe("gesture.action_executed", (event) => events.push(event));

  engine.handleGestureDetection({ id: "G01", confidence: 1 }, profile);

  unsubscribe();
  clearEventListeners("gesture.action_executed");
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
  engine.stopRecognition("user_emergency_stop");
  const currentStart = engine.startRecognition(profile.id, { consent: true });
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

  const inFlight = new AbortController();
  let finishDetection;
  engine.setRecognitionAdapter({ detect() { return new Promise((resolve) => { finishDetection = resolve; }); } });
  const pendingDetection = engine.detectGesture({}, profile, inFlight.signal);
  inFlight.abort("emergency_stop");
  finishDetection({ id: "G01", confidence: 1 });
  assert.equal(await pendingDetection, null);
});
