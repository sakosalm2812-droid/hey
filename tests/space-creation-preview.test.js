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
  failWriteKeys = new Set();
  onSet = null;
  getItem(key) {
    if (this.failReads) throw new Error("storage unavailable");
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    if (this.failWrites || this.failWriteKeys.has(key)) throw new Error("storage unavailable");
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
  assert.equal(spacesApi.storageContractVersion, 5);
  assert.equal(typeof spacesApi.getLayoutPreferences, "function");
  assert.equal(typeof spacesApi.previewRecovery, "function");
  assert.equal(typeof spacesApi.confirmRecovery, "function");
  assert.equal(typeof spacesApi.updateLayoutPreferences, "function");
  assert.equal(typeof spacesApi.updateDetails, "function");
  assert.equal(typeof spacesApi.previewArchive, "function");
  assert.equal(typeof spacesApi.confirmArchive, "function");
  assert.equal(typeof spacesApi.previewRestore, "function");
  assert.equal(typeof spacesApi.confirmRestore, "function");
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

test("private Space archive and restore require preview confirmation and preserve private data", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  clearPermissions();
  try {
    setAccountScope("space-archive-owner-a");
    seedPermissions([{ permission: "permission.space.archive-test", status: "granted" }], "space-archive-owner-a");
    const grantsBefore = listPermissions();
    const engine = new SpaceCreationEngine();
    const creation = engine.previewNaturalLanguageRequest({ prompt: "Create a space called Recoverable" });
    const created = engine.confirmNaturalLanguagePreview({ previewId: creation.previewId, confirm: true }).space;
    const request = { accountScope: created.accountScope, spaceId: created.id, expectedLifecycleRevision: 0 };
    const preview = engine.previewArchiveSpace(request);
    assert.equal(preview.action, "archive_private_space");
    assert.equal(preview.requiresConfirmation, true);
    assert.equal(preview.permissionsChanged, false);
    assert.match(preview.effects[0], /keep its private saved data available for restoration/);
    assert.equal(engine.getSpaces()[0].status, "active");
    assert.match(engine.confirmArchiveSpace({ previewId: preview.previewId, confirm: false }).error, /Explicit confirmation/);
    storage.failWrites = true;
    assert.equal(engine.confirmArchiveSpace({ previewId: preview.previewId, confirm: true }).code, "write_failed");
    assert.equal(engine.getSpaces()[0].status, "active");
    storage.failWrites = false;

    const retryPreview = engine.previewArchiveSpace(request);
    const archived = engine.confirmArchiveSpace({ previewId: retryPreview.previewId, confirm: true });
    assert.equal(archived.success, true);
    assert.equal(archived.status, "archived");
    assert.equal(archived.revision, 1);
    assert.equal(archived.permissionsChanged, false);
    const archivedSpace = engine.getSpaces()[0];
    assert.equal(archivedSpace.status, "archived");
    assert.equal(archivedSpace.visibility, "private");
    assert.equal(archivedSpace.sharing, "off");
    assert.deepEqual(listPermissions(), grantsBefore);
    assert.equal(JSON.parse(storage.getItem(getAccountStorageKey("hey_spaces"))).contractVersion, 5);

    const restorePreview = engine.previewRestoreSpace({ ...request, expectedLifecycleRevision: 1 });
    assert.equal(restorePreview.action, "restore_private_space");
    assert.equal(restorePreview.permissionsChanged, false);
    assert.match(engine.confirmRestoreSpace({ previewId: restorePreview.previewId, confirm: false }).error, /Explicit confirmation/);
    const restored = engine.confirmRestoreSpace({ previewId: restorePreview.previewId, confirm: true });
    assert.equal(restored.status, "active");
    assert.equal(restored.revision, 2);
    assert.equal(restored.permissionsChanged, false);
    assert.deepEqual(listPermissions(), grantsBefore);
    assert.equal(new SpaceCreationEngine().getSpaces()[0].name, "Recoverable");
    assert.match(engine.confirmRestoreSpace({ previewId: restorePreview.previewId, confirm: true }).error, /not found or already used/);
  } finally { clearPermissions(); setAccountScope(previousScope); }
}));

