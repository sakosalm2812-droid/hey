import test from "node:test";
import assert from "node:assert/strict";
import { clearProviders, registerProvider } from "../src/core/providerRegistry.js";
import { FUSION_MODES, runProviderFusion } from "../src/core/providerFusion.js";
import { revokePermission, seedPermissions } from "../src/core/permissionManager.js";
import { setAccountScope } from "../src/core/accountScope.js";
import HEY from "../src/core/index.js";

test("the canonical HEY provider API exposes the fusion contract and modes", () => {
  assert.equal(HEY.providers.runFusion, runProviderFusion);
  assert.equal(HEY.providers.fusionModes, FUSION_MODES);
});

function providers({ secondCost = 0.02, withLocal = false, priced = true } = {}) {
  clearProviders();
  setAccountScope("fixture-a");
  const grants = [
    "provider.remote", "provider:fusion-primary", "provider:fusion-checker",
    ...(withLocal ? ["provider.local", "provider:fusion-local"] : []),
  ].map((permission) => ({ permission, status: "granted", scope: "account" }));
  seedPermissions(grants, "fixture-a");
  registerProvider({
    id: "fusion-primary",
    name: "Fixture Primary",
    capabilities: ["chat", "reasoning"],
    models: [{ id: "primary-v1", priority: 1, ...(priced ? { maxCostUsd: 0.02 } : {}) }],
  });
  registerProvider({
    id: "fusion-checker",
    name: "Fixture Checker",
    capabilities: ["chat", "reasoning"],
    models: [{ id: "checker-v1", priority: 2, maxCostUsd: secondCost }],
  });
  if (withLocal) {
    registerProvider({
      id: "fusion-local",
      name: "Fixture Local",
      capabilities: ["chat", "reasoning"],
      models: [{ id: "local-v1", priority: 0, local: true, maxCostUsd: 0 }],
    });
  }
}

const evidence = (value = "42") => [{ claimId: "answer", statement: `The answer is ${value}.`, value, source: "fixture://source" }];
const base = {
  prompt: "What is the fixture answer?",
  accountScope: "account:fixture-a",
  permissions: ["provider.remote", "provider:fusion-primary", "provider:fusion-checker"],
  maxCostUsd: 0.05,
};

test("Auto stays on one model when confidence and evidence justify the cheaper answer", async () => {
  providers();
  const calls = [];
  const response = await runProviderFusion({
    ...base,
    invoke: async (request) => {
      calls.push(request);
      return { text: "42", confidence: 0.94, evidence: evidence(), costUsd: 0.01, latencyMs: 7 };
    },
  });
  assert.equal(response.status, "complete");
  assert.equal(response.answer, "42");
  assert.equal(response.independentlyChecked, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].accountScope, base.accountScope);
  assert.equal(calls[0].maxCostUsd, 0.02);
  assert.equal(response.costUsd, 0.01);
});

test("low confidence escalates to a distinct checker and records disagreement evidence", async () => {
  providers();
  const response = await runProviderFusion({
    ...base,
    invoke: async ({ providerId }) => providerId === "fusion-primary"
      ? { text: "42", confidence: 0.4, evidence: evidence("42"), costUsd: 0.01 }
      : { text: "43", confidence: 0.9, evidence: evidence("43"), costUsd: 0.015 },
  });
  assert.equal(response.status, "conflict");
  assert.equal(response.answer, null);
  assert.equal(response.independentlyChecked, true);
  assert.deepEqual(response.conflicts[0].first, {
    providerId: "fusion-primary", value: "42", source: "fixture://source",
  });
  assert.deepEqual(response.conflicts[0].second, {
    providerId: "fusion-checker", value: "43", source: "fixture://source",
  });
  assert.equal(response.evidence.length, 2);
});

test("agreement is synthesized locally from both provider outputs without a third model call", async () => {
  providers();
  let providerCalls = 0;
  let synthesisInput;
  const response = await runProviderFusion({
    ...base,
    invoke: async ({ providerId }) => {
      providerCalls += 1;
      return { text: "42", confidence: providerId === "fusion-primary" ? 0.3 : 0.92, evidence: evidence(), costUsd: 0.01 };
    },
    synthesize: (input) => {
      synthesisInput = input;
      return "42";
    },
  });
  assert.equal(response.status, "complete");
  assert.equal(response.answer, "42");
  assert.equal(response.synthesis, "local_synthesizer");
  assert.equal(providerCalls, 2);
  assert.equal("accountScope" in synthesisInput, false);
});

