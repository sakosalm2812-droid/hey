import assert from "node:assert/strict";
import test from "node:test";
import { setAccountScope } from "../src/core/accountScope.js";
import {
  applyDictationPreferences,
  createDictationPreferenceStore,
  normalizeDictationPreferences,
  resolveDictationPreferences,
} from "../src/lib/dictationPreferences.js";
import { applyDictationCorrections, createBrowserSpeechProvider, createDictationSession } from "../src/lib/voiceProviders.js";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function environmentWithPermission() {
  return { navigator: { onLine: true, mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } } };
}

test("vocabulary is bounded, locale-conflict checked, and independent from replacement phrases", () => {
  const preferences = normalizeDictationPreferences({
    language: "fr-FR",
    corrections: [{ from: "hey orbit", to: "HEY Orbit" }],
    snippets: [{ name: "my signature", text: "Cheers" }],
    vocabulary: ["OpenAI", "Codex Desktop"],
  });
  assert.deepEqual(preferences.vocabulary, ["OpenAI", "Codex Desktop"]);
  assert.equal(applyDictationPreferences("hey orbit and my signature, signature nearby", preferences), "HEY Orbit and Cheers, signature nearby");
  const longSnippet = "S".repeat(2000);
  assert.equal(applyDictationPreferences("sign here", { language: "en-US", snippets: [{ name: "sign here", text: longSnippet }] }), longSnippet);
  assert.equal(applyDictationCorrections("İSTANBUL", [{ from: "istanbul", to: "Istanbul" }], "tr-TR"), "Istanbul");
  assert.equal(applyDictationCorrections("STRASSE", [{ from: "Straße", to: "Street" }], "de-DE"), "Street");
  assert.throws(() => normalizeDictationPreferences({ vocabulary: Array.from({ length: 33 }, (_, index) => `term ${index}`) }), /bounded/);
  assert.throws(() => normalizeDictationPreferences({ language: "tr-TR", corrections: [{ from: "I", to: "one" }], vocabulary: ["ı"] }), /must not conflict/);
  assert.throws(() => normalizeDictationPreferences({ language: "de-DE", corrections: [{ from: "Straße", to: "Street" }], vocabulary: ["STRASSE"] }), /must not conflict/);
  assert.throws(() => normalizeDictationPreferences({ corrections: [{ from: "same", to: "replacement" }], snippets: [{ name: "SAME", text: "other" }] }), /must not conflict/);
  assert.throws(() => normalizeDictationPreferences({
    language: "en-US",
    corrections: [{ from: "company name", to: "Company" }],
    applications: [{ applicationId: "notes.desktop", preferences: { vocabulary: ["COMPANY NAME"] } }],
  }), /must not conflict/);
});

test("account and per-app vocabulary survives unrelated saves and remains isolated", () => {
  const storage = new MemoryStorage();
  let scope = "account:vocabulary-a";
  const store = createDictationPreferenceStore({ storageProvider: () => storage, getScope: () => scope });
  assert.equal(store.save({ language: "en-US", corrections: [], snippets: [], vocabulary: ["global phrase"] }).success, true);
  assert.equal(store.save({ language: "fr-FR", corrections: [], snippets: [], vocabulary: ["app phrase"] }, { applicationId: "notes.desktop" }).success, true);

  // Editors that predate the vocabulary field must not erase a saved app list.
  assert.equal(store.save({ language: "ar-IQ", corrections: [], snippets: [] }, { applicationId: "notes.desktop" }).success, true);
  assert.deepEqual(store.load({ applicationId: "notes.desktop" }).preferences.vocabulary, ["app phrase"]);
  // The global editor also preserves an omitted vocabulary property and overrides.
  assert.equal(store.save({ language: "ku-Arab", corrections: [], snippets: [] }).success, true);
  assert.deepEqual(store.load().preferences.vocabulary, ["global phrase"]);
  assert.deepEqual(store.load({ applicationId: "notes.desktop" }).preferences.vocabulary, ["app phrase"]);

  scope = "account:vocabulary-b";
  assert.deepEqual(store.load({ applicationId: "notes.desktop" }).preferences.vocabulary, []);
  scope = "account:vocabulary-a";
  assert.equal(store.clear({ applicationId: "notes.desktop" }).success, true);
  assert.deepEqual(store.load({ applicationId: "notes.desktop" }).preferences.vocabulary, ["global phrase"]);
});

test("runtime snapshots provider hints and phrase replacements, then fences stale account callbacks", async () => {
  setAccountScope("account:vocabulary-session-a");
  const storage = new MemoryStorage();
  const store = createDictationPreferenceStore({ storageProvider: () => storage, getScope: () => "account:vocabulary-session-a" });
  assert.equal(store.save({
    language: "en-US",
    corrections: [],
    snippets: [],
    vocabulary: ["global phrase"],
  }).success, true);
  assert.equal(store.save({
    language: "tr-TR",
    corrections: [{ from: "istanbul", to: "Istanbul" }],
    snippets: [{ name: "imza", text: "Saygılarımla" }],
    vocabulary: ["OpenAI Codex"],
  }, { applicationId: "mail.desktop" }).success, true);
  const selected = store.load({ applicationId: "mail.desktop" }).preferences;
  let callbacks;
  let startOptions;
  const emitted = [];
  const session = createDictationSession({
    language: selected.language,
    corrections: [...selected.corrections, ...selected.snippets.map(({ name, text }) => ({ from: name, to: text }))],
    vocabulary: selected.vocabulary,
    speechProvider: { start(options) { startOptions = options; callbacks = options; return {}; }, stop() {} },
    environment: environmentWithPermission(),
    onTranscript: (text) => emitted.push(text),
  });

  assert.equal((await session.start({ consentGiven: true })).success, true);
  assert.deepEqual(startOptions.vocabulary, ["OpenAI Codex"]);
  assert.equal(Object.isFrozen(startOptions.vocabulary), true);
  assert.equal(startOptions.language, "tr-TR");
  store.save({ language: "en-US", corrections: [], snippets: [], vocabulary: ["changed later"] });
  callbacks.onTranscript("İSTANBUL imza OpenAI Codex nearby");
  assert.deepEqual(emitted, ["Istanbul Saygılarımla OpenAI Codex nearby"]);

  setAccountScope("account:vocabulary-session-b");
  callbacks.onTranscript("late private transcript");
  assert.deepEqual(emitted, ["Istanbul Saygılarımla OpenAI Codex nearby"]);
  const stored = [...storage.values.values()].join("\n");
  assert.equal(stored.includes("Istanbul Saygılarımla OpenAI Codex nearby"), false);
  assert.equal(stored.includes("late private transcript"), false);
  session.destroy();
  setAccountScope(null);
});

