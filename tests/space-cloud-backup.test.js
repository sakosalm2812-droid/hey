import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { HEY, spaces as spacesApi } from "../src/core/index.js";
import { SpaceCloudBackupService } from "../src/core/spaceCloudBackup.js";

const migration = await readFile(new URL("../supabase/migrations/20261016000600_private_space_account_backups.sql", import.meta.url), "utf8");
const page = await readFile(new URL("../src/SpacesPage.jsx", import.meta.url), "utf8");

function makeDocument(overrides = {}) {
  return {
    kind: "hey-private-spaces-export",
    contractVersion: 1,
    exportedAt: "2026-10-16T12:00:00.000Z",
    spaceCount: 1,
    spaces: [{
      id: "space-private-a",
      name: "Private plan",
      description: "Account notes",
      templateId: "planning",
      detailsRevision: 0,
      status: "active",
      lifecycleRevision: 0,
      visibility: "private",
      sharing: "off",
      createdAt: "2026-10-16T12:00:00.000Z",
      layoutPreferences: {
        contractVersion: 1,
        revision: 0,
        favoriteToolIds: [],
        widgetIds: ["notes"],
        shortcutIds: [],
        toolIds: [],
      },
    }],
    ...overrides,
  };
}

function makeClient({ userId = "user-a", row = null, readError = null, rpcResult = { data: [{ success: true, revision: 1, updated_at: "2026-10-16T12:00:00.000Z" }], error: null }, onRead } = {}) {
  const calls = { table: "", columns: "", filter: null, rpc: null };
  return {
    calls,
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from(table) {
      calls.table = table;
      const query = {
        select(columns) { calls.columns = columns; return query; },
        eq(key, value) { calls.filter = [key, value]; return query; },
        async maybeSingle() { onRead?.(); return { data: row, error: readError }; },
      };
      return query;
    },
    async rpc(name, args) { calls.rpc = { name, args }; return rpcResult; },
  };
}

test("HEY exposes explicit private Space account-backup operations", () => {
  assert.equal(typeof HEY.spaces.readCloudBackup, "function");
  assert.equal(typeof HEY.spaces.saveCloudBackup, "function");
  assert.equal(typeof spacesApi.readCloudBackup, "function");
  assert.equal(typeof spacesApi.saveCloudBackup, "function");
});

test("account backup reads only the authenticated account row and rejects foreign or malformed results", async () => {
  let scope = "account:user-a";
  const client = makeClient({ row: { user_id: "user-a", document: makeDocument(), revision: 3, updated_at: "2026-10-16T12:00:00.000Z" } });
  const service = new SpaceCloudBackupService(client, () => scope);
  const result = await service.read({ accountId: "user-a" });
  assert.equal(result.success, true);
  assert.equal(result.revision, 3);
  assert.equal(result.spaceCount, 1);
  assert.equal(client.calls.table, "hey_private_space_backups");
  assert.deepEqual(client.calls.filter, ["user_id", "user-a"]);

  const foreign = new SpaceCloudBackupService(makeClient({ row: { user_id: "user-b", document: makeDocument(), revision: 1, updated_at: "2026-10-16T12:00:00.000Z" } }), () => scope);
  assert.match((await foreign.read({ accountId: "user-a" })).error, /record is invalid/);
  const malformedDocument = makeDocument({ accountScope: "account:user-b" });
  const malformed = new SpaceCloudBackupService(makeClient({ row: { user_id: "user-a", document: malformedDocument, revision: 1, updated_at: "2026-10-16T12:00:00.000Z" } }), () => scope);
  assert.match((await malformed.read({ accountId: "user-a" })).error, /unsupported fields/);

  const switched = new SpaceCloudBackupService(makeClient({ row: { user_id: "user-a", document: makeDocument(), revision: 1, updated_at: "2026-10-16T12:00:00.000Z" }, onRead: () => { scope = "account:user-b"; } }), () => scope);
  scope = "account:user-a";
  const stale = await switched.read({ accountId: "user-a" });
  assert.match(stale.error, /Account scope changed/);
  assert.equal(Object.hasOwn(stale, "document"), false);
});

