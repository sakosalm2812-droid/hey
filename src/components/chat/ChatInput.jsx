import { useLayoutEffect, useRef } from "react";
import { ArrowUp, Mic } from "lucide-react";
import { confirmSound } from "../../lib/heyFeedback";
import { useLocale } from "../../i18n/LocaleContext.jsx";
import { useAuth } from "../../AuthContext.jsx";
import DictationControl from "./DictationControl.jsx";

export default function ChatInput({
  value,
  setValue,
  onSend,
  disabled = false,
  onVoiceCall,
  onDictationInsert,
}) {
  const { t } = useLocale();
  const { user } = useAuth();
  const inputRef = useRef(null);
  const focusAfterDictationRef = useRef(false);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
      if (focusAfterDictationRef.current) {
        focusAfterDictationRef.current = false;
        input.focus();
        input.setSelectionRange(value.length, value.length);
      }
    }
  }, [value]);

  function send() {
    if (disabled || !value.trim()) return;
    if (!disabled) confirmSound();
    onSend();
  }

  function insertDictation(transcript) {
    focusAfterDictationRef.current = true;
    if (onDictationInsert) {
      onDictationInsert(transcript);
      return;
    }
    setValue((current) => current.trim() ? `${current.trim()} ${transcript}` : transcript);
  }

  return (
    <div className="hey-chat-composer">
      <DictationControl key={user?.id || "signed-out"} onInsert={insertDictation} disabled={disabled} />
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
    </div>
  );
}
