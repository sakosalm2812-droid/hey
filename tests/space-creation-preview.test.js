import test from "node:test";
import assert from "node:assert/strict";
import { getAccountStorageKey, setAccountScope } from "../src/core/accountScope.js";
import { HEY, spaces as spacesApi } from "../src/core/index.js";
import { OnboardingEngine } from "../src/core/onboardingEngine.js";
import { clearPermissions, listPermissions, seedPermissions } from "../src/core/permissionManager.js";
import { SPACE_CREATION_LIMITS, SpaceCreationEngine } from "../src/core/spaceCreationEngine.js";
import { registerTool, unregisterTool } from "../src/core/toolRegistry.js";

class MemoryStorage {
  values = new Map();
  failReads = false;
  failWrites = false;
  onSet = null;
  getItem(key) {
    if (this.failReads) throw new Error("storage unavailable");
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    if (this.failWrites) throw new Error("storage unavailable");
    this.onSet?.(key, String(value));
    this.values.set(key, String(value));
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

test("HEY exposes versioned saved Space layout preference operations to consumers", () => {
  assert.equal(spacesApi.layoutPreferencesContractVersion, 1);
  assert.equal(spacesApi.storageContractVersion, 2);
  assert.equal(typeof spacesApi.getLayoutPreferences, "function");
  assert.equal(typeof spacesApi.updateLayoutPreferences, "function");
  assert.equal(typeof spacesApi.setToolMembership, "function");
  assert.equal(typeof spacesApi.subscribe, "function");
  assert.equal(typeof spacesApi.getOnboardingSuggestions, "function");
  assert.equal(typeof spacesApi.previewDeletion, "function");
  assert.equal(typeof spacesApi.confirmDeletion, "function");
});

test("onboarding motivations produce account-bound Space suggestions and stale choices are rejected", () => withStorage(() => {
  const previousScope = "spaces-suggestion-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("spaces-suggestion-owner-a");
    HEY.onboarding.setMotivations(["organize_work", "learn"]);
    const suggestions = spacesApi.getOnboardingSuggestions();
    assert.equal(suggestions.accountScope, "account:spaces-suggestion-owner-a");
    assert.deepEqual(suggestions.motivationSelections, ["organize_work", "learn"]);
    assert.deepEqual(suggestions.suggestions.map(({ id }) => id), ["work", "learning", "personal"]);
    assert.deepEqual(spacesApi.getPrivateSpaces(), []);
    const preview = spacesApi.previewNaturalLanguageCreation(suggestions.suggestions[1].previewRequest);
    assert.equal(preview.space.name, "Learning");
    assert.equal(spacesApi.getPrivateSpaces().length, 0);
    setAccountScope("spaces-suggestion-owner-b");
    assert.deepEqual(spacesApi.getOnboardingSuggestions().motivationSelections, []);
    assert.match(spacesApi.previewNaturalLanguageCreation(suggestions.suggestions[1].previewRequest).error, /Account scope changed/);
  } finally { setAccountScope(previousScope); }
}));

test("Space deletion is reviewed, account scoped, stale safe, and durable across reload", () => withStorage((storage) => {
  const previousScope = "spaces-delete-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("spaces-delete-owner-a");
    const engine = new SpaceCreationEngine();
    const create = engine.previewNaturalLanguageRequest({ prompt: "Create a private space called Keep until confirmed" });
    const created = engine.confirmNaturalLanguagePreview({ previewId: create.previewId, confirm: true }).space;
    const request = { accountScope: created.accountScope, spaceId: created.id, expectedLayoutRevision: 0 };
    const reviewed = engine.previewDeleteSpace(request);
    assert.equal(reviewed.action, "delete_private_space");
    assert.equal(reviewed.requiresConfirmation, true);
    assert.equal(reviewed.permissionsChanged, false);
    assert.deepEqual(engine.getSpaces().map(({ id }) => id), [created.id]);
    assert.match(engine.confirmDeleteSpace({ previewId: reviewed.previewId, confirm: false }).error, /Explicit confirmation/);

    const staleReview = engine.previewDeleteSpace(request);
    engine.updateLayoutPreferences({ accountScope: request.accountScope, spaceId: request.spaceId, expectedRevision: 0, preferences: { widgetIds: ["notes"] } });
    const stale = engine.confirmDeleteSpace({ previewId: staleReview.previewId, confirm: true });
    assert.equal(stale.code, "stale_revision");
    assert.equal(engine.getSpaces().length, 1);

    const latest = engine.getSpaces()[0];
    const retryRequest = { accountScope: latest.accountScope, spaceId: latest.id, expectedLayoutRevision: latest.layoutPreferences.revision };
    const failureReview = engine.previewDeleteSpace(retryRequest);
    storage.failWrites = true;
    assert.equal(engine.confirmDeleteSpace({ previewId: failureReview.previewId, confirm: true }).code, "write_failed");
    assert.equal(engine.getSpaces().length, 1);
    storage.failWrites = false;

    const accountAReview = engine.previewDeleteSpace(retryRequest);
    setAccountScope("spaces-delete-owner-b");
    assert.match(engine.confirmDeleteSpace({ previewId: accountAReview.previewId, confirm: true }).error, /not found or already used|Account scope changed/);
    assert.deepEqual(engine.getSpaces(), []);
    setAccountScope("spaces-delete-owner-a");
    assert.equal(engine.getSpaces().length, 1);
    const finalSpace = engine.getSpaces()[0];
    const finalReview = engine.previewDeleteSpace({ accountScope: finalSpace.accountScope, spaceId: finalSpace.id, expectedLayoutRevision: finalSpace.layoutPreferences.revision });
    assert.equal(engine.confirmDeleteSpace({ previewId: finalReview.previewId, confirm: true }).success, true);
    assert.deepEqual(new SpaceCreationEngine().getSpaces(), []);
    assert.equal(Object.hasOwn(JSON.parse(storage.getItem(getAccountStorageKey("hey_spaces"))).spaces, finalSpace.id), false);
  } finally { setAccountScope(previousScope); }
}));

