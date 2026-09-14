import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Brain,
  Database,
  LogOut,
  Check,
  AlertCircle,
  Languages,
  Save,
  Mic,
  Volume2,
  Shield,
  Zap,
  Moon,
} from "lucide-react";

import { useAuth } from "./AuthContext.jsx";
import { buzz } from "./lib/heyFeedback.js";
import { getSettings, toggleSetting } from "./lib/settingsManager.js";
import { LOCALES, useLocale } from "./i18n/LocaleContext.jsx";
import {
  loadStoredProactiveSettings,
  saveProactiveSettings,
  getNextProactiveWindow,
} from "./lib/proactiveStore.js";
import {
  loadVoiceSettings,
  saveVoiceSettings,
  getTtsVoices,
  pickVoice,
} from "./core/heyVoiceSettings.js";

const aiSettings = [
  "Long-Term Memory",
  "Personalized Intelligence",
  "Voice Activation",
  "Automatic Organization",
  "Proactive Suggestions",
];

const defaultSettings = aiSettings.reduce((acc, setting) => {
  acc[setting] = true;
  return acc;
}, {});

function formatPlan(plan, t) {
  if (!plan) return t("settings.planFree");
  return `${String(plan).charAt(0).toUpperCase()}${String(plan).slice(1)} plan`;
}

function Toggle({ on, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="hey-settings-toggle"
      data-on={on}
    >
      <span />
    </button>
  );
}

