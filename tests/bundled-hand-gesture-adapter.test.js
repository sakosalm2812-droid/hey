import test from "node:test";
import assert from "node:assert/strict";
import { createBundledHandGestureAdapter, classifyLandmarks } from "../src/lib/bundledHandGestureAdapter.js";

function makeLandmarks(extended) {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (let finger = 0; finger < 5; finger += 1) {
    const baseIndex = [2, 5, 9, 13, 17][finger];
    const jointIndex = [3, 6, 10, 14, 18][finger];
    const tipIndex = [4, 8, 12, 16, 20][finger];
    landmarks[baseIndex] = { x: finger * 0.1, y: 0, z: 0 };
    landmarks[jointIndex] = { x: finger * 0.1, y: 1, z: 0 };
    landmarks[tipIndex] = { x: finger * 0.1, y: extended[finger] ? 2 : 0.5, z: 0 };
  }
  return landmarks;
}

test("bundled landmark classifier maps only the supported low-risk gesture IDs", () => {
  const openPalm = classifyLandmarks(makeLandmarks([true, true, true, true, true]), 0.98, null);
  assert.equal(openPalm.gesture.id, "G01");
  assert.ok(openPalm.gesture.confidence >= 0.9);
  assert.equal(openPalm.previousGesture, "open_palm");

  const fist = classifyLandmarks(makeLandmarks([false, false, false, false, false]), 0.98, "open_palm");
  assert.equal(fist.gesture.id, "G02");
  assert.equal(fist.previousGesture, "closed_fist");

  const victory = classifyLandmarks(makeLandmarks([false, true, true, false, false]), 0.98, null);
  assert.equal(victory.gesture.id, "G12");
  assert.equal(classifyLandmarks(makeLandmarks([false, false, false, false, false]), 0.98, null).gesture, null);
});

test("bundled adapter initializes local MediaPipe assets, emits hand detections, and releases the model", async () => {
  let detectedImage;
  let detectorClosed = 0;
  let wasmFileset;
  let landmarkerOptions;
  let lastTimestamp = -1;
  class FakeHandLandmarker {
    static async createFromOptions(fileset, options) {
      wasmFileset = fileset;
      landmarkerOptions = options;
      return new FakeHandLandmarker();
    }
    detectForVideo(image, timestamp) {
      detectedImage = image;
      assert.ok(timestamp > lastTimestamp);
      lastTimestamp = timestamp;
      return {
        landmarks: [makeLandmarks([true, true, true, true, true])],
        handedness: [[{ score: 0.98, categoryName: "Left" }]],
      };
    }
    close() { detectorClosed += 1; }
  }
  globalThis.document = {
    createElement() {
      return {
        getContext() { return { putImageData(imageData) { this.imageData = imageData; } }; },
      };
    },
  };
  const adapter = createBundledHandGestureAdapter({
    assetBaseUrl: "https://local.test/app/mediapipe/vision/",
    handsLoader: async () => ({ HandLandmarker: FakeHandLandmarker }),
  });

  assert.equal(adapter.isReady(), false);
  assert.equal(await adapter.prepare({ signal: new AbortController().signal }), true);
  assert.equal(adapter.isReady(), true);
  assert.equal(wasmFileset.wasmLoaderPath, "https://local.test/app/mediapipe/vision/wasm/vision_wasm_nosimd_internal.js");
  assert.equal(wasmFileset.wasmBinaryPath, "https://local.test/app/mediapipe/vision/wasm/vision_wasm_nosimd_internal.wasm");
  assert.equal(landmarkerOptions.baseOptions.modelAssetPath, "https://local.test/app/mediapipe/vision/models/hand_landmarker.task");
  assert.equal(landmarkerOptions.runningMode, "VIDEO");
  assert.equal(landmarkerOptions.numHands, 1);
  const imageData = { width: 640, height: 480, data: new Uint8ClampedArray(640 * 480 * 4) };
  const detection = await adapter.detect(imageData, {}, { signal: new AbortController().signal });
  assert.equal(detectedImage.width, 640);
  assert.deepEqual(detection, { id: "G01", confidence: 0.98, handedness: "left" });

  adapter.stop("user_stop");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(adapter.isReady(), false);
  assert.equal(detectorClosed, 1);
});

test("explicit handedness profiles reject unknown detector labels before pose calibration", async () => {
  const previousDocument = globalThis.document;
  class UnknownHandLandmarker {
    static async createFromOptions() { return new UnknownHandLandmarker(); }
    detectForVideo() {
      return {
        landmarks: [makeLandmarks([true, true, true, true, true])],
        handedness: [[{ score: 0.98, categoryName: "unclassified" }]],
      };
    }
    close() {}
  }
  globalThis.document = {
    createElement() {
      return { getContext() { return { putImageData() {} }; } };
    },
  };
  const adapter = createBundledHandGestureAdapter({
    assetBaseUrl: "https://local.test/app/mediapipe/vision/",
    handsLoader: async () => ({ HandLandmarker: UnknownHandLandmarker }),
  });

  try {
    assert.equal(await adapter.prepare({ signal: new AbortController().signal }), true);
    const frame = { width: 640, height: 480, data: new Uint8ClampedArray(4) };
    const signal = new AbortController().signal;

    assert.equal(await adapter.detect(frame, { handedness: "left", sensitivity: 0.8 }, { signal }), null);
    assert.equal(adapter.getLatestObservation(), null);

    assert.deepEqual(
      await adapter.detect(frame, { handedness: "both", sensitivity: 0.8 }, { signal }),
      { id: "G01", confidence: 0.98, handedness: "unknown" },
    );
    assert.equal(adapter.getLatestObservation().handedness, "unknown");
  } finally {
    adapter.stop("test_cleanup");
    globalThis.document = previousDocument;
  }
});

test("cancelled detector preparation cannot publish a ready instance", async () => {
  let resolveLoader;
  const adapter = createBundledHandGestureAdapter({
    assetBaseUrl: "https://local.test/mediapipe/vision/",
    handsLoader: () => new Promise((resolve) => { resolveLoader = resolve; }),
  });
  const pending = adapter.prepare({ signal: new AbortController().signal });
  adapter.stop("cancelled");
  resolveLoader({ HandLandmarker: { createFromOptions() { throw new Error("must not initialize after cancellation"); } } });

  assert.equal(await pending, false);
  assert.equal(adapter.isReady(), false);
});
