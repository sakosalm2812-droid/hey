import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  confirmSpaceLifecycle,
  prepareSpaceLifecycle,
  spaceLifecycleFromRecord,
  spaceLifecycleMatchesAccount,
} from "../src/spacePageLifecycle.js";

const page = await readFile(new URL("../src/SpacesPage.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/SpacesPage.css", import.meta.url), "utf8");

function mockSpacesApi() {
  let record = { id: "space-a", accountScope: "account:owner-a", name: "Planning", description: "Weekly", status: "active", lifecycleRevision: 0, visibility: "private", sharing: "off", layoutPreferences: { favoriteToolIds: ["calendar"] } };
  const events = [];
  return {
    events,
    getPrivateSpaces() { return [{ ...record, layoutPreferences: { ...record.layoutPreferences } }]; },
    previewArchive(request) {
      events.push(["previewArchive", request]);
      if (request.expectedLifecycleRevision !== record.lifecycleRevision || record.status !== "active") return { code: "stale_revision", current: record };
      return { previewId: "archive-preview", accountScope: record.accountScope, action: "archive_private_space", space: record, effects: ["Archive this private Space"], permissionsChanged: false, requiresConfirmation: true };
    },
    previewRestore(request) {
      events.push(["previewRestore", request]);
      if (request.expectedLifecycleRevision !== record.lifecycleRevision || record.status !== "archived") return { code: "stale_revision", current: record };
      return { previewId: "restore-preview", accountScope: record.accountScope, action: "restore_private_space", space: record, effects: ["Restore this private Space"], permissionsChanged: false, requiresConfirmation: true };
    },
    confirmArchive(request) {
      events.push(["confirmArchive", request]);
      if (request.confirm !== true) return { error: "Explicit confirmation is required" };
      if (record.lifecycleRevision !== 0 || record.status !== "active") return { code: "stale_revision", current: record };
      record = { ...record, status: "archived", lifecycleRevision: 1 };
      return { success: true, accountScope: record.accountScope, spaceId: record.id, status: record.status, revision: record.lifecycleRevision, permissionsChanged: false };
    },
    confirmRestore(request) {
      events.push(["confirmRestore", request]);
      if (request.confirm !== true) return { error: "Explicit confirmation is required" };
      if (record.lifecycleRevision !== 1 || record.status !== "archived") return { code: "stale_revision", current: record };
      record = { ...record, status: "active", lifecycleRevision: 2 };
      return { success: true, accountScope: record.accountScope, spaceId: record.id, status: record.status, revision: record.lifecycleRevision, permissionsChanged: false };
    },
    changeExternally(patch) { record = { ...record, ...patch }; },
  };
}

test("Space lifecycle helpers prepare, explicitly confirm, and restore without changing saved data", () => {
  const api = mockSpacesApi();
  const before = api.getPrivateSpaces()[0];
  const archiveReview = prepareSpaceLifecycle({ api, accountId: "owner-a", accountScope: "account:owner-a", spaceId: "space-a", action: "archive" });
  assert.equal(archiveReview.preview.space.status, "active");
  assert.equal(api.events[0][0], "previewArchive");
  assert.equal(api.events[0][1].expectedLifecycleRevision, before.lifecycleRevision);
  assert.equal(api.events.some(([name]) => name.startsWith("confirm")), false);

  const archived = confirmSpaceLifecycle({ api, accountId: "owner-a", accountScope: "account:owner-a", spaceId: "space-a", previewId: archiveReview.preview.previewId, action: "archive" });
  assert.deepEqual(archived, { success: true, status: "archived", revision: 1, permissionsChanged: false });
  assert.deepEqual(api.events[1], ["confirmArchive", { previewId: "archive-preview", confirm: true }]);
  const archivedRecord = api.getPrivateSpaces()[0];
  assert.equal(archivedRecord.name, before.name);
  assert.equal(archivedRecord.description, before.description);
  assert.deepEqual(archivedRecord.layoutPreferences, before.layoutPreferences);

  const restoreReview = prepareSpaceLifecycle({ api, accountId: "owner-a", accountScope: "account:owner-a", spaceId: "space-a", action: "restore" });
  const restored = confirmSpaceLifecycle({ api, accountId: "owner-a", accountScope: "account:owner-a", spaceId: "space-a", previewId: restoreReview.preview.previewId, action: "restore" });
  assert.deepEqual(restored, { success: true, status: "active", revision: 2, permissionsChanged: false });
  assert.equal(api.getPrivateSpaces()[0].layoutPreferences.favoriteToolIds[0], "calendar");
});

