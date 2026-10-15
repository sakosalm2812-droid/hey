import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, realpath, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { webcrypto } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createAction, executeAction, undoAction, clearActions, invalidateActionPreviews, revokeActionAuthority } from "../src/core/actionEngine.js";
import { listAuditEntries } from "../src/core/auditLog.js";
import { getAccountScope, setAccountScope } from "../src/core/accountScope.js";
import supabaseClient from "../src/lib/supabase.js";
import { InMemoryMandateStore, issueActionMandate } from "../src/core/actionMandate.js";

globalThis.crypto ??= webcrypto;

const user = { id: "voiceos-test-user", plan: "elite", permissions: ["app.open", "device.control"] };
const testLifecycle = Object.freeze({ accountId: user.id, deviceId: "voiceos-test-device", resource: "app://calculator", authorizationEpoch: 1 });

function createComputerAction(input) {
  return createAction({ ...input, lifecycle: input.lifecycle || { ...testLifecycle, expiresAt: Date.now() + 60_000 } });
}

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

function independentObservation(request, fields = {}) {
  return {
    verified: true,
    actionId: request.actionId,
    operationId: request.operationId,
    accountId: request.accountId,
    deviceId: request.deviceId,
    authorizationEpoch: request.authorizationEpoch,
    lifecycleExpiresAt: request.lifecycleExpiresAt,
    capability: request.capability,
    permission: request.permission,
    resource: request.resource,
    operation: request.operation,
    inputDigest: request.inputDigest,
    observerId: "test.independent-observer",
    observationId: crypto.randomUUID(),
    observedAt: new Date().toISOString(),
    evidence: null,
    ...fields,
  };
}

function strictOptions(verifyPostcondition) {
  return {
    user,
    confirmed: true,
    requireMandate: true,
    requireIndependentVerification: true,
    mandate: { payload: { id: "mandate-voiceos-1" }, signature: { keyId: "test" } },
    deviceId: testLifecycle.deviceId,
    authorizationEpoch: testLifecycle.authorizationEpoch,
    resource: "app://calculator",
    verifyTargetBinding: async (request) => independentObservation(request, { verified: request.resource === "app://calculator" && request.input.appId === "calculator" }),
    verifyPostcondition: async (request) => independentObservation(request, await verifyPostcondition(request)),
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
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" } });
  let executed = false;

  const result = await executeAction(action.id, async () => {
    executed = true;
    return { success: true, verified: true };
  }, { user, confirmed: true, requireMandate: true, requireIndependentVerification: true, mandate: { payload: { id: "mandate-voiceos-1" } }, ...testLifecycle });

  assert.equal(result.success, false);
  assert.match(result.error, /bound observer|independent verification/i);
  assert.equal(executed, false);
  assert.equal(action.status, "queued");
});

test("durable authority revocation refuses an account that is not authenticated", async () => {
  const result = await revokeActionAuthority("voiceos-other-account", "user requested revocation");

  assert.equal(result.success, false);
  assert.match(result.error, /signed-in account/i);
});

test("computer action binds immutable target input and trusts only separate postcondition evidence", async (t) => {
  installMandateResponse(t);
  clearActions();
  const plannedInput = { appId: "calculator", windowTitle: "Calculator" };
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: plannedInput });
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

test("sensitive computer capabilities require independent verification even without an opt-in flag", async () => {
  clearActions();
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" } });
  let dispatched = false;
  const result = await executeAction(action.id, async () => {
    dispatched = true;
    return { success: true, verified: true };
  }, { user, confirmed: true, requireMandate: true, mandate: { payload: { id: "mandate-voiceos-1" } }, ...testLifecycle });

  assert.equal(result.success, false);
  assert.match(result.error, /bound observer/i);
  assert.equal(dispatched, false);
  assert.equal(action.status, "queued");
});

