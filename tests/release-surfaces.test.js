import assert from "node:assert/strict";
import test from "node:test";

import { RELEASE_STATUS, RELEASE_SURFACES, getReleaseSurface, isReleaseVerified } from "../src/core/platformMatrix.js";
import agentEngine, { registerAgent } from "../src/core/agentEngine.js";
import automationEngine, { createWorkflow } from "../src/core/automationEngine.js";
import forgeEngine from "../src/core/forgeEngine.js";

test("the release matrix contains every HEY target without claiming unbuilt native releases", () => {
  assert.deepEqual(RELEASE_SURFACES.map((surface) => surface.id), ["web", "windows", "macos", "linux", "ios", "android"]);
  assert.equal(getReleaseSurface("windows").status, RELEASE_STATUS.nativeBuildRequired);
  assert.equal(getReleaseSurface("ios").status, RELEASE_STATUS.nativeProjectRequired);
  assert.equal(isReleaseVerified("ios"), false);
});

test("agents fail closed until a provider returns a verified result", async () => {
  const missing = registerAgent({ id: "test-agent-missing", name: "Missing provider" });
  const missingResult = await agentEngine.executeAgent(missing, { prompt: "hello" });
  assert.equal(missingResult.success, false);
  assert.match(missingResult.error, /No execution provider/);

  const unverified = registerAgent({
    id: "test-agent-unverified",
    name: "Unverified provider",
    execute: async () => ({ success: true, verified: false, output: "invented" }),
  });
  const unverifiedResult = await agentEngine.executeAgent(unverified, {});
  assert.equal(unverifiedResult.success, false);

  const verified = registerAgent({
    id: "test-agent-verified",
    name: "Verified provider",
    execute: async () => ({ success: true, verified: true, output: "observed" }),
  });
  const verifiedResult = await agentEngine.executeAgent(verified, {});
  assert.equal(verifiedResult.success, true);
  assert.equal(verifiedResult.output.output, "observed");
});

test("automation and Forge validation fail closed without real runners", async () => {
  const workflow = createWorkflow({
    name: "No fake workflow",
    trigger: { type: "manual" },
    steps: [{ id: "step-1", action: "observe" }],
  });
  const workflowRun = await automationEngine.testWorkflow(workflow.id, {});
  assert.equal(workflowRun.state, "failed");
  assert.match(workflowRun.error, /No automation execution provider/);

  const forgeResult = await forgeEngine.runTest({ id: "test-1" });
  assert.equal(forgeResult.success, false);
  assert.equal(forgeResult.verified, false);
});
