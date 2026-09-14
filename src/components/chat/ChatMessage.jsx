import { motion } from "framer-motion";
import { Check, Copy, Pin, RotateCcw, Sparkles } from "lucide-react";
import MarkdownResponse from './MarkdownResponse.jsx';

export default function ChatMessage({
  role,
  children,
  onCopy,
  onRetry,
  onPin,
  pinned,
  copied,
}) {
  const isUser = role === "user";

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
        <div className="hey-chat-message-actions">
          <button type="button" onClick={onCopy} aria-label="Copy message" title="Copy message">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          {!isUser && (
            <>
              <button type="button" onClick={onRetry} aria-label="Retry response" title="Retry response">
                <RotateCcw size={14} />
              </button>
              <button type="button" onClick={onPin} aria-label="Pin response" title="Pin response" className={pinned ? "active" : ""}>
                <Pin size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </motion.article>
  );
}
