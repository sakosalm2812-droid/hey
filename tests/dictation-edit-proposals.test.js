import assert from "node:assert/strict";
import test from "node:test";
import HEY, { createDictationEditSession as publicCreateEditSession } from "../src/core/index.js";
import { setAccountScope } from "../src/core/accountScope.js";
import { createDictationEditSession } from "../src/lib/dictationEditProposals.js";

test("edit sessions snapshot per-app locale and return a one-use rewrite preview", async () => {
  setAccountScope("edit-account-a");
  const preferences = {
    language: "en-US",
    corrections: [],
    snippets: [],
    applications: [{
      applicationId: "notes.app",
      preferences: { language: "fr-FR", corrections: [{ from: "orbit", to: "Orbit" }] },
    }],
  };
  const received = [];
  const runtime = createDictationEditSession({
    preferences,
    applicationId: "notes.app",
    rewriteProvider: { proposeRewrite(input) { received.push(input); return { text: "Bonjour, Orbit." }; } },
  });
  preferences.applications[0].preferences.language = "ar-IQ";
  preferences.applications[0].preferences.corrections[0].to = "mutated";

  const result = await runtime.propose({ sourceText: "hello orbit", utterance: "Rewrite this more warmly" });
  assert.equal(result.status, "preview_required");
  assert.equal(result.proposal.intent, "rewrite");
  assert.equal(result.proposal.requiresConfirmation, true);
  assert.equal(result.proposal.language, "fr-FR");
  assert.equal(result.proposal.applicationId, "notes.app");
  assert.deepEqual(runtime.snapshot().preferences.corrections, [{ from: "orbit", to: "Orbit" }]);
  assert.equal(received[0].language, "fr-FR");
  assert.equal(received[0].applicationId, "notes.app");
  assert.equal(received[0].text, "hello orbit");
  assert.equal(runtime.confirm(result.proposal, { confirmed: false, currentText: "hello orbit", applicationId: "notes.app" }).status, "confirmation_required");
  assert.equal(runtime.confirm(result.proposal, { confirmed: true, currentText: "changed", applicationId: "notes.app" }).status, "stale_proposal");

  const confirmed = runtime.confirm(result.proposal, { confirmed: true, currentText: "hello orbit", applicationId: "notes.app" });
  assert.deepEqual(confirmed, {
    success: true,
    status: "confirmed",
    intent: "rewrite",
    text: "Bonjour, Orbit.",
    inserted: false,
    submitted: false,
  });
  assert.equal(runtime.confirm(result.proposal, { confirmed: true, currentText: "hello orbit", applicationId: "notes.app" }).status, "replay_denied");
  runtime.destroy();
  setAccountScope(null);
});

test("localized punctuation edits make inert locale-aware previews without invoking a rewrite provider", async () => {
  const cases = [
    { locale: "ja-JP", app: "japanese.app", utterance: "追加して句点", source: "こんにちは", expected: "こんにちは。" },
    { locale: "ar-IQ", app: "arabic.app", utterance: "أضف علامة استفهام", source: "كيف حالك", expected: "كيف حالك؟" },
    { locale: "fr-FR", app: "french.app", utterance: "Ajoute un point final", source: "Bonjour!", expected: "Bonjour." },
  ];
  for (const entry of cases) {
    let rewriteCalls = 0;
    const runtime = createDictationEditSession({
      preferences: { language: "en-US", applications: [{ applicationId: entry.app, preferences: { language: entry.locale } }] },
      applicationId: entry.app,
      rewriteProvider: { proposeRewrite() { rewriteCalls += 1; return { text: "unexpected" }; } },
    });
    const result = await runtime.propose({ sourceText: entry.source, utterance: entry.utterance });
    assert.equal(result.status, "preview_required", entry.locale);
    assert.equal(result.proposal.intent, "punctuation", entry.locale);
    assert.equal(result.proposal.proposedText, entry.expected, entry.locale);
    assert.equal(result.proposal.language, entry.locale);
    assert.equal(rewriteCalls, 0);
    assert.equal(runtime.confirm(result.proposal, { confirmed: true, currentText: entry.source, applicationId: entry.app }).text, entry.expected);
    runtime.destroy();
  }
});