test("Space lifecycle previews reject stale snapshots, hostile data, and account switches", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-lifecycle-owner-a");
    const owner = new SpaceCreationEngine();
    const creation = owner.previewNaturalLanguageRequest({ prompt: "Create a space called Lifecycle fence" });
    const created = owner.confirmNaturalLanguagePreview({ previewId: creation.previewId, confirm: true }).space;
    const base = { accountScope: created.accountScope, spaceId: created.id, expectedLifecycleRevision: 0 };
    assert.match(owner.previewArchiveSpace({ ...base, unexpected: true }).error, /unsupported fields/);
    const accessor = Object.defineProperty({ ...base }, "expectedLifecycleRevision", { enumerable: true, get() { throw new Error("must not run"); } });
    assert.match(owner.previewArchiveSpace(accessor).error, /Accessor/);
    const proxy = new Proxy({ ...base }, { ownKeys() { throw new Error("hostile request"); } });
    assert.match(owner.previewArchiveSpace(proxy).error, /safely inspected/);
    assert.match(owner.previewArchiveSpace({ ...base, expectedLifecycleRevision: -1 }).error, /valid Space lifecycle revision/);

    const preview = owner.previewArchiveSpace(base);
    const peer = new SpaceCreationEngine();
    assert.equal(peer.updateDetails({ accountScope: created.accountScope, spaceId: created.id, expectedRevision: 0, name: "Changed after review" }).success, true);
    const stale = owner.confirmArchiveSpace({ previewId: preview.previewId, confirm: true });
    assert.equal(stale.code, "stale_revision");
    assert.equal(stale.current.name, "Changed after review");
    assert.equal(stale.current.status, "active");
    assert.equal(owner.getSpaces()[0].status, "active");

    const staleRevisionPreview = owner.previewArchiveSpace(base);
    const peerArchive = peer.previewArchiveSpace(base);
    assert.equal(peer.confirmArchiveSpace({ previewId: peerArchive.previewId, confirm: true }).revision, 1);
    const peerRestore = peer.previewRestoreSpace({ ...base, expectedLifecycleRevision: 1 });
    assert.equal(peer.confirmRestoreSpace({ previewId: peerRestore.previewId, confirm: true }).revision, 2);
    const staleRevision = owner.confirmArchiveSpace({ previewId: staleRevisionPreview.previewId, confirm: true });
    assert.equal(staleRevision.code, "stale_revision");
    assert.equal(staleRevision.current.lifecycleRevision, 2);

    const retry = owner.previewArchiveSpace({ ...base, expectedLifecycleRevision: 2 });
    setAccountScope("space-lifecycle-owner-b");
    assert.match(owner.confirmArchiveSpace({ previewId: retry.previewId, confirm: true }).error, /not found or already used|Account scope changed/);
    const otherAccount = new SpaceCreationEngine();
    assert.deepEqual(otherAccount.getSpaces(), []);
    assert.equal(storage.getItem(getAccountStorageKey("hey_spaces")), null);
    setAccountScope("space-lifecycle-owner-a");
    assert.equal(new SpaceCreationEngine().getSpaces()[0].status, "active");
  } finally { setAccountScope(previousScope); }
}));

test("onboarding motivation suggestions connect to private Space previews for the active account", () => withStorage(() => {
  const previousScope = "spaces-suggestion-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("spaces-suggestion-owner-a");
    HEY.onboarding.setMotivations(["organize_work", "learn"]);
    const suggestions = spacesApi.getOnboardingSuggestions();
    assert.equal(suggestions.accountScope, "account:spaces-suggestion-owner-a");
    assert.deepEqual(suggestions.motivationSelections, ["organize_work", "learn"]);
    assert.deepEqual(suggestions.suggestions.map(({ id }) => id), ["work", "learning", "personal"]);
    assert.equal(suggestions.suggestions[0].templateId, "planning");
    assert.equal(suggestions.suggestions[1].templateId, "research");
    assert.equal(suggestions.suggestions.every(({ requiresConfirmation, permissionsChanged }) => requiresConfirmation && !permissionsChanged), true);
    assert.deepEqual(spacesApi.getPrivateSpaces(), []);

    const staleSuggestion = suggestions.suggestions[1];
    const chosen = staleSuggestion;
    const preview = spacesApi.previewNaturalLanguageCreation(chosen.previewRequest);
    assert.equal(preview.space.name, "Learning");
    assert.equal(preview.space.templateId, "research");
    assert.equal(preview.permissionsChanged, false);
    assert.equal(spacesApi.getPrivateSpaces().length, 0);
    const created = spacesApi.confirmNaturalLanguageCreation({ previewId: preview.previewId, confirm: true });
    assert.equal(created.success, true);
    assert.equal(spacesApi.getPrivateSpaces().length, 1);

    setAccountScope("spaces-suggestion-owner-b");
    assert.deepEqual(spacesApi.getOnboardingSuggestions().motivationSelections, []);
    assert.deepEqual(spacesApi.getPrivateSpaces(), []);
    assert.match(spacesApi.previewNaturalLanguageCreation(staleSuggestion.previewRequest).error, /Account scope changed/);
  } finally { setAccountScope(previousScope); }
}));

