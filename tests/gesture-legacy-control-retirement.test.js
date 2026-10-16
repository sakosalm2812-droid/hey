import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const legacyHook = new URL("../src/lib/gestureControl.js", import.meta.url);
const engineSourcePath = new URL("../src/core/gestureEngine.js", import.meta.url);
const packagePath = new URL("../package.json", import.meta.url);

test("retired standalone Gesture hook cannot bypass the consented engine", async () => {
  await assert.rejects(access(legacyHook), { code: "ENOENT" });
  const [engineSource, packageJson] = await Promise.all([
    readFile(engineSourcePath, "utf8"),
    readFile(packagePath, "utf8"),
  ]);

  assert.match(engineSource, /createBundledHandGestureAdapter/);
  assert.match(engineSource, /consent !== true/);
  assert.doesNotMatch(packageJson, /"@mediapipe\/hands"/);
});
