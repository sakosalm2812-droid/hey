import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [appSource, layoutSource, settingsSource, toolsSource, studioSource, bridgeSource, engineSource] = await Promise.all([
  readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/layout/AppLayout.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/SettingsPage.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/ToolLibraryPage.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/GestureStudioPage.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/layout/GestureActionBridge.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/core/gestureEngine.js", import.meta.url), "utf8"),
]);

test("Gesture Studio has a protected route and entry points from navigation, Settings, and Tools", () => {
  assert.match(appSource, /path="\/gestures"\s+element={<ProtectedLayout><GestureStudioPage \/><\/ProtectedLayout>}/);
  assert.match(layoutSource, /label: "Gesture Studio", path: "\/gestures"/);
  assert.match(settingsSource, /to="\/gestures">Open Gesture Studio/);
  assert.match(toolsSource, /to="\/gestures">Open Gesture Studio/);
});

test("Gesture Studio requires explicit camera consent and keeps a visible test preview", () => {
  assert.match(studioSource, /I consent to camera use for this gesture session/);
  assert.match(studioSource, /startRecognition\(profileId, \{ consent: true, mode \}\)/);
  assert.match(studioSource, /aria-label="Live local gesture camera preview"/);
  assert.match(studioSource, /Test only · no actions/);
  assert.match(studioSource, /captureCustomGestureSample/);
});

test("custom-pose capture explains and blocks detector confidence below the engine threshold", () => {
  assert.match(studioSource, /MIN_GESTURE_CALIBRATION_CONFIDENCE/);
  assert.match(studioSource, /calibrationConfidenceReady/);
  assert.match(studioSource, /Hand tracking is below .*confidence/);
  assert.match(studioSource, /Keep your hand centered, unobstructed, and well lit/);
  assert.match(studioSource, /disabled=\{!active \|\| mode !== "test" \|\| !calibrationReady\}/);
});

test("custom-pose calibration reports and gates dim, washed-out, distant, and off-center hands", () => {
  assert.match(studioSource, /calibrationConditionsReady/);
  assert.match(studioSource, /The camera image looks dim/);
  assert.match(studioSource, /The camera image looks washed out/);
  assert.match(studioSource, /Your hand appears too small in the frame/);
  assert.match(studioSource, /Move your hand toward the center of the preview/);
  assert.match(studioSource, /Capture unlocks when tracking and framing are ready/);
});

test("Gesture Studio discloses local camera processing and separate MediaPipe metrics before consent", () => {
  const frameDisclosure = studioSource.indexOf("Camera frames and hand poses are processed on this device and are not sent to Google.");
  const metricsDisclosure = studioSource.indexOf("MediaPipe Tasks SDK sends performance and utilization metrics to Google.");
  const consentControl = studioSource.indexOf("I consent to camera use for this gesture session.");
  assert.ok(frameDisclosure >= 0);
  assert.ok(metricsDisclosure > frameDisclosure);
  assert.ok(consentControl > metricsDisclosure);
  assert.match(studioSource, /Raw video is not saved/);
});

test("Gesture Studio offers camera permission recovery for denied and revoked access", () => {
  assert.match(studioSource, /\["permission_denied", "revoked"\]\.includes\(capability\?\.status\)/);
  assert.match(studioSource, /Recheck camera access/);
  assert.match(studioSource, /void recheckCameraAccess\(\)/);
  assert.match(studioSource, /setConsent\(false\)/);
  assert.match(studioSource, /Reconfirm consent and start recognition when ready/);
  assert.match(studioSource, /Camera permission was reset or revoked/);
  assert.match(studioSource, /Check camera access, then give consent and start again/);
});

test("Gesture Studio explains profile-specific active mode recovery without granting action permission", () => {
  assert.match(studioSource, /const enabledProfileMappings = bindings\.filter/);
  assert.match(studioSource, /binding\.profileId === profileId && binding\.actionType === "ui" && binding\.action === "summon"/);
  assert.match(studioSource, /Active mode is unavailable for this profile until you add an enabled safe mapping/);
  assert.match(studioSource, /href="#gesture-mapping-title">Go to Safe mappings<\/a>/);
  assert.match(studioSource, /Test mode remains available and never dispatches actions/);
  assert.match(studioSource, /do not grant higher-risk permission/);
  assert.match(studioSource, /if \(mode === "active" && !canUseActiveMode\)/);
  assert.match(bridgeSource, /gestureEngine\.getRecognitionMode\(\) !== "active"/);
});

test("Gesture Studio explains camera track loss separately from permission revocation", () => {
  assert.match(studioSource, /reason === "camera_track_ended"\) \{ setConsent\(false\); setError\("The camera feed ended\./);
  assert.match(studioSource, /reason === "permission_revoked"\) \{ setConsent\(false\); setError\("Camera permission was reset or revoked\./);
});

test("Gesture Studio asks for fresh consent after the camera feed stalls", () => {
  assert.match(studioSource, /reason === "camera_frame_stalled"\) \{ setConsent\(false\); setError\("Camera frames stopped advancing\./);
  assert.match(studioSource, /Check the camera connection, then give consent again to restart/);
});

test("Gesture Studio camera selection is profile-scoped and enumeration does not request capture", () => {
  assert.match(studioSource, /Camera for this profile/);
  assert.match(studioSource, /gestureEngine\.enumerateCameras\(\)/);
  assert.match(studioSource, /Finding cameras does not open the camera or request permission/);
  assert.match(studioSource, /editProfile\("cameraId", event\.target\.value \|\| null\)/);
  assert.match(studioSource, /I consent to camera use for this gesture session/);
});

test("a missing profile camera explains how to recover while preserving the saved choice", () => {
  assert.match(engineSource, /selected_camera_unavailable/);
  assert.match(engineSource, /The selected camera is unavailable\. Choose a listed camera or System default, then start again\./);
  assert.match(engineSource, /profile\.cameraId \? \{ exact: profile\.cameraId \} : undefined/);
  assert.match(studioSource, /setError\(failure\?\.message \|\| "Gesture recognition could not start\."\)/);
});

test("ending an active camera session requires fresh consent before restart", () => {
  assert.match(studioSource, /payload\?\.reason === "camera_track_ended"\) \{ setConsent\(false\); setError\(/);
  assert.match(studioSource, /payload\?\.reason === "permission_revoked"\) \{ setConsent\(false\); setError\(/);
});
test("page visibility loss stops the session and requires fresh camera consent", () => {
  assert.match(studioSource, /payload\?\.reason === "page_hidden"\) \{ setConsent\(false\); setError\(/);
});
test("Gesture actions have a route handler and completion is recorded after navigation", () => {
  assert.match(bridgeSource, /request\?\.action\?\.action !== "summon"/);
  assert.match(bridgeSource, /navigate\("\/dashboard"\)/);
  assert.match(bridgeSource, /location\.pathname !== "\/dashboard"/);
  assert.match(bridgeSource, /gesture\.action_completed/);
  assert.match(bridgeSource, /gestureEngine\.getRecognitionMode\(\) !== "active"/);
});
