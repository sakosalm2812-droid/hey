import assert from "node:assert/strict";
import test from "node:test";

import { createAction, executeAction, undoAction, clearActions } from "../src/core/actionEngine.js";
import { listAuditEntries } from "../src/core/auditLog.js";
import supabaseClient from "../src/lib/supabase.js";

const user = { id: "voiceos-test-user", plan: "elite", permissions: ["app.open", "device.control"] };

function installMandateResponse(t, response = { data: { authorized: true, mandateId: "mandate-voiceos-1", remainingUses: 0 }, error: null }, expectedAction = "computer.app.open") {
  const expectedActions = Array.isArray(expectedAction) ? [...expectedAction] : [expectedAction];
  const previous = supabaseClient.functions;
  supabaseClient.functions = {
    async invoke(name, { body }) {
      assert.equal(name, "hey-mandate");
      const nextExpectedAction = expectedActions.shift();
      assert.equal(body.action, nextExpectedAction);
      assert.equal(body.resource, "app://calculator");
      if (nextExpectedAction === "computer.app.close") assert.match(body.idempotencyKey, /:undo$/);
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

function strictUndoOptions(verifyPostcondition) {
  return {
    ...strictOptions(verifyPostcondition),
    undoCapability: "computer.app.close",
    undoPermission: "device.control",
    policy: {
      mode: "bounded_full_execution",
      enabled: true,
      version: "undo-policy-v1",
      allowedActions: ["computer.app.close"],
      resources: ["app://calculator"],
      maxUses: 1,
      expiresAt: Date.now() + 60_000,
    },
  };
}

async function completeStrictAction(action) {
  return executeAction(action.id, async () => ({ success: false, verified: false, note: "adapter supplied no proof" }), strictOptions(async ({ capability, resource }) => ({
    verified: true,
    evidence: { observedCapability: capability, observedResource: resource },
  })));
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

test("strict computer action snapshots capability and resource before async target binding", async (t) => {
  installMandateResponse(t);
  clearActions();
  const action = createAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" } });
  let releaseBinding;
  let signalBindingStarted;
  const bindingStarted = new Promise((resolve) => { signalBindingStarted = resolve; });
  const options = strictOptions(async ({ resource }) => ({
    verified: resource === "app://calculator",
    evidence: { resource },
  }));
  options.verifyTargetBinding = () => new Promise((resolve) => {
    releaseBinding = resolve;
    signalBindingStarted();
  });

  const execution = executeAction(action.id, async (_input, context) => {
    assert.equal(context.tool, "computer.app.open");
    assert.equal(context.resource, "app://calculator");
    return { success: false, verified: false };
  }, options);

  await bindingStarted;
  action.tool = "computer.settings.open";
  action.permission = "settings.open";
  options.resource = "app://settings";
  releaseBinding({ verified: true });
  const result = await execution;

  assert.equal(result.success, true, result.error);
  assert.equal(action.verification.resource, "app://calculator");
});

test("strict computer undo uses a frozen target and independent postcondition verifier", async (t) => {
  installMandateResponse(t, undefined, ["computer.app.open", "computer.app.close"]);
  clearActions();
  const action = createAction({
    title: "Open Calculator",
    tool: "computer.app.open",
    permission: "app.open",
    riskLevel: "low",
    input: { appId: "calculator", privateNote: "PRIVATE ORIGINAL NOTE" },
    undo: { appId: "calculator", filePath: "C:/private/patient-record.pdf" },
  });
  const executed = await completeStrictAction(action);
  assert.equal(executed.success, true);
  assert.equal(Object.getOwnPropertyDescriptor(action, "verification").writable, false);
  assert.throws(() => { action.verification = { verified: true, resource: "app://attacker" }; }, TypeError);

  let observedUndo = false;
  const undo = await undoAction(action.id, async (undoInput, context) => {
    assert.equal(Object.isFrozen(undoInput), true);
    assert.equal(context.operation, "undo");
    assert.equal(context.tool, "computer.app.close");
    assert.equal(context.capability, "computer.app.close");
    assert.equal(context.permission, "device.control");
    return { success: false, verified: false, claimedUndo: false };
  }, strictUndoOptions(async ({ input, operation, result, resource, capability }) => {
    observedUndo = true;
    assert.equal(operation, "undo");
    assert.equal(capability, "computer.app.close");
    assert.equal(input.appId, "calculator");
    assert.equal(resource, "app://calculator");
    assert.deepEqual(result, { success: false, verified: false, claimedUndo: false });
    return { verified: true, evidence: { appClosed: true } };
  }));

  assert.equal(undo.success, true, undo.error);
  assert.equal(observedUndo, true);
  assert.equal(action.status, "undone");
  assert.equal(undo.receipt, action.undoReceipt);
  assert.equal(undo.receipt.originalCapability, "computer.app.open");
  assert.equal(undo.receipt.originalPermission, "app.open");
  assert.equal(undo.receipt.originalRiskLevel, "low");
  assert.equal(undo.receipt.originalInputDigest, action.verification.inputDigest);
  assert.equal(undo.receipt.reverseCapability, "computer.app.close");
  assert.equal(undo.receipt.policyVersion, "undo-policy-v1");
  assert.equal(undo.receipt.mandate.authorized, true);
  assert.equal(undo.receipt.mandate.mandateId, "mandate-voiceos-1");
  assert.equal(undo.receipt.postcondition.verified, true);
  assert.match(undo.receipt.reverseResourceDigest, /^[a-f0-9]{64}$/);
  assert.match(undo.receipt.reverseInputDigest, /^[a-f0-9]{64}$/);
  assert.match(undo.receipt.postcondition.evidenceDigest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(undo.receipt), true);
  assert.equal(Object.getOwnPropertyDescriptor(action, "undoReceipt").writable, false);
  assert.equal(JSON.stringify(undo.receipt).includes("PRIVATE ORIGINAL NOTE"), false);
  assert.equal(JSON.stringify(undo.receipt).includes("patient-record.pdf"), false);
  assert.equal(JSON.stringify(undo.receipt).includes("app://calculator"), false);
  const audit = listAuditEntries().find((entry) => entry.action === "action.undone" && entry.metadata.receiptId === undo.receipt.id);
  assert.ok(audit, "audit log links to the immutable receipt");
  assert.equal(audit.metadata.originalInputDigest, undo.receipt.originalInputDigest);
  assert.equal(JSON.stringify(audit.metadata).includes("patient-record.pdf"), false);
});

test("strict undo refuses an original action without immutable independent verification", async (t) => {
  installMandateResponse(t);
  clearActions();
  const action = createAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator" } });
  assert.equal((await executeAction(action.id, async () => ({ success: true, verified: true }), { user, confirmed: true })).success, true);
  let bound = false;
  let dispatched = false;
  const options = strictUndoOptions(async () => ({ verified: true, evidence: { closed: true } }));
  options.verifyTargetBinding = async () => { bound = true; return { verified: true }; };
  const result = await undoAction(action.id, async () => { dispatched = true; return { success: true, verified: true }; }, options);

  assert.equal(result.success, false);
  assert.match(result.error, /original action verification/i);
  assert.equal(bound, false);
  assert.equal(dispatched, false);
  assert.equal(action.status, "completed");
  assert.equal(action.undoReceipt, undefined);
});

test("strict undo rejects a changed original permission snapshot", async (t) => {
  installMandateResponse(t);
  clearActions();
  const action = createAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator" } });
  assert.equal((await completeStrictAction(action)).success, true);
  action.permission = "device.control";
  let bound = false;
  const options = strictUndoOptions(async () => ({ verified: true, evidence: { closed: true } }));
  options.verifyTargetBinding = async () => { bound = true; return { verified: true }; };
  const result = await undoAction(action.id, async () => ({ success: true, verified: true }), options);

  assert.equal(result.success, false);
  assert.match(result.error, /original action and exact resource/i);
  assert.equal(bound, false);
  assert.equal(action.status, "completed");
  assert.equal(action.undoReceipt, undefined);
});

test("strict undo rejects oversized sensitive targets before binding or dispatch", async (t) => {
  installMandateResponse(t);
  clearActions();
  const action = createAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator", privatePath: `C:/private/${"x".repeat(65 * 1024)}` } });
  assert.equal((await completeStrictAction(action)).success, true);
  let bound = false;
  let dispatched = false;
  const options = strictUndoOptions(async () => ({ verified: true, evidence: { closed: true } }));
  options.verifyTargetBinding = async () => { bound = true; return { verified: true }; };
  const result = await undoAction(action.id, async () => { dispatched = true; return { success: true, verified: true }; }, options);

  assert.equal(result.success, false);
  assert.match(result.error, /bounded digest size/i);
  assert.equal(bound, false);
  assert.equal(dispatched, false);
  assert.equal(action.status, "completed");
  assert.equal(action.undoReceipt, undefined);
});

test("strict undo fails closed when Trust Kernel policy rejects the reverse capability", async (t) => {
  installMandateResponse(t);
  clearActions();
  const action = createAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator" } });
  assert.equal((await completeStrictAction(action)).success, true);
  let bound = false;
  let dispatched = false;
  const options = strictUndoOptions(async () => ({ verified: true, evidence: { closed: true } }));
  options.policy = { ...options.policy, allowedActions: ["computer.app.open"] };
  options.verifyTargetBinding = async () => { bound = true; return { verified: true }; };

  const result = await undoAction(action.id, async () => { dispatched = true; return { success: true, verified: true }; }, options);
  assert.equal(result.success, false);
  assert.equal(result.policyDecision.decision, "deny");
  assert.match(result.error, /Trust Kernel denied/i);
  assert.equal(bound, false);
  assert.equal(dispatched, false);
  assert.equal(action.status, "completed");
});

test("strict undo rejects hostile policy accessors before binding or mandate verification", async (t) => {
  installMandateResponse(t);
  clearActions();
  const action = createAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator" } });
  assert.equal((await completeStrictAction(action)).success, true);
  let getterCalls = 0;
  let bound = false;
  let dispatched = false;
  const policy = { mode: "bounded_full_execution", allowedActions: ["computer.app.close"], resources: ["app://calculator"] };
  Object.defineProperty(policy, "enabled", { enumerable: true, get() { getterCalls += 1; return true; } });
  const options = strictUndoOptions(async () => ({ verified: true, evidence: { closed: true } }));
  options.policy = policy;
  options.verifyTargetBinding = async () => { bound = true; return { verified: true }; };

  const result = await undoAction(action.id, async () => { dispatched = true; return { success: true, verified: true }; }, options);
  assert.equal(result.success, false);
  assert.match(result.error, /plain JSON/i);
  assert.equal(getterCalls, 0);
  assert.equal(bound, false);
  assert.equal(dispatched, false);
  assert.equal(action.status, "completed");
});

test("strict undo reserves its proposal before async target binding to block duplicate dispatch", async (t) => {
  installMandateResponse(t, undefined, ["computer.app.open", "computer.app.close"]);
  clearActions();
  const action = createAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator" } });
  assert.equal((await completeStrictAction(action)).success, true);
  let releaseBinding;
  let signalBinding;
  const bindingStarted = new Promise((resolve) => { signalBinding = resolve; });
  let bindingCalls = 0;
  let dispatchCalls = 0;
  const options = strictUndoOptions(async () => ({ verified: true, evidence: { closed: true } }));
  options.verifyTargetBinding = () => {
    bindingCalls += 1;
    signalBinding();
    return new Promise((resolve) => { releaseBinding = resolve; });
  };

  const first = undoAction(action.id, async () => {
    dispatchCalls += 1;
    return { success: true, verified: false };
  }, options);
  await bindingStarted;
  const second = await undoAction(action.id, async () => {
    dispatchCalls += 1;
    return { success: true, verified: true };
  }, options);
  assert.equal(second.success, false);
  assert.equal(bindingCalls, 1);
  assert.equal(action.status, "undo_authorizing");
  releaseBinding({ verified: true });

  const firstResult = await first;
  assert.equal(firstResult.success, true, firstResult.error);
  assert.equal(dispatchCalls, 1);
  assert.equal(action.status, "undone");
});

test("strict undo rejects a stale public action state and blocks a nested duplicate", async (t) => {
  installMandateResponse(t, undefined, ["computer.app.open", "computer.app.close"]);
  clearActions();
  const action = createAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator" } });
  assert.equal((await completeStrictAction(action)).success, true);
  let nestedDispatch = false;
  const options = strictUndoOptions(async () => ({ verified: true, evidence: { closed: true } }));
  const first = await undoAction(action.id, async () => {
    action.status = "completed";
    const nested = await undoAction(action.id, async () => {
      nestedDispatch = true;
      return { success: true, verified: true };
    }, options);
    assert.equal(nested.success, false);
    return { success: true, verified: false };
  }, options);

  assert.equal(first.success, false);
  assert.match(first.error, /no longer available/i);
  assert.equal(nestedDispatch, false);
  assert.equal(action.status, "undo_failed");
  assert.equal(action.undoReceipt, undefined);
});

test("strict undo does not dispatch after its proposal is cancelled during target binding", async (t) => {
  installMandateResponse(t);
  clearActions();
  const action = createAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator" } });
  assert.equal((await completeStrictAction(action)).success, true);
  let releaseBinding;
  let signalBinding;
  const bindingStarted = new Promise((resolve) => { signalBinding = resolve; });
  let dispatchCalls = 0;
  const options = strictUndoOptions(async () => ({ verified: true, evidence: { closed: true } }));
  options.verifyTargetBinding = () => new Promise((resolve) => {
    releaseBinding = resolve;
    signalBinding();
  });

  const undo = undoAction(action.id, async () => {
    dispatchCalls += 1;
    return { success: true, verified: true };
  }, options);
  await bindingStarted;
  clearActions();
  releaseBinding({ verified: true });

  const result = await undo;
  assert.equal(result.success, false);
  assert.match(result.error, /no longer available/i);
  assert.equal(dispatchCalls, 0);
  assert.equal(action.status, "cancelled");
});

test("strict undo denies a negative independent postcondition without emitting a receipt", async (t) => {
  installMandateResponse(t, undefined, ["computer.app.open", "computer.app.close"]);
  clearActions();
  const action = createAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator" } });
  assert.equal((await completeStrictAction(action)).success, true);
  const options = strictUndoOptions(async () => ({ verified: false, reason: "window remained open" }));
  const result = await undoAction(action.id, async () => ({ success: true, verified: true }), options);

  assert.equal(result.success, false);
  assert.match(result.error, /window remained open/i);
  assert.equal(action.status, "undo_failed");
  assert.equal(action.undoReceipt, undefined);
  assert.equal(result.receipt, undefined);
});

test("strict undo does not emit success when cancellation occurs during postcondition verification", async (t) => {
  installMandateResponse(t, undefined, ["computer.app.open", "computer.app.close"]);
  clearActions();
  const action = createAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator" } });
  assert.equal((await completeStrictAction(action)).success, true);
  let releaseVerification;
  let signalVerification;
  const verificationStarted = new Promise((resolve) => { signalVerification = resolve; });
  const options = strictUndoOptions(() => new Promise((resolve) => {
    releaseVerification = resolve;
    signalVerification();
  }));
  const undo = undoAction(action.id, async () => ({ success: true, verified: false }), options);
  await verificationStarted;
  clearActions();
  releaseVerification({ verified: true, evidence: { closed: true } });
  const result = await undo;

  assert.equal(result.success, false);
  assert.match(result.error, /no longer available/i);
  assert.equal(action.status, "cancelled");
  assert.equal(action.undoReceipt, undefined);
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

