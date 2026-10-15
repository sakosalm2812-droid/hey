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

test("Gesture actions have a route handler and completion is recorded after navigation", () => {
  assert.match(bridgeSource, /request\?\.action\?\.action !== "summon"/);
  assert.match(bridgeSource, /navigate\("\/dashboard"\)/);
  assert.match(bridgeSource, /location\.pathname !== "\/dashboard"/);
  assert.match(bridgeSource, /gesture\.action_completed/);
  assert.match(bridgeSource, /gestureEngine\.getRecognitionMode\(\) !== "active"/);
});
