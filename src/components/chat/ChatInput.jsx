import { useLayoutEffect, useRef } from "react";
import { ArrowUp, Mic } from "lucide-react";
import { confirmSound } from "../../lib/heyFeedback";
import { useLocale } from "../../i18n/LocaleContext.jsx";
import { useAuth } from "../../AuthContext.jsx";
import DictationControl from "./DictationControl.jsx";
import DictationEditControl from "./DictationEditControl.jsx";

export default function ChatInput({
  value,
  setValue,
  onSend,
  disabled = false,
  onVoiceCall,
  onDictationInsert,
  fusionEnabled = false,
  setFusionEnabled,
  providerCatalog = { providers: [], profiles: [] },
  providerProfile = "automatic",
  setProviderProfile,
  onRetryProviderCatalog,
}) {
  const { t } = useLocale();
  const { user } = useAuth();
  const providers = providerCatalog.providers || [];
  const profiles = providerCatalog.profiles || [{ id: "automatic", label: "Automatic" }];
  const exactSelection = providerProfile && typeof providerProfile === "object" ? providerProfile : null;
  const selectedExactIndex = exactSelection
    ? providers.findIndex((provider) => provider.providerId === exactSelection.providerId && provider.modelId === exactSelection.modelId)
    : -1;
  const selectedProfileAvailable = exactSelection
    ? selectedExactIndex >= 0
    : profiles.some((profile) => profile.id === providerProfile);
  const routingChoice = exactSelection
    ? selectedExactIndex >= 0 ? `exact:${selectedExactIndex}` : `unavailable:${exactSelection.providerId}:${exactSelection.modelId}`
    : selectedProfileAvailable ? providerProfile : `unavailable:${providerProfile}`;
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
      <label className="hey-chat-provider-profile hey-chat-provider-profile--request">
        <span>Model for this request</span>
        <select
          value={routingChoice}
          onChange={(event) => {
            const choice = event.target.value;
            if (choice.startsWith("exact:")) {
              const provider = providers[Number(choice.slice("exact:".length))];
              if (provider) setProviderProfile?.({ providerId: provider.providerId, modelId: provider.modelId });
            } else if (!choice.startsWith("unavailable:")) setProviderProfile?.(choice);
          }}
          disabled={disabled}
          aria-label="Model for this request"
        >
          {!selectedProfileAvailable && <option value={routingChoice} disabled>Unavailable · {exactSelection ? `${exactSelection.providerId} · ${exactSelection.modelId}` : providerProfile}</option>}
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>{profile.label}</option>
          ))}
          {providers.length > 0 && (
            <optgroup label="Exact entitled models">
              {providers.map((provider, index) => (
                <option key={`${provider.providerId}:${provider.modelId}`} value={`exact:${index}`}>
                  {provider.providerName} · {provider.modelId}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {providerCatalog.status === "loading" && (
        <p className="hey-chat-provider-models" role="status" aria-live="polite">{providerCatalog.message || "Checking available model choices…"}</p>
      )}
      {(providerCatalog.status === "unavailable" || providerCatalog.status === "permission_required") && (
        <div className="hey-chat-provider-catalog-status" role="status" aria-live="polite">
          <p>{providerCatalog.status === "permission_required" ? "Model choices require sign-in and provider permission." : "Model choices are unavailable right now."} {providerCatalog.message} Choose Automatic to use server routing.</p>
          <button type="button" className="hey-chat-provider-retry" onClick={onRetryProviderCatalog} disabled={disabled} aria-label="Retry model discovery">Retry</button>
        </div>
      )}
      {providerCatalog.status === "ready" && !providerCatalog.providers?.length && (
        <p className="hey-chat-provider-models" role="status">No entitled provider models are available. Choose Automatic to use server routing.</p>
      )}
      {providerCatalog.status === "ready" && !selectedProfileAvailable && (
        <p className="hey-chat-provider-models" role="alert">Your selected model is no longer available to this account. Choose another option or Automatic before sending.</p>
      )}
      {fusionEnabled && <p className="hey-chat-provider-models" role="status">Fusion is an independent opt-in and uses its own provider selection. The model choice above applies to standard chat requests.</p>}
      <DictationControl key={user?.id || "signed-out"} onInsert={insertDictation} disabled={disabled} />
      <div className="hey-chat-input-shell">
        <textarea
          ref={inputRef}
          id="hey-chat-message-composer"
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
      <DictationEditControl inputRef={inputRef} setValue={setValue} disabled={disabled} userId={user?.id} />
    </div>
  );
}
