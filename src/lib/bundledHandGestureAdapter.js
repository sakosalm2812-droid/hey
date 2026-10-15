const FINGER_JOINTS = Object.freeze([
  { base: 2, joint: 3, tip: 4 },
  { base: 5, joint: 6, tip: 8 },
  { base: 9, joint: 10, tip: 12 },
  { base: 13, joint: 14, tip: 16 },
  { base: 17, joint: 18, tip: 20 },
]);

function cosineAtJoint(base, joint, tip) {
  const first = [base.x - joint.x, base.y - joint.y, (base.z || 0) - (joint.z || 0)];
  const second = [tip.x - joint.x, tip.y - joint.y, (tip.z || 0) - (joint.z || 0)];
  const firstLength = Math.hypot(...first);
  const secondLength = Math.hypot(...second);
  if (firstLength < 1e-5 || secondLength < 1e-5) return 1;
  return first.reduce((sum, value, index) => sum + value * second[index], 0) / (firstLength * secondLength);
}

function classifyLandmarks(landmarks, handScore, previousGesture) {
  if (!Array.isArray(landmarks) || landmarks.length < 21) return { gesture: null, previousGesture: null };
  const straightness = FINGER_JOINTS.map(({ base, joint, tip }) => {
    const cosine = cosineAtJoint(landmarks[base], landmarks[joint], landmarks[tip]);
    return Math.max(0, Math.min(1, (1 - cosine) / 2));
  });
  const extended = straightness.map((value) => value >= 0.78);
  let gestureId = null;

  if (extended.every(Boolean)) gestureId = "G01";
  else if (previousGesture === "open_palm" && extended.slice(1).every((value) => !value)) gestureId = "G02";
  else if (extended[1] && extended[2] && !extended[3] && !extended[4]) gestureId = "G12";
  else if (extended[0] && extended.slice(1).every((value) => !value)) {
    gestureId = landmarks[4].y < landmarks[2].y ? "G15" : "G16";
  }

  const expectedExtended = gestureId === "G01"
    ? [true, true, true, true, true]
    : gestureId === "G02"
      ? [null, false, false, false, false]
      : gestureId === "G12"
        ? [null, true, true, false, false]
        : gestureId === "G15" || gestureId === "G16"
          ? [true, false, false, false, false]
          : null;
  const shapeConfidence = expectedExtended
    ? straightness.reduce((sum, value, index) => {
      const expected = expectedExtended[index];
      return sum + (expected === null ? 1 : expected ? value : 1 - value);
    }, 0) / straightness.length
    : 0;
  const detectionConfidence = Number.isFinite(handScore) ? handScore : 0;
  const confidence = Math.max(0, Math.min(1, detectionConfidence * shapeConfidence));
  const nextPreviousGesture = extended.every(Boolean) ? "open_palm" : extended.slice(1).every((value) => !value) ? "closed_fist" : "other";
  return {
    gesture: gestureId ? { id: gestureId, confidence } : null,
    previousGesture: nextPreviousGesture,
  };
}

function defaultAssetBaseUrl() {
  const basePath = import.meta.env?.BASE_URL || "/";
  const documentBase = globalThis.document?.baseURI || globalThis.location?.href;
  if (!documentBase) return `${basePath.replace(/\/?$/u, "/")}mediapipe/hands/`;
  return new URL(`${basePath.replace(/\/?$/u, "/")}mediapipe/hands/`, documentBase).href;
}

async function loadBundledHands() {
  await import("@mediapipe/hands/hands.js");
  return globalThis.Hands;
}

export function createBundledHandGestureAdapter({ assetBaseUrl = defaultAssetBaseUrl(), handsLoader = loadBundledHands } = {}) {
  let hands = null;
  let loading = null;
  let generation = 0;
  let previousGesture = null;
  let canvas = null;
  let canvasContext = null;
  const frameResults = new WeakMap();

  return {
    kind: "mediapipe-hands-bundled",
    isReady() { return Boolean(hands); },
    async prepare({ signal } = {}) {
      if (hands) return true;
      if (loading) return loading;
      const prepareGeneration = ++generation;
      const prepareTask = (async () => {
        const Hands = await handsLoader();
        if (signal?.aborted || prepareGeneration !== generation) return false;
        if (typeof Hands !== "function") throw new Error("Bundled hand detector did not load.");
        const detector = new Hands({
          locateFile: (path) => new URL(path.replace("hands_solution_simd_wasm_bin", "hands_solution_wasm_bin"), assetBaseUrl).href,
        });
        try {
          detector.setOptions({
            maxNumHands: 1,
            modelComplexity: 0,
            minDetectionConfidence: 0.65,
            minTrackingConfidence: 0.6,
            selfieMode: true,
          });
          detector.onResults((result) => frameResults.set(detector, result));
          await detector.initialize();
        } catch (error) {
          try { await detector.close(); } catch { /* Initialization failed; release best-effort. */ }
          throw error;
        }
        if (signal?.aborted || prepareGeneration !== generation) {
          try { await detector.close(); } catch { /* A cancelled load is already unavailable. */ }
          return false;
        }
        hands = detector;
        previousGesture = null;
        return true;
      })();
      loading = prepareTask;
      try {
        return await prepareTask;
      } finally {
        if (loading === prepareTask) loading = null;
      }
    },
    async detect(frame, _profile, { signal } = {}) {
      const detector = hands;
      if (!detector || signal?.aborted || !frame || !Number.isSafeInteger(frame.width) || !Number.isSafeInteger(frame.height)) return null;
      if (!canvas) canvas = globalThis.document?.createElement?.("canvas") || null;
      if (!canvasContext) canvasContext = canvas?.getContext?.("2d", { willReadFrequently: true }) || null;
      if (!canvas || !canvasContext) throw new Error("A browser canvas is required for local hand detection.");
      canvas.width = frame.width;
      canvas.height = frame.height;
      canvasContext.putImageData(frame, 0, 0);
      frameResults.set(detector, null);
      await detector.send({ image: canvas });
      if (signal?.aborted || hands !== detector) return null;
      const result = frameResults.get(detector);
      const landmarks = result?.multiHandLandmarks?.[0];
      if (!landmarks) {
        previousGesture = null;
        return null;
      }
      const score = result?.multiHandedness?.[0]?.score;
      const classified = classifyLandmarks(landmarks, score, previousGesture);
      previousGesture = classified.previousGesture;
      return classified.gesture;
    },
    stop() {
      generation += 1;
      previousGesture = null;
      const detector = hands;
      hands = null;
      loading = null;
      canvas = null;
      canvasContext = null;
      if (detector) void Promise.resolve(detector.close()).catch(() => {});
    },
  };
}

export { classifyLandmarks };
