import { useEffect, useState } from "react";
import { useAuth } from "../../AuthContext.jsx";
import { useLocale } from "../../i18n/LocaleContext.jsx";
import { getAccountScope } from "../../core/accountScope.js";
import { onboardingEngine, ONBOARDING_PURPOSES } from "../../core/onboardingEngine.js";

const PURPOSES = ONBOARDING_PURPOSES.map(({ id }) => id);
const PURPOSE_COPY_KEYS = {
  ai_assistant: ["assistant", "assistantExample"],
  ai_models: ["models", "modelsExample"],
  control_automation: ["control", "controlExample"],
  create_build: ["create", "createExample"],
  teaching_learning: ["teaching", "teachingExample"],
  life_work: ["lifeWork", "lifeWorkExample"],
  custom: ["custom", "customExample"],
};

export default function FirstRunPurposeSetup() {
  const { user } = useAuth();
  const { t } = useLocale();
  const [setup, setSetup] = useState(() => onboardingEngine.getPurposeSetup());
  const [selected, setSelected] = useState(() => onboardingEngine.getPurposeSetup().selections);
  const [customGoal, setCustomGoal] = useState(() => onboardingEngine.getPurposeSetup().customGoal);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const prefix = "chat.firstRunPurposes";

  useEffect(() => {
    const refresh = () => {
      const current = onboardingEngine.getPurposeSetup();
      setSetup(current);
      setSelected(current.selections);
      setCustomGoal(current.customGoal);
    };
    const unsubscribe = onboardingEngine.subscribe((event) => {
      if (["purposes_updated", "storage_synced", "account_scope_changed"].includes(event)) refresh();
    });
    return unsubscribe;
  }, [user?.id]);

  if (!user?.id || setup.complete) return null;

  const toggle = (id) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setError("");
  };

  const submit = (skip = false) => {
    if (getAccountScope() !== `account:${user.id}`) {
      setError(t(`${prefix}.saveFailed`, "Could not save this choice. Please try again."));
      return;
    }
    setSaving(true);
    setError("");
    const result = skip ? onboardingEngine.skipPurposeSetup() : onboardingEngine.savePurposeSetup(selected, customGoal);
    setSaving(false);
    if (result?.error) setError(t(`${prefix}.saveFailed`, "Could not save this choice. Please try again."));
    else setSetup(result);
  };

  return (
    <section className="hey-first-run-purposes" aria-labelledby="hey-first-run-purposes-title">
      <h2 id="hey-first-run-purposes-title">{t(`${prefix}.title`)}</h2>
      <p className="hey-first-run-purposes-intro">{t(`${prefix}.subtitle`)}</p>
      <fieldset disabled={saving}>
        <legend className="hey-first-run-purposes-legend">{t(`${prefix}.chooseLabel`, "Choose all that fit")}</legend>
        <div className="hey-first-run-purposes-grid">
          {PURPOSES.map((id) => (
            <label className="hey-first-run-purpose-option" key={id}>
              <input type="checkbox" checked={selected.includes(id)} onChange={() => toggle(id)} />
              <span>
                <strong>{t(`${prefix}.${PURPOSE_COPY_KEYS[id][0]}`)}</strong>
                <small>{t(`${prefix}.${PURPOSE_COPY_KEYS[id][1]}`)}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {selected.includes("custom") && (
        <label className="hey-first-run-custom-goal">
          <span>{t(`${prefix}.customGoal`)}</span>
          <textarea value={customGoal} maxLength={500} rows={3} onChange={(event) => setCustomGoal(event.target.value)} placeholder={t(`${prefix}.customPlaceholder`)} />
        </label>
      )}
      {error && <p className="hey-first-run-purposes-error" role="alert">{error}</p>}
      <div className="hey-first-run-purposes-actions">
        <button type="button" onClick={() => submit(false)} disabled={saving || selected.length === 0 || (selected.includes("custom") && !customGoal.trim())}>{t(`${prefix}.continue`)}</button>
        <button type="button" className="hey-first-run-skip" onClick={() => submit(true)} disabled={saving}>{t(`${prefix}.skip`)}</button>
      </div>
    </section>
  );
}
