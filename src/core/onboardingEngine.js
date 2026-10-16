import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";
import { setSetting } from "./settingsRegistry.js";
import { safeStorage } from "../lib/safeStorage.js";
import { getAccountScope, getAccountStorageKey, subscribeAccountScope } from "./accountScope.js";

const ONBOARDING_STAGES = Object.freeze({
  WELCOME: "welcome",
  LOCALE_ACCESSIBILITY: "locale_accessibility",
  WORKSPACE_INTRO: "workspace_intro",
  PRACTICE_TASK: "practice_task",
  PERMISSIONS: "permissions",
  VERIFIED_RESULT: "verified_result",
  FEATURE_DISCOVERY: "feature_discovery",
  COMPLETE: "complete",
});

const ONBOARDING_STEPS = [
  {
    id: ONBOARDING_STAGES.WELCOME,
    title: "Welcome to HEY",
    description: "Your personal intelligence system",
    component: "OnboardingWelcome",
    skippable: true,
  },
  {
    id: ONBOARDING_STAGES.LOCALE_ACCESSIBILITY,
    title: "Language & Accessibility",
    description: "Choose your language and display preferences",
    component: "OnboardingLocaleAccessibility",
    skippable: false,
  },
  {
    id: ONBOARDING_STAGES.WORKSPACE_INTRO,
    title: "Your Workspace",
    description: "See how HEY organizes your work",
    component: "OnboardingWorkspaceIntro",
    skippable: true,
  },
  {
    id: ONBOARDING_STAGES.PRACTICE_TASK,
    title: "Try HEY",
    description: "Complete a real task with HEY",
    component: "OnboardingPracticeTask",
    skippable: false,
  },
  {
    id: ONBOARDING_STAGES.PERMISSIONS,
    title: "Permissions",
    description: "Grant permissions for voice, screen, files",
    component: "OnboardingPermissions",
    skippable: true,
  },
  {
    id: ONBOARDING_STAGES.VERIFIED_RESULT,
    title: "See the Result",
    description: "HEY shows exactly what changed",
    component: "OnboardingVerifiedResult",
    skippable: false,
  },
  {
    id: ONBOARDING_STAGES.FEATURE_DISCOVERY,
    title: "Discover More",
    description: "Explore capabilities relevant to you",
    component: "OnboardingFeatureDiscovery",
    skippable: true,
  },
];

const PRACTICE_TASKS = [
  {
    id: "create_note",
    title: "Create a note",
    description: "Tell HEY to save a quick note",
    prompt: "Remember that I need to review the project proposal by Friday",
    verification: "memory_stored",
  },
  {
    id: "set_reminder",
    title: "Set a reminder",
    description: "Ask HEY to remind you of something",
    prompt: "Remind me to check the deployment status at 3 PM",
    verification: "reminder_created",
  },
  {
    id: "open_website",
    title: "Open a website",
    description: "Have HEY open a webpage for you",
    prompt: "Open https://github.com",
    verification: "url_opened",
  },
];

const STORAGE_KEY = "hey_onboarding_progress";
const TUTORIAL_STORAGE_KEY = "hey_tutorial_progress";
const MAX_ONBOARDING_STORAGE_CHARS = 100_000;

export const ONBOARDING_MOTIVATIONS = Object.freeze([
  Object.freeze({ id: "organize_work", label: "Organize my work" }),
  Object.freeze({ id: "save_time", label: "Save time on routine tasks" }),
  Object.freeze({ id: "manage_personal", label: "Manage personal responsibilities" }),
  Object.freeze({ id: "learn", label: "Learn and explore" }),
  Object.freeze({ id: "create", label: "Create and brainstorm" }),
  Object.freeze({ id: "coordinate", label: "Communicate and coordinate" }),
  Object.freeze({ id: "accessibility", label: "Make tools easier to use" }),
  Object.freeze({ id: "privacy", label: "Keep control of my information" }),
]);

