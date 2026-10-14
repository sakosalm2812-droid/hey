import { test } from "node:test";
import assert from "node:assert/strict";
import { SupabaseMandateStore } from "../src/core/supabaseMandateStore.js";
import { MANDATE_STORE_CONTRACT_VERSION } from "../src/core/actionMandate.js";

const accountId = "10e7b9e4-765b-4e88-b5d4-5eafc0f39f40";
const mandateId = "7de4ab92-60a8-40a4-9a1a-f80bc3d5fb2f";

function createClient(responses = {}) {
  const calls = [];
  return {
    calls,
    client: {
      async rpc(name, args) {
        calls.push({ name, args });
        return responses[name] ?? { data: null, error: null };
      },
    },
  };
}

test("Supabase mandate adapter uses account-scoped RPCs and validates atomic consumption", async () => {
  const { client, calls } = createClient({
    get_hey_action_mandate_epoch: { data: 4, error: null },
    is_hey_action_mandate_revoked: { data: false, error: null },
    revoke_hey_action_mandate: { data: true, error: null },
    advance_hey_action_mandate_epoch: { data: 5, error: null },
    consume_hey_action_mandate_chain: { data: { consumed: true, remainingUses: 2 }, error: null },
  });
  const store = new SupabaseMandateStore(client, { trustedServer: true });

  assert.equal(store.contractVersion, MANDATE_STORE_CONTRACT_VERSION);
  assert.equal(store.testOnly, false);
  assert.equal(await store.getCurrentRevocationEpoch(accountId), 4);
  assert.equal(await store.isRevoked(mandateId, { accountId }), false);
  assert.equal(await store.revoke(mandateId, { accountId, reason: "user request" }), true);
  assert.equal(await store.advanceRevocationEpoch(accountId), 5);
  assert.deepEqual(await store.consumeChain(
    [{ mandateId, maxUses: 3, revocationEpoch: 4 }],
    "mission:step:1",
    { accountId, revocationEpoch: 4 },
  ), { consumed: true, remainingUses: 2 });

  assert.deepEqual(calls, [
    { name: "get_hey_action_mandate_epoch", args: { p_account_id: accountId } },
    { name: "is_hey_action_mandate_revoked", args: { p_account_id: accountId, p_mandate_id: mandateId } },
    { name: "revoke_hey_action_mandate", args: { p_account_id: accountId, p_mandate_id: mandateId, p_reason: "user request" } },
    { name: "advance_hey_action_mandate_epoch", args: { p_account_id: accountId } },
    {
      name: "consume_hey_action_mandate_chain",
      args: {
        p_account_id: accountId,
        p_revocation_epoch: 4,
        p_mandates: [{ mandate_id: mandateId, max_uses: 3, revocation_epoch: 4 }],
        p_idempotency_key: "mission:step:1",
      },
    },
  ]);
});

test("Supabase mandate adapter rejects invalid contexts before RPC and fails closed on malformed responses", async () => {
  const { client, calls } = createClient({
    get_hey_action_mandate_epoch: { data: "4", error: null },
    consume_hey_action_mandate_chain: { data: { consumed: "yes" }, error: null },
  });
  const store = new SupabaseMandateStore(client, { trustedServer: true });

  assert.deepEqual(await store.consumeChain([], "key", { accountId, revocationEpoch: 0 }), { consumed: false, reason: "invalid_context" });
  assert.deepEqual(await store.consumeChain([{ mandateId, maxUses: 1, revocationEpoch: 1 }], "key", { accountId, revocationEpoch: 0 }), { consumed: false, reason: "invalid_context" });
  assert.equal(calls.length, 0, "malformed authority context must not reach the RPC");
  await assert.rejects(() => store.getCurrentRevocationEpoch(accountId), /response was malformed/i);
  await assert.rejects(() => store.consumeChain(
    [{ mandateId, maxUses: 1, revocationEpoch: 0 }],
    "valid-key",
    { accountId, revocationEpoch: 0 },
  ), /response was malformed/i);
  assert.throws(() => new SupabaseMandateStore({}), /Supabase client/i);
  assert.throws(() => new SupabaseMandateStore(client), /trusted server-side/i);
});

test("Supabase mandate adapter requires canonical account and mandate UUIDs", async () => {
  const { client, calls } = createClient();
  const store = new SupabaseMandateStore(client, { trustedServer: true });
  await assert.rejects(() => store.isRevoked(mandateId, { accountId: "acct-1" }), /accountId must be a UUID/i);
  await assert.rejects(() => store.isRevoked("not-a-uuid", { accountId }), /mandateId must be a UUID/i);
  assert.equal(calls.length, 0);
});
