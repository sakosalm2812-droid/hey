import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";

const STORAGE_KEY = "hey_settings_registry";
const MAX_HISTORY = 50;

const SETTING_DEFINITIONS = {
  "appearance.theme": {
    key: "appearance.theme",
    type: "enum",
    default: "refined-dark",
    allowed: ["refined-dark", "refined-light", "ocean", "forest", "sunset", "midnight", "paper", "high-contrast", "custom"],
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: true,
    reset: true,
    immediate: true,
    validation: (value) => SETTING_DEFINITIONS["appearance.theme"].allowed.includes(value),
    description: "Visual theme for the entire application",
  },
  "appearance.motion": {
    key: "appearance.motion",
    type: "enum",
    default: "os",
    allowed: ["full", "reduced", "off", "os"],
    scope: "device",
    precedence: "device",
    migration: "v1",
    security: "none",
    preview: true,
    reset: true,
    immediate: true,
    validation: (value) => SETTING_DEFINITIONS["appearance.motion"].allowed.includes(value),
    description: "Motion intensity for animations and transitions",
  },
  "appearance.text_scale": {
    key: "appearance.text_scale",
    type: "number",
    default: 100,
    min: 80,
    max: 200,
    step: 5,
    scope: "device",
    precedence: "device",
    migration: "v1",
    security: "none",
    preview: true,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "number" && value >= 80 && value <= 200,
    description: "Text size scale percentage",
  },
  "workspace.snap": {
    key: "workspace.snap",
    type: "enum",
    default: "on",
    allowed: ["on", "off", "soft", "strict"],
    scope: "device",
    precedence: "device",
    migration: "v1",
    security: "none",
    preview: true,
    reset: true,
    immediate: true,
    validation: (value) => SETTING_DEFINITIONS["workspace.snap"].allowed.includes(value),
    description: "Widget snapping behavior",
  },
  "workspace.start_widgets": {
    key: "workspace.start_widgets",
    type: "array",
    default: ["clock", "status"],
    allowed: ["clock", "status", "weather", "usage", "reminders", "calendar", "prayer", "missions", "quick-actions"],
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: false,
    validation: (value) => Array.isArray(value) && value.every(v => SETTING_DEFINITIONS["workspace.start_widgets"].allowed.includes(v)),
    description: "Default widgets shown on workspace startup",
  },
  "island.enabled": {
    key: "island.enabled",
    type: "boolean",
    default: true,
    scope: "device",
    precedence: "device",
    migration: "v1",
    security: "none",
    preview: true,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "boolean",
    description: "Enable Dynamic Island compact surface",
  },
  "island.opacity": {
    key: "island.opacity",
    type: "number",
    default: 0.9,
    min: 0.5,
    max: 1,
    step: 0.05,
    scope: "device",
    precedence: "device",
    migration: "v1",
    security: "none",
    preview: true,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "number" && value >= 0.5 && value <= 1,
    description: "Dynamic Island background opacity",
  },
  "voice.activation": {
    key: "voice.activation",
    type: "enum",
    default: "push-to-talk",
    allowed: ["push-to-talk", "wake-word", "hold-to-talk", "click"],
    scope: "device",
    precedence: "device",
    migration: "v1",
    security: "none",
    preview: true,
    reset: true,
    immediate: true,
    validation: (value) => SETTING_DEFINITIONS["voice.activation"].allowed.includes(value),
    description: "Voice activation method",
  },
  "voice.wake_phrase": {
    key: "voice.wake_phrase",
    type: "string",
    default: "HEY",
    minLength: 2,
    maxLength: 20,
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: false,
    validation: (value) => typeof value === "string" && value.length >= 2 && value.length <= 20,
    description: "Custom wake word phrase",
  },
  "voice.endpoint_ms": {
    key: "voice.endpoint_ms",
    type: "number",
    default: 700,
    min: 300,
    max: 2000,
    step: 50,
    scope: "device",
    precedence: "device",
    migration: "v1",
    security: "none",
    preview: true,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "number" && value >= 300 && value <= 2000,
    description: "Silence endpoint detection in milliseconds",
  },
  "voice.rate": {
    key: "voice.rate",
    type: "number",
    default: 1.0,
    min: 0.5,
    max: 2.0,
    step: 0.1,
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: true,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "number" && value >= 0.5 && value <= 2.0,
    description: "Speech synthesis playback rate",
  },
  "voice.barge_in": {
    key: "voice.barge_in",
    type: "boolean",
    default: true,
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "boolean",
    description: "Allow interrupting HEY speech with new voice input",
  },
  "gesture.enabled": {
    key: "gesture.enabled",
    type: "boolean",
    default: false,
    scope: "device",
    precedence: "device",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "boolean",
    description: "Enable gesture control system",
  },
  "gesture.confidence": {
    key: "gesture.confidence",
    type: "number",
    default: 0.90,
    min: 0.70,
    max: 0.99,
    step: 0.01,
    scope: "device",
    precedence: "device",
    migration: "v1",
    security: "high",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "number" && value >= 0.70 && value <= 0.99,
    description: "Minimum confidence threshold for gesture recognition",
  },
  "gesture.hold_ms": {
    key: "gesture.hold_ms",
    type: "number",
    default: 400,
    min: 200,
    max: 1500,
    step: 50,
    scope: "device",
    precedence: "device",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "number" && value >= 200 && value <= 1500,
    description: "Hold duration for gesture activation in milliseconds",
  },
  "gesture.cooldown_ms": {
    key: "gesture.cooldown_ms",
    type: "number",
    default: 600,
    min: 200,
    max: 2000,
    step: 50,
    scope: "device",
    precedence: "device",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "number" && value >= 200 && value <= 2000,
    description: "Cooldown between gesture activations in milliseconds",
  },
  "gesture.scope": {
    key: "gesture.scope",
    type: "enum",
    default: "foreground",
    allowed: ["foreground", "live-only", "app", "system-visible"],
    scope: "device",
    precedence: "device",
    migration: "v1",
    security: "medium",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => SETTING_DEFINITIONS["gesture.scope"].allowed.includes(value),
    description: "Where gesture control is active",
  },
  "live.mode": {
    key: "live.mode",
    type: "enum",
    default: "guide",
    allowed: ["guide", "assist", "act"],
    scope: "session",
    precedence: "session",
    migration: "v1",
    security: "high",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => SETTING_DEFINITIONS["live.mode"].allowed.includes(value),
    description: "HEY Live interaction mode",
  },
  "live.raw_retention": {
    key: "live.raw_retention",
    type: "boolean",
    default: false,
    scope: "session",
    precedence: "session",
    migration: "v1",
    security: "high",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "boolean",
    description: "Retain raw audio/video frames from Live sessions",
  },
  "generation.variants": {
    key: "generation.variants",
    type: "number",
    default: 1,
    min: 1,
    max: 8,
    step: 1,
    scope: "request",
    precedence: "request",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "number" && value >= 1 && value <= 8,
    description: "Number of variants to generate by default",
  },
  "generation.auto_repairs": {
    key: "generation.auto_repairs",
    type: "number",
    default: 2,
    min: 0,
    max: 2,
    step: 1,
    scope: "project",
    precedence: "project",
    migration: "v1",
    security: "medium",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "number" && value >= 0 && value <= 2,
    description: "Maximum automatic repair attempts for generation QA failures",
  },
  "precision.exact_locks": {
    key: "precision.exact_locks",
    type: "boolean",
    default: true,
    scope: "artifact",
    precedence: "artifact",
    migration: "v1",
    security: "high",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "boolean",
    description: "Enable exact invariant locks for precision editing",
  },
  "memory.inferred_sensitive": {
    key: "memory.inferred_sensitive",
    type: "enum",
    default: "review",
    allowed: ["review", "session-only", "allow"],
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "high",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => SETTING_DEFINITIONS["memory.inferred_sensitive"].allowed.includes(value),
    description: "How to handle inferred sensitive memories",
  },
  "privacy.no_cloud": {
    key: "privacy.no_cloud",
    type: "boolean",
    default: false,
    scope: "project",
    precedence: "project",
    migration: "v1",
    security: "critical",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "boolean",
    description: "Enforce local-only processing for this project",
  },
  "proactivity.daily_cap": {
    key: "proactivity.daily_cap",
    type: "number",
    default: 3,
    min: 0,
    max: 20,
    step: 1,
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "number" && value >= 0 && value <= 20,
    description: "Maximum non-essential proactive suggestions per day",
  },
  "proactivity.dismiss_cooldown": {
    key: "proactivity.dismiss_cooldown",
    type: "number",
    default: 24,
    min: 1,
    max: 168,
    step: 1,
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "number" && value >= 1 && value <= 168,
    description: "Hours before a dismissed suggestion can reappear",
  },
  "helper.keep_running_on_close": {
    key: "helper.keep_running_on_close",
    type: "enum",
    default: "ask",
    allowed: ["keep", "quit", "ask"],
    scope: "device",
    precedence: "device",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: false,
    validation: (value) => SETTING_DEFINITIONS["helper.keep_running_on_close"].allowed.includes(value),
    description: "Behavior when main window is closed",
  },
  "helper.start_at_login": {
    key: "helper.start_at_login",
    type: "boolean",
    default: false,
    scope: "device",
    precedence: "device",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: false,
    validation: (value) => typeof value === "boolean",
    description: "Start background helper at system login",
  },
  "control.clipboard_history": {
    key: "control.clipboard_history",
    type: "boolean",
    default: false,
    scope: "device",
    precedence: "device",
    migration: "v1",
    security: "medium",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "boolean",
    description: "Enable continuous clipboard history collection",
  },
  "sensing.app_usage": {
    key: "sensing.app_usage",
    type: "boolean",
    default: false,
    scope: "device",
    precedence: "device",
    migration: "v1",
    security: "high",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "boolean",
    description: "Collect app usage patterns for proactive intelligence",
  },
  "sensing.face_presence": {
    key: "sensing.face_presence",
    type: "boolean",
    default: false,
    scope: "device",
    precedence: "device",
    migration: "v1",
    security: "critical",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "boolean",
    description: "Enable face presence detection for authentication",
  },
  "scheduling.overlap": {
    key: "scheduling.overlap",
    type: "boolean",
    default: false,
    scope: "workflow",
    precedence: "workflow",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "boolean",
    description: "Allow overlapping scheduled workflow occurrences",
  },
  "scheduling.missed_run": {
    key: "scheduling.missed_run",
    type: "enum",
    default: "latest",
    allowed: ["skip", "latest", "bounded-catch-up"],
    scope: "workflow",
    precedence: "workflow",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => SETTING_DEFINITIONS["scheduling.missed_run"].allowed.includes(value),
    description: "Policy for missed scheduled workflow runs",
  },
  "local.battery_floor": {
    key: "local.battery_floor",
    type: "number",
    default: 20,
    min: 5,
    max: 80,
    step: 5,
    scope: "device",
    precedence: "device",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "number" && value >= 5 && value <= 80,
    description: "Battery percentage below which heavy local generation is deferred",
  },
  "diagnostics.upload": {
    key: "diagnostics.upload",
    type: "boolean",
    default: false,
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "boolean",
    description: "Allow uploading privacy-scrubbed diagnostics",
  },
  "security.grant_duration": {
    key: "security.grant_duration",
    type: "enum",
    default: "once",
    allowed: ["once", "session", "mission", "10min", "today", "persistent"],
    scope: "action",
    precedence: "action",
    migration: "v1",
    security: "critical",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => SETTING_DEFINITIONS["security.grant_duration"].allowed.includes(value),
    description: "Default permission grant duration for sensitive actions",
  },
  "language.primary": {
    key: "language.primary",
    type: "enum",
    default: "en",
    allowed: ["en", "ku", "ar"],
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: false,
    validation: (value) => SETTING_DEFINITIONS["language.primary"].allowed.includes(value),
    description: "Primary interface language",
  },
  "language.rtl_support": {
    key: "language.rtl_support",
    type: "boolean",
    default: true,
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "boolean",
    description: "Enable RTL layout support for Arabic/Kurdish",
  },
  "accessibility.high_contrast": {
    key: "accessibility.high_contrast",
    type: "boolean",
    default: false,
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: true,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "boolean",
    description: "Enable high contrast mode",
  },
  "accessibility.large_targets": {
    key: "accessibility.large_targets",
    type: "boolean",
    default: false,
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: true,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "boolean",
    description: "Enlarge interactive targets for easier access",
  },
  "accessibility.reduced_motion": {
    key: "accessibility.reduced_motion",
    type: "boolean",
    default: false,
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: true,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "boolean",
    description: "Reduce motion animations (also respects OS preference)",
  },
  "accessibility.voice_only": {
    key: "accessibility.voice_only",
    type: "boolean",
    default: false,
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "boolean",
    description: "Optimize interface for voice-only operation",
  },
  "accessibility.dyslexia_friendly": {
    key: "accessibility.dyslexia_friendly",
    type: "boolean",
    default: false,
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: true,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "boolean",
    description: "Enable dyslexia-friendly font and spacing",
  },
  "religious.prayer.enabled": {
    key: "religious.prayer.enabled",
    type: "boolean",
    default: false,
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "boolean",
    description: "Enable prayer times and reminders",
  },
  "religious.prayer.method": {
    key: "religious.prayer.method",
    type: "enum",
    default: "muslim_world_league",
    allowed: ["muslim_world_league", "egyptian", "karachi", "umm_al_qura", "dubai", "moonsighting_committee", "north_america", "kuwait", "qatar", "singapore", "tehran", "gulf"],
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: false,
    validation: (value) => SETTING_DEFINITIONS["religious.prayer.method"].allowed.includes(value),
    description: "Prayer time calculation method",
  },
  "religious.prayer.warning_minutes": {
    key: "religious.prayer.warning_minutes",
    type: "number",
    default: 10,
    min: 0,
    max: 60,
    step: 1,
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "number" && value >= 0 && value <= 60,
    description: "Minutes before prayer to show warning",
  },
  "religious.quran.reciter": {
    key: "religious.quran.reciter",
    type: "string",
    default: "ar.alafasy",
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: true,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "string",
    description: "Default Quran reciter for audio playback",
  },
  "religious.hadith.collection": {
    key: "religious.hadith.collection",
    type: "enum",
    default: "bukhari",
    allowed: ["bukhari", "muslim", "abu_dawood", "tirmidhi", "nasai", "ibn_majah", "muwatta", "ahmad"],
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => SETTING_DEFINITIONS["religious.hadith.collection"].allowed.includes(value),
    description: "Default Hadith collection for references",
  },
  "religious.calendar.method": {
    key: "religious.calendar.method",
    type: "enum",
    default: "umm_al_qura",
    allowed: ["umm_al_qura", "egyptian", "islamic_society_north_america", "turkey", "saudi_um_al_qura"],
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => SETTING_DEFINITIONS["religious.calendar.method"].allowed.includes(value),
    description: "Islamic calendar calculation method",
  },
  "proactive.enabled": {
    key: "proactive.enabled",
    type: "enum",
    default: "balanced",
    allowed: ["off", "minimal", "balanced", "proactive", "custom"],
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => SETTING_DEFINITIONS["proactive.enabled"].allowed.includes(value),
    description: "Proactive intelligence level",
  },
  "proactive.quiet_hours_start": {
    key: "proactive.quiet_hours_start",
    type: "string",
    default: "22:00",
    pattern: "^([01]?[0-9]|2[0-3]):[0-5][0-9]$",
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "string" && /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value),
    description: "Start of quiet hours for proactive notifications",
  },
  "proactive.quiet_hours_end": {
    key: "proactive.quiet_hours_end",
    type: "string",
    default: "07:00",
    pattern: "^([01]?[0-9]|2[0-3]):[0-5][0-9]$",
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "string" && /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value),
    description: "End of quiet hours for proactive notifications",
  },
  "mode.current": {
    key: "mode.current",
    type: "enum",
    default: "execution",
    allowed: ["study", "creator", "coding", "research", "business", "focus", "meeting", "presentation", "travel", "morning", "late-night", "accessibility", "private", "offline", "execution"],
    scope: "session",
    precedence: "session",
    migration: "v1",
    security: "none",
    preview: true,
    reset: true,
    immediate: true,
    validation: (value) => SETTING_DEFINITIONS["mode.current"].allowed.includes(value),
    description: "Active environment mode",
  },
  "personality.challenge_level": {
    key: "personality.challenge_level",
    type: "enum",
    default: "adaptive",
    allowed: ["gentle", "balanced", "challenging", "hard-critic", "adaptive"],
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => SETTING_DEFINITIONS["personality.challenge_level"].allowed.includes(value),
    description: "How strongly HEY challenges assumptions",
  },
  "personality.surprise_me": {
    key: "personality.surprise_me",
    type: "boolean",
    default: false,
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => typeof value === "boolean",
    description: "Enable intelligent surprise suggestions",
  },
  "personality.humor": {
    key: "personality.humor",
    type: "enum",
    default: "moderate",
    allowed: ["none", "light", "moderate", "witty"],
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => SETTING_DEFINITIONS["personality.humor"].allowed.includes(value),
    description: "Humor level in responses",
  },
  "personality.verbosity": {
    key: "personality.verbosity",
    type: "enum",
    default: "balanced",
    allowed: ["concise", "balanced", "detailed", "adaptive"],
    scope: "user",
    precedence: "user",
    migration: "v1",
    security: "none",
    preview: false,
    reset: true,
    immediate: true,
    validation: (value) => SETTING_DEFINITIONS["personality.verbosity"].allowed.includes(value),
    description: "Default response verbosity",
  },
};

