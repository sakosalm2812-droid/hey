const VOICE_SETTINGS_KEY = "hey_voice_settings";

export const DEFAULT_VOICE_SETTINGS = {
  voiceURI: "",
  wakePhrase: "hey",
  autoListen: false,
  rate: 1,
  pitch: 1,
};

export function loadVoiceSettings() {
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      ...DEFAULT_VOICE_SETTINGS,
      ...(parsed && typeof parsed === "object" ? parsed : {}),
    };
  } catch {
    return { ...DEFAULT_VOICE_SETTINGS };
  }
}

export function saveVoiceSettings(next) {
  try {
    const current = loadVoiceSettings();
    localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify({ ...current, ...next }));
  } catch {
    /* storage unavailable */
  }
}

export function getTtsVoices(environment = globalThis) {
  if (!environment.speechSynthesis?.getVoices) return [];
  return environment.speechSynthesis.getVoices();
}

function isBritishMale(voice) {
  const lang = String(voice.lang || "").toLowerCase();
  const name = String(voice.name || "").toLowerCase();
  if (!lang.startsWith("en-gb")) return false;
  if (name.includes("male") || name.includes("daniel") || name.includes("arthur") || name.includes("george") || name.includes("harry")) return true;
  return false;
}

export function pickVoice(voices, preference = "") {
  if (preference) {
    const exact = voices.find((voice) => voice.voiceURI === preference || voice.name === preference);
    if (exact) return exact;
  }
  const britishMale = voices.find(isBritishMale) || null;
  if (britishMale) return britishMale;
  const british = voices.find((voice) => String(voice.lang || "").toLowerCase().startsWith("en-gb")) || null;
  if (british) return british;
  const english = voices.find((voice) => String(voice.lang || "").toLowerCase().startsWith("en")) || null;
  return english || voices[0] || null;
}

export function resolveUtteranceVoice(utterance, environment = globalThis) {
  const settings = loadVoiceSettings();
  const voices = getTtsVoices(environment);
  const voice = pickVoice(voices, settings.voiceURI);
  if (voice) utterance.voice = voice;
  utterance.rate = Number(settings.rate) || 1;
  utterance.pitch = Number(settings.pitch) || 1;
  return voice || null;
}

export function stripWakePhrase(text) {
  const settings = loadVoiceSettings();
  const phrase = String(settings.wakePhrase || "").trim().toLowerCase();
  const cleaned = String(text || "").trim();

  if (phrase) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^\\s*${escaped}\\b[,:]?\\s*`, "i");
    const stripped = cleaned.replace(pattern, "");
    if (stripped !== cleaned) return stripped;
  }

  return cleaned.replace(/^\s*(?:okay hey|hey)\b[,:]?\s*/i, "").trim();
}

export default {
  DEFAULT_VOICE_SETTINGS,
  loadVoiceSettings,
  saveVoiceSettings,
  getTtsVoices,
  pickVoice,
  resolveUtteranceVoice,
  stripWakePhrase,
};