import { getAccountScope, subscribeAccountScope } from "../core/accountScope.js";
import { understandVoiceCommand } from "../core/voiceCommandUnderstanding.js";
import { normalizeDictationApplicationId, resolveDictationPreferences } from "./dictationPreferences.js";

const MAX_EDIT_TEXT_LENGTH = 4096;
const MAX_IN_FLIGHT_PROPOSALS = 2;
const DEFAULT_REWRITE_TIMEOUT_MS = 15_000;
const MAX_REWRITE_TIMEOUT_MS = 120_000;
const DEFAULT_TARGET_RESOLUTION_TIMEOUT_MS = 5_000;
const MAX_TARGET_RESOLUTION_TIMEOUT_MS = 30_000;
const TERMINAL_PUNCTUATION = /[.,!?;:…،؛؟۔。？！]+$/u;

function readDataRecord(value, name, allowedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be a plain data object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${name} must be a plain data object.`);
  if (Object.getOwnPropertySymbols(value).length) throw new TypeError(`${name} cannot contain symbols.`);
  const snapshot = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowedKeys.includes(key)) throw new TypeError(`${name} contains an unsupported field.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${name} cannot contain accessors or hidden properties.`);
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function plainText(value, name, { allowLineBreaks = false } = {}) {
  if (typeof value !== "string" || !value.trim() || value.length > MAX_EDIT_TEXT_LENGTH) {
    throw new TypeError(`${name} must be non-empty text within the supported length.`);
  }
  const hasControl = [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint === 0x7f || (codePoint < 0x20 && !(allowLineBreaks && [0x09, 0x0a, 0x0d].includes(codePoint)));
  });
  if (hasControl) throw new TypeError(`${name} cannot contain control characters.`);
  return value.trim();
}

function selectionText(value) {
  if (typeof value !== "string" || value.length > MAX_EDIT_TEXT_LENGTH) {
    throw new TypeError("Source text must be text within the supported length.");
  }
  const hasControl = [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint === 0x7f || (codePoint < 0x20 && ![0x09, 0x0a, 0x0d].includes(codePoint));
  });
  if (hasControl) throw new TypeError("Source text cannot contain control characters.");
  return value;
}

function normalizedPhrase(value, language) {
  try { return value.normalize("NFC").replace(/\s+/gu, " ").trim().toLocaleLowerCase(language); }
  catch { return value.normalize("NFC").replace(/\s+/gu, " ").trim().toLowerCase(); }
}

function matchExplicitSnippet(utterance, snippets, language) {
  const command = utterance.match(/^(?:insert|expand|use\s+snippet)\s+(.+)$/iu);
  if (!command) return null;
  let requested = command[1].trim();
  requested = requested.replace(/^snippet\s+/iu, "");
  const key = normalizedPhrase(requested, language);
  return snippets.find(({ name }) => normalizedPhrase(name, language) === key) || null;
}

function boundedIdentity(value, name, maxLength) {
  try {
    const text = plainText(value, name);
    if (text.length > maxLength) throw new TypeError(`${name} is too long.`);
    return text;
  }
  catch { throw new TypeError(`${name} must be non-empty bounded text.`); }
}

function localizedEditUtterance(utterance, locale) {
  if (punctuationKind(utterance, locale)) return `Edit ${utterance}`;
  const language = locale.split("-")[0].toLowerCase();
  const prefixes = {
    fr: /^(?:modifie|modifier|réécris|reformule|corrige)\s+(.+)$/iu,
    es: /^(?:edita|editar|reescribe|reformula|corrige|revisa)\s+(.+)$/iu,
    ar: /^(?:حرر|عدّل|أعد صياغة|صحح)\s+(.+)$/u,
    fa: /^(?:ویرایش کن|بازنویسی کن|تصحیح کن)\s+(.+)$/u,
    ur: /^(?:ترمیم کرو|دوبارہ لکھو|درست کرو)\s+(.+)$/u,
    zh: /^(?:编辑|改写|修改|润色)\s*(.+)$/u,
    ja: /^(?:編集|書き直して|修正して|推敲して)\s*(.+)$/u,
  };
  const prefix = prefixes[language];
  const match = prefix ? utterance.match(prefix) : null;
  return match ? `Edit ${match[1].trim()}` : utterance;
}

function punctuationKind(instruction, locale) {
  const language = locale.split("-")[0].toLowerCase();
  const aliases = {
    en: { period: ["period", "full stop"], question: ["question mark"], exclamation: ["exclamation mark"], comma: ["comma"] },
    fr: { period: ["point final"], question: ["point d'interrogation", "point d’interrogation"], exclamation: ["point d'exclamation", "point d’exclamation"], comma: ["virgule"] },
    es: { period: ["punto"], question: ["signo de interrogación", "interrogación"], exclamation: ["signo de exclamación", "exclamación"], comma: ["coma"] },
    ar: { period: ["نقطة"], question: ["علامة استفهام"], exclamation: ["علامة تعجب"], comma: ["فاصلة"] },
    fa: { period: ["نقطه"], question: ["علامت سؤال"], exclamation: ["علامت تعجب"], comma: ["ویرگول"] },
    ur: { period: ["فل اسٹاپ", "نقطہ"], question: ["سوالیہ نشان"], exclamation: ["علامت تعجب"], comma: ["کاما"] },
    zh: { period: ["句号"], question: ["问号"], exclamation: ["感叹号"], comma: ["逗号"] },
    ja: { period: ["句点"], question: ["疑問符"], exclamation: ["感嘆符"], comma: ["読点"] },
  };
  const phrases = language === "en"
    ? aliases.en
    : Object.fromEntries(Object.keys(aliases.en).map((kind) => [kind, [...aliases.en[kind], ...(aliases[language]?.[kind] || [])]]));
  let requested = instruction.normalize("NFC").trim().toLowerCase();
  requested = requested
    .replace(/^(?:add|append|insert|put|ajoute|ajouter|agrega|agregar|añade|أضف|اضف|أضِف|اضافه کن|لگاؤ|شامل کرو)\s+|^(?:加上|加|付けて|追加して)\s*/iu, "")
    .replace(/^(?:a|an|the|un|une|le|la|el|una)\s+/iu, "")
    .replace(/\s+(?:at|to)\s+(?:the\s+)?end(?:\s+of\s+(?:it|the\s+text))?$/iu, "");
  for (const [kind, names] of Object.entries(phrases)) {
    if (names.some((name) => requested === name || requested === `a ${name}` || requested === `an ${name}`)) return kind;
  }
  return null;
}

function punctuationFor(kind, locale) {
  const language = locale.split("-")[0].toLowerCase();
  if (kind === "question" && language === "ar") return "؟";
  if (kind === "question" && ["fa", "ur"].includes(language)) return "؟";
  if (kind === "period" && ["fa", "ur"].includes(language)) return "۔";
  if (kind === "comma" && ["ar", "fa", "ur"].includes(language)) return "،";
  if (language === "zh" || language === "ja") {
    return { period: "。", question: "？", exclamation: "！", comma: "，" }[kind];
  }
  return { period: ".", question: "?", exclamation: "!", comma: "," }[kind];
}

function applyPunctuation(text, kind, locale) {
  const body = text.trim().replace(TERMINAL_PUNCTUATION, "").trimEnd();
  const result = `${body}${punctuationFor(kind, locale)}`;
  if (result.length > MAX_EDIT_TEXT_LENGTH) return null;
  return result;
}

function readRewriteMethod(provider) {
  if (!provider || !["object", "function"].includes(typeof provider)) return null;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(provider, "proposeRewrite");
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "function") return null;
    return descriptor.value;
  } catch { return null; }
}

function readProviderText(value) {
  if (typeof value === "string") return plainText(value, "Rewrite proposal");
  const record = readDataRecord(value, "Rewrite provider result", ["text"]);
  return plainText(record.text, "Rewrite proposal");
}

function readCurrentTarget(value) {
  const record = readDataRecord(value, "Current edit target", ["applicationId", "targetId", "selectionDigest", "currentText"]);
  const required = ["applicationId", "targetId", "selectionDigest", "currentText"];
  if (required.some((key) => !Object.hasOwn(record, key)) ||
    typeof record.applicationId !== "string" || typeof record.targetId !== "string" ||
    typeof record.selectionDigest !== "string" || typeof record.currentText !== "string") {
    throw new TypeError("Current edit target is incomplete.");
  }
  return record;
}

/**
 * Create a session-bound, preview-only edit contract. The returned text is
 * released only by the separate confirm call and is never inserted or sent.
 */
export function createDictationEditSession(options = {}) {
  const config = readDataRecord(options, "Dictation edit session options", ["preferences", "applicationId", "rewriteProvider", "rewriteTimeoutMs", "rewriteDisclosure", "resolveCurrentTarget", "targetResolutionTimeoutMs"]);
  const preferences = config.preferences ?? {};
  const applicationId = config.applicationId;
  const rewriteProvider = config.rewriteProvider;
  const rewriteTimeoutMs = config.rewriteTimeoutMs ?? DEFAULT_REWRITE_TIMEOUT_MS;
  const targetResolutionTimeoutMs = config.targetResolutionTimeoutMs ?? DEFAULT_TARGET_RESOLUTION_TIMEOUT_MS;
  const disclosure = config.rewriteDisclosure;
  const resolveCurrentTarget = config.resolveCurrentTarget;
  if (!Number.isSafeInteger(rewriteTimeoutMs) || rewriteTimeoutMs < 1 || rewriteTimeoutMs > MAX_REWRITE_TIMEOUT_MS) {
    throw new TypeError(`rewriteTimeoutMs must be an integer between 1 and ${MAX_REWRITE_TIMEOUT_MS}.`);
  }
  if (!Number.isSafeInteger(targetResolutionTimeoutMs) || targetResolutionTimeoutMs < 1 || targetResolutionTimeoutMs > MAX_TARGET_RESOLUTION_TIMEOUT_MS) {
    throw new TypeError(`targetResolutionTimeoutMs must be an integer between 1 and ${MAX_TARGET_RESOLUTION_TIMEOUT_MS}.`);
  }
  const identity = applicationId === undefined || applicationId === null
    ? null
    : normalizeDictationApplicationId(applicationId);
  const preferenceSnapshot = resolveDictationPreferences(preferences, identity);
  const language = preferenceSnapshot.language;
  const startingScope = getAccountScope();
  const proposals = new WeakMap();
  const controllers = new Set();
  const sessionEndWaiters = new Set();
  const rewrite = readRewriteMethod(rewriteProvider);
  let closed = false;
  let generation = 0;
  let inFlight = 0;

  function isCurrent() { return !closed && getAccountScope() === startingScope; }

  function fail(status, reason) {
    return Object.freeze({ success: false, status, reason });
  }

  function close() {
    if (closed) return;
    closed = true;
    generation += 1;
    controllers.forEach((controller) => controller.abort());
    controllers.clear();
    sessionEndWaiters.forEach((notify) => notify());
    sessionEndWaiters.clear();
    unsubscribe();
  }

  const unsubscribe = subscribeAccountScope(() => {
    if (getAccountScope() !== startingScope) close();
  });

  async function propose(input) {
    if (!isCurrent()) return fail("session_ended", "account_changed");
    if (inFlight >= MAX_IN_FLIGHT_PROPOSALS) return fail("busy", "proposal_limit_reached");
    inFlight += 1;
    try { return await createProposal(input); }
    finally { inFlight -= 1; }
  }

  async function createProposal(input) {
    if (!isCurrent()) return fail("session_ended", "account_changed");
    let request;
    try {
      request = readDataRecord(input, "Dictation edit request", ["sourceText", "utterance", "targetId", "selectionDigest", "rewriteConsent", "cancelSignal"]);
      request.sourceText = selectionText(request.sourceText);
      request.utterance = plainText(request.utterance, "Edit utterance");
      request.targetId = boundedIdentity(request.targetId, "Target ID", 160);
      request.selectionDigest = boundedIdentity(request.selectionDigest, "Selection digest", 256);
      if (request.cancelSignal !== undefined && !(typeof AbortSignal === "function" && request.cancelSignal instanceof AbortSignal)) throw new TypeError("cancelSignal must be an AbortSignal.");
    } catch {
      return fail("invalid_request", "invalid_edit_request");
    }

    const currentGeneration = generation;
    if (request.cancelSignal?.aborted) return fail("cancelled", "rewrite_cancelled_by_user");
    async function resolveTargetSnapshot() {
      if (typeof resolveCurrentTarget !== "function") return { failure: fail("target_verification_unavailable", "current_target_resolver_required") };
      if (typeof AbortController !== "function") return { failure: fail("target_verification_unavailable", "cancellation_unavailable") };
      if (!isCurrent() || currentGeneration !== generation) return { failure: fail("session_ended", "account_changed") };
      if (request.cancelSignal?.aborted) return { failure: fail("cancelled", "rewrite_cancelled_by_user") };

      const controller = new AbortController();
      controllers.add(controller);
      let timeoutId;
      let timedOut = false;
      let cancelled = false;
      let rejectSessionEnd;
      let rejectCancellation;
      const sessionEnded = new Promise((_, reject) => { rejectSessionEnd = reject; });
      const cancellation = new Promise((_, reject) => { rejectCancellation = reject; });
      const notifySessionEnded = () => rejectSessionEnd(new Error("Dictation edit session ended."));
      const cancelResolution = () => {
        cancelled = true;
        controller.abort();
        rejectCancellation(new Error("Target verification cancelled."));
      };
      sessionEndWaiters.add(notifySessionEnded);
      request.cancelSignal?.addEventListener("abort", cancelResolution, { once: true });
      if (request.cancelSignal?.aborted) cancelResolution();
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error("Current target verification timed out."));
        }, targetResolutionTimeoutMs);
      });
      try {
        const target = await Promise.race([
          Promise.resolve().then(() => Reflect.apply(resolveCurrentTarget, undefined, [{ signal: controller.signal }])),
          timeout,
          cancellation,
          sessionEnded,
        ]);
        if (!isCurrent() || currentGeneration !== generation) return { failure: fail("session_ended", "account_changed") };
        if (request.cancelSignal?.aborted) return { failure: fail("cancelled", "rewrite_cancelled_by_user") };
        try { return { target: readCurrentTarget(target) }; }
        catch { return { failure: fail("target_verification_unavailable", "invalid_current_target") }; }
      } catch {
        if (!isCurrent() || currentGeneration !== generation) return { failure: fail("session_ended", "account_changed") };
        if (cancelled || request.cancelSignal?.aborted) return { failure: fail("cancelled", "rewrite_cancelled_by_user") };
        return timedOut
          ? { failure: fail("target_verification_timeout", "current_target_timed_out") }
          : { failure: fail("target_verification_unavailable", "current_target_unavailable") };
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        request.cancelSignal?.removeEventListener("abort", cancelResolution);
        sessionEndWaiters.delete(notifySessionEnded);
        controllers.delete(controller);
      }
    }
    let instruction;
    let intent;
    let proposedText;
    const snippet = matchExplicitSnippet(request.utterance, preferenceSnapshot.snippets, language);
    if (snippet) {
      intent = "snippet";
      instruction = `Insert snippet ${snippet.name}`;
      proposedText = snippet.text;
    } else {
      let classified;
      try {
        classified = await understandVoiceCommand(localizedEditUtterance(request.utterance, language));
      } catch {
        return fail("classification_failed", "voice_intent_unavailable");
      }
      if (!isCurrent() || currentGeneration !== generation) return fail("session_ended", "account_changed");
      if (classified?.type !== "Edit" || classified.status !== "preview_required" || classified.requiresConfirmation !== true) {
        return fail("edit_intent_required", "utterance_is_not_an_edit");
      }
      if (request.cancelSignal?.aborted) return fail("cancelled", "rewrite_cancelled_by_user");

      instruction = plainText(classified.preview?.instruction, "Edit instruction");
      const punctuation = punctuationKind(instruction, language);
      if (punctuation) {
        intent = "punctuation";
        proposedText = applyPunctuation(request.sourceText, punctuation, language);
        if (proposedText === null) return fail("invalid_proposal", "edit_output_too_long");
      } else {
        intent = "rewrite";
        if (!rewrite) return fail("provider_unavailable", "rewrite_provider_unavailable");
        if (typeof AbortController !== "function") return fail("provider_unavailable", "cancellation_unavailable");
        let providerPolicy;
        try {
          providerPolicy = readDataRecord(disclosure, "Rewrite provider disclosure", ["providerId", "providerName", "processingLocation", "retentionSummary", "disclosureVersion"]);
          for (const key of ["providerId", "providerName", "retentionSummary", "disclosureVersion"]) providerPolicy[key] = boundedIdentity(providerPolicy[key], key, 200);
          if (providerPolicy.processingLocation !== "local" && providerPolicy.processingLocation !== "external") throw new Error("invalid processing location");
        } catch { return fail("provider_disclosure_required", "rewrite_provider_disclosure_required"); }
        if (providerPolicy.processingLocation === "external") {
          let consent;
          try { consent = readDataRecord(request.rewriteConsent, "Rewrite consent", ["providerId", "disclosureVersion", "sourceText", "instruction", "applicationId", "targetId", "selectionDigest", "confirmed"]); }
          catch { return fail("consent_required", "external_rewrite_consent_required"); }
          if (consent.confirmed !== true || consent.providerId !== providerPolicy.providerId || consent.disclosureVersion !== providerPolicy.disclosureVersion || consent.sourceText !== request.sourceText || consent.instruction !== request.utterance || consent.applicationId !== identity || consent.targetId !== request.targetId || consent.selectionDigest !== request.selectionDigest) return fail("consent_required", "external_rewrite_consent_mismatch");
          if (typeof resolveCurrentTarget !== "function") return fail("target_verification_unavailable", "current_target_resolver_required");
          const currentResult = await resolveTargetSnapshot();
          if (currentResult.failure) return currentResult.failure;
          const current = currentResult.target;
          if (!current || current.applicationId !== identity || current.targetId !== request.targetId || current.selectionDigest !== request.selectionDigest || current.currentText !== request.sourceText) return fail("stale_proposal", "target_changed_before_provider_dispatch");
        }
        const controller = new AbortController();
        controllers.add(controller);
        let rejectSessionEnd;
        const sessionEnded = new Promise((_, reject) => { rejectSessionEnd = reject; });
        const notifySessionEnded = () => rejectSessionEnd(new Error("Dictation edit session ended."));
        sessionEndWaiters.add(notifySessionEnded);
        let cancelled = false;
        let rejectCancellation;
        const cancellation = new Promise((_, reject) => { rejectCancellation = reject; });
        const cancelRewrite = () => {
          cancelled = true;
          controller.abort();
          rejectCancellation(new Error("Rewrite cancelled by user."));
        };
        request.cancelSignal?.addEventListener("abort", cancelRewrite, { once: true });
        if (request.cancelSignal?.aborted) cancelRewrite();
        const providerInput = Object.freeze({
          text: request.sourceText,
          instruction,
          language,
          applicationId: identity,
          targetId: request.targetId,
          selectionDigest: request.selectionDigest,
          signal: controller.signal,
        });
        let timeoutId;
        let timedOut = false;
        try {
          const rewriteRequest = Promise.resolve(Reflect.apply(rewrite, rewriteProvider, [providerInput]));
          const timeout = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              timedOut = true;
              controller.abort();
              reject(new Error("Rewrite provider timed out."));
            }, rewriteTimeoutMs);
          });
          proposedText = readProviderText(await Promise.race([rewriteRequest, timeout, cancellation, sessionEnded]));
        } catch {
          if (!isCurrent() || currentGeneration !== generation) return fail("session_ended", "account_changed");
          if (cancelled) return fail("cancelled", "rewrite_cancelled_by_user");
          return timedOut
            ? fail("provider_timeout", "rewrite_provider_timed_out")
            : fail("provider_failed", "rewrite_provider_failed");
        } finally {
          if (timeoutId !== undefined) clearTimeout(timeoutId);
          request.cancelSignal?.removeEventListener("abort", cancelRewrite);
          sessionEndWaiters.delete(notifySessionEnded);
          controllers.delete(controller);
        }
        if (!isCurrent() || currentGeneration !== generation) return fail("session_ended", "account_changed");
        if (request.cancelSignal?.aborted) return fail("cancelled", "rewrite_cancelled_by_user");
        if (providerPolicy.processingLocation === "external") {
          const currentResult = await resolveTargetSnapshot();
          if (currentResult.failure) return currentResult.failure;
          const current = currentResult.target;
          if (!current || current.applicationId !== identity || current.targetId !== request.targetId || current.selectionDigest !== request.selectionDigest || current.currentText !== request.sourceText) return fail("stale_proposal", "target_changed_during_provider_request");
        }
      }
    }

    if (!isCurrent()) return fail("session_ended", "account_changed");
    const proposal = Object.freeze({
      kind: "DictationEditProposal",
      schemaVersion: 1,
      status: "preview_required",
      intent,
      instruction,
      sourceText: request.sourceText,
      proposedText,
      language,
      applicationId: identity,
      targetId: request.targetId,
      selectionDigest: request.selectionDigest,
      requiresConfirmation: true,
    });
    proposals.set(proposal, {
      used: false,
      sourceText: request.sourceText,
      proposedText,
      intent,
      targetId: request.targetId,
      selectionDigest: request.selectionDigest,
    });
    return Object.freeze({ success: true, status: "preview_required", proposal });
  }

  function confirm(proposal, input) {
    if (!isCurrent()) return fail("session_ended", "account_changed");
    let confirmation;
    try {
      confirmation = readDataRecord(input, "Dictation edit confirmation", ["confirmed", "currentText", "applicationId", "targetId", "selectionDigest"]);
      if (!["confirmed", "currentText", "applicationId", "targetId", "selectionDigest"].every((key) => Object.hasOwn(confirmation, key))) {
        return fail("invalid_confirmation", "confirmation_context_required");
      }
      if (confirmation.confirmed !== true) return fail("confirmation_required", "explicit_confirmation_required");
      if (typeof confirmation.currentText !== "string") return fail("stale_proposal", "current_text_required");
      const currentIdentity = confirmation.applicationId === undefined || confirmation.applicationId === null
        ? null
        : normalizeDictationApplicationId(confirmation.applicationId);
      if (currentIdentity !== identity) return fail("stale_proposal", "application_changed");
      confirmation.targetId = boundedIdentity(confirmation.targetId, "Target ID", 160);
      confirmation.selectionDigest = boundedIdentity(confirmation.selectionDigest, "Selection digest", 256);
      if (confirmation.currentText.length > MAX_EDIT_TEXT_LENGTH) return fail("stale_proposal", "source_text_changed");
    } catch {
      return fail("invalid_confirmation", "invalid_confirmation_input");
    }
    if (!isCurrent()) return fail("session_ended", "account_changed");

    const saved = proposal && typeof proposal === "object" ? proposals.get(proposal) : null;
    if (!saved) return fail("invalid_proposal", "proposal_not_created_by_this_session");
    if (saved.used) return fail("replay_denied", "proposal_already_confirmed");
    if (confirmation.targetId !== saved.targetId) return fail("stale_proposal", "target_changed");
    if (confirmation.selectionDigest !== saved.selectionDigest) return fail("stale_proposal", "selection_changed");
    if (confirmation.currentText !== saved.sourceText) return fail("stale_proposal", "source_text_changed");
    saved.used = true;
    return Object.freeze({
      success: true,
      status: "confirmed",
      intent: saved.intent,
      text: saved.proposedText,
      inserted: false,
      submitted: false,
    });
  }

  return Object.freeze({
    snapshot: () => Object.freeze({
      language,
      applicationId: identity,
      preferences: preferenceSnapshot,
    }),
    propose,
    confirm,
    destroy: close,
  });
}

export default { createDictationEditSession };
