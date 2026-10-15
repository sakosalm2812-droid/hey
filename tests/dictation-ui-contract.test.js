import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { translations } from "../src/i18n/translations.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("chat dictation discloses browser-vendor processing before a consented session start", async () => {
  const control = await source("../src/components/chat/DictationControl.jsx");
  const disclosure = control.slice(control.indexOf("{disclosureOpen && ("), control.indexOf("{requesting && ("));

  assert.match(disclosure, /t\("chat\.dictation\.disclosure"\)/);
  assert.match(disclosure, /t\("chat\.dictation\.consent"\)/);
  assert.match(disclosure, /onClick=\{startWithConsent\}/);
  assert.match(control, /start\(\{ consentGiven: true \}\)/);
  assert.match(control, /createDictationSession\(/);
  assert.match(control, /createBrowserSpeechProvider\(environment\)/);
  assert.match(translations.en.chat.dictation.disclosure, /may send audio to the browser vendor for processing/);
});

test("transcribed words stay local until the user inserts them and are never submitted by dictation", async () => {
  const control = await source("../src/components/chat/DictationControl.jsx");
  const chatInput = await source("../src/components/chat/ChatInput.jsx");
  const chatPage = await source("../src/ChatPage.jsx");

  assert.match(control, /onTranscript: \(text\) => setTranscript/);
  assert.match(control, /onInsert\(text\)/);
  assert.match(control, /t\("chat\.dictation\.insert"\)/);
  assert.doesNotMatch(control, /sendUserMessage|askHEY|sessionStorage|localStorage/);
  assert.match(chatInput, /<DictationControl [^>]*onInsert=\{insertDictation\}/);
  assert.doesNotMatch(chatInput, /VoiceInput/);
  assert.match(chatInput, /input\.setSelectionRange\(value\.length, value\.length\)/);
  const persistenceGate = chatPage.indexOf("if (skipNextDraftPersistenceRef.current)");
  const persistenceWrite = chatPage.indexOf("sessionStorage.setItem(draftKey, message)");
  assert.ok(persistenceGate >= 0 && persistenceGate < persistenceWrite);
  assert.match(chatPage, /skipNextDraftPersistenceRef\.current = true/);
});

test("dictation exposes keyboard, microphone, cancellation, unsupported and account-change states", async () => {
  const control = await source("../src/components/chat/DictationControl.jsx");
  const chatInput = await source("../src/components/chat/ChatInput.jsx");
  const chatPage = await source("../src/ChatPage.jsx");

  assert.match(control, /consentButtonRef\.current\?\.focus\(\)/);
  assert.match(control, /cancelRequestRef\.current\?\.focus\(\)/);
  assert.match(control, /event\.key !== "Escape"/);
  assert.match(control, /insertButtonRef\.current : triggerRef\.current/);
  assert.match(control, /combined\.slice\(0, 8000\)/);
  assert.match(control, /aria-live="polite"/);
  assert.match(control, /t\("chat\.dictation\.stop"\)/);
  assert.match(control, /t\("chat\.dictation\.cancelRequest"\)/);
  assert.match(control, /t\("chat\.dictation\.discardActive"\)/);
  assert.match(control, /t\("chat\.dictation\.unavailable"\)/);
  assert.match(control, /\}, \[user\?\.id, getErrorMessage\]\)/);
  assert.match(control, /translateRef\.current = t/);
  assert.match(control, /sessionRef\.current\?\.destroy\(\)/);
  assert.match(chatInput, /<DictationControl key=\{user\?\.id \|\| "signed-out"\}/);
  assert.match(chatPage, /<ChatWorkspace key=\{user\?\.id \|\| 'signed-out'\}/);

  const cancellation = control.slice(control.indexOf("function cancelRequest()"), control.indexOf("function stopAndDiscard()"));
  assert.match(cancellation, /setRequestCancelled\(true\)/);
  assert.doesNotMatch(cancellation, /setRequesting\(false\)/);
  assert.match(control, /!requesting && !isActive && !transcript/);
});

test("dictation UI strings are translated for every supported locale", () => {
  const locales = Object.keys(translations);
  const englishKeys = Object.keys(translations.en.chat.dictation).sort();
  assert.deepEqual(locales.sort(), ["ar", "en", "ku"]);
  for (const locale of locales) {
    const dictation = translations[locale].chat.dictation;
    assert.deepEqual(Object.keys(dictation).sort(), englishKeys);
    for (const value of Object.values(dictation)) {
      assert.equal(typeof value, "string");
      assert.ok(value.length > 0);
    }
  }
  assert.notEqual(translations.ar.chat.dictation.disclosure, translations.en.chat.dictation.disclosure);
  assert.notEqual(translations.ku.chat.dictation.consent, translations.en.chat.dictation.consent);
});
