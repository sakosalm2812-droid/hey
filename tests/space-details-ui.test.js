import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spaceDetailsFromRecord, spaceDetailsMatchAccount } from "../src/spacePageDetails.js";

const page = await readFile(new URL("../src/SpacesPage.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/SpacesPage.css", import.meta.url), "utf8");

test("details editor accepts only a fresh revisioned record from the active account and Space", () => {
  const record = { id: "space-a", accountScope: "account:owner-a", detailsRevision: 4, name: "Planning", description: "Weekly" };
  const snapshot = spaceDetailsFromRecord(record, "owner-a");
  assert.deepEqual(snapshot, { accountScope: "account:owner-a", spaceId: "space-a", revision: 4, name: "Planning", description: "Weekly" });
  assert.equal(spaceDetailsMatchAccount(snapshot, "owner-a", "account:owner-a", "space-a"), true);
  assert.equal(spaceDetailsMatchAccount(snapshot, "owner-b", "account:owner-b", "space-a"), false);
  assert.equal(spaceDetailsMatchAccount(snapshot, "owner-a", "account:owner-b", "space-a"), false);
  assert.equal(spaceDetailsMatchAccount(snapshot, "owner-a", "account:owner-a", "space-b"), false);
  assert.equal(spaceDetailsFromRecord({ ...record, detailsRevision: -1 }, "owner-a"), null);
  assert.equal(spaceDetailsFromRecord({ ...record, accountScope: "account:owner-b" }, "owner-a"), null);
});

test("details editor refreshes active account details before revision checked writes", () => {
  assert.match(page, /HEY\.spaces\.getPrivateSpaces\(\)/);
  assert.match(page, /spaceDetailsFromRecord\(record, accountId\)/);
  assert.match(page, /latest\.revision !== details\.revision/);
  assert.match(page, /HEY\.spaces\.updateDetails\(\{/);
  assert.match(page, /expectedRevision: latest\.revision/);
  assert.match(page, /result\?\.code === "stale_revision"/);
  assert.match(page, /spaceDetailsMatchAccount\(result\.current, accountId, getAccountScope\(\), space\.id\)/);
});

test("details UI is accessible, explicit, and requires review before retrying stale drafts", () => {
  assert.match(page, /Edit Space details/);
  assert.match(page, /aria-expanded=\{expanded\} aria-controls=\{editorId\}/);
  assert.match(page, /htmlFor=\{`\$\{editorId\}-name`\}/);
  assert.match(page, /htmlFor=\{`\$\{editorId\}-description`\}/);
  assert.match(page, /Save details/);
  assert.match(page, /Latest saved revision: \{conflict\.revision\}/);
  assert.match(page, /Keep my draft and review latest/);
  assert.match(page, /Load latest and discard my draft/);
  assert.match(page, /disabled=\{saving \|\| loading \|\| Boolean\(conflict\) \|\| !accountIsCurrent\}/);
  assert.match(page, /spaceDetailsMatchAccount\(details, accountId, getAccountScope\(\), space\.id\)/);
  assert.match(styles, /\.spaces-page__details-panel/);
});
