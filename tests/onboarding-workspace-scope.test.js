import test from "node:test";
import assert from "node:assert/strict";
import { getAccountStorageKey, setAccountScope } from "../src/core/accountScope.js";
import { subscribe as subscribeToEvent } from "../src/core/eventBus.js";
import { OnboardingEngine, TutorialEngine } from "../src/core/onboardingEngine.js";
import { getSetting } from "../src/core/settingsRegistry.js";
import { WorkspaceEngine } from "../src/core/workspaceEngine.js";

class MemoryStorage {
  values = new Map();
  blockedReads = new Set();
  blockedWrites = new Set();
  onSetItem = null;
  getItem(key) { return this.blockedReads.has(key) ? null : this.values.get(key) ?? null; }
  setItem(key, value) {
    if (this.blockedWrites.has(key)) return;
    this.values.set(key, String(value));
    this.onSetItem?.(key, String(value));
  }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

function withStorage(callback) {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storage = new MemoryStorage();
  const windowListeners = new Map();
  const windowTarget = {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener(type, listener) {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { windowListeners.get(type)?.delete(listener); },
    dispatchEvent(event) { windowListeners.get(event.type)?.forEach((listener) => listener(event)); },
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowTarget });
  try { return callback(storage, windowTarget); }
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

test("tutorial mutations roll back on storage failure and discard results after an account switch", () => withStorage((storage) => {
  const previousScope = "tutorial-persistence-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("tutorial-persistence-owner");
    const tutorial = new TutorialEngine();
    tutorial.registerTutorial({ capabilityId: "first-tour", steps: ["one", "two"] });
    tutorial.registerTutorial({ capabilityId: "switch-tour", steps: ["one"] });
    const activeKey = getAccountStorageKey("hey_tutorial_progress");
    const events = [];
    const unsubs = ["tutorial.started", "tutorial.step_completed", "tutorial.skipped", "tutorial.completed"]
      .map((name) => subscribeToEvent(name, () => events.push(name)));

    storage.blockedWrites.add(activeKey);
    const failedStart = tutorial.startTutorial("first-tour");
    assert.deepEqual(failedStart, { error: "Could not safely save tutorial progress", status: "readback_failed" });
    assert.equal(tutorial.getProgress("first-tour").startedAt, null);
    assert.deepEqual(events, []);

    storage.blockedWrites.delete(activeKey);
    assert.ok(tutorial.startTutorial("first-tour").progress.startedAt);
    storage.blockedWrites.add(activeKey);
    const before = structuredClone(tutorial.getProgress("first-tour"));
    assert.equal(tutorial.completeStep("first-tour", 0).status, "readback_failed");
    assert.deepEqual(tutorial.getProgress("first-tour"), before);
    assert.equal(tutorial.skipTutorial("first-tour").status, "readback_failed");
    assert.deepEqual(tutorial.getProgress("first-tour"), before);
    assert.deepEqual(events, ["tutorial.started"]);

    storage.blockedWrites.delete(activeKey);
    assert.equal(tutorial.completeStep("first-tour", 0).currentStep, 1);
    assert.equal(tutorial.completeStep("first-tour", 1).currentStep, 2);
    storage.blockedWrites.add(activeKey);
    const completedSteps = structuredClone(tutorial.getProgress("first-tour"));
    assert.equal(tutorial.completeTutorial("first-tour").status, "readback_failed");
    assert.deepEqual(tutorial.getProgress("first-tour"), completedSteps);
    assert.equal(tutorial.resetTutorial("first-tour").status, "readback_failed");
    assert.deepEqual(tutorial.getProgress("first-tour"), completedSteps);
    assert.deepEqual(events, ["tutorial.started", "tutorial.step_completed", "tutorial.step_completed"]);

    storage.blockedWrites.delete(activeKey);
    const nextScope = "tutorial-persistence-next-account";
    const nextKey = getAccountStorageKey("hey_tutorial_progress", `account:${nextScope}`);
    storage.onSetItem = (key) => {
      if (key === activeKey) {
        storage.onSetItem = null;
        setAccountScope(nextScope);
      }
    };
    const switched = tutorial.startTutorial("switch-tour");
    assert.deepEqual(switched, { error: "Could not safely save tutorial progress", status: "account_scope_changed" });
    assert.deepEqual(tutorial.getProgress("switch-tour"), { completedSteps: [], skipped: false, startedAt: null, completedAt: null });
    assert.equal(storage.getItem(nextKey), null, "the old account's tutorial write must not populate the new account");
    assert.deepEqual(events, ["tutorial.started", "tutorial.step_completed", "tutorial.step_completed"]);
    unsubs.forEach((unsubscribe) => unsubscribe());
  } finally { setAccountScope(previousScope); }
}));

test("onboarding synchronizes same-account storage updates and ignores foreign or malformed events", () => withStorage((storage, windowTarget) => {
  const previousScope = "spaces-test-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("onboarding-sync-owner");
    const onboarding = new OnboardingEngine();
    onboarding.setStarterSpaceSelections(["work"]);
    const updates = [];
    onboarding.subscribe((event, progress) => updates.push({ event, progress }));
    const activeKey = getAccountStorageKey("hey_onboarding_progress");
    const storageEvent = (key, newValue, storageArea = storage) => windowTarget.dispatchEvent({ type: "storage", key, newValue, storageArea });

    storageEvent(activeKey, JSON.stringify({ locale: "fr", accessibility: { largeTargets: true }, starterSpaceSelections: ["personal", "learning"], motivationSelections: ["learn", "create"], permissionGranted: true }));
    assert.equal(onboarding.getProgress().locale, "fr");
    assert.deepEqual(onboarding.getProgress().starterSpaceSelections, ["personal", "learning"]);
    assert.deepEqual(onboarding.getMotivations(), ["learn", "create"]);
    assert.equal(onboarding.getProgress().permissionGranted, undefined);
    assert.equal(updates.at(-1).event, "storage_synced");

    storageEvent(getAccountStorageKey("hey_onboarding_progress", "account:other-account"), JSON.stringify({ locale: "de" }));
    storageEvent(activeKey, "{");
    storageEvent(activeKey, "x".repeat(100_001));
    storageEvent(activeKey, JSON.stringify({ locale: "es" }), {});
    assert.equal(onboarding.getProgress().locale, "fr");
    assert.equal(updates.length, 1);

    storage.clear();
    windowTarget.dispatchEvent({ type: "storage", key: null, newValue: null, storageArea: storage });
    assert.equal(onboarding.getProgress().locale, "en");
    assert.deepEqual(onboarding.getProgress().starterSpaceSelections, []);
    assert.equal(updates.at(-1).event, "storage_synced");
    storageEvent(activeKey, JSON.stringify({ locale: "it" }));
    storageEvent(activeKey, null);
    assert.equal(onboarding.getProgress().locale, "en");
    onboarding.destroy();
    const updateCount = updates.length;
    storageEvent(activeKey, JSON.stringify({ locale: "it" }));
    assert.equal(updates.length, updateCount);
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

test("starter Space preferences notify current consumers only after scoped readback succeeds", () => withStorage((storage) => {
  const previousScope = "onboarding-starter-events-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("onboarding-starter-events-owner");
    const onboarding = new OnboardingEngine();
    const updates = [];
    onboarding.subscribe((event, payload) => updates.push({ event, payload }));
    assert.deepEqual(onboarding.setStarterSpaceSelections(["work", "learning"]), ["work", "learning"]);
    assert.deepEqual(updates, [{
      event: "starter_spaces_updated",
      payload: { accountScope: "account:onboarding-starter-events-owner", selections: ["work", "learning"] },
    }]);

    const key = getAccountStorageKey("hey_onboarding_progress");
    storage.blockedWrites.add(key);
    const failed = onboarding.setStarterSpaceSelections(["personal"]);
    assert.deepEqual(failed, { error: "Could not safely save starter Spaces", status: "readback_failed" });
    assert.deepEqual(onboarding.getProgress().starterSpaceSelections, ["work", "learning"]);
    assert.equal(updates.length, 1, "failed persistence never emits an update");
  } finally { setAccountScope(previousScope); }
}));

test("onboarding lifecycle and preference mutations roll back when durable readback fails", () => withStorage((storage) => {
  const previousScope = "onboarding-failure-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("onboarding-failure-owner");
    const onboarding = new OnboardingEngine();
    const activeKey = getAccountStorageKey("hey_onboarding_progress");
    const updates = [];
    onboarding.subscribe((event) => updates.push(event));

    storage.blockedWrites.add(activeKey);
    const failedStart = onboarding.start();
    assert.deepEqual(failedStart, { error: "Could not safely start onboarding", status: "readback_failed" });
    assert.equal(onboarding.getProgress().startedAt, null);
    assert.deepEqual(updates, []);

    storage.blockedWrites.delete(activeKey);
    assert.ok(onboarding.start().startedAt);
    onboarding.completeStage("locale_accessibility");
    onboarding.completeStage("workspace_intro");
    updates.length = 0;
    const before = onboarding.getProgress();
    const previousLanguage = getSetting("language.primary");
    const previousLargeTargets = getSetting("accessibility.large_targets");
    storage.blockedWrites.add(activeKey);

    const failedMutations = [
      onboarding.completeStage("practice_task"),
      onboarding.skipStage("workspace_intro"),
      onboarding.setLocale("fr"),
      onboarding.setAccessibility({ largeTargets: true }),
      onboarding.selectPracticeTask("create_note"),
      onboarding.completePracticeTask("memory_stored"),
      onboarding.dismissSuggestion("space-research"),
      onboarding.reset(),
    ];
    for (const result of failedMutations) {
      assert.equal(result.status, "readback_failed");
      assert.match(result.error, /safely/);
      assert.deepEqual(onboarding.getProgress(), before);
    }
    assert.equal(getSetting("language.primary"), previousLanguage, "failed onboarding save must not change global language");
    assert.equal(getSetting("accessibility.large_targets"), previousLargeTargets, "failed onboarding save must not change global accessibility");
    assert.deepEqual(updates, [], "failed saves never announce lifecycle or practice completion");
  } finally { setAccountScope(previousScope); }
}));

test("onboarding restores malformed persisted state to safe defaults", () => withStorage((storage) => {
  const previousScope = "spaces-test-previous";
  setAccountScope(previousScope);
  try {
    storage.setItem(getAccountStorageKey("hey_onboarding_progress"), JSON.stringify({ currentStage: "root", completedStages: { forged: true }, skippedStages: ["unknown"], practiceTaskId: "invoke-admin", locale: "../../", accessibility: ["malformed"], starterSpaceSelections: ["../x", {}, "valid_space"], motivationSelections: ["organize_work", "../../private"] }));
    const onboarding = new OnboardingEngine();
    const progress = onboarding.getProgress();
    assert.equal(progress.currentStage, "welcome");
    assert.deepEqual(progress.completedStages, []);
    assert.deepEqual(progress.skippedStages, []);
    assert.equal(progress.practiceTaskId, null);
    assert.equal(progress.locale, "en");
    assert.deepEqual(progress.accessibility, {});
    assert.deepEqual(progress.starterSpaceSelections, ["valid_space"]);
    assert.deepEqual(progress.motivationSelections, []);
    storage.setItem(getAccountStorageKey("hey_onboarding_progress"), "x".repeat(100_001));
    assert.deepEqual(new OnboardingEngine().getMotivations(), []);
  } finally { setAccountScope(previousScope); }
}));

test("onboarding motivations are account-scoped, validated, read back, and only rank starter suggestions", () => withStorage((storage) => {
  const previousScope = "spaces-test-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("motivation-owner-a");
    const onboardingA = new OnboardingEngine();
    const initialStage = onboardingA.getCurrentStage();
    const selected = ["organize_work", "learn", "privacy"];
    assert.deepEqual(onboardingA.setMotivations(selected), selected);
    selected[0] = "forged";
    assert.deepEqual(onboardingA.getMotivations(), ["organize_work", "learn", "privacy"]);
    assert.deepEqual(onboardingA.getProgress().motivationSelections, ["organize_work", "learn", "privacy"]);
    assert.equal(onboardingA.getCurrentStage(), initialStage);
    assert.equal(onboardingA.getProgress().permissionGranted, undefined);

    for (const invalid of [
      "learn",
      ["unknown"],
      ["learn", "learn"],
      ["learn", "privacy", "create", "save_time", "coordinate", "manage_personal", "organize_work", "accessibility", "unknown"],
      Object.assign(["learn"], { extra: true }),
      Object.assign(["learn"], { 9: "privacy" }),
      (() => { const value = ["learn"]; Object.defineProperty(value, "0", { get() { throw new Error("hostile getter"); } }); return value; })(),
      new Proxy(["learn"], { ownKeys() { throw new Error("hostile proxy"); } }),
      (() => { const { proxy, revoke } = Proxy.revocable([], {}); revoke(); return proxy; })(),
    ]) assert.ok(onboardingA.setMotivations(invalid).error);
    assert.deepEqual(onboardingA.getMotivations(), ["organize_work", "learn", "privacy"]);

    const ranked = onboardingA.rankStarterSuggestions();
    assert.deepEqual(ranked.map(({ id }) => id), ["work", "learning", "personal"]);
    assert.deepEqual(onboardingA.rankStarterSuggestions([]).map(({ id, score }) => [id, score]), [["personal", 0], ["work", 0], ["learning", 0]]);
    assert.equal(ranked.length, 3);

    const keyA = getAccountStorageKey("hey_onboarding_progress");
    assert.deepEqual(JSON.parse(storage.getItem(keyA)).motivationSelections, ["organize_work", "learn", "privacy"]);
    setAccountScope("motivation-owner-b");
    const onboardingB = new OnboardingEngine();
    assert.deepEqual(onboardingB.getMotivations(), []);
    assert.deepEqual(onboardingB.rankStarterSuggestions().map(({ id }) => id), ["personal", "work", "learning"]);
    assert.deepEqual(onboardingB.setMotivations(["manage_personal"]), ["manage_personal"]);
    setAccountScope("motivation-owner-a");
    const restored = new OnboardingEngine();
    assert.deepEqual(restored.getMotivations(), ["organize_work", "learn", "privacy"]);

    const activeKey = getAccountStorageKey("hey_onboarding_progress");
    storage.blockedReads.add(activeKey);
    assert.match(restored.setMotivations(["create"]).error, /safely save/);
    assert.deepEqual(restored.getMotivations(), ["organize_work", "learn", "privacy"]);
    storage.blockedReads.delete(activeKey);
    setAccountScope("motivation-owner-c");
    const onboardingC = new OnboardingEngine();
    const keyC = getAccountStorageKey("hey_onboarding_progress");
    storage.blockedWrites.add(keyC);
    assert.match(onboardingC.setMotivations(["create"]).error, /safely save/);
    assert.deepEqual(onboardingC.getMotivations(), []);
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
