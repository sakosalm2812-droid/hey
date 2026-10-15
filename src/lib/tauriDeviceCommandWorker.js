import { createTauriAdapter, isTauriRuntime } from "./tauriAdapter.js";

const DEVICE_CREDENTIAL = /^heydev1\.[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_LEASE_MS = 300_000;
const SUPPORTED_ACTIONS = Object.freeze({
  "computer.open_url": "browser.open_url",
  "computer.open_app": "app.open",
  "computer.navigate_browser": "browser.navigate",
  "computer.read_file": "filesystem.read",
  "computer.write_file": "filesystem.write",
  "computer.create_directory": "filesystem.create_directory",
  "computer.list_files": "filesystem.list",
  "computer.delete_file": "filesystem.delete",
  "computer.execute_terminal": "terminal.execute",
});

function validUuid(value) { return typeof value === "string" && UUID.test(value); }

function safeRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null));
}

function boundedInterval(value) {
  if (!Number.isSafeInteger(value) || value < 250 || value > 60_000) throw new RangeError("Worker polling interval must be between 250 ms and 60 seconds.");
  return value;
}

function endpointUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new TypeError("A valid device transport endpoint is required."); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) throw new TypeError("The device transport endpoint must use HTTPS.");
  if (url.username || url.password || url.hash || url.search || url.pathname !== "/functions/v1/hey-device-transport") {
    throw new TypeError("The device transport endpoint is invalid.");
  }
  return url.href;
}

function parseCommand(value) {
  if (!safeRecord(value) || !validUuid(value.commandId) || !validUuid(value.deviceId)
    || !safeRecord(value.envelope) || value.envelope.version !== 1
    || typeof value.envelope.action !== "string" || !Object.hasOwn(SUPPORTED_ACTIONS, value.envelope.action)
    || typeof value.envelope.resource !== "string" || !value.envelope.resource.trim() || value.envelope.resource.length > 256
    || !safeRecord(value.envelope.input)) return null;
  return {
    commandId: value.commandId,
    deviceId: value.deviceId,
    envelope: {
      version: 1,
      action: value.envelope.action,
      resource: value.envelope.resource,
      input: value.envelope.input,
    },
  };
}

export function createEdgeDeviceCommandTransport({ endpoint, credential, fetchImpl = globalThis.fetch } = {}) {
  const url = endpointUrl(endpoint);
  if (typeof credential !== "string" || !DEVICE_CREDENTIAL.test(credential)) throw new TypeError("A valid device credential is required.");
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");

  async function post(body, signal) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch {
      if (signal?.aborted) {
        const error = new Error("Device transport request was stopped.");
        error.name = "AbortError";
        throw error;
      }
      throw new Error("Device transport request failed.");
    }
    let payload;
    try { payload = await response.json(); } catch { throw new Error("Device transport response was invalid."); }
    if (!response.ok || !safeRecord(payload) || payload.ok !== true) {
      const error = new Error("Device transport rejected the request.");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  return Object.freeze({
    async claim(deviceId, leaseMs, signal) {
      const payload = await post({ operation: "claim", deviceId, leaseMs }, signal);
      if (payload.claim === null) return null;
      if (!safeRecord(payload.claim) || !validUuid(payload.claim.leaseToken)) throw new Error("Device claim response was invalid.");
      const command = parseCommand(payload.claim.command);
      if (!command || command.deviceId !== deviceId) throw new Error("Device claim response was invalid.");
      return { command, leaseToken: payload.claim.leaseToken };
    },
    async renew(deviceId, commandId, leaseToken, idempotencyKey, leaseMs) {
      const payload = await post({ operation: "renew", deviceId, commandId, leaseToken, idempotencyKey, leaseMs });
      return safeRecord(payload.renewal) && payload.renewal.renewed === true;
    },
    async acknowledge(deviceId, commandId, leaseToken) {
      const payload = await post({ operation: "ack", deviceId, commandId, leaseToken });
      return payload.accepted === true;
    },
    async fail(deviceId, commandId, leaseToken) {
      const payload = await post({ operation: "fail", deviceId, commandId, leaseToken });
      return payload.accepted === true;
    },
  });
}

export async function rotateTauriDeviceCommandCredential({ endpoint, deviceId, accountAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const url = endpointUrl(endpoint);
  if (!validUuid(deviceId) || typeof accountAccessToken !== "string" || !accountAccessToken.trim()
    || accountAccessToken.length > 16_384 || typeof fetchImpl !== "function") {
    throw new TypeError("An account session, device id, and transport endpoint are required.");
  }
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accountAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "rotate", deviceId }),
    });
  } catch {
    throw new Error("Device credential rotation failed.");
  }
  let payload;
  try { payload = await response.json(); } catch { throw new Error("Device credential response was invalid."); }
  if (!response.ok || !safeRecord(payload) || payload.ok !== true
    || typeof payload.credential !== "string" || !DEVICE_CREDENTIAL.test(payload.credential)) {
    throw new Error("Device credential rotation failed.");
  }
  return payload.credential;
}

