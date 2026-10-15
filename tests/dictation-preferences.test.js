import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDictationPreferences,
  createDictationPreferenceStore,
  normalizeDictationPreferences,
} from "../src/lib/dictationPreferences.js";
import { createBrowserSpeechProvider, createDictationSession } from "../src/lib/voiceProviders.js";

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
