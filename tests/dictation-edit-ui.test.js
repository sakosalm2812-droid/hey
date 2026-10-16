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
  assert.match(original, /^[a-f0-9]{64}$/);
  assert.notEqual(await digestSelection(CHAT_EDIT_TARGET_ID, "changed"), original);
  assert.notEqual(await digestSelection("other-target", "selected"), original);
  assert.equal(await digestSelection(CHAT_EDIT_TARGET_ID, ""), null);
});

test("replacement changes only the bound range and rejects stale drafts", () => {
  const snapshot = readSelectionSnapshot(input());
  assert.equal(replaceSelection(snapshot.currentText, snapshot, "chosen"), "Hello chosen world");
  assert.equal(replaceSelection("new draft", snapshot, "chosen"), null);
});

test("voice edit UI fences account changes, supports cancel, and never submits", async () => {
  const control = await source("../src/components/chat/DictationEditControl.jsx");
  const inputSource = await source("../src/components/chat/ChatInput.jsx");
  const dictation = await source("../src/components/chat/DictationControl.jsx");
  assert.match(control, /subscribeAccountScope/);
  assert.match(control, /sessionRef\.current\?\.destroy\(\)/);
  assert.match(control, /setSelection\(null\)/);
  assert.match(control, /Edit cancelled\. Your draft is unchanged\./);
  assert.match(control, /provider_unavailable/);
  assert.match(control, /sessionRef\.current\?\.confirm\(proposal,\s*\{\s*confirmed: true/s);
  assert.match(control, /<button type="button" onClick=\{confirmProposal\}>Confirm edit/);
  assert.match(control, /<button type="button" onClick=\{insertConfirmed\}>Insert into draft/);
  assert.doesNotMatch(control, /onSend|sendUserMessage|askHEY/);
  assert.match(inputSource, /id="hey-chat-message-composer"/);
  assert.match(inputSource, /<DictationEditControl/);
  assert.match(dictation, /if \(onCapture\) \{\s*onCapture\(text\);\s*setStatus\("Transcript captured for voice edit\. Your draft is unchanged\."\);\s*\}\s*else onInsert\(text\);/);
  assert.match(dictation, /if \(!onCapture\) setStatus\(translateRef\.current\("chat\.dictation\.inserted"\)\)/);
});

test("voice edit does not mutate draft until the separate insertion action", async () => {
  const control = await source("../src/components/chat/DictationEditControl.jsx");
  const insertion = control.slice(control.indexOf("async function insertConfirmed()"), control.indexOf("useEffect(() => {\n    const onSelection"));
  const confirm = control.slice(control.indexOf("async function confirmProposal()"), control.indexOf("async function insertConfirmed()"));
  assert.doesNotMatch(confirm, /setValue\(/);
  assert.match(insertion, /setValue\(nextValue\)/);
  assert.match(insertion, /requestAnimationFrame/);
  assert.match(insertion, /inputRef\.current\?\.value !== nextValue/);
});