test("the checker reservation is rejected before dispatch when it exceeds the hard budget", async () => {
  providers({ secondCost: 0.04 });
  let calls = 0;
  const response = await runProviderFusion({
    ...base,
    maxCostUsd: 0.05,
    invoke: async () => {
      calls += 1;
      return { text: "42", confidence: 0.2, evidence: evidence(), costUsd: 0.01 };
    },
  });
  assert.equal(response.status, "budget_exhausted");
  assert.equal(calls, 1);
  assert.equal(response.reservedCostUsd, 0.02);
});

test("an unpriced model is never dispatched", async () => {
  providers({ priced: false });
  let calls = 0;
  const response = await runProviderFusion({ ...base, invoke: async () => { calls += 1; } });
  assert.equal(response.status, "budget_unpriced");
  assert.equal(calls, 0);
});

test("provider-reported spend above its reservation is rejected", async () => {
  providers();
  const response = await runProviderFusion({
    ...base,
    invoke: async () => ({ text: "too expensive", confidence: 1, evidence: evidence(), costUsd: 0.03 }),
  });
  assert.equal(response.status, "provider_contract_invalid");
  assert.equal(response.calls, 1);
});

test("provider result accessors are rejected without evaluating getters", async () => {
  providers();
  let getterCalls = 0;
  const hostile = { confidence: 0.9, evidence: evidence() };
  Object.defineProperty(hostile, "text", {
    enumerable: true,
    get() { getterCalls += 1; return "forged"; },
  });
  const response = await runProviderFusion({ ...base, invoke: async () => hostile });
  assert.equal(response.status, "provider_contract_invalid");
  assert.equal(getterCalls, 0);
});

test("cyclic, sparse, and decorated evidence arrays fail closed", async (t) => {
  providers();
  const cases = [
    ["cyclic evidence item", () => {
      const item = { claimId: "a", statement: "claim", value: "x" };
      item.source = item;
      return [item];
    }],
    ["sparse evidence", () => { const sparse = []; sparse.length = 1; return sparse; }],
    ["accessor evidence", () => {
      const item = { claimId: "a", value: "x" };
      Object.defineProperty(item, "statement", { enumerable: true, get() { throw new Error("must not run"); } });
      return [item];
    }],
    ["decorated evidence", () => {
      const rows = evidence();
      rows.extra = "untrusted metadata";
      return rows;
    }],
    ["prototype-decorated evidence", () => [Object.assign(Object.create({ inherited: "untrusted" }), { claimId: "a", statement: "claim", value: "x" })]],
  ];
  for (const [name, createEvidence] of cases) {
    await t.test(name, async () => {
      const response = await runProviderFusion({
        ...base,
        invoke: async () => ({ text: "answer", confidence: 0.9, evidence: createEvidence(), costUsd: 0.01 }),
      });
      assert.equal(response.status, "provider_contract_invalid");
    });
  }
});

test("the local synthesizer cannot mutate evidence used for the returned decision", async () => {
  providers();
  const response = await runProviderFusion({
    ...base,
    invoke: async ({ providerId }) => providerId === "fusion-primary"
      ? { text: "42", confidence: 0.2, evidence: evidence(), costUsd: 0.01 }
      : { text: "42", confidence: 0.9, evidence: evidence(), costUsd: 0.01 },
    synthesize: ({ checker }) => {
      checker.evidence[0].value = "forged";
      return "forged answer";
    },
  });
  assert.equal(response.status, "synthesis_failed");
  assert.equal("evidence" in response, false);
});