test("account backup writes validate private data, bind the authenticated account, and fence revisions", async () => {
  let scope = "account:user-a";
  const document = makeDocument();
  const client = makeClient();
  const service = new SpaceCloudBackupService(client, () => scope);
  const saved = await service.save({ accountId: "user-a", expectedRevision: 0, exportJson: JSON.stringify(document) });
  assert.equal(saved.success, true);
  assert.equal(client.calls.rpc.name, "save_hey_private_space_backup");
  assert.equal(client.calls.rpc.args.p_expected_revision, 0);
  assert.equal(Object.hasOwn(client.calls.rpc.args.p_document, "accountScope"), false);
  assert.equal(Object.hasOwn(client.calls.rpc.args.p_document.spaces[0], "accountScope"), false);

  const staleClient = makeClient({ rpcResult: { data: [{ success: false, revision: 4, updated_at: "2026-10-16T12:00:00.000Z" }], error: null } });
  const stale = await new SpaceCloudBackupService(staleClient, () => scope).save({ accountId: "user-a", expectedRevision: 2, exportJson: JSON.stringify(document) });
  assert.equal(stale.code, "stale_snapshot");
  assert.equal(stale.revision, 4);

  const publicDocument = makeDocument();
  publicDocument.spaces[0].sharing = "on";
  const invalidClient = makeClient();
  const invalid = await new SpaceCloudBackupService(invalidClient, () => scope).save({ accountId: "user-a", expectedRevision: 0, exportJson: JSON.stringify(publicDocument) });
  assert.match(invalid.error, /non-private/);
  assert.equal(invalidClient.calls.rpc, null);

  let getterCalled = false;
  const hostile = { accountId: "user-a", expectedRevision: 0 };
  Object.defineProperty(hostile, "exportJson", { enumerable: true, get() { getterCalled = true; throw new Error("hostile"); } });
  assert.match((await service.save(hostile)).error, /accessor/);
  assert.equal(getterCalled, false);

  const wrongAccount = await new SpaceCloudBackupService(makeClient({ userId: "user-b" }), () => scope)
    .save({ accountId: "user-a", expectedRevision: 0, exportJson: JSON.stringify(document) });
  assert.match(wrongAccount.error, /could not be verified/);

  const failedClient = makeClient({ rpcResult: { data: null, error: { message: "database offline" } } });
  const failed = await new SpaceCloudBackupService(failedClient, () => scope).save({ accountId: "user-a", expectedRevision: 0, exportJson: JSON.stringify(document) });
  assert.match(failed.error, /could not be saved/);
  assert.notEqual(failed.success, true);
});

test("account backup migration isolates reads and serializes compare-and-swap writes", () => {
  assert.match(migration, /create table if not exists public\.hey_private_space_backups/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /revoke all on public\.hey_private_space_backups from public, anon, authenticated/i);
  assert.match(migration, /grant select on public\.hey_private_space_backups to authenticated/i);
  assert.match(migration, /save_hey_private_space_backup/i);
  assert.match(migration, /auth\.uid\(\)/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /v_revision <> p_expected_revision/i);
  assert.match(migration, /item ->> 'visibility' <> 'private'/i);
  assert.match(migration, /item ->> 'sharing' <> 'off'/i);
  assert.match(migration, /not \(item \?& array\['id', 'name'.*'layoutPreferences'\]\)/i);
  assert.match(migration, /not \(\(item -> 'layoutPreferences'\) \?& array\['contractVersion'.*'toolIds'\]\)/i);
  assert.match(migration, /jsonb_array_length\(item -> 'layoutPreferences' -> 'toolIds'\) > 64/i);
  assert.match(migration, /jsonb_typeof\(preference_id\) <> 'string'/i);
  assert.match(migration, /grant execute on function public\.save_hey_private_space_backup\(jsonb, integer\) to authenticated/i);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all) on public\.hey_private_space_backups to authenticated/i);
});

test("Spaces page offers manual backup review and import without claiming automatic sync", () => {
  assert.match(page, /HEY\.spaces\.readCloudBackup\(\{ accountId: requestedAccountId \}\)/);
  assert.match(page, /HEY\.spaces\.saveCloudBackup\(\{ accountId: requestedAccountId, expectedRevision: cloudBackup\.revision, exportJson: exported\.exportJson \}\)/);
  assert.match(page, /result\?\.code === "stale_snapshot"/);
  assert.match(page, /HEY\.spaces\.previewImport\(\{ accountScope: requestedScope, exportJson: JSON\.stringify\(backup\.document\) \}\)/);
  assert.match(page, /Import reviewed Spaces/);
  assert.match(page, /Save current Spaces/);
  assert.match(page, /edits do not sync automatically/);
  assert.match(page, /accountRef\.current !== requestedAccountId \|\| getAccountScope\(\) !== requestedScope/);
});
