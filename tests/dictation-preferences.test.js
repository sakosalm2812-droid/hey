import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDictationPreferences,
  createDictationPreferenceStore,
  normalizeDictationPreferences,
  resolveDictationPreferences,
} from "../src/lib/dictationPreferences.js";
import { createBrowserSpeechProvider, createDictationSession } from "../src/lib/voiceProviders.js";
import { setAccountScope } from "../src/core/accountScope.js";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test("dictation preferences persist by signed-in account and recover after account switches", () => {
  const storage = new MemoryStorage();
  let scope = "account:flow-a";
  const store = createDictationPreferenceStore({ storageProvider: () => storage, getScope: () => scope });
  const saved = store.save({
    language: "ar-iq",
    corrections: [{ from: "hey orbit", to: "HEY Orbit" }],
    snippets: [{ name: "my address", text: "Baghdad, Iraq" }],
  });
  assert.equal(saved.success, true);
  assert.equal(saved.preferences.language, "ar-IQ");
  assert.equal(store.load().preferences.snippets[0].text, "Baghdad, Iraq");

  scope = "account:flow-b";
  assert.equal(store.load().status, "default");
  assert.equal(store.save({ language: "ku-Arab", corrections: [], snippets: [] }).success, true);
  scope = "account:flow-a";
  assert.equal(store.load().preferences.language, "ar-IQ");
  assert.equal(store.clear().success, true);
  assert.equal(store.load().status, "default");
});

test("dictation settings reject hostile structure, ambiguity, invalid locale and oversized input", () => {
  let reads = 0;
  const correction = { from: "source", to: "target" };
  Object.defineProperty(correction, "to", { enumerable: true, get() { reads += 1; return "unsafe"; } });
  assert.throws(() => normalizeDictationPreferences({ corrections: [correction] }), /accessors/);
  assert.equal(reads, 0);

  const sparse = new Array(2);
  assert.throws(() => normalizeDictationPreferences({ snippets: sparse }), /sparse/);
  assert.throws(() => normalizeDictationPreferences({ language: "bad_locale" }), /language tag/);
  assert.throws(() => normalizeDictationPreferences({ corrections: [{ from: "same", to: "a" }, { from: " SAME ", to: "b" }] }), /unique/);
  assert.throws(() => normalizeDictationPreferences({ snippets: [{ name: "home", text: "x".repeat(2001) }] }), /length/);
});

test("saved vocabulary corrections and spoken snippet names are applied as one safe pass", () => {
  const preferences = {
    language: "en-us",
    corrections: [{ from: "hey orbit", to: "HEY Orbit" }],
    snippets: [{ name: "my address", text: "Baghdad, Iraq" }],
  };
  assert.equal(
    applyDictationPreferences("hey orbit my address nearby", preferences),
    "HEY Orbit Baghdad, Iraq nearby",
  );
  assert.equal(applyDictationPreferences("the address", preferences), "the address");
  assert.throws(() => applyDictationPreferences("text", {
    corrections: Array.from({ length: 64 }, (_, index) => ({ from: `a${index}`, to: "b" })),
    snippets: [{ name: "extra", text: "value" }],
  }), /Combined/);
});

test("configured speech language reaches both dictation sessions and browser recognition", async () => {
  let options;
  const permission = { navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } } };
  const session = createDictationSession({
    environment: permission,
    language: "ar-iq",
    speechProvider: { start(value) { options = value; return {}; }, stop() {} },
  });
  assert.equal((await session.start({ consentGiven: true })).success, true);
  assert.equal(options.language, "ar-IQ");
  session.destroy();

  let recognition;
  class Recognition {
    start() {}
    stop() {}
  }
  const provider = createBrowserSpeechProvider({ SpeechRecognition: Recognition });
  recognition = provider.start({ language: "ku-Arab" });
  assert.equal(recognition.lang, "ku-Arab");
  provider.stop(recognition);
  assert.equal(provider.start({ language: "bad_locale" }).lang, "en-US");
});

test("a dictation session snapshots account language, corrections and snippets and drops callbacks after account change", async () => {
  setAccountScope("dictation-snapshot-a");
  let callbacks;
  let startOptions;
  const transcripts = [];
  const sessionPreferences = normalizeDictationPreferences({
    language: "ku-Arab",
    corrections: [{ from: "hey orbit", to: "HEY Orbit" }],
    snippets: [{ name: "my address", text: "Private address" }],
  });
  const session = createDictationSession({
    language: sessionPreferences.language,
    corrections: [
      ...sessionPreferences.corrections,
      ...sessionPreferences.snippets.map(({ name, text }) => ({ from: name, to: text })),
    ],
    speechProvider: { start(value) { startOptions = value; callbacks = value; return {}; }, stop() {} },
    environment: { navigator: { onLine: true, mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } } },
    onTranscript: (text) => transcripts.push(text),
  });
  assert.equal((await session.start({ consentGiven: true })).success, true);
  assert.equal(startOptions.language, "ku-Arab");
  callbacks.onTranscript("Hey Orbit use my address");
  assert.deepEqual(transcripts, ["HEY Orbit use Private address"]);
  setAccountScope("dictation-snapshot-b");
  callbacks.onTranscript("late account text");
  assert.deepEqual(transcripts, ["HEY Orbit use Private address"]);
  session.destroy();
  setAccountScope(null);
});

