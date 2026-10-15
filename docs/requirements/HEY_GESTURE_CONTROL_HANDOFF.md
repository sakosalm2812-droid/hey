# Gesture Control handoff

## Scope and source coverage

This implementation continues the existing HEY application on `codex/next-05-gesture-control`, based on checkpoint `87fdf2916e2d1afe612352a0acc72f9417cf2cb3`. It follows the Gesture Control requirements in Specialist 05 §18, Gesture Studio §87 and Gesture System §5; the shared foundation’s platform, camera permission, risk and background constraints; Source B Prompt 08 (Universal Tool Library) and Prompt 42 (Platform & Native Adapters); and Source C §§1, 6, 13, 14, 20–23.

The local workspace included the complete relevant excerpts in the specialist brief, shared foundation and Source C recovery directive. The original combined Source A attachment (`HEY_FINAL_ABSOLUTE_SOURCE_OF_TRUTH_COMBINED.md`) and Source B master prompt file were not present. Their relevant sections were available in the brief and were read; no claim is made that the absent master files were inspected.

## Delivered behavior

- `/gestures` is a protected, directly navigable Gesture Studio route with sidebar, Settings and Tool Library entry points.
- Profiles, safe gesture mappings and custom pose templates use the existing account-scoped storage contract.
- The browser camera opens only after an explicit Studio checkbox and Start. A session camera permission grant is revoked on stop, permission loss, account change, route departure or component unmount.
- A visible, mirrored preview accompanies the camera session. Detector processing is local. Raw camera frames are not persisted.
- Profiles expose bounded dominant-hand, sensitivity, confidence, hold and cooldown controls; edits are locked while the session is active.
- The bundled MediaPipe adapter advertises G01, G02, G12, G15 and G16 only. UI mapping exposes only those gestures and the implemented Dashboard navigation action.
- Test mode reports steady detections and never dispatches a mapping. Custom poses require three or more recent, high-confidence normalized hand-landmark samples captured through the bundled detector. User-supplied scores and legacy generic calibration vectors do not qualify. Similar custom profiles block mapping.
- Active mode dispatches only `summon`, because that is the only gesture action currently connected to a real handler. The persistent route bridge confirms Dashboard navigation before recording `gesture.action_completed`; other allowlisted legacy actions fail closed.

## Verification and limitations

The complete repository test suite passed (509 tests); the additional Gesture Studio UI contract suite passed (3 tests). Coverage includes the bundled adapter contract, local model lifecycle, camera consent/revocation, bounded account data, custom sample requirements, hold/cooldown, paused-frame rejection, test-mode dispatch suppression, protected routing and discovery entry points. The production build passed. Lint passed on every changed application and test file. Full repository lint reports 219 errors in unchanged vendored files under `public/mediapipe/hands` (generated MediaPipe JavaScript/WebAssembly loader code).

No physical camera session was started in this work. Real camera permission, live MediaPipe inference and custom-pose quality on the user’s camera therefore remain **UNVERIFIED**. Browser mock tests demonstrate lifecycle and API contracts only; they are not evidence of hardware inference quality. The attached full Source A and Source B master files also remain unavailable in this workspace as listed above.

The bundled runtime is based on the pinned `@mediapipe/hands` package and locally bundled assets. Current official MediaPipe documentation describes the newer Tasks Vision Hand Landmarker API; consider a migration only after device-level comparative validation. References: [MediaPipe Hand Landmarker for Web](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js) and [Hand Landmarker overview](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker).

## Next execution step

After review/merge, perform an authorized browser session with the user to verify camera permission, preview, hand labels, pose capture and actual Dashboard navigation. Any detector threshold or template-distance adjustment should be made from that evidence. Do not call the feature production-ready until real-device camera and inference behavior is verified.