export const ONBOARDING_PURPOSES = Object.freeze([
  Object.freeze({ id: "ai_assistant" }),
  Object.freeze({ id: "ai_models" }),
  Object.freeze({ id: "control_automation" }),
  Object.freeze({ id: "create_build" }),
  Object.freeze({ id: "teaching_learning" }),
  Object.freeze({ id: "life_work" }),
  Object.freeze({ id: "custom" }),
]);

const VALID_ONBOARDING_MOTIVATIONS = new Set(ONBOARDING_MOTIVATIONS.map(({ id }) => id));
const VALID_ONBOARDING_PURPOSES = new Set(ONBOARDING_PURPOSES.map(({ id }) => id));
const MAX_CUSTOM_PURPOSE_CHARS = 500;
const STARTER_SUGGESTIONS = Object.freeze([
  Object.freeze({ id: "personal", label: "Personal" }),
  Object.freeze({ id: "work", label: "Work" }),
  Object.freeze({ id: "learning", label: "Learning" }),
]);
const MOTIVATION_STARTER_WEIGHTS = Object.freeze({
  organize_work: Object.freeze({ work: 3 }),
  save_time: Object.freeze({ personal: 1, work: 1, learning: 1 }),
  manage_personal: Object.freeze({ personal: 3 }),
  learn: Object.freeze({ learning: 3 }),
  create: Object.freeze({ learning: 2, work: 1 }),
  coordinate: Object.freeze({ work: 2, personal: 1 }),
  accessibility: Object.freeze({ personal: 1, work: 1, learning: 1 }),
  privacy: Object.freeze({ personal: 1, work: 1, learning: 1 }),
});

const VALID_ONBOARDING_STAGES = new Set([...Object.values(ONBOARDING_STAGES)]);
const VALID_PRACTICE_TASK_IDS = new Set(PRACTICE_TASKS.map(({ id }) => id));
const MAX_STARTER_SPACE_SELECTIONS = 12;
const STARTER_SPACE_ID = /^[a-z0-9][a-z0-9_-]{0,47}$/i;

function normalizeMotivationSelections(value) {
  try {
    if (!Array.isArray(value)) return null;
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(value).length > 0) return null;
    const length = descriptors.length?.value;
    if (!Number.isInteger(length) || length < 0 || length > ONBOARDING_MOTIVATIONS.length) return null;
    if (Object.keys(descriptors).some((key) => key !== "length" && (!/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= length))) return null;
    const result = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[index];
      if (!descriptor || !Object.hasOwn(descriptor, "value")) return null;
      if (typeof descriptor.value !== "string" || !VALID_ONBOARDING_MOTIVATIONS.has(descriptor.value) || result.includes(descriptor.value)) return null;
      result.push(descriptor.value);
    }
    return result;
  } catch {
    return null;
  }
}

function normalizePurposeSelections(value) {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(value).length > 0) return null;
    const length = descriptors.length?.value;
    if (!Number.isInteger(length) || length < 0 || length > ONBOARDING_PURPOSES.length) return null;
    if (Object.keys(descriptors).some((key) => key !== "length" && (!/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= length))) return null;
    const result = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[index];
      if (!descriptor || !Object.hasOwn(descriptor, "value")) return null;
      if (typeof descriptor.value !== "string" || !VALID_ONBOARDING_PURPOSES.has(descriptor.value) || result.includes(descriptor.value)) return null;
      result.push(descriptor.value);
    }
    return result;
  } catch {
    return null;
  }
}

function createInitialProgress() {
  return {
    currentStage: ONBOARDING_STAGES.WELCOME,
    completedStages: [],
    skippedStages: [],
    startedAt: null,
    completedAt: null,
    practiceTaskId: null,
    practiceTaskCompleted: false,
    locale: "en",
    accessibility: {},
    starterSpaceSelections: [],
    motivationSelections: [],
    purposeSelections: [],
    customPurposeGoal: "",
    purposeSetupComplete: false,
    dismissedSuggestions: new Set(),
  };
}