test("onboarding template persists through edit, archive, failed restore recovery, and account isolation", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  clearPermissions();
  try {
    setAccountScope("space-template-path-owner-a");
    seedPermissions([{ permission: "permission.space.template-path", status: "granted" }], "space-template-path-owner-a");
    const grantsBefore = listPermissions();
    HEY.onboarding.setMotivations(["organize_work", "learn"]);
    const suggestion = spacesApi.getOnboardingSuggestions().suggestions.find(({ id }) => id === "work");
    const preview = spacesApi.previewNaturalLanguageCreation(suggestion.previewRequest);
    assert.equal(preview.space.templateId, "planning");
    const created = spacesApi.confirmNaturalLanguageCreation({ previewId: preview.previewId, confirm: true });
    assert.equal(created.success, true);
    assert.equal(created.permissionsChanged, false);
    assert.equal(new SpaceCreationEngine().getSpaces()[0].templateId, "planning");

    const edited = spacesApi.updateDetails({
      accountScope: created.space.accountScope,
      spaceId: created.space.id,
      expectedRevision: 0,
      name: "Weekly planning",
      description: "Keep work and learning in one private Space.",
    });
    assert.equal(edited.success, true);
    assert.equal(edited.revision, 1);

    const archivedPreview = spacesApi.previewArchive({ accountScope: created.space.accountScope, spaceId: created.space.id, expectedLifecycleRevision: 0 });
    assert.equal(archivedPreview.requiresConfirmation, true);
    const archived = spacesApi.confirmArchive({ previewId: archivedPreview.previewId, confirm: true });
    assert.equal(archived.status, "archived");
    const archivedAfterReload = new SpaceCreationEngine().getSpaces()[0];
    assert.equal(archivedAfterReload.templateId, "planning");
    assert.equal(archivedAfterReload.name, "Weekly planning");
    assert.equal(archivedAfterReload.description, "Keep work and learning in one private Space.");

    const staleAccountPreview = spacesApi.previewRestore({ accountScope: created.space.accountScope, spaceId: created.space.id, expectedLifecycleRevision: 1 });
    setAccountScope("space-template-path-owner-b");
    assert.match(spacesApi.confirmRestore({ previewId: staleAccountPreview.previewId, confirm: true }).error, /not found or already used|Account scope changed/);
    assert.deepEqual(spacesApi.getPrivateSpaces(), []);
    assert.equal(storage.getItem(getAccountStorageKey("hey_spaces")), null);

    setAccountScope("space-template-path-owner-a");
    storage.failWrites = true;
    const failedRestorePreview = spacesApi.previewRestore({ accountScope: created.space.accountScope, spaceId: created.space.id, expectedLifecycleRevision: 1 });
    const failedRestore = spacesApi.confirmRestore({ previewId: failedRestorePreview.previewId, confirm: true });
    assert.equal(failedRestore.code, "write_failed");
    assert.equal(spacesApi.getPrivateSpaces()[0].status, "archived");

    storage.failWrites = false;
    const retryPreview = spacesApi.previewRestore({ accountScope: created.space.accountScope, spaceId: created.space.id, expectedLifecycleRevision: 1 });
    const restored = spacesApi.confirmRestore({ previewId: retryPreview.previewId, confirm: true });
    assert.equal(restored.success, true);
    const restoredAfterReload = new SpaceCreationEngine().getSpaces()[0];
    assert.equal(restoredAfterReload.status, "active");
    assert.equal(restoredAfterReload.templateId, "planning");
    assert.equal(restoredAfterReload.detailsRevision, 1);
    assert.equal(restoredAfterReload.lifecycleRevision, 2);
    assert.equal(JSON.parse(storage.getItem(getAccountStorageKey("hey_spaces"))).contractVersion, 5);
    assert.deepEqual(listPermissions(), grantsBefore);
  } finally { clearPermissions(); setAccountScope(previousScope); }
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
    assert.equal(JSON.parse(storage.getItem(getAccountStorageKey("hey_spaces"))).contractVersion, 5);

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

test("private Space details update with an account-scoped expected revision and durable readback", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-details-owner-a");
    const engine = new SpaceCreationEngine();
    const preview = engine.previewNaturalLanguageRequest({ prompt: "Create a space called Original" });
    const created = engine.confirmNaturalLanguagePreview({ previewId: preview.previewId, confirm: true }).space;
    assert.equal(created.detailsRevision, 0);
    const result = spacesApi.updateDetails({
      accountScope: created.accountScope,
      spaceId: created.id,
      expectedRevision: 0,
      name: "Updated title",
      description: "A private planning space",
    });
    assert.equal(result.success, true);
    assert.equal(result.changed, true);
    assert.equal(result.revision, 1);
    assert.equal(result.name, "Updated title");
    assert.equal(result.description, "A private planning space");
    assert.equal(engine.getLayoutPreferences(created.id).revision, 0);
    const stored = JSON.parse(storage.getItem(getAccountStorageKey("hey_spaces")));
    assert.equal(stored.contractVersion, 5);
    assert.equal(stored.spaces[created.id].detailsRevision, 1);
    const reloaded = new SpaceCreationEngine().getSpaces()[0];
    assert.equal(reloaded.name, "Updated title");
    assert.equal(reloaded.description, "A private planning space");
    assert.equal(reloaded.detailsRevision, 1);
    assert.equal(reloaded.visibility, "private");
    assert.equal(reloaded.sharing, "off");
  } finally { setAccountScope(previousScope); }
}));

