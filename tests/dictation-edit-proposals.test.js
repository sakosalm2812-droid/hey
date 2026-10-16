import assert from "node:assert/strict";
import test from "node:test";
import HEY, { createDictationEditSession as publicCreateEditSession } from "../src/core/index.js";
import { setAccountScope } from "../src/core/accountScope.js";
import { createDictationEditSession as createSession } from "../src/lib/dictationEditProposals.js";

const TARGET_ID = "notes.composer";
const SELECTION_DIGEST = "sha256:0123456789abcdef";
const proposalInput = (value) => ({ targetId: TARGET_ID, selectionDigest: SELECTION_DIGEST, ...value });
const confirmationInput = (currentText, applicationId = null, extra = {}) => ({
  confirmed: true,
  currentText,
  applicationId,
  targetId: TARGET_ID,
  selectionDigest: SELECTION_DIGEST,
  ...extra,
});
const createDictationEditSession = (options = {}) => createSession({
  rewriteDisclosure: {
    providerId: "test-local-provider",
    providerName: "Test local provider",
    processingLocation: "local",
    retentionSummary: "Processed locally for tests.",
    disclosureVersion: "test-v1",
  },
  ...options,
});

test("external rewrite requires exact consent and checks the current target before and after provider work", async () => {
  setAccountScope("edit-consent-account");
  let currentText = "private draft";
  let providerCalls = 0;
  const disclosure = {
    providerId: "hey-provider",
    providerName: "HEY configured provider",
    processingLocation: "external",
    retentionSummary: "Selected text is sent to the configured provider.",
    disclosureVersion: "rewrite-v1",
  };
  let mutateAfterProvider = false;
  const runtime = createSession({
    applicationId: "hey.chat",
    rewriteDisclosure: disclosure,
    resolveCurrentTarget: async () => ({
      applicationId: "hey.chat", targetId: TARGET_ID, selectionDigest: SELECTION_DIGEST, currentText,
    }),
    rewriteProvider: { proposeRewrite() { providerCalls += 1; if (mutateAfterProvider) currentText = "changed after provider"; return { text: "edited draft" }; } },
  });
  const request = proposalInput({ sourceText: "private draft", utterance: "Rewrite this clearly" });
  assert.equal((await runtime.propose(request)).status, "consent_required");
  assert.equal(providerCalls, 0);
  const consent = {
    providerId: disclosure.providerId,
    disclosureVersion: disclosure.disclosureVersion,
    sourceText: "private draft",
    instruction: "Rewrite this clearly",
    applicationId: "hey.chat",
    targetId: TARGET_ID,
    selectionDigest: SELECTION_DIGEST,
    confirmed: true,
  };
  assert.equal((await runtime.propose({ ...request, rewriteConsent: { ...consent, instruction: "Change the point" } })).status, "consent_required");
  assert.equal(providerCalls, 0);
  currentText = "changed before dispatch";
  assert.equal((await runtime.propose({ ...request, rewriteConsent: consent })).status, "stale_proposal");
  assert.equal(providerCalls, 0);
  currentText = "private draft";
  mutateAfterProvider = true;
  const result = await runtime.propose({ ...request, rewriteConsent: consent });
  assert.equal(result.status, "stale_proposal");
  assert.equal(providerCalls, 1);
  runtime.destroy();
  setAccountScope(null);
});

test("external target verification times out and aborts its resolver without dispatching selected text", async () => {
  setAccountScope("edit-target-timeout-account");
  let resolverSignal;
  let resolveTarget;
  let providerCalls = 0;
  const runtime = createSession({
    applicationId: "hey.chat",
    targetResolutionTimeoutMs: 10,
    rewriteDisclosure: {
      providerId: "hey-provider", providerName: "HEY provider", processingLocation: "external",
      retentionSummary: "Selected text is sent to the configured provider.", disclosureVersion: "test-timeout-v1",
    },
    resolveCurrentTarget({ signal }) {
      resolverSignal = signal;
      return new Promise((resolve) => { resolveTarget = resolve; });
    },
    rewriteProvider: { proposeRewrite() { providerCalls += 1; return { text: "must not run" }; } },
  });
  const result = await runtime.propose(proposalInput({
    sourceText: "private draft", utterance: "Rewrite this clearly",
    rewriteConsent: {
      providerId: "hey-provider", disclosureVersion: "test-timeout-v1", sourceText: "private draft",
      instruction: "Rewrite this clearly", applicationId: "hey.chat", targetId: TARGET_ID,
      selectionDigest: SELECTION_DIGEST, confirmed: true,
    },
  }));
  assert.deepEqual(result, { success: false, status: "target_verification_timeout", reason: "current_target_timed_out" });
  assert.equal(resolverSignal.aborted, true);
  assert.equal(providerCalls, 0);
  resolveTarget({ applicationId: "hey.chat", targetId: TARGET_ID, selectionDigest: SELECTION_DIGEST, currentText: "private draft" });
  runtime.destroy();
  setAccountScope(null);
});

