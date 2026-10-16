import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Download,
  Brain,
  Bot,
  MessageSquareText,
  Menu,
  MessageSquarePlus,
  Mic,
  MicOff,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import { useAuth } from "./AuthContext.jsx";
import {
  askHEY,
  checkHEYAIReadiness,
  getHEYProviderCatalog,
  getHEYConversationMessages,
  listHEYConversations,
} from "./lib/heyAI.js";
import { addMemory } from "./lib/heyMemory.js";
import { useLocale } from "./i18n/LocaleContext.jsx";
import ChatInput from "./components/chat/ChatInput";
import ChatMessage from "./components/chat/ChatMessage";
import FirstRunPurposeSetup from "./components/chat/FirstRunPurposeSetup.jsx";
import { subscribe } from "./core/eventBus.js";
import { getAccountScope, subscribeAccountScope } from "./core/accountScope.js";
import { cancelVoiceCommandPreview, isVoiceCommandCancellation, reviewVoiceCommandPreview, understandVoiceCommand } from "./core/voiceCommandUnderstanding.js";
import { describeSafeComputerActionPreview } from "./core/voiceOSPreview.js";
import {
  createBrowserSpeechProvider,
  createBrowserSpeechSynthesisProvider,
  createVoiceSession,
} from "./lib/voiceProviders.js";
import { createConversationScopedVoiceAsk } from "./lib/voiceConversationContext.js";

const welcomeMessage = {
  role: "hey",
  text: "I am HEY.\n\nYour second brain, creation engine, and intelligence layer.\n\nWhat are we building today?",
};

const suggestions = [
  "Help me plan my day",
  "Analyze my project",
  "Create a business strategy",
  "Explain something difficult",
];

function translatedPreviewAction(label, t) {
  const key = {
    "Open app": "chat.voiceOS.openApp",
    "Navigate browser": "chat.voiceOS.navigateBrowser",
    "Open website": "chat.voiceOS.openWebsite",
  }[label];
  return key ? t(key, label) : label;
}

function translatedPreviewCapability(capability, t) {
  const key = {
    "app.open": "chat.voiceOS.capabilityAppOpen",
    "browser.navigate": "chat.voiceOS.capabilityBrowserNavigate",
    "browser.open_url": "chat.voiceOS.capabilityBrowserOpenUrl",
  }[capability];
  return key ? t(key, capability) : capability;
}