export default function SettingsPage() {
  const { user, profile, plan, signOut } = useAuth();
  const { t, locale, setLocale } = useLocale();

  const [enabled, setEnabled] = useState(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [savingSetting, setSavingSetting] = useState("");
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [online, setOnline] = useState(() => navigator.onLine);

  const [proactive, setProactive] = useState(() => {
    const stored = loadStoredProactiveSettings();

    return {
      enabled: true,
      maxSuggestionsPerDay: 3,
      cooldownMinutes: 60,
      minimumPriority: 40,
      allowDuringQuietHours: false,
      allowUrgentDuringQuietHours: true,
      deduplicateByKind: true,
      ...stored,
      quietHours: {
        start: "22:00",
        end: "08:00",
        ...(stored.quietHours || {}),
      },
    };
  });

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const [voiceSettings, setVoiceSettings] = useState(() => loadVoiceSettings());
  const [voices, setVoices] = useState(() => (typeof speechSynthesis !== "undefined" ? getTtsVoices(globalThis) : []));

  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return () => {};
    const refresh = () => setVoices(getTtsVoices(globalThis));
    speechSynthesis.addEventListener("voiceschanged", refresh);
    return () => speechSynthesis.removeEventListener("voiceschanged", refresh);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      if (!user?.id) {
        if (mounted) {
          setEnabled(defaultSettings);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError("");

      try {
        const settings = await getSettings(user.id);

        if (!mounted) return;

        setEnabled({
          ...defaultSettings,
          ...(settings || {}),
        });
      } catch (err) {
        console.error("Failed to load settings:", err);

        if (!mounted) return;

        setEnabled(defaultSettings);
        setError(t("settings.loadFailed"));
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadSettings();

    return () => {
      mounted = false;
    };
  }, [user?.id, t]);

  async function handleToggle(setting) {
    if (!user?.id || savingSetting) return;

    setSavingSetting(setting);
    setError("");
    setSavedMessage("");

    try {
      const updated = await toggleSetting(user.id, setting);

      setEnabled({
        ...defaultSettings,
        ...(updated || {}),
      });

      setSavedMessage(
        t("settings.savedChanges").replace("{setting}", setting)
      );

      window.setTimeout(() => {
        setSavedMessage("");
      }, 2200);
    } catch (err) {
      console.error("Failed to toggle setting:", err);
      setError(t("settings.saveFailed").replace("{setting}", setting));
    } finally {
      setSavingSetting("");
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
    } catch (err) {
      console.error("Failed to sign out:", err);
      setError("Could not sign out. Please try again.");
    }
  }

  const initials = useMemo(() => {
    const source =
      profile?.display_name ||
      profile?.displayName ||
      user?.email ||
      "HEY User";

    return String(source).trim().slice(0, 1).toUpperCase() || "H";
  }, [profile?.display_name, profile?.displayName, user?.email]);

  const displayName =
    profile?.display_name ||
    profile?.displayName ||
    user?.email ||
    "HEY User";

  const planLabel = formatPlan(plan, t);

  function saveProactive() {
    saveProactiveSettings(proactive);
    buzz("light");
    setSavedMessage("Proactive preferences saved.");
    window.setTimeout(() => setSavedMessage(""), 2200);
  }

  function saveVoice() {
    saveVoiceSettings({
      voiceURI: voiceSettings.voiceURI,
      wakePhrase: voiceSettings.wakePhrase.trim(),
      autoListen: voiceSettings.autoListen,
      rate: voiceSettings.rate,
      pitch: voiceSettings.pitch,
    });
    buzz("light");
    setSavedMessage("Voice preferences saved.");
    window.setTimeout(() => setSavedMessage(""), 2200);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="hey-settings-page"
    >
      {error && (
        <div className="hey-settings-banner error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {savedMessage && (
        <div className="hey-settings-banner success" role="status">
          <Check size={16} />
          <span>{savedMessage}</span>
        </div>
      )}

      {isLoading ? (
        <div className="hey-settings-loading">Loading your preferences...</div>
      ) : (
        <div className="hey-settings-layout">

          <section className="hey-settings-profile">
            <div className="hey-settings-avatar" aria-hidden="true">{initials}</div>
            <div className="hey-settings-profile-copy">
              <span className="hey-settings-kicker">{t("settings.kicker")}</span>
              <h1>{displayName}</h1>
              <p>{user?.email || t("settings.unknownAccount")}</p>
              <div className="hey-settings-plan">
                <Zap size={13} />
                {planLabel}
              </div>
            </div>
            <button type="button" className="hey-btn-primary hey-settings-signout" onClick={handleSignOut}>
              <LogOut size={15} />
              <span>{t("settings.signOut")}</span>
            </button>
          </section>

          <section className="hey-settings-card">
            <header className="hey-settings-card-header">
              <Brain size={20} aria-hidden="true" />
              <div>
                <h2>{t("settings.ai")}</h2>
                <p>{t("settings.aiDesc")}</p>
              </div>
            </header>

            <div className="hey-settings-rows">
              {aiSettings.map((setting) => {
                const isEnabled = Boolean(enabled[setting]);

                return (
                  <div className="hey-settings-row" key={setting}>
                    <div>
                      <strong>{setting}</strong>
                      <small>{isEnabled ? t("common.enabled") : t("common.disabled")}</small>
                    </div>
                    <Toggle
                      on={isEnabled}
                      disabled={Boolean(savingSetting)}
                      onChange={() => handleToggle(setting)}
                      label={`Toggle ${setting}`}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <div className="hey-settings-grid">
            <section className="hey-settings-card">
              <header className="hey-settings-card-header">
                <Moon size={20} aria-hidden="true" />
                <div>
                  <h2>Proactive & quiet hours</h2>
                  <p>When HEY may surface suggestions for tasks and focus.</p>
                </div>
              </header>

              <div className="hey-settings-rows">
                <div className="hey-settings-row">
                  <div>
                    <strong>Suggestions enabled</strong>
                    <small>Urgent items can still break through.</small>
                  </div>
                  <Toggle
                    on={proactive.enabled}
                    onChange={() => setProactive((current) => ({ ...current, enabled: !current.enabled }))}
                    label="Toggle proactive suggestions"
                  />
                </div>
              </div>

              <div className="hey-settings-fields">
                <div className="hey-settings-fields-heading">Quiet hours</div>
                <div className="hey-settings-field-row">
                  <label>
                    <span>Start</span>
                    <input
                      type="time"
                      value={proactive.quietHours.start}
                      onChange={(event) =>
                        setProactive((current) => ({ ...current, quietHours: { ...current.quietHours, start: event.target.value } }))
                      }
                      className="hey-input"
                      aria-label="Quiet hours start"
                    />
                  </label>
                  <label>
                    <span>End</span>
                    <input
                      type="time"
                      value={proactive.quietHours.end}
                      onChange={(event) =>
                        setProactive((current) => ({ ...current, quietHours: { ...current.quietHours, end: event.target.value } }))
                      }
                      className="hey-input"
                      aria-label="Quiet hours end"
                    />
                  </label>
                </div>
                <div className="hey-settings-field-row">
                  <label>
                    <span>Suggestions per day</span>
                    <input
                      type="number"
                      min="0"
                      max="8"
                      value={proactive.maxSuggestionsPerDay}
                      onChange={(event) =>
                        setProactive((current) => ({ ...current, maxSuggestionsPerDay: Number(event.target.value) }))
                      }
                      className="hey-input"
                      aria-label="Maximum suggestions per day"
                    />
                  </label>
                  <label>
                    <span>Cooldown (minutes)</span>
                    <input
                      type="number"
                      min="0"
                      value={proactive.cooldownMinutes}
                      onChange={(event) =>
                        setProactive((current) => ({ ...current, cooldownMinutes: Number(event.target.value) }))
                      }
                      className="hey-input"
                      aria-label="Suggestion cooldown in minutes"
                    />
                  </label>
                </div>
              </div>

              <div className="hey-settings-card-actions">
                <button type="button" className="hey-btn-primary" onClick={saveProactive}>
                  <Save size={15} />
                  Save preferences
                </button>
                <span className="hey-settings-hint">
                  Next window:{" "}
                  <strong>
                    {new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(
                      getNextProactiveWindow(proactive),
                    )}
                  </strong>
                </span>
              </div>
            </section>

            <section className="hey-settings-card">
              <header className="hey-settings-card-header">
                <Mic size={20} aria-hidden="true" />
                <div>
                  <h2>Voice & wake phrase</h2>
                  <p>How HEY speaks back and how you begin a command.</p>
                </div>
              </header>

              <div className="hey-settings-fields">
                <div className="hey-settings-field-row">
                  <label className="spans">
                    <span>Output voice</span>
                    <select
                      value={voiceSettings.voiceURI}
                      onChange={(event) =>
                        setVoiceSettings((current) => ({ ...current, voiceURI: event.target.value }))
                      }
                      className="hey-input"
                      aria-label="Speech output voice"
                    >
                      <option value="">Auto (prefer British male)</option>
                      {voices.map((voice) => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                          {voice.name} ({voice.lang})
                        </option>
                      ))}
                    </select>
                    {voices.length === 0 && (
                      <small>No system voices detected in this browser.</small>
                    )}
                  </label>
                </div>
                <div className="hey-settings-field-row">
                  <label>
                    <span>Wake phrase</span>
                    <input
                      type="text"
                      value={voiceSettings.wakePhrase}
                      onChange={(event) =>
                        setVoiceSettings((current) => ({ ...current, wakePhrase: event.target.value }))
                      }
                      placeholder="hey"
                      className="hey-input"
                      aria-label="Voice wake phrase"
                    />
                  </label>
                </div>
              </div>

              <div className="hey-settings-rows">
                <div className="hey-settings-row">
                  <div>
                    <strong>Listen for me automatically</strong>
                    <small>HEY may watch for the wake phrase while chat is open.</small>
                  </div>
                  <Toggle
                    on={voiceSettings.autoListen}
                    onChange={() =>
                      setVoiceSettings((current) => ({ ...current, autoListen: !current.autoListen }))
                    }
                    label="Toggle automatic listening"
                  />
                </div>
              </div>

              <div className="hey-settings-card-actions">
                <button type="button" className="hey-btn-primary" onClick={saveVoice}>
                  <Save size={15} />
                  Save voice preferences
                </button>
                <span className="hey-settings-hint">
                  <Volume2 size={15} aria-hidden="true" />
                  {voices.length > 0
                    ? `Using ${pickVoice(voices, voiceSettings.voiceURI)?.name || "automatic"}`
                    : "Voice preview unavailable here."}
                </span>
              </div>
            </section>
          </div>

          <section className="hey-settings-card">
            <header className="hey-settings-card-header">
              <Shield size={20} aria-hidden="true" />
              <div>
                <h2>{t("settings.systemStatus")}</h2>
                <p>Current system state.</p>
              </div>
            </header>
            <div className="hey-settings-status">
              {[
                { name: t("common.connection"), status: online ? t("common.online") : t("common.offline"), ok: online },
                { name: t("common.backend"), status: t("common.configured"), ok: true },
                { name: t("common.session"), status: user ? t("common.signedIn") : t("common.signedOut"), ok: Boolean(user) },
                { name: t("common.plan"), status: planLabel, ok: true },
              ].map((item) => (
                <div className="hey-settings-status-item" key={item.name}>
                  <span className={`hey-settings-status-dot ${item.ok ? "ok" : "warn"}`} />
                  <div>
                    <small>{item.name}</small>
                    <strong>{item.status}</strong>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="hey-settings-card">
            <header className="hey-settings-card-header">
              <Database size={20} aria-hidden="true" />
              <div>
                <h2>Storage</h2>
                <p>Where your intelligence lives.</p>
              </div>
            </header>
            <div className="hey-settings-storage">
              <div className="hey-settings-storage-item">
                <Database size={16} aria-hidden="true" />
                <div>
                  <strong>{t("settings.backendTitle")}</strong>
                  <p>{t("settings.backendDesc")}</p>
                </div>
              </div>
              <div className="hey-settings-storage-item">
                <Brain size={16} aria-hidden="true" />
                <div>
                  <strong>{t("settings.memoryCore")}</strong>
                  <p>{t("settings.memoryCoreDesc")}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="hey-settings-card">
            <header className="hey-settings-card-header">
              <Languages size={20} aria-hidden="true" />
              <div>
                <h2>{t("settings.language")}</h2>
                <p>{t("settings.languageDesc")}</p>
              </div>
            </header>
            <div className="hey-settings-languages">
              {Object.values(LOCALES).map((candidate) => (
                <button
                  key={candidate.code}
                  type="button"
                  onClick={() => setLocale(candidate.code)}
                  aria-pressed={locale === candidate.code}
                  className={`hey-settings-lang ${locale === candidate.code ? "active" : ""}`}
                >
                  <span>{candidate.native}</span>
                  {locale === candidate.code && <Check size={15} />}
                </button>
              ))}
            </div>
            <p className="hey-settings-hint">{t("settings.languageHint")}</p>
          </section>

        </div>
      )}
    </motion.div>
  );
}