import { motion } from "framer-motion";
import { Check, Copy, Pin, RotateCcw, Sparkles } from "lucide-react";
import { useLocale } from "../../i18n/LocaleContext.jsx";
import MarkdownResponse from './MarkdownResponse.jsx';

export default function ChatMessage({
  role,
  children,
  onCopy,
  onRetry,
  onPin,
  pinned,
  copied,
  verification,
  providerExecutionReceipt,
}) {
  const { t } = useLocale();
  const isUser = role === "user";
  const providerNames = { openai: "OpenAI", openrouter: "OpenRouter", gemini: "Gemini", groq: "Groq" };
  const providerName = (providerId) => providerNames[providerId] || providerId;

  return (
    <motion.article
      className={`hey-chat-message ${isUser ? "user" : "hey"}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="hey-chat-message-avatar">
        {isUser ? "You" : <Sparkles size={15} />}
      </div>
      <div className="hey-chat-message-body">
        <div className="hey-chat-message-label">{isUser ? "You" : "HEY"}</div>
        <div className="hey-chat-message-copy">{isUser ? children : <MarkdownResponse>{children}</MarkdownResponse>}</div>
        {!isUser && verification?.status === "verified" && verification.primary?.providerId && verification.checker?.providerId && (
          <div className="hey-chat-verification" role="status">
            <div>Provider responses agreed for this request · {providerName(verification.primary.providerId)} · {verification.primary.modelId} → {providerName(verification.checker.providerId)} · {verification.checker.modelId}</div>
            <div>This records provider-reported agreement for this prompt and answer. It is not a check against independent sources or a guarantee of factual accuracy.</div>
            <div>This receipt is scoped to the signed-in account session that sent the request.</div>
            {verification.cost && <div>Provider-reported usage: ${verification.cost.providerReportedUsd.toFixed(4)} across {verification.cost.callsMetered} metered call(s) · ${verification.cost.reservedUsd.toFixed(4)} reserved of the ${verification.cost.requestCapUsd.toFixed(2)} request cap. {verification.cost.callsMetered < verification.cost.callsDispatched ? `Usage for ${verification.cost.callsDispatched - verification.cost.callsMetered} interrupted or unmetered call(s) is unknown; final billing is unconfirmed.` : "Final provider billing may differ."}</div>}
            {verification.cost?.fusionElapsedMs !== undefined && <div>Server-side Fusion elapsed: {(verification.cost.fusionElapsedMs / 1000).toFixed(2)} s.</div>}
          </div>
        )}
        {!isUser && providerExecutionReceipt?.status === "provider_response_received" && (
          <div className="hey-chat-provider-receipt" role="status">
            <div>Provider response details · {providerName(providerExecutionReceipt.providerId)} · configured {providerExecutionReceipt.configuredModelId}</div>
            {providerExecutionReceipt.providerReportedModelId && (
              <div>Provider-reported model: {providerExecutionReceipt.providerReportedModelId}</div>
            )}
            {providerExecutionReceipt.providerResponseId && (
              <div>Provider response ID: {providerExecutionReceipt.providerResponseId}</div>
            )}
            <div>Edge round trip: {providerExecutionReceipt.requestTiming.elapsedMs.toLocaleString()} ms · one request, not a model latency benchmark.</div>
            {providerExecutionReceipt.usageStatus === "reported" && providerExecutionReceipt.usage ? (
              <div>Provider-reported usage: {providerExecutionReceipt.usage.inputTokens.toLocaleString()} input + {providerExecutionReceipt.usage.outputTokens.toLocaleString()} output tokens. Final billing may differ.</div>
            ) : (
              <div>Valid provider token counts were unavailable for this response.</div>
            )}
          </div>
        )}
        <div className="hey-chat-message-actions">
          <button type="button" onClick={onCopy} aria-label={t(copied ? "chat.messageActions.copied" : "chat.messageActions.copy")} title={t(copied ? "chat.messageActions.copied" : "chat.messageActions.copy")}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <span className="hey-chat-action-status" role="status" aria-live="polite">{copied ? t("chat.messageActions.copied") : ""}</span>
          {!isUser && (
            <>
              <button type="button" onClick={onRetry} aria-label={t("chat.messageActions.retry")} title={t("chat.messageActions.retry")}>
                <RotateCcw size={14} />
              </button>
              <button type="button" onClick={onPin} aria-label={t(pinned ? "chat.messageActions.pinned" : "chat.messageActions.pin")} title={t(pinned ? "chat.messageActions.pinned" : "chat.messageActions.pin")} className={pinned ? "active" : ""} disabled={pinned}>
                <Pin size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </motion.article>
  );
}