test("self-reported success cannot override forged, stale, wrong-resource, wrong-account, or wrong-operation observations", async (t) => {
  const cases = [
    ["wrong resource", () => ({ resource: "app://attacker" })],
    ["wrong account", () => ({ accountId: "account-attacker" })],
    ["wrong operation id", () => ({ operationId: crypto.randomUUID() })],
    ["stale observation", () => ({ observedAt: new Date(Date.now() - 60_000).toISOString() })],
  ];
  installMandateResponse(t, undefined, cases.map(() => "computer.app.open"));
  for (const [label, corrupt] of cases) {
    clearActions();
    const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" } });
    const options = strictOptions(async () => ({ verified: true, evidence: { observerClaimsClosed: true } }));
    options.verifyPostcondition = async (request) => independentObservation(request, corrupt(request));
    const result = await executeAction(action.id, async () => ({ success: true, verified: true, claimedObservedState: "closed" }), options);

    assert.equal(result.success, false, label);
    assert.equal(action.status, "failed", label);
    assert.equal(Object.hasOwn(action, "verification"), false, label);
    assert.equal(Object.hasOwn(action, "receipt"), false, label);
    assert.match(result.error, /observation/i, label);
  }
});

test("concurrent forward calls get distinct operation ids but dispatch only one bound action", async (t) => {
  installMandateResponse(t, undefined, ["computer.app.open", "computer.app.open"]);
  clearActions();
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" } });
  let releaseBindings = [];
  let signalSecondBinding;
  const bothBindingsStarted = new Promise((resolve) => { signalSecondBinding = resolve; });
  const operationIds = [];
  const handlerOperationIds = [];
  const options = strictOptions(async (request) => ({ verified: true, evidence: { operationId: request.operationId } }));
  options.verifyTargetBinding = (request) => {
    operationIds.push(request.operationId);
    return new Promise((resolve) => {
      releaseBindings.push(() => resolve(independentObservation(request)));
      if (releaseBindings.length === 2) signalSecondBinding();
    });
  };
  const handler = async (_input, context) => {
    handlerOperationIds.push(context.operationId);
    return { success: true, verified: true };
  };
  const first = executeAction(action.id, handler, options);
  const second = executeAction(action.id, handler, options);
  await bothBindingsStarted;
  assert.equal(new Set(operationIds).size, 2);
  releaseBindings.forEach((release) => release());
  const results = await Promise.all([first, second]);

  assert.equal(results.filter((result) => result.success).length, 1);
  assert.equal(handlerOperationIds.length, 1);
  assert.equal(handlerOperationIds[0], action.verification.operationId);
  assert.equal(action.verification.accountId, user.id);
});

test("account changes during independent observation fail the running action closed", async (t) => {
  installMandateResponse(t);
  clearActions();
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" } });
  const account = { ...user };
  let releaseObserver;
  let signalObserver;
  const observerStarted = new Promise((resolve) => { signalObserver = resolve; });
  const options = strictOptions(() => new Promise((resolve) => {
    releaseObserver = resolve;
    signalObserver();
  }));
  options.user = account;
  const execution = executeAction(action.id, async () => ({ success: true, verified: true }), options);
  await observerStarted;
  account.id = "account-switched";
  releaseObserver({ verified: true, evidence: { observed: true } });
  const result = await execution;

  assert.equal(result.success, false);
  assert.equal(action.status, "invalidated");
  assert.equal(action.verification, undefined);
});

test("preview lifecycle fences reject stale confirmation across account, device, resource, epoch, and expiry", async (t) => {
  installMandateResponse(t);
  const changes = [
    ["account", (options) => { options.user = { ...user, id: "other-account" }; }],
    ["device", (options) => { options.deviceId = "other-device"; }],
    ["resource", (options) => { options.resource = "app://other"; }],
    ["authorization epoch", (options) => { options.authorizationEpoch += 1; }],
    ["expiry", (options) => { options.authorizationEpoch = 1; }],
  ];
  for (const [label, change] of changes) {
    clearActions();
    const lifecycle = { ...testLifecycle, expiresAt: label === "expiry" ? Date.now() - 1 : Date.now() + 60_000 };
    const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, lifecycle });
    const options = strictOptions(async () => ({ verified: true }));
    change(options);
    let dispatched = false;
    const result = await executeAction(action.id, async () => { dispatched = true; return { success: true, verified: true }; }, options);
    assert.equal(result.success, false, label);
    assert.equal(action.status, "invalidated", label);
    assert.equal(dispatched, false, label);
  }
});

