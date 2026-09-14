import { useLayoutEffect, useRef } from "react";
import { ArrowUp, Mic } from "lucide-react";
import { confirmSound } from "../../lib/heyFeedback";
import { useLocale } from "../../i18n/LocaleContext.jsx";
import VoiceInput from "./VoiceInput.jsx";

export default function ChatInput({
  value,
  setValue,
  onSend,
  disabled = false,
  conversationId = null,
  onSpeaking,
  onVoiceCall,
}) {
  const { t } = useLocale();
  const inputRef = useRef(null);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input) { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 220)}px`; }
  }, [value]);

  function handleVoiceTranscript(transcript) {
    if (transcript) {
      setValue((current) => {
        const trimmed = current.trim();
        return trimmed ? `${trimmed} ${transcript}` : transcript;
      });
    }
  }

  function send() {
    if (disabled || !value.trim()) return;
    if (!disabled) confirmSound();
    onSend();
  }

  return (
    <div className="hey-chat-input-shell">
      <textarea
        ref={inputRef}
        maxLength={8000}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            send();
          }
        }}
        placeholder={t("chat.hint")}
        rows={1}
        disabled={disabled}
        aria-label="Message HEY"
      />
      <div className="hey-chat-input-actions">
        <VoiceInput
          onTranscript={handleVoiceTranscript}
          onSpeaking={onSpeaking}
          disabled={disabled}
          conversationId={conversationId}
        />
        <button
          type="button"
          className="hey-chat-voice-call"
          onClick={onVoiceCall}
          disabled={disabled}
          aria-label="Voice call HEY"
          title="Voice call"
        >
          <Mic size={18} />
        </button>
        <button
          type="button"
          className="hey-chat-send"
          onClick={send}
          disabled={disabled || !value.trim()}
          aria-label="Send message"
          title="Send message"
        >
          <ArrowUp size={18} />
        </button>
      </div>
    </div>
  );
}
