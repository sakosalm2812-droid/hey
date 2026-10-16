import assert from "node:assert/strict";
import test from "node:test";
import { setAccountScope } from "../src/core/accountScope.js";
import { createDictationSession } from "../src/lib/voiceProviders.js";

function environmentWithPermission(getUserMedia = async () => ({ getTracks: () => [] })) {
  return {
    navigator: { onLine: true, mediaDevices: { getUserMedia } },
  };
}

function createVisibilityDocument(initialState = "visible") {
  let visibilityState = initialState;
  let listener = null;
  return {
    get visibilityState() { return visibilityState; },
    addEventListener(type, callback) { if (type === "visibilitychange") listener = callback; },
    removeEventListener(type, callback) { if (type === "visibilitychange" && listener === callback) listener = null; },
    setVisibility(nextState) { visibilityState = nextState; listener?.(); },
    hasListener() { return listener !== null; },
  };
}

test("dictation reports bounded privacy-safe provider timing and aggregate transcript metrics", async () => {
  let time = 0;
  let callbacks;
  let transcript;
  let metrics;
  const environment = environmentWithPermission(async () => {
    time = 4;
    return { getTracks: () => [] };
  });
  environment.performance = { now: () => time };
  const speechProvider = {
    get kind() { throw new Error("provider metadata must not be read"); },
    start(options) { callbacks = options; time = 10; return {}; },
    stop() {},
  };
  const session = createDictationSession({
    speechProvider,
    environment,
    onTranscript: (value) => { transcript = value; },
    onMetrics: (value) => { metrics = value; },
  });

  assert.equal((await session.start({ consentGiven: true })).success, true);
  callbacks.onTranscript("");
  time = 18;
  callbacks.onTranscript("private transcript words");
  callbacks.onEnd();

  assert.equal(transcript, "private transcript words");
  assert.deepEqual(metrics, {
    schemaVersion: 2,
    provider: "custom",
    status: "ended",
    startupLatencyMs: 10,
    firstTranscriptLatencyMs: 14,
    transcriptCount: 1,
    emptyTranscriptCount: 1,
    durationMs: 18,
    visibilityRecoveryLatencyMs: null,
  });
  assert.equal(Object.isFrozen(metrics), true);
  assert.equal(JSON.stringify(metrics).includes("private transcript words"), false);
  session.destroy();
});

test("permission denial produces a stable failure metric without exposing provider or transcript errors", async () => {
  const reports = [];
  const session = createDictationSession({
    speechProvider: { start() { throw new Error("should not start"); }, stop() {} },
    environment: environmentWithPermission(async () => { throw Object.assign(new Error("sensitive detail"), { name: "NotAllowedError" }); }),
    onMetrics: (value) => reports.push(value),
  });

  const result = await session.start({ consentGiven: true });
  assert.equal(result.success, false);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].provider, "custom");
  assert.equal(reports[0].status, "permission_failed");
  assert.equal(reports[0].visibilityRecoveryLatencyMs, null);
  assert.equal(JSON.stringify(reports).includes("sensitive detail"), false);
  session.destroy();
});

test("permission probe attempts every track and fails closed when release is incomplete", async () => {
  const stopped = [];
  let starts = 0;
  const session = createDictationSession({
    speechProvider: { start() { starts += 1; return {}; }, stop() {} },
    environment: environmentWithPermission(async () => ({
      getTracks: () => [
        { stop() { stopped.push("first"); throw new Error("private track failure"); } },
        { stop() { stopped.push("second"); } },
      ],
    })),
  });

  const result = await session.start({ consentGiven: true });
  assert.equal(result.success, false);
  assert.equal(result.status, "permission_required");
  assert.equal(result.error, "Microphone access could not be released safely.");
  assert.deepEqual(stopped, ["first", "second"]);
  assert.equal(starts, 0);
  session.destroy();
});

test("permission probe fails closed for malformed or unreadable track collections", async () => {
  for (const getTracks of [
    () => { throw new Error("private stream failure"); },
    () => ({ length: 0 }),
  ]) {
    let starts = 0;
    const session = createDictationSession({
      speechProvider: { start() { starts += 1; return {}; }, stop() {} },
      environment: environmentWithPermission(async () => ({ getTracks })),
    });

    const result = await session.start({ consentGiven: true });
    assert.equal(result.success, false);
    assert.equal(result.error, "Microphone access could not be released safely.");
    assert.equal(starts, 0);
    session.destroy();
  }
});

