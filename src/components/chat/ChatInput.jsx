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
  fusionEnabled = false,
  setFusionEnabled,
  providerCatalog = { status: "loading", providers: [], budgetUsd: null },
  providerSelection = null,
  setProviderSelection,
  providerProfile = "automatic",
  setProviderProfile,
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

  const selectedProviderValue = providerSelection
    ? `${providerSelection.providerId}\u001f${providerSelection.modelId}`
    : "";

  return (
    <div className="hey-chat-composer">
      <label className="hey-chat-model-select">
        <span>Routing profile</span>
        <select
          aria-label="Choose a routing profile"
          value={providerProfile}
          disabled={disabled || fusionEnabled || providerCatalog.status !== "configured"}
          onChange={(event) => setProviderProfile?.(event.target.value)}
        >
          {(providerCatalog.profiles || []).map((profile) => (
            <option key={profile.id} value={profile.id}>{profile.label}</option>
          ))}
        </select>
      </label>
      <label className="hey-chat-model-select">
        <span>Model</span>
        <select
          aria-label="Choose a configured model"
          value={selectedProviderValue}
          disabled={disabled || fusionEnabled || providerCatalog.status !== "configured" || providerProfile !== "automatic"}
          onChange={(event) => {
            const provider = providerCatalog.providers.find((item) => `${item.providerId}\u001f${item.modelId}` === event.target.value);
            setProviderSelection?.(provider ? { providerId: provider.providerId, modelId: provider.modelId } : null);
          }}
        >
          <option value="">Automatic</option>
          {providerCatalog.providers.map((provider) => (
            <option key={`${provider.providerId}/${provider.modelId}`} value={`${provider.providerId}\u001f${provider.modelId}`}>
              {provider.providerName} · {provider.modelId} · max ${provider.maxCostUsd}/request
            </option>
          ))}
        </select>
      </label>
      <span className="hey-chat-model-status" aria-live="polite">
        {fusionEnabled
          ? "Fusion uses two server configured models."
          : providerCatalog.status === "loading"
            ? "Loading configured models…"
            : providerCatalog.status === "error"
              ? "The model list is unavailable. Automatic routing remains selected."
            : providerCatalog.status === "permission_required"
              ? "Your account is not entitled to use remote chat providers."
              : providerCatalog.providers.length === 0
                ? "No chat models with a server key, price, and account entitlement are configured."
                : providerProfile === "lower_cost"
                  ? "Lower cost ranks entitled models by configured input plus output token rates; it does not rank quality or speed."
                : `The HEY server enforces a $${providerCatalog.budgetUsd} total request cap.`}
      </span>
      <label className="hey-chat-fusion-opt-in">
        <input
          type="checkbox"
          checked={fusionEnabled}
          onChange={(event) => setFusionEnabled?.(event.target.checked)}
          disabled={disabled}
          aria-label="Use model fusion for this request"
        />
        <span>Use model fusion for this request</span>
      </label>
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