test("independent verification rejects spoofed provider text before dispatching a checker", async () => {
  providers();
  const calls = [];
  const response = await runProviderFusion({
    ...base,
    invoke: async ({ providerId }) => {
      calls.push(providerId);
      return { text: "Spoofed answer", confidence: 0.2, evidence: evidence("42"), costUsd: 0.01 };
    },
  });
  assert.equal(response.status, "provider_contract_invalid");
  assert.equal(response.reason, "candidate_answer_not_bound_to_evidence");
  assert.equal(response.answer, undefined);
  assert.deepEqual(calls, ["fusion-primary"]);
});

test("Auto does not spend a second provider call when the candidate has no evidence", async () => {
  providers();
  const calls = [];
  const response = await runProviderFusion({
    ...base,
    invoke: async ({ providerId }) => {
      calls.push(providerId);
      return { text: "42", confidence: 0.4, evidence: [], costUsd: 0.01 };
    },
  });
  assert.equal(response.status, "inconclusive");
  assert.equal(response.reason, "candidate_evidence_missing");
  assert.equal(response.answer, undefined);
  assert.deepEqual(calls, ["fusion-primary"]);
});

test("Fusion returns no partial answer when the independent checker fails", async () => {
  providers();
  const calls = [];
  const response = await runProviderFusion({
    ...base,
    mode: FUSION_MODES.FUSION,
    invoke: async ({ providerId }) => {
      calls.push(providerId);
      if (providerId === "fusion-checker") throw new Error("private provider failure");
      return { text: "42", confidence: 0.95, evidence: evidence(), costUsd: 0.01 };
    },
  });
  assert.equal(response.status, "verification_unavailable");
  assert.equal(response.reason, "independent_provider_failed");
  assert.equal(response.answer, undefined);
  assert.deepEqual(calls, ["fusion-primary", "fusion-checker"]);
  assert.equal(JSON.stringify(response).includes("private provider failure"), false);
});

test("a non-cooperative checker is aborted at the provider timeout and no partial answer escapes", async () => {
  providers();
  const calls = [];
  let checkerAborted = false;
  const response = await runProviderFusion({
    ...base,
    mode: FUSION_MODES.FUSION,
    providerTimeoutMs: 10,
    maxDurationMs: 40,
    invoke: async ({ providerId, signal }) => {
      calls.push(providerId);
      if (providerId !== "fusion-checker") return { text: "42", confidence: 0.95, evidence: evidence(), costUsd: 0.01 };
      return await new Promise((_resolve, reject) => signal.addEventListener("abort", () => {
        checkerAborted = true;
        reject(new Error("aborted"));
      }, { once: true }));
    },
  });
  assert.equal(response.status, "verification_unavailable");
  assert.equal(response.reason, "provider_timeout");
  assert.equal(response.answer, undefined);
  assert.deepEqual(calls, ["fusion-primary", "fusion-checker"]);
  assert.equal(checkerAborted, true);
});

test("a provider cannot exceed the hard per-call time ceiling", async () => {
  providers();
  const response = await runProviderFusion({
    ...base,
    providerTimeoutMs: 20_001,
    invoke: async () => ({ text: "42", confidence: 0.9, evidence: evidence(), costUsd: 0.01 }),
  });
  assert.equal(response.status, "invalid_request");
  assert.equal(response.reason, "time_budget_invalid");
});

test("the total deadline prevents a delayed primary from dispatching another provider", async () => {
  providers();
  const calls = [];
  const response = await runProviderFusion({
    ...base,
    providerTimeoutMs: 1_000,
    maxDurationMs: 100,
    invoke: async ({ providerId }) => {
      calls.push(providerId);
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { text: "42", confidence: 0.4, evidence: evidence(), costUsd: 0.01 };
    },
  });
  assert.equal(response.status, "time_budget_exhausted");
  assert.deepEqual(calls, ["fusion-primary"]);
});

test("a total deadline shorter than the provider timeout stops dispatch as time budget exhaustion", async () => {
  providers();
  const calls = [];
  const response = await runProviderFusion({
    ...base,
    providerTimeoutMs: 100,
    maxDurationMs: 10,
    invoke: async ({ providerId }) => {
      calls.push(providerId);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { text: "42", confidence: 0.4, evidence: evidence(), costUsd: 0.01 };
    },
  });
  assert.equal(response.status, "time_budget_exhausted");
  assert.deepEqual(calls, ["fusion-primary"]);
});

