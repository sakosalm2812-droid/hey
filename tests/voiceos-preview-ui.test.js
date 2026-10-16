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
    "expiredRefresh", "expiredNotice", "refreshPreview", "cancelRefresh", "previewRefreshCancelled", "previewRefreshFailed", "previewFreshReady",
    "cancelledByCommand", "preparationCancelled", "noPendingPreview", "cancelPreparationAction",
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
  assert.match(source, /<div className="hey-chat-preview-checking" role="status">/);
  assert.match(source, /<span>\{t\("chat\.voiceOS\.checking"/);
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
  assert.match(refreshHandler, /createSafeComputerPreview\(pending\.message, previewController\.signal\)/);
  assert.match(refreshHandler, /storeComputerPreview\(\{ \.\.\.nextPreview, source: pending\.source \}\)/);
  assert.match(refreshHandler, /setMessage\(pending\.message\)/);
  assert.doesNotMatch(refreshHandler, /sendUserMessage|askHEY|executeRequest|invoke\(/);
});

test("expired preview refresh remains cancellable and keeps the original request", async () => {
  const source = await readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8");
  const cancelStart = source.indexOf("function cancelComputerPreviewRefresh()");
  const cancelEnd = source.indexOf("function cancelComputerPreview()", cancelStart);
  assert.ok(cancelStart >= 0 && cancelEnd > cancelStart);
  const cancelHandler = source.slice(cancelStart, cancelEnd);
  assert.match(cancelHandler, /controller\.abort\(\)/);
  assert.match(cancelHandler, /chat\.voiceOS\.previewRefreshCancelled/);
  assert.doesNotMatch(cancelHandler, /storeComputerPreview\(null\)|setMessage\(/);
  assert.match(source, /onClick=\{refreshing \? cancelComputerPreviewRefresh : cancelComputerPreviewPreparation\}/);
  assert.match(source, /if \(previewController\.signal\.aborted\) \{[\s\S]*?cancelVoiceCommandPreview\(nextPreview\.preview\.previewId\)/);
});

test("spoken or typed cancellation revokes a pending preview and aborts in-flight preview creation", async () => {
  const source = await readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8");
  assert.match(source, /if \(isVoiceCommandCancellation\(text\)\)/);
  assert.match(source, /if \(isVoiceCommandCancellation\(trimmedMessage\)\)/);
  assert.match(source, /previewController\.signal\.aborted\) return/);

  const cancelStart = source.indexOf("const cancelPendingComputerPreviewFromCommand = useCallback(");
  const cancelEnd = source.indexOf("useEffect(() => {", cancelStart);
  assert.ok(cancelStart >= 0 && cancelEnd > cancelStart);
  const cancelHandler = source.slice(cancelStart, cancelEnd);
  assert.match(cancelHandler, /previewRequestControllerRef\.current\?\.abort\(\)/);
  assert.match(cancelHandler, /pending\.accountScope !== getAccountScope\(\)/);
  assert.match(cancelHandler, /cancelVoiceCommandPreview\(pending\.preview\.previewId\)/);
  assert.match(cancelHandler, /storeComputerPreview\(null\)/);
  assert.doesNotMatch(cancelHandler, /askHEY|sendUserMessage|executeRequest|invoke\(/);

  const sendStart = source.indexOf("async function sendUserMessage(userMessage)");
  const previewGuard = source.indexOf("if (previewRequestInFlightRef.current) return", sendStart);
  const cancelGuard = source.indexOf("if (isVoiceCommandCancellation(trimmedMessage))", sendStart);
  assert.ok(cancelGuard >= 0 && previewGuard > cancelGuard, "cancellation is handled before the in-flight preview guard");
});

test("replacing a pending preview revokes its old capability for both typed and spoken requests", async () => {
  const source = await readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8");
  const replacementStart = source.indexOf("const replaceComputerPreview = useCallback(");
  const replacementEnd = source.indexOf("const cancelPendingComputerPreviewFromCommand", replacementStart);
  assert.ok(replacementStart >= 0 && replacementEnd > replacementStart);
  const replacement = source.slice(replacementStart, replacementEnd);
  assert.match(replacement, /current && !current\.reviewed/);
  assert.match(replacement, /current\.preview\.previewId !== nextPreview\?\.preview\?\.previewId/);
  assert.match(replacement, /cancelVoiceCommandPreview\(current\.preview\.previewId\)/);
  assert.match(replacement, /storeComputerPreview\(nextPreview\)/);

  const voiceStart = source.indexOf("const askFromVoice = useCallback(");
  const voiceEnd = source.indexOf("async function sendUserMessage(userMessage)", voiceStart);
  assert.ok(voiceStart >= 0 && voiceEnd > voiceStart);
  assert.match(source.slice(voiceStart, voiceEnd), /replaceComputerPreview\(\{ \.\.\.nextPreview, source: "voice" \}\)/);
  const typedStart = source.indexOf("async function sendUserMessage(userMessage)");
  const typedEnd = source.indexOf("function reviewComputerPreview()", typedStart);
  assert.ok(typedStart >= 0 && typedEnd > typedStart);
  assert.match(source.slice(typedStart, typedEnd), /replaceComputerPreview\(nextPreview\)/);
});

test("the preview remains cancellable while refresh is pending and discards any late result", async () => {
  const source = await readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8");
  const renderStart = source.indexOf("function renderComputerPreview()");
  const renderEnd = source.indexOf("async function pinMessage", renderStart);
  assert.ok(renderStart >= 0 && renderEnd > renderStart);
  const renderHandler = source.slice(renderStart, renderEnd);
  assert.match(renderHandler, /const checkingStatus = previewChecking \?/);
  assert.match(renderHandler, /onClick=\{refreshing \? cancelComputerPreviewRefresh : cancelComputerPreviewPreparation\}/);
  assert.doesNotMatch(renderHandler, /if \(previewChecking\)\s*\{\s*return/);

  const preparationStart = source.indexOf("function cancelComputerPreviewPreparation()");
  const preparationEnd = source.indexOf("useEffect(() => {", preparationStart);
  assert.ok(preparationStart >= 0 && preparationEnd > preparationStart);
  const preparationHandler = source.slice(preparationStart, preparationEnd);
  assert.match(preparationHandler, /previewRequestControllerRef\.current\?\.abort\(\)/);
  assert.doesNotMatch(preparationHandler, /storeComputerPreview\(null\)/);

  const cancelStart = source.indexOf("function cancelComputerPreview()");
  const cancelEnd = source.indexOf("function dismissComputerPreview()", cancelStart);
  const cancelHandler = source.slice(cancelStart, cancelEnd);
  assert.match(cancelHandler, /previewRequestControllerRef\.current\?\.abort\(\)/);

  const refreshStart = source.indexOf("async function refreshComputerPreview()");
  const refreshEnd = source.indexOf("function cancelComputerPreview()", refreshStart);
  const refreshHandler = source.slice(refreshStart, refreshEnd);
  assert.match(refreshHandler, /createSafeComputerPreview\(pending\.message, previewController\.signal\)/);
  assert.match(refreshHandler, /if \(previewController\.signal\.aborted\) \{/);
  assert.match(refreshHandler, /cancelVoiceCommandPreview\(nextPreview\.preview\.previewId\)/);
});
