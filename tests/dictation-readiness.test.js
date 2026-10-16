import assert from "node:assert/strict";
import test from "node:test";
import { getDictationReadiness } from "../src/lib/dictationReadiness.js";

test("dictation readiness reports unsupported browsers without querying permissions", async () => {
  let permissionQueries = 0;
  const result = await getDictationReadiness({
    navigator: { permissions: { query: async () => { permissionQueries += 1; return { state: "granted" }; } } },
  });

  assert.deepEqual(result, { supported: false, permission: "unknown" });
  assert.equal(permissionQueries, 0);
});

test("dictation readiness reads permission state without prompting for microphone access", async () => {
  let permissionQueries = 0;
  let microphoneRequests = 0;
  const environment = {
    SpeechRecognition: class SpeechRecognition {},
    navigator: {
      permissions: { query: async ({ name }) => { permissionQueries += 1; assert.equal(name, "microphone"); return { state: "prompt" }; } },
      mediaDevices: { getUserMedia: async () => { microphoneRequests += 1; throw new Error("must not request microphone"); } },
    },
  };

  assert.deepEqual(await getDictationReadiness(environment), { supported: true, permission: "prompt" });
  assert.equal(permissionQueries, 1);
  assert.equal(microphoneRequests, 0);
});

test("dictation readiness preserves granted and denied permission states", async () => {
  for (const permission of ["granted", "denied"]) {
    const environment = {
      SpeechRecognition: class SpeechRecognition {},
      navigator: { permissions: { query: async () => ({ state: permission }) } },
    };
    assert.deepEqual(await getDictationReadiness(environment), { supported: true, permission });
  }
});

test("dictation readiness preserves unknown permission when the browser query fails", async () => {
  const result = await getDictationReadiness({
    webkitSpeechRecognition: class SpeechRecognition {},
    navigator: { permissions: { query: async () => { throw new Error("permission query unavailable"); } } },
  });

  assert.deepEqual(result, { supported: true, permission: "unknown" });
});

test("hostile browser feature access fails closed without evaluating microphone APIs", async () => {
  let microphoneRequests = 0;
  const environment = { navigator: { mediaDevices: { getUserMedia: async () => { microphoneRequests += 1; } } } };
  Object.defineProperty(environment, "SpeechRecognition", { get() { throw new Error("hostile feature getter"); } });

  assert.deepEqual(await getDictationReadiness(environment), { supported: false, permission: "unknown" });
  assert.equal(microphoneRequests, 0);
});
