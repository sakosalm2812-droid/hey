import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAttentionCandidate, isWithinQuietHours } from "../src/core/attentionPolicy.js";
import { presentNotification } from "../src/core/notificationCenter.js";
import { applyDictationCorrections, createDictationSession, createVoiceSession } from "../src/lib/voiceProviders.js";
import { VOICE_STATES } from "../src/core/voiceState.js";
import { ProactiveEngine } from "../src/core/proactiveEngine.js";
import { setAccountScope } from "../src/core/accountScope.js";

test("quiet hours use an explicit IANA timezone and handle overnight windows", () => {
  const beforeQuiet = new Date("2026-10-14T19:00:00.000Z"); // noon in Los Angeles
  const inQuiet = new Date("2026-10-15T08:00:00.000Z"); // 1am in Los Angeles
  assert.equal(isWithinQuietHours(beforeQuiet, { start: "22:00", end: "07:00" }, "America/Los_Angeles"), false);
  assert.equal(isWithinQuietHours(inQuiet, { start: "22:00", end: "07:00" }, "America/Los_Angeles"), true);
  assert.equal(isWithinQuietHours(inQuiet, { start: "22:00", end: "07:00" }, "Not/A-Timezone"), true);
});

test("attention policy suppresses sponsored items and spam, queues focus items, and keeps critical items", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const base = { priority: "normal", confidence: 0.95, expiresAt: "2026-10-15T12:00:00Z" };
  assert.equal(evaluateAttentionCandidate({ ...base, sponsored: true }, { now }).reason, "sponsored_proactivity_forbidden");
  assert.equal(evaluateAttentionCandidate(base, { now, activity: "school" }).decision, "queue");
  assert.equal(evaluateAttentionCandidate({ ...base, priority: "critical" }, { now, activity: "school", dailyCap: 0 }).decision, "surface");
  assert.equal(evaluateAttentionCandidate({ ...base, confidence: 0.2 }, { now }).decision, "ask");
  assert.equal(evaluateAttentionCandidate({ ...base, expiresAt: "2026-10-14T11:59:00Z" }, { now }).reason, "expired");
});

test("attention policy fails closed on malformed expiry, out-of-range scores, and invalid budgets", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const base = { priority: "normal", confidence: 0.95 };
  assert.equal(evaluateAttentionCandidate({ ...base, expiresAt: "not-a-date" }, { now }).reason, "invalid_expiry");
  assert.equal(evaluateAttentionCandidate({ ...base, confidence: 4 }, { now }).decision, "ask");
  assert.equal(evaluateAttentionCandidate({ ...base, interruptionCost: -1 }, { now }).reason, "invalid_interruption_cost");
  assert.equal(evaluateAttentionCandidate(base, { now, dailyCap: "0", suggestionsToday: 0 }).reason, "invalid_policy_context");
  assert.equal(evaluateAttentionCandidate(base, { now, minimumConfidence: 2 }).reason, "invalid_policy_context");
});

test("private notification content is redacted on shared surfaces, including its route and actions", () => {
  const privateItem = { title: "Health detail", body: "Sensitive text", privacy: "sensitive", path: "/private", actions: [{ label: "Open", path: "/private" }] };
  const rendered = presentNotification(privateItem, { sharedSurface: true });
  assert.equal(rendered.redacted, true);
  assert.equal(rendered.body.includes("Sensitive"), false);
  assert.equal(rendered.path, null);
  assert.deepEqual(rendered.actions, []);
  assert.equal(presentNotification(privateItem).body, "Sensitive text");
});

test("voice cancellation aborts in-flight reasoning and never starts stale speech output", async () => {
  let callbacks;
  let resolveAnswer;
  let spoken = 0;
  const session = createVoiceSession({
    speechProvider: { start(value) { callbacks = value; return {}; }, stop() {} },
    synthesisProvider: { speak() { spoken += 1; return Promise.resolve({ success: true }); }, cancel() {} },
    ask: (_text, { signal }) => new Promise((resolve) => {
      resolveAnswer = resolve;
      signal.addEventListener("abort", () => {}, { once: true });
    }),
    environment: { navigator: { onLine: true, mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } } },
  });
  assert.equal((await session.start()).success, true);
  const processing = callbacks.onTranscript("open my notes");
  await Promise.resolve();
  session.stop();
  resolveAnswer("A stale answer");
  await processing;
  assert.equal(spoken, 0);
  assert.equal(session.snapshot().state, VOICE_STATES.idle);
});

