import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { setAccountScope } from "../src/core/accountScope.js";
import { understandVoiceCommand } from "../src/core/voiceCommandUnderstanding.js";
import { describeSafeComputerActionPreview } from "../src/core/voiceOSPreview.js";

test("safe computer previews expose only bounded target and capability labels", async () => {
  setAccountScope("voiceos-ui-safe");
  try {
    const app = await understandVoiceCommand("open calculator");
    const appSummary = describeSafeComputerActionPreview(app);
    assert.deepEqual(appSummary, { capability: "app.open", label: "Open app", target: "calculator", risk: "High" });

    const url = await understandVoiceCommand("open https://example.com/path");
    const urlSummary = describeSafeComputerActionPreview(url);
    assert.equal(urlSummary.capability, "browser.open_url");
    assert.equal(urlSummary.target, "https://example.com/path");
  } finally {
    setAccountScope(null);
  }
});

test("unsafe, malformed, and hostile previews never produce a display summary", async () => {
  setAccountScope("voiceos-ui-reject");
  try {
    const workflow = await understandVoiceCommand("send an email to someone");
    assert.equal(describeSafeComputerActionPreview(workflow), null);

    const command = await understandVoiceCommand("open https://example.com");
    const dangerousProtocol = { ...command, preview: { ...command.preview, command: { ...command.preview.command, url: "javascript:alert(1)" } } };
    assert.equal(describeSafeComputerActionPreview(dangerousProtocol), null);

    let getterCalls = 0;
    const hostile = { type: "Command", status: "preview_required", requiresConfirmation: true };
    Object.defineProperty(hostile, "preview", { get() { getterCalls += 1; throw new Error("do not evaluate accessors"); } });
    assert.equal(describeSafeComputerActionPreview(hostile), null);
    assert.equal(getterCalls, 0);
  } finally {
    setAccountScope(null);
  }
});

test("chat review UI is visibly inert and does not dispatch a confirmed action", async () => {
  const source = await readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8");
  assert.match(source, /Reviewing records your acknowledgment only/);
  assert.match(source, /Trust Kernel permit and verified device authorization are still required/);
  assert.match(source, /I reviewed this preview/);
  assert.match(source, /reviewVoiceCommandPreview\(pending\.preview\)/);
  assert.doesNotMatch(source, /confirmPendingExecution|pendingExecution/);
  assert.doesNotMatch(source, /sendUserMessage\([^\n]*confirmed\s*:\s*true/);
  const reviewStart = source.indexOf("function reviewComputerPreview()");
  const reviewEnd = source.indexOf("function cancelComputerPreview()", reviewStart);
  assert.ok(reviewStart >= 0 && reviewEnd > reviewStart);
  const reviewHandler = source.slice(reviewStart, reviewEnd);
  assert.doesNotMatch(reviewHandler, /sendUserMessage|askHEY|executeRequest|invoke\(/);
});