test("recognition errors and throwing metrics consumers cannot disrupt or leak dictation", async () => {
  let callbacks;
  let transcript = "";
  let state = "";
  const session = createDictationSession({
    speechProvider: { start(options) { callbacks = options; return {}; }, stop() {} },
    environment: environmentWithPermission(),
    onTranscript: (value) => { transcript = value; },
    onStateChange: (value) => { state = value.state; },
    onMetrics() { throw new Error("metrics sink failed"); },
  });

  assert.equal((await session.start({ consentGiven: true })).success, true);
  callbacks.onTranscript("safe emitted text");
  assert.doesNotThrow(() => callbacks.onError("private provider diagnostic"));
  assert.equal(transcript, "safe emitted text");
  assert.equal(state, "error");
  session.destroy();
});

test("provider startup failures use a stable status and never return provider diagnostics", async () => {
  const reports = [];
  const session = createDictationSession({
    speechProvider: { start() { throw new Error("private provider endpoint and token"); }, stop() {} },
    environment: environmentWithPermission(),
    onMetrics: (value) => reports.push(value),
  });

  const result = await session.start({ consentGiven: true });
  assert.equal(result.success, false);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].status, "start_failed");
  assert.equal(JSON.stringify(reports).includes("private provider endpoint"), false);
  assert.equal(reports[0].transcriptCount, 0);
  session.destroy();
});

test("per-attempt transcript counters stay capped under excessive provider callbacks", async () => {
  let callbacks;
  let metrics;
  const session = createDictationSession({
    speechProvider: { start(options) { callbacks = options; return {}; }, stop() {} },
    environment: environmentWithPermission(),
    onMetrics: (value) => { metrics = value; },
  });

  assert.equal((await session.start({ consentGiven: true })).success, true);
  for (let index = 0; index < 2500; index += 1) callbacks.onTranscript(index % 2 ? "text" : "");
  callbacks.onEnd();
  assert.equal(metrics.transcriptCount, 1000);
  assert.equal(metrics.emptyTranscriptCount, 1000);
  session.destroy();
});

test("cancellation during permission is reported once and late completion cannot start the provider", async () => {
  let resolvePermission;
  let starts = 0;
  let trackStops = 0;
  const reports = [];
  const session = createDictationSession({
    speechProvider: { start() { starts += 1; return {}; }, stop() {} },
    environment: environmentWithPermission(() => new Promise((resolve) => { resolvePermission = resolve; })),
    onMetrics: (value) => reports.push(value),
  });

  const pending = session.start({ consentGiven: true });
  await Promise.resolve();
  session.stop();
  const cancelled = await Promise.race([pending, new Promise((resolve) => setTimeout(() => resolve("still_pending"), 100))]);
  assert.notEqual(cancelled, "still_pending");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(starts, 0);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].status, "cancelled");
  resolvePermission({ getTracks: () => [{ stop() { trackStops += 1; } }] });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(trackStops, 1);
  assert.equal(starts, 0);
  session.destroy();
});

test("a cancelled permission prompt can be retried without accepting its late stream", async () => {
  const permissionResolvers = [];
  const stoppedStreams = [];
  let starts = 0;
  const session = createDictationSession({
    speechProvider: { start() { starts += 1; return {}; }, stop() {} },
    environment: environmentWithPermission(() => new Promise((resolve) => permissionResolvers.push(resolve))),
  });

  const first = session.start({ consentGiven: true });
  while (permissionResolvers.length < 1) await Promise.resolve();
  session.stop();
  assert.equal((await first).status, "cancelled");

  const second = session.start({ consentGiven: true });
  while (permissionResolvers.length < 2) await Promise.resolve();
  permissionResolvers[1]({ getTracks: () => [{ stop() { stoppedStreams.push("new"); } }] });
  assert.equal((await second).success, true);
  assert.equal(starts, 1);

  permissionResolvers[0]({ getTracks: () => [{ stop() { stoppedStreams.push("late-old"); } }] });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(stoppedStreams, ["new", "late-old"]);
  assert.equal(starts, 1);
  session.destroy();
});

