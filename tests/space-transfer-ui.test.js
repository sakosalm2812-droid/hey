import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/SpacesPage.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/SpacesPage.css", import.meta.url), "utf8");

test("Spaces page exports a private account-bound JSON download", () => {
  assert.match(page, /HEY\.spaces\.export\(\{ accountScope: requestedScope \}\)/);
  assert.match(page, /result\.accountScope !== requestedScope/);
  assert.match(page, /new Blob\(\[result\.exportJson\], \{ type: "application\/json" \}\)/);
  assert.match(page, /link\.download = `hey-private-spaces-/);
  assert.match(page, /URL\.revokeObjectURL\(url\)/);
});

test("Space file import is size-limited, account-fenced, and previewed before confirmation", () => {
  assert.match(page, /accept="\.json,application\/json"/);
  assert.match(page, /file\.size > maxTransferBytes/);
  assert.match(page, /await file\.text\(\)/);
  assert.match(page, /HEY\.spaces\.previewImport\(\{ accountScope: requestedScope, exportJson \}\)/);
  assert.match(page, /result\.requiresConfirmation !== true/);
  assert.match(page, /importPreview\?\.accountId === accountId && accountIsCurrent/);
  assert.match(page, /setImportPreview\(\{ accountId: requestedAccountId, previewId: result\.previewId, spaces: safeSpaces \}\)/);
  assert.match(page, /setImportPreview\(null\); setTransferError\(""\);/);
  assert.match(page, /HEY\.spaces\.confirmImport\(\{ previewId: importPreview\.previewId, confirm: true \}\)/);
  assert.match(page, /getAccountScope\(\) !== requestedScope/);
  assert.match(page, /setTransferError\(result\?\.error \|\|/);
  assert.match(page, /Import reviewed Spaces/);
  assert.match(page, /Choose file to import/);
  assert.match(page, /Export file/);
  assert.match(styles, /\.spaces-page__transfer-review/);
});