test("browser provider passes contextual phrases only when its phrase constructor is present", () => {
  let withHints;
  class SpeechRecognitionPhrase {
    constructor(phrase, boost) { this.phrase = phrase; this.boost = boost; }
  }
  class Recognition {
    start() {}
    stop() {}
  }
  const provider = createBrowserSpeechProvider({ SpeechRecognition: Recognition, SpeechRecognitionPhrase });
  const first = provider.start({ vocabulary: ["Codex Desktop"] });
  withHints = first.phrases;
  assert.deepEqual(withHints.map(({ phrase, boost }) => ({ phrase, boost })), [{ phrase: "Codex Desktop", boost: 1 }]);

  const withoutHintSupport = createBrowserSpeechProvider({ SpeechRecognition: Recognition });
  const second = withoutHintSupport.start({ vocabulary: ["Codex Desktop"] });
  assert.equal(Object.hasOwn(second, "phrases"), false);
  assert.equal(createBrowserSpeechProvider({ SpeechRecognition: {} }), null);
  assert.ok(createBrowserSpeechProvider({ webkitSpeechRecognition: Recognition }));
});

test("native browser provider lifecycle requires consent, applies long saved snippet text, and cancels late results", async () => {
  const recognitions = [];
  const permissionOptions = [];
  const stoppedTracks = [];
  const metrics = [];
  class BrowserRecognition {
    constructor() { recognitions.push(this); }
    start() { this.started = true; }
    stop() { this.stopped = true; this.onend?.(); }
  }
  const environment = {
    SpeechRecognition: BrowserRecognition,
    navigator: {
      onLine: true,
      mediaDevices: {
        async getUserMedia(options) {
          permissionOptions.push(options);
          return { getTracks: () => [{ stop() { stoppedTracks.push(true); } }] };
        },
      },
    },
  };
  const expandedSnippet = "Regards,\n" + "A".repeat(1800);
  const transcripts = [];
  const session = createDictationSession({
    environment,
    language: "en-GB",
    corrections: [{ from: "my signature", to: expandedSnippet }],
    onTranscript: (value) => transcripts.push(value),
    onMetrics: (value) => metrics.push(value),
  });

  assert.equal((await session.start()).status, "consent_required");
  assert.equal(permissionOptions.length, 0);
  assert.equal((await session.start({ consentGiven: true })).success, true);
  assert.deepEqual(permissionOptions, [{ audio: true }]);
  assert.deepEqual(stoppedTracks, [true]);
  const recognition = recognitions[0];
  assert.equal(recognition.lang, "en-GB");
  assert.equal(recognition.interimResults, false);
  assert.equal(recognition.started, true);
  recognition.onresult({ results: [[{ transcript: "use my signature" }]] });
  assert.deepEqual(transcripts, [`use ${expandedSnippet}`]);

  session.stop();
  recognition.onresult({ results: [[{ transcript: "late private text" }]] });
  assert.equal(recognition.stopped, true);
  assert.deepEqual(transcripts, [`use ${expandedSnippet}`]);
  assert.equal(metrics[0].provider, "browser");
  assert.equal(metrics[0].status, "stopped");
  session.destroy();
});

test("hostile and corrupt vocabulary cannot run getters or overwrite saved settings", () => {
  let reads = 0;
  const hostilePhrase = [];
  Object.defineProperty(hostilePhrase, "0", { enumerable: true, get() { reads += 1; return "private"; } });
  hostilePhrase.length = 1;
  assert.throws(() => normalizeDictationPreferences({ vocabulary: hostilePhrase }), /accessors/);
  assert.equal(reads, 0);

  const storage = new MemoryStorage();
  const scope = "account:vocabulary-corrupt";
  const key = `hey_scoped:${encodeURIComponent(scope)}:hey_dictation_preferences`;
  const corrupt = { version: 2, scope, preferences: { language: "en-US", vocabulary: ["duplicate", "DUPLICATE"] } };
  storage.setItem(key, JSON.stringify(corrupt));
  const store = createDictationPreferenceStore({ storageProvider: () => storage, getScope: () => scope });
  assert.equal(store.load().status, "invalid_store");
  assert.equal(store.save({ language: "fr-FR", corrections: [], snippets: [], vocabulary: [] }).status, "invalid_store");
  assert.equal(storage.getItem(key), JSON.stringify(corrupt));
  assert.throws(() => resolveDictationPreferences({ language: "en-US", applications: [{
    applicationId: "notes.desktop",
    preferences: { vocabulary: ["same", "SAME"] },
  }] }, "notes.desktop"), /unique/);
});
