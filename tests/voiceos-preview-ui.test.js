import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { setAccountScope } from "../src/core/accountScope.js";
import { understandVoiceCommand } from "../src/core/voiceCommandUnderstanding.js";
import { canRestoreComputerPreviewRequest, describeSafeComputerActionPreview, getComputerPreviewExpiryAction, shouldClearSubmittedComputerPreviewDraft } from "../src/core/voiceOSPreview.js";
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

test("failed refresh recovery rejects delayed results after cancel, account or conversation switch, or newer draft", async () => {
  const base = {
    pendingPreviewId: "preview-current",
    currentPreviewId: "preview-current",
    pendingAccountScope: "account:owner",
    currentAccountScope: "account:owner",
    expectedAccountScope: "account:owner",
    pendingConversationId: "conversation-a",
    currentConversationId: "conversation-a",
    currentDraft: "",
  };
  assert.equal(canRestoreComputerPreviewRequest(base), true);

  const hostile = { ...base };
  let getterCalls = 0;
  Object.defineProperty(hostile, "currentDraft", { enumerable: true, get() { getterCalls += 1; return ""; } });
  assert.equal(canRestoreComputerPreviewRequest(hostile), false);
  assert.equal(getterCalls, 0);
  assert.equal(canRestoreComputerPreviewRequest(new Proxy({ ...base }, { ownKeys() { throw new Error("hostile state"); } })), false);

  for (const [name, mutate] of [
    ["cancel", (current) => { current.currentPreviewId = null; }],
    ["replacement preview", (current) => { current.currentPreviewId = "preview-new"; }],
    ["account switch", (current) => { current.currentAccountScope = "account:other"; current.expectedAccountScope = "account:other"; }],
    ["conversation switch", (current) => { current.currentConversationId = "conversation-b"; }],
    ["newer draft", (current) => { current.currentDraft = "keep this newer text"; }],
  ]) {
    const current = { ...base };
    let completeRefresh;
    const refresh = new Promise((resolve) => { completeRefresh = resolve; })
      .then(() => canRestoreComputerPreviewRequest({ ...base, ...current }));
    mutate(current);
    completeRefresh();
    assert.equal(await refresh, false, `late refresh cannot restore after ${name}`);
  }
});

test("typed preview completion clears only its unchanged submitted draft", async () => {
  assert.equal(shouldClearSubmittedComputerPreviewDraft("open calculator", "open calculator"), true);
  assert.equal(shouldClearSubmittedComputerPreviewDraft("open calculator", "keep my newer draft"), false);
  assert.equal(shouldClearSubmittedComputerPreviewDraft("open calculator", ""), false);
  assert.equal(shouldClearSubmittedComputerPreviewDraft("open calculator", "open calculator "), false);
  assert.equal(shouldClearSubmittedComputerPreviewDraft(null, "open calculator"), false);
  assert.equal(shouldClearSubmittedComputerPreviewDraft("   ", "   "), false);

  const source = await readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8");
  const typedStart = source.indexOf("async function sendUserMessage(");
  const typedEnd = source.indexOf("function reviewComputerPreview()", typedStart);
  assert.ok(typedStart >= 0 && typedEnd > typedStart);
  const submitHandler = source.slice(typedStart, typedEnd);
  const previewStart = submitHandler.indexOf("if (nextPreview) {");
  const previewEnd = submitHandler.indexOf("const requestedFusion", previewStart);
  assert.ok(previewStart >= 0 && previewEnd > previewStart);
  const previewBranch = submitHandler.slice(previewStart, previewEnd);
  assert.match(previewBranch, /shouldClearSubmittedComputerPreviewDraft\(userMessage, messageRef\.current\)\) setMessage\(""\)/);
  assert.doesNotMatch(previewBranch, /sendUserMessage|askHEY|executeRequest|invoke\(/);
});