export function createDeviceCommandWorker({
  deviceId,
  transport,
  adapter,
  leaseMs = 30_000,
  pollIntervalMs = 2_000,
  onStatus = () => {},
  makeIdempotencyKey = () => globalThis.crypto.randomUUID(),
} = {}) {
  if (!validUuid(deviceId) || !transport || typeof transport.claim !== "function"
    || typeof transport.renew !== "function" || typeof transport.acknowledge !== "function"
    || typeof transport.fail !== "function" || !adapter || typeof adapter.execute !== "function"
    || !Array.isArray(adapter.capabilities)) {
    throw new TypeError("A device id, command transport, and local adapter are required.");
  }
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1_000 || leaseMs > MAX_LEASE_MS) throw new RangeError("Worker lease must be between 1 second and 5 minutes.");
  pollIntervalMs = boundedInterval(pollIntervalMs);
  if (typeof onStatus !== "function" || typeof makeIdempotencyKey !== "function") throw new TypeError("Worker callbacks must be functions.");

  let stopping = false;
  let running = false;
  let loopPromise = null;
  let activeRunPromise = null;
  let pollController = null;
  let activeCommand = null;
  const completed = new Map();
  const wakeWaiters = new Set();

  function status(state) {
    try { onStatus({ state, deviceId, ...(activeCommand ? { commandId: activeCommand } : {}) }); } catch { /* Status hooks cannot affect command safety. */ }
  }

  async function processClaim(claim) {
    const { command, leaseToken } = claim;
    const action = command.envelope.action;
    const capability = SUPPORTED_ACTIONS[action];
    const fingerprint = JSON.stringify(command.envelope);
    activeCommand = command.commandId;
    const prior = completed.get(command.commandId);
    if (prior && prior !== fingerprint) {
      status("replay_conflict");
      try { await transport.fail(deviceId, command.commandId, leaseToken); } catch { /* The lease will expire and retry safely. */ }
      activeCommand = null;
      return;
    }
    if (prior === fingerprint) {
      status("acknowledging_replay");
      const accepted = await transport.acknowledge(deviceId, command.commandId, leaseToken);
      status(accepted ? "acknowledged" : "ack_rejected");
      activeCommand = null;
      return;
    }
    if (stopping) {
      try { await transport.fail(deviceId, command.commandId, leaseToken); } catch { /* The lease will expire and retry safely. */ }
      activeCommand = null;
      return;
    }
    if (!adapter.capabilities.includes(capability)) {
      status("unsupported_capability");
      try { await transport.fail(deviceId, command.commandId, leaseToken); } catch { /* The lease will expire and retry safely. */ }
      activeCommand = null;
      return;
    }

    let renewalInFlight = false;
    let leaseLost = false;
    const timer = setInterval(async () => {
      if (renewalInFlight || stopping) return;
      renewalInFlight = true;
      try {
        const key = makeIdempotencyKey();
        if (typeof key !== "string" || !key.trim() || key.length > 128) throw new Error("Invalid renewal key.");
        const renewed = await transport.renew(deviceId, command.commandId, leaseToken, key, leaseMs);
        if (!renewed) leaseLost = true;
      } catch { /* The current lease remains authoritative until the server says otherwise. */ }
      finally { renewalInFlight = false; }
    }, Math.max(500, Math.floor(leaseMs / 3)));

    status("executing");
    let execution;
    try {
      execution = await adapter.execute({ capability, input: command.envelope.input, action, commandId: command.commandId });
    } catch {
      execution = null;
    } finally {
      clearInterval(timer);
      while (renewalInFlight) await new Promise((resolve) => setTimeout(resolve, 10));
    }

    if (execution?.success !== true || execution?.verified !== true) {
      status("execution_failed");
      let retried = false;
      try { retried = await transport.fail(deviceId, command.commandId, leaseToken); } catch { /* Lease expiry provides retry recovery. */ }
      status(retried ? "retry_scheduled" : "failure_rejected");
      activeCommand = null;
      return;
    }

    completed.set(command.commandId, fingerprint);
    while (completed.size > 500) completed.delete(completed.keys().next().value);
    status(leaseLost ? "execution_verified_lease_uncertain" : "execution_verified");
    const accepted = await transport.acknowledge(deviceId, command.commandId, leaseToken);
    status(accepted ? "acknowledged" : "ack_rejected");
    activeCommand = null;
  }

  async function runOnce() {
    if (running) return { state: "busy" };
    if (stopping) return { state: "stopped" };
    running = true;
    let finishActiveRun;
    activeRunPromise = new Promise((resolve) => { finishActiveRun = resolve; });
    pollController = new AbortController();
    try {
      status("polling");
      const claim = await transport.claim(deviceId, leaseMs, pollController.signal);
      if (!claim) { status("idle"); return { state: "idle" }; }
      await processClaim(claim);
      return { state: "processed", commandId: claim.command.commandId };
    } catch (error) {
      if (!(stopping && error?.name === "AbortError")) {
        if (error?.status === 401 || error?.status === 403) {
          status("credential_revoked");
          stopping = true;
        } else status("transport_unavailable");
      }
      return { state: "unavailable" };
    } finally {
      activeCommand = null;
      pollController = null;
      running = false;
      finishActiveRun();
      activeRunPromise = null;
    }
  }

  async function wait(ms) {
    await new Promise((resolve) => {
      const finish = () => { clearTimeout(timer); wakeWaiters.delete(finish); resolve(); };
      const timer = setTimeout(finish, ms);
      wakeWaiters.add(finish);
      if (stopping) finish();
    });
  }

  async function loop() {
    let delay = pollIntervalMs;
    while (!stopping) {
      const result = await runOnce();
      if (result.state === "idle") delay = pollIntervalMs;
      else if (result.state === "unavailable") delay = Math.min(30_000, Math.max(pollIntervalMs, delay * 2));
      else delay = 0;
      if (delay) await wait(delay);
    }
    status("stopped");
  }

  return Object.freeze({
    runOnce,
    start() {
      if (!loopPromise) {
        stopping = false;
        loopPromise = loop().finally(() => { loopPromise = null; });
      }
      return loopPromise;
    },
    async stop() {
      stopping = true;
      pollController?.abort();
      for (const wake of [...wakeWaiters]) wake();
      if (loopPromise) await loopPromise;
      else if (activeRunPromise) await activeRunPromise;
      return { stopped: true };
    },
    get state() { return stopping ? "stopped" : running ? "running" : "idle"; },
  });
}

export function startTauriDeviceCommandWorker({ endpoint, deviceId, credential, ...options } = {}) {
  if (!isTauriRuntime()) throw new Error("Device command workers require the supported Tauri desktop runtime.");
  const adapter = createTauriAdapter();
  if (!adapter) throw new Error("The local Tauri adapter is unavailable.");
  const transport = createEdgeDeviceCommandTransport({ endpoint, credential, fetchImpl: options.fetchImpl });
  const worker = createDeviceCommandWorker({ deviceId, transport, adapter, ...options });
  const done = worker.start();
  return Object.freeze({ worker, done, stop: () => worker.stop() });
}

export async function startTauriDeviceCommandWorkerForAccount({ endpoint, deviceId, accountAccessToken, ...options } = {}) {
  if (!isTauriRuntime()) throw new Error("Device command workers require the supported Tauri desktop runtime.");
  const credential = await rotateTauriDeviceCommandCredential({ endpoint, deviceId, accountAccessToken, fetchImpl: options.fetchImpl });
  return startTauriDeviceCommandWorker({ endpoint, deviceId, credential, ...options });
}