test("oversized recognition results are discarded with bounded diagnostics and a retryable session", async () => {
  const callbacks = [];
  const transcripts = [];
  const metrics = [];
  const states = [];
  let starts = 0;
  let stops = 0;
  const session = createDictationSession({
    speechProvider: {
      start(options) { starts += 1; callbacks.push(options); return { attempt: starts }; },
      stop() { stops += 1; },
    },
    environment: environmentWithPermission(),
    onTranscript: (value) => transcripts.push(value),
    onStateChange: (value) => states.push(value),
    onMetrics: (value) => metrics.push(value),
  });

  assert.equal((await session.start({ consentGiven: true })).success, true);
  const oversizedPrivateResult = `private-recognition-marker:${"x".repeat(8001)}`;
  callbacks[0].onTranscript(oversizedPrivateResult);
  assert.equal(transcripts.length, 0);
  assert.equal(stops, 1);
  assert.equal(states.at(-1).state, "error");
  assert.match(states.at(-1).error, /oversized result.*discarded/i);
  assert.equal(states.at(-1).error.includes("private-recognition-marker"), false);
  assert.equal(metrics[0].status, "oversized_result");
  assert.equal(JSON.stringify(metrics).includes("private-recognition-marker"), false);

  callbacks[0].onTranscript("late result from rejected recognition");
  assert.equal(transcripts.length, 0);
  assert.equal((await session.start({ consentGiven: true })).success, true);
  callbacks[1].onTranscript("safe retry");
  assert.deepEqual(transcripts, ["safe retry"]);
  session.destroy();
});

test("correction expansion is bounded, retryable, and fenced from late callbacks after account switch", async () => {
  setAccountScope("correction-expansion-account-a");
  const callbacks = [];
  const transcripts = [];
  const metrics = [];
  const states = [];
  const session = createDictationSession({
    corrections: [{ from: "x", to: "z".repeat(2000) }],
    speechProvider: { start(options) { callbacks.push(options); return {}; }, stop() {} },
    environment: environmentWithPermission(),
    onTranscript: (value) => transcripts.push(value),
    onMetrics: (value) => metrics.push(value),
    onStateChange: (value) => states.push(value),
  });

  assert.equal((await session.start({ consentGiven: true })).success, true);
  callbacks[0].onTranscript("x x x x x");
  assert.equal(transcripts.length, 0);
  assert.equal(metrics[0].status, "correction_expansion_rejected");
  assert.match(states.at(-1).error, /correction made the result too long.*discarded/i);
  assert.equal(JSON.stringify(metrics).includes("zzzz"), false);
  callbacks[0].onTranscript("late result from rejected provider");
  assert.equal(transcripts.length, 0);

  assert.equal((await session.start({ consentGiven: true })).success, true);
  callbacks[1].onTranscript("safe retry");
  assert.deepEqual(transcripts, ["safe retry"]);
  setAccountScope("correction-expansion-account-b");
  callbacks[1].onTranscript("private late account text");
  assert.deepEqual(transcripts, ["safe retry"]);
  assert.equal(metrics.at(-1).status, "account_changed");
  assert.equal(JSON.stringify(metrics).includes("private late account text"), false);
  session.destroy();
  setAccountScope(null);
});

test("account switches stop dictation and emit only an aggregate terminal metric", async () => {
  setAccountScope("metrics-account-a");
  let callbacks;
  const reports = [];
  const session = createDictationSession({
    speechProvider: { start(options) { callbacks = options; return {}; }, stop() {} },
    environment: environmentWithPermission(),
    onMetrics: (value) => reports.push(value),
  });

  assert.equal((await session.start({ consentGiven: true })).success, true);
  callbacks.onTranscript("account a private text");
  setAccountScope("metrics-account-b");
  callbacks.onTranscript("late account text");
  assert.equal(reports.length, 1);
  assert.equal(reports[0].status, "account_changed");
  assert.equal(reports[0].transcriptCount, 1);
  assert.equal(JSON.stringify(reports).includes("account a private text"), false);
  assert.equal(JSON.stringify(reports).includes("late account text"), false);
  session.destroy();
  setAccountScope(null);
});