test("saved Space layout preferences persist by account, merge partial edits, and keep onboarding starters as suggestions", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-layout-owner");
    const onboarding = new OnboardingEngine();
    const engine = new SpaceCreationEngine();
    onboarding.setStarterSpaceSelections(["personal", "work"]);
    const preview = engine.previewNaturalLanguageRequest({ prompt: "Create a private space called Focus" });
    const created = engine.confirmNaturalLanguagePreview({ previewId: preview.previewId, confirm: true });
    const initial = engine.getLayoutPreferences(created.space.id);
    assert.equal(initial.success, true);
    assert.equal(initial.revision, 0);
    assert.deepEqual(initial.favoriteToolIds, []);

    const saved = engine.updateLayoutPreferences({
      accountScope: created.space.accountScope,
      spaceId: created.space.id,
      expectedRevision: 0,
      preferences: { favoriteToolIds: ["tool.search", "tool.notes"], widgetIds: ["notes"] },
    });
    assert.equal(saved.success, true);
    assert.equal(saved.revision, 1);
    assert.deepEqual(saved.favoriteToolIds, ["tool.search", "tool.notes"]);
    assert.deepEqual(saved.shortcutIds, []);
    assert.equal(JSON.parse(storage.getItem(getAccountStorageKey("hey_spaces"))).contractVersion, 2);

    // Onboarding suggestions remain their own contract and cannot reset a user's explicit layout.
    onboarding.setStarterSpaceSelections(["learning"]);
    const partial = engine.updateLayoutPreferences({
      accountScope: created.space.accountScope,
      spaceId: created.space.id,
      expectedRevision: 1,
      preferences: { shortcutIds: ["open-focus"] },
    });
    assert.equal(partial.revision, 2);
    assert.deepEqual(partial.favoriteToolIds, ["tool.search", "tool.notes"]);
    assert.deepEqual(partial.widgetIds, ["notes"]);
    assert.deepEqual(onboarding.getProgress().starterSpaceSelections, ["learning"]);
    assert.deepEqual(new SpaceCreationEngine().getLayoutPreferences(created.space.id).favoriteToolIds, ["tool.search", "tool.notes"]);
  } finally { setAccountScope(previousScope); }
}));