test("cancelling or ending a session during target verification settles immediately and fences late snapshots", async () => {
  for (const ending of ["cancel", "account"]) {
    setAccountScope(`edit-target-${ending}-start`);
    let resolverSignal;
    let resolveTarget;
    let providerCalls = 0;
    const runtime = createSession({
      applicationId: "hey.chat",
      rewriteDisclosure: {
        providerId: "hey-provider", providerName: "HEY provider", processingLocation: "external",
        retentionSummary: "Selected text is sent to the configured provider.", disclosureVersion: `test-${ending}-v1`,
      },
      resolveCurrentTarget({ signal }) {
        resolverSignal = signal;
        return new Promise((resolve) => { resolveTarget = resolve; });
      },
      rewriteProvider: { proposeRewrite() { providerCalls += 1; return { text: "must not run" }; } },
    });
    const cancel = new AbortController();
    const pending = runtime.propose(proposalInput({
      sourceText: "private draft", utterance: "Rewrite this clearly", cancelSignal: cancel.signal,
      rewriteConsent: {
        providerId: "hey-provider", disclosureVersion: `test-${ending}-v1`, sourceText: "private draft",
        instruction: "Rewrite this clearly", applicationId: "hey.chat", targetId: TARGET_ID,
        selectionDigest: SELECTION_DIGEST, confirmed: true,
      },
    }));
    while (!resolveTarget) await Promise.resolve();
    if (ending === "cancel") cancel.abort();
    else setAccountScope("edit-target-account-switched");
    const result = await Promise.race([pending, new Promise((resolve) => setTimeout(() => resolve("still_pending"), 100))]);
    assert.notEqual(result, "still_pending");
    assert.equal(result.status, ending === "cancel" ? "cancelled" : "session_ended");
    assert.equal(resolverSignal.aborted, true);
    resolveTarget({ applicationId: "hey.chat", targetId: TARGET_ID, selectionDigest: SELECTION_DIGEST, currentText: "private draft" });
    assert.equal(providerCalls, 0);
    runtime.destroy();
  }
  setAccountScope(null);
});

test("external target resolver accessors are rejected without executing them or invoking the provider", async () => {
  setAccountScope("edit-target-accessor-account");
  let getterCalls = 0;
  let providerCalls = 0;
  const invalidTarget = { targetId: TARGET_ID, selectionDigest: SELECTION_DIGEST, currentText: "private draft" };
  Object.defineProperty(invalidTarget, "applicationId", { enumerable: true, get() { getterCalls += 1; return "hey.chat"; } });
  const runtime = createSession({
    applicationId: "hey.chat",
    rewriteDisclosure: {
      providerId: "hey-provider", providerName: "HEY provider", processingLocation: "external",
      retentionSummary: "Selected text is sent to the configured provider.", disclosureVersion: "test-accessor-v1",
    },
    resolveCurrentTarget: () => invalidTarget,
    rewriteProvider: { proposeRewrite() { providerCalls += 1; return { text: "must not run" }; } },
  });
  const result = await runtime.propose(proposalInput({
    sourceText: "private draft", utterance: "Rewrite this clearly",
    rewriteConsent: {
      providerId: "hey-provider", disclosureVersion: "test-accessor-v1", sourceText: "private draft",
      instruction: "Rewrite this clearly", applicationId: "hey.chat", targetId: TARGET_ID,
      selectionDigest: SELECTION_DIGEST, confirmed: true,
    },
  }));
  assert.equal(result.status, "target_verification_unavailable");
  assert.equal(getterCalls, 0);
  assert.equal(providerCalls, 0);
  runtime.destroy();
  setAccountScope(null);
});

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

  const result = await runtime.propose(proposalInput({ sourceText: "hello orbit", utterance: "Rewrite this more warmly" }));
  assert.equal(result.status, "preview_required");
  assert.equal(result.proposal.intent, "rewrite");
  assert.equal(result.proposal.requiresConfirmation, true);
  assert.equal(result.proposal.language, "fr-FR");
  assert.equal(result.proposal.applicationId, "notes.app");
  assert.deepEqual(runtime.snapshot().preferences.corrections, [{ from: "orbit", to: "Orbit" }]);
  assert.equal(received[0].language, "fr-FR");
  assert.equal(received[0].applicationId, "notes.app");
  assert.equal(received[0].text, "hello orbit");
  assert.equal(runtime.confirm(result.proposal, { ...confirmationInput("hello orbit", "notes.app"), confirmed: false }).status, "confirmation_required");
  assert.equal(runtime.confirm(result.proposal, confirmationInput("changed", "notes.app")).status, "stale_proposal");

  const confirmed = runtime.confirm(result.proposal, confirmationInput("hello orbit", "notes.app"));
  assert.deepEqual(confirmed, {
    success: true,
    status: "confirmed",
    intent: "rewrite",
    text: "Bonjour, Orbit.",
    inserted: false,
    submitted: false,
  });
  assert.equal(runtime.confirm(result.proposal, confirmationInput("hello orbit", "notes.app")).status, "replay_denied");
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
    const result = await runtime.propose(proposalInput({ sourceText: entry.source, utterance: entry.utterance }));
    assert.equal(result.status, "preview_required", entry.locale);
    assert.equal(result.proposal.intent, "punctuation", entry.locale);
    assert.equal(result.proposal.proposedText, entry.expected, entry.locale);
    assert.equal(result.proposal.language, entry.locale);
    assert.equal(rewriteCalls, 0);
    assert.equal(runtime.confirm(result.proposal, confirmationInput(entry.source, entry.app)).text, entry.expected);
    runtime.destroy();
  }
});

