import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("chat dictation discloses browser-vendor processing before a consented session start", async () => {
  const control = await source("../src/components/chat/DictationControl.jsx");
  const disclosure = control.slice(control.indexOf("{disclosureOpen && ("), control.indexOf("{requesting && ("));

  assert.match(disclosure, /Your browser provides speech recognition/);
  assert.match(disclosure, /I agree, start dictation/);
  assert.match(disclosure, /onClick=\{startWithConsent\}/);
  assert.match(control, /start\(\{ consentGiven: true \}\)/);
  assert.match(control, /createDictationSession\(/);
  assert.match(control, /createBrowserSpeechProvider\(environment\)/);
  assert.match(control, /It may send audio to the browser vendor for processing/);
});

test("transcribed words stay local until the user inserts them and are never submitted by dictation", async () => {
  const control = await source("../src/components/chat/DictationControl.jsx");
  const chatInput = await source("../src/components/chat/ChatInput.jsx");
  const chatPage = await source("../src/ChatPage.jsx");

  assert.match(control, /onTranscript: \(text\) => setTranscript/);
  assert.match(control, /onInsert\(text\)/);
  assert.match(control, /Insert into message/);
  assert.doesNotMatch(control, /sendUserMessage|askHEY|sessionStorage|localStorage/);
  assert.match(chatInput, /<DictationControl onInsert=\{insertDictation\}/);
  assert.doesNotMatch(chatInput, /VoiceInput/);
  assert.match(chatInput, /input\.setSelectionRange\(value\.length, value\.length\)/);
  const persistenceGate = chatPage.indexOf("if (skipNextDraftPersistenceRef.current)");
  const persistenceWrite = chatPage.indexOf("sessionStorage.setItem(draftKey, message)");
  assert.ok(persistenceGate >= 0 && persistenceGate < persistenceWrite);
  assert.match(chatPage, /skipNextDraftPersistenceRef\.current = true/);
});

test("dictation exposes keyboard, microphone, cancellation, unsupported and account-change states", async () => {
  const control = await source("../src/components/chat/DictationControl.jsx");

  assert.match(control, /consentButtonRef\.current\?\.focus\(\)/);
  assert.match(control, /cancelRequestRef\.current\?\.focus\(\)/);
  assert.match(control, /event\.key !== "Escape"/);
  assert.match(control, /insertButtonRef\.current : triggerRef\.current/);
  assert.match(control, /combined\.slice\(0, 8000\)/);
  assert.match(control, /aria-live="polite"/);
  assert.match(control, /Microphone active · Stop/);
  assert.match(control, /Cancel request/);
  assert.match(control, /Cancel and discard/);
  assert.match(control, /Dictation is unavailable in this browser/);
  assert.match(control, /\}, \[user\?\.id\]\)/);
  assert.match(control, /sessionRef\.current\?\.destroy\(\)/);

  const cancellation = control.slice(control.indexOf("function cancelRequest()"), control.indexOf("function stopAndDiscard()"));
  assert.match(cancellation, /setRequestCancelled\(true\)/);
  assert.doesNotMatch(cancellation, /setRequesting\(false\)/);
  assert.match(control, /!requesting && !isActive && !transcript/);
});