test("private Space details reject hostile requests and failed persistence without changing stored details", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-details-validation-owner");
    const engine = new SpaceCreationEngine();
    const preview = engine.previewNaturalLanguageRequest({ prompt: "Create a space called Preserve details" });
    const created = engine.confirmNaturalLanguagePreview({ previewId: preview.previewId, confirm: true }).space;
    const request = { accountScope: created.accountScope, spaceId: created.id, expectedRevision: 0 };
    for (const patch of [
      {},
      { name: "" },
      { name: "  padded" },
      { name: "bad\nname" },
      { name: "x".repeat(81) },
      { description: "x".repeat(241) },
      { description: "line\nbreak" },
    ]) assert.ok(engine.updateDetails({ ...request, ...patch }).error);
    assert.match(engine.updateDetails({ ...request, name: "Valid", extra: true }).error, /unsupported fields/);
    const accessor = Object.defineProperty({ ...request }, "name", { enumerable: true, get() { throw new Error("must not run"); } });
    assert.match(engine.updateDetails(accessor).error, /Accessor/);
    const proxy = new Proxy({ ...request, name: "Valid" }, { ownKeys() { throw new Error("hostile request"); } });
    assert.match(engine.updateDetails(proxy).error, /safely inspected/);

    storage.failWrites = true;
    assert.equal(engine.updateDetails({ ...request, description: "Must not be reported as saved" }).code, "write_failed");
    storage.failWrites = false;
    const unchanged = new SpaceCreationEngine().getSpaces()[0];
    assert.equal(unchanged.name, "Preserve details");
    assert.equal(unchanged.description, "");
    assert.equal(unchanged.detailsRevision, 0);
  } finally { setAccountScope(previousScope); }
}));

test("private Space details reject stale and foreign accounts and recover only from latest details revision", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-details-owner-a");
    const firstTab = new SpaceCreationEngine();
    const preview = firstTab.previewNaturalLanguageRequest({ prompt: "Create a space called First title" });
    const created = firstTab.confirmNaturalLanguagePreview({ previewId: preview.previewId, confirm: true }).space;
    const secondTab = new SpaceCreationEngine();
    const request = { accountScope: created.accountScope, spaceId: created.id, expectedRevision: 0 };
    assert.equal(secondTab.updateDetails({ ...request, name: "Tab two title" }).revision, 1);
    const stale = firstTab.updateDetails({ ...request, description: "Stale tab description" });
    assert.equal(stale.code, "stale_revision");
    assert.equal(stale.current.revision, 1);
    assert.equal(stale.current.name, "Tab two title");
    assert.equal(stale.current.description, "");

    setAccountScope("space-details-owner-b");
    const accountB = new SpaceCreationEngine();
    assert.match(accountB.updateDetails({ ...request, name: "Cross-account write" }).error, /Account scope mismatch/);
    assert.deepEqual(accountB.getSpaces(), []);

    setAccountScope("space-details-owner-a");
    const latest = firstTab.getSpaces()[0];
    const recovered = firstTab.updateDetails({ ...request, expectedRevision: latest.detailsRevision, description: "Reviewed latest title first" });
    assert.equal(recovered.revision, 2);
    assert.equal(recovered.name, "Tab two title");
    assert.equal(recovered.description, "Reviewed latest title first");

    storage.onSet = (key) => {
      if (key !== getAccountStorageKey("hey_spaces", "account:space-details-owner-a")) return;
      storage.onSet = null;
      setAccountScope("space-details-switch-target");
    };
    const switched = firstTab.updateDetails({ ...request, expectedRevision: 2, name: "Must remain in owner A" });
    assert.match(switched.error, /Account scope changed/);
    setAccountScope("space-details-switch-target");
    assert.deepEqual(new SpaceCreationEngine().getSpaces(), []);
    assert.equal(storage.getItem(getAccountStorageKey("hey_spaces")), null);
  } finally { setAccountScope(previousScope); }
}));

