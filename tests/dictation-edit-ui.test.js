import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  CHAT_EDIT_TARGET_ID,
  captureEditOperationFence,
  dictationProviderRouteIdentity,
  digestSelectionSnapshot,
  digestSelection,
  editOperationFenceIsCurrent,
  readSelectionSnapshot,
  replaceSelection,
  selectionStillMatches,
  undoEntryIsCurrent,
} from "../src/lib/dictationEditSelection.js";
import { focusDictationEditTarget } from "../src/lib/dictationEditFocus.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

function input(overrides = {}) {
  return {
    id: CHAT_EDIT_TARGET_ID,
    value: "Hello selected world",
    selectionStart: 6,
    selectionEnd: 14,
    ...overrides,
  };
}

test("edit selection is bound to the intended composer, exact range, and full draft", () => {
  const target = input();
  const snapshot = readSelectionSnapshot(target);
  assert.equal(snapshot.sourceText, "selected");
  assert.equal(selectionStillMatches(target, snapshot), true);
  assert.equal(readSelectionSnapshot(input({ id: "other-input" })), null);
  assert.equal(selectionStillMatches(input({ selectionEnd: 13 }), snapshot), false);
  assert.equal(selectionStillMatches(input({ value: "Hello altered world" }), snapshot), false);
  assert.equal(readSelectionSnapshot(input({ selectionStart: 14, selectionEnd: 14 })), null);
});

test("selection digest changes with target or selected text and rejects unavailable crypto", async () => {
  const original = await digestSelection(CHAT_EDIT_TARGET_ID, "selected");
  const ranged = await digestSelection(CHAT_EDIT_TARGET_ID, "selected", 6, 14);
  assert.match(original, /^[a-f0-9]{64}$/);
  assert.notEqual(await digestSelection(CHAT_EDIT_TARGET_ID, "changed"), original);
  assert.notEqual(await digestSelection("other-target", "selected"), original);
  assert.notEqual(await digestSelection(CHAT_EDIT_TARGET_ID, "selected", 7, 15), ranged);
  assert.equal(await digestSelection(CHAT_EDIT_TARGET_ID, ""), null);
});

test("selected-text bindings become stale when identical text moves to another conversation", async () => {
  const target = input();
  const first = readSelectionSnapshot(target, "conversation-one");
  const second = readSelectionSnapshot(target, "conversation-two");
  assert.equal(selectionStillMatches(target, first, "conversation-one"), true);
  assert.equal(selectionStillMatches(target, first, "conversation-two"), false);
  assert.notEqual(await digestSelectionSnapshot(first), await digestSelectionSnapshot(second));
  const newConversation = readSelectionSnapshot(target, null);
  assert.notEqual(await digestSelectionSnapshot(first), await digestSelectionSnapshot(newConversation));
});

test("replacement changes only the bound range and rejects stale drafts", () => {
  const snapshot = readSelectionSnapshot(input());
  assert.equal(replaceSelection(snapshot.currentText, snapshot, "chosen"), "Hello chosen world");
  assert.equal(replaceSelection("new draft", snapshot, "chosen"), null);
});

test("undo entries are bound to the originating account, conversation, and exact replacement", () => {
  const entry = {
    previousValue: "Hello selected world",
    nextValue: "Hello chosen world",
    start: 6,
    originalEnd: 14,
    conversationId: "conversation-a",
    accountScope: "account:edit-a",
  };
  const context = { accountScope: "account:edit-a", conversationId: "conversation-a", currentValue: entry.nextValue };
  assert.equal(undoEntryIsCurrent(entry, context), true);
  assert.equal(undoEntryIsCurrent(entry, { ...context, accountScope: "account:edit-b" }), false);
  assert.equal(undoEntryIsCurrent(entry, { ...context, conversationId: "conversation-b" }), false);
  assert.equal(undoEntryIsCurrent(entry, { ...context, currentValue: "Hello another draft" }), false);

  let getterCalls = 0;
  const hostile = { ...entry };
  Object.defineProperty(hostile, "accountScope", { enumerable: true, get() { getterCalls += 1; return entry.accountScope; } });
  assert.equal(undoEntryIsCurrent(hostile, context), false);
  assert.equal(getterCalls, 0);
  assert.equal(undoEntryIsCurrent(new Proxy(entry, { ownKeys() { throw new Error("hostile undo record"); } }), context), false);
});