test("non-edit commands and unsupported rewrites fail closed without a proposal", async () => {
  let rewriteCalls = 0;
  const runtime = createDictationEditSession({ rewriteProvider: { proposeRewrite() { rewriteCalls += 1; return { text: "edited" }; } } });
  assert.equal((await runtime.propose({ sourceText: "secret", utterance: "send this message" })).status, "edit_intent_required");
  assert.equal((await runtime.propose({ sourceText: "secret", utterance: "Rewrite this" })).status, "preview_required");
  const noProvider = createDictationEditSession();
  assert.equal((await noProvider.propose({ sourceText: "secret", utterance: "Rewrite this" })).status, "provider_unavailable");
  assert.equal(rewriteCalls, 1);
  runtime.destroy();
  noProvider.destroy();
});

test("hostile request and rewrite provider data are rejected without running getters", async () => {
  let requestReads = 0;
  let optionReads = 0;
  const hostileOptions = {};
  Object.defineProperty(hostileOptions, "preferences", { enumerable: true, get() { optionReads += 1; return {}; } });
  const request = { sourceText: "note" };
  Object.defineProperty(request, "utterance", { enumerable: true, get() { requestReads += 1; return "Rewrite this"; } });
  const runtime = createDictationEditSession({ rewriteProvider: { proposeRewrite() {
    const result = {};
    Object.defineProperty(result, "text", { enumerable: true, get() { throw new Error("getter ran"); } });
    return result;
  } } });

  assert.throws(() => createDictationEditSession(hostileOptions), /accessors/);
  assert.equal(optionReads, 0);
  assert.equal((await runtime.propose(request)).status, "invalid_request");
  assert.equal(requestReads, 0);
  assert.equal((await runtime.propose({ sourceText: "note", utterance: "Rewrite this" })).status, "provider_failed");
  assert.equal(runtime.confirm({}, { confirmed: true, currentText: "note", applicationId: null }).status, "invalid_proposal");
  runtime.destroy();
});

test("confirmation binds current application, source text, session scope, and explicit consent", async () => {
  setAccountScope("edit-account-b");
  const runtime = createDictationEditSession({
    preferences: { language: "en-US" },
    applicationId: "editor.app",
  });
  const proposal = await runtime.propose({ sourceText: "hello", utterance: "add a question mark" });
  assert.equal(proposal.status, "preview_required");
  assert.equal(runtime.confirm(proposal.proposal, { confirmed: true, currentText: "hello", applicationId: "other.app" }).status, "stale_proposal");
  assert.equal(runtime.confirm(proposal.proposal, { confirmed: true, currentText: "hello" }).status, "invalid_confirmation");
  setAccountScope("edit-account-c");
  assert.equal(runtime.confirm(proposal.proposal, { confirmed: true, currentText: "hello", applicationId: "editor.app" }).status, "session_ended");
  runtime.destroy();
  setAccountScope(null);
});

test("a rewrite result arriving after account change is discarded", async () => {
  setAccountScope("edit-account-d");
  let resolveRewrite;
  let providerSignal;
  const runtime = createDictationEditSession({ rewriteProvider: { proposeRewrite(input) {
    providerSignal = input.signal;
    return new Promise((resolve) => { resolveRewrite = resolve; });
  } } });
  const pending = runtime.propose({ sourceText: "private note", utterance: "Rewrite more clearly" });
  await Promise.resolve();
  await Promise.resolve();
  setAccountScope("edit-account-e");
  assert.equal(providerSignal.aborted, true);
  resolveRewrite({ text: "rewritten private note" });
  assert.equal((await pending).status, "session_ended");
  runtime.destroy();
  setAccountScope(null);
});

test("rewrite concurrency is bounded per session", async () => {
  const releases = [];
  let started = 0;
  let resolveBothStarted;
  const bothStarted = new Promise((resolve) => { resolveBothStarted = resolve; });
  const runtime = createDictationEditSession({ rewriteProvider: { proposeRewrite() {
    started += 1;
    if (started === 2) resolveBothStarted();
    return new Promise((resolve) => releases.push(resolve));
  } } });

  const first = runtime.propose({ sourceText: "a", utterance: "Rewrite first" });
  const second = runtime.propose({ sourceText: "b", utterance: "Rewrite second" });
  const third = await runtime.propose({ sourceText: "c", utterance: "Rewrite third" });
  assert.equal(third.status, "busy");
  await bothStarted;
  releases[0]({ text: "first" });
  releases[1]({ text: "second" });
  assert.equal((await first).status, "preview_required");
  assert.equal((await second).status, "preview_required");
  runtime.destroy();
});

test("canonical HEY voice API exposes the dictation edit session contract", () => {
  assert.equal(publicCreateEditSession, createDictationEditSession);
  assert.equal(HEY.voice.createDictationEditSession, createDictationEditSession);
});
