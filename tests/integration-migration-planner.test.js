import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import { INTEGRATION_MIGRATION_DISPOSITIONS, planIntegrationMigration } from "../src/core/integrationMigrationPlanner.js";
import core, { HEY } from "../src/core/index.js";

globalThis.crypto ??= webcrypto;

const emptyInventory = () => ({ repository: [], packages: [], contracts: [], migrations: [], manifests: [], dependencies: [] });

test("planner emits stable dispositions, preserves stronger existing behavior, and reports name collisions", async () => {
  assert.equal(core.integrationMigration.plan, planIntegrationMigration);
  assert.equal(HEY.integrationMigration.plan, planIntegrationMigration);
  const inventory = emptyInventory();
  inventory.repository.push(
    { id: "existing-auth", kind: "service", name: "auth", stronger: true },
    { id: "existing-search", kind: "service", name: "search", contractId: "contract-v1" },
    { id: "existing-obsolete", kind: "service", name: "obsolete" },
  );
  inventory.packages.push(
    { id: "new-auth", kind: "service", name: "auth", disposition: "Replace" },
    { id: "new-search", kind: "service", name: "search", contractId: "contract-v2", disposition: "Migrate" },
    { id: "new-unknown", kind: "service", name: "unclear" },
  );
  const result = await planIntegrationMigration({ inventory });
  assert.deepEqual(result.dispositions.map(({ id, disposition }) => [id, disposition]), [
    ["existing-auth", "Preserve"], ["existing-obsolete", "Preserve"],
    ["new-auth", "Preserve"], ["new-search", "Migrate"], ["new-unknown", "Unknown"],
  ]);
  assert.equal(result.collisions.length, 2);
  assert.equal(result.collisions[0].name, "auth");
  assert.equal(result.collisions[1].name, "search");
  assert.deepEqual(INTEGRATION_MIGRATION_DISPOSITIONS, ["Preserve", "Replace", "Migrate", "Consolidate", "Retire", "Unknown"]);
  assert.equal(result.mode, "dry_run");
});

test("contract identity, fingerprints, explicit dispositions, and new declared contracts produce bounded decisions", async () => {
  const inventory = emptyInventory();
  inventory.contracts.push({ id: "contract-known", kind: "api", name: "Public API" });
  inventory.repository.push(
    { id: "same-contract", kind: "service", name: "same", contractId: "contract-known" },
    { id: "same-content", kind: "service", name: "content", fingerprint: "sha256:abc" },
  );
  inventory.packages.push(
    { id: "candidate-same", kind: "service", name: "same", contractId: "contract-known" },
    { id: "candidate-content", kind: "service", name: "content", fingerprint: "sha256:abc" },
    { id: "candidate-new", kind: "route", name: "new-route", contractId: "contract-known" },
    { id: "candidate-consolidate", kind: "schema", name: "schemas", disposition: "Consolidate" },
    { id: "candidate-retire", kind: "legacy", name: "old", disposition: "Retire" },
  );
  const result = await planIntegrationMigration({ inventory });
  const choices = Object.fromEntries(result.dispositions.map(({ id, disposition }) => [id, disposition]));
  assert.equal(choices["candidate-same"], "Preserve");
  assert.equal(choices["candidate-content"], "Preserve");
  assert.equal(choices["candidate-new"], "Migrate");
  assert.equal(choices["candidate-consolidate"], "Consolidate");
  assert.equal(choices["candidate-retire"], "Retire");
});

test("explicit decisions cannot contradict contract or fingerprint evidence", async () => {
  const inventory = emptyInventory();
  inventory.repository.push(
    { id: "existing-contract", kind: "service", name: "contracted", contractId: "contract-v1" },
    { id: "existing-source", kind: "service", name: "source", fingerprint: "sha256:old" },
  );
  inventory.packages.push(
    { id: "candidate-preserve", kind: "service", name: "contracted", contractId: "contract-v2", disposition: "Preserve" },
    { id: "candidate-replace", kind: "service", name: "source", fingerprint: "sha256:new", disposition: "Replace" },
  );
  const plan = await planIntegrationMigration({ inventory });
  const decisions = Object.fromEntries(plan.dispositions.map(({ id, disposition }) => [id, disposition]));
  assert.equal(decisions["candidate-preserve"], "Migrate");
  assert.equal(decisions["candidate-replace"], "Unknown");
});

