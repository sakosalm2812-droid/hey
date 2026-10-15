import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_INTERFACE_LEVEL,
  mergeInterfaceLevel,
  resolveInterfaceLevel,
  saveInterfaceLevel,
} from "../src/lib/interfaceLevel.js";

test("interface level defaults safely and accepts only supported settings", () => {
  assert.equal(DEFAULT_INTERFACE_LEVEL, "simple");
  assert.equal(resolveInterfaceLevel({ interfaceLevel: "advanced" }), "advanced");
  assert.equal(resolveInterfaceLevel({ interfaceLevel: "unexpected" }), "simple");
  assert.equal(resolveInterfaceLevel(null), "simple");
});

test("saving an interface level is account-scoped and preserves other preferences", async () => {
  const calls = [];
  const settings = { "Voice Activation": false, color: "indigo" };
  const result = await saveInterfaceLevel({
    userId: " account-17 ",
    level: "advanced",
    getSettings: async (userId) => {
      calls.push(["read", userId]);
      return settings;
    },
    updateSettings: async (userId, nextSettings) => calls.push(["write", userId, nextSettings]),
  });

  assert.equal(result, "advanced");
  assert.deepEqual(calls, [
    ["read", "account-17"],
    ["write", "account-17", { "Voice Activation": false, color: "indigo", interfaceLevel: "advanced" }],
  ]);
});

test("failed settings reads or writes never report a persisted choice", async () => {
  let wrote = false;
  await assert.rejects(saveInterfaceLevel({
    userId: "account-18",
    level: "simple",
    getSettings: async () => { throw new Error("offline"); },
    updateSettings: async () => { wrote = true; },
  }), /offline/);
  assert.equal(wrote, false);

  await assert.rejects(saveInterfaceLevel({
    userId: "account-18",
    level: "advanced",
    getSettings: async () => ({}),
    updateSettings: async () => { throw new Error("write denied"); },
  }), /write denied/);
});

test("invalid modes and missing account identifiers fail before persistence", async () => {
  let reads = 0;
  const persistence = {
    getSettings: async () => { reads += 1; return {}; },
    updateSettings: async () => {},
  };

  await assert.rejects(saveInterfaceLevel({ userId: "account-19", level: "expert", ...persistence }), /simple or advanced/);
  await assert.rejects(saveInterfaceLevel({ userId: " ", level: "simple", ...persistence }), /account is required/);
  assert.equal(reads, 0);
  assert.deepEqual(mergeInterfaceLevel(null, "simple"), { interfaceLevel: "simple" });
});

test("the interface preference is keyboard-operable, account-backed, and changes the existing tools view", async () => {
  const [settingsPage, app, appLayout, toolsPage, settingsManager, interfaceContext, settingsStyles, toolsStyles] = await Promise.all([
    readFile(new URL("../src/SettingsPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/layout/AppLayout.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/ToolLibraryPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/settingsManager.js", import.meta.url), "utf8"),
    readFile(new URL("../src/context/InterfaceLevelContext.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../src/ToolLibraryPage.css", import.meta.url), "utf8"),
  ]);

  assert.match(settingsPage, /type="radio"/);
  assert.match(settingsPage, /name="hey-interface-level"/);
  assert.match(settingsPage, /onChange=\{\(\) => \{ void changeInterfaceLevel\(/);
  assert.match(settingsPage, /fieldset className="hey-interface-level-options" disabled=\{interfaceLoading \|\| interfaceSaving \|\| Boolean\(savingSetting\) \|\| !user\?\.id\}/);
  assert.match(app, /<InterfaceLevelProvider>/);
  assert.match(appLayout, /data-interface-level=\{interfaceLevel\}/);
  assert.match(toolsPage, /interfaceLevel === "advanced"/);
  assert.match(toolsPage, /<details className="tool-library__advanced-details">/);
  assert.match(toolsPage, /tool\.permissions\.length > 0/);
  assert.match(toolsPage, /tool\.requiresConfirmation/);
  assert.match(toolsPage, /tool-library__permission-note/);
  assert.match(settingsManager, /if \(error\) \{[\s\S]*?throw error;/);
  assert.match(interfaceContext, /setLevel\(previousLevel\)/);
  assert.match(interfaceContext, /requestRef\.current === request/);
  assert.match(settingsStyles, /\.hey-interface-level-options input:focus-visible/);
  assert.match(toolsStyles, /\.tool-library__advanced-details summary:focus-visible/);
});