test("preference persistence reports account, storage and read-back failures without fake success", () => {
  const storage = new MemoryStorage();
  let scope = "anonymous";
  const store = createDictationPreferenceStore({ storageProvider: () => storage, getScope: () => scope });
  assert.equal(store.load().status, "account_required");
  assert.equal(store.save({}).status, "account_required");

  scope = "account:flow-a";
  storage.setItem = () => {};
  assert.equal(store.save({ language: "en-US" }).status, "storage_failed");
  storage.setItem = MemoryStorage.prototype.setItem;
  assert.equal(store.save({ language: "en-US" }).success, true);
  storage.setItem = () => { throw new Error("quota"); };
  assert.equal(store.save({ language: "fr-FR" }).status, "storage_failed");
});

test("per-application preferences are bounded, account-scoped overrides of the global defaults", () => {
  const storage = new MemoryStorage();
  let scope = "account:app-a";
  const store = createDictationPreferenceStore({ storageProvider: () => storage, getScope: () => scope });
  assert.equal(store.save({ language: "fr-FR", corrections: [{ from: "hey", to: "bonjour" }], snippets: [] }).success, true);
  const appSaved = store.save({ language: "ar-IQ", corrections: [], snippets: [{ name: "signature", text: "Hello" }] }, { applicationId: "mail.desktop" });
  assert.equal(appSaved.success, true);
  assert.equal(store.load({ applicationId: "mail.desktop" }).preferences.language, "ar-IQ");
  assert.deepEqual(store.load({ applicationId: "mail.desktop" }).preferences.snippets, [{ name: "signature", text: "Hello" }]);

  const otherApp = store.load({ applicationId: "editor.desktop" }).preferences;
  assert.equal(otherApp.language, "fr-FR");
  assert.deepEqual(otherApp.corrections, [{ from: "hey", to: "bonjour" }]);
  assert.deepEqual(otherApp.snippets, []);
  assert.equal(store.load().preferences.language, "fr-FR");

  scope = "account:app-b";
  assert.equal(store.load({ applicationId: "mail.desktop" }).preferences.language, "en-US");
  scope = "account:app-a";
  const cleared = store.clear({ applicationId: "mail.desktop" });
  assert.equal(cleared.success, true);
  assert.equal(cleared.preferences.language, "fr-FR");
  assert.equal(store.load({ applicationId: "mail.desktop" }).preferences.language, "fr-FR");
  assert.equal(store.load().preferences.language, "fr-FR");
});

test("application identity and app preference payloads fail closed on invalid or hostile input", () => {
  const store = createDictationPreferenceStore({ storageProvider: () => new MemoryStorage(), getScope: () => "account:secure" });
  for (const applicationId of ["", "../mail", "Mail", "com..mail", "x".repeat(97), { id: "mail" }]) {
    assert.equal(store.load({ applicationId }).status, "invalid_application");
    assert.equal(store.save({}, { applicationId }).status, "invalid_application");
    assert.equal(store.clear({ applicationId }).status, "invalid_application");
  }
  assert.throws(() => normalizeDictationPreferences({ applications: [
    { applicationId: "mail", preferences: { language: "fr-FR" } },
    { applicationId: "mail", preferences: { language: "ar-IQ" } },
  ] }), /unique/);
  assert.throws(() => normalizeDictationPreferences({ applications: Array.from({ length: 33 }, (_, index) => ({
    applicationId: `app-${index}`, preferences: { language: "en-US" },
  })) }), /bounded/);
  assert.throws(() => resolveDictationPreferences({}, "../mail"), /identity is invalid/);
});

test("legacy preference envelopes still load and per-app session settings stay snapshotted", async () => {
  const storage = new MemoryStorage();
  const scope = "account:legacy";
  const key = `hey_scoped:${encodeURIComponent(scope)}:hey_dictation_preferences`;
  storage.setItem(key, JSON.stringify({ version: 1, scope, preferences: { language: "fr-FR", corrections: [], snippets: [] } }));
  const store = createDictationPreferenceStore({ storageProvider: () => storage, getScope: () => scope });
  assert.equal(store.load({ applicationId: "notes.app" }).preferences.language, "fr-FR");
  assert.equal(store.save({ language: "ar-IQ", corrections: [{ from: "hello", to: "fixed" }], snippets: [] }, { applicationId: "notes.app" }).success, true);
  const snapshot = store.load({ applicationId: "notes.app" }).preferences;
  let callbacks;
  const transcripts = [];
  const session = createDictationSession({
    language: snapshot.language,
    corrections: snapshot.corrections,
    speechProvider: { start(options) { callbacks = options; assert.equal(options.language, "ar-IQ"); return {}; }, stop() {} },
    environment: { navigator: { onLine: true, mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } } },
    onTranscript: (text) => transcripts.push(text),
  });
  assert.equal((await session.start({ consentGiven: true })).success, true);
  store.save({ language: "ku-Arab", corrections: [{ from: "hello", to: "changed" }], snippets: [] }, { applicationId: "notes.app" });
  callbacks.onTranscript("hello");
  assert.deepEqual(transcripts, ["fixed"]);
  session.destroy();
});

test("an account switch during an app save cannot copy one account's settings into another", () => {
  const storage = new MemoryStorage();
  const scopes = ["account:before", "account:after", "account:after"];
  const store = createDictationPreferenceStore({ storageProvider: () => storage, getScope: () => scopes.shift() ?? "account:after" });
  const saved = store.save({ language: "ar-IQ", corrections: [], snippets: [] }, { applicationId: "mail.desktop" });
  assert.equal(saved.success, false);
  assert.equal(saved.status, "account_required");
  assert.equal(storage.values.size, 0);
});
