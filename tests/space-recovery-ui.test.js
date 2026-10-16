import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/SpacesPage.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/SpacesPage.css", import.meta.url), "utf8");

test("Spaces page offers account-bound recovery preview and explicit restore confirmation", () => {
  assert.match(page, /HEY\.spaces\.previewRecovery\(\{ accountScope: requestedScope \}\)/);
  assert.match(page, /HEY\.spaces\.confirmRecovery\(\{ previewId: recoveryPreview\.previewId, confirm: true \}\)/);
  assert.match(page, /getAccountScope\(\) !== requestedScope/);
  assert.match(page, /result\?\.accountScope !== requestedScope/);
  assert.match(page, /recoveryPreview\?\.accountId === accountId && loadError/);
  assert.match(page, /Review recovery/);
  assert.match(page, /Restore reviewed snapshot/);
  assert.match(page, /last valid snapshot/);
  assert.match(styles, /\.spaces-page__recovery-review/);
});
