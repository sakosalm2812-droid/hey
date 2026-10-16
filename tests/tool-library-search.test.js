import assert from "node:assert/strict";
import test from "node:test";
import { isDictationDiscoveryQuery, searchToolLibraryCatalog } from "../src/lib/toolLibrarySearch.js";

test("Tool Library understands the V3 natural language dictation journey", () => {
  const catalog = [
    { name: "image.create", description: "Generate an image from a prompt", category: "creation", permissions: [], capabilities: [] },
    { name: "hey.dictation", description: "Voice typing with browser speech recognition", category: "input", permissions: ["microphone"], capabilities: [{ capability: "speech_to_text" }] },
  ];

  assert.equal(isDictationDiscoveryQuery("I want to dictate in any app"), true);
  assert.deepEqual(searchToolLibraryCatalog(catalog, "I want to dictate in any app"), [catalog[1]]);
  assert.equal(isDictationDiscoveryQuery("Create a watercolor landscape"), false);
});

test("Tool Library search ranks metadata matches and never fabricates a catalog entry", () => {
  const catalog = [
    { name: "voice.transcription", description: "Convert speech to text", category: "input", permissions: ["microphone"], capabilities: [] },
    { name: "image.create", description: "Generate an image", category: "creation", permissions: [], capabilities: [] },
  ];

  assert.deepEqual(searchToolLibraryCatalog(catalog, "speech to text"), [catalog[0]]);
  assert.deepEqual(searchToolLibraryCatalog([], "I want to dictate in any app"), []);
});

test("Tool Library search does not evaluate hostile catalog accessors", () => {
  let getterCalls = 0;
  const hostile = {};
  Object.defineProperty(hostile, "description", {
    enumerable: true,
    get() { getterCalls += 1; throw new Error("description accessor ran"); },
  });

  assert.deepEqual(searchToolLibraryCatalog([hostile], "speech recognition"), []);
  assert.equal(getterCalls, 0);
});

test("Tool Library search ignores accessor-backed catalog slots and bounds catalog/query work", () => {
  let slotGetterCalls = 0;
  const catalog = [];
  Object.defineProperty(catalog, "0", {
    configurable: true,
    get() { slotGetterCalls += 1; throw new Error("catalog slot accessor ran"); },
  });
  catalog.length = 1;

  assert.deepEqual(searchToolLibraryCatalog(catalog, "speech recognition"), []);
  assert.equal(slotGetterCalls, 0);
  assert.deepEqual(searchToolLibraryCatalog([{ name: "speech recognition" }], "x".repeat(257)), []);
  assert.deepEqual(searchToolLibraryCatalog(Array(257).fill({ name: "speech recognition" }), "speech recognition"), []);
});

test("Tool Library search bounds per-entry metadata and skips accessor-backed metadata slots", () => {
  let metadataGetterCalls = 0;
  const capabilities = [];
  Object.defineProperty(capabilities, "0", {
    configurable: true,
    get() { metadataGetterCalls += 1; throw new Error("metadata accessor ran"); },
  });
  capabilities.length = 1;

  assert.deepEqual(searchToolLibraryCatalog([{ name: "voice", capabilities }], "speech recognition"), []);
  assert.equal(metadataGetterCalls, 0);
  assert.deepEqual(searchToolLibraryCatalog([{ description: "speech recognition", capabilities: Array(65).fill({ capability: "speech recognition" }) }], "speech recognition"), [{ description: "speech recognition", capabilities: Array(65).fill({ capability: "speech recognition" }) }]);
});