test("verification requires trusted provider and model provenance", async () => {
  let calls = 0;
  const response = await runProviderFusion({
    ...base,
    mode: FUSION_MODES.FUSION,
    permissions: [...base.permissions, "provider:undefined"],
    providerModels: [
      { id: "spoof-primary", capabilities: ["chat"], priority: 1, maxCostUsd: 0.02 },
      { id: "known-checker", providerId: "fusion-checker", capabilities: ["chat"], priority: 2, maxCostUsd: 0.02 },
    ],
    invoke: async () => { calls += 1; return { text: "42", confidence: 0.9, evidence: evidence(), costUsd: 0.01 }; },
  });
  assert.equal(response.status, "unsupported_mode");
  assert.equal(response.reason, "no_permitted_provider");
  assert.equal(calls, 0);
});

test("primary outage falls back to the next permitted provider within the same cost ceiling", async () => {
  providers();
  const response = await runProviderFusion({
    ...base,
    invoke: async ({ providerId }) => {
      if (providerId === "fusion-primary") throw new Error("private provider error details");
      return { text: "fallback", confidence: 0.8, evidence: evidence("fallback"), costUsd: 0.01 };
    },
  });
  assert.equal(response.status, "complete");
  assert.equal(response.answer, "fallback");
  assert.deepEqual(response.providers.map(({ providerId }) => providerId), ["fusion-checker"]);
});

test("a fallback cannot deliver text that its own answer evidence does not bind", async () => {
  providers();
  const response = await runProviderFusion({
    ...base,
    invoke: async ({ providerId }) => {
      if (providerId === "fusion-primary") throw new Error("primary unavailable");
      return { text: "Spoofed fallback", confidence: 0.9, evidence: evidence("42"), costUsd: 0.01 };
    },
  });
  assert.equal(response.status, "provider_contract_invalid");
  assert.equal(response.reason, "fallback_answer_not_bound_to_evidence");
  assert.equal(response.answer, undefined);
});

test("fallback outage reports the actual dispatched call count without leaking provider errors", async () => {
  providers();
  const response = await runProviderFusion({ ...base, invoke: async () => { throw new Error("private endpoint and prompt details"); } });
  assert.equal(response.status, "provider_unavailable");
  assert.equal(response.calls, 2);
  assert.equal(JSON.stringify(response).includes("private endpoint"), false);
});

test("failed primary calls are counted when fallback is blocked by its reservation", async () => {
  providers();
  const response = await runProviderFusion({
    ...base,
    maxCostUsd: 0.02,
    invoke: async () => { throw new Error("offline"); },
  });
  assert.equal(response.status, "budget_exhausted");
  assert.equal(response.calls, 1);
  assert.equal(response.reservedCostUsd, 0.02);
});

test("Fusion mode requires two authorized providers and refuses sensitive hybrid routing", async () => {
  clearProviders();
  setAccountScope("fixture-a");
  seedPermissions([
    { permission: "provider.remote", status: "granted", scope: "account" },
    { permission: "provider:fusion-primary", status: "granted", scope: "account" },
  ], "fixture-a");
  registerProvider({
    id: "fusion-primary", name: "Fixture Primary", capabilities: ["chat", "reasoning"],
    models: [{ id: "primary-v1", priority: 1, maxCostUsd: 0.02 }],
  });
  let calls = 0;
  const unsupported = await runProviderFusion({
    ...base,
    mode: FUSION_MODES.FUSION,
    permissions: ["provider.remote", "provider:fusion-primary"],
    invoke: async () => { calls += 1; },
  });
  assert.equal(unsupported.status, "unsupported_mode");
  assert.equal(calls, 0);
  const privateHybrid = await runProviderFusion({
    ...base,
    mode: FUSION_MODES.HYBRID,
    sensitive: true,
    invoke: async () => { calls += 1; },
  });
  assert.equal(privateHybrid.status, "denied");
  assert.equal(privateHybrid.reason, "sensitive_prompt_cannot_leave_device");
  assert.equal(calls, 0);
});

