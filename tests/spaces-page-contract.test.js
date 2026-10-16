import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spaceMembershipMatchesAccount, spaceMembershipRetryMatches, spacePreviewMatchesAccount, spacesForAccount } from "../src/spacePageAccount.js";

const page = await readFile(new URL("../src/SpacesPage.jsx", import.meta.url), "utf8");
const accountHelpers = await readFile(new URL("../src/spacePageAccount.js", import.meta.url), "utf8");
const routes = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const navigation = await readFile(new URL("../src/components/layout/AppLayout.jsx", import.meta.url), "utf8");

test("Spaces page exposes accessible loading, empty, error, and retry states", () => {
  assert.match(routes, /path="\/spaces"[^\n]*SpacesPage/);
  assert.match(navigation, /label: "Spaces", path: "\/spaces"/);
  assert.match(page, /<label htmlFor="space-prompt">/);
  assert.match(page, /aria-describedby="space-prompt-help"/);
  assert.match(page, /role="status" aria-live="polite"/);
  assert.match(page, /role="alert"/);
  assert.match(page, /No Spaces yet/);
  assert.match(page, /onClick=\{loadSpaces\}/);
});

test("Space creation reviews exact private effects and requires an explicit confirm action", () => {
  assert.match(page, /HEY\.spaces\.previewNaturalLanguageCreation\(\{ prompt \}\)/);
  assert.match(page, /HEY\.spaces\.confirmNaturalLanguageCreation\(\{ previewId: pending\.previewId, confirm: true \}\)/);
  assert.match(page, /result\.action !== "create_private_space"/);
  assert.match(page, /result\.space\?\.visibility !== "private"/);
  assert.match(page, /result\.space\?\.sharing !== "off"/);
  assert.match(page, /result\.permissionsChanged !== false/);
  assert.match(page, /result\.space\.accountScope !== `account:\$\{accountId\}`/);
  assert.match(accountHelpers, /space\?\.accountScope === `account:\$\{accountId\}`/);
  assert.match(page, /Confirm and create/);
  assert.doesNotMatch(page, /previewNaturalLanguageCreation\(\{[^}]*accountScope\s*:/);
});

test("pending confirmation is invalidated on account switch and cannot confirm for a different signed-in user", () => {
  assert.match(page, /const accountId = user\?\.id \|\| ""/);
  assert.match(page, /setPreview\(null\)/);
  assert.match(page, /\[accountId, refreshSpaces\]/);
  assert.match(page, /spacePreviewMatchesAccount\(pending, accountId, accountRef\.current\)/);
  assert.match(page, /preview\.accountId !== accountId/);
  assert.match(page, /accountRef\.current !== accountId/);
});

test("account switch invalidates stale page previews and filters listed Spaces to the active account", () => {
  const previewA = { previewId: "preview-a", accountId: "account-a" };
  assert.equal(spacePreviewMatchesAccount(previewA, "account-a", "account-a"), true);
  assert.equal(spacePreviewMatchesAccount(previewA, "account-b", "account-b"), false);
  assert.equal(spacePreviewMatchesAccount(previewA, "account-a", "account-b"), false);
  assert.equal(spacePreviewMatchesAccount(null, "account-a", "account-a"), false);

  const mixed = [
    { id: "a", accountScope: "account:account-a" },
    { id: "b", accountScope: "account:account-b" },
    { id: "missing" },
  ];
  assert.deepEqual(spacesForAccount(mixed, "account-a").map((space) => space.id), ["a"]);
  assert.deepEqual(spacesForAccount(mixed, "account-b").map((space) => space.id), ["b"]);
  assert.deepEqual(spacesForAccount(mixed, ""), []);
  assert.deepEqual(spacesForAccount(null, "account-a"), []);
});

test("Space tool membership is account fenced, revision checked, and separate from execution permission", () => {
  const snapshot = {
    success: true,
    accountScope: "account:account-a",
    spaceId: "space-a",
    revision: 3,
    toolIds: ["calendar"],
  };
  assert.equal(spaceMembershipMatchesAccount(snapshot, "account-a", "account:account-a", "space-a"), true);
  assert.equal(spaceMembershipMatchesAccount(snapshot, "account-b", "account:account-b", "space-a"), false);
  assert.equal(spaceMembershipMatchesAccount(snapshot, "account-a", "account:account-b", "space-a"), false);
  assert.equal(spaceMembershipMatchesAccount({ ...snapshot, spaceId: "space-b" }, "account-a", "account:account-a", "space-a"), false);
  assert.equal(spaceMembershipMatchesAccount({ ...snapshot, revision: -1 }, "account-a", "account:account-a", "space-a"), false);
  assert.equal(spaceMembershipMatchesAccount({ ...snapshot, toolIds: null }, "account-a", "account:account-a", "space-a"), false);

  assert.match(page, /HEY\.tools\.catalog\(\{ platform: "web" \}\)/);
  assert.match(page, /HEY\.spaces\.getLayoutPreferences\(space\.id\)/);
  assert.match(page, /HEY\.spaces\.setToolMembership\(\{/);
  assert.match(page, /expectedRevision: currentLayout\.revision/);
  assert.match(page, /spaceMembershipMatchesAccount\(result\.current, accountId, getAccountScope\(\), space\.id\)/);
  assert.match(page, /Tool membership organizes this Space\. It does not grant permission or make a tool executable\./);
  assert.match(page, /<fieldset className="spaces-page__tool-category"/);
  assert.match(page, /category = tool\.category \|\| "general"/);
  assert.match(page, /aria-expanded=\{expanded\}/);
  assert.match(page, /Registered tools could not be loaded\./);
});

test("conflicted membership retry is available only for the latest Space revision in the active account", () => {
  const latest = { success: true, accountScope: "account:account-a", spaceId: "space-a", revision: 4, toolIds: ["calendar"] };
  const retry = { accountId: "account-a", accountScope: "account:account-a", spaceId: "space-a", toolName: "notes", member: true, expectedRevision: 4 };
  assert.equal(spaceMembershipRetryMatches(retry, latest, "account-a", "account:account-a", "account-a", "space-a"), true);
  assert.equal(spaceMembershipRetryMatches(retry, { ...latest, revision: 5 }, "account-a", "account:account-a", "account-a", "space-a"), false);
  assert.equal(spaceMembershipRetryMatches(retry, latest, "account-b", "account:account-b", "account-b", "space-a"), false);
  assert.equal(spaceMembershipRetryMatches(retry, latest, "account-a", "account:account-b", "account-a", "space-a"), false);
  assert.equal(spaceMembershipRetryMatches(retry, latest, "account-a", "account:account-a", "account-b", "space-a"), false);
  assert.equal(spaceMembershipRetryMatches({ ...retry, spaceId: "space-b" }, latest, "account-a", "account:account-a", "account-a", "space-a"), false);
  assert.equal(spaceMembershipRetryMatches({ ...retry, member: "true" }, latest, "account-a", "account:account-a", "account-a", "space-a"), false);
  assert.equal(spaceMembershipRetryMatches({ ...retry, expectedRevision: -1 }, latest, "account-a", "account:account-a", "account-a", "space-a"), false);
  assert.match(page, /Retry my change/);
  assert.match(page, /spaceMembershipRetryMatches\(retryMembership, currentLayout, accountId, getAccountScope\(\), accountRef\.current, space\.id\)/);
  assert.match(page, /expectedRevision: currentLayout\.revision/);
});

test("Spaces exposes revision-checked saved preference editing with explicit conflict recovery", () => {
  assert.match(page, /Edit saved preferences/);
  assert.match(page, /Favorite tool IDs/);
  assert.match(page, /Widget IDs/);
  assert.match(page, /Shortcut IDs/);
  assert.match(page, /HEY\.spaces\.updateLayoutPreferences\(\{/);
  assert.match(page, /expectedRevision: preferences\.revision/);
  assert.match(page, /spacePreferencesMatchAccount\(result\.current, accountId, getAccountScope\(\), space\.id\)/);
  assert.match(page, /Keep my draft and review latest/);
  assert.match(page, /Load latest and discard my draft/);
  assert.match(page, /Onboarding suggestions never replace these choices/);
  assert.match(page, /pending\.accountScope !== `account:\$\{accountId\}`/);
});

test("Space cards expose a review, explicit delete confirmation, and recoverable failure path", () => {
  assert.match(page, /onClick=\{\(\) => previewSpaceDeletion\(space\)\}/);
  assert.match(page, /HEY\.spaces\.previewDeletion\(\{ accountScope: `account:\$\{accountId\}`, spaceId: space\.id, expectedLayoutRevision: layout\.revision \}\)/);
  assert.match(page, /result\.action !== "delete_private_space"/);
  assert.match(page, /result\.requiresConfirmation !== true/);
  assert.match(page, /Review Space deletion/);
  assert.match(page, /Delete permanently/);
  assert.match(page, /HEY\.spaces\.confirmDeletion\(\{ previewId: pending\.previewId, confirm: true \}\)/);
  assert.match(page, /The Space was not deleted\. Review it again before retrying\./);
  assert.match(page, /Review again/);
  assert.match(page, /pending\.accountScope !== `account:\$\{accountId\}`/);
  assert.match(page, /setDeletePreview\(null\)/);
  assert.match(page, /Access permissions will not change\./);
});
