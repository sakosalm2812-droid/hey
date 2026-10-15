import assert from "node:assert/strict";
import test from "node:test";
import { createToolLibraryPreferenceStore, TOOL_LIBRARY_PREFERENCE_LIMITS } from "../src/core/toolLibraryPreferences.js";
import { CAPABILITY_STATUS, registerCapability } from "../src/core/capabilityRegistry.js";
import { listToolCatalog, registerTool, runToolLibraryEntry, toolLibraryPreferenceStore, unregisterTool } from "../src/core/toolRegistry.js";
import { seedPermissions, clearPermissions } from "../src/core/permissionManager.js";
import { setAccountScope } from "../src/core/accountScope.js";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test("tool favorites and pins are account-scoped, and successful runs populate bounded recents", () => {
  const storage = new MemoryStorage();
  const registered = new Set(Array.from({ length: 35 }, (_, index) => `tool.test_${index}`));
  let scope = "account:tool-pref-a";
  let clock = 0;
  const store = createToolLibraryPreferenceStore({
    storageProvider: () => storage,
    getScope: () => scope,
    isToolRegistered: (name) => registered.has(name),
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)),
  });

  assert.equal(store.setFavorite("tool.test_0").success, true);
  assert.equal(store.setPinned("tool.test_0").success, true);
  for (let index = 0; index < 35; index += 1) {
    assert.equal(store.recordRecent(`tool.test_${index}`).success, true);
  }
  const accountA = store.load().preferences;
  assert.deepEqual(accountA.favorites, ["tool.test_0"]);
  assert.deepEqual(accountA.pinned, ["tool.test_0"]);
  assert.equal(accountA.recent.length, TOOL_LIBRARY_PREFERENCE_LIMITS.maxRecents);
  assert.equal(accountA.recent[0].name, "tool.test_34");
  assert.equal(accountA.recent.at(-1).name, "tool.test_5");
  assert.equal(Object.isFrozen(accountA.recent), true);
  assert.equal(Object.isFrozen(accountA.recent[0]), true);

  scope = "account:tool-pref-b";
  assert.deepEqual(store.load().preferences, { favorites: [], pinned: [], recent: [] });
  assert.equal(store.setFavorite("tool.test_1").success, true);
  scope = "account:tool-pref-a";
  assert.deepEqual(store.load().preferences.favorites, ["tool.test_0"]);
  assert.deepEqual(store.load().preferences.pinned, ["tool.test_0"]);
});

test("removed or renamed tools disappear from saved preferences without changing catalog discovery", () => {
  const storage = new MemoryStorage();
  const registered = new Set(["tool.old_name"]);
  const store = createToolLibraryPreferenceStore({
    storageProvider: () => storage,
    getScope: () => "account:tool-pref-rename",
    isToolRegistered: (name) => registered.has(name),
    now: () => new Date("2026-10-15T00:00:00.000Z"),
  });
  assert.equal(store.setFavorite("tool.old_name").success, true);
  assert.equal(store.setPinned("tool.old_name").success, true);
  assert.equal(store.recordRecent("tool.old_name").success, true);

  // A rename is a removal plus a new canonical registry name. No preference
  // is guessed or transferred to the new tool identity, and loading while
  // the old name is absent persists removal so it cannot later resurrect.
  registered.delete("tool.old_name");
  registered.add("tool.new_name");
  assert.equal(store.load().status, "pruned");
  assert.deepEqual(store.load().preferences, { favorites: [], pinned: [], recent: [] });
  assert.equal(store.setFavorite("tool.old_name").status, "invalid_input");
  registered.delete("tool.new_name");
  registered.add("tool.old_name");
  assert.deepEqual(store.load().preferences, { favorites: [], pinned: [], recent: [] });
  assert.equal(store.setFavorite("tool.old_name").success, true);
  assert.deepEqual(store.load().preferences.favorites, ["tool.old_name"]);
});