function ChatWorkspace() {
  const { user } = useAuth();
  const { t } = useLocale();
  const draftKey = `hey_draft_${user?.id || 'signed-out'}`;
  const [message, setMessage] = useState(() => { try { return sessionStorage.getItem(draftKey) || ''; } catch { return ''; } });
  const feedEndRef = useRef(null);
  const feedRef = useRef(null);
  const followingRef = useRef(true);
  const [messages, setMessages] = useState([welcomeMessage]);
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const conversationIdRef = useRef(conversationId);
  useLayoutEffect(() => { conversationIdRef.current = conversationId; }, [conversationId]);
  const [conversationSearch, setConversationSearch] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [fusionEnabled, setFusionEnabled] = useState(false);
  const [providerCatalog, setProviderCatalog] = useState({ status: "loading", message: "Checking available model choices…", providers: [], profiles: [{ id: "automatic", label: "Automatic" }] });
  const [providerProfile, setProviderProfile] = useState("automatic");
  const [providerCatalogRetry, setProviderCatalogRetry] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatError, setChatError] = useState("");
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [supabaseStatus, setSupabaseStatus] = useState("checking");
  const [aiReadiness, setAIReadiness] = useState({ status: "checking", message: "Checking the HEY AI endpoint." });
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [copiedMessage, setCopiedMessage] = useState("");
  const [executionStatus, setExecutionStatus] = useState("");
  const [pendingComputerPreview, setPendingComputerPreview] = useState(null);
  const [previewChecking, setPreviewChecking] = useState(false);
  const [previewRefreshActive, setPreviewRefreshActive] = useState(false);
  const pendingComputerPreviewRef = useRef(null);
  const previewRequestInFlightRef = useRef(false);
  const previewRequestControllerRef = useRef(null);
  const skipNextDraftPersistenceRef = useRef(false);
  const activeRequestControllerRef = useRef(null);

  useEffect(() => () => {
    activeRequestControllerRef.current?.abort();
    const previewController = previewRequestControllerRef.current;
    previewRequestControllerRef.current = null;
    previewController?.abort();
  }, []);

  const [mode, setMode] = useState("text");
  const [voiceState, setVoiceState] = useState("idle");
  const [voiceStatus, setVoiceStatus] = useState("Ready");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceResponse, setVoiceResponse] = useState("");
  const voiceSessionRef = useRef(null);
  const askFromVoiceRef = useRef(null);

  useEffect(() => {
    if (skipNextDraftPersistenceRef.current) {
      skipNextDraftPersistenceRef.current = false;
      return;
    }
    try { if (message) sessionStorage.setItem(draftKey, message); else sessionStorage.removeItem(draftKey); } catch { /* Draft remains in memory. */ }
  }, [message, draftKey]);
  useEffect(() => {
    if (followingRef.current) feedEndRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' });
  }, [messages, isSending]);
  function exportConversation() {
    const text = messages.map(item => `## ${item.role === 'user' ? 'You' : 'HEY'}\n\n${item.text}`).join('\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'hey-conversation.md'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function refreshConversations() {
    try {
      setConversations(await listHEYConversations());
      setSupabaseStatus("connected");
    } catch {
      setSupabaseStatus("unavailable");
      setChatError("Your reply was sent, but Supabase could not refresh conversations.");
    }
  }

  useEffect(() => {
    const started = subscribe("execution.request.started", () => setExecutionStatus("Understanding request..."));
    const stepStarted = subscribe("execution.step.started", ({ tool }) => setExecutionStatus(`Running ${tool}...`));
    const permission = subscribe("execution.step.permission_required", () => setExecutionStatus("Waiting for permission..."));
    const failed = subscribe("execution.request.failed", () => setExecutionStatus("Execution stopped."));
    const completed = subscribe("execution.request.completed", () => setExecutionStatus("Verified."));
    return () => [started, stepStarted, permission, failed, completed].forEach((unsubscribe) => unsubscribe());
  }, []);

  useEffect(() => subscribeAccountScope((_previousScope, nextScope) => {
    previewRequestControllerRef.current?.abort();
    previewRequestControllerRef.current = null;
    previewRequestInFlightRef.current = false;
    setPreviewChecking(false);
    const pending = pendingComputerPreviewRef.current;
    if (pending && pending.accountScope !== nextScope) {
      setPreviewRefreshActive(false);
    }
    if (!pending || pending.accountScope === nextScope) return;
    if (!pending.reviewed) cancelVoiceCommandPreview(pending.preview.previewId);
    pendingComputerPreviewRef.current = null;
    setPendingComputerPreview(null);
    setExecutionStatus(t("chat.voiceOS.accountChanged", "The computer preview was cleared because the signed-in account changed. Nothing was run."));
  }), [t]);

  useEffect(() => {
    voiceSessionRef.current = createVoiceSession({
      speechProvider: createBrowserSpeechProvider(window),
      synthesisProvider: createBrowserSpeechSynthesisProvider(window),
      ask: createConversationScopedVoiceAsk({
        ask: (...args) => askFromVoiceRef.current?.(...args),
        getConversationId: () => conversationIdRef.current,
        onConversationId: setConversationId,
      }),
      environment: window,
      onStateChange: ({ state, error, transcript: nextTranscript, answer, ttsUnavailable }) => {
        setVoiceState(state);
        if (error) setVoiceStatus(error);
        if (nextTranscript) setVoiceTranscript(nextTranscript);
        if (answer) {
          setVoiceResponse(answer);
          setMessages((current) => [...current, { role: "user", text: nextTranscript || "" }, { role: "hey", text: answer }]);
          refreshConversations();
        }
        if (ttsUnavailable) setVoiceStatus("Response ready. Speech output is unavailable.");
        else if (!error) setVoiceStatus(String(state).replaceAll("_", " "));
      },
    });
    return () => voiceSessionRef.current?.destroy();
  }, []);

  const visibleConversations = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((item) => item.title?.toLowerCase().includes(query));
  }, [conversationSearch, conversations]);

  useEffect(() => {
    let cancelled = false;
    const healthController = new AbortController();
    checkHEYAIReadiness({ signal: healthController.signal }).then((result) => {
      if (!cancelled) setAIReadiness(result);
    }).catch(() => {
      if (!cancelled) setAIReadiness({ status: "unavailable", message: "HEY AI health check was interrupted." });
    });

    async function loadConversations() {
      setConversationsLoading(true);
      try {
        const items = await listHEYConversations();
        if (cancelled) return;

        setConversations(items);
        setSupabaseStatus("connected");
        if (!items.length) return;

        const latestMessages = await getHEYConversationMessages(items[0].id);
        if (!cancelled) {
          setConversationId(items[0].id);
          setMessages(latestMessages.length ? latestMessages : [welcomeMessage]);
        }
      } catch {
        if (!cancelled) {
          setSupabaseStatus("unavailable");
          setChatError("Supabase could not load your conversations. Check the connection and try again.");
        }
      } finally {
        if (!cancelled) setConversationsLoading(false);
      }
    }

    loadConversations();
    return () => {
      cancelled = true;
      healthController.abort();
    };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    const catalogController = new AbortController();
    setProviderCatalog({ status: "loading", message: "Checking available model choices…", providers: [], profiles: [{ id: "automatic", label: "Automatic" }] });
    getHEYProviderCatalog({ signal: catalogController.signal }).then((catalog) => {
      if (!active) return;
      setProviderCatalog({ ...catalog, status: "ready", message: "Entitled model choices loaded." });
    }).catch((error) => {
      if (active && !catalogController.signal.aborted) {
        const message = error instanceof Error ? error.message : "Available model choices could not be loaded.";
        const status = /sign in|authentication|permission|entitlement|authoriz|enabled remote/i.test(message) ? "permission_required" : "unavailable";
        setProviderCatalog({ status, message, providers: [], profiles: [{ id: "automatic", label: "Automatic" }] });
      }
    });
    return () => {
      active = false;
      catalogController.abort();
    };
  }, [user?.id, providerCatalogRetry]);

  async function retryServiceChecks() {
    setAIReadiness({ status: "checking", message: "Checking the HEY AI endpoint." });
    setSupabaseStatus("checking");
    const [aiResult, conversationResult] = await Promise.allSettled([
      checkHEYAIReadiness(),
      listHEYConversations(),
    ]);
    if (aiResult.status === "fulfilled") setAIReadiness(aiResult.value);
    else setAIReadiness({ status: "unavailable", message: "HEY AI health check could not be completed." });
    if (conversationResult.status === "fulfilled") {
      setSupabaseStatus("connected");
      setConversations(conversationResult.value);
      setChatError((current) => current.startsWith("Supabase could not") ? "" : current);
    } else {
      setSupabaseStatus("unavailable");
      setChatError("Supabase could not load your conversations. Check the connection and try again.");
    }
  }

  async function openConversation(id) {
    if (isSending) return;
    followingRef.current = true;
    try {
      const history = await getHEYConversationMessages(id);
      setConversationId(id);
      setMessages(history.length ? history : [welcomeMessage]);
      setChatError("");
      setHistoryOpen(false);
    } catch {
      setSupabaseStatus("unavailable");
      setChatError("Supabase could not open that conversation. Check the connection and try again.");
    }
  }

  function startNewConversation() {
    if (isSending) return;
    followingRef.current = true;
    setConversationId(null);
    setMessages([welcomeMessage]);
    setMessage("");
    setChatError("");
    setHistoryOpen(false);
    setVoiceTranscript("");
    setVoiceResponse("");
  }

  function insertDictationTranscript(transcript) {
    skipNextDraftPersistenceRef.current = true;
    setMessage((current) => current.trim() ? `${current.trim()} ${transcript}` : transcript);
  }

  const createSafeComputerPreview = useCallback(async (requestText, signal) => {
    const preview = await understandVoiceCommand(requestText, signal ? { signal } : {});
    const summary = describeSafeComputerActionPreview(preview);
    if (!summary) {
      if (preview.previewId) cancelVoiceCommandPreview(preview.previewId);
      return null;
    }
    const expectedScope = user?.id ? `account:${user.id}` : null;
    if (!expectedScope || preview.accountScope !== expectedScope || getAccountScope() !== expectedScope || signal?.aborted) {
      cancelVoiceCommandPreview(preview.previewId);
      return { blocked: true };
    }
    return {
      preview,
      summary,
      message: requestText.trim(),
      accountScope: expectedScope,
      source: "text",
      reviewed: false,
    };
  }, [user]);

  const storeComputerPreview = useCallback((nextPreview) => {
    pendingComputerPreviewRef.current = nextPreview;
    setPendingComputerPreview(nextPreview);
  }, []);

  const cancelPendingComputerPreviewFromCommand = useCallback(() => {
    const hadInFlightPreview = Boolean(previewRequestControllerRef.current);
    previewRequestControllerRef.current?.abort();
    previewRequestControllerRef.current = null;
    previewRequestInFlightRef.current = false;
    setPreviewChecking(false);
    setPreviewRefreshActive(false);
    const pending = pendingComputerPreviewRef.current;
    if (!pending) {
      setExecutionStatus(hadInFlightPreview
        ? t("chat.voiceOS.preparationCancelled", "Preview preparation was cancelled. Nothing was sent or opened.")
        : t("chat.voiceOS.noPendingPreview", "There is no pending computer preview. Nothing was run."));
      return hadInFlightPreview ? "preparation_cancelled" : "none";
    }
    if (pending.accountScope !== getAccountScope() || pending.accountScope !== `account:${user?.id || ""}`) {
      if (!pending.reviewed) cancelVoiceCommandPreview(pending.preview.previewId);
      storeComputerPreview(null);
      setExecutionStatus(t("chat.voiceOS.accountChanged", "The computer preview was cleared because the signed-in account changed. Nothing was run."));
      return "scope_changed";
    }
    if (!pending.reviewed) cancelVoiceCommandPreview(pending.preview.previewId);
    storeComputerPreview(null);
    setExecutionStatus(t("chat.voiceOS.cancelledByCommand", "The pending computer preview was cancelled. Nothing was sent or opened."));
    return "cancelled";
  }, [storeComputerPreview, t, user]);

  function cancelComputerPreviewPreparation() {
    previewRequestControllerRef.current?.abort();
    previewRequestControllerRef.current = null;
    previewRequestInFlightRef.current = false;
    setPreviewChecking(false);
    setPreviewRefreshActive(false);
    setExecutionStatus(t("chat.voiceOS.preparationCancelled", "Preview preparation was cancelled. Nothing was sent or opened."));
  }

  useEffect(() => {
    const pending = pendingComputerPreview;
    if (!pending || pending.reviewed || pending.expired) return undefined;
    const expiresAt = Date.parse(pending.preview.expiresAt);
    if (!Number.isFinite(expiresAt)) return undefined;
    const timeout = window.setTimeout(() => {
      const current = pendingComputerPreviewRef.current;
      if (!current || current.preview.previewId !== pending.preview.previewId || current.reviewed) return;
      if (current.accountScope !== getAccountScope()) {
        storeComputerPreview(null);
        return;
      }
      cancelVoiceCommandPreview(current.preview.previewId);
      storeComputerPreview({ ...current, expired: true });
      setExecutionStatus(t("chat.voiceOS.expiredRefresh", "This preview expired. Refresh it to review a new preview; nothing was run."));
    }, Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [pendingComputerPreview, storeComputerPreview, t]);

  const askFromVoice = useCallback(async (text, { signal, conversationId: activeConversationId, onConversationId } = {}) => {
    if (signal?.aborted) return t("chat.voiceOS.cancelled", "Computer preview cancelled. Nothing was sent or opened.");
    if (isVoiceCommandCancellation(text)) {
      const result = cancelPendingComputerPreviewFromCommand();
      if (result === "cancelled") return t("chat.voiceOS.cancelledByCommand", "The pending computer preview was cancelled. Nothing was sent or opened.");
      if (result === "preparation_cancelled") return t("chat.voiceOS.preparationCancelled", "Preview preparation was cancelled. Nothing was sent or opened.");
      if (result === "scope_changed") return t("chat.voiceOS.accountChanged", "The computer preview was cleared because the signed-in account changed. Nothing was run.");
      return t("chat.voiceOS.noPendingPreview", "There is no pending computer preview. Nothing was run.");
    }
    const nextPreview = await createSafeComputerPreview(text, signal);
    if (signal?.aborted) return t("chat.voiceOS.cancelled", "Computer preview cancelled. Nothing was sent or opened.");
    if (nextPreview?.blocked) return t("chat.voiceOS.accountRequiredVoice", "Sign in to the current account before reviewing a computer action. Nothing was run.");
    if (nextPreview) {
      storeComputerPreview({ ...nextPreview, source: "voice" });
      setExecutionStatus(t("chat.voiceOS.previewOnly", "Preview only. Nothing has been sent to the device."));
      const action = translatedPreviewAction(nextPreview.summary.label, t);
      return t("chat.voiceOS.voicePrepared", "I prepared a preview: {action}, {target}. Review it in the chat. Nothing was opened.")
        .replace("{action}", action)
        .replace("{target}", nextPreview.summary.target);
    }
    return askHEY(text, { signal, conversationId: activeConversationId, onConversationId });
  }, [cancelPendingComputerPreviewFromCommand, createSafeComputerPreview, storeComputerPreview, t]);

  useEffect(() => {
    askFromVoiceRef.current = askFromVoice;
  }, [askFromVoice]);

  async function sendUserMessage(userMessage) {
    const trimmedMessage = userMessage.trim();
    if (!trimmedMessage) return;
    if (isVoiceCommandCancellation(trimmedMessage)) {
      setMessage("");
      cancelPendingComputerPreviewFromCommand();
      return;
    }
    if (isSending) return;
    if (previewRequestInFlightRef.current) return;
    const previewController = new AbortController();
    previewRequestControllerRef.current = previewController;
    previewRequestInFlightRef.current = true;
    setPreviewChecking(true);
    let nextPreview;
    try {
      nextPreview = await createSafeComputerPreview(trimmedMessage, previewController.signal);
    } finally {
      if (previewRequestControllerRef.current === previewController) {
        previewRequestControllerRef.current = null;
        previewRequestInFlightRef.current = false;
        setPreviewChecking(false);
      }
    }
    if (previewController.signal.aborted) return;
    if (nextPreview?.blocked) {
      setExecutionStatus(t("chat.voiceOS.accountRequired", "A current signed-in account is required to review this computer action. Nothing was sent or run."));
      return;
    }
    if (nextPreview) {
      const previous = pendingComputerPreviewRef.current;
      if (previous && !previous.reviewed) cancelVoiceCommandPreview(previous.preview.previewId);
      storeComputerPreview(nextPreview);
      setMessage("");
      setExecutionStatus(t("chat.voiceOS.previewOnly", "Preview only. Nothing has been sent to the device."));
      return;
    }
    const requestedFusion = fusionEnabled;
    const requestedProviderProfile = requestedFusion ? "automatic" : providerProfile;
    if (!requestedFusion && requestedProviderProfile !== "automatic") {
      const exactSelection = requestedProviderProfile && typeof requestedProviderProfile === "object";
      const selectionAvailable = providerCatalog.status === "ready" && (exactSelection
        ? providerCatalog.providers.some((provider) => provider.providerId === requestedProviderProfile.providerId && provider.modelId === requestedProviderProfile.modelId)
        : providerCatalog.profiles.some((profile) => profile.id === requestedProviderProfile));
      if (!selectionAvailable) {
        setChatError("Your selected model is no longer available to this account. Choose another option or Automatic before sending.");
        return;
      }
    }
    setFusionEnabled(false);

    setMessages((current) => [...current, { role: "user", text: trimmedMessage }]);
    setMessage("");
    setChatError("");
    setIsSending(true);
    followingRef.current = true;
    const controller = new AbortController();
    activeRequestControllerRef.current = controller;

    try {
      let fusionVerification = null;
      const response = await askHEY(trimmedMessage, {
        conversationId,
        onConversationId: setConversationId,
        fusion: requestedFusion,
        providerProfile: requestedProviderProfile,
        signal: controller.signal,
        onFusionVerification: (verification) => { fusionVerification = verification; },
        onExecutionResult: (execution) => {
          if (execution.status === "permission_required") {
            setExecutionStatus("HEY still requires permission. No device action was completed.");
          } else if (execution.success === false) {
            setExecutionStatus(execution.message || "The device action is unavailable. Nothing was changed.");
          } else if (execution.success === true && execution.verified === true) {
            setExecutionStatus("HEY verified the requested action.");
          }
        },
      });
      if (controller.signal.aborted) return;

      setMessages((current) => [...current, {
        role: "hey",
        text: response,
        ...(fusionVerification ? { verification: fusionVerification } : {}),
      }]);
      await refreshConversations();
    } catch (error) {
      if (error.name === "AbortError") return;
      setChatError(error.message || 'Could not send your message.');
      setMessage(trimmedMessage);
    } finally {
      if (activeRequestControllerRef.current === controller) {
        activeRequestControllerRef.current = null;
        if (!controller.signal.aborted) {
          setIsSending(false);
          window.setTimeout(() => setExecutionStatus(""), 1800);
        }
      }
    }
  }

  function reviewComputerPreview() {
    const pending = pendingComputerPreviewRef.current;
    if (!pending || pending.reviewed || pending.expired) return;
    if (pending.accountScope !== getAccountScope() || pending.accountScope !== `account:${user?.id || ""}`) {
      cancelVoiceCommandPreview(pending.preview.previewId);
      storeComputerPreview(null);
      setExecutionStatus(t("chat.voiceOS.differentAccount", "This preview belongs to a different account. Nothing was run."));
      return;
    }
    const reviewed = reviewVoiceCommandPreview(pending.preview);
    if (!reviewed.success) {
      if (reviewed.status === "preview_expired") {
        storeComputerPreview({ ...pending, expired: true });
        setExecutionStatus(t("chat.voiceOS.expiredRefresh", "This preview expired. Refresh it to review a new preview; nothing was run."));
        return;
      }
      storeComputerPreview(null);
      setExecutionStatus(t("chat.voiceOS.expired", "This preview expired or changed. Create a new preview before proceeding."));
      return;
    }
    storeComputerPreview({ ...pending, reviewed: true, reviewStatus: reviewed.status });
    setExecutionStatus(t("chat.voiceOS.reviewNeedsAuthorization", "Review recorded. A Trust Kernel permit and verified device authorization are still required; nothing was run."));
  }

  async function refreshComputerPreview() {
    const pending = pendingComputerPreviewRef.current;
    if (!pending?.expired || previewRequestInFlightRef.current) return;
    if (pending.accountScope !== getAccountScope() || pending.accountScope !== `account:${user?.id || ""}`) {
      storeComputerPreview(null);
      setExecutionStatus(t("chat.voiceOS.differentAccount", "This preview belongs to a different account. Nothing was run."));
      return;
    }
    const previewController = new AbortController();
    previewRequestControllerRef.current = previewController;
    previewRequestInFlightRef.current = true;
    setPreviewRefreshActive(true);
    setPreviewChecking(true);
    let nextPreview;
    try {
      nextPreview = await createSafeComputerPreview(pending.message, previewController.signal);
    } catch {
      const current = pendingComputerPreviewRef.current;
      if (previewController.signal.aborted) {
        if (current?.preview.previewId === pending.preview.previewId && current.accountScope === getAccountScope()) {
          setExecutionStatus(t("chat.voiceOS.previewRefreshCancelled", "Preview refresh cancelled. The original request is still available; nothing was run."));
        }
      } else if (current?.preview.previewId === pending.preview.previewId) {
        storeComputerPreview(null);
        setMessage(pending.message);
        setExecutionStatus(t("chat.voiceOS.previewRefreshFailed", "A fresh preview could not be created. Your request was restored so you can try again."));
      }
      return;
    } finally {
      if (previewRequestControllerRef.current === previewController) {
        previewRequestControllerRef.current = null;
        previewRequestInFlightRef.current = false;
        setPreviewRefreshActive(false);
        setPreviewChecking(false);
      }
    }
    if (previewController.signal.aborted) {
      if (nextPreview?.preview?.previewId) cancelVoiceCommandPreview(nextPreview.preview.previewId);
      const current = pendingComputerPreviewRef.current;
      if (current?.preview.previewId === pending.preview.previewId && current.accountScope === getAccountScope()) {
        setExecutionStatus(t("chat.voiceOS.previewRefreshCancelled", "Preview refresh cancelled. The original request is still available; nothing was run."));
      }
      return;
    }
    const current = pendingComputerPreviewRef.current;
    if (!current || current.preview.previewId !== pending.preview.previewId || current.accountScope !== getAccountScope()) {
      if (nextPreview?.preview?.previewId) cancelVoiceCommandPreview(nextPreview.preview.previewId);
      return;
    }
    if (!nextPreview || nextPreview.blocked) {
      storeComputerPreview(null);
      setMessage(pending.message);
      setExecutionStatus(t("chat.voiceOS.previewRefreshFailed", "A fresh preview could not be created. Your request was restored so you can try again."));
      return;
    }
    storeComputerPreview({ ...nextPreview, source: pending.source });
    setExecutionStatus(t("chat.voiceOS.previewFreshReady", "A fresh preview is ready. Review it before proceeding; nothing was run."));
  }

  function cancelComputerPreviewRefresh() {
    const controller = previewRequestControllerRef.current;
    if (!controller || controller.signal.aborted) return;
    controller.abort();
    setExecutionStatus(t("chat.voiceOS.previewRefreshCancelled", "Preview refresh cancelled. The original request is still available; nothing was run."));
  }

  function cancelComputerPreview() {
    const pending = pendingComputerPreviewRef.current;
    if (!pending) return;
    previewRequestControllerRef.current?.abort();
    previewRequestControllerRef.current = null;
    previewRequestInFlightRef.current = false;
    setPreviewChecking(false);
    setPreviewRefreshActive(false);
    if (!pending.reviewed) cancelVoiceCommandPreview(pending.preview.previewId);
    storeComputerPreview(null);
    if (pending.source === "text" && !message.trim()) setMessage(pending.message);
    setExecutionStatus(t("chat.voiceOS.cancelled", "Computer preview cancelled. Nothing was sent or opened."));
  }

  function dismissComputerPreview() {
    const pending = pendingComputerPreviewRef.current;
    if (pending && !pending.reviewed) cancelVoiceCommandPreview(pending.preview.previewId);
    storeComputerPreview(null);
  }

  function renderComputerPreview() {
    const refreshing = pendingComputerPreview?.expired && previewRefreshActive;
    const checkingStatus = previewChecking ? (
      <div className="hey-chat-preview-checking" role="status">
        <span>{t("chat.voiceOS.checking", "Checking whether this request can be shown as a safe preview. Nothing has been sent or run.")}</span>
        <button type="button" onClick={refreshing ? cancelComputerPreviewRefresh : cancelComputerPreviewPreparation}>
          {t(refreshing ? "chat.voiceOS.cancelRefresh" : "chat.voiceOS.cancelPreparationAction", refreshing ? "Cancel refresh" : "Cancel check")}
        </button>
      </div>
    ) : null;
    if (!pendingComputerPreview) return checkingStatus;
    const { summary, reviewed, expired } = pendingComputerPreview;
    const actionLabel = translatedPreviewAction(summary.label, t);
    const riskLabel = summary.risk === "High"
      ? t("chat.voiceOS.highRisk", "High")
      : t("chat.voiceOS.mediumRisk", "Medium");
    return (
      <>
      {checkingStatus}
      <section className="hey-computer-preview" aria-label={t("chat.voiceOS.sectionLabel", "Computer action preview")} aria-live="polite">
        <div className="hey-computer-preview-heading">
          <strong>{reviewed ? t("chat.voiceOS.reviewedTitle", "Preview review recorded") : t("chat.voiceOS.title", "Review computer action")}</strong>
          <span>{riskLabel} {t("chat.voiceOS.risk", "risk")}</span>
        </div>
        <dl>
          <div><dt>{t("chat.voiceOS.action", "Action")}</dt><dd>{actionLabel}</dd></div>
          <div><dt>{t("chat.voiceOS.target", "Target")}</dt><dd>{summary.target}</dd></div>
          <div><dt>{t("chat.voiceOS.capability", "Capability")}</dt><dd>{translatedPreviewCapability(summary.capability, t)}</dd></div>
        </dl>
        <p>{t("chat.voiceOS.noAuthority", "Reviewing records your acknowledgment only. It does not authorize or run an action. A Trust Kernel permit and verified device authorization are still required.")}</p>
        {reviewed ? (
          <div className="hey-computer-preview-actions">
            <p role="status">{t("chat.voiceOS.reviewedStatus", "Review recorded. Nothing was run.")}</p>
            <button type="button" onClick={dismissComputerPreview}>{t("chat.voiceOS.dismiss", "Dismiss")}</button>
          </div>
        ) : expired ? (
          <div className="hey-computer-preview-actions">
            <p role="status">{t("chat.voiceOS.expiredNotice", "This preview expired. A fresh preview must be reviewed separately.")}</p>
            <button type="button" className="hey-btn-primary" onClick={refreshComputerPreview}>{t("chat.voiceOS.refreshPreview", "Refresh preview")}</button>
            <button type="button" onClick={cancelComputerPreview}>Cancel preview</button>
          </div>
        ) : (
          <div className="hey-computer-preview-actions">
            <button type="button" className="hey-btn-primary" onClick={reviewComputerPreview}>{t("chat.voiceOS.reviewedAction", "I reviewed this preview")}</button>
            <button type="button" onClick={cancelComputerPreview}>{t("chat.voiceOS.cancelAction", "Cancel preview")}</button>
          </div>
        )}
      </section>
      </>
    );
  }

  async function pinMessage(text) {
    if (!user?.id || pinnedMessages.includes(text)) return;
    const saved = await addMemory(user.id, text, "pinned");
    if (saved) setPinnedMessages((current) => [...current, text]);
  }

  async function retryMessage(index) {
    const previousUserMessage = [...messages.slice(0, index)]
      .reverse()
      .find((item) => item.role === "user");
    if (previousUserMessage) await sendUserMessage(previousUserMessage.text);
  }

  async function copyMessage(text) {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setCopiedMessage(text);
    } catch { setChatError('Could not copy. Select the message text to copy it manually.'); return; }
    window.setTimeout(() => setCopiedMessage(""), 1400);
  }

  async function toggleVoiceCall() {
    if (["listening", "processing", "speaking"].includes(voiceState)) {
      voiceSessionRef.current?.stop();
      return;
    }
    if (mode !== "voice") {
      setMode("voice");
      setVoiceTranscript("");
      setVoiceResponse("");
    }
    const result = await voiceSessionRef.current?.start();
    if (result?.error) setVoiceStatus(result.error);
  }

  function switchToText() {
    voiceSessionRef.current?.stop();
    setMode("text");
  }

  return (
    <motion.div
      className="hey-chat-page"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <aside className={`hey-chat-sidebar ${historyOpen ? "open" : ""}`}>
        <div className="hey-chat-sidebar-top">
          <div>
            <span className="hey-chat-kicker">Your intelligence layer</span>
            <h1>HEY</h1>
          </div>
          <button
            type="button"
            className="hey-chat-icon-button hey-chat-mobile-close"
            onClick={() => setHistoryOpen(false)}
            aria-label="Close conversation history"
          >
            <X size={18} />
          </button>
        </div>

        <button type="button" className="hey-chat-new" onClick={startNewConversation}>
          <MessageSquarePlus size={17} />
          New conversation
          <span>⌘ K</span>
        </button>

        <label className="hey-chat-search">
          <Search size={15} />
          <input
            value={conversationSearch}
            onChange={(event) => setConversationSearch(event.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
          />
        </label>

        <div className="hey-chat-history-heading">
          <span>Recent</span>
          <span>{conversations.length || "—"}</span>
        </div>

        <div className="hey-chat-history-list">
          {conversationsLoading ? (
            <p className="hey-chat-history-empty">Loading conversations...</p>
          ) : (
            visibleConversations.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`hey-chat-history-item ${item.id === conversationId ? "active" : ""}`}
                onClick={() => openConversation(item.id)}
              >
                <MessageSquarePlus size={15} />
                <span>{item.title || "Untitled conversation"}</span>
              </button>
            ))
          )}
          {!conversationsLoading && !visibleConversations.length && (
            <p className="hey-chat-history-empty">Your conversations will appear here.</p>
          )}
        </div>

        <div className="hey-chat-sidebar-footer">
          <div className="hey-chat-core-mark"><Bot size={17} /></div>
          <div>
            <strong>HEY Core</strong>
            <span>{supabaseStatus === "connected" ? "Cloud conversations connected" : supabaseStatus === "checking" ? "Checking cloud conversations" : "Cloud conversations unavailable"}</span>
          </div>
          <span className={`hey-chat-live-dot is-${supabaseStatus}`} />
        </div>
      </aside>

      {historyOpen && (
        <button
          type="button"
          className="hey-chat-drawer-backdrop"
          onClick={() => setHistoryOpen(false)}
          aria-label="Close conversation history"
        />
      )}

      <section className="hey-chat-panel">
        <header className="hey-chat-header">
          <button
            type="button"
            className="hey-chat-icon-button hey-chat-mobile-menu"
            onClick={() => setHistoryOpen(true)}
            aria-label="Open conversation history"
          >
            <Menu size={19} />
          </button>

          <div className="hey-chat-mode-switch" role="tablist" aria-label="HEY mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "text"}
              className={mode === "text" ? "active" : ""}
              onClick={switchToText}
            >
              <MessageSquareText size={14} />
              Text
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "voice"}
              className={mode === "voice" ? "active" : ""}
              onClick={toggleVoiceCall}
            >
              <Mic size={14} />
              Voice
            </button>
          </div>

          <div className="hey-chat-title">
            <span className={`hey-chat-status ${isSending ? "is-active" : `is-${aiReadiness.status}`}`}><span /> {isSending ? "Thinking" : aiReadiness.status === "ready" ? "Backend configured" : "Service check"}</span>
            <h2>{mode === "voice" ? "Voice conversation" : "Personal intelligence"}</h2>
          </div>

          <div className="hey-chat-header-actions">
            <button type="button" className="hey-chat-icon-button" onClick={exportConversation} aria-label="Export conversation" title="Export conversation"><Download size={17} /></button>
            <span className="hey-chat-adaptive"><Brain size={14} /> Adaptive</span>
            <button type="button" className="hey-chat-icon-button" onClick={startNewConversation} aria-label="Start new conversation">
              <Plus size={18} />
            </button>
          </div>
        </header>

        <div className="hey-chat-service-status" aria-label="Service readiness" aria-live="polite">
          <span className={`hey-chat-service-item is-${supabaseStatus}`} data-status={supabaseStatus}>
            <i aria-hidden="true" /> Supabase <strong>{supabaseStatus === "connected" ? "connected" : supabaseStatus === "checking" ? "checking" : "unavailable"}</strong>
          </span>
          <span className={`hey-chat-service-item is-${aiReadiness.status}`} data-status={aiReadiness.status} title={aiReadiness.message}>
            <i aria-hidden="true" /> HEY AI <strong>{aiReadiness.status === "ready" ? "configured" : aiReadiness.status === "checking" ? "checking" : aiReadiness.status === "not_configured" ? "not configured" : "unavailable"}</strong>
          </span>
          <span className="hey-chat-service-explainer">HEY AI status checks backend configuration; provider reachability is confirmed when you send a message.</span>
          {(supabaseStatus !== "connected" || aiReadiness.status !== "ready") && (
            <button type="button" className="hey-chat-service-retry" onClick={retryServiceChecks} disabled={supabaseStatus === "checking" || aiReadiness.status === "checking"}>
              Check again
            </button>
          )}
        </div>

        {mode === "voice" ? (
          <div className="hey-voice-duo">
            <motion.div
              className="hey-voice-orb"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
            >
              <button
                type="button"
                onClick={toggleVoiceCall}
                aria-label={["listening", "processing", "speaking"].includes(voiceState) ? "Stop voice conversation" : "Start voice conversation"}
              >
                {["listening", "processing", "speaking"].includes(voiceState) ? <MicOff size={64} /> : <Mic size={64} />}
              </button>
            </motion.div>

            <div className="hey-voice-copy">
              <span className="hey-voice-kicker">
                <span className={`hey-voice-dot ${voiceState}`} />
                {voiceStatus}
              </span>
              <h2>{voiceState === "listening" ? "Listening..." : voiceState === "processing" ? "Thinking..." : voiceState === "speaking" ? "Speaking... Tap to interrupt." : "Call HEY by voice"}</h2>
              <p>Speech recognition is provided by your browser, whose audio processing and retention rules may vary. The resulting transcript is sent to HEY to generate a reply. Tap the microphone button while active to stop or interrupt.</p>
            </div>

            {renderComputerPreview()}
            {executionStatus && <p className="hey-chat-execution-status" role="status">{executionStatus}</p>}

            {(voiceTranscript || voiceResponse) && (
              <div className="hey-voice-transcript">
                {voiceTranscript && <p className="hey-voice-question">“{voiceTranscript}”</p>}
                {voiceResponse && <p className="hey-voice-answer">{voiceResponse}</p>}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="hey-chat-feed" ref={feedRef} onScroll={() => { const feed = feedRef.current; followingRef.current = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 100; }}>
              {chatError && <div className="hey-chat-error" role="alert">{chatError}</div>}

              <div className="hey-chat-messages">
                <FirstRunPurposeSetup />
                {messages.map((item, index) => (
                  <ChatMessage
                    key={`${item.role}-${item.text}-${index}`}
                    role={item.role}
                    onCopy={() => copyMessage(item.text)}
                    onRetry={() => retryMessage(index)}
                    onPin={() => pinMessage(item.text)}
                    pinned={pinnedMessages.includes(item.text)}
                    copied={copiedMessage === item.text}
                    verification={item.verification}
                  >
                    {item.text}
                  </ChatMessage>
                ))}
                {isSending && (
                  <div className="hey-chat-thinking"><span /><span /><span /> {t("chat.thinking")}</div>
                )}
                <div ref={feedEndRef} />
              </div>
            </div>

            <footer className="hey-chat-composer-area">
              <div className="hey-chat-suggestions">
                {suggestions.map((item) => (
                  <button type="button" key={item} onClick={() => setMessage(item)}>
                    <Sparkles size={13} />
                    {item}
                  </button>
                ))}
              </div>
              {executionStatus && <p className="hey-chat-execution-status" aria-live="polite">{executionStatus}</p>}
              {renderComputerPreview()}
              <ChatInput
                value={message}
                setValue={setMessage}
                onSend={() => sendUserMessage(message)}
                disabled={isSending}
                fusionEnabled={fusionEnabled}
                setFusionEnabled={setFusionEnabled}
                providerCatalog={providerCatalog}
                providerProfile={providerProfile}
                setProviderProfile={setProviderProfile}
                onRetryProviderCatalog={() => setProviderCatalogRetry((current) => current + 1)}
                onVoiceCall={toggleVoiceCall}
                onDictationInsert={insertDictationTranscript}
              />
              <p className="hey-chat-disclaimer">HEY can make mistakes. Check important information.</p>
            </footer>
          </>
        )}
      </section>
    </motion.div>
  );
}

export default function ChatPage() {
  const { user } = useAuth();
  return <ChatWorkspace key={user?.id || 'signed-out'} />;
}