function normalizeProgress(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return createInitialProgress();
  const base = createInitialProgress();
  const strings = (list) => Array.isArray(list)
    ? [...new Set(list.filter((item) => typeof item === "string" && item.length <= 100))]
    : [];
  const accessibility = value.accessibility && typeof value.accessibility === "object" && !Array.isArray(value.accessibility)
    ? Object.fromEntries(Object.entries(value.accessibility).filter(([, flag]) => typeof flag === "boolean"))
    : {};
  const normalizedPurposeSelections = normalizePurposeSelections(value.purposeSelections);
  const purposeSelections = normalizedPurposeSelections || [];
  const customPurposeGoal = typeof value.customPurposeGoal === "string" && value.customPurposeGoal.trim().length <= MAX_CUSTOM_PURPOSE_CHARS
    ? value.customPurposeGoal.trim()
    : "";
  const purposeSetupValid = purposeSelections.length > 0 && (!purposeSelections.includes("custom") || Boolean(customPurposeGoal)) && (purposeSelections.includes("custom") || !customPurposeGoal);
  return {
    ...base,
    currentStage: VALID_ONBOARDING_STAGES.has(value.currentStage) ? value.currentStage : base.currentStage,
    completedStages: strings(value.completedStages).filter((stage) => VALID_ONBOARDING_STAGES.has(stage)),
    skippedStages: strings(value.skippedStages).filter((stage) => VALID_ONBOARDING_STAGES.has(stage)),
    startedAt: typeof value.startedAt === "string" && value.startedAt.length <= 64 ? value.startedAt : null,
    completedAt: typeof value.completedAt === "string" && value.completedAt.length <= 64 ? value.completedAt : null,
    practiceTaskId: VALID_PRACTICE_TASK_IDS.has(value.practiceTaskId) ? value.practiceTaskId : null,
    practiceTaskCompleted: value.practiceTaskCompleted === true,
    practiceTaskResult: typeof value.practiceTaskResult === "string" ? value.practiceTaskResult.slice(0, 1000) : undefined,
    locale: typeof value.locale === "string" && /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(value.locale) ? value.locale : base.locale,
    accessibility,
    starterSpaceSelections: Array.isArray(value.starterSpaceSelections)
      ? [...new Set(value.starterSpaceSelections.filter((id) => typeof id === "string" && STARTER_SPACE_ID.test(id)))].slice(0, MAX_STARTER_SPACE_SELECTIONS)
      : [],
    motivationSelections: normalizeMotivationSelections(value.motivationSelections) || [],
    purposeSelections: purposeSetupValid ? purposeSelections : [],
    customPurposeGoal: purposeSetupValid ? customPurposeGoal : "",
    purposeSetupComplete: value.purposeSetupComplete === true && (normalizedPurposeSelections?.length === 0 || purposeSetupValid),
    dismissedSuggestions: new Set(strings(value.dismissedSuggestions)),
  };
}

export class OnboardingEngine {
  constructor() {
    this.progress = createInitialProgress();
    this.listeners = new Set();
    this.accountScope = getAccountScope();
    this.load();
    this.unsubscribeAccountScope = subscribeAccountScope((_previousScope, nextScope) => {
      this.accountScope = nextScope;
      this.load();
      this.notify("account_scope_changed", this.getProgress());
    });
    this.storageEventTarget = globalThis.window && typeof globalThis.window.addEventListener === "function"
      ? globalThis.window
      : null;
    this.handleStorageEvent = (event) => {
      if (!event || (event.key !== getAccountStorageKey(STORAGE_KEY) && event.key !== null)) return;
      try {
        if (event.storageArea && globalThis.localStorage && event.storageArea !== globalThis.localStorage) return;
        // localStorage.clear() emits a storage event with a null key. Resolve
        // the current account's record after the clear instead of treating it
        // as an unrelated global storage change.
        const newValue = event.key === null ? globalThis.localStorage?.getItem(getAccountStorageKey(STORAGE_KEY)) : event.newValue;
        if (newValue === null) {
          this.progress = createInitialProgress();
          this.notify("storage_synced", this.getProgress());
          return;
        }
        if (typeof newValue !== "string" || newValue.length > 100_000) return;
        const parsed = JSON.parse(newValue);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
        this.progress = normalizeProgress(parsed);
        this.notify("storage_synced", this.getProgress());
      } catch {
        // Storage events are external input. Keep the current in-memory state
        // when a browser or hostile test harness supplies an unreadable update.
      }
    };
    this.storageEventTarget?.addEventListener("storage", this.handleStorageEvent);
  }

