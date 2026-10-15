import test from "node:test";
import assert from "node:assert/strict";
import { getAccountStorageKey, setAccountScope } from "../src/core/accountScope.js";
import { OnboardingEngine } from "../src/core/onboardingEngine.js";
import { SPACE_CREATION_LIMITS, SpaceCreationEngine } from "../src/core/spaceCreationEngine.js";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function withStorage(callback) {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  try { return callback(storage); }
  finally {
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else delete globalThis.localStorage;
  }
}

test("multi-select starter choices remain onboarding preferences and never create Spaces", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("spaces-preferences-only");
    const onboarding = new OnboardingEngine();
    const spaces = new SpaceCreationEngine();
    assert.deepEqual(onboarding.setStarterSpaceSelections(["personal", "work", "learning"]), ["personal", "work", "learning"]);
    assert.deepEqual(onboarding.getProgress().starterSpaceSelections, ["personal", "work", "learning"]);
    assert.deepEqual(spaces.getSpaces(), []);
    assert.equal(storage.getItem(getAccountStorageKey("hey_spaces")), null);
  } finally { setAccountScope(previousScope); }
}));

test("natural-language creation preview is safe, non-mutating, and requires explicit confirmation", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-preview-owner");
    const engine = new SpaceCreationEngine();
    const preview = engine.previewNaturalLanguageRequest({ prompt: 'Create a private space called "Weekend planning"' });
    assert.equal(preview.action, "create_private_space");
    assert.equal(preview.space.name, "Weekend planning");
    assert.equal(preview.space.visibility, "private");
    assert.equal(preview.space.sharing, "off");
    assert.equal(preview.permissionsChanged, false);
    assert.equal(preview.requiresConfirmation, true);
    assert.deepEqual(engine.getSpaces(), []);
    assert.equal(storage.getItem(getAccountStorageKey("hey_spaces")), null);

    preview.space.name = "Tampered response";
    assert.match(engine.confirmNaturalLanguagePreview({ previewId: preview.previewId, confirm: false }).error, /Explicit confirmation/);
    assert.deepEqual(engine.getSpaces(), []);
    const confirmed = engine.confirmNaturalLanguagePreview({ previewId: preview.previewId, confirm: true });
    assert.equal(confirmed.success, true);
    assert.equal(confirmed.space.name, "Weekend planning");
    assert.equal(confirmed.space.visibility, "private");
    assert.equal(confirmed.space.sharing, "off");
    assert.equal("permissions" in confirmed.space, false);
    assert.equal(confirmed.permissionsChanged, false);
    confirmed.space.name = "Changed client object";
    assert.equal(engine.getSpaces().length, 1);
    assert.equal(engine.getSpaces()[0].name, "Weekend planning");
    assert.match(storage.getItem(getAccountStorageKey("hey_spaces")), /Weekend planning/);
    assert.match(engine.confirmNaturalLanguagePreview({ previewId: preview.previewId, confirm: true }).error, /not found or already used/);
  } finally { setAccountScope(previousScope); }
}));

test("malformed, accessor, oversized, and permission-escalation requests are rejected", () => withStorage(() => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope(null);
    const anonymousEngine = new SpaceCreationEngine();
    assert.match(anonymousEngine.previewNaturalLanguageRequest({ prompt: "Create a space called Unscoped" }).error, /account scope is required/);
    setAccountScope("space-validation-owner");
    const engine = new SpaceCreationEngine();
    assert.match(engine.previewNaturalLanguageRequest(null).error, /plain object/);
    assert.match(engine.previewNaturalLanguageRequest({ prompt: "hello" }).error, /Use/);
    assert.match(engine.previewNaturalLanguageRequest({ prompt: `Create a space called ${"x".repeat(SPACE_CREATION_LIMITS.maxPromptLength)}` }).error, /too long/);
    assert.match(engine.previewNaturalLanguageRequest({ prompt: "Create a public space called Planning" }).error, /Sharing and permission/);
    assert.match(engine.previewNaturalLanguageRequest({ prompt: "Create a space called Planning", permissions: ["admin"] }).error, /unsupported fields/);
    let getterCalled = false;
    const accessorRequest = Object.defineProperty({}, "prompt", { enumerable: true, get() { getterCalled = true; return "Create a space called Unsafe"; } });
    assert.match(engine.previewNaturalLanguageRequest(accessorRequest).error, /Accessor/);
    assert.equal(getterCalled, false);
    const hostileProxy = new Proxy({}, { ownKeys() { throw new Error("hostile"); } });
    assert.match(engine.previewNaturalLanguageRequest(hostileProxy).error, /safely inspected/);
    const revokedProxy = Proxy.revocable({}, {});
    revokedProxy.revoke();
    assert.match(engine.previewNaturalLanguageRequest(revokedProxy.proxy).error, /plain object/);
    assert.deepEqual(engine.getSpaces(), []);
  } finally { setAccountScope(previousScope); }
}));

test("account changes invalidate previews and keep created Spaces isolated", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-isolation-a");
    const engine = new SpaceCreationEngine();
    const previewA = engine.previewNaturalLanguageRequest({ prompt: "Create a space called Private A" });
    setAccountScope("space-isolation-b");
    assert.deepEqual(engine.getSpaces(), []);
    assert.match(engine.confirmNaturalLanguagePreview({ previewId: previewA.previewId, confirm: true }).error, /not found or already used|scope/);
    const previewB = engine.previewNaturalLanguageRequest({ prompt: "Create a space called Private B" });
    const createdB = engine.confirmNaturalLanguagePreview({ previewId: previewB.previewId, confirm: true });
    assert.equal(createdB.space.accountScope, "account:space-isolation-b");
    const storedB = JSON.parse(storage.getItem(getAccountStorageKey("hey_spaces")));
    assert.equal(storedB.accountScope, "account:space-isolation-b");
    assert.equal(Object.values(storedB.spaces)[0].name, "Private B");

    setAccountScope("space-isolation-a");
    assert.deepEqual(engine.getSpaces(), []);
    const previewAgain = engine.previewNaturalLanguageRequest({ prompt: "Create a space called Private A" });
    engine.confirmNaturalLanguagePreview({ previewId: previewAgain.previewId, confirm: true });
    const storedA = JSON.parse(storage.getItem(getAccountStorageKey("hey_spaces")));
    assert.equal(storedA.accountScope, "account:space-isolation-a");
    assert.equal(Object.values(storedA.spaces)[0].name, "Private A");
    assert.notEqual(getAccountStorageKey("hey_spaces", "account:space-isolation-a"), getAccountStorageKey("hey_spaces", "account:space-isolation-b"));
  } finally { setAccountScope(previousScope); }
}));
