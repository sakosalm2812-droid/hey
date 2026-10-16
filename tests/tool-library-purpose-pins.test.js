import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getAccountScope, setAccountScope } from "../src/core/accountScope.js";
import { HEY } from "../src/core/index.js";
import { getPurposePinRecommendations } from "../src/lib/purposePinRecommendations.js";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test("purpose pin suggestions use only supported registered categories, account pins, and do not auto-pin", () => {
  const previousScope = getAccountScope();
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  try {
    setAccountScope("purpose-pin-owner-a");
    HEY.initialize();
    assert.deepEqual(HEY.onboarding.savePurposeSetup(["control_automation", "create_build", "custom"], "Make a business app"), {
      complete: true,
      selections: ["control_automation", "create_build", "custom"],
      customGoal: "Make a business app",
    });
    const setup = HEY.onboarding.getPurposeSetup();
    const catalog = HEY.tools.catalog({ platform: "web" });
    const emptyPreferences = HEY.tools.preferences.load().preferences;
    const view = getPurposePinRecommendations({
      accountId: "purpose-pin-owner-a",
      activeScope: getAccountScope(),
      setupAccountScope: getAccountScope(),
      setup,
      catalog,
      pinned: emptyPreferences.pinned,
    });
    assert.equal(view.accountScope, "account:purpose-pin-owner-a");
    assert.deepEqual(view.purposeSelections, ["control_automation", "create_build", "custom"]);
    assert.deepEqual(view.recommendations.map(({ name, status }) => [name, status]), [["computer.open_url", "supported"]]);
    assert.equal(JSON.stringify(view).includes("Make a business app"), false);
    assert.deepEqual(HEY.tools.preferences.load().preferences.pinned, [], "viewing suggestions never pins a tool");

    assert.equal(HEY.tools.preferences.setPinned("computer.open_url", true).success, true);
    const pinnedView = getPurposePinRecommendations({
      accountId: "purpose-pin-owner-a",
      activeScope: getAccountScope(),
      setupAccountScope: getAccountScope(),
      setup,
      catalog,
      pinned: HEY.tools.preferences.load().preferences.pinned,
    });
    assert.deepEqual(pinnedView.recommendations, [], "already-pinned tools are not suggested again");

    setAccountScope("purpose-pin-owner-b");
    assert.equal(getPurposePinRecommendations({
      accountId: "purpose-pin-owner-b",
      activeScope: getAccountScope(),
      setupAccountScope: "account:purpose-pin-owner-a",
      setup,
      catalog,
      pinned: HEY.tools.preferences.load().preferences.pinned,
    }), null, "a purpose setup from the previously active account is not accepted");
    assert.deepEqual(HEY.tools.preferences.load().preferences.pinned, []);
  } finally {
    setAccountScope(previousScope === "anonymous" ? null : previousScope.replace(/^account:/u, ""));
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else delete globalThis.localStorage;
  }
});

test("purpose pin derivation rejects hostile purpose/catalog data without invoking accessors", () => {
  let getterReads = 0;
  const hostileSelections = ["control_automation"];
  Object.defineProperty(hostileSelections, "0", { get() { getterReads += 1; return "control_automation"; } });
  const hostileCatalog = [Object.defineProperty({}, "name", { get() { getterReads += 1; return "computer.open_url"; } })];
  const common = { accountId: "purpose-pin-hostile", activeScope: "account:purpose-pin-hostile", setupAccountScope: "account:purpose-pin-hostile", pinned: [] };
  assert.equal(getPurposePinRecommendations({
    ...common,
    setup: { complete: true, selections: hostileSelections },
    catalog: [],
  }), null);
  assert.deepEqual(getPurposePinRecommendations({
    ...common,
    setup: { complete: true, selections: ["control_automation"] },
    catalog: hostileCatalog,
  }).recommendations, []);
  assert.equal(getPurposePinRecommendations({
    ...common,
    setup: { complete: true, selections: ["__proto__"] },
    catalog: [],
  }), null);
  assert.equal(getPurposePinRecommendations({
    ...common,
    setup: { complete: true, selections: ["control_automation"] },
    catalog: [{ name: "computer.open_url", category: "browser", status: "unsupported", available: false }],
  }).recommendations.length, 0);
  assert.equal(getPurposePinRecommendations({
    ...common,
    setup: { complete: true, selections: ["custom"], get customGoal() { getterReads += 1; throw new Error("must not inspect goal text"); } },
    catalog: [],
  }).recommendations.length, 0);
  assert.equal(getterReads, 0);
});

test("Tool Library presents purpose-derived pin suggestions with account fencing and explicit user action", () => {
  const page = readFileSync(new URL("../src/ToolLibraryPage.jsx", import.meta.url), "utf8");
  assert.match(page, /HEY\.onboarding\.getPurposeSetup\(\)/);
  assert.match(page, /getPurposePinRecommendations\(/);
  assert.match(page, /getAccountScope\(\) !== purposePinView\.accountScope/);
  assert.match(page, /HEY\.tools\.preferences\.setPinned\(name, !current\)/);
  assert.match(page, /Adding a pin saves a shortcut; it does not grant permission/);
  assert.match(page, /Custom goal text is not interpreted/);
});