  destroy() {
    this.storageEventTarget?.removeEventListener("storage", this.handleStorageEvent);
    this.unsubscribeAccountScope?.();
    this.listeners.clear();
  }

  load() {
    this.accountScope = getAccountScope();
    try {
      const stored = safeStorage.getItem(getAccountStorageKey(STORAGE_KEY, this.accountScope));
      if (typeof stored === "string" && stored.length <= MAX_ONBOARDING_STORAGE_CHARS) {
        const parsed = JSON.parse(stored);
        this.progress = normalizeProgress(parsed);
      } else this.progress = createInitialProgress();
    } catch (err) {
      this.progress = createInitialProgress();
      console.warn("Failed to load onboarding progress:", err);
    }
  }

  save() {
    try {
      const data = { ...this.progress, dismissedSuggestions: Array.from(this.progress.dismissedSuggestions) };
      const serialized = JSON.stringify(data);
      const scope = this.accountScope;
      if (scope !== getAccountScope()) return { success: false, status: "account_scope_changed" };
      if (serialized.length > MAX_ONBOARDING_STORAGE_CHARS) return { success: false, status: "too_large" };
      const key = getAccountStorageKey(STORAGE_KEY, scope);
      safeStorage.setItem(key, serialized);
      if (scope !== getAccountScope() || safeStorage.getItem(key) !== serialized) {
        return { success: false, status: scope !== getAccountScope() ? "account_scope_changed" : "readback_failed" };
      }
      return { success: true };
    } catch (err) {
      console.warn("Failed to save onboarding progress:", err);
      return { success: false, status: "storage_error" };
    }
  }

  getProgress() {
    return { ...this.progress, completedStages: [...this.progress.completedStages], skippedStages: [...this.progress.skippedStages], accessibility: { ...this.progress.accessibility }, starterSpaceSelections: [...this.progress.starterSpaceSelections], motivationSelections: [...this.progress.motivationSelections], purposeSelections: [...this.progress.purposeSelections], dismissedSuggestions: new Set(this.progress.dismissedSuggestions) };
  }

  getCurrentStage() {
    return this.progress.currentStage;
  }

  getStageIndex(stage) {
    return ONBOARDING_STEPS.findIndex(s => s.id === stage);
  }

  isComplete() {
    return this.progress.currentStage === ONBOARDING_STAGES.COMPLETE;
  }

  start() {
    if (this.progress.startedAt) return this.progress;
    
    this.progress.startedAt = new Date().toISOString();
    this.progress.currentStage = ONBOARDING_STAGES.WELCOME;
    this.save();
    this.notify("started", this.progress);
    
    publish("onboarding.started", this.progress);
    recordAudit({ action: "onboarding.started", status: "completed", metadata: {} });
    
    return this.progress;
  }

  completeStage(stageId, data = {}) {
    const currentIndex = this.getStageIndex(this.progress.currentStage);
    const targetIndex = this.getStageIndex(stageId);
    
    if (targetIndex <= currentIndex) return this.progress;
    
    this.progress.completedStages.push(stageId);
    
    const nextStep = ONBOARDING_STEPS[currentIndex + 1];
    if (nextStep) {
      this.progress.currentStage = nextStep.id;
    } else {
      this.progress.currentStage = ONBOARDING_STAGES.COMPLETE;
      this.progress.completedAt = new Date().toISOString();
    }
    
    if (data && typeof data === "object" && !Array.isArray(data)) {
      if (typeof data.locale === "string" && /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(data.locale)) this.progress.locale = data.locale;
      if (data.accessibility && typeof data.accessibility === "object" && !Array.isArray(data.accessibility)) {
        this.progress.accessibility = { ...this.progress.accessibility, ...Object.fromEntries(Object.entries(data.accessibility).filter(([key, value]) => /^[a-zA-Z][\w-]{0,47}$/.test(key) && typeof value === "boolean")) };
      }
    }
    this.save();
    this.notify("stage_completed", { stage: stageId, progress: this.progress });
    
    publish("onboarding.stage_completed", { stage: stageId, progress: this.progress });
    recordAudit({ action: "onboarding.stage_completed", status: "completed", metadata: { stage: stageId } });
    
    return this.progress;
  }