class SettingsRegistry {
  constructor() {
    this.settings = new Map();
    this.history = new Map();
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.settings) {
          Object.entries(parsed.settings).forEach(([key, value]) => {
            this.settings.set(key, value);
          });
        }
        if (parsed.history) {
          Object.entries(parsed.history).forEach(([key, value]) => {
            this.history.set(key, value);
          });
        }
      }
    } catch (err) {
      console.warn("Failed to load settings registry:", err);
    }
    this.applyDefaults();
  }

  applyDefaults() {
    Object.entries(SETTING_DEFINITIONS).forEach(([key, def]) => {
      if (!this.settings.has(key)) {
        this.settings.set(key, def.default);
      }
    });
  }

  save() {
    try {
      const data = {
        settings: Object.fromEntries(this.settings),
        history: Object.fromEntries(this.history),
      };
      if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn("Failed to save settings registry:", err);
    }
  }

  get(key) {
    return this.settings.get(key);
  }

  getDefinition(key) {
    return SETTING_DEFINITIONS[key] || null;
  }

  getAll() {
    return Object.fromEntries(this.settings);
  }

  getAllDefinitions() {
    return { ...SETTING_DEFINITIONS };
  }

  getEffectiveValue(key, context = {}) {
    const def = SETTING_DEFINITIONS[key];
    if (!def) return null;

    const value = this.settings.get(key);
    if (value !== undefined && value !== null) {
      return value;
    }

    if (context[def.scope] && context[def.scope][key] !== undefined) {
      return context[def.scope][key];
    }

    return def.default;
  }

  set(key, value, options = {}) {
    const def = SETTING_DEFINITIONS[key];
    if (!def) {
      throw new Error(`Unknown setting: ${key}`);
    }

    if (!def.validation(value)) {
      throw new Error(`Invalid value for ${key}: ${value}`);
    }

    const oldValue = this.settings.get(key);
    if (oldValue === value) return false;

    this.settings.set(key, value);

    if (!this.history.has(key)) {
      this.history.set(key, []);
    }
    const history = this.history.get(key);
    history.unshift({
      value: oldValue,
      newValue: value,
      timestamp: new Date().toISOString(),
      source: options.source || "user",
      scope: def.scope,
    });
    if (history.length > MAX_HISTORY) history.pop();

    this.save();

    publish("settings.changed", { key, value, oldValue, definition: def });

    recordAudit({
      action: "settings.changed",
      status: "completed",
      metadata: { key, oldValue, newValue: value, scope: def.scope },
    });

    this.notifyListeners(key, value, oldValue);
    return true;
  }

  reset(key) {
    const def = SETTING_DEFINITIONS[key];
    if (!def) return false;

    return this.set(key, def.default, { source: "reset" });
  }

  resetCategory(category) {
    const keys = Object.keys(SETTING_DEFINITIONS).filter(k => k.startsWith(category + "."));
    keys.forEach(key => this.reset(key));
    return keys.length;
  }

  preview(key, value) {
    const def = SETTING_DEFINITIONS[key];
    if (!def || !def.preview) return false;

    return {
      valid: def.validation(value),
      current: this.settings.get(key),
      preview: value,
      definition: def,
    };
  }

  export() {
    return {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      settings: Object.fromEntries(this.settings),
    };
  }

  import(data) {
    if (!data || !data.settings) {
      throw new Error("Invalid settings import data");
    }

    let imported = 0;
    Object.entries(data.settings).forEach(([key, value]) => {
      const def = SETTING_DEFINITIONS[key];
      if (def && def.validation(value)) {
        this.set(key, value, { source: "import" });
        imported++;
      }
    });

    return imported;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(key, value, oldValue) {
    this.listeners.forEach(listener => {
      try {
        listener(key, value, oldValue);
      } catch (err) {
        console.error("Settings listener error:", err);
      }
    });
  }

  getHistory(key) {
    return this.history.get(key) || [];
  }

  clearHistory(key) {
    if (key) {
      this.history.delete(key);
    } else {
      this.history.clear();
    }
    this.save();
  }
}

export const settingsRegistry = new SettingsRegistry();

export function getSetting(key, context = {}) {
  return settingsRegistry.getEffectiveValue(key, context);
}

export function setSetting(key, value, options = {}) {
  return settingsRegistry.set(key, value, options);
}

export function resetSetting(key) {
  return settingsRegistry.reset(key);
}

export function resetSettingsCategory(category) {
  return settingsRegistry.resetCategory(category);
}

export function previewSetting(key, value) {
  return settingsRegistry.preview(key, value);
}

export function getSettingDefinition(key) {
  return settingsRegistry.getDefinition(key);
}

export function getAllSettings() {
  return settingsRegistry.getAll();
}

export function getAllSettingDefinitions() {
  return settingsRegistry.getAllDefinitions();
}

export function subscribeToSettings(listener) {
  return settingsRegistry.subscribe(listener);
}

export function exportSettings() {
  return settingsRegistry.export();
}

export function importSettings(data) {
  return settingsRegistry.import(data);
}

export { SETTING_DEFINITIONS };

export default settingsRegistry;