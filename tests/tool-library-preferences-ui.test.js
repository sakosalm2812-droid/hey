import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getToolLibraryPreferenceView } from "../src/lib/toolLibraryPreferenceView.js";

const [pageSource, styles] = await Promise.all([
  readFile(new URL("../src/ToolLibraryPage.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/ToolLibraryPage.css", import.meta.url), "utf8"),
]);

test("Tool Library uses the canonical account-scoped preferences API", () => {
  assert.match(pageSource, /HEY\.tools\.preferences\.load\(\)/);
  assert.match(pageSource, /HEY\.tools\.preferences\.setFavorite\(name, !current\)/);
  assert.match(pageSource, /HEY\.tools\.preferences\.setPinned\(name, !current\)/);
  assert.match(pageSource, /getAccountScope\(\) !== `account:\$\{accountId\}`/);
  assert.match(pageSource, /getToolLibraryPreferenceView\(/);
  assert.doesNotMatch(pageSource, /localStorage|createToolLibraryPreferenceStore/);
});

test("favorite and pin controls expose pressed state and accessible names", () => {
  assert.match(pageSource, /aria-label=\{`\$\{isFavorite \? "Remove" : "Add"\}[^`]*favorites`\}/);
  assert.match(pageSource, /aria-pressed=\{isFavorite\}/);
  assert.match(pageSource, /aria-label=\{`\$\{isPinned \? "Unpin" : "Pin"\}[^`]*`\}/);
  assert.match(pageSource, /aria-pressed=\{isPinned\}/);
  assert.match(pageSource, /disabled=\{!canManagePreferences\}/);
  assert.match(styles, /tool-library__preference-button:focus-visible/);
});

test("favorites, pins, and recents have accessible views and explicit empty and failure states", () => {
  assert.match(pageSource, /role="group" aria-label="Filter tools"/);
  assert.match(pageSource, /aria-pressed=\{displayedView === "favorites"\}/);
  assert.match(pageSource, /aria-pressed=\{displayedView === "pinned"\}/);
  assert.match(pageSource, /Recently used/);
  assert.match(pageSource, /<time dateTime=\{entry\.usedAt\}>/);
  assert.match(pageSource, /No favorites yet/);
  assert.match(pageSource, /No pinned tools yet/);
  assert.match(pageSource, /role="alert"/);
  assert.match(pageSource, /role="status"/);
});

test("the UI never exposes the previous account's preferences during account changes or storage errors", () => {
  const accountAState = {
    status: "ready",
    accountId: "account-a",
    preferences: { favorites: ["tool.private_a"], pinned: ["tool.private_a"], recent: [] },
  };

  const switchingAccount = getToolLibraryPreferenceView({
    accountId: "account-b",
    activeScope: "account:account-b",
    state: accountAState,
  });
  assert.equal(switchingAccount.status, "loading");
  assert.equal(switchingAccount.ready, false);
  assert.deepEqual(switchingAccount.preferences, { favorites: [], pinned: [], recent: [] });

  const wrongScope = getToolLibraryPreferenceView({
    accountId: "account-a",
    activeScope: "anonymous",
    state: accountAState,
  });
  assert.equal(wrongScope.status, "account_required");
  assert.deepEqual(wrongScope.preferences.favorites, []);

  const storageFailure = getToolLibraryPreferenceView({
    accountId: "account-a",
    activeScope: "account:account-a",
    state: { status: "storage_failed", accountId: "account-a", preferences: null },
  });
  assert.equal(storageFailure.status, "storage_failed");
  assert.equal(storageFailure.ready, false);
  assert.deepEqual(storageFailure.preferences.pinned, []);
});
