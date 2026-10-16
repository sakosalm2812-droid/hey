import assert from "node:assert/strict";
import test from "node:test";
import { CAPABILITY_STATUS, registerCapability } from "../src/core/capabilityRegistry.js";
import { setAccountScope } from "../src/core/accountScope.js";
import { clearPermissions, seedPermissions } from "../src/core/permissionManager.js";
import HEY from "../src/core/index.js";
import {
  createToolInvocationPlan,
  executeToolInvocationPlan,
  registerTool,
  unregisterTool,
} from "../src/core/toolRegistry.js";

function addCapability(id) {
  registerCapability({
    id,
    name: `Invocation test ${id}`,
    platformSupport: { web: CAPABILITY_STATUS.supported },
  });
}

const objectSchema = (properties, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

test("tool registration rejects hostile and malformed schemas without invoking accessors", () => {
  let getterCalls = 0;
  const accessorSchema = { type: "object" };
  Object.defineProperty(accessorSchema, "properties", {
    enumerable: true,
    get() { getterCalls += 1; return {}; },
  });
  const cyclicSchema = { type: "array" };
  cyclicSchema.items = cyclicSchema;

  assert.throws(() => registerTool("test.schema.unknown", async () => null, { inputSchema: { type: "object", pattern: ".*" } }), /unsupported keyword/i);
  assert.throws(() => registerTool("test.schema.accessor", async () => null, { inputSchema: accessorSchema }), /accessor/i);
  assert.throws(() => registerTool("test.schema.cycle", async () => null, { inputSchema: cyclicSchema }), /cycle/i);
  assert.throws(() => registerTool("test.schema.required", async () => null, {
    inputSchema: { type: "object", properties: {}, required: ["missing"] },
  }), /required/i);
  const hostileStep = { id: "hostile", toolName: "missing", input: {} };
  Object.defineProperty(hostileStep, "toolName", { enumerable: true, get() { getterCalls += 1; return "missing"; } });
  assert.throws(() => createToolInvocationPlan([hostileStep]), /accessors/i);
  assert.equal(getterCalls, 0);
});

test("bounded invocation plans snapshot inputs, bind validated outputs, and reauthorize every step", async () => {
  const firstName = "test.plan.snapshot_source";
  const secondName = "test.plan.snapshot_target";
  const firstCapability = "test.plan.snapshot_source_capability";
  const secondCapability = "test.plan.snapshot_target_capability";
  addCapability(firstCapability);
  addCapability(secondCapability);
  setAccountScope("plan-account");
  seedPermissions([{ permission: "filesystem.read", status: "granted", scope: "account" }], "plan-account");
  let sourceExecutions = 0;
  let targetExecutions = 0;

  try {
    registerTool(firstName, async ({ seed }) => {
      sourceExecutions += 1;
      return { value: seed };
    }, {
      capabilities: [firstCapability], permission: "filesystem.read",
      inputSchema: objectSchema({ seed: { type: "string" } }),
      outputSchema: objectSchema({ value: { type: "string" } }),
    });
    registerTool(secondName, async ({ copied }) => {
      targetExecutions += 1;
      return { copied, done: true };
    }, {
      capabilities: [secondCapability], permission: "filesystem.read",
      inputSchema: objectSchema({ copied: { type: "string" } }),
      outputSchema: objectSchema({ copied: { type: "string" }, done: { type: "boolean" } }),
    });

    const input = { seed: "captured" };
    const plan = createToolInvocationPlan([
      { id: "source", toolName: firstName, input },
      { id: "target", toolName: secondName, input: {}, bindings: [{ fromStepId: "source", fromField: "value", toField: "copied" }] },
    ]);
    input.seed = "mutated";
    assert.equal(Object.isFrozen(plan), true);
    const result = await executeToolInvocationPlan(plan, { platform: "web", user: { id: "plan-account", plan: "elite", entitlements: ["elite"] } });

    assert.equal(result.success, true);
    assert.deepEqual(result.completed, ["source", "target"]);
    assert.deepEqual(result.results[1].result, { copied: "captured", done: true });
    assert.equal(sourceExecutions, 1);
    assert.equal(targetExecutions, 1);
  } finally {
    unregisterTool(firstName);
    unregisterTool(secondName);
    clearPermissions();
    setAccountScope(null);
  }
});

test("plans reject stale definitions and unauthorized invocations before dispatch", async () => {
  const staleName = "test.plan.stale_registration";
  const deniedName = "test.plan.unauthorized";
  const staleCapability = "test.plan.stale_registration_capability";
  const deniedCapability = "test.plan.unauthorized_capability";
  addCapability(staleCapability);
  addCapability(deniedCapability);
  setAccountScope("plan-denied-account");
  let executions = 0;

  try {
    const metadata = {
      capabilities: [staleCapability], permission: "filesystem.read",
      inputSchema: objectSchema({ value: { type: "string" } }),
      outputSchema: objectSchema({ value: { type: "string" } }),
    };
    registerTool(staleName, async () => { executions += 1; return { value: "old" }; }, metadata);
    const stalePlan = createToolInvocationPlan([{ id: "one", toolName: staleName, input: { value: "x" } }]);
    unregisterTool(staleName);
    registerTool(staleName, async () => { executions += 1; return { value: "new" }; }, metadata);
    const stale = await executeToolInvocationPlan(stalePlan, { platform: "web", user: { id: "plan-denied-account" } });
    assert.equal(stale.status, "stale_registration");
    assert.equal(executions, 0);

    registerTool(deniedName, async () => { executions += 1; return { value: "secret" }; }, {
      capabilities: [deniedCapability], permission: "filesystem.write",
      inputSchema: objectSchema({ value: { type: "string" } }),
      outputSchema: objectSchema({ value: { type: "string" } }),
    });
    const deniedPlan = createToolInvocationPlan([{ id: "denied", toolName: deniedName, input: { value: "x" } }]);
    const denied = await executeToolInvocationPlan(deniedPlan, { platform: "web", user: { id: "plan-denied-account" } });
    assert.equal(denied.success, false);
    assert.equal(denied.status, "denied");
    assert.equal(executions, 0);
  } finally {
    unregisterTool(staleName);
    unregisterTool(deniedName);
    clearPermissions();
    setAccountScope(null);
  }
});

test("output schema violations stop a plan and report a contract failure", async () => {
  const name = "test.plan.invalid_output";
  const capability = "test.plan.invalid_output_capability";
  addCapability(capability);
  setAccountScope("plan-output-account");
  seedPermissions([{ permission: "filesystem.read", status: "granted", scope: "account" }], "plan-output-account");
  try {
    registerTool(name, async () => ({ value: 7 }), {
      capabilities: [capability], permission: "filesystem.read",
      inputSchema: objectSchema({ input: { type: "string" } }),
      outputSchema: objectSchema({ value: { type: "string" } }),
    });
    const plan = createToolInvocationPlan([{ id: "bad-output", toolName: name, input: { input: "x" } }]);
    const result = await executeToolInvocationPlan(plan, { platform: "web", user: { id: "plan-output-account", plan: "elite", entitlements: ["elite"] } });
    assert.equal(result.success, false);
    assert.equal(result.status, "invalid_output");
  } finally {
    unregisterTool(name);
    clearPermissions();
    setAccountScope(null);
  }
});

test("hostile handler output accessors are rejected before Tool Library can inspect them", async () => {
  const name = "test.plan.hostile_output_accessor";
  const capability = "test.plan.hostile_output_accessor_capability";
  addCapability(capability);
  setAccountScope("hostile-output-account");
  seedPermissions([{ permission: "filesystem.read", status: "granted", scope: "account" }], "hostile-output-account");
  let getterCalls = 0;
  try {
    registerTool(name, async () => {
      const output = {};
      Object.defineProperty(output, "verified", {
        enumerable: true,
        get() { getterCalls += 1; return true; },
      });
      Object.defineProperty(output, "success", {
        enumerable: true,
        get() { getterCalls += 1; return true; },
      });
      return output;
    }, { capabilities: [capability], permission: "filesystem.read", inputSchema: objectSchema({}) });

    const result = await executeToolInvocationPlan(
      createToolInvocationPlan([{ id: "hostile-output", toolName: name, input: {} }]),
      { platform: "web", user: { id: "hostile-output-account", plan: "elite", entitlements: ["elite"] } },
    );
    assert.equal(result.success, false);
    assert.equal(result.status, "invalid_output");
    assert.equal(result.results[0].result, null);
    assert.equal(getterCalls, 0);
  } finally {
    unregisterTool(name);
    clearPermissions();
    setAccountScope(null);
  }
});

test("Tool Library plans share the per-account capacity reservation and record plan activity", async () => {
  const accountId = "plan-capacity-account";
  const capability = "test.plan.capacity_capability";
  const names = Array.from({ length: 17 }, (_, index) => `test.plan.capacity_${index}`);
  addCapability(capability);
  setAccountScope(accountId);
  seedPermissions([{ permission: "filesystem.read", status: "granted", scope: "account" }], accountId);
  let releaseHandlers;
  const release = new Promise((resolve) => { releaseHandlers = resolve; });
  const entered = [];
  const user = { id: accountId, plan: "elite", entitlements: ["elite"] };
  try {
    for (const name of names) {
      registerTool(name, async () => {
        entered.push(name);
        await release;
        return { verified: true };
      }, { capabilities: [capability], permission: "filesystem.read", inputSchema: objectSchema({}) });
    }
    const activePlans = names.slice(0, 16).map((name, index) => executeToolInvocationPlan(
      createToolInvocationPlan([{ id: `active-${index}`, toolName: name, input: {} }]),
      { platform: "web", user },
    ));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(entered.length, 16);
    const full = await executeToolInvocationPlan(
      createToolInvocationPlan([{ id: "over-capacity", toolName: names[16], input: {} }]),
      { platform: "web", user },
    );
    assert.equal(full.status, "capacity");
    assert.equal(HEY.tools.lifecycleActivity(names[16], { user }).activity[0].status, "capacity");

    releaseHandlers();
    assert.ok((await Promise.all(activePlans)).every(({ success }) => success));
    assert.deepEqual(HEY.tools.lifecycleActivity(names[0], { user }).activity.map(({ status }) => status), ["completed", "starting"]);
    const recovered = await executeToolInvocationPlan(
      createToolInvocationPlan([{ id: "recovered", toolName: names[16], input: {} }]),
      { platform: "web", user },
    );
    assert.equal(recovered.success, true);
  } finally {
    releaseHandlers?.();
    names.forEach(unregisterTool);
    clearPermissions();
    setAccountScope(null);
  }
});

test("plans stop after an account switch and a retryable failure recovers through a fresh plan", async () => {
  const accountA = "plan-recovery-account-a";
  const accountB = "plan-recovery-account-b";
  const switchName = "test.plan.recovery_switch";
  const laterName = "test.plan.recovery_later";
  const retryName = "test.plan.recovery_retry";
  const capability = "test.plan.recovery_capability";
  addCapability(capability);
  setAccountScope(accountA);
  seedPermissions([{ permission: "filesystem.read", status: "granted", scope: "account" }], accountA);
  let laterExecutions = 0;
  let retryExecutions = 0;
  try {
    registerTool(switchName, async () => {
      setAccountScope(accountB);
      return { verified: true };
    }, { capabilities: [capability], permission: "filesystem.read", inputSchema: objectSchema({}) });
    registerTool(laterName, async () => { laterExecutions += 1; return { verified: true }; }, {
      capabilities: [capability], permission: "filesystem.read", inputSchema: objectSchema({}),
    });
    const switched = await executeToolInvocationPlan(createToolInvocationPlan([
      { id: "switch", toolName: switchName, input: {} },
      { id: "must-not-run", toolName: laterName, input: {} },
    ]), { platform: "web", user: { id: accountA, plan: "elite" } });
    assert.equal(switched.status, "denied");
    assert.deepEqual(switched.completed, ["switch"]);
    assert.equal(laterExecutions, 0);

    setAccountScope(accountA);
    seedPermissions([{ permission: "filesystem.read", status: "granted", scope: "account" }], accountA);
    registerTool(retryName, async () => {
      retryExecutions += 1;
      if (retryExecutions === 1) return { success: false, error: "Temporary provider outage.", retryable: true };
      return { verified: true, value: "recovered" };
    }, { capabilities: [capability], permission: "filesystem.read", inputSchema: objectSchema({}) });
    const user = { id: accountA, plan: "elite" };
    const failed = await executeToolInvocationPlan(createToolInvocationPlan([{ id: "first-attempt", toolName: retryName, input: {} }]), {
      platform: "web", user, requestId: "retry-first-request",
    });
    assert.equal(failed.success, false);
    assert.equal(failed.results[0].metadata.retryable, true);
    assert.equal(failed.results[0].metadata.requestId, "retry-first-request");
    const recovered = await executeToolInvocationPlan(createToolInvocationPlan([{ id: "second-attempt", toolName: retryName, input: {} }]), {
      platform: "web", user, requestId: "retry-second-request",
    });
    assert.equal(recovered.success, true);
    assert.equal(recovered.results[0].metadata.requestId, "retry-second-request");
    assert.deepEqual(HEY.tools.lifecycleActivity(retryName, { user }).activity.map(({ status }) => status), ["completed", "starting", "failed", "starting"]);
    assert.equal(retryExecutions, 2);
  } finally {
    [switchName, laterName, retryName].forEach(unregisterTool);
    clearPermissions();
    setAccountScope(null);
  }
});
