import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/SpacesPage.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/SpacesPage.css", import.meta.url), "utf8");

test("onboarding Space suggestions load through the account-scoped Spaces API", () => {
  assert.match(page, /HEY\.spaces\.getOnboardingSuggestions\(\)/);
  assert.match(page, /result\?\.accountScope !== `account:\$\{requestedAccountId\}`/);
  assert.match(page, /suggestion\.previewRequest\?\.accountScope === `account:\$\{requestedAccountId\}`/);
  assert.match(page, /suggestion\.permissionsChanged === false/);
  assert.match(page, /suggestion\.requiresConfirmation === true/);
  assert.match(page, /accountRef\.current !== requestedAccountId \|\| getAccountScope\(\) !== `account:\$\{requestedAccountId\}`/);
  assert.match(page, /\[accountId, loadOnboardingSuggestions, loadToolCatalog, refreshSpaces\]/);
});

test("suggestion UI exposes accessible loading, empty, error, retry, and preview states", () => {
  assert.match(page, /aria-labelledby="space-suggestions-title"/);
  assert.match(page, /Loading Space suggestions/);
  assert.match(page, /No onboarding suggestions yet/);
  assert.match(page, /Space suggestions could not be loaded/);
  assert.match(page, /Sign in to view onboarding Space suggestions/);
  assert.match(page, /Refresh suggestions/);
  assert.match(page, /onClick=\{loadOnboardingSuggestions\}/);
  assert.match(page, /Preview suggestion/);
  assert.match(styles, /\.spaces-page__suggestion-list/);
});

test("suggestions use their API preview request and retain explicit confirmation", () => {
  assert.match(page, /HEY\.spaces\.previewNaturalLanguageCreation\(previewRequest\)/);
  assert.match(page, /createPreviewFromRequest\(suggestion\.previewRequest\)/);
  assert.match(page, /HEY\.spaces\.confirmNaturalLanguageCreation\(\{ previewId: pending\.previewId, confirm: true \}\)/);
  assert.match(page, /Confirm and create/);
  assert.match(page, /permissionsChanged !== false/);
  assert.match(page, /Permissions<\/dt><dd>Unchanged<\/dd>/);
});