test("Local Only requires local permission and cannot leak a sensitive prompt to a remote model", async () => {
  providers({ withLocal: true });
  let calls = 0;
  const denied = await runProviderFusion({
    ...base,
    mode: FUSION_MODES.LOCAL_ONLY,
    sensitive: true,
    permissions: ["provider.remote", "provider:fusion-primary"],
    invoke: async () => { calls += 1; },
  });
  assert.equal(denied.status, "denied");
  assert.equal(denied.reason, "sensitive_prompt_requires_permitted_local_provider");
  const local = await runProviderFusion({
    ...base,
    mode: FUSION_MODES.LOCAL_ONLY,
    sensitive: true,
    permissions: ["provider.local", "provider:fusion-local"],
    invoke: async (request) => {
      calls += 1;
      assert.equal(request.providerId, "fusion-local");
      return { text: "local-only", confidence: 0.99, evidence: evidence(), costUsd: 0 };
    },
  });
  assert.equal(local.status, "complete");
  assert.equal(local.answer, "local-only");
  assert.equal(calls, 1);
});

test("cancellation and account-scope fencing discard stale provider output", async () => {
  providers();
  const controller = new AbortController();
  let calls = 0;
  const cancelled = await runProviderFusion({
    ...base,
    signal: controller.signal,
    invoke: async () => {
      calls += 1;
      controller.abort();
      return { text: "stale", confidence: 1, evidence: evidence(), costUsd: 0.01 };
    },
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(calls, 1);

  const switchedAccount = await runProviderFusion({
    ...base,
    isCurrent: () => false,
    invoke: async () => { calls += 1; return { text: "stale", confidence: 1, evidence: evidence(), costUsd: 0.01 }; },
  });
  assert.equal(switchedAccount.status, "cancelled");
  assert.equal(calls, 1);

  const asynchronousFence = await runProviderFusion({
    ...base,
    isCurrent: async () => true,
    invoke: async () => { calls += 1; return { text: "stale", confidence: 1, evidence: evidence(), costUsd: 0.01 }; },
  });
  assert.equal(asynchronousFence.status, "cancelled");
  assert.equal(calls, 1);
});

test("caller-supplied provider permissions cannot grant access without owner-bound grants", async () => {
  providers();
  revokePermission("provider.remote", "account");
  let calls = 0;
  const denied = await runProviderFusion({
    ...base,
    permissions: ["provider.remote", "provider:fusion-primary", "provider:fusion-checker"],
    invoke: async () => { calls += 1; return { text: "42", confidence: 1, evidence: evidence(), costUsd: 0.01 }; },
  });
  assert.equal(denied.status, "unsupported_mode");
  assert.equal(denied.reason, "no_permitted_provider");
  assert.equal(calls, 0);
});

test("permission revocation during provider work invalidates the dispatch epoch", async () => {
  providers();
  let calls = 0;
  const revoked = await runProviderFusion({
    ...base,
    invoke: async () => {
      calls += 1;
      revokePermission("provider.remote", "account");
      return { text: "42", confidence: 0.4, evidence: evidence(), costUsd: 0.01 };
    },
  });
  assert.equal(revoked.status, "cancelled");
  assert.equal(calls, 1);
});

test("account switch during provider work invalidates the captured permission snapshot", async () => {
  providers();
  let calls = 0;
  const switched = await runProviderFusion({
    ...base,
    invoke: async () => {
      calls += 1;
      setAccountScope("fixture-b");
      return { text: "42", confidence: 0.4, evidence: evidence(), costUsd: 0.01 };
    },
  });
  assert.equal(switched.status, "cancelled");
  assert.equal(calls, 1, "the checker is not dispatched under the changed account scope");
});

test("manual selection fails closed for an unregistered or unpermitted provider", async () => {
  providers();
  let calls = 0;
  const absent = await runProviderFusion({ ...base, mode: FUSION_MODES.MANUAL, manualProvider: "missing", invoke: async () => { calls += 1; } });
  assert.equal(absent.status, "unsupported_mode");
  const forbidden = await runProviderFusion({ ...base, mode: FUSION_MODES.MANUAL, manualProvider: "fusion-primary", permissions: [], invoke: async () => { calls += 1; } });
  assert.equal(forbidden.status, "unsupported_mode");
  assert.equal(calls, 0);
});