test("Space layout preference updates reject cross-account and stale revisions without overwriting newer choices", () => withStorage(() => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-layout-stale-owner");
    const first = new SpaceCreationEngine();
    const preview = first.previewNaturalLanguageRequest({ prompt: "Create a space called Revision test" });
    const created = first.confirmNaturalLanguagePreview({ previewId: preview.previewId, confirm: true });
    const second = new SpaceCreationEngine();
    const request = { accountScope: created.space.accountScope, spaceId: created.space.id, expectedRevision: 0 };
    const pending = first.previewNaturalLanguageRequest({ prompt: "Create a space called Preserve layout" });

    const foreign = first.updateLayoutPreferences({ ...request, accountScope: "account:somebody-else", preferences: { favoriteToolIds: ["tool.admin"] } });
    assert.match(foreign.error, /Account scope mismatch/);
    const newer = second.updateLayoutPreferences({ ...request, preferences: { favoriteToolIds: ["tool.calendar"] } });
    assert.equal(newer.revision, 1);
    assert.equal(first.confirmNaturalLanguagePreview({ previewId: pending.previewId, confirm: true }).success, true);
    assert.deepEqual(second.getLayoutPreferences(created.space.id).favoriteToolIds, ["tool.calendar"]);
    const stale = first.updateLayoutPreferences({ ...request, preferences: { favoriteToolIds: ["tool.old"] } });
    assert.equal(stale.code, "stale_revision");
    assert.deepEqual(stale.current.favoriteToolIds, ["tool.calendar"]);
    assert.deepEqual(first.getLayoutPreferences(created.space.id).favoriteToolIds, ["tool.calendar"]);

    setAccountScope("space-layout-other-account");
    const other = new SpaceCreationEngine();
    assert.deepEqual(other.getSpaces(), []);
    assert.equal(other.getLayoutPreferences(created.space.id).error, "Space not found");
  } finally { setAccountScope(previousScope); }
}));

test("Space layout preference validation and persistence fail closed on hostile, oversized, or unavailable data", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-layout-validation-owner");
    const engine = new SpaceCreationEngine();
    const preview = engine.previewNaturalLanguageRequest({ prompt: "Create a space called Safe preferences" });
    const created = engine.confirmNaturalLanguagePreview({ previewId: preview.previewId, confirm: true });
    const base = { accountScope: created.space.accountScope, spaceId: created.space.id, expectedRevision: 0 };
    for (const preferences of [
      { unknown: true },
      { favoriteToolIds: ["tool.one", "tool.one"] },
      { favoriteToolIds: ["../private"] },
      { favoriteToolIds: ["x".repeat(65)] },
      { favoriteToolIds: Array.from({ length: 33 }, (_, index) => `tool.${index}`) },
      { toolIds: Array.from({ length: SPACE_CREATION_LIMITS.maxToolsPerSpace + 1 }, (_, index) => `tool.${index}`) },
      { widgetIds: ["notes"], shortcutIds: "open" },
    ]) assert.ok(engine.updateLayoutPreferences({ ...base, preferences }).error);

    let getterCalled = false;
    const accessorPatch = Object.defineProperty({}, "favoriteToolIds", { enumerable: true, get() { getterCalled = true; return ["tool.nope"]; } });
    assert.match(engine.updateLayoutPreferences({ ...base, preferences: accessorPatch }).error, /Accessor/);
    assert.equal(getterCalled, false);
    const proxyPatch = new Proxy({}, { ownKeys() { throw new Error("hostile"); } });
    assert.match(engine.updateLayoutPreferences({ ...base, preferences: proxyPatch }).error, /safely inspected/);
    const sparse = new Array(2);
    assert.match(engine.updateLayoutPreferences({ ...base, preferences: { favoriteToolIds: sparse } }).error, /Invalid/);
    assert.equal(engine.getLayoutPreferences(created.space.id).revision, 0);

    storage.failWrites = true;
    const writeFailure = engine.updateLayoutPreferences({ ...base, preferences: { favoriteToolIds: ["tool.search"] } });
    assert.equal(writeFailure.code, "write_failed");
    storage.failWrites = false;
    assert.equal(engine.getLayoutPreferences(created.space.id).revision, 0);

    const reentrantEngine = new SpaceCreationEngine();
    let reentrantResult;
    storage.onSet = () => {
      storage.onSet = null;
      reentrantResult = reentrantEngine.updateLayoutPreferences({ ...base, preferences: { widgetIds: ["calendar"] } });
    };
    const outerWrite = engine.updateLayoutPreferences({ ...base, preferences: { favoriteToolIds: ["tool.search"] } });
    assert.equal(outerWrite.revision, 1);
    assert.equal(reentrantResult.code, "write_in_progress");
    assert.deepEqual(engine.getLayoutPreferences(created.space.id).favoriteToolIds, ["tool.search"]);

    storage.failReads = true;
    assert.equal(engine.updateLayoutPreferences({ ...base, preferences: { favoriteToolIds: ["tool.search"] } }).error, "Space storage could not be read");
    storage.failReads = false;
    assert.equal(engine.getLayoutPreferences(created.space.id).revision, 1);

    setAccountScope(null);
    const anonymous = new SpaceCreationEngine();
    assert.match(anonymous.updateLayoutPreferences({ accountScope: "anonymous", spaceId: "space_forged", expectedRevision: 0, preferences: { widgetIds: ["notes"] } }).error, /account scope is required/);
  } finally { setAccountScope(previousScope); }
}));