test("Space details migrate v2 records to storage v5 with details revision zero", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-details-v2-owner");
    const key = getAccountStorageKey("hey_spaces");
    storage.setItem(key, JSON.stringify({
      contractVersion: 2,
      accountScope: "account:space-details-v2-owner",
      spaces: { legacy: { id: "legacy", accountScope: "account:space-details-v2-owner", name: "Legacy details", description: "", visibility: "private", sharing: "off", layoutPreferences: { contractVersion: 1, revision: 0, favoriteToolIds: [], widgetIds: [], shortcutIds: [], toolIds: [] } } },
    }));
    const engine = new SpaceCreationEngine();
    assert.equal(engine.getSpaces()[0].detailsRevision, 0);
    const result = engine.updateDetails({ accountScope: "account:space-details-v2-owner", spaceId: "legacy", expectedRevision: 0, description: "Migrated on save" });
    assert.equal(result.success, true);
    assert.equal(JSON.parse(storage.getItem(key)).contractVersion, 5);
    assert.equal(JSON.parse(storage.getItem(key)).spaces.legacy.detailsRevision, 1);
  } finally { setAccountScope(previousScope); }
}));

test("Space storage v3 records migrate to v5 with active lifecycle defaults", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-lifecycle-v3-owner");
    const key = getAccountStorageKey("hey_spaces");
    storage.setItem(key, JSON.stringify({
      contractVersion: 3,
      accountScope: "account:space-lifecycle-v3-owner",
      spaces: { legacy: { id: "legacy", accountScope: "account:space-lifecycle-v3-owner", name: "V3 Space", description: "Saved before archive support", detailsRevision: 1, visibility: "private", sharing: "off", layoutPreferences: { contractVersion: 1, revision: 2, favoriteToolIds: ["tool.notes"], widgetIds: [], shortcutIds: [], toolIds: [] } } },
    }));
    const engine = new SpaceCreationEngine();
    const loaded = engine.getSpaces()[0];
    assert.equal(loaded.status, "active");
    assert.equal(loaded.lifecycleRevision, 0);
    assert.equal(loaded.detailsRevision, 1);
    const preview = engine.previewArchiveSpace({ accountScope: loaded.accountScope, spaceId: loaded.id, expectedLifecycleRevision: 0 });
    assert.equal(engine.confirmArchiveSpace({ previewId: preview.previewId, confirm: true }).success, true);
    const stored = JSON.parse(storage.getItem(key));
    assert.equal(stored.contractVersion, 5);
    assert.equal(stored.spaces.legacy.status, "archived");
    assert.equal(stored.spaces.legacy.lifecycleRevision, 1);
    assert.equal(stored.spaces.legacy.templateId, "custom");
    assert.deepEqual(stored.spaces.legacy.layoutPreferences.favoriteToolIds, ["tool.notes"]);
  } finally { setAccountScope(previousScope); }
}));