test("non-edit commands and unsupported rewrites fail closed without a proposal", async () => {
  let rewriteCalls = 0;
  const runtime = createDictationEditSession({ rewriteProvider: { proposeRewrite() { rewriteCalls += 1; return { text: "edited" }; } } });
  assert.equal((await runtime.propose(proposalInput({ sourceText: "secret", utterance: "send this message" }))).status, "edit_intent_required");
  assert.equal((await runtime.propose(proposalInput({ sourceText: "secret", utterance: "Rewrite this" }))).status, "preview_required");
  const noProvider = createDictationEditSession();
  assert.equal((await noProvider.propose(proposalInput({ sourceText: "secret", utterance: "Rewrite this" }))).status, "provider_unavailable");
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

  assert.throws(() => createSession(hostileOptions), /accessors/);
  assert.equal(optionReads, 0);
  assert.equal((await runtime.propose(request)).status, "invalid_request");
  assert.equal(requestReads, 0);
  assert.equal((await runtime.propose(proposalInput({ sourceText: "note", utterance: "Rewrite this" }))).status, "provider_failed");
  assert.equal(runtime.confirm({}, confirmationInput("note")).status, "invalid_proposal");
  runtime.destroy();
});

test("confirmation binds current application, source text, session scope, and explicit consent", async () => {
  setAccountScope("edit-account-b");
  const runtime = createDictationEditSession({
    preferences: { language: "en-US" },
    applicationId: "editor.app",
  });
  const proposal = await runtime.propose(proposalInput({ sourceText: "hello", utterance: "add a question mark" }));
  assert.equal(proposal.status, "preview_required");
  assert.equal(runtime.confirm(proposal.proposal, confirmationInput("hello", "other.app")).status, "stale_proposal");
  assert.equal(runtime.confirm(proposal.proposal, { confirmed: true, currentText: "hello" }).status, "invalid_confirmation");
  setAccountScope("edit-account-c");
  assert.equal(runtime.confirm(proposal.proposal, confirmationInput("hello", "editor.app")).status, "session_ended");
  runtime.destroy();
  setAccountScope(null);
});

