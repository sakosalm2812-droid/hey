import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMandateVerificationRequest } from "../supabase/functions/hey-mandate/requestContract.js";

const accountId = "10e7b9e4-765b-4e88-b5d4-5eafc0f39f40";
const mandate = { payload: { id: "signed-id" }, signature: { value: "signature" } };

test("mandate edge request binds account identity to authenticated user, not the request body", () => {
  const normalized = normalizeMandateVerificationRequest({
    mandate,
    action: "web.search",
    resource: "web.search",
    idempotencyKey: "mission:step:1",
  }, accountId);

  assert.deepEqual(normalized, {
    mandate,
    context: { accountId, action: "web.search", resource: "web.search", idempotencyKey: "mission:step:1" },
  });
  assert.equal(normalizeMandateVerificationRequest({
    mandate,
    accountId: "attacker-controlled",
    action: "web.search",
    resource: "web.search",
    idempotencyKey: "mission:step:1",
  }, accountId), null, "callers cannot choose the authority account in the body");
});

test("mandate edge request rejects malformed, oversized, control-character, and accessor inputs", () => {
  const valid = { mandate, action: "web.search", resource: "web.search", idempotencyKey: "mission:step:1" };
  assert.equal(normalizeMandateVerificationRequest(valid, "acct-1"), null);
  assert.equal(normalizeMandateVerificationRequest({ ...valid, action: "\nweb.search" }, accountId), null);
  assert.equal(normalizeMandateVerificationRequest({ ...valid, resource: "x".repeat(257) }, accountId), null);
  assert.equal(normalizeMandateVerificationRequest({ ...valid, idempotencyKey: "\u007f" }, accountId), null);

  let calls = 0;
  const hostile = { mandate, resource: "web.search", idempotencyKey: "mission:step:1" };
  Object.defineProperty(hostile, "action", { enumerable: true, get() { calls += 1; return "web.search"; } });
  assert.equal(normalizeMandateVerificationRequest(hostile, accountId), null);
  assert.equal(calls, 0, "request accessors are rejected without evaluation");
});
