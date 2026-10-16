# Gesture runtime provenance and data boundary

- JavaScript/WASM runtime: `@mediapipe/tasks-vision` **1.1.0**, pinned in `package.json` and `package-lock.json`, package license Apache-2.0. The build copies only its no-SIMD CPU loader and binary into the ignored generated directory `public/mediapipe/vision/wasm/`.
- Hand model: official Google MediaPipe `hand_landmarker.task`, obtained from `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task` on 2026-10-16 and checked into `public/mediapipe/vision/models/hand_landmarker.task` so runtime inference does not fetch the model.
- Model SHA-256: `FBC2A30080C3C557093B5DDFC334698132EB341044CCEE322CCF8BCF3607CDE1` (7,819,105 bytes).
- The adapter passes only local video frames to `HandLandmarker.detectForVideo`; this does not send camera frames to a model provider. The MediaPipe Tasks privacy notice says the SDK sends performance/utilization metrics to Google. The camera consent screen must disclose that separate metrics flow and explain that camera frames remain on-device before asking for browser camera permission.
- This record proves model and library provenance only. It does not prove camera permission UX, model accuracy, runtime performance, or real-device Gesture Studio operation. Those remain subject to browser/device verification.

Primary references: [MediaPipe Hand Landmarker Web guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js), [official model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20(Lite_Full)%20with%20Fairness%20Oct%202021.pdf), and the `@mediapipe/tasks-vision` package metadata.