test("provider route consent identity distinguishes exact routes and rejects hostile profiles", () => {
  const firstRoute = dictationProviderRouteIdentity({ providerId: "provider-a", modelId: "model-1" });
  const secondRoute = dictationProviderRouteIdentity({ providerId: "provider-a", modelId: "model-2" });
  assert.ok(firstRoute);
  assert.notEqual(firstRoute, secondRoute);
  assert.notEqual(dictationProviderRouteIdentity("automatic"), firstRoute);
  assert.equal(dictationProviderRouteIdentity(""), null);
  assert.equal(dictationProviderRouteIdentity({ providerId: "provider-a", modelId: "m", extra: true }), null);

  let getterCalls = 0;
  const hostile = { modelId: "model-1" };
  Object.defineProperty(hostile, "providerId", { enumerable: true, get() { getterCalls += 1; return "provider-a"; } });
  assert.equal(dictationProviderRouteIdentity(hostile), null);
  assert.equal(getterCalls, 0);
  assert.equal(dictationProviderRouteIdentity(new Proxy({ providerId: "provider-a", modelId: "model-1" }, {
    ownKeys() { throw new Error("hostile provider profile"); },
  })), null);
});

test("async edit operations are fenced against cancellation and account changes", () => {
  const fence = captureEditOperationFence(4, "account:edit-a");
  assert.deepEqual(fence, { generation: 4, accountScope: "account:edit-a" });
  assert.equal(editOperationFenceIsCurrent(fence, 4, "account:edit-a"), true);
  assert.equal(editOperationFenceIsCurrent(fence, 5, "account:edit-a"), false);
  assert.equal(editOperationFenceIsCurrent(fence, 4, "account:edit-b"), false);
  assert.equal(captureEditOperationFence(-1, "account:edit-a"), null);
  assert.equal(editOperationFenceIsCurrent(null, 4, "account:edit-a"), false);

  let getterCalls = 0;
  const accessorFence = { generation: 4 };
  Object.defineProperty(accessorFence, "accountScope", { enumerable: true, get() { getterCalls += 1; return "account:edit-a"; } });
  assert.equal(editOperationFenceIsCurrent(accessorFence, 4, "account:edit-a"), false);
  assert.equal(getterCalls, 0);
  assert.equal(editOperationFenceIsCurrent(new Proxy({}, { ownKeys() { throw new Error("hostile fence"); } }), 4, "account:edit-a"), false);
});

