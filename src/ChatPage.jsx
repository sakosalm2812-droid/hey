import { useEffect, useMemo, useRef, useState } from "react";
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
  getHEYConversationMessages,
  listHEYConversations,
} from "./lib/heyAI.js";
import { addMemory } from "./lib/heyMemory.js";
import { useLocale } from "./i18n/LocaleContext.jsx";
import ChatInput from "./components/chat/ChatInput";
import ChatMessage from "./components/chat/ChatMessage";
import { subscribe } from "./core/eventBus.js";
import {
  createBrowserSpeechProvider,
  createBrowserSpeechSynthesisProvider,
  createVoiceSession,
} from "./lib/voiceProviders.js";

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
  const [conversationSearch, setConversationSearch] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatError, setChatError] = useState("");
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [copiedMessage, setCopiedMessage] = useState("");
  const [executionStatus, setExecutionStatus] = useState("");
  const [pendingExecution, setPendingExecution] = useState(null);

  const [mode, setMode] = useState("text");
  const [voiceState, setVoiceState] = useState("idle");
  const [voiceStatus, setVoiceStatus] = useState("Ready");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceResponse, setVoiceResponse] = useState("");
  const voiceSessionRef = useRef(null);

  useEffect(() => {
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
    } catch {
      setChatError("Your reply was sent, but conversations could not refresh.");
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

  useEffect(() => {
    voiceSessionRef.current = createVoiceSession({
      speechProvider: createBrowserSpeechProvider(window),
      synthesisProvider: createBrowserSpeechSynthesisProvider(window),
      ask: askHEY,
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

    async function loadConversations() {
      setConversationsLoading(true);
      try {
        const items = await listHEYConversations();
        if (cancelled) return;

        setConversations(items);
        if (!items.length) return;

        const latestMessages = await getHEYConversationMessages(items[0].id);
        if (!cancelled) {
          setConversationId(items[0].id);
          setMessages(latestMessages.length ? latestMessages : [welcomeMessage]);
        }
      } catch {
        if (!cancelled) setChatError("Could not load your conversations.");
      } finally {
        if (!cancelled) setConversationsLoading(false);
      }
    }

    loadConversations();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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
      setChatError("Could not open that conversation.");
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

  async function sendUserMessage(userMessage, { confirmed = false, displayUserMessage = true } = {}) {
    const trimmedMessage = userMessage.trim();
    if (!trimmedMessage || isSending) return;

    if (displayUserMessage) setMessages((current) => [...current, { role: "user", text: trimmedMessage }]);
    setMessage("");
    setChatError("");
    setIsSending(true);
    followingRef.current = true;

    try {
      const response = await askHEY(trimmedMessage, {
        conversationId,
        onConversationId: setConversationId,
        confirmed,
        onExecutionResult: (execution, originalMessage) => {
          if (execution.status === "permission_required") setPendingExecution({ message: originalMessage });
          else setPendingExecution(null);
        },
      });

      setMessages((current) => [...current, { role: "hey", text: response }]);
      await refreshConversations();
    } catch (error) {
      setChatError(error.message || 'Could not send your message.');
      setMessage(trimmedMessage);
    } finally {
      setIsSending(false);
      window.setTimeout(() => setExecutionStatus(""), 1800);
    }
  }

  async function confirmPendingExecution() {
    if (!pendingExecution) return;
    const request = pendingExecution;
    setPendingExecution(null);
    await sendUserMessage(request.message, { confirmed: true, displayUserMessage: false });
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
    if (voiceState === "listening") {
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
            <span>Conversation available here</span>
          </div>
          <span className="hey-chat-live-dot" />
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
            <span className="hey-chat-status"><span /> {isSending ? "Thinking" : "Ready"}</span>
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
                aria-label={voiceState === "listening" ? "Stop listening" : "Start voice conversation"}
              >
                {voiceState === "listening" ? <MicOff size={64} /> : <Mic size={64} />}
              </button>
            </motion.div>

            <div className="hey-voice-copy">
              <span className="hey-voice-kicker">
                <span className={`hey-voice-dot ${voiceState}`} />
                {voiceStatus}
              </span>
              <h2>{voiceState === "listening" ? "Listening..." : "Call HEY by voice"}</h2>
              <p>Talk to your intelligence the same way you talk to a person. Your transcript is sent to HEY to generate a reply. Speech processing depends on your browser.</p>
            </div>

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
                {messages.map((item, index) => (
                  <ChatMessage
                    key={`${item.role}-${item.text}-${index}`}
                    role={item.role}
                    onCopy={() => copyMessage(item.text)}
                    onRetry={() => retryMessage(index)}
                    onPin={() => pinMessage(item.text)}
                    pinned={pinnedMessages.includes(item.text)}
                    copied={copiedMessage === item.text}
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
              {pendingExecution && (
                <button type="button" className="hey-btn-primary" onClick={confirmPendingExecution} disabled={isSending}>
                  Confirm desktop action
                </button>
              )}
              <ChatInput
                value={message}
                setValue={setMessage}
                onSend={() => sendUserMessage(message)}
                disabled={isSending}
                conversationId={conversationId}
                onVoiceCall={toggleVoiceCall}
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