test("explicit snippet commands return bounded previews and require current target and selection digest", async () => {
  setAccountScope("snippet-edit-account");
  const runtime = createDictationEditSession({
    preferences: {
      language: "en-US",
      snippets: [{ name: "my signature", text: "Thanks,\nAvery" }],
      applications: [{ applicationId: "mail.app", preferences: { snippets: [{ name: "work footer", text: "Regards,\nAvery" }] } }],
    },
    applicationId: "mail.app",
  });
  const request = proposalInput({ sourceText: "selected text", utterance: "insert snippet work footer" });
  const result = await runtime.propose(request);
  assert.equal(result.status, "preview_required");
  assert.equal(result.proposal.intent, "snippet");
  assert.equal(result.proposal.proposedText, "Regards,\nAvery");
  assert.equal(result.proposal.targetId, TARGET_ID);
  assert.equal(result.proposal.selectionDigest, SELECTION_DIGEST);
  assert.equal(runtime.confirm(result.proposal, confirmationInput("selected text", "mail.app", { targetId: "other.target" })).reason, "target_changed");
  assert.equal(runtime.confirm(result.proposal, confirmationInput("selected text", "mail.app", { selectionDigest: "sha256:changed" })).reason, "selection_changed");
  const approved = runtime.confirm(result.proposal, confirmationInput("selected text", "mail.app"));
  assert.equal(approved.text, "Regards,\nAvery");
  assert.equal(approved.inserted, false);
  assert.equal(approved.submitted, false);
  assert.equal(runtime.confirm(result.proposal, confirmationInput("selected text", "mail.app")).reason, "proposal_already_confirmed");
  runtime.destroy();
  setAccountScope(null);
});

test("snippet commands must be explicit and malformed or oversized snippet settings fail closed", async () => {
  const runtime = createDictationEditSession({
    preferences: { language: "en-US", snippets: [{ name: "my address", text: "1 Main Street" }] },
  });
  assert.equal((await runtime.propose(proposalInput({ sourceText: "", utterance: "my address" }))).status, "edit_intent_required");
  const result = await runtime.propose(proposalInput({ sourceText: "", utterance: "expand my address" }));
  assert.equal(result.status, "preview_required");
  assert.equal(result.proposal.proposedText, "1 Main Street");
  assert.equal((await runtime.propose({ ...proposalInput({ sourceText: "", utterance: "expand my address" }), selectionDigest: "d".repeat(257) })).status, "invalid_request");
  assert.throws(() => createDictationEditSession({ preferences: { snippets: [{ name: "home", text: "x".repeat(2001) }] } }), /length/);
  const hostileSnippet = {};
  Object.defineProperty(hostileSnippet, "name", { enumerable: true, get() { throw new Error("getter ran"); } });
  assert.throws(() => createDictationEditSession({ preferences: { snippets: [hostileSnippet] } }), /accessors/);
  runtime.destroy();
});

test("stale target and selection context cannot be confirmed after the proposal was created", async () => {
  const runtime = createDictationEditSession({
    preferences: { language: "en-US", snippets: [{ name: "signature", text: "Regards" }] },
    applicationId: "mail.app",
  });
  const result = await runtime.propose(proposalInput({ sourceText: "body", utterance: "insert signature" }));
  assert.equal(result.status, "preview_required");
  assert.equal(runtime.confirm(result.proposal, confirmationInput("body", "mail.app", { targetId: "different.target" })).status, "stale_proposal");
  assert.equal(runtime.confirm(result.proposal, confirmationInput("body", "mail.app", { selectionDigest: "sha256:different" })).status, "stale_proposal");
  assert.equal(runtime.confirm(result.proposal, confirmationInput("body", "other.app")).status, "stale_proposal");
  runtime.destroy();
});

test("account switches during hostile confirmation inspection fence the old proposal", async () => {
  setAccountScope("edit-confirm-account-a");
  const runtime = createDictationEditSession({
    preferences: { language: "en-US", snippets: [{ name: "signature", text: "Regards" }] },
    applicationId: "mail.app",
  });
  try {
    const result = await runtime.propose(proposalInput({ sourceText: "body", utterance: "insert signature" }));
    assert.equal(result.status, "preview_required");
    const confirmation = new Proxy(confirmationInput("body", "mail.app"), {
      ownKeys(target) {
        setAccountScope("edit-confirm-account-b");
        return Reflect.ownKeys(target);
      },
    });

    assert.deepEqual(runtime.confirm(result.proposal, confirmation), {
      success: false,
      status: "session_ended",
      reason: "account_changed",
    });
  } finally {
    runtime.destroy();
    setAccountScope(null);
  }
});

test("a rewrite result arriving after account change is discarded", async () => {
  setAccountScope("edit-account-d");
  let resolveRewrite;
  let providerSignal;
  const runtime = createDictationEditSession({ rewriteProvider: { proposeRewrite(input) {
    providerSignal = input.signal;
    return new Promise((resolve) => { resolveRewrite = resolve; });
  } } });
  const pending = runtime.propose(proposalInput({ sourceText: "private note", utterance: "Rewrite more clearly" }));
  await Promise.resolve();
  await Promise.resolve();
  setAccountScope("edit-account-e");
  assert.equal(providerSignal.aborted, true);
  resolveRewrite({ text: "rewritten private note" });
  assert.equal((await pending).status, "session_ended");
  runtime.destroy();
  setAccountScope(null);
});

