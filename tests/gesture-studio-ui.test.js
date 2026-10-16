import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [appSource, layoutSource, settingsSource, toolsSource, studioSource, bridgeSource] = await Promise.all([
  readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/layout/AppLayout.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/SettingsPage.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/ToolLibraryPage.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/GestureStudioPage.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/layout/GestureActionBridge.jsx", import.meta.url), "utf8"),
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
});

test("Gesture Studio explains camera track loss separately from permission revocation", () => {
  assert.match(studioSource, /reason === "camera_track_ended"\) \{ setConsent\(false\); setError\("The camera feed ended\./);
  assert.match(studioSource, /reason === "permission_revoked"\) \{ setConsent\(false\); setError\("Camera access was revoked\./);
});

test("ending an active camera session requires fresh consent before restart", () => {
  assert.match(studioSource, /payload\?\.reason === "camera_track_ended"\) \{ setConsent\(false\); setError\(/);
  assert.match(studioSource, /payload\?\.reason === "permission_revoked"\) \{ setConsent\(false\); setError\(/);
});
test("Gesture actions have a route handler and completion is recorded after navigation", () => {
  assert.match(bridgeSource, /request\?\.action\?\.action !== "summon"/);
  assert.match(bridgeSource, /navigate\("\/dashboard"\)/);
  assert.match(bridgeSource, /location\.pathname !== "\/dashboard"/);
  assert.match(bridgeSource, /gesture\.action_completed/);
  assert.match(bridgeSource, /gestureEngine\.getRecognitionMode\(\) !== "active"/);
});