test("concurrent voice starts share one provider session; ended sessions cannot restart", async () => {
  let starts = 0;
  const session = createVoiceSession({
    speechProvider: { start() { starts += 1; return {}; }, stop() {} },
    environment: { navigator: { onLine: true, mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } } },
  });
  const [first, second] = await Promise.all([session.start(), session.start()]);
  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(starts, 1);
  session.destroy();
  assert.equal((await session.start()).success, false);
});

test("dictation requires explicit consent and forwards text without invoking a submission path", async () => {
  let callbacks;
  let permissionRequests = 0;
  const transcripts = [];
  const session = createDictationSession({
    speechProvider: { start(value) { callbacks = value; return {}; }, stop() {} },
    environment: { navigator: { onLine: true, mediaDevices: { getUserMedia: async () => { permissionRequests += 1; return { getTracks: () => [] }; } } } },
    onTranscript: (text) => transcripts.push(text),
  });

  assert.equal((await session.start()).status, "consent_required");
  assert.equal(permissionRequests, 0);
  assert.equal((await session.start({ consentGiven: true })).success, true);
  callbacks.onTranscript("  turn this into a note  ");
  assert.deepEqual(transcripts, ["turn this into a note"]);
  session.destroy();
});

test("unsupported dictation fails before asking for microphone permission", async () => {
  let permissionRequests = 0;
  const session = createDictationSession({
    environment: { navigator: { onLine: true, mediaDevices: { getUserMedia: async () => { permissionRequests += 1; return { getTracks: () => [] }; } } } },
  });

  const result = await session.start({ consentGiven: true });
  assert.equal(result.status, VOICE_STATES.error);
  assert.match(result.error, /Speech recognition is unavailable/);
  assert.equal(permissionRequests, 0);
  session.destroy();
});

test("dictation cancellation during permission prompt cannot start recognition or emit stale text", async () => {
  let resolvePermission;
  let recognitionStarts = 0;
  const transcripts = [];
  const session = createDictationSession({
    speechProvider: { start() { recognitionStarts += 1; return {}; }, stop() {} },
    environment: { navigator: { onLine: true, mediaDevices: { getUserMedia: () => new Promise((resolve) => { resolvePermission = resolve; }) } } },
    onTranscript: (text) => transcripts.push(text),
  });

  const starting = session.start({ consentGiven: true });
  await Promise.resolve();
  session.stop();
  resolvePermission({ getTracks: () => [] });
  assert.equal((await starting).status, "cancelled");
  assert.equal(recognitionStarts, 0);
  assert.deepEqual(transcripts, []);
  session.destroy();
});

test("voice cancellation during a pending permission prompt settles and releases any late stream", async () => {
  let resolvePermission;
  let recognitionStarts = 0;
  let trackStops = 0;
  const session = createVoiceSession({
    speechProvider: { start() { recognitionStarts += 1; return {}; }, stop() {} },
    environment: { navigator: { onLine: true, mediaDevices: { getUserMedia: () => new Promise((resolve) => { resolvePermission = resolve; }) } } },
  });

  const starting = session.start();
  await Promise.resolve();
  session.stop();
  const result = await Promise.race([starting, new Promise((resolve) => setTimeout(() => resolve("still_pending"), 100))]);
  assert.notEqual(result, "still_pending");
  assert.equal(result.status, "cancelled");
  resolvePermission({ getTracks: () => [{ stop() { trackStops += 1; } }] });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(trackStops, 1);
  assert.equal(recognitionStarts, 0);
  session.destroy();
});

test("dictation account switch ends the session and suppresses late transcript callbacks", async () => {
  let callbacks;
  let stops = 0;
  const transcripts = [];
  setAccountScope("dictation-account-a");
  const session = createDictationSession({
    speechProvider: { start(value) { callbacks = value; return {}; }, stop() { stops += 1; } },
    environment: { navigator: { onLine: true, mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } } },
    onTranscript: (text) => transcripts.push(text),
  });
  try {
    assert.equal((await session.start({ consentGiven: true })).success, true);
    setAccountScope("dictation-account-b");
    callbacks.onTranscript("private text from prior account");
    assert.equal(stops, 1);
    assert.deepEqual(transcripts, []);
    assert.equal((await session.start({ consentGiven: true })).status, "session_ended");
  } finally {
    session.destroy();
    setAccountScope(null);
  }
});