test("a requested replacement cannot override a stronger or ambiguous existing implementation", async () => {
  const inventory = emptyInventory();
  inventory.repository.push(
    { id: "stronger-one", kind: "service", name: "identity", stronger: true },
    { id: "duplicate-two", kind: "service", name: "identity" },
  );
  inventory.packages.push({ id: "replacement", kind: "service", name: "identity", disposition: "Replace" });
  const result = await planIntegrationMigration({ inventory });
  const candidate = result.dispositions.find(({ id }) => id === "replacement");
  assert.equal(candidate.disposition, "Preserve");
  assert.equal(candidate.reason, "existing_strength_marked_for_preservation");
  assert.ok(result.collisions.some((collision) => collision.duplicateName === true));
});

test("dependency order is deterministic and migration-name collisions are explicit", async () => {
  const inventory = emptyInventory();
  inventory.repository.push({ id: "db", kind: "schema", name: "accounts" });
  inventory.packages.push({ id: "api", kind: "service", name: "account-api", dependsOn: ["db"] });
  inventory.manifests.push({ id: "web", kind: "manifest", name: "web-app", dependsOn: ["api"] });
  inventory.migrations.push({ id: "migration-a", name: "2026101501_accounts" }, { id: "migration-b", name: "2026101501_accounts" });
  const result = await planIntegrationMigration({ inventory });
  assert.deepEqual(result.dependencyOrder, ["db", "api", "migration-a", "migration-b", "web"]);
  assert.deepEqual(result.migrationNameCollisions, [{ name: "2026101501_accounts", ids: ["migration-a", "migration-b"] }]);

  inventory.packages[0].dependsOn = ["missing"];
  inventory.manifests[0].dependsOn = ["api"];
  const missing = await planIntegrationMigration({ inventory });
  assert.ok(missing.dependencyProblems.some((problem) => problem.reason === "missing_dependency"));
});

test("dependency cycles are distinguished from downstream blocked nodes", async () => {
  const inventory = emptyInventory();
  inventory.repository.push(
    { id: "cycle-a", kind: "service", name: "cycle-a", dependsOn: ["cycle-b"] },
    { id: "cycle-b", kind: "service", name: "cycle-b", dependsOn: ["cycle-a"] },
    { id: "downstream", kind: "service", name: "downstream", dependsOn: ["cycle-a"] },
  );
  const result = await planIntegrationMigration({ inventory });
  assert.deepEqual(result.dependencyProblems, [
    { itemId: "cycle-a", reason: "dependency_cycle" },
    { itemId: "cycle-b", reason: "dependency_cycle" },
    { itemId: "downstream", reason: "blocked_by_dependency_cycle" },
  ]);
});

test("dirty or untracked repository state requires preservation and never triggers writes", async () => {
  const inventory = emptyInventory();
  inventory.repositoryState = { dirty: true, untracked: true };
  const before = structuredClone(inventory);
  const result = await planIntegrationMigration({ inventory });
  assert.deepEqual(result.repositoryState, { dirty: true, untracked: true, preservationRequired: true, stateKnown: true });
  assert.deepEqual(inventory, before);
  assert.equal(result.mode, "dry_run");
  const unknown = await planIntegrationMigration({ inventory: emptyInventory() });
  assert.equal(unknown.repositoryState.stateKnown, false);
  assert.equal(unknown.repositoryState.preservationRequired, false);
});

test("source fingerprint is stable across object-key order and invalidates when inventory changes", async () => {
  const first = { repository: [{ id: "a", kind: "service", name: "one", details: { z: 1, a: 2 } }] };
  const reordered = { repository: [{ details: { a: 2, z: 1 }, name: "one", kind: "service", id: "a" }] };
  const changed = { repository: [{ id: "a", kind: "service", name: "one", details: { a: 2, z: 3 } }] };
  const a = await planIntegrationMigration({ inventory: first });
  const b = await planIntegrationMigration({ inventory: reordered });
  const c = await planIntegrationMigration({ inventory: changed });
  assert.equal(a.sourceFingerprint, b.sourceFingerprint);
  assert.notEqual(a.sourceFingerprint, c.sourceFingerprint);
  assert.match(a.sourceFingerprint, /^sha256:[a-f0-9]{64}$/);
});

