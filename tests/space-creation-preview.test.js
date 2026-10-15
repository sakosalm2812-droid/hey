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
    assert.deepEqual(new SpaceCreationEngine().getSpaces().map((space) => space.name), ["Private B"]);

    setAccountScope("space-isolation-a");
    assert.deepEqual(engine.getSpaces(), []);
    const previewAgain = engine.previewNaturalLanguageRequest({ prompt: "Create a space called Private A" });
    engine.confirmNaturalLanguagePreview({ previewId: previewAgain.previewId, confirm: true });
    const storedA = JSON.parse(storage.getItem(getAccountStorageKey("hey_spaces")));
    assert.equal(storedA.accountScope, "account:space-isolation-a");
    assert.equal(Object.values(storedA.spaces)[0].name, "Private A");
    assert.deepEqual(new SpaceCreationEngine().getSpaces().map((space) => space.name), ["Private A"]);
    assert.notEqual(getAccountStorageKey("hey_spaces", "account:space-isolation-a"), getAccountStorageKey("hey_spaces", "account:space-isolation-b"));
  } finally { setAccountScope(previousScope); }
}));

test("preview IDs are local to their engine and account scope is never caller supplied", () => withStorage(() => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-engine-owner-a");
    const owner = new SpaceCreationEngine();
    const otherEngine = new SpaceCreationEngine();
    const preview = owner.previewNaturalLanguageRequest({ prompt: "Create a space called Account A" });
    assert.equal(typeof preview.previewId, "string", JSON.stringify(preview));

    assert.match(otherEngine.confirmNaturalLanguagePreview({ previewId: preview.previewId, confirm: true }).error, /not found or already used/);
    assert.match(owner.confirmNaturalLanguagePreview({ previewId: preview.previewId, confirm: true, accountScope: "account:space-engine-owner-b" }).error, /unsupported fields/);
    assert.equal(owner.getSpaces().length, 0);

    setAccountScope("space-engine-owner-b");
    const accountB = new SpaceCreationEngine();
    assert.match(accountB.confirmNaturalLanguagePreview({ previewId: preview.previewId, confirm: true }).error, /not found or already used/);
    assert.deepEqual(accountB.getSpaces(), []);
  } finally { setAccountScope(previousScope); }
}));

test("confirmation is consumed before reentrant persistence and failed writes are not reported as success", () => withStorage(() => {
  const previousScope = "spaces-preview-previous";
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  setAccountScope(previousScope);
  try {
    setAccountScope("space-reentrant-owner");
    const engine = new SpaceCreationEngine();
    const preview = engine.previewNaturalLanguageRequest({ prompt: "Create a space called Exactly once" });
    let reentrantResult;
    const reentrantStorage = {
      getItem: () => null,
      setItem: () => {
        reentrantResult = engine.confirmNaturalLanguagePreview({ previewId: preview.previewId, confirm: true });
      },
      removeItem: () => {},
    };
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: reentrantStorage });

    const result = engine.confirmNaturalLanguagePreview({ previewId: preview.previewId, confirm: true });
    assert.equal(result.error, "Space could not be saved");
    assert.match(reentrantResult.error, /not found or already used/);
    assert.deepEqual(engine.getSpaces(), []);

    const failingStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: failingStorage });
    const failedPreview = engine.previewNaturalLanguageRequest({ prompt: "Create a space called Unpersisted" });
    const failed = engine.confirmNaturalLanguagePreview({ previewId: failedPreview.previewId, confirm: true });
    assert.equal(failed.error, "Space could not be saved");
    assert.deepEqual(engine.getSpaces(), []);
    assert.match(engine.confirmNaturalLanguagePreview({ previewId: failedPreview.previewId, confirm: true }).error, /not found or already used/);
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else delete globalThis.localStorage;
    setAccountScope(previousScope);
  }
}));

test("storage read failures surface as load errors and retry recovers previously saved Spaces", () => withStorage(() => {
  const previousScope = "spaces-preview-previous";
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  setAccountScope(previousScope);
  try {
    setAccountScope("space-storage-read-owner");
    const owner = new SpaceCreationEngine();
    const preview = owner.previewNaturalLanguageRequest({ prompt: "Create a space called Existing data" });
    assert.equal(owner.confirmNaturalLanguagePreview({ previewId: preview.previewId, confirm: true }).success, true);

    const unavailableStorage = {
      getItem() { throw new Error("blocked by browser"); },
      setItem() { throw new Error("blocked by browser"); },
      removeItem() {},
    };
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: unavailableStorage });
    const unreadable = new SpaceCreationEngine();
    assert.throws(() => unreadable.getSpaces(), /storage could not be read/);
    assert.match(unreadable.previewNaturalLanguageRequest({ prompt: "Create a space called Must not overwrite" }).error, /storage could not be read/);

    Object.defineProperty(globalThis, "localStorage", previousStorage);
    assert.deepEqual(unreadable.getSpaces().map((space) => space.name), ["Existing data"]);
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else delete globalThis.localStorage;
    setAccountScope(previousScope);
  }
}));

test("corrupt or unsupported stored Space data blocks creation instead of being overwritten", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-storage-corrupt-owner");
    const key = getAccountStorageKey("hey_spaces");
    storage.setItem(key, JSON.stringify({ contractVersion: 99, accountScope: "space-storage-corrupt-owner", spaces: {} }));
    const unsupported = new SpaceCreationEngine();
    assert.throws(() => unsupported.getSpaces(), /storage could not be read/);
    assert.match(unsupported.previewNaturalLanguageRequest({ prompt: "Create a space called Keep old version" }).error, /storage could not be read/);
    assert.equal(JSON.parse(storage.getItem(key)).contractVersion, 99);

    storage.setItem(key, JSON.stringify({
      contractVersion: 1,
      accountScope: "space-storage-corrupt-owner",
      spaces: { lost: { id: "wrong-id", accountScope: "space-storage-corrupt-owner", name: "Hidden data", visibility: "private", sharing: "off" } },
    }));
    assert.throws(() => unsupported.getSpaces(), /storage could not be read/);
    assert.match(unsupported.previewNaturalLanguageRequest({ prompt: "Create a space called Keep damaged row" }).error, /storage could not be read/);
  } finally {
    setAccountScope(previousScope);
  }
}));