test("explicit invalidation fences queued previews and confirmation remains required", async () => {
  clearActions();
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" } });
  assert.equal(invalidateActionPreviews({ ...testLifecycle, deviceId: "replacement-device" }), 1);
  assert.equal(action.status, "invalidated");
  assert.equal(action.error, "Action preview context changed.");

  const pending = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" } });
  let dispatched = false;
  const options = strictOptions(async () => ({ verified: true }));
  options.confirmed = false;
  const result = await executeAction(pending.id, async () => { dispatched = true; return { success: true, verified: true }; }, options);
  assert.equal(result.success, false);
  assert.equal(pending.status, "queued");
  assert.equal(dispatched, false);
});

test("account scope changes automatically invalidate old action previews", () => {
  clearActions();
  const previousScope = getAccountScope();
  try {
    setAccountScope(user.id);
    const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" } });
    setAccountScope("next-voiceos-account");
    assert.equal(action.status, "invalidated");
    assert.match(action.error, /context changed/i);
  } finally {
    setAccountScope(previousScope.startsWith("account:") ? previousScope.slice("account:".length) : null);
    clearActions();
  }
});

test("changing lifecycle context during target binding invalidates before dispatch", async (t) => {
  installMandateResponse(t);
  clearActions();
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" } });
  const options = strictOptions(async () => ({ verified: true }));
  let releaseBinding;
  let signalBinding;
  const bindingStarted = new Promise((resolve) => { signalBinding = resolve; });
  options.verifyTargetBinding = (request) => new Promise((resolve) => {
    releaseBinding = () => resolve(independentObservation(request));
    signalBinding();
  });
  let dispatched = false;
  const execution = executeAction(action.id, async () => { dispatched = true; return { success: true, verified: true }; }, options);
  await bindingStarted;
  options.authorizationEpoch += 1;
  releaseBinding();
  const result = await execution;
  assert.equal(result.success, false);
  assert.equal(action.status, "invalidated");
  assert.equal(dispatched, false);
});

test("a strict computer action fails when independent observation rejects the requested state", async (t) => {
  installMandateResponse(t);
  clearActions();
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" } });
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
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "settings" } });
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
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: plannedInput });
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

