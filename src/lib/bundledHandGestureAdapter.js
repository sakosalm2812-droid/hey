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

function normalizeLandmarks(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < 21) return null;
  const wrist = landmarks[0];
  const points = landmarks.slice(0, 21).map((point) => [point.x - wrist.x, point.y - wrist.y, (point.z || 0) - (wrist.z || 0)]);
  const scale = Math.max(...points.map((point) => Math.hypot(...point)));
  if (!Number.isFinite(scale) || scale < 1e-5) return null;
  return points.flatMap((point) => point.map((value) => Math.max(-1, Math.min(1, value / scale))));
}

function classifyLandmarks(landmarks, handScore, previousGesture, sensitivity = 0.8) {
  if (!Array.isArray(landmarks) || landmarks.length < 21) return { gesture: null, previousGesture: null };
  const extensionThreshold = 0.78 + (0.8 - sensitivity) * 0.1;
  const straightness = FINGER_JOINTS.map(({ base, joint, tip }) => {
    const cosine = cosineAtJoint(landmarks[base], landmarks[joint], landmarks[tip]);
    return Math.max(0, Math.min(1, (1 - cosine) / 2));
  });
  const extended = straightness.map((value) => value >= extensionThreshold);
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
  if (!documentBase) return `${basePath.replace(/\/?$/u, "/")}mediapipe/vision/`;
  return new URL(`${basePath.replace(/\/?$/u, "/")}mediapipe/vision/`, documentBase).href;
}

async function loadBundledHands() {
  return import("@mediapipe/tasks-vision");
}

export function createBundledHandGestureAdapter({ assetBaseUrl = defaultAssetBaseUrl(), handsLoader = loadBundledHands } = {}) {
  let hands = null;
  let loading = null;
  let generation = 0;
  let previousGesture = null;
  let canvas = null;
  let canvasContext = null;
  let latestObservation = null;
  let lastFrameTimestamp = 0;

  return {
    kind: "mediapipe-hands-bundled",
    isReady() { return Boolean(hands); },
    async prepare({ signal } = {}) {
      if (hands) return true;
      if (loading) return loading;
      const prepareGeneration = ++generation;
      const prepareTask = (async () => {
        const vision = await handsLoader();
        if (signal?.aborted || prepareGeneration !== generation) return false;
        if (typeof vision?.HandLandmarker?.createFromOptions !== "function") {
          throw new Error("Bundled hand landmarker did not load.");
        }
        const detector = await vision.HandLandmarker.createFromOptions({
          wasmLoaderPath: new URL("wasm/vision_wasm_nosimd_internal.js", assetBaseUrl).href,
          wasmBinaryPath: new URL("wasm/vision_wasm_nosimd_internal.wasm", assetBaseUrl).href,
        }, {
          baseOptions: {
            modelAssetPath: new URL("models/hand_landmarker.task", assetBaseUrl).href,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.65,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });
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
    async detect(frame, profile, { signal, customGestures = [] } = {}) {
      const detector = hands;
      if (!detector || signal?.aborted || !frame || !Number.isSafeInteger(frame.width) || !Number.isSafeInteger(frame.height)) return null;
      if (!canvas) canvas = globalThis.document?.createElement?.("canvas") || null;
      if (!canvasContext) canvasContext = canvas?.getContext?.("2d", { willReadFrequently: true }) || null;
      if (!canvas || !canvasContext) throw new Error("A browser canvas is required for local hand detection.");
      canvas.width = frame.width;
      canvas.height = frame.height;
      canvasContext.putImageData(frame, 0, 0);
      const now = globalThis.performance?.now?.() ?? Date.now();
      lastFrameTimestamp = Math.max(Math.floor(now), lastFrameTimestamp + 1);
      const result = detector.detectForVideo(canvas, lastFrameTimestamp);
      if (signal?.aborted || hands !== detector) return null;
      const landmarks = result?.landmarks?.[0];
      if (!landmarks) {
        previousGesture = null;
        latestObservation = null;
        return null;
      }
      const handCategory = result?.handedness?.[0]?.[0];
      const score = handCategory?.score;
      const handLabel = String(handCategory?.categoryName || "").toLowerCase();
      const handedness = handLabel === "left" || handLabel === "right" ? handLabel : "unknown";
      const preferredHand = profile?.handedness || profile?.dominantHand || "both";
      if (preferredHand !== "both" && preferredHand !== handedness) {
        previousGesture = null;
        latestObservation = null;
        return null;
      }
      const pose = normalizeLandmarks(landmarks);
      if (!pose) {
        previousGesture = null;
        latestObservation = null;
        return null;
      }
      const classified = classifyLandmarks(landmarks, score, previousGesture, profile?.sensitivity ?? 0.8);
      previousGesture = classified.previousGesture;
      latestObservation = {
        pose,
        handedness,
        handConfidence: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0,
        timestamp: Date.now(),
      };

      let detection = classified.gesture;
      let closestCustom = null;
      for (const custom of Array.isArray(customGestures) ? customGestures.slice(0, 32) : []) {
        const templates = Array.isArray(custom?.templates) ? custom.templates : [];
        if (templates.length < 3) continue;
        for (const template of templates) {
          if (template.handedness !== "unknown" && handedness !== "unknown" && template.handedness !== handedness) continue;
          if (!Array.isArray(template.data) || template.data.length !== pose.length) continue;
          const distance = pose.reduce((sum, value, index) => sum + Math.abs(value - template.data[index]), 0) / pose.length;
          const confidence = Math.max(0, Math.min(1, 1 - distance));
          if (distance <= 0.1 && (!closestCustom || confidence > closestCustom.confidence)) {
            closestCustom = { id: custom.id, confidence };
          }
        }
      }
      if (closestCustom && (!detection || closestCustom.confidence > detection.confidence)) detection = closestCustom;
      return detection ? { ...detection, handedness } : null;
    },
    getLatestObservation() {
      return latestObservation ? structuredClone(latestObservation) : null;
    },
    stop() {
      generation += 1;
      previousGesture = null;
      const detector = hands;
      hands = null;
      loading = null;
      canvas = null;
      canvasContext = null;
      latestObservation = null;
      lastFrameTimestamp = 0;
      if (detector) void Promise.resolve(detector.close()).catch(() => {});
    },
  };
}

export { classifyLandmarks, normalizeLandmarks };
