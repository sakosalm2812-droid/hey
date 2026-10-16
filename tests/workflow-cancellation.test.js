import test from "node:test";
import assert from "node:assert/strict";
import { cancelWorkflow, createWorkflow, runWorkflow } from "../src/core/workflowEngine.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("cancellation while checking the next step prevents its first dispatch", async () => {
  const workflow = createWorkflow("Wait then act", [{ action: "first" }]);
  let handlerCalls = 0;
  let cancellationSignal;

  const running = runWorkflow(workflow, {
    first: async () => { handlerCalls += 1; return { success: true }; },
  }, {
    shouldCancel: async (_workflow, _step, { signal }) => {
      cancellationSignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("cancellation check aborted")), { once: true });
      });
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  cancelWorkflow(workflow, "User stopped before dispatch.");

  const result = await running;
  assert.equal(cancellationSignal.aborted, true);
  assert.equal(result.status, "cancelled");
  assert.equal(result.steps[0].status, "cancelled");
  assert.equal(handlerCalls, 0);
});

test("cancellation during an in-flight workflow step remains cancelled and prevents later dispatch", async () => {
  const handlerResult = deferred();
  let verificationCalls = 0;
  let laterStepCalls = 0;
  let observedTargetState = "unchanged";
  let handlerSignal;
  const workflow = createWorkflow("Perform two computer actions", [
    { action: "first" },
    { action: "second" },
  ]);

  const running = runWorkflow(workflow, {
    first: async (_step, { signal }) => {
      handlerSignal = signal;
      await handlerResult.promise;
      observedTargetState = "complete";
      return { success: true, receipt: "step-one" };
    },
    second: async () => { laterStepCalls += 1; return { success: true }; },
  }, {
    verifyStep: async (step) => {
      verificationCalls += 1;
      return step.action === "first" && observedTargetState === "complete";
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(workflow.steps[0].status, "running");
  cancelWorkflow(workflow, "User stopped the workflow.");
  assert.equal(handlerSignal.aborted, true);
  handlerResult.resolve();

  const result = await running;
  assert.equal(result.status, "cancelled");
  assert.equal(result.cancelReason, "User stopped the workflow.");
  assert.equal(result.steps[0].status, "cancelled");
  assert.equal(result.steps[0].settledAfterCancellation, true);
  assert.deepEqual(result.steps[0].result, { success: true, receipt: "step-one" });
  assert.equal(result.steps[0].verification, true);
  assert.equal(verificationCalls, 1);
  assert.equal(laterStepCalls, 0);
});

test("a handler failure that settles after cancellation cannot change the workflow to failed or completed", async () => {
  const workflow = createWorkflow("Perform a recoverable action", [
    { action: "first" },
    { action: "second" },
  ]);
  let laterStepCalls = 0;
  let handlerSignal;

  const running = runWorkflow(workflow, {
    first: async (_step, { signal }) => {
      handlerSignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("adapter stopped after partial effect")), { once: true });
      });
    },
    second: async () => { laterStepCalls += 1; return { success: true }; },
  });

  await new Promise((resolve) => setImmediate(resolve));
  cancelWorkflow(workflow, "User stopped the workflow.");

  const result = await running;
  assert.equal(handlerSignal.aborted, true);
  assert.equal(result.status, "cancelled");
  assert.equal(result.steps[0].status, "cancelled");
  assert.equal(result.steps[0].settledAfterCancellation, true);
  assert.equal(result.steps[0].settlementError, "adapter stopped after partial effect");
  assert.equal(result.steps[1].status, "cancelled");
  assert.equal(laterStepCalls, 0);
});

test("a single-step workflow stays cancelled when its unverified handler settles after stop", async () => {
  const handlerResult = deferred();
  const workflow = createWorkflow("Run one action", [{ action: "only" }]);
  const running = runWorkflow(workflow, { only: async () => handlerResult.promise });

  await new Promise((resolve) => setImmediate(resolve));
  cancelWorkflow(workflow, "User stopped the action.");
  handlerResult.resolve({ success: true, verified: false });

  const result = await running;
  assert.equal(result.status, "cancelled");
  assert.equal(result.steps[0].status, "cancelled");
  assert.equal(result.steps[0].settledAfterCancellation, true);
  assert.deepEqual(result.steps[0].result, { success: true, verified: false });
});

test("cancellation during independent postcondition verification prevents later steps and keeps the verified step receipt", async () => {
  const verificationResult = deferred();
  const workflow = createWorkflow("Verify then continue", [
    { action: "first" },
    { action: "second" },
  ]);
  let laterStepCalls = 0;

  const running = runWorkflow(workflow, {
    first: async () => ({ success: true, receipt: "verified-step" }),
    second: async () => { laterStepCalls += 1; return { success: true }; },
  }, {
    verifyStep: async () => verificationResult.promise,
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(workflow.steps[0].status, "verifying");
  cancelWorkflow(workflow, "User stopped during verification.");
  verificationResult.resolve(true);

  const result = await running;
  assert.equal(result.status, "cancelled");
  assert.equal(result.steps[0].status, "cancelled");
  assert.deepEqual(result.steps[0].result, { success: true, receipt: "verified-step" });
  assert.equal(result.steps[0].verification, true);
  assert.equal(result.steps[1].status, "cancelled");
  assert.equal(laterStepCalls, 0);
});

test("a missing positive postcondition result cannot complete a workflow step", async () => {
  const workflow = createWorkflow("Require independent verification", [{ action: "first" }]);
  const result = await runWorkflow(workflow, {
    first: async () => ({ success: true, verified: true }),
  }, {
    verifyStep: async () => undefined,
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.steps[0].status, "failed");
  assert.equal(result.steps[0].verification, undefined);
  assert.equal(result.steps[0].error, "Step verification did not return a positive result.");
});
