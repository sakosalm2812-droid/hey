import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = resolve(root, "supabase/migrations/20261014000000_action_mandates.sql");

test("mandate migration keeps consumption atomic and inaccessible to authenticated direct RPC callers", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /for update;/i, "account epoch row must serialize use, revocation, and epoch changes");
  assert.match(sql, /p_mandates is null/i);
  assert.match(sql, /jsonb_typeof\(p_mandates\) is distinct from 'array'/i);
  assert.match(sql, /jsonb_typeof\(v_item->'mandate_id'\) is distinct from 'string'/i);
  assert.match(sql, /v_max_uses_numeric <> trunc\(v_max_uses_numeric\)/i);
  assert.match(sql, /v_item_epoch_numeric <> trunc\(v_item_epoch_numeric\)/i);
  assert.match(sql, /revoke all on function public\.consume_hey_action_mandate_chain\(uuid, bigint, jsonb, text\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.consume_hey_action_mandate_chain\(uuid, bigint, jsonb, text\) to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.consume_hey_action_mandate_chain\([^\n]+\) to authenticated/i);
});