  skipStage(stageId) {
    const currentIndex = this.getStageIndex(this.progress.currentStage);
    const targetIndex = this.getStageIndex(stageId);
    
    if (targetIndex !== currentIndex) return this.progress;
    
    const step = ONBOARDING_STEPS[currentIndex];
    if (!step.skippable) return { error: "This step cannot be skipped" };
    
    this.progress.skippedStages.push(stageId);
    
    const nextStep = ONBOARDING_STEPS[currentIndex + 1];
    if (nextStep) {
      this.progress.currentStage = nextStep.id;
    } else {
      this.progress.currentStage = ONBOARDING_STAGES.COMPLETE;
      this.progress.completedAt = new Date().toISOString();
    }
    
    this.save();
    this.notify("stage_skipped", { stage: stageId, progress: this.progress });
    
    publish("onboarding.stage_skipped", { stage: stageId, progress: this.progress });
    return this.progress;
  }

  setLocale(locale) {
    if (typeof locale !== "string" || !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(locale)) return { error: "Invalid locale" };
    this.progress.locale = locale;
    setSetting("language.primary", locale);
    this.save();
    return this.progress;
  }

  setAccessibility(options) {
    if (!options || typeof options !== "object" || Array.isArray(options)) return this.getProgress();
    const safeOptions = Object.fromEntries(Object.entries(options).filter(([key, value]) => /^[a-zA-Z][\w-]{0,47}$/.test(key) && typeof value === "boolean"));
    this.progress.accessibility = { ...this.progress.accessibility, ...safeOptions };
    if (safeOptions.highContrast) setSetting("accessibility.high_contrast", true);
    if (safeOptions.largeTargets) setSetting("accessibility.large_targets", true);
    if (safeOptions.reducedMotion) setSetting("accessibility.reduced_motion", true);
    if (safeOptions.dyslexiaFriendly) setSetting("accessibility.dyslexia_friendly", true);
    this.save();
    return this.progress;
  }

  setStarterSpaceSelections(spaceIds) {
    if (!Array.isArray(spaceIds)) return { error: "Starter space selections must be a list" };
    const normalized = [...new Set(spaceIds.filter((id) => typeof id === "string" && STARTER_SPACE_ID.test(id)))];
    if (normalized.length > MAX_STARTER_SPACE_SELECTIONS || normalized.length !== spaceIds.length) {
      return { error: `Choose up to ${MAX_STARTER_SPACE_SELECTIONS} valid starter spaces` };
    }
    const previous = [...this.progress.starterSpaceSelections];
    const scope = this.accountScope;
    this.progress.starterSpaceSelections = normalized;
    const saved = this.save();
    if (!saved.success) {
      if (scope === this.accountScope && scope === getAccountScope()) this.progress.starterSpaceSelections = previous;
      return { error: "Could not safely save starter Spaces", status: saved.status };
    }
    const payload = { accountScope: scope, selections: [...normalized] };
    this.notify("starter_spaces_updated", payload);
    publish("onboarding.starter_spaces_updated", payload);
    return [...normalized];
  }

