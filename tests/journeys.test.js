import assert from "node:assert/strict";
import test from "node:test";
import { HEY } from "../src/core/index.js";
import { clearEventListeners } from "../src/core/eventBus.js";
import { clearAuditEntries, listAuditEntries } from "../src/core/auditLog.js";
import { clearMemoryGraph } from "../src/core/memoryGraph.js";
import {
  clearInbox,
  isAutoApproveEnabled,
  setAutoApproveEnabled,
  listInbox,
} from "../src/core/memoryInbox.js";
import { getContext, resetContext } from "../src/core/contextManager.js";

function clearState() {
  clearEventListeners();
  clearAuditEntries();
  clearMemoryGraph();
  clearInbox();
  setAutoApproveEnabled(false);
  resetContext();
}

test.beforeEach(() => {
  clearState();
});

test.afterEach(() => {
  clearState();
});

test("full journey: HEY understands a request, gates an automatic memory, approval stores it, receipt is recorded", async () => {
  HEY.initialize();

  const result = HEY.process("Remember that my favorite color is teal.");
  assert.equal(result.normalizedInput, "Remember that my favorite color is teal.");
  assert.equal(typeof result.instruction, "string");
  assert.equal(result.instruction.includes("User request: Remember that my favorite color is teal."), true);
  assert.equal(typeof result.clarification.required, "boolean");

  const queued = HEY.remember("My favorite color is teal.");
  assert.equal(queued.pending, true, "automatic important memories must wait in the inbox");
  const pending = listInbox();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].value, "My favorite color is teal.");

  const approved = await HEY.memoryInbox.approve(pending[0].id, "user-e2e-1");
  assert.equal(approved.success, true);

  const receipts = listAuditEntries(20);
  assert.equal(receipts.some((entry) => entry.action === "memory.gated"), true);
  assert.equal(receipts.some((entry) => entry.action === "memory.approved"), true);
  assert.equal(listInbox().length, 0);

  const memorySeen = HEY.memory.search("teal");
  assert.equal(memorySeen.some((entry) => String(entry.value || entry.fact || "").includes("teal")), true);
});

test("full journey: auto-approve skips the inbox for automatic memories", async () => {
  setAutoApproveEnabled(true);
  assert.equal(isAutoApproveEnabled(), true);

  const stored = HEY.remember("The project codename is Halcyon.");
  assert.equal(stored.pending, undefined);
  assert.equal(listInbox().length, 0);
  assert.equal(HEY.memory.search("Halcyon").length >= 1, true);
});

test("full journey: explicit remember writes through even when gating is on", () => {
  setAutoApproveEnabled(false);
  const stored = HEY.remember("Buy saffron on the way home.");
  assert.equal(stored.pending, true, "HEY.remember is an automatic channel and uses the inbox");

  const context = getContext();
  const explicit = HEY.context.addImportantFact({ fact: "Buy saffron on the way home." });
  assert.equal(explicit.length >= 1, true);
  assert.equal(context.memory.importantFacts.length >= 1, true);
});

test("full journey: permission request does not claim completion and leaves a decision receipt", async () => {
  clearAuditEntries();
  const { executeRequest } = await import("../src/core/executionController.js");

  const result = await executeRequest({ input: "Open Chrome." });
  assert.equal(result.handled, true);
  assert.equal(result.status, "permission_required");
  assert.equal(result.verified, false);

  const audit = listAuditEntries(50);
  assert.equal(audit.some((entry) => entry.action === "authorization.decision"), true);
});

test("full journey: verified workflow execution stores a pattern memory and one execution receipt", async () => {
  const events = [];
  const stop = HEY.events.subscribe("execution.request.completed", (event) => events.push(event));

  const result = await HEY.execution.request(
    { input: "open https://example.com" },
    { executeTool: async () => ({ success: true, result: { verified: true, url: "https://example.com" } }) },
  );
  assert.equal(result.success, true);
  assert.equal(result.verified, true);
  assert.equal(result.memory.type, "pattern");
  assert.equal(events.length, 1);

  const audit = listAuditEntries(20);
  assert.equal(audit.some((entry) => entry.action === "execution.request"), true);
  stop();
});

test("full journey: memory inbox rejects without persisting anything", () => {
  const queued = HEY.remember("This one will not be kept.");
  assert.equal(queued.pending, true);

  const rejected = HEY.memoryInbox.reject(queued.id);
  assert.equal(rejected.success, true);
  assert.equal(listInbox().length, 0);

  const audit = listAuditEntries(20);
  assert.equal(audit.some((entry) => entry.action === "memory.rejected"), true);
});

test("full journey: device fabric negotiates identity and pair codes without inventing remote reach", async () => {
  const id = HEY.fabric.deviceId();
  assert.equal(typeof id, "string");
  assert.equal(id.length > 0, true);
  assert.equal(typeof HEY.fabric.deviceName(), "string");

  const pair = HEY.fabric.pairCode();
  assert.match(pair, /^[2-9A-HJ-NP-Z]{6}$/);

  const handoff = HEY.fabric.handoff({ note: "Continue here." });
  assert.equal(typeof handoff.success, "boolean", "handoff must report honestly whether the runtime can broadcast");
  assert.equal(Array.isArray(HEY.fabric.peers()), true);
});