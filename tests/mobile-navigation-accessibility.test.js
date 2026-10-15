import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getMobileNavigationAccessibility } from "../src/components/layout/mobileNavigationState.js";

test("a closed mobile navigation is hidden from assistive technology and tab order", () => {
  assert.deepEqual(getMobileNavigationAccessibility(true, false), {
    ariaHidden: true,
    inert: true,
  });
});

test("an open mobile navigation remains available", () => {
  assert.deepEqual(getMobileNavigationAccessibility(true, true), {
    ariaHidden: false,
    inert: false,
  });
});

test("desktop navigation remains available when the mobile drawer is closed", () => {
  assert.deepEqual(getMobileNavigationAccessibility(false, false), {
    ariaHidden: false,
    inert: false,
  });
});

test("the app shell connects the menu trigger to its drawer and restores focus on Escape", async () => {
  const source = await readFile(new URL("../src/components/layout/AppLayout.jsx", import.meta.url), "utf8");
  assert.match(source, /aria-controls="hey-app-navigation"/);
  assert.match(source, /menuToggleRef\.current\?\.focus\(\)/);
  assert.match(source, /firstLink\?\.focus\(\)/);
  assert.match(source, /inert=\{mobileNavigationAccessibility\.inert\}/);
});
