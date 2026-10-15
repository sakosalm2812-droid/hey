import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SupabaseMissionCheckpointStore } from "../src/core/supabaseMissionCheckpointStore.js";
import core from "../src/core/index.js";

const accountId = "2e4a81a4-2da8-4ae0-bfd6-719484a37795";
const missionId = "mission_1792000000000_abc1234";
const checkpoint = { schemaVersion: 1, missionId, state: "draft", steps: [], currentStepIndex: 0, completedSteps: 0, progress: 0 };

function fakeClient(responses = {}) {
  const calls = [];
  return {
    calls,
    client: { async rpc(name, params) { calls.push({ name, params }); return responses[name] ?? { data: null, error: null }; } },
  };
}

test("Supabase checkpoint adapter uses account-bound revisioned RPCs and is exported", async () => {
  assert.equal(core.missions.SupabaseMissionCheckpointStore, SupabaseMissionCheckpointStore);
  const { client, calls } = fakeClient({
    load_hey_mission_checkpoint: { data: { revision: 4, checkpoint }, error: null },
    save_hey_mission_checkpoint: { data: { saved: true, revision: 5 }, error: null },
  });
  const store = new SupabaseMissionCheckpointStore(client);
  assert.deepEqual(await store.load(accountId, missionId), { revision: 4, checkpoint });
  assert.deepEqual(await store.save(accountId, missionId, checkpoint, { expectedRevision: 4 }), { saved: true, revision: 5 });
  assert.deepEqual(calls, [
    { name: "load_hey_mission_checkpoint", params: { p_account_id: accountId, p_mission_id: missionId } },
    { name: "save_hey_mission_checkpoint", params: { p_account_id: accountId, p_mission_id: missionId, p_checkpoint: checkpoint, p_expected_revision: 4 } },
  ]);
});

test("Supabase checkpoint adapter rejects hostile input, bad revisions and malformed RPC results", async () => {
  const { client } = fakeClient({
    load_hey_mission_checkpoint: { data: { revision: 0, checkpoint }, error: null },
    save_hey_mission_checkpoint: { data: { saved: false }, error: null },
  });
  const store = new SupabaseMissionCheckpointStore(client);
  await assert.rejects(store.load("not-a-uuid", missionId), /UUID/);
  await assert.rejects(store.load(accountId, "../../other"), /identifier/);
  await assert.rejects(store.load(accountId, missionId), /malformed/);
  assert.deepEqual(await store.save(accountId, missionId, checkpoint), { saved: false, conflict: true });
  await assert.rejects(store.save(accountId, missionId, checkpoint, { expectedRevision: 0 }), /revision/);
  const cyclic = {}; cyclic.self = cyclic;
  await assert.rejects(store.save(accountId, missionId, cyclic), /plain JSON/);
  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, "value", { enumerable: true, get() { getterCalls += 1; return "x"; } });
  await assert.rejects(store.save(accountId, missionId, accessor), /accessors/);
  assert.equal(getterCalls, 0);
});

test("mission checkpoint migration scopes authenticated RPCs and compare-and-swap updates", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261014030000_durable_mission_checkpoints.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.hey_mission_checkpoints from public, anon, authenticated, service_role/i);
  assert.match(sql, /auth\.uid\(\) is distinct from p_account_id/i);
  assert.match(sql, /revision = p_expected_revision/i);
  assert.match(sql, /on conflict \(account_id, mission_id\) do nothing/i);
  assert.match(sql, /grant execute on function public\.save_hey_mission_checkpoint\(uuid, text, jsonb, bigint\) to authenticated, service_role/i);
});