test("delayed expiry callbacks recheck preview identity, review state, account scope, and hostile records", async () => {
  const pending = { preview: { previewId: "preview-a" }, accountScope: "account:a", reviewed: false };
  let live = pending;
  let accountScope = "account:a";
  const scheduleExpiry = () => Promise.resolve().then(() => getComputerPreviewExpiryAction({
    scheduledPreviewId: "preview-a",
    currentPreview: live,
    currentAccountScope: accountScope,
  }));

  const replacedExpiry = scheduleExpiry();
  live = { preview: { previewId: "preview-b" }, accountScope: "account:a", reviewed: false };
  assert.equal(await replacedExpiry, "stale");

  live = pending;
  const reviewedExpiry = scheduleExpiry();
  live = { ...pending, reviewed: true };
  assert.equal(await reviewedExpiry, "stale");
  assert.equal(getComputerPreviewExpiryAction({
    scheduledPreviewId: "preview-a",
    currentPreview: { ...pending, reviewed: "false" },
    currentAccountScope: "account:a",
  }), "stale");

  live = pending;
  const switchedExpiry = scheduleExpiry();
  accountScope = "account:b";
  assert.equal(await switchedExpiry, "clear");

  accountScope = "account:a";
  const currentExpiry = scheduleExpiry();
  assert.equal(await currentExpiry, "expire");

  let getterCalls = 0;
  const hostile = { ...pending };
  Object.defineProperty(hostile, "reviewed", { enumerable: true, get() { getterCalls += 1; throw new Error("do not read"); } });
  assert.equal(getComputerPreviewExpiryAction({ scheduledPreviewId: "preview-a", currentPreview: hostile, currentAccountScope: "account:a" }), "stale");
  assert.equal(getComputerPreviewExpiryAction(new Proxy({ scheduledPreviewId: "preview-a", currentPreview: pending, currentAccountScope: "account:a" }, { ownKeys() { throw new Error("hostile expiry state"); } })), "stale");
  assert.equal(getterCalls, 0);

  const source = await readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8");
  const callbackStart = source.indexOf("const timeout = window.setTimeout(() => {");
  const callbackEnd = source.indexOf("}, Math.max(0, expiresAt - Date.now()));", callbackStart);
  assert.ok(callbackStart >= 0 && callbackEnd > callbackStart);
  const callback = source.slice(callbackStart, callbackEnd);
  assert.match(callback, /getComputerPreviewExpiryAction\(/);
  assert.match(callback, /if \(expiryAction === "stale"\) return/);
  assert.match(callback, /cancelVoiceCommandPreview\(pending\.preview\.previewId\)/);
  assert.match(callback, /if \(expiryAction === "clear"\)/);
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

test("a rejected review revokes the stale token and restores the request only into its current empty context", async () => {
  const source = await readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8");
  const reviewStart = source.indexOf("function reviewComputerPreview()");
  const reviewEnd = source.indexOf("async function refreshComputerPreview()", reviewStart);
  assert.ok(reviewStart >= 0 && reviewEnd > reviewStart);
  const reviewHandler = source.slice(reviewStart, reviewEnd);
  const rejectionStart = reviewHandler.indexOf("if (!reviewed.success)");
  const rejectionEnd = reviewHandler.indexOf("storeComputerPreview({ ...pending, reviewed: true", rejectionStart);
  assert.ok(rejectionStart >= 0 && rejectionEnd > rejectionStart);
  const rejection = reviewHandler.slice(rejectionStart, rejectionEnd);
  assert.match(rejection, /reviewed\.status === "preview_expired"[\s\S]*?return;/);
  assert.match(rejection, /cancelVoiceCommandPreview\(pending\.preview\.previewId\)/);
  assert.match(rejection, /storeComputerPreview\(null\)/);
  assert.match(rejection, /pending\.accountScope === getAccountScope\(\)/);
  assert.match(rejection, /pending\.conversationId === conversationId/);
  assert.match(rejection, /!message\.trim\(\)/);
  assert.match(rejection, /setMessage\(pending\.message\)/);
  assert.doesNotMatch(rejection, /sendUserMessage|askHEY|executeRequest|invoke\(/);
});

test("dismissing a reviewed inert preview restores its request only when its original context is still empty", async () => {
  const source = await readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8");
  const dismissStart = source.indexOf("function dismissComputerPreview()");
  const dismissEnd = source.indexOf("function renderComputerPreview()", dismissStart);
  assert.ok(dismissStart >= 0 && dismissEnd > dismissStart);
  const dismissHandler = source.slice(dismissStart, dismissEnd);
  assert.match(dismissHandler, /if \(!pending\.reviewed\) cancelVoiceCommandPreview/);
  assert.match(dismissHandler, /canRestorePendingComputerRequest\(pending\)/);
  assert.match(dismissHandler, /storeComputerPreview\(null\)/);
  assert.match(dismissHandler, /if \(restoreRequest\) setMessage\(pending\.message\)/);
  assert.doesNotMatch(dismissHandler, /sendUserMessage|askHEY|executeRequest|invoke\(/);
});

test("VoiceOS preview labels and status copy are accessible and translated for every supported locale", async () => {
  const source = await readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8");
  const required = [
    "checking", "sectionLabel", "title", "reviewedTitle", "risk", "action", "target", "capability",
    "highRisk", "mediumRisk", "openApp", "navigateBrowser", "openWebsite", "noAuthority",
    "reviewedStatus", "dismiss", "reviewedAction", "cancelAction", "accountChanged", "conversationChanged",
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

test("unmount aborts preview work and revokes an unreviewed pending token", async () => {
  const source = await readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8");
  const cleanupStart = source.indexOf("useEffect(() => () => {");
  const cleanupEnd = source.indexOf("const [mode, setMode]", cleanupStart);
  assert.ok(cleanupStart >= 0 && cleanupEnd > cleanupStart);
  const cleanup = source.slice(cleanupStart, cleanupEnd);
  assert.match(cleanup, /previewController\?\.abort\(\)/);
  assert.match(cleanup, /const pendingPreview = pendingComputerPreviewRef\.current/);
  assert.match(cleanup, /pendingComputerPreviewRef\.current = null/);
  assert.match(cleanup, /if \(pendingPreview && !pendingPreview\.reviewed\)/);
  assert.match(cleanup, /cancelVoiceCommandPreview\(pendingPreview\.preview\.previewId\)/);
  assert.doesNotMatch(cleanup, /sendUserMessage|askHEY|executeRequest|invoke\(/);
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
  const voiceEnd = source.indexOf("async function sendUserMessage(", voiceStart);
  assert.ok(voiceStart >= 0 && voiceEnd > voiceStart);
  assert.match(source.slice(voiceStart, voiceEnd), /replaceComputerPreview\(\{ \.\.\.nextPreview, source: "voice" \}\)/);
  const typedStart = source.indexOf("async function sendUserMessage(");
  const typedEnd = source.indexOf("function reviewComputerPreview()", typedStart);
  assert.ok(typedStart >= 0 && typedEnd > typedStart);
  assert.match(source.slice(typedStart, typedEnd), /replaceComputerPreview\(nextPreview\)/);
});

test("computer previews are fenced to the conversation where the request began", async () => {
  const source = await readFile(new URL("../src/ChatPage.jsx", import.meta.url), "utf8");
  const creationStart = source.indexOf("const createSafeComputerPreview = useCallback(");
  const creationEnd = source.indexOf("const storeComputerPreview", creationStart);
  assert.ok(creationStart >= 0 && creationEnd > creationStart);
  const creation = source.slice(creationStart, creationEnd);
  assert.match(creation, /const expectedConversationId = conversationIdRef\.current/);
  assert.match(creation, /conversationIdRef\.current !== expectedConversationId/);
  assert.match(creation, /cancelVoiceCommandPreview\(preview\.previewId\)/);
  assert.match(creation, /conversationId: expectedConversationId/);

  const fenceCondition = source.indexOf("if (!pending || pending.conversationId === conversationId)");
  const fenceStart = source.lastIndexOf("useEffect(() => {", fenceCondition);
  const fenceEnd = source.indexOf("const replaceComputerPreview", fenceStart);
  assert.ok(fenceStart >= 0 && fenceEnd > fenceStart);
  const fence = source.slice(fenceStart, fenceEnd);
  assert.match(fence, /previewRequestControllerRef\.current\?\.abort\(\)/);
  assert.match(fence, /cancelVoiceCommandPreview\(pending\.preview\.previewId\)/);
  assert.match(fence, /storeComputerPreview\(null\)/);
  assert.match(fence, /conversationChanged/);
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
  assert.match(refreshHandler, /canRestorePendingComputerRequest\(pending\)/);
  assert.match(source, /currentDraft: messageRef\.current/);
  assert.match(source, /currentConversationId: conversationIdRef\.current/);
  assert.match(source, /expectedAccountScope: currentUserId \? `account:\$\{currentUserId\}` : null/);
  assert.match(refreshHandler, /current\.conversationId !== conversationIdRef\.current/);
  assert.match(refreshHandler, /current\.accountScope !== \(userIdRef\.current \? `account:\$\{userIdRef\.current\}` : null\)/);
});