test("Space storage v4 preserves template provenance and labels older custom records on v5 save", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-template-v4-owner");
    const key = getAccountStorageKey("hey_spaces");
    const accountScope = "account:space-template-v4-owner";
    const layoutPreferences = { contractVersion: 1, revision: 0, favoriteToolIds: [], widgetIds: [], shortcutIds: [], toolIds: [] };
    storage.setItem(key, JSON.stringify({
      contractVersion: 4,
      accountScope,
      spaces: {
        research: { id: "research", accountScope, name: "Research", templateId: "research", visibility: "private", sharing: "off", layoutPreferences },
        legacy: { id: "legacy", accountScope, name: "Legacy", visibility: "private", sharing: "off", layoutPreferences },
      },
    }));
    const engine = new SpaceCreationEngine();
    assert.equal(engine.getSpaces().find(({ id }) => id === "research").templateId, "research");
    assert.equal(engine.getSpaces().find(({ id }) => id === "legacy").templateId, "custom");

    const saved = engine.updateDetails({ accountScope, spaceId: "research", expectedRevision: 0, description: "Kept through migration" });
    assert.equal(saved.success, true);
    const migrated = JSON.parse(storage.getItem(key));
    assert.equal(migrated.contractVersion, 5);
    assert.equal(migrated.spaces.research.templateId, "research");
    assert.equal(migrated.spaces.legacy.templateId, "custom");
  } finally { setAccountScope(previousScope); }
}));

