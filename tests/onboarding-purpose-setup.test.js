import test from "node:test";
import assert from "node:assert/strict";
import { getAccountScope, getAccountStorageKey, setAccountScope } from "../src/core/accountScope.js";
import { OnboardingEngine } from "../src/core/onboardingEngine.js";
import { readFileSync } from "node:fs";

class MemoryStorage {
  values = new Map();
  blockedWrites = new Set();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.blockedWrites.has(key)) return; this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function withStorage(callback) {
  const previousScope = getAccountScope().replace(/^account:/, "");
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storage = new MemoryStorage();
  const windowTarget = { addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowTarget });
  try { return callback(storage); }
  finally {
    setAccountScope(previousScope === "anonymous" ? null : previousScope);
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else delete globalThis.localStorage;
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
  }
}

test("first-run purposes persist per account and restore after account switching", () => withStorage(() => {
  setAccountScope("purpose-owner-a");
  const onboarding = new OnboardingEngine();
  assert.deepEqual(onboarding.savePurposeSetup(["teaching_learning", "custom"], "Support my classes"), {
    complete: true, selections: ["teaching_learning", "custom"], customGoal: "Support my classes",
  });
  setAccountScope("purpose-owner-b");
  assert.deepEqual(onboarding.getPurposeSetup(), { complete: false, selections: [], customGoal: "" });
  assert.deepEqual(onboarding.savePurposeSetup(["ai_assistant"]), { complete: true, selections: ["ai_assistant"], customGoal: "" });
  setAccountScope("purpose-owner-a");
  assert.deepEqual(onboarding.getPurposeSetup(), { complete: true, selections: ["teaching_learning", "custom"], customGoal: "Support my classes" });
  const reloaded = new OnboardingEngine();
  assert.deepEqual(reloaded.getPurposeSetup(), onboarding.getPurposeSetup());
  onboarding.destroy();
  reloaded.destroy();
}));

test("purpose setup rejects malformed or inconsistent choices and custom text", () => withStorage(() => {
  setAccountScope("purpose-validation-owner");
  const onboarding = new OnboardingEngine();
  assert.match(onboarding.savePurposeSetup([]).error, /Choose/);
  assert.match(onboarding.savePurposeSetup(["ai_assistant", "ai_assistant"]).error, /Choose/);
  assert.match(onboarding.savePurposeSetup(["__proto__"]).error, /Choose/);
  assert.match(onboarding.savePurposeSetup(["custom"], " ").error, /custom goal/i);
  assert.match(onboarding.savePurposeSetup(["ai_assistant"], "extra text").error, /custom goal/i);
  assert.match(onboarding.savePurposeSetup(["custom"], "x".repeat(501)).error, /custom goal/i);
  const accessorSelections = ["ai_assistant"];
  Object.defineProperty(accessorSelections, "0", { get() { throw new Error("should not run"); } });
  assert.match(onboarding.savePurposeSetup(accessorSelections).error, /Choose/);
  onboarding.destroy();
}));

test("Skip completes first-run setup, reloads, and does not grant permissions", () => withStorage(() => {
  setAccountScope("purpose-skip-owner");
  const onboarding = new OnboardingEngine();
  assert.deepEqual(onboarding.skipPurposeSetup(), { complete: true, selections: [], customGoal: "" });
  const restored = new OnboardingEngine();
  assert.deepEqual(restored.getPurposeSetup(), { complete: true, selections: [], customGoal: "" });
  assert.equal(onboarding.getProgress().permissionGranted, undefined);
  assert.equal(onboarding.getProgress().schoolMembership, undefined);
  onboarding.destroy();
  restored.destroy();
}));

test("failed persistence leaves the prior purpose choice intact", () => withStorage((storage) => {
  setAccountScope("purpose-write-owner");
  const onboarding = new OnboardingEngine();
  assert.equal(onboarding.savePurposeSetup(["ai_assistant"]).complete, true);
  const key = getAccountStorageKey("hey_onboarding_progress");
  storage.blockedWrites.add(key);
  assert.ok(onboarding.savePurposeSetup(["ai_models"]).error);
  assert.deepEqual(onboarding.getPurposeSetup(), { complete: true, selections: ["ai_assistant"], customGoal: "" });
  onboarding.destroy();
}));

test("signed-in Chat page mounts a translated, skippable, non-permission onboarding card", () => {
  const chatPage = readFileSync(new URL("../src/ChatPage.jsx", import.meta.url), "utf8");
  const component = readFileSync(new URL("../src/components/chat/FirstRunPurposeSetup.jsx", import.meta.url), "utf8");
  assert.match(chatPage, /<FirstRunPurposeSetup\s*\/>/);
  assert.match(component, /\.skipPurposeSetup\(\)/);
  assert.match(component, /type="checkbox"/);
  assert.match(component, /useLocale\(\)/);
  assert.doesNotMatch(component, /getUserMedia|requestPermission|schoolMembership|permissionGranted/);
});