test("real Chat page exposes selected-text voice editing with a discoverable idle prompt", async () => {
  const chatPage = await source("../src/ChatPage.jsx");
  const chatInput = await source("../src/components/chat/ChatInput.jsx");
  const control = await source("../src/components/chat/DictationEditControl.jsx");
  assert.match(chatPage, /<ChatInput[\s\S]*?value=\{message\}[\s\S]*?setValue=\{setMessage\}/);
  assert.match(chatPage, /<ChatInput[\s\S]*?conversationId=\{conversationId\}/);
  assert.match(chatInput, /<DictationEditControl[^>]*inputRef=\{inputRef\}[^>]*setValue=\{setValue\}/);
  assert.match(control, /Select text in your message draft, then choose voice edit\./);
  assert.match(control, /preview before replacing anything/);
  assert.match(control, /aria-describedby="hey-dictation-edit-help"/);
  assert.match(control, /onClick=\{beginEdit\} aria-describedby=/);
  assert.doesNotMatch(control, /onClick=\{beginEdit\}[^>]*disabled=\{!selection/);
  assert.match(control, /Select text in the message draft before editing\./);
});

test("voice edit UI fences account changes, requires provider consent, and never submits", async () => {
  const control = await source("../src/components/chat/DictationEditControl.jsx");
  const inputSource = await source("../src/components/chat/ChatInput.jsx");
  const dictation = await source("../src/components/chat/DictationControl.jsx");
  const heyAI = await source("../src/lib/heyAI.js");
  const edge = await source("../supabase/functions/hey/index.ts");
  assert.match(control, /subscribeAccountScope/);
  assert.match(control, /sessionRef\.current\?\.destroy\(\)/);
  assert.match(control, /setSelection\(null\)/);
  assert.match(control, /Edit cancelled\. Your draft is unchanged\./);
  assert.match(control, /REWRITE_DISCLOSURE/);
  assert.match(control, /rewriteConsent:/);
  assert.match(control, /sessionRef\.current\?\.confirm\(proposal,\s*\{/);
  assert.match(control, /onClick=\{confirmProposal\}>Confirm edit/);
  assert.match(control, /onClick=\{replaceConfirmed\}>Replace selected text/);
  assert.match(control, /onClick=\{undoAppliedEdit\}>Undo edit/);
  assert.match(control, /setValue\(nextValue\)/);
  assert.doesNotMatch(control, /onSend|sendUserMessage|askHEY|sessionStorage|localStorage/);
  assert.match(inputSource, /id="hey-chat-message-composer"/);
  assert.match(inputSource, /<DictationEditControl[^>]*providerProfile=\{providerProfile\}[^>]*fusionEnabled=\{fusionEnabled\}/);
  assert.match(inputSource, /<DictationEditControl[^>]*conversationId=\{conversationId\}/);
  assert.match(control, /Conversation changed\. Select text again before continuing the edit\./);
  assert.match(control, /snapshot\.conversationId !== conversationId/);
  assert.match(control, /digestSelectionSnapshot\(selection\)/);
  assert.match(inputSource, /Fusion is an independent opt-in and uses its own provider selection\./);
  assert.match(dictation, /if \(onCapture\) \{\s*onCapture\(text\);\s*setStatus\("Transcript captured for voice edit\. Your draft is unchanged\."\);\s*\}\s*else onInsert\(text\);/);
  assert.match(dictation, /if \(!onCapture\) setStatus\(translateRef\.current\("chat\.dictation\.inserted"\)\)/);
  assert.match(heyAI, /operation: "dictation_rewrite"/);
  assert.match(heyAI, /\.\.\.providerRouteRequest/);
  const rewrite = edge.slice(edge.indexOf('if (payload.operation === "dictation_rewrite")'), edge.indexOf('if (payload.operation === "vision")'));
  assert.ok(rewrite.length > 0);
  assert.match(rewrite, /return jsonResponse\(\{ text, model: result\.model, provider: result\.providerId \}\)/);
  assert.doesNotMatch(rewrite, /hey_conversations|hey_messages|hey_records/);
});

test("visible cancellation aborts in-flight edit work before and during provider calls", async () => {
  const control = await source("../src/components/chat/DictationEditControl.jsx");
  assert.match(control, /const abortRef = useRef\(null\)/);
  assert.match(control, /abortRef\.current\?\.abort\(\)/);
  assert.match(control, /cancelSignal: controller\.signal/);
  assert.match(control, /generationRef\.current !== generation \|\| getAccountScope\(\) !== accountRef\.current/);
  assert.match(control, /onClick=\{\(\) => \{ abortRef\.current\?\.abort\(\); resetFlow\("Edit cancelled\. Your draft is unchanged\."\); \}\}/);
  assert.match(control, /abortRef\.current\?\.abort\(\)[\s\S]*setSelection\(null\)/);
  const runtimeTests = await source("./dictation-edit-proposals.test.js");
  assert.match(runtimeTests, /a user AbortSignal aborts provider work and late output cannot create a preview/);
  assert.match(runtimeTests, /pre-aborted rewrite requests never disclose source text to the provider/);
});

test("late confirmation and replacement digests cannot revive cancelled UI work", async () => {
  const control = await source("../src/components/chat/DictationEditControl.jsx");
  for (const [name, nextName] of [["confirmProposal", "replaceConfirmed"], ["replaceConfirmed", "undoAppliedEdit"]]) {
    const start = control.indexOf(`async function ${name}()`);
    const end = control.indexOf(`function ${nextName}()`, start);
    const operation = control.slice(start, end);
    assert.match(operation, /captureEditOperationFence\(generationRef\.current, getAccountScope\(\)\)/, `${name} captures its lifecycle`);
    assert.match(operation, /await digestSelection[\s\S]*editOperationFenceIsCurrent\(operationFence, generationRef\.current, getAccountScope\(\)\)/, `${name} checks its lifecycle after awaiting`);
  }
});

test("provider preview keeps exact model routing while Fusion remains a separate chat opt-in", async () => {
  const control = await source("../src/components/chat/DictationEditControl.jsx");
  const chatInput = await source("../src/components/chat/ChatInput.jsx");
  const heyAI = await source("../src/lib/heyAI.js");
  const edge = await source("../supabase/functions/hey/index.ts");
  assert.match(control, /rewriteHEYText\(\{ \.\.\.request, providerProfile: currentProfile \}\)/);
  assert.match(control, /providerProfileRef\.current = providerProfile/);
  assert.match(control, /Fusion is separate and does not run for edit previews\./);
  assert.match(chatInput, /aria-label="Model for this request"/);
  assert.match(chatInput, /Exact entitled models/);
  assert.match(heyAI, /getProviderRouteRequest\(providerProfile, false\)/);
  assert.match(edge, /resolveProviderSelection\(requestedProvider, rewriteAttempts, entitlements, routingPricing\)/);
  assert.match(edge, /authorizeRewriteProvider/);
  assert.match(edge, /fusionRequested/);
});

test("route changes revoke edit consent and cancel or discard route-bound previews", async () => {
  const control = await source("../src/components/chat/DictationEditControl.jsx");
  assert.match(control, /checked=\{consentedRouteIdentity === providerRouteIdentity/);
  assert.match(control, /event\.target\.checked \? providerRouteIdentity : null/);
  assert.match(control, /consentedRouteIdentity !== routeAtStart/);
  assert.match(control, /currentProviderRouteRef\.current !== routeAtStart/);
  assert.match(control, /previousProviderRouteRef\.current = providerRouteIdentity/);
  const routeEffect = control.slice(control.indexOf("if (previousProviderRouteRef.current === providerRouteIdentity)"), control.indexOf("focusDictationEditTarget(stage"));
  assert.match(routeEffect, /abortRef\.current\?\.abort\(\)/);
  assert.match(routeEffect, /setProposal\(null\)/);
  assert.match(routeEffect, /setStage\("consent"\)/);
  const previewFailure = control.slice(control.indexOf("if (!result?.success)"), control.indexOf("if (!selectionStillMatches", control.indexOf("if (!result?.success)")));
  assert.match(previewFailure, /setConsentedRouteIdentity\(null\)/);
  assert.match(previewFailure, /setStage\("consent"\)/);
  assert.doesNotMatch(previewFailure, /setInstruction\(""\)/);
  assert.match(previewFailure, /Your draft is unchanged/);
  assert.match(control, /Could not prepare a preview\. Your draft is unchanged\. Review privacy and consent again to retry\./);
  assert.doesNotMatch(control, /setStatus\(error\?\.message/);
});

test("late rewrite failures recover only for the still-current route, account, conversation, and draft", async () => {
  const control = await source("../src/components/chat/DictationEditControl.jsx");
  const preview = control.slice(control.indexOf("async function createPreview()"), control.indexOf("async function confirmProposal()"));
  const resultHandling = preview.slice(preview.indexOf("const result = await"), preview.indexOf("if (!result?.success)"));
  assert.match(resultHandling, /generationRef\.current !== generation/);
  assert.match(resultHandling, /getAccountScope\(\) !== accountRef\.current/);
  assert.match(resultHandling, /currentProviderRouteRef\.current !== routeAtStart/);
  assert.match(resultHandling, /conversationId !== snapshot\.conversationId/);
  assert.match(resultHandling, /selectionStillMatches\(inputRef\.current, snapshot, conversationId\)/);

  const catchHandling = preview.slice(preview.indexOf("} catch {"), preview.indexOf("} finally"));
  assert.match(catchHandling, /!controller\.signal\.aborted/);
  assert.match(catchHandling, /getAccountScope\(\) === accountRef\.current/);
  assert.match(catchHandling, /currentProviderRouteRef\.current === routeAtStart/);
  assert.match(catchHandling, /selectionStillMatches\(inputRef\.current, snapshot, conversationId\)/);
  assert.match(catchHandling, /setConsentedRouteIdentity\(null\)/);
  assert.match(catchHandling, /setStage\("consent"\)/);
  assert.doesNotMatch(catchHandling, /setInstruction\(""\)|error\?\.message/);
});

test("voice edit does not mutate draft until the separate insertion action", async () => {
  const control = await source("../src/components/chat/DictationEditControl.jsx");
  const insertion = control.slice(control.indexOf("async function replaceConfirmed()"), control.indexOf("function undoAppliedEdit()"));
  const confirm = control.slice(control.indexOf("async function confirmProposal()"), control.indexOf("async function replaceConfirmed()"));
  assert.doesNotMatch(confirm, /setValue\(/);
  assert.match(insertion, /setValue\(nextValue\)/);
  assert.match(insertion, /requestAnimationFrame/);
  assert.match(insertion, /inputRef\.current\?\.value !== nextValue/);
});

test("undo checks its account fence before restoring and again before restoring focus", async () => {
  const control = await source("../src/components/chat/DictationEditControl.jsx");
  assert.match(control, /setUndoEntry\(\{[^}]*accountScope: operationFence\.accountScope/);
  const undo = control.slice(control.indexOf("function undoAppliedEdit()"), control.indexOf("if (!userId || disabled)"));
  assert.match(undo, /undoEntryIsCurrent\(undoEntry, \{ accountScope: currentScope, conversationId, currentValue: inputRef\.current\?\.value \}\)/);
  assert.match(undo, /currentScope !== accountRef\.current/);
  assert.match(undo, /editOperationFenceIsCurrent\(operationFence, generationRef\.current, getAccountScope\(\)\)/);
  assert.match(undo, /operationFence\.accountScope !== accountRef\.current/);
  assert.match(undo, /inputRef\.current\?\.value !== undoEntry\.previousValue/);
});

test("keyboard focus follows selected-text edit stages and returns to spoken status feedback", async () => {
  const control = await source("../src/components/chat/DictationEditControl.jsx");
  const styles = await source("../src/styles/chat.css");
  assert.match(control, /focusDictationEditTarget\(stage, status/);
  assert.match(control, /\}, \[stage, status\]\);/);
  for (const heading of [
    "Voice edit: capture instruction",
    "Review privacy before sending",
    "Preparing preview",
    "Review proposed edit",
    "Confirm replacement",
  ]) {
    assert.ok(control.includes(`>${heading}</h3>`), `stage has a focusable heading: ${heading}`);
  }
  assert.match(control, /<h3 ref=\{flowHeadingRef\} tabIndex=\{-1\}>/);
  assert.match(control, /<p ref=\{statusRef\} tabIndex=\{-1\} role="status"/);
  assert.match(styles, /\.hey-dictation-edit :focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/);
  const previewStage = control.slice(control.indexOf('{stage === "previewing"'), control.indexOf('{stage === "review"'));
  assert.doesNotMatch(previewStage, /<div[^>]*role="status"/);
  assert.match(previewStage, /<span role="status" aria-live="polite">Preparing preview…<\/span>[\s\S]*Cancel request/);
});

test("focus helper avoids initial focus theft and survives missing or throwing targets", () => {
  const calls = [];
  const flowHeading = { focus: () => calls.push("heading") };
  const statusMessage = { focus: () => calls.push("status") };
  assert.equal(focusDictationEditTarget("idle", "", { flowHeading, statusMessage }), false);
  assert.equal(focusDictationEditTarget("capture", "", { flowHeading, statusMessage }), true);
  assert.equal(focusDictationEditTarget("idle", "Edit cancelled.", { flowHeading, statusMessage }), true);
  assert.equal(focusDictationEditTarget("previewing", "", { statusMessage }), false);
  assert.equal(focusDictationEditTarget("unknown", "", { flowHeading, statusMessage }), false);
  assert.equal(focusDictationEditTarget("review", "", { flowHeading: { focus() { throw new Error("detached target"); } } }), false);
  assert.deepEqual(calls, ["heading", "status"]);
});