test("dictation corrections match whole Unicode phrases once and preserve unrelated words", () => {
  const transcript = "  HEY day, heyday is not hey; café first.  ";
  const corrected = applyDictationCorrections(transcript, [
    { from: "hey day", to: "HEY" },
    { from: "hey", to: "hey day" },
    { from: "café", to: "Café" },
  ]);
  assert.equal(corrected, "  HEY, heyday is not hey day; Café first.  ");
});

test("dictation corrections are bounded, unambiguous, and snapshotted for one session", async () => {
  assert.throws(() => applyDictationCorrections("text", new Array(65).fill({ from: "a", to: "b" })), /at most 64/);
  assert.throws(() => applyDictationCorrections("text", [{ from: "same", to: "one" }, { from: " SAME ", to: "two" }]), /unique/);
  assert.throws(() => applyDictationCorrections("text", [{ from: "bad\nphrase", to: "safe" }]), /plain text/);
  assert.throws(() => createDictationSession({ corrections: [{ from: "x", to: "y" }, null] }), /source and replacement/);

  let callbacks;
  const transcripts = [];
  const corrections = [{ from: "acme", to: "ACME" }];
  const session = createDictationSession({
    speechProvider: { start(value) { callbacks = value; return {}; }, stop() {} },
    environment: { navigator: { onLine: true, mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } } },
    corrections,
    onTranscript: (text) => transcripts.push(text),
  });
  corrections[0].to = "other account text";
  assert.equal((await session.start({ consentGiven: true })).success, true);
  callbacks.onTranscript("Send this to Acme.");
  assert.deepEqual(transcripts, ["Send this to ACME."]);
  session.destroy();
});

test("dictation provider outage disables capture and drops late private transcript data", async () => {
  let callbacks;
  const transcripts = [];
  const stateEvents = [];
  const session = createDictationSession({
    speechProvider: { start(value) { callbacks = value; return {}; }, stop() {} },
    environment: { navigator: { onLine: true, mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } } },
    onTranscript: (text) => transcripts.push(text),
    onStateChange: (event) => stateEvents.push(event),
  });
  assert.equal((await session.start({ consentGiven: "true" })).status, "consent_required");
  assert.equal((await session.start({ consentGiven: true })).success, true);
  callbacks.onError("network");
  callbacks.onTranscript("private transcript after provider outage");
  assert.equal(session.snapshot().state, VOICE_STATES.error);
  assert.deepEqual(transcripts, []);
  assert.equal(JSON.stringify(stateEvents).includes("private transcript"), false);
  session.destroy();
});

test("proactive event retries deduplicate, persistence recovers, and unsupported channels never claim delivery", () => {
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  const originalStorage = globalThis.localStorage;
  const local = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key) => local.get(key) ?? null, setItem: (key, value) => local.set(key, value), removeItem: (key) => local.delete(key) },
  });
  setAccountScope("attention-test-account");
  try {
    const engine = new ProactiveEngine({ storage });
    const first = engine.createSignal({ type: "task_overdue", source: "test", payload: { taskId: "t1", taskTitle: "Homework" }, idempotencyKey: "evt-1" });
    const retry = engine.createSignal({ type: "task_overdue", source: "test", payload: { taskId: "t1", taskTitle: "Homework" }, idempotencyKey: "evt-1" });
    assert.equal(first.id, retry.id);
    assert.equal(engine.getSuggestions().length, 1);
    const recovered = new ProactiveEngine({ storage });
    assert.equal(recovered.createSignal({ type: "task_overdue", source: "test", payload: {}, idempotencyKey: "evt-1" }).id, first.id);
    setAccountScope("attention-test-other-account");
    assert.equal(engine.getSuggestions().length, 0);
    setAccountScope("attention-test-account");
    assert.equal(engine.getSuggestions().length, 1);
    const unsupported = engine.createNotification({ type: "watch", title: "Price changed", message: "A price changed", channels: ["push"] });
    assert.equal(unsupported.deliveryState, "blocked_no_channel_adapter");
    assert.equal(unsupported.verified, false);
    const inApp = engine.createNotification({ type: "watch", title: "Reminder", message: "A reminder" });
    assert.equal(inApp.deliveryState, "delivered_in_app");
    assert.equal(inApp.verified, true);
  } finally {
    setAccountScope(null);
    if (originalStorage === undefined) delete globalThis.localStorage;
    else Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalStorage });
  }
});
