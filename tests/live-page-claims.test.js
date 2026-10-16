import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const livePage = await readFile(new URL("../src/pages/Live.jsx", import.meta.url), "utf8");

test("public Live page does not claim unverified always-on, on-device, or instant behavior", () => {
  assert.doesNotMatch(livePage, /always listening|runs quietly in the background|on-device processing keeps your words yours|\bInstant\b/iu);
  assert.match(livePage, /when you choose/iu);
  assert.match(livePage, /permissions, account, browser, and connected services/iu);
  assert.match(livePage, /check each in-app feature for its current availability and data path/iu);
});

test("public Live page states the account and storage dependencies of saved memories", () => {
  assert.match(livePage, /authenticated account and configured storage/iu);
  assert.match(livePage, /does not imply background monitoring/iu);
});