  setMotivations(motivationIds) {
    const normalized = normalizeMotivationSelections(motivationIds);
    if (!normalized) return { error: "Choose up to eight valid, unique motivations" };
    const previous = this.progress.motivationSelections;
    const scope = this.accountScope;
    this.progress.motivationSelections = normalized;
    const result = this.save();
    if (!result.success) {
      if (scope === this.accountScope && scope === getAccountScope()) this.progress.motivationSelections = previous;
      return { error: "Could not safely save motivations", status: result.status };
    }
    this.notify("motivations_updated", this.getProgress());
    return [...normalized];
  }

  getMotivations() {
    return [...this.progress.motivationSelections];
  }

  getPurposeSetup() {
    return {
      complete: this.progress.purposeSetupComplete,
      selections: [...this.progress.purposeSelections],
      customGoal: this.progress.customPurposeGoal,
    };
  }

  savePurposeSetup(purposeIds, customGoal = "") {
    const selections = normalizePurposeSelections(purposeIds);
    if (!selections || selections.length === 0) return { error: "Choose one or more valid, unique HEY purposes" };
    if (typeof customGoal !== "string" || customGoal.length > MAX_CUSTOM_PURPOSE_CHARS || (selections.includes("custom") && !customGoal.trim()) || (!selections.includes("custom") && customGoal.trim())) {
      return { error: "Add a custom goal up to 500 characters only when Custom is selected" };
    }
    const normalizedGoal = customGoal.trim();
    const previous = this.getPurposeSetup();
    const scope = this.accountScope;
    this.progress.purposeSelections = selections;
    this.progress.customPurposeGoal = normalizedGoal;
    this.progress.purposeSetupComplete = true;
    const result = this.save();
    if (!result.success) {
      if (scope === this.accountScope && scope === getAccountScope()) {
        this.progress.purposeSelections = previous.selections;
        this.progress.customPurposeGoal = previous.customGoal;
        this.progress.purposeSetupComplete = previous.complete;
      }
      return { error: "Could not safely save HEY purposes", status: result.status };
    }
    const payload = { accountScope: scope, ...this.getPurposeSetup() };
    this.notify("purposes_updated", payload);
    publish("onboarding.purposes_updated", payload);
    return this.getPurposeSetup();
  }

  skipPurposeSetup() {
    const previous = this.getPurposeSetup();
    const scope = this.accountScope;
    this.progress.purposeSelections = [];
    this.progress.customPurposeGoal = "";
    this.progress.purposeSetupComplete = true;
    const result = this.save();
    if (!result.success) {
      if (scope === this.accountScope && scope === getAccountScope()) {
        this.progress.purposeSelections = previous.selections;
        this.progress.customPurposeGoal = previous.customGoal;
        this.progress.purposeSetupComplete = previous.complete;
      }
      return { error: "Could not safely save the onboarding choice", status: result.status };
    }
    const payload = { accountScope: scope, ...this.getPurposeSetup() };
    this.notify("purposes_updated", payload);
    publish("onboarding.purposes_updated", payload);
    return this.getPurposeSetup();
  }

  rankStarterSuggestions(motivationIds = this.progress.motivationSelections) {
    const normalized = normalizeMotivationSelections(motivationIds) || [];
    const scores = new Map(STARTER_SUGGESTIONS.map(({ id }) => [id, 0]));
    for (const motivationId of normalized) {
      for (const [suggestionId, weight] of Object.entries(MOTIVATION_STARTER_WEIGHTS[motivationId])) {
        scores.set(suggestionId, scores.get(suggestionId) + weight);
      }
    }
    return STARTER_SUGGESTIONS
      .map((suggestion, index) => ({ suggestion, score: scores.get(suggestion.id), index }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(({ suggestion, score }) => ({ ...suggestion, score }));
  }

  selectPracticeTask(taskId) {
    const task = PRACTICE_TASKS.find(t => t.id === taskId);
    if (!task) return { error: "Invalid practice task" };
    
    this.progress.practiceTaskId = taskId;
    this.save();
    return { task, progress: this.progress };
  }

  completePracticeTask(result) {
    this.progress.practiceTaskCompleted = true;
    this.progress.practiceTaskResult = result;
    this.save();
    this.notify("practice_completed", { progress: this.progress });
    return this.progress;
  }

  dismissSuggestion(suggestionId) {
    this.progress.dismissedSuggestions.add(suggestionId);
    this.save();
  }

  isSuggestionDismissed(suggestionId) {
    return this.progress.dismissedSuggestions.has(suggestionId);
  }

  reset() {
    this.progress = createInitialProgress();
    this.save();
    this.notify("reset", this.progress);
    return this.progress;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Onboarding listener error:", err); }
    });
  }
}