test("returned plan avoids echoing credential-like names and inventory contents", async () => {
  const inventory = emptyInventory();
  inventory.repository.push({ id: "ghp_abcdefghijklmnopqrstuvwxyz123456", kind: "service", name: "api_key=secret-value" });
  inventory.packages.push({ id: "candidate", kind: "service", name: "api_key=secret-value", disposition: "Replace" });
  const result = await planIntegrationMigration({ inventory });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /ghp_abcdefghijklmnopqrstuvwxyz123456|secret-value/);
  assert.match(serialized, /\[redacted\]/);

  inventory.packages.push({ id: "api key=internal-credential-value", kind: "service", name: "api key: internal-credential-value" });
  const redactedLabels = await planIntegrationMigration({ inventory });
  assert.doesNotMatch(JSON.stringify(redactedLabels), /internal-credential-value/);
});

test("malformed, accessor-bearing, sparse, cyclic, and invalid-disposition inventories fail closed", async () => {
  await assert.rejects(() => planIntegrationMigration({ inventory: null }), /plain object/);
  await assert.rejects(() => planIntegrationMigration({ inventory: { repository: "not-an-array" } }), /must be an array/);
  const accessor = { id: "x", kind: "service", name: "x" };
  Object.defineProperty(accessor, "name", { enumerable: true, get() { throw new Error("must not execute"); } });
  await assert.rejects(() => planIntegrationMigration({ inventory: { repository: [accessor] } }), /accessors/);
  const sparse = new Array(1);
  await assert.rejects(() => planIntegrationMigration({ inventory: { packages: sparse } }), /sparse/);
  const accessorArray = [];
  Object.defineProperty(accessorArray, "0", { enumerable: true, get() { throw new Error("must not execute"); } });
  accessorArray.length = 1;
  await assert.rejects(() => planIntegrationMigration({ inventory: { packages: accessorArray } }), /accessors/);
  const cyclic = emptyInventory();
  cyclic.contracts.push({ id: "cycle", kind: "contract", name: "cycle", self: cyclic });
  await assert.rejects(() => planIntegrationMigration({ inventory: cyclic }), /cycles/);
  await assert.rejects(() => planIntegrationMigration({ inventory: { packages: [{ id: "x", kind: "service", name: "x", disposition: "Delete" }] } }), /unsupported/);
  await assert.rejects(() => planIntegrationMigration({ inventory: { repositoryState: { dirty: "true" } } }), /must be booleans/);
  const excessiveEdges = emptyInventory();
  excessiveEdges.packages = Array.from({ length: 6 }, (_, index) => ({
    id: `edge-source-${index}`,
    kind: "service",
    name: `edge-source-${index}`,
    dependsOn: Array.from({ length: 17_000 }, (_, depIndex) => `missing-${depIndex}`),
  }));
  await assert.rejects(() => planIntegrationMigration({ inventory: excessiveEdges }), /maximum edge count/);
});

test("large dependency cycles use bounded iterative graph analysis", async () => {
  const inventory = emptyInventory();
  const count = 3_000;
  inventory.repository = Array.from({ length: count + 1 }, (_, index) => ({
    id: `node-${String(index).padStart(4, "0")}`,
    kind: "service",
    name: `node-${index}`,
    dependsOn: [index === count ? "node-0000" : `node-${String(index + 1).padStart(4, "0")}`],
  }));
  inventory.repository[count].dependsOn = ["node-0000"];
  const result = await planIntegrationMigration({ inventory });
  assert.equal(result.dependencyOrder.length, 0);
  assert.equal(result.dependencyProblems.length, count + 1);
  assert.ok(result.dependencyProblems.every(({ reason }) => reason === "dependency_cycle"));
});
