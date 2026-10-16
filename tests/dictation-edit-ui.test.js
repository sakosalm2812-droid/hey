import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  CHAT_EDIT_TARGET_ID,
  digestSelection,
  readSelectionSnapshot,
  replaceSelection,
  selectionStillMatches,
} from "../src/lib/dictationEditSelection.js";

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

test("replacement changes only the bound range and rejects stale drafts", () => {
  const snapshot = readSelectionSnapshot(input());
  assert.equal(replaceSelection(snapshot.currentText, snapshot, "chosen"), "Hello chosen world");
  assert.equal(replaceSelection("new draft", snapshot, "chosen"), null);
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

test("provider preview keeps exact model routing while Fusion remains a separate chat opt-in", async () => {
  const control = await source("../src/components/chat/DictationEditControl.jsx");
  const chatInput = await source("../src/components/chat/ChatInput.jsx");
  const heyAI = await source("../src/lib/heyAI.js");
  const edge = await source("../supabase/functions/hey/index.ts");
  assert.match(control, /rewriteHEYText\(\{ \.\.\.request, providerProfile \}\)/);
  assert.match(control, /Fusion is separate and does not run for edit previews\./);
  assert.match(chatInput, /aria-label="Model for this request"/);
  assert.match(chatInput, /Exact entitled models/);
  assert.match(heyAI, /getProviderRouteRequest\(providerProfile, false\)/);
  assert.match(edge, /resolveProviderSelection\(requestedProvider, rewriteAttempts, entitlements, routingPricing\)/);
  assert.match(edge, /authorizeRewriteProvider/);
  assert.match(edge, /fusionRequested/);
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
