import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";
import { setSetting } from "./settingsRegistry.js";
import { safeStorage } from "../lib/safeStorage.js";

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

class OnboardingEngine {
  constructor() {
    this.progress = {
      currentStage: ONBOARDING_STAGES.WELCOME,
      completedStages: [],
      skippedStages: [],
      startedAt: null,
      completedAt: null,
      practiceTaskId: null,
      practiceTaskCompleted: false,
      locale: "en",
      accessibility: {},
      dismissedSuggestions: new Set(),
    };
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = safeStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.progress = { ...this.progress, ...parsed, dismissedSuggestions: new Set(parsed.dismissedSuggestions || []) };
      }
    } catch (err) {
      console.warn("Failed to load onboarding progress:", err);
    }
  }

  save() {
    try {
      const data = { ...this.progress, dismissedSuggestions: Array.from(this.progress.dismissedSuggestions) };
      safeStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn("Failed to save onboarding progress:", err);
    }
  }

  getProgress() {
    return { ...this.progress };
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
    
    Object.assign(this.progress, data);
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
    this.progress.locale = locale;
    setSetting("language.primary", locale);
    this.save();
    return this.progress;
  }

  setAccessibility(options) {
    this.progress.accessibility = { ...this.progress.accessibility, ...options };
    if (options.highContrast) setSetting("accessibility.high_contrast", true);
    if (options.largeTargets) setSetting("accessibility.large_targets", true);
    if (options.reducedMotion) setSetting("accessibility.reduced_motion", true);
    if (options.dyslexiaFriendly) setSetting("accessibility.dyslexia_friendly", true);
    this.save();
    return this.progress;
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
    this.progress = {
      currentStage: ONBOARDING_STAGES.WELCOME,
      completedStages: [],
      skippedStages: [],
      startedAt: null,
      completedAt: null,
      practiceTaskId: null,
      practiceTaskCompleted: false,
      locale: "en",
      accessibility: {},
      dismissedSuggestions: new Set(),
    };
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

class TutorialEngine {
  constructor() {
    this.tutorials = new Map();
    this.progress = new Map();
    this.load();
  }

  load() {
    try {
      const stored = safeStorage.getItem(TUTORIAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        Object.entries(parsed).forEach(([key, value]) => {
          this.progress.set(key, value);
        });
      }
    } catch (err) {
      console.warn("Failed to load tutorial progress:", err);
    }
  }

  save() {
    try {
      safeStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(Object.fromEntries(this.progress)));
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
