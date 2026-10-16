import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getInstallInstructions, recordInstallDismissal, wasInstallRecentlyDismissed } from "../src/core/pwaInstall.js";

function storage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test("PWA install dismissal is respected for seven days and then expires", () => {
  const local = storage();
  recordInstallDismissal(local, 10_000);
  assert.equal(wasInstallRecentlyDismissed(local, 10_001), true);
  assert.equal(wasInstallRecentlyDismissed(local, 10_000 + 7 * 24 * 60 * 60 * 1000), false);
});

test("PWA dismissal storage failures do not break the install path", () => {
  const deniedStorage = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.equal(wasInstallRecentlyDismissed(deniedStorage), false);
  assert.doesNotThrow(() => recordInstallDismissal(deniedStorage));
});

test("manual installation guidance matches common mobile and desktop platforms", () => {
  assert.match(getInstallInstructions({ platform: "iPhone" }).steps.join(" "), /Safari/);
  assert.match(getInstallInstructions({ platform: "Android" }).steps.join(" "), /Chrome/);
  assert.match(getInstallInstructions({ platform: "Win32" }).steps.join(" "), /Edge/);
  assert.match(getInstallInstructions({ platform: "Unknown" }).steps.join(" "), /browser menu/);
});

test("web manifest declares a scoped standalone app, maskable icon, and HEY shortcuts", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/site.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.start_url, "/chat");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable" && icon.src === "/pwa-maskable.svg"));
  assert.ok(manifest.shortcuts.some((shortcut) => shortcut.url === "/chat"));
  assert.ok(manifest.shortcuts.some((shortcut) => shortcut.url === "/create"));
});