export class TutorialEngine {
  constructor() {
    this.tutorials = new Map();
    this.progress = new Map();
    this.load();
    this.unsubscribeAccountScope = subscribeAccountScope(() => this.load());
  }

  load() {
    try {
      this.progress.clear();
      const stored = safeStorage.getItem(getAccountStorageKey(TUTORIAL_STORAGE_KEY));
      if (stored) {
        const parsed = JSON.parse(stored);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
        Object.entries(parsed).forEach(([key, value]) => {
          if (!/^[a-z0-9][a-z0-9_.:-]{0,99}$/i.test(key) || !value || typeof value !== "object" || Array.isArray(value)) return;
          const completedSteps = Array.isArray(value.completedSteps) ? value.completedSteps.filter((step) => Number.isInteger(step) && step >= 0 && step < 1000) : [];
          this.progress.set(key, {
            capabilityId: key,
            startedAt: typeof value.startedAt === "string" ? value.startedAt.slice(0, 64) : null,
            completedAt: typeof value.completedAt === "string" ? value.completedAt.slice(0, 64) : null,
            currentStep: Number.isInteger(value.currentStep) && value.currentStep >= 0 ? Math.min(value.currentStep, 1000) : 0,
            completedSteps: [...new Set(completedSteps)],
            skipped: value.skipped === true,
          });
        });
      }
    } catch (err) {
      console.warn("Failed to load tutorial progress:", err);
    }
  }

  save() {
    try {
      safeStorage.setItem(getAccountStorageKey(TUTORIAL_STORAGE_KEY), JSON.stringify(Object.fromEntries(this.progress)));
    } catch (err) {
      console.warn("Failed to save tutorial progress:", err);
    }
  }

  registerTutorial(tutorial) {
    this.tutorials.set(tutorial.capabilityId, tutorial);
  }

  getTutorial(capabilityId) {
    return this.tutorials.get(capabilityId) || null;
  }

  getProgress(capabilityId) {
    return this.progress.get(capabilityId) || { completedSteps: [], skipped: false, startedAt: null, completedAt: null };
  }

  startTutorial(capabilityId) {
    const tutorial = this.tutorials.get(capabilityId);
    if (!tutorial) return { error: "Tutorial not found" };
    
    const prog = { 
      capabilityId, 
      startedAt: new Date().toISOString(), 
      completedSteps: [], 
      currentStep: 0,
      skipped: false,
    };
    this.progress.set(capabilityId, prog);
    this.save();
    
    publish("tutorial.started", { capabilityId, tutorial });
    return { tutorial, progress: prog };
  }

  completeStep(capabilityId, stepIndex) {
    const prog = this.progress.get(capabilityId);
    if (!prog) return { error: "Tutorial not started" };
    
    if (!prog.completedSteps.includes(stepIndex)) {
      prog.completedSteps.push(stepIndex);
    }
    prog.currentStep = Math.max(prog.currentStep, stepIndex + 1);
    this.save();
    
    publish("tutorial.step_completed", { capabilityId, stepIndex, progress: prog });
    return prog;
  }

  skipTutorial(capabilityId) {
    const prog = this.progress.get(capabilityId);
    if (!prog) return { error: "Tutorial not started" };
    
    prog.skipped = true;
    prog.completedAt = new Date().toISOString();
    this.save();
    
    publish("tutorial.skipped", { capabilityId, progress: prog });
    return prog;
  }