test("saved Space preference edits can recover from a cross-tab revision conflict only after re-review", () => withStorage(() => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-pref-recovery-owner-a");
    const editor = new SpaceCreationEngine();
    const preview = editor.previewNaturalLanguageRequest({ prompt: "Create a space called Preference recovery" });
    const created = editor.confirmNaturalLanguagePreview({ previewId: preview.previewId, confirm: true }).space;
    const peerTab = new SpaceCreationEngine();
    const baseRequest = { accountScope: created.accountScope, spaceId: created.id, expectedRevision: 0 };
    const peerSave = peerTab.updateLayoutPreferences({
      ...baseRequest,
      preferences: { favoriteToolIds: ["tool.calendar"], widgetIds: ["calendar"], shortcutIds: ["open-calendar"] },
    });
    assert.equal(peerSave.revision, 1);

    const staleDraft = editor.updateLayoutPreferences({
      ...baseRequest,
      preferences: { favoriteToolIds: ["tool.notes"], widgetIds: ["notes"], shortcutIds: ["open-notes"] },
    });
    assert.equal(staleDraft.code, "stale_revision");
    assert.equal(staleDraft.current.revision, 1);
    assert.deepEqual(staleDraft.current.favoriteToolIds, ["tool.calendar"]);
    assert.deepEqual(peerTab.getLayoutPreferences(created.id).widgetIds, ["calendar"]);

    setAccountScope("space-pref-recovery-owner-b");
    const foreignTab = new SpaceCreationEngine();
    const crossAccount = foreignTab.updateLayoutPreferences({
      accountScope: created.accountScope,
      spaceId: created.id,
      expectedRevision: 1,
      preferences: { favoriteToolIds: ["tool.attacker"] },
    });
    assert.match(crossAccount.error, /Account scope mismatch/);
    assert.deepEqual(foreignTab.getSpaces(), []);

    setAccountScope("space-pref-recovery-owner-a");
    const reviewedLatest = editor.getLayoutPreferences(created.id);
    const recovered = editor.updateLayoutPreferences({
      accountScope: reviewedLatest.accountScope,
      spaceId: reviewedLatest.spaceId,
      expectedRevision: reviewedLatest.revision,
      preferences: { favoriteToolIds: ["tool.notes"], widgetIds: ["notes"], shortcutIds: ["open-notes"] },
    });
    assert.equal(recovered.revision, 2);
    assert.deepEqual(recovered.favoriteToolIds, ["tool.notes"]);
    assert.deepEqual(recovered.widgetIds, ["notes"]);
    const reloaded = new SpaceCreationEngine().getLayoutPreferences(created.id);
    assert.deepEqual(reloaded.favoriteToolIds, ["tool.notes"]);
    assert.deepEqual(reloaded.widgetIds, ["notes"]);
    assert.deepEqual(reloaded.shortcutIds, ["open-notes"]);
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
    assert.equal(observer.spaces.size, 0);
    assert.ok(changes.includes("storage_sync_error"));
    assert.equal(storage.values.get(key), "{ malformed");

    storage.setItem(key, persisted);
    dispatchStorage(key);
    assert.equal(observer.loadError, false);
    assert.deepEqual(observer.getLayoutPreferences(created.space.id).favoriteToolIds, ["tool.focus"]);
    assert.equal(changes.filter((event) => event === "storage_synced").length, 4);

    setAccountScope("space-layout-sync-other-owner");
    const other = new SpaceCreationEngine();
    const otherCreated = other.confirmNaturalLanguagePreview({
      previewId: other.previewNaturalLanguageRequest({ prompt: "Create a space called Other account" }).previewId,
      confirm: true,
    });
    dispatchStorage(getAccountStorageKey("hey_spaces"));
    const otherSpaceIds = observer.getSpaces().map((space) => space.id);
    assert.deepEqual(otherSpaceIds, [otherCreated.space.id]);
    dispatchStorage(key);
    assert.deepEqual(observer.getSpaces().map((space) => space.id), [otherCreated.space.id]);
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
    assert.equal(JSON.parse(storage.getItem(key)).contractVersion, 5);
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

test("private Space recovery restores the latest verified account snapshot after corruption", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-recovery-owner");
    const engine = new SpaceCreationEngine();
    const create = engine.previewNaturalLanguageRequest({ prompt: "Create a private space called Recovery notes", templateId: "research" });
    const created = engine.confirmNaturalLanguagePreview({ previewId: create.previewId, confirm: true });
    assert.equal(created.success, true);
    assert.equal(engine.updateDetails({
      accountScope: "account:space-recovery-owner",
      spaceId: created.space.id,
      expectedRevision: 0,
      description: "Latest verified description",
    }).success, true);
    assert.equal(engine.updateLayoutPreferences({
      accountScope: "account:space-recovery-owner",
      spaceId: created.space.id,
      expectedRevision: 0,
      preferences: { widgetIds: ["notes"] },
    }).success, true);
    const archive = engine.previewArchiveSpace({
      accountScope: "account:space-recovery-owner",
      spaceId: created.space.id,
      expectedLifecycleRevision: 0,
    });
    assert.equal(engine.confirmArchiveSpace({ previewId: archive.previewId, confirm: true }).success, true);
    const secondCreate = engine.previewNaturalLanguageRequest({ prompt: "Create a space called Intentionally deleted" });
    const secondSpace = engine.confirmNaturalLanguagePreview({ previewId: secondCreate.previewId, confirm: true }).space;
    const deletion = engine.previewDeleteSpace({
      accountScope: "account:space-recovery-owner",
      spaceId: secondSpace.id,
      expectedLayoutRevision: 0,
    });
    assert.equal(engine.confirmDeleteSpace({ previewId: deletion.previewId, confirm: true }).success, true);

    const primaryKey = getAccountStorageKey("hey_spaces");
    const recoveryKey = getAccountStorageKey("hey_spaces_recovery");
    assert.equal(JSON.parse(storage.getItem(recoveryKey)).spaces[created.space.id].description, "Latest verified description");
    storage.setItem(primaryKey, "{corrupt primary");
    const unreadable = new SpaceCreationEngine();
    assert.throws(() => unreadable.getSpaces(), /storage could not be read/);
    const preview = unreadable.previewRecovery({ accountScope: "account:space-recovery-owner" });
    assert.equal(preview.requiresConfirmation, true);
    assert.equal(preview.spaceCount, 1);
    assert.deepEqual(preview.spaces, [{ id: created.space.id, name: "Recovery notes", status: "archived" }]);
    assert.match(unreadable.confirmRecovery({ previewId: preview.previewId, confirm: false }).error, /Explicit confirmation/);
    const recovered = unreadable.confirmRecovery({ previewId: preview.previewId, confirm: true });
    assert.equal(recovered.success, true);
    assert.equal(recovered.spaceCount, 1);
    assert.equal(unreadable.getSpaces()[0].description, "Latest verified description");
    assert.equal(unreadable.getSpaces()[0].templateId, "research");
    assert.equal(unreadable.getSpaces()[0].status, "archived");
    assert.equal(unreadable.getSpaces().some((space) => space.id === secondSpace.id), false);
    assert.deepEqual(unreadable.getLayoutPreferences(created.space.id).widgetIds, ["notes"]);
    assert.doesNotThrow(() => JSON.parse(storage.getItem(primaryKey)));
    assert.match(unreadable.confirmRecovery({ previewId: preview.previewId, confirm: true }).error, /not found or already used/);
  } finally { setAccountScope(previousScope); }
}));

