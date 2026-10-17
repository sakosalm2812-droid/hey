import assert from "node:assert/strict";
import test from "node:test";
import { snapshotDynamicIslandInteraction } from "../src/lib/dynamicIslandInteraction.js";
import { DynamicIslandEngine, ISLAND_STATES } from "../src/core/dynamicIsland.js";

test("interaction snapshots accept only bounded inert click data", () => {
  const value = { type: "click", target: "background" };
  const snapshot = snapshotDynamicIslandInteraction(value);
  assert.deepEqual(snapshot, { type: "click", target: "background" });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.notEqual(snapshot, value);
  assert.deepEqual(snapshotDynamicIslandInteraction({ type: "click" }), { type: "click" });
});

test("hostile accessors, proxies, inherited data, and unsupported interactions fail closed", () => {
  let getterCalls = 0;
  const accessor = { target: "background" };
  Object.defineProperty(accessor, "type", { enumerable: true, get() { getterCalls += 1; return "click"; } });
  const hostileProxy = new Proxy({ type: "click" }, { ownKeys() { throw new Error("hostile keys"); } });

  for (const value of [
    accessor,
    hostileProxy,
    Object.create({ type: "click" }),
    { type: "dispatch", target: "button" },
    { type: "click", target: "action" },
    { type: "click", unexpected: true },
    [],
    null,
    "click",
  ]) assert.equal(snapshotDynamicIslandInteraction(value), null);

  assert.equal(getterCalls, 0);
});

test("Dynamic Island does not mutate or publish invalid interaction objects", () => {
  const engine = new DynamicIslandEngine();
  const island = engine.createIsland({ autoHide: false });
  const events = [];
  const unsubscribe = engine.subscribe((event) => events.push(event));
  let getterCalls = 0;
  const hostile = {};
  Object.defineProperty(hostile, "type", { get() { getterCalls += 1; return "click"; } });

  assert.deepEqual(engine.handleInteraction(island.id, hostile), { error: "Invalid interaction" });
  assert.equal(island.state, ISLAND_STATES.COMPACT);
  assert.equal(island.lastInteraction, null);
  assert.deepEqual(events, []);
  assert.equal(getterCalls, 0);

  assert.deepEqual(engine.handleInteraction(island.id, { type: "click" }), { success: true });
  assert.equal(island.state, ISLAND_STATES.EXPANDED);
  assert.deepEqual(events, ["state_changed"]);
  assert.deepEqual(engine.handleInteraction(island.id, { type: "click", target: "background" }), { success: true });
  assert.equal(island.state, ISLAND_STATES.COMPACT);

  unsubscribe();
  engine.destroyIsland(island.id);
});