test("hiding the document stops recognition, drops late text, and requires fresh consent to resume", async () => {
  const document = createVisibilityDocument();
  const callbacks = [];
  const transcripts = [];
  const metrics = [];
  let starts = 0;
  let stops = 0;
  const environment = environmentWithPermission();
  environment.document = document;
  const session = createDictationSession({
    speechProvider: { start(options) { starts += 1; callbacks.push(options); return {}; }, stop() { stops += 1; } },
    environment,
    onTranscript: (value) => transcripts.push(value),
    onMetrics: (value) => metrics.push(value),
  });

  assert.equal(document.hasListener(), true);
  assert.equal((await session.start({ consentGiven: true })).success, true);
  document.setVisibility("hidden");
  assert.equal(stops, 1);
  assert.equal(metrics[0].status, "visibility_hidden");
  callbacks[0].onTranscript("late hidden-tab transcript");
  assert.deepEqual(transcripts, []);

  document.setVisibility("visible");
  assert.equal(starts, 1);
  assert.equal((await session.start()).status, "consent_required");
  assert.equal((await session.start({ consentGiven: true })).success, true);
  callbacks[1].onTranscript("visible retry");
  assert.deepEqual(transcripts, ["visible retry"]);
  session.destroy();
  assert.equal(document.hasListener(), false);
});

test("visibility interruption and user cancellation stay distinct; successful recovery timing is bounded", async () => {
  const document = createVisibilityDocument();
  const callbacks = [];
  const metrics = [];
  let time = 0;
  const environment = environmentWithPermission();
  environment.document = document;
  environment.performance = { now: () => time };
  const session = createDictationSession({
    speechProvider: { start(options) { callbacks.push(options); return {}; }, stop() {} },
    environment,
    onMetrics: (value) => metrics.push(value),
  });

  assert.equal((await session.start({ consentGiven: true })).success, true);
  time = 25;
  document.setVisibility("hidden");
  assert.equal(metrics[0].status, "visibility_hidden");
  assert.equal(metrics[0].visibilityRecoveryLatencyMs, null);
  callbacks[0].onTranscript("late private result");
  document.setVisibility("visible");
  time = 86_400_100;
  assert.equal((await session.start({ consentGiven: true })).success, true);
  callbacks[1].onEnd();
  assert.equal(metrics[1].status, "ended");
  assert.equal(metrics[1].visibilityRecoveryLatencyMs, 86_400_000);
  assert.equal(JSON.stringify(metrics).includes("late private result"), false);
  session.destroy();

  const cancelledMetrics = [];
  const cancelled = createDictationSession({
    speechProvider: { start() { return {}; }, stop() {} },
    environment: environmentWithPermission(),
    onMetrics: (value) => cancelledMetrics.push(value),
  });
  assert.equal((await cancelled.start({ consentGiven: true })).success, true);
  cancelled.stop();
  assert.equal(cancelledMetrics[0].status, "stopped");
  assert.equal(cancelledMetrics[0].visibilityRecoveryLatencyMs, null);
  cancelled.destroy();
});

test("a hidden page cannot start or finish a pending microphone permission into recognition", async () => {
  const document = createVisibilityDocument("hidden");
  let resolvePermission;
  let permissionRequests = 0;
  let trackStops = 0;
  let starts = 0;
  const environment = environmentWithPermission(() => {
    permissionRequests += 1;
    return new Promise((resolve) => { resolvePermission = resolve; });
  });
  environment.document = document;
  const metrics = [];
  const session = createDictationSession({
    speechProvider: { start() { starts += 1; return {}; }, stop() {} },
    environment,
    onMetrics: (value) => metrics.push(value),
  });

  assert.equal((await session.start({ consentGiven: true })).status, "visibility_hidden");
  assert.equal(permissionRequests, 0);
  document.setVisibility("visible");
  const pending = session.start({ consentGiven: true });
  await Promise.resolve();
  assert.equal(permissionRequests, 1);
  document.setVisibility("hidden");
  resolvePermission({ getTracks: () => [{ stop() { trackStops += 1; } }] });
  assert.equal((await pending).status, "cancelled");
  assert.equal(trackStops, 1);
  assert.equal(starts, 0);
  assert.equal(metrics.at(-1).status, "visibility_hidden");
  assert.equal(metrics.at(-1).visibilityRecoveryLatencyMs, null);
  session.destroy();
});