test("Space storage events refresh current-account preferences and ignore invalid or foreign snapshots", () => withStorage((storage, windowTarget) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-layout-sync-owner");
    const source = new SpaceCreationEngine();
    const preview = source.previewNaturalLanguageRequest({ prompt: "Create a space called Focus work" });
    const created = source.confirmNaturalLanguagePreview({ previewId: preview.previewId, confirm: true });
    const observer = new SpaceCreationEngine();
    const changes = [];
    observer.subscribe((event) => changes.push(event));
    const request = { accountScope: created.space.accountScope, spaceId: created.space.id, expectedRevision: 0 };
    source.updateLayoutPreferences({ ...request, preferences: { favoriteToolIds: ["tool.focus"] } });
    const key = getAccountStorageKey("hey_spaces");
    const dispatchStorage = (eventKey) => windowTarget.dispatchEvent({ type: "storage", key: eventKey, newValue: null, storageArea: storage });
    dispatchStorage(key);
    assert.deepEqual(observer.getLayoutPreferences(created.space.id).favoriteToolIds, ["tool.focus"]);
    assert.ok(changes.includes("storage_synced"));

    dispatchStorage(getAccountStorageKey("hey_spaces", "account:another-user"));
    assert.deepEqual(observer.getLayoutPreferences(created.space.id).favoriteToolIds, ["tool.focus"]);

    const persisted = storage.getItem(key);
    storage.clear();
    dispatchStorage(null);
    assert.deepEqual(observer.getSpaces(), []);
    storage.setItem(key, persisted);
    dispatchStorage(key);
    assert.deepEqual(observer.getLayoutPreferences(created.space.id).favoriteToolIds, ["tool.focus"]);

    storage.setItem(key, "{ malformed");
    dispatchStorage(key);
    assert.equal(observer.getLayoutPreferences(created.space.id).error, "Space storage could not be read");
    assert.equal(storage.values.get(key), "{ malformed");
  } finally { setAccountScope(previousScope); }
}));

test("version 1 Space records load with empty preferences and are upgraded only by a successful save", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-layout-legacy-owner");
    const key = getAccountStorageKey("hey_spaces");
    storage.setItem(key, JSON.stringify({
      contractVersion: 1,
      accountScope: "account:space-layout-legacy-owner",
      spaces: { legacy: { id: "legacy", accountScope: "account:space-layout-legacy-owner", name: "Legacy", visibility: "private", sharing: "off" } },
    }));
    const engine = new SpaceCreationEngine();
    const preferences = engine.getLayoutPreferences("legacy");
    assert.equal(preferences.success, true);
    assert.equal(preferences.revision, 0);
    assert.deepEqual(preferences.widgetIds, []);
    assert.equal(JSON.parse(storage.getItem(key)).contractVersion, 1);

    const saved = engine.updateLayoutPreferences({ accountScope: "account:space-layout-legacy-owner", spaceId: "legacy", expectedRevision: 0, preferences: { widgetIds: ["notes"] } });
    assert.equal(saved.success, true);
    assert.equal(JSON.parse(storage.getItem(key)).contractVersion, 2);
    assert.deepEqual(new SpaceCreationEngine().getLayoutPreferences("legacy").widgetIds, ["notes"]);
  } finally { setAccountScope(previousScope); }
}));