test("account change settles a provider that ignores abort without waiting for its timeout", async () => {
  setAccountScope("edit-account-f");
  let resolveRewrite;
  let providerSignal;
  const runtime = createDictationEditSession({ rewriteTimeoutMs: 5000, rewriteProvider: { proposeRewrite(input) {
    providerSignal = input.signal;
    return new Promise((resolve) => { resolveRewrite = resolve; });
  } } });
  const pending = runtime.propose(proposalInput({ sourceText: "private note", utterance: "Rewrite this clearly" }));
  while (!resolveRewrite) await Promise.resolve();

  setAccountScope("edit-account-g");
  assert.equal(providerSignal.aborted, true);
  const result = await Promise.race([pending, new Promise((resolve) => setTimeout(() => resolve("still_pending"), 100))]);
  assert.equal(result.status, "session_ended");
  resolveRewrite({ text: "late result after sign-out" });
  runtime.destroy();
  setAccountScope(null);
});

test("a stalled rewrite provider is aborted and returns a recoverable timeout without a proposal", async () => {
  let resolveRewrite;
  let providerSignal;
  const runtime = createDictationEditSession({
    rewriteTimeoutMs: 10,
    rewriteProvider: { proposeRewrite(input) {
      providerSignal = input.signal;
      return new Promise((resolve) => { resolveRewrite = resolve; });
    } },
  });
  const result = await runtime.propose(proposalInput({ sourceText: "private draft", utterance: "Rewrite this more clearly" }));

  assert.deepEqual(result, { success: false, status: "provider_timeout", reason: "rewrite_provider_timed_out" });
  assert.equal(providerSignal.aborted, true);
  resolveRewrite({ text: "late rewrite must be discarded" });
  assert.equal(runtime.confirm({}, confirmationInput("private draft")).status, "invalid_proposal");
  runtime.destroy();
  assert.throws(() => createDictationEditSession({ rewriteTimeoutMs: 120_001 }), /rewriteTimeoutMs/);
});

test("a user AbortSignal aborts provider work and late output cannot create a preview", async () => {
  const cancellation = new AbortController();
  let resolveRewrite;
  let providerSignal;
  const runtime = createDictationEditSession({ rewriteProvider: { proposeRewrite(input) {
    providerSignal = input.signal;
    return new Promise((resolve) => { resolveRewrite = resolve; });
  } } });
  const pending = runtime.propose(proposalInput({ sourceText: "private draft", utterance: "Rewrite this clearly", cancelSignal: cancellation.signal }));
  while (!resolveRewrite) await Promise.resolve();
  cancellation.abort();
  const result = await pending;
  assert.deepEqual(result, { success: false, status: "cancelled", reason: "rewrite_cancelled_by_user" });
  assert.equal(providerSignal.aborted, true);
  resolveRewrite({ text: "late result" });
  assert.equal(runtime.confirm(result.proposal, confirmationInput("private draft")).status, "invalid_proposal");
  runtime.destroy();
});

test("pre-aborted rewrite requests never disclose source text to the provider", async () => {
  const cancellation = new AbortController();
  cancellation.abort();
  let calls = 0;
  const runtime = createDictationEditSession({ rewriteProvider: { proposeRewrite() { calls += 1; return { text: "unexpected" }; } } });
  const result = await runtime.propose(proposalInput({ sourceText: "private draft", utterance: "Rewrite this clearly", cancelSignal: cancellation.signal }));
  assert.deepEqual(result, { success: false, status: "cancelled", reason: "rewrite_cancelled_by_user" });
  assert.equal(calls, 0);
  runtime.destroy();
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

  const first = runtime.propose(proposalInput({ sourceText: "a", utterance: "Rewrite first" }));
  const second = runtime.propose(proposalInput({ sourceText: "b", utterance: "Rewrite second" }));
  const third = await runtime.propose(proposalInput({ sourceText: "c", utterance: "Rewrite third" }));
  assert.equal(third.status, "busy");
  await bothStarted;
  releases[0]({ text: "first" });
  releases[1]({ text: "second" });
  assert.equal((await first).status, "preview_required");
  assert.equal((await second).status, "preview_required");
  runtime.destroy();
});

test("canonical HEY voice API exposes the dictation edit session contract", () => {
  assert.equal(publicCreateEditSession, createSession);
  assert.equal(HEY.voice.createDictationEditSession, createSession);
});