  completeTutorial(capabilityId) {
    const prog = this.progress.get(capabilityId);
    if (!prog) return { error: "Tutorial not started" };
    
    const tutorial = this.tutorials.get(capabilityId);
    if (tutorial && prog.completedSteps.length < tutorial.steps.length) {
      return { error: "Not all steps completed" };
    }
    
    prog.completedAt = new Date().toISOString();
    this.save();
    
    publish("tutorial.completed", { capabilityId, progress: prog });
    recordAudit({ action: "tutorial.completed", status: "completed", metadata: { capabilityId } });
    return prog;
  }

  resetTutorial(capabilityId) {
    this.progress.delete(capabilityId);
    this.save();
  }
}

export const onboardingEngine = new OnboardingEngine();
export const tutorialEngine = new TutorialEngine();

export function startOnboarding() {
  return onboardingEngine.start();
}

export function getOnboardingProgress() {
  return onboardingEngine.getProgress();
}

export function completeOnboardingStage(stageId, data) {
  return onboardingEngine.completeStage(stageId, data);
}

export function skipOnboardingStage(stageId) {
  return onboardingEngine.skipStage(stageId);
}

export function setOnboardingLocale(locale) {
  return onboardingEngine.setLocale(locale);
}

export function setOnboardingAccessibility(options) {
  return onboardingEngine.setAccessibility(options);
}

export function setOnboardingStarterSpaces(spaceIds) {
  return onboardingEngine.setStarterSpaceSelections(spaceIds);
}

export function getOnboardingStarterSpaces() {
  return onboardingEngine.getProgress().starterSpaceSelections;
}

export function setOnboardingMotivations(motivationIds) {
  return onboardingEngine.setMotivations(motivationIds);
}

export function getOnboardingMotivations() {
  return onboardingEngine.getMotivations();
}

export function getOnboardingPurposeSetup() {
  return onboardingEngine.getPurposeSetup();
}

export function saveOnboardingPurposeSetup(purposeIds, customGoal) {
  return onboardingEngine.savePurposeSetup(purposeIds, customGoal);
}

export function skipOnboardingPurposeSetup() {
  return onboardingEngine.skipPurposeSetup();
}

export function rankOnboardingStarterSuggestions(motivationIds) {
  return onboardingEngine.rankStarterSuggestions(motivationIds);
}

export function selectPracticeTask(taskId) {
  return onboardingEngine.selectPracticeTask(taskId);
}

export function completePracticeTask(result) {
  return onboardingEngine.completePracticeTask(result);
}

export function getPracticeTasks() {
  return PRACTICE_TASKS;
}

export function getOnboardingSteps() {
  return ONBOARDING_STEPS;
}

export function dismissOnboardingSuggestion(suggestionId) {
  onboardingEngine.dismissSuggestion(suggestionId);
}

export function isOnboardingSuggestionDismissed(suggestionId) {
  return onboardingEngine.isSuggestionDismissed(suggestionId);
}

export function resetOnboarding() {
  return onboardingEngine.reset();
}

export function subscribeToOnboarding(listener) {
  return onboardingEngine.subscribe(listener);
}

export function registerTutorial(tutorial) {
  tutorialEngine.registerTutorial(tutorial);
}

export function getTutorial(capabilityId) {
  return tutorialEngine.getTutorial(capabilityId);
}

export function getTutorialProgress(capabilityId) {
  return tutorialEngine.getProgress(capabilityId);
}

export function startTutorial(capabilityId) {
  return tutorialEngine.startTutorial(capabilityId);
}

export function completeTutorialStep(capabilityId, stepIndex) {
  return tutorialEngine.completeStep(capabilityId, stepIndex);
}

export function skipTutorial(capabilityId) {
  return tutorialEngine.skipTutorial(capabilityId);
}

export function completeTutorial(capabilityId) {
  return tutorialEngine.completeTutorial(capabilityId);
}

export function resetTutorial(capabilityId) {
  tutorialEngine.resetTutorial(capabilityId);
}

export { ONBOARDING_STAGES, ONBOARDING_STEPS, PRACTICE_TASKS };

export default { onboardingEngine, tutorialEngine };
