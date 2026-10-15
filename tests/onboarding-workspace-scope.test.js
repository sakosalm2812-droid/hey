import test from "node:test";
import assert from "node:assert/strict";
import { getAccountStorageKey, setAccountScope } from "../src/core/accountScope.js";
import { OnboardingEngine, TutorialEngine } from "../src/core/onboardingEngine.js";
import { WorkspaceEngine } from "../src/core/workspaceEngine.js";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function withStorage(callback) {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { innerWidth: 1280, innerHeight: 800 } });
  try { return callback(storage); }
  finally {
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else delete globalThis.localStorage;
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
  }
}

test("onboarding and tutorial data remain private per account and reload from scoped keys", () => withStorage((storage) => {
  const previousScope = "spaces-test-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("onboarding-owner-a");
    const onboardingA = new OnboardingEngine();
    onboardingA.start();
    assert.deepEqual(onboardingA.setStarterSpaceSelections(["personal", "work", "learning"]), ["personal", "work", "learning"]);
    assert.equal(storage.getItem(getAccountStorageKey("hey_onboarding_progress")).includes("starterSpaceSelections"), true);
    const tutorialsA = new TutorialEngine();
    tutorialsA.registerTutorial({ capabilityId: "starter-tour", steps: ["one"] });
    tutorialsA.startTutorial("starter-tour");

    setAccountScope("onboarding-owner-b");
    const onboardingB = new OnboardingEngine();
    assert.deepEqual(onboardingB.getProgress().starterSpaceSelections, []);
    assert.equal(onboardingB.getCurrentStage(), "welcome");
    const tutorialsB = new TutorialEngine();
    assert.deepEqual(tutorialsB.getProgress("starter-tour").completedSteps, []);
    tutorialsB.startTutorial("starter-tour");
    assert.notEqual(getAccountStorageKey("hey_onboarding_progress", "account:onboarding-owner-a"), getAccountStorageKey("hey_onboarding_progress", "account:onboarding-owner-b"));

    setAccountScope("onboarding-owner-a");
    const restored = new OnboardingEngine();
    assert.deepEqual(restored.getProgress().starterSpaceSelections, ["personal", "work", "learning"]);
    assert.equal(restored.getCurrentStage(), "welcome");
  } finally { setAccountScope(previousScope); }
}));

test("starter space personalization rejects malformed input and cannot alter permissions or stage", () => withStorage(() => {
  const previousScope = "spaces-test-previous";
  setAccountScope(previousScope);
  try {
    const onboarding = new OnboardingEngine();
    assert.deepEqual(onboarding.setStarterSpaceSelections(["work", "learning"]), ["work", "learning"]);
    assert.match(onboarding.setStarterSpaceSelections(["work", "../private"] ).error, /valid starter spaces/);
    assert.match(onboarding.setStarterSpaceSelections("work").error, /list/);
    onboarding.completeStage("locale_accessibility", { currentStage: "complete", completedStages: ["permissions"], permissionGranted: true, starterSpaceSelections: ["../../private"] });
    assert.equal(onboarding.getProgress().currentStage, "locale_accessibility");
    assert.deepEqual(onboarding.getProgress().completedStages, ["locale_accessibility"]);
    assert.deepEqual(onboarding.getProgress().starterSpaceSelections, ["work", "learning"]);
    assert.equal(onboarding.getProgress().permissionGranted, undefined);
  } finally { setAccountScope(previousScope); }
}));

test("onboarding restores malformed persisted state to safe defaults", () => withStorage((storage) => {
  const previousScope = "spaces-test-previous";
  setAccountScope(previousScope);
  try {
    storage.setItem(getAccountStorageKey("hey_onboarding_progress"), JSON.stringify({ currentStage: "root", completedStages: { forged: true }, skippedStages: ["unknown"], practiceTaskId: "invoke-admin", locale: "../../", accessibility: ["malformed"], starterSpaceSelections: ["../x", {}, "valid_space"] }));
    const onboarding = new OnboardingEngine();
    const progress = onboarding.getProgress();
    assert.equal(progress.currentStage, "welcome");
    assert.deepEqual(progress.completedStages, []);
    assert.deepEqual(progress.skippedStages, []);
    assert.equal(progress.practiceTaskId, null);
    assert.equal(progress.locale, "en");
    assert.deepEqual(progress.accessibility, {});
    assert.deepEqual(progress.starterSpaceSelections, ["valid_space"]);
  } finally { setAccountScope(previousScope); }
}));

test("workspace widgets and layouts stay private per account, persist and reject malformed state", () => withStorage((storage) => {
  const previousScope = "spaces-test-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("workspace-owner-a");
    const workspaceA = new WorkspaceEngine();
    const widgetA = workspaceA.createWidget("notes", { title: "A private note" });
    const layoutA = workspaceA.saveLayout("Private layout");
    const scopedKeyA = getAccountStorageKey("hey_workspace");
    assert.ok(storage.getItem(scopedKeyA));

    setAccountScope("workspace-owner-b");
    const workspaceB = new WorkspaceEngine();
    assert.deepEqual(workspaceB.getAllWidgets(), []);
    assert.deepEqual(workspaceB.getLayouts(), []);
    const widgetB = workspaceB.createWidget("calendar", { title: "B only" });
    assert.notEqual(widgetA.id, widgetB.id);
    assert.equal(workspaceB.loadLayout(layoutA.id).error, "Layout not found");

    setAccountScope("workspace-owner-a");
    const restored = new WorkspaceEngine();
    assert.equal(restored.getWidget(widgetA.id).title, "A private note");
    assert.equal(restored.getLayouts()[0].name, "Private layout");

    storage.setItem(getAccountStorageKey("hey_workspace"), JSON.stringify({ widgets: [{ id: "bad" }], layouts: { x: { id: "x", widgets: "not-a-list" } }, currentLayoutId: "x" }));
    const malformed = new WorkspaceEngine();
    assert.deepEqual(malformed.getAllWidgets(), []);
    assert.deepEqual(malformed.getLayouts(), []);
    assert.equal(malformed.currentLayoutId, null);
  } finally { setAccountScope(previousScope); }
}));
