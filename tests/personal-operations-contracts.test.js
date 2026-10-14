import assert from "node:assert/strict";
import test from "node:test";

test("task dependencies require existing tasks and reject transitive cycles without mutation", async () => {
  const stored = new Map();
  globalThis.localStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  };
  const { tasksCalendarEngine } = await import("../src/core/tasksCalendarEngine.js");
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const first = tasksCalendarEngine.createTask({ title: `Operations test first ${suffix}` });
  const second = tasksCalendarEngine.createTask({ title: `Operations test second ${suffix}` });
  const third = tasksCalendarEngine.createTask({ title: `Operations test third ${suffix}` });

  assert.equal(tasksCalendarEngine.addDependency(first.id, second.id).id, first.id);
  assert.equal(tasksCalendarEngine.addDependency(second.id, third.id).id, second.id);

  first.dependencies.push(third.id);
  assert.deepEqual(tasksCalendarEngine.getTask(first.id).dependencies, [second.id]);

  const cycle = tasksCalendarEngine.addDependency(third.id, first.id);
  assert.equal(cycle.code, "DEPENDENCY_CYCLE");
  assert.deepEqual(tasksCalendarEngine.getTask(third.id).dependencies, []);

  const updateCycle = tasksCalendarEngine.updateTask(third.id, { dependencies: [first.id] });
  assert.equal(updateCycle.code, "DEPENDENCY_CYCLE");
  assert.deepEqual(tasksCalendarEngine.getTask(third.id).dependencies, []);

  const missing = tasksCalendarEngine.addDependency(third.id, `missing_${suffix}`);
  assert.equal(missing.code, "DEPENDENCY_NOT_FOUND");
  assert.deepEqual(tasksCalendarEngine.getTask(third.id).dependencies, []);
});
