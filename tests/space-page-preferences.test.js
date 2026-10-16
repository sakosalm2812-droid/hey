import test from "node:test";
import assert from "node:assert/strict";
import { parseSpacePreferenceDraft, spacePreferencesMatchAccount } from "../src/spacePagePreferences.js";

test("saved preference snapshots are fenced to the active account, Space, and safe revision", () => {
  const snapshot = {
    accountScope: "account:owner-a",
    spaceId: "space-a",
    revision: 3,
    favoriteToolIds: ["tool.search"],
    widgetIds: ["notes"],
    shortcutIds: ["open-notes"],
  };
  assert.equal(spacePreferencesMatchAccount(snapshot, "owner-a", "account:owner-a", "space-a"), true);
  assert.equal(spacePreferencesMatchAccount(snapshot, "owner-b", "account:owner-b", "space-a"), false);
  assert.equal(spacePreferencesMatchAccount(snapshot, "owner-a", "account:owner-b", "space-a"), false);
  assert.equal(spacePreferencesMatchAccount(snapshot, "owner-a", "account:owner-a", "space-b"), false);
  assert.equal(spacePreferencesMatchAccount({ ...snapshot, revision: -1 }, "owner-a", "account:owner-a", "space-a"), false);
  assert.equal(spacePreferencesMatchAccount({ ...snapshot, favoriteToolIds: ["../other-account"] }, "owner-a", "account:owner-a", "space-a"), false);
  assert.equal(spacePreferencesMatchAccount({ ...snapshot, widgetIds: ["notes", "notes"] }, "owner-a", "account:owner-a", "space-a"), false);
  assert.equal(spacePreferencesMatchAccount({ ...snapshot, shortcutIds: null }, "owner-a", "account:owner-a", "space-a"), false);
});

test("preference drafts accept bounded stable IDs and reject malformed, duplicate, or oversized input", () => {
  assert.deepEqual(parseSpacePreferenceDraft("tool.search\nnotes\nopen-notes"), { value: ["tool.search", "notes", "open-notes"] });
  assert.deepEqual(parseSpacePreferenceDraft(" notes \n\n calendar "), { value: ["notes", "calendar"] });
  assert.match(parseSpacePreferenceDraft("../private").error, /IDs must start/);
  assert.match(parseSpacePreferenceDraft("notes\nnotes").error, /duplicate/);
  assert.match(parseSpacePreferenceDraft(Array.from({ length: 33 }, (_, index) => `widget-${index}`).join("\n")).error, /no more than 32/);
  assert.match(parseSpacePreferenceDraft(`tool.${"x".repeat(64)}`).error, /up to 64 characters/);
  assert.match(parseSpacePreferenceDraft(null).error, /one per line/);
});
