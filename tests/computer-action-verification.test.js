import assert from "node:assert/strict";
import test from "node:test";

import { createAction, executeAction, clearActions } from "../src/core/actionEngine.js";
import supabaseClient from "../src/lib/supabase.js";

const user = { id: "voiceos-test-user", plan: "elite", permissions: ["app.open"] };

function installMandateResponse(t, response = { data: { authorized: true, mandateId: "mandate-voiceos-1", remainingUses: 0 }, error: null }) {
  const previous = supabaseClient.functions;
  supabaseClient.functions = {
    async invoke(name, { body }) {
      assert.equal(name, "hey-mandate");
      assert.equal(body.action, "computer.app.open");
      assert.equal(body.resource, "app://calculator");
      return response;
    },
  };
  t.after(() => {
    if (previous === undefined) delete supabaseClient.functions;
    else supabaseClient.functions = previous;
    clearActions();
  });
}

function strictOptions(verifyPostcondition) {
  return {
    user,
    confirmed: true,
    requireMandate: true,
    requireIndependentVerification: true,
    mandate: { payload: { id: "mandate-voiceos-1" }, signature: { keyId: "test" } },
    resource: "app://calculator",
    verifyTargetBinding: async ({ resource, input }) => ({ verified: resource === "app://calculator" && input.appId === "calculator" }),
    verifyPostcondition,
  };
}

test("strict computer action denies executor self-report without an independent verifier", async () => {
  clearActions();
  const action = createAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" } });
  let executed = false;

  const result = await executeAction(action.id, async () => {
    executed = true;
    return { success: true, verified: true };
  }, { user, confirmed: true, requireMandate: true, requireIndependentVerification: true, mandate: { payload: { id: "mandate-voiceos-1" } }, resource: "app://calculator" });

  assert.equal(result.success, false);
  assert.match(result.error, /independent verification/i);
  assert.equal(executed, false);
  assert.equal(action.status, "queued");
});

test("computer action binds immutable target input and trusts only separate postcondition evidence", async (t) => {
  installMandateResponse(t);
  clearActions();
  const plannedInput = { appId: "calculator", windowTitle: "Calculator" };
  const action = createAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: plannedInput });
  let checked;
  const options = strictOptions(async (observation) => {
    checked = observation;
    assert.equal(observation.input.appId, "calculator");
    assert.equal(observation.input.windowTitle, "Calculator");
    assert.equal(observation.resource, "app://calculator");
    // The adapter's success and verified flags are deliberately false. Only
    // the independent observer can establish the requested postcondition.
    assert.deepEqual(observation.result, { success: false, verified: false, note: "dispatch returned no proof" });
    return { verified: true, evidence: { observedAppId: "calculator", foreground: true } };
  });

  const result = await executeAction(action.id, async (input, context) => {
    assert.equal(Object.isFrozen(input), true);
    assert.equal(Object.isFrozen(context), true);
    assert.throws(() => { input.appId = "settings"; }, TypeError);
    return { success: false, verified: false, note: "dispatch returned no proof" };
  }, options);

  plannedInput.appId = "settings";
  assert.equal(result.success, true, result.error);
  assert.equal(action.status, "completed");
  assert.equal(checked.capability, "computer.app.open");
  assert.equal(action.verification.verified, true);
  assert.equal(action.verification.resource, "app://calculator");
  assert.equal(action.verification.evidence.observedAppId, "calculator");
  assert.equal(action.verification.evidence.foreground, true);
});

test("a strict computer action fails when independent observation rejects the requested state", async (t) => {
  installMandateResponse(t);
  clearActions();
  const action = createAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" } });
  let calls = 0;

  const result = await executeAction(action.id, async () => {
    calls += 1;
    return { success: true, verified: true, claimedActiveWindow: "Calculator" };
  }, strictOptions(async () => ({ verified: false, reason: "active window does not match target" })));

  assert.equal(calls, 1);
  assert.equal(result.success, false);
  assert.match(result.error, /active window does not match/i);
  assert.equal(action.status, "failed");
  assert.equal(action.verification, undefined);
});

test("target tampering is rejected before mandate consumption or dispatch", async (t) => {
  installMandateResponse(t);
  clearActions();
  const action = createAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "settings" } });
  let executed = false;

  const result = await executeAction(action.id, async () => {
    executed = true;
    return { success: true, verified: true };
  }, strictOptions(async () => ({ verified: true, evidence: { foreground: true } })));

  assert.equal(result.success, false);
  assert.match(result.error, /target/i);
  assert.equal(executed, false);
  assert.equal(action.status, "queued");
});

test("input retargeting while mandate verification is pending cannot change the dispatched target", async (t) => {
  let releaseMandate;
  let notifyMandateStarted;
  const mandateStarted = new Promise((resolve) => { notifyMandateStarted = resolve; });
  const previous = supabaseClient.functions;
  supabaseClient.functions = {
    invoke: () => new Promise((resolve) => { releaseMandate = resolve; notifyMandateStarted(); }),
  };
  t.after(() => {
    if (previous === undefined) delete supabaseClient.functions;
    else supabaseClient.functions = previous;
    clearActions();
  });
  clearActions();
  const plannedInput = { appId: "calculator" };
  const action = createAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: plannedInput });
  let dispatchedTarget;

  const execution = executeAction(action.id, async (input) => {
    dispatchedTarget = input.appId;
    return { success: true, verified: false };
  }, strictOptions(async ({ input }) => ({ verified: input.appId === "calculator", evidence: { observedAppId: input.appId } })));

  await mandateStarted;
  plannedInput.appId = "settings";
  releaseMandate({ data: { authorized: true, mandateId: "mandate-voiceos-1", remainingUses: 0 }, error: null });
  const result = await execution;
  assert.equal(dispatchedTarget, "calculator");
  assert.equal(result.success, true);
});

test("strict execution requires a resource-scoped mandate instead of a broad capability alone", async (t) => {
  installMandateResponse(t);
  clearActions();
  const action = createAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" } });
  let executed = false;

  const result = await executeAction(action.id, async () => {
    executed = true;
    return { success: true, verified: true };
  }, { ...strictOptions(async () => ({ verified: true, evidence: { foreground: true } })), resource: " " });

  assert.equal(result.success, false);
  assert.match(result.error, /exact resource target/i);
  assert.equal(executed, false);
});