test("lifecycle stale revisions require re-review and account switches reject confirmation", () => {
  const api = mockSpacesApi();
  const review = prepareSpaceLifecycle({ api, accountId: "owner-a", accountScope: "account:owner-a", spaceId: "space-a", action: "archive" });
  api.changeExternally({ description: "Changed elsewhere", lifecycleRevision: 1, status: "active" });
  const stale = confirmSpaceLifecycle({ api, accountId: "owner-a", accountScope: "account:owner-a", spaceId: "space-a", previewId: review.preview.previewId, action: "archive" });
  assert.equal(stale.conflict.revision, 1);
  assert.match(stale.error, /Review its latest status/);
  assert.equal(api.events.filter(([name]) => name === "confirmArchive").length, 1);

  const reReviewed = prepareSpaceLifecycle({ api, accountId: "owner-a", accountScope: "account:owner-a", spaceId: "space-a", action: "archive" });
  assert.equal(reReviewed.preview.space.lifecycleRevision, 1);
  const switched = confirmSpaceLifecycle({ api, accountId: "owner-a", accountScope: "account:owner-b", spaceId: "space-a", previewId: reReviewed.preview.previewId, action: "archive" });
  assert.match(switched.error, /account changed/i);
  assert.equal(api.events.filter(([name]) => name === "confirmArchive").length, 1);
});

test("lifecycle data validation rejects malformed, foreign, and stale account snapshots", () => {
  const snapshot = spaceLifecycleFromRecord({ id: "space-a", accountScope: "account:owner-a", status: "archived", lifecycleRevision: 3, visibility: "private", sharing: "off" }, "owner-a");
  assert.equal(snapshot.revision, 3);
  assert.equal(spaceLifecycleMatchesAccount(snapshot, "owner-a", "account:owner-a", "space-a"), true);
  assert.equal(spaceLifecycleMatchesAccount(snapshot, "owner-b", "account:owner-b", "space-a"), false);
  assert.equal(spaceLifecycleFromRecord({ id: "space-a", accountScope: "account:owner-a", status: "deleted", lifecycleRevision: 3, visibility: "private", sharing: "off" }, "owner-a"), null);
  assert.equal(spaceLifecycleFromRecord({ id: "space-a", accountScope: "account:owner-a", status: "active", lifecycleRevision: -1, visibility: "private", sharing: "off" }, "owner-a"), null);
  assert.equal(spaceLifecycleFromRecord({ id: "space-a", accountScope: "account:owner-a", status: "active", lifecycleRevision: 0, visibility: "public", sharing: "off" }, "owner-a"), null);
});

test("Spaces cards render lifecycle state and require explicit archive or restore confirmation", () => {
  assert.match(page, /<SpaceLifecycleControl space=\{space\}/);
  assert.match(page, /refreshSpaces=\{refreshSpaces\}/);
  assert.match(page, /"Archived" : "Active"/);
  assert.match(page, /"Restore Space" : "Archive Space"/);
  assert.match(page, /role="region" aria-live="polite"/);
  assert.match(page, /Review archiving this Space/);
  assert.match(page, /Review restoring this Space/);
  assert.match(page, /Confirm \{preview\.targetStatus === "archived" \? "archive" : "restore"\}/);
  assert.match(page, /Private content, saved details, layout, and tool selections are preserved/);
  assert.match(page, /Access permissions will not change/);
  assert.match(page, /Review latest and prepare again/);
  assert.match(page, /disabled=\{busy \|\| preview\.accountId !== accountId \|\| !accountIsCurrent\}/);
  assert.match(styles, /\.spaces-page__lifecycle-status--archived/);
});
