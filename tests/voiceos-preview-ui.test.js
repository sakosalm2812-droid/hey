import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { setAccountScope } from "../src/core/accountScope.js";
import { understandVoiceCommand } from "../src/core/voiceCommandUnderstanding.js";
import { describeSafeComputerActionPreview } from "../src/core/voiceOSPreview.js";
import { translations } from "../src/i18n/translations.js";

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
  assert.match(source, /t\("chat\.voiceOS\.noAuthority"/);
  assert.match(source, /t\("chat\.voiceOS\.reviewedAction"/);
  assert.match(source, /reviewVoiceCommandPreview\(pending\.preview\)/);
  assert.doesNotMatch(source, /confirmPendingExecution|pendingExecution/);
  assert.doesNotMatch(source, /sendUserMessage\([^\n]*confirmed\s*:\s*true/);
  const reviewStart = source.indexOf("function reviewComputerPreview()");
  const reviewEnd = source.indexOf("function cancelComputerPreview()", reviewStart);
  assert.ok(reviewStart >= 0 && reviewEnd > reviewStart);
  const reviewHandler = source.slice(reviewStart, reviewEnd);
  assert.doesNotMatch(reviewHandler, /sendUserMessage|askHEY|executeRequest|invoke\(/);
});

test("VoiceOS preview labels and status copy are accessible and translated for every supported locale", async () => {
  const source = await readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8");
  const required = [
    "checking", "sectionLabel", "title", "reviewedTitle", "risk", "action", "target", "capability",
    "highRisk", "mediumRisk", "openApp", "navigateBrowser", "openWebsite", "noAuthority",
    "reviewedStatus", "dismiss", "reviewedAction", "cancelAction", "accountChanged",
    "accountRequiredVoice", "accountRequired", "differentAccount", "expired",
    "expiredRefresh", "expiredNotice", "refreshPreview", "previewRefreshFailed", "previewFreshReady",
    "reviewNeedsAuthorization", "cancelled", "previewOnly", "voicePrepared",
    "capabilityAppOpen", "capabilityBrowserNavigate", "capabilityBrowserOpenUrl",
  ];
  for (const locale of ["en", "ku", "ar"]) {
    for (const key of required) {
      assert.equal(typeof translations[locale].chat.voiceOS[key], "string", `${locale}.chat.voiceOS.${key} exists`);
      assert.ok(translations[locale].chat.voiceOS[key].length > 0, `${locale}.chat.voiceOS.${key} is not empty`);
      if (locale !== "en") {
        assert.notEqual(translations[locale].chat.voiceOS[key], translations.en.chat.voiceOS[key], `${locale}.chat.voiceOS.${key} is translated`);
      }
    }
  }

  assert.match(source, /aria-label=\{t\("chat\.voiceOS\.sectionLabel"/);
  assert.match(source, /role="status">\{t\("chat\.voiceOS\.checking"/);
  assert.match(source, /<p role="status">\{t\("chat\.voiceOS\.reviewedStatus"/);
  assert.match(source, /setExecutionStatus\(t\("chat\.voiceOS\.accountChanged"/);
  assert.match(source, /setExecutionStatus\(t\("chat\.voiceOS\.cancelled"/);
  for (const key of ["noAuthority", "risk", "target", "cancelAction", "accountChanged", "differentAccount", "expired", "reviewNeedsAuthorization"]) {
    assert.match(source, new RegExp(`chat\\.voiceOS\\.${key}`), `${key} uses the translation API`);
  }
});

test("expired previews offer only a fresh preview and keep the original request recoverable", async () => {
  const source = await readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8");
  assert.match(source, /This preview expired\. Refresh it to review a new preview; nothing was run\./);
  assert.match(source, /Refresh preview/);
  const refreshStart = source.indexOf("async function refreshComputerPreview()");
  const refreshEnd = source.indexOf("function cancelComputerPreview()", refreshStart);
  assert.ok(refreshStart >= 0 && refreshEnd > refreshStart);
  const refreshHandler = source.slice(refreshStart, refreshEnd);
  assert.match(refreshHandler, /createSafeComputerPreview\(pending\.message\)/);
  assert.match(refreshHandler, /storeComputerPreview\(\{ \.\.\.nextPreview, source: pending\.source \}\)/);
  assert.match(refreshHandler, /setMessage\(pending\.message\)/);
  assert.doesNotMatch(refreshHandler, /sendUserMessage|askHEY|executeRequest|invoke\(/);
});