test("strict computer action invalidates when resource changes during target binding", async (t) => {
  installMandateResponse(t);
  clearActions();
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" } });
  let releaseBinding;
  let signalBindingStarted;
  const bindingStarted = new Promise((resolve) => { signalBindingStarted = resolve; });
  const options = strictOptions(async ({ resource }) => ({
    verified: resource === "app://calculator",
    evidence: { resource },
  }));
  options.verifyTargetBinding = (request) => new Promise((resolve) => {
    releaseBinding = resolve;
    signalBindingStarted();
  }).then((result) => independentObservation(request, result));

  let dispatched = false;
  const execution = executeAction(action.id, async (_input, context) => {
    dispatched = true;
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

  assert.equal(result.success, false);
  assert.equal(action.status, "invalidated");
  assert.equal(dispatched, false);
});

test("strict computer undo uses a frozen target and independent postcondition verifier", async (t) => {
  installMandateResponse(t, undefined, ["computer.app.open", "computer.app.close"]);
  clearActions();
  const action = createComputerAction({
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
  assert.equal(undo.receipt.accountId, user.id);
  assert.notEqual(undo.receipt.operationId, undo.receipt.originalOperationId);
  assert.equal(undo.receipt.originalPermission, "app.open");
  assert.equal(undo.receipt.originalRiskLevel, "low");
  assert.equal(undo.receipt.originalInputDigest, action.verification.inputDigest);
  assert.equal(undo.receipt.reverseCapability, "computer.app.close");
  assert.equal(undo.receipt.policyVersion, "undo-policy-v1");
  assert.equal(undo.receipt.mandate.authorized, true);
  assert.equal(undo.receipt.mandate.mandateId, "mandate-voiceos-1");
  assert.equal(undo.receipt.postcondition.verified, true);
  assert.equal(undo.receipt.postcondition.observerId, "test.independent-observer");
  assert.match(undo.receipt.postcondition.observationId, /^[0-9a-f-]{36}$/i);
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

test("Trust Kernel executes and independently verifies a real reversible temp-file action", async (t) => {
  clearActions();
  const directory = await mkdtemp(join(tmpdir(), "hey-voiceos-action-"));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  const filePath = resolve(join(directory, "voiceos-proof.txt"));
  const resource = pathToFileURL(filePath).href;
  const contents = "HEY VoiceOS reversible action proof\n";
  const accountId = "voiceos-local-action-test";
  const deviceId = `node-test-${process.pid}`;
  const userForLocalAction = { id: accountId, plan: "elite", permissions: ["filesystem.write", "filesystem.delete"] };
  const policy = {
    mode: "bounded_full_execution",
    enabled: true,
    version: "local-action-policy-v1",
    allowedActions: ["computer.local_file.create", "computer.local_file.remove"],
    resources: [resource],
    maxUses: 2,
    expiresAt: Date.now() + 60_000,
  };
  const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const mandateStore = new InMemoryMandateStore();
  mandateStore.setCurrentRevocationEpoch(accountId, 0);
  const trustedKeys = new Map([["local-test-key", keyPair.publicKey]]);
  const issueMandate = (action) => issueActionMandate({
    accountId,
    actions: [action],
    resources: [resource],
    maxUses: 1,
    revocationEpoch: 0,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }, { privateKey: keyPair.privateKey, keyId: "local-test-key" });
  const trustKernel = {
    policy,
    mandateContext: { currentRevocationEpoch: 0 },
    mandateOptions: { trustedKeys, store: mandateStore, allowTestOnlyStore: true },
  };
  const lifecycle = { accountId, deviceId, resource, authorizationEpoch: 0, expiresAt: Date.now() + 60_000 };
  const action = createAction({
    title: "Create a temporary VoiceOS verification file",
    tool: "computer.local_file.create",
    permission: "filesystem.write",
    riskLevel: "low",
    input: { path: filePath, contents },
    undo: { path: filePath },
    lifecycle,
  });

  const bindingObserver = async (request) => {
    const actualParent = await realpath(dirname(request.input.path));
    return independentObservation(request, {
      verified: resolve(request.input.path) === filePath && actualParent === directory && request.resource === resource,
      evidence: { exactPath: resolve(request.input.path) === filePath, parentDirectory: actualParent },
    });
  };
  const postconditionObserver = async (request) => {
    if (request.operation === "execute") {
      const [actual, metadata] = await Promise.all([readFile(filePath, "utf8"), stat(filePath)]);
      const verified = metadata.isFile() && actual === contents;
      return independentObservation(request, {
        verified,
        evidence: { exists: true, isFile: metadata.isFile(), bytes: metadata.size, exactContents: verified },
      });
    }
    try {
      const metadata = await stat(filePath);
      return independentObservation(request, { verified: false, evidence: { exists: true, isFile: metadata.isFile() } });
    } catch (error) {
      const absent = error?.code === "ENOENT";
      return independentObservation(request, { verified: absent, evidence: { exists: !absent, absenceObserved: absent } });
    }
  };
  const executionOptions = {
    user: userForLocalAction,
    confirmed: true,
    requireMandate: true,
    requireIndependentVerification: true,
    mandate: await issueMandate("computer.local_file.create"),
    idempotencyKey: "local-file-forward-once",
    trustKernel,
    deviceId,
    authorizationEpoch: 0,
    resource,
    verifyTargetBinding: bindingObserver,
    verifyPostcondition: postconditionObserver,
  };
  const execution = await executeAction(action.id, async ({ path: target, contents: body }) => {
    await writeFile(target, body, { encoding: "utf8", flag: "wx" });
    return { created: true };
  }, executionOptions);
  assert.equal(execution.success, true, execution.error);
  assert.equal(await readFile(filePath, "utf8"), contents, "the real file-system state confirms creation");
  assert.equal(action.verification.evidence.exactContents, true);
  assert.equal(action.verification.evidence.bytes, 36);

  const replayAction = createAction({
    title: "Replay the temporary file creation mandate",
    tool: "computer.local_file.create",
    permission: "filesystem.write",
    riskLevel: "low",
    input: { path: filePath, contents },
    lifecycle,
  });
  let replayDispatched = false;
  const replay = await executeAction(replayAction.id, async () => {
    replayDispatched = true;
    return writeFile(filePath, contents, { encoding: "utf8", flag: "wx" });
  }, executionOptions);
  assert.equal(replay.success, false);
  assert.match(replay.error, /replay/i);
  assert.equal(replayDispatched, false, "the already consumed mandate cannot reach the file writer");

  const undoOptions = {
    ...executionOptions,
    policy,
    mandate: await issueMandate("computer.local_file.remove"),
    authorizationAction: "computer.local_file.remove",
    idempotencyKey: `${action.id}:undo`,
    undoCapability: "computer.local_file.remove",
    undoPermission: "filesystem.delete",
  };
  const undo = await undoAction(action.id, async ({ path: target }) => {
    await unlink(target);
    return { removed: true };
  }, undoOptions);
  assert.equal(undo.success, true, undo.error);
  await assert.rejects(stat(filePath), { code: "ENOENT" });
  assert.equal(undo.receipt.postcondition.verified, true);
  assert.equal(undo.receipt.mandate.authorized, true);
  assert.equal(mandateStore.usage.size, 2, "both signed one-use mandates were consumed");
  assert.equal(mandateStore.idempotency.size, 2, "the forward and undo requests each reserved a replay key");
});

test("undo receipt authority is invalidated when the authorization epoch advances", async (t) => {
  installMandateResponse(t);
  clearActions();
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator" } });
  assert.equal((await completeStrictAction(action)).success, true);
  const options = strictUndoOptions(async () => ({ verified: true, evidence: { closed: true } }));
  options.authorizationEpoch += 1;
  let dispatched = false;
  const result = await undoAction(action.id, async () => { dispatched = true; return { success: true, verified: true }; }, options);
  assert.equal(result.success, false);
  assert.equal(action.status, "invalidated");
  assert.equal(dispatched, false);
});

test("strict undo refuses an original action without immutable independent verification", async (t) => {
  installMandateResponse(t);
  clearActions();
  const action = createAction({ title: "Open Calculator", tool: "app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator" } });
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
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator" } });
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
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator", privatePath: `C:/private/${"x".repeat(65 * 1024)}` } });
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
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator" } });
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
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator" } });
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
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator" } });
  assert.equal((await completeStrictAction(action)).success, true);
  let releaseBinding;
  let signalBinding;
  const bindingStarted = new Promise((resolve) => { signalBinding = resolve; });
  let bindingCalls = 0;
  let dispatchCalls = 0;
  const options = strictUndoOptions(async () => ({ verified: true, evidence: { closed: true } }));
  options.verifyTargetBinding = (request) => {
    bindingCalls += 1;
    signalBinding();
    return new Promise((resolve) => { releaseBinding = (result) => resolve(independentObservation(request, result)); });
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
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator" } });
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
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator" } });
  assert.equal((await completeStrictAction(action)).success, true);
  let releaseBinding;
  let signalBinding;
  const bindingStarted = new Promise((resolve) => { signalBinding = resolve; });
  let dispatchCalls = 0;
  const options = strictUndoOptions(async () => ({ verified: true, evidence: { closed: true } }));
  options.verifyTargetBinding = (request) => new Promise((resolve) => {
    releaseBinding = resolve;
    signalBinding();
  }).then((result) => independentObservation(request, result));

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
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator" } });
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
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" }, undo: { appId: "calculator" } });
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

test("strict execution rejects a resource that no longer matches its preview fence", async (t) => {
  installMandateResponse(t);
  clearActions();
  const action = createComputerAction({ title: "Open Calculator", tool: "computer.app.open", permission: "app.open", riskLevel: "low", input: { appId: "calculator" } });
  let executed = false;

  const result = await executeAction(action.id, async () => {
    executed = true;
    return { success: true, verified: true };
  }, { ...strictOptions(async () => ({ verified: true, evidence: { foreground: true } })), resource: " " });

  assert.equal(result.success, false);
  assert.match(result.error, /context changed/i);
  assert.equal(executed, false);
});

