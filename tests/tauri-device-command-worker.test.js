import test from "node:test";
import assert from "node:assert/strict";
import { createDeviceCommandWorker, createEdgeDeviceCommandTransport, rotateTauriDeviceCommandCredential } from "../src/lib/tauriDeviceCommandWorker.js";

const deviceId = "67337f11-57da-4c23-a41f-fc19d1995b61";
const commandId = "6cc95d2f-b37c-4d99-a6d6-3c59eb9126fb";
const leaseToken = "1b8473f4-b50d-4a04-9834-7e5b446c07b4";
const credential = `heydev1.${"a".repeat(43)}`;
const command = {
  commandId,
  deviceId,
  envelope: { version: 1, action: "computer.open_url", resource: "https://example.com", input: { url: "https://example.com" } },
};
const adapter = {
  platform: "windows",
  capabilities: ["browser.open_url", "app.open", "browser.navigate", "filesystem.read", "filesystem.write", "filesystem.create_directory", "filesystem.list", "filesystem.delete", "terminal.execute"],
  async execute() { return { success: true, verified: true }; },
};

function transportWith({ claims = [], ack = true, fail = true } = {}) {
  const calls = [];
  return {
    calls,
    async claim(...args) { calls.push(["claim", ...args.slice(0, 2)]); return claims.shift() ?? null; },
    async renew(...args) { calls.push(["renew", ...args.slice(0, 4)]); return true; },
    async acknowledge(...args) { calls.push(["ack", ...args]); return ack; },
    async fail(...args) { calls.push(["fail", ...args]); return fail; },
  };
}

test("Edge transport sends credential-bound claim, renewal, ack, and failure operations", async () => {
  const requests = [];
  const replies = [
    { ok: true, claim: { command, leaseToken } },
    { ok: true, renewal: { renewed: true } },
    { ok: true, accepted: true },
    { ok: true, accepted: false },
  ];
  const transport = createEdgeDeviceCommandTransport({
    endpoint: "https://project.supabase.co/functions/v1/hey-device-transport",
    credential,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return { ok: true, status: 200, async json() { return replies.shift(); } };
    },
  });
  assert.deepEqual(await transport.claim(deviceId, 10_000), { command, leaseToken });
  assert.equal(await transport.renew(deviceId, commandId, leaseToken, "renew-1", 10_000), true);
  assert.equal(await transport.acknowledge(deviceId, commandId, leaseToken), true);
  assert.equal(await transport.fail(deviceId, commandId, leaseToken), false);
  assert.equal(requests.length, 4);
  assert.equal(requests[0].url, "https://project.supabase.co/functions/v1/hey-device-transport");
  assert.equal(requests[0].init.headers.Authorization, `Bearer ${credential}`);
  assert.deepEqual(requests.map(({ init }) => JSON.parse(init.body).operation), ["claim", "renew", "ack", "fail"]);
  for (const { init } of requests) assert.equal(Object.hasOwn(init.headers, "apikey"), false);
  assert.throws(() => createEdgeDeviceCommandTransport({ endpoint: "http://remote.example/functions/v1/hey-device-transport", credential, fetchImpl: async () => {} }), /HTTPS/);
  assert.throws(() => createEdgeDeviceCommandTransport({ endpoint: "https://attacker.example/collect", credential, fetchImpl: async () => {} }), /endpoint is invalid/);
});

test("Tauri bootstrap rotates a device secret with the authenticated account session", async () => {
  const requests = [];
  const rotated = await rotateTauriDeviceCommandCredential({
    endpoint: "https://project.supabase.co/functions/v1/hey-device-transport",
    deviceId,
    accountAccessToken: "account-session-jwt",
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return { ok: true, async json() { return { ok: true, credential }; } };
    },
  });
  assert.equal(rotated, credential);
  assert.equal(requests[0].init.headers.Authorization, "Bearer account-session-jwt");
  assert.deepEqual(JSON.parse(requests[0].init.body), { operation: "rotate", deviceId });
  await assert.rejects(rotateTauriDeviceCommandCredential({
    endpoint: "https://project.supabase.co/functions/v1/hey-device-transport", deviceId,
    accountAccessToken: "account-session-jwt", fetchImpl: async () => ({ ok: false, async json() { return { ok: false, credential }; } }),
  }), /rotation failed/);
});