test("hostile names, oversized collections, corrupt storage and failed writes fail closed", () => {
  const storage = new MemoryStorage();
  const registered = new Set(Array.from({ length: TOOL_LIBRARY_PREFERENCE_LIMITS.maxFavorites + 1 }, (_, index) => `tool.bound_${index}`));
  const scope = "account:tool-pref-hostile";
  const store = createToolLibraryPreferenceStore({
    storageProvider: () => storage,
    getScope: () => scope,
    isToolRegistered: (name) => registered.has(name),
  });

  let getterReads = 0;
  const hostileName = Object.defineProperty({}, "toString", {
    get() { getterReads += 1; return () => "tool.bound_0"; },
  });
  assert.equal(store.setFavorite(hostileName).status, "invalid_input");
  assert.equal(getterReads, 0);
  assert.equal(store.setPinned("tool.missing").status, "invalid_input");
  assert.equal(store.setFavorite("tool.bound_0 ").status, "invalid_input");

  for (let index = 0; index < TOOL_LIBRARY_PREFERENCE_LIMITS.maxFavorites; index += 1) {
    assert.equal(store.setFavorite(`tool.bound_${index}`).success, true);
  }
  assert.equal(store.setFavorite(`tool.bound_${TOOL_LIBRARY_PREFERENCE_LIMITS.maxFavorites}`).status, "invalid_input");
  assert.equal(store.load().preferences.favorites.length, TOOL_LIBRARY_PREFERENCE_LIMITS.maxFavorites);
  storage.setItem = () => {};
  assert.equal(store.setPinned("tool.bound_0").status, "storage_failed", "a write without read-back verification must not report success");
  assert.deepEqual(store.load().preferences.pinned, []);

  const key = `hey_scoped:${encodeURIComponent(scope)}:hey_tool_library_preferences`;
  storage.setItem = MemoryStorage.prototype.setItem.bind(storage);
  storage.setItem(key, JSON.stringify({ version: 1, scope: "account:someone-else", preferences: {} }));
  assert.equal(store.load().status, "invalid_store");
  storage.values.delete(key);
  storage.setItem = () => { throw new Error("quota"); };
  assert.equal(store.setPinned("tool.bound_0").status, "storage_failed");

  const hostileStorage = Object.defineProperty({}, "getItem", {
    get() { throw new Error("hostile storage getter"); },
  });
  const unavailableStore = createToolLibraryPreferenceStore({
    storageProvider: () => hostileStorage,
    getScope: () => scope,
    isToolRegistered: (name) => registered.has(name),
  });
  assert.equal(unavailableStore.load().status, "unavailable");
});

test("an account switch during preference persistence rolls back the captured account write", () => {
  const storage = new MemoryStorage();
  const registered = new Set(["tool.switch_race"]);
  let scope = "account:tool-pref-before";
  const store = createToolLibraryPreferenceStore({
    storageProvider: () => storage,
    getScope: () => scope,
    isToolRegistered: (name) => registered.has(name),
  });
  const key = `hey_scoped:${encodeURIComponent(scope)}:hey_tool_library_preferences`;
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (storedKey, value) => {
    originalSetItem(storedKey, value);
    scope = "account:tool-pref-after";
  };

  const result = store.setFavorite("tool.switch_race");
  assert.equal(result.success, false);
  assert.equal(result.status, "account_required");
  assert.equal(storage.getItem(key), null, "the write for the old account is rolled back");
  assert.deepEqual(store.load().preferences, { favorites: [], pinned: [], recent: [] });
});

test("recent-use integration records only successful Tool Library runs and never filters the catalog", async () => {
  const previousStorage = globalThis.localStorage;
  const storage = new MemoryStorage();
  const name = "test.tool_library.recent_integration";
  const capability = "test.tool_library.recent_integration_capability";
  registerCapability({ id: capability, name: "Recent integration capability", platformSupport: { web: CAPABILITY_STATUS.supported } });
  globalThis.localStorage = storage;
  setAccountScope("tool-pref-runner");
  seedPermissions([{ permission: "filesystem.read", status: "granted", scope: "account" }], "tool-pref-runner");
  try {
    registerTool(name, async (input) => input.fail
      ? { success: false, error: "fixture failure" }
      : { success: true, value: "ok" }, {
      description: "Recent integration fixture",
      capabilities: [capability],
      permission: "filesystem.read",
    });
    const catalogBefore = listToolCatalog({ platform: "web" }).map(({ name: item }) => item);
    assert.equal(toolLibraryPreferenceStore.setFavorite(name).success, true);
    assert.deepEqual(listToolCatalog({ platform: "web" }).map(({ name: item }) => item), catalogBefore);

    const failed = await runToolLibraryEntry(name, { fail: true }, {
      platform: "web",
      user: { id: "tool-pref-runner", plan: "elite", entitlements: ["elite"] },
    });
    assert.equal(failed.success, false);
    assert.deepEqual(toolLibraryPreferenceStore.load().preferences.recent, []);

    const result = await runToolLibraryEntry(name, {}, {
      platform: "web",
      user: { id: "tool-pref-runner", plan: "elite", entitlements: ["elite"] },
    });
    assert.equal(result.success, true);
    assert.equal(toolLibraryPreferenceStore.load().preferences.recent[0].name, name);

    unregisterTool(name);
    assert.deepEqual(toolLibraryPreferenceStore.load().preferences, { favorites: [], pinned: [], recent: [] });

    registerTool(name, async () => ({ success: true, value: "still succeeded" }), {
      description: "Recent integration failure fixture",
      capabilities: [capability],
      permission: "filesystem.read",
    });
    storage.setItem = () => { throw new Error("quota"); };
    const storageFailure = await runToolLibraryEntry(name, {}, {
      platform: "web",
      user: { id: "tool-pref-runner", plan: "elite", entitlements: ["elite"] },
    });
    assert.equal(storageFailure.success, true, "optional recent history storage cannot turn successful tool execution into failure");
  } finally {
    unregisterTool(name);
    clearPermissions();
    setAccountScope(null);
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