test("canonical registered tools can join and leave any private Space without granting permissions", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  const toolNames = ["test.space.research", "test.space.computer", "test.space.creation"];
  setAccountScope(previousScope);
  clearPermissions();
  try {
    setAccountScope("space-tool-owner-a");
    const engine = new SpaceCreationEngine();
    const onboarding = new OnboardingEngine();
    const created = engine.confirmNaturalLanguagePreview({
      previewId: engine.previewNaturalLanguageRequest({ prompt: "Create a space called Cross category" }).previewId,
      confirm: true,
    });
    const categories = ["research", "computer", "generation"];
    toolNames.forEach((name, index) => registerTool(name, async () => ({ success: true }), {
      category: categories[index],
      permissions: [`permission.${categories[index]}`],
    }));
    seedPermissions([{ permission: "permission.research", status: "granted" }], "space-tool-owner-a");
    const grantsBefore = listPermissions();
    let expectedRevision = 0;
    for (const toolName of toolNames) {
      const added = spacesApi.setToolMembership({
        accountScope: created.space.accountScope,
        spaceId: created.space.id,
        toolName,
        member: true,
        expectedRevision,
      });
      assert.equal(added.success, true);
      expectedRevision = added.revision;
    }
    assert.deepEqual(engine.getLayoutPreferences(created.space.id).toolIds, toolNames);
    const reloadedOwnerA = new SpaceCreationEngine();
    assert.equal(reloadedOwnerA.getSpaces()[0].name, "Cross category");
    assert.deepEqual(reloadedOwnerA.getLayoutPreferences(created.space.id).toolIds, toolNames, "cross-category choices must survive a fresh engine load");
    assert.deepEqual(listPermissions(), grantsBefore, "membership metadata must not grant or revoke a tool permission");

    assert.equal(engine.setToolMembership({
      accountScope: created.space.accountScope,
      spaceId: created.space.id,
      toolName: "test.space.unregistered",
      member: true,
      expectedRevision,
    }).code, "tool_not_registered");
    assert.equal(engine.updateLayoutPreferences({
      accountScope: created.space.accountScope,
      spaceId: created.space.id,
      expectedRevision,
      preferences: { toolIds: ["test.space.unregistered"] },
    }).code, "tool_not_registered", "the lower-level preferences API cannot bypass canonical registry validation");
    assert.equal(engine.setToolMembership({
      accountScope: created.space.accountScope,
      spaceId: created.space.id,
      toolName: toolNames[0],
      member: true,
      expectedRevision: 0,
    }).code, "stale_revision");
    assert.match(engine.setToolMembership({
      accountScope: "account:space-tool-owner-b",
      spaceId: created.space.id,
      toolName: toolNames[0],
      member: false,
      expectedRevision,
    }).error, /Account scope mismatch/);

    onboarding.setStarterSpaceSelections(["personal", "learning"]);
    assert.deepEqual(engine.getLayoutPreferences(created.space.id).toolIds, toolNames);
    assert.deepEqual(listPermissions(), grantsBefore);

    setAccountScope("space-tool-owner-b");
    const ownerBReload = new SpaceCreationEngine();
    assert.deepEqual(ownerBReload.getSpaces(), [], "a fresh engine for another account must not see the created Space");
    assert.deepEqual(onboarding.getProgress().starterSpaceSelections, []);
    setAccountScope("space-tool-owner-a");
    const ownerAReload = new SpaceCreationEngine();
    assert.deepEqual(ownerAReload.getLayoutPreferences(created.space.id).toolIds, toolNames);
    assert.deepEqual(listPermissions(), grantsBefore);

    unregisterTool(toolNames[1]);
    const removed = engine.setToolMembership({
      accountScope: created.space.accountScope,
      spaceId: created.space.id,
      toolName: toolNames[1],
      member: false,
      expectedRevision,
    });
    assert.equal(removed.success, true, "removed registry entries can still be detached from saved Spaces");
    assert.deepEqual(removed.toolIds, [toolNames[0], toolNames[2]]);
    assert.deepEqual(listPermissions(), grantsBefore);
    assert.equal(storage.getItem(getAccountStorageKey("hey_spaces")).includes(toolNames[1]), false);
  } finally {
    toolNames.forEach((name) => unregisterTool(name));
    clearPermissions();
    setAccountScope(previousScope);
  }
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