test("worker executes supported local capabilities and acknowledges only verified results", async () => {
  const transport = transportWith({ claims: [{ command, leaseToken }] });
  const executions = [];
  const worker = createDeviceCommandWorker({
    deviceId,
    transport,
    adapter: { ...adapter, async execute(request) { executions.push(request); return { success: true, verified: true }; } },
  });
  assert.deepEqual(await worker.runOnce(), { state: "processed", commandId });
  assert.deepEqual(executions, [{ capability: "browser.open_url", input: command.envelope.input, action: "computer.open_url", commandId }]);
  assert.equal(transport.calls.at(-1)[0], "ack");

  const unverifiedTransport = transportWith({ claims: [{ command, leaseToken }] });
  const unverified = createDeviceCommandWorker({
    deviceId,
    transport: unverifiedTransport,
    adapter: { ...adapter, async execute() { return { success: true, verified: false }; } },
  });
  await unverified.runOnce();
  assert.equal(unverifiedTransport.calls.some(([operation]) => operation === "ack"), false);
  assert.equal(unverifiedTransport.calls.at(-1)[0], "fail");
});

test("worker retries execution failures and replays acknowledgements without repeating a verified action", async () => {
  const transport = transportWith({ claims: [{ command, leaseToken }, { command, leaseToken }] });
  let executions = 0;
  const worker = createDeviceCommandWorker({
    deviceId,
    transport,
    adapter: { ...adapter, async execute() { executions += 1; return { success: true, verified: true }; } },
  });
  await worker.runOnce();
  await worker.runOnce();
  assert.equal(executions, 1);
  assert.equal(transport.calls.filter(([operation]) => operation === "ack").length, 2);
});

test("worker renews long-running leases before it sends the verified acknowledgement", async () => {
  const transport = transportWith({ claims: [{ command, leaseToken }] });
  const worker = createDeviceCommandWorker({
    deviceId,
    transport,
    leaseMs: 1_000,
    makeIdempotencyKey: () => "renew-1",
    adapter: { ...adapter, async execute() { await new Promise((resolve) => setTimeout(resolve, 550)); return { success: true, verified: true }; } },
  });
  await worker.runOnce();
  assert.deepEqual(transport.calls.slice(-2).map(([operation]) => operation), ["renew", "ack"]);
});

test("worker stop halts polling and a revoked credential stops the Edge transport", async () => {
  let claimStarted;
  const waiting = new Promise((resolve) => { claimStarted = resolve; });
  let claimCount = 0;
  const transport = {
    async claim() { claimCount += 1; claimStarted(); return null; },
    async renew() { return true; },
    async acknowledge() { return true; },
    async fail() { return true; },
  };
  const worker = createDeviceCommandWorker({ deviceId, transport, adapter });
  const done = worker.start();
  await waiting;
  await worker.stop();
  await done;
  assert.equal(claimCount, 1);
  assert.equal(worker.state, "stopped");

  const revoked = createEdgeDeviceCommandTransport({
    endpoint: "https://project.supabase.co/functions/v1/hey-device-transport",
    credential,
    fetchImpl: async () => ({ ok: false, status: 401, async json() { return { ok: false }; } }),
  });
  await assert.rejects(revoked.claim(deviceId, 10_000), (error) => error.status === 401);
  const revokedEvents = [];
  const revokedWorker = createDeviceCommandWorker({ deviceId, transport: revoked, adapter, onStatus: ({ state }) => revokedEvents.push(state) });
  await revokedWorker.runOnce();
  assert.equal(revokedWorker.state, "stopped");
  assert.equal(revokedEvents.includes("credential_revoked"), true);
});