test("Space recovery preview is fenced by account scope and backup ownership", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-recovery-account-a");
    const accountA = new SpaceCreationEngine();
    const create = accountA.previewNaturalLanguageRequest({ prompt: "Create a space called Private A" });
    const created = accountA.confirmNaturalLanguagePreview({ previewId: create.previewId, confirm: true });
    assert.equal(created.success, true);
    storage.setItem(getAccountStorageKey("hey_spaces"), "not valid JSON");
    const preview = accountA.previewRecovery({ accountScope: "account:space-recovery-account-a" });
    assert.equal(preview.requiresConfirmation, true);
    storage.setItem(getAccountStorageKey("hey_spaces"), "a different corrupt value");
    assert.equal(accountA.confirmRecovery({ previewId: preview.previewId, confirm: true }).code, "stale_snapshot");
    storage.setItem(getAccountStorageKey("hey_spaces"), "not valid JSON");
    const accountSwitchPreview = accountA.previewRecovery({ accountScope: "account:space-recovery-account-a" });

    setAccountScope("space-recovery-account-b");
    assert.match(accountA.confirmRecovery({ previewId: accountSwitchPreview.previewId, confirm: true }).error, /Account scope changed|not found or already used/);
    assert.deepEqual(new SpaceCreationEngine().getSpaces(), []);
    const accountBRecovery = JSON.parse(storage.getItem(getAccountStorageKey("hey_spaces_recovery")));
    assert.equal(accountBRecovery.accountScope, "account:space-recovery-account-b");
    assert.deepEqual(accountBRecovery.spaces, {});

    storage.setItem(getAccountStorageKey("hey_spaces"), "corrupt B primary");
    storage.setItem(getAccountStorageKey("hey_spaces_recovery"), JSON.stringify({
      contractVersion: 5,
      accountScope: "account:space-recovery-account-a",
      spaces: {},
    }));
    assert.match(new SpaceCreationEngine().previewRecovery({ accountScope: "account:space-recovery-account-b" }).error, /unavailable/);
  } finally { setAccountScope(previousScope); }
}));

test("Space recovery leaves corrupt data untouched when restoration writes fail", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-recovery-write-failure");
    const owner = new SpaceCreationEngine();
    const create = owner.previewNaturalLanguageRequest({ prompt: "Create a space called Still recoverable" });
    assert.equal(owner.confirmNaturalLanguagePreview({ previewId: create.previewId, confirm: true }).success, true);
    const primaryKey = getAccountStorageKey("hey_spaces");
    storage.setItem(primaryKey, "corrupt");
    const engine = new SpaceCreationEngine();
    const originalCorruptValue = storage.getItem(primaryKey);
    const preview = engine.previewRecovery({ accountScope: "account:space-recovery-write-failure" });
    assert.equal(preview.requiresConfirmation, true);
    storage.failWrites = true;
    assert.equal(engine.confirmRecovery({ previewId: preview.previewId, confirm: true }).code, "write_failed");
    assert.equal(storage.getItem(primaryKey), originalCorruptValue);
    assert.throws(() => engine.getSpaces(), /storage could not be read/);
    assert.match(engine.confirmRecovery({ previewId: preview.previewId, confirm: true }).error, /not found or already used/);

    storage.failWrites = false;
    const retry = engine.previewRecovery({ accountScope: "account:space-recovery-write-failure" });
    assert.equal(engine.confirmRecovery({ previewId: retry.previewId, confirm: true }).success, true);
    assert.equal(engine.getSpaces()[0].name, "Still recoverable");
  } finally { setAccountScope(previousScope); }
}));

test("Space recovery invalidates an unverifiable stale snapshot after a committed update", () => withStorage((storage) => {
  const previousScope = "spaces-preview-previous";
  setAccountScope(previousScope);
  try {
    setAccountScope("space-recovery-snapshot-failure");
    const engine = new SpaceCreationEngine();
    const create = engine.previewNaturalLanguageRequest({ prompt: "Create a space called Snapshot user" });
    const created = engine.confirmNaturalLanguagePreview({ previewId: create.previewId, confirm: true });
    assert.equal(created.success, true, JSON.stringify({ create, created }));
    const backupKey = getAccountStorageKey("hey_spaces_recovery");
    assert.ok(storage.getItem(backupKey));

    storage.failWriteKeys.add(backupKey);
    const updated = engine.updateDetails({
      accountScope: "account:space-recovery-snapshot-failure",
      spaceId: created.space.id,
      expectedRevision: 0,
      description: "Committed primary, unavailable backup write",
    });
    assert.equal(updated.success, true);
    assert.equal(storage.getItem(getAccountStorageKey("hey_spaces")) !== null, true);
    assert.equal(storage.getItem(backupKey), null);

    storage.failWriteKeys.delete(backupKey);
    storage.setItem(getAccountStorageKey("hey_spaces"), "damaged");
    const unreadable = new SpaceCreationEngine();
    assert.match(unreadable.previewRecovery({ accountScope: "account:space-recovery-snapshot-failure" }).error, /unavailable/);
  } finally { setAccountScope(previousScope); }
}));
