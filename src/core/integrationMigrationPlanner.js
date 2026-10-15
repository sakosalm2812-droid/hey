const DISPOSITIONS = new Set(["Preserve", "Replace", "Migrate", "Consolidate", "Retire", "Unknown"]);
const SECTIONS = ["repository", "packages", "contracts", "migrations", "manifests", "dependencies"];
const MAX_ITEMS = 20_000;
const MAX_DEPTH = 32;
const MAX_STRING = 8_192;
const MAX_NODES = 250_000;
const MAX_DEPENDENCY_EDGES = 100_000;

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownDataRecord(value, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be a plain object.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !Object.hasOwn(descriptors[key], "value")) {
      throw new TypeError(`${label} cannot contain accessors or symbol keys.`);
    }
  }
  return value;
}

function canonicalize(value, depth = 0, seen = new WeakSet(), budget = { nodes: 0, properties: 0 }) {
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES) throw new TypeError("Inventory exceeds the maximum canonical node count.");
  if (depth > MAX_DEPTH) throw new TypeError("Inventory exceeds the maximum nesting depth.");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > MAX_STRING) throw new TypeError("Inventory string exceeds the maximum length.");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Inventory numbers must be finite.");
    return value;
  }
  if (typeof value !== "object") throw new TypeError("Inventory must contain only JSON-compatible values.");
  if (seen.has(value)) throw new TypeError("Inventory cannot contain cycles.");
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > MAX_ITEMS) throw new TypeError("Inventory array exceeds the maximum item count.");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (key === "length") continue;
      if (typeof key !== "string" || !Object.hasOwn(descriptors[key], "value")) throw new TypeError("Inventory arrays cannot contain accessors or symbol keys.");
    }
    budget.properties += value.length;
    if (budget.properties > MAX_NODES) throw new TypeError("Inventory exceeds the maximum property count.");
    const result = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(descriptors, index)) throw new TypeError("Inventory arrays cannot be sparse.");
      result.push(canonicalize(descriptors[index].value, depth + 1, seen, budget));
    }
    const extras = Reflect.ownKeys(value).filter((key) => key !== "length" && !(typeof key === "string" && /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length));
    if (extras.length) throw new TypeError("Inventory arrays cannot have extra properties.");
    seen.delete(value);
    return result;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !Object.hasOwn(descriptors[key], "value")) throw new TypeError("Inventory value cannot contain accessors or symbol keys.");
  }
  const objectKeys = Object.keys(descriptors);
  budget.properties += objectKeys.length;
  if (budget.properties > MAX_NODES) throw new TypeError("Inventory exceeds the maximum property count.");
  const result = {};
  for (const key of objectKeys.sort()) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") throw new TypeError("Inventory contains a prohibited property name.");
    Object.defineProperty(result, key, { value: canonicalize(descriptors[key].value, depth + 1, seen, budget), enumerable: true, configurable: true, writable: true });
  }
  seen.delete(value);
  return result;
}

function safeLabel(value) {
  // Labels are returned to humans, so do not echo credential-like values supplied by inventories.
  if (typeof value !== "string" || value.length > 160 || /(?:^|[^A-Za-z0-9])(?:sk|pk|secret|token|password|credential)[-_:=]/i.test(value) || /\b(?:api|access|refresh|client|private|service)[\s_-]*(?:key|token|secret|password|credential)\s*[:=]/i.test(value) || /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/.test(value)) return "[redacted]";
  return value.replace(/[\r\n\t]/g, " ").trim() || "[unnamed]";
}

function validateInventory(inventory) {
  // Canonicalize first: reject sparse arrays/accessors before validation reads any field.
  const canonical = canonicalize(inventory);
  if (!canonical || typeof canonical !== "object" || Array.isArray(canonical)) throw new TypeError("Integration inventory must be a plain object.");
  const normalized = {};
  let count = 0;
  let dependencyEdgeCount = 0;
  for (const section of SECTIONS) {
    const list = canonical[section] ?? [];
    if (!Array.isArray(list)) throw new TypeError(`Inventory ${section} must be an array.`);
    if (list.length > MAX_ITEMS - count) throw new TypeError("Inventory exceeds the maximum item count.");
    count += list.length;
    normalized[section] = list.map((item, index) => {
      ownDataRecord(item, `${section}[${index}]`);
      const id = item.id;
      const kind = item.kind ?? section;
      const name = item.name;
      if (typeof id !== "string" || !id.trim() || id.length > 160) throw new TypeError(`${section}[${index}].id must be a bounded non-empty string.`);
      if (typeof kind !== "string" || !kind.trim() || kind.length > 120) throw new TypeError(`${section}[${index}].kind must be a bounded non-empty string.`);
      if (typeof name !== "string" || !name.trim() || name.length > 512) throw new TypeError(`${section}[${index}].name must be a bounded non-empty string.`);
      if (item.dependsOn !== undefined && (!Array.isArray(item.dependsOn) || item.dependsOn.some((value) => typeof value !== "string" || !value.trim()))) {
        throw new TypeError(`${section}[${index}].dependsOn must contain non-empty IDs.`);
      }
      dependencyEdgeCount += item.dependsOn?.length || 0;
      if (dependencyEdgeCount > MAX_DEPENDENCY_EDGES) throw new TypeError("Inventory dependency graph exceeds the maximum edge count.");
      if (item.disposition !== undefined && !DISPOSITIONS.has(item.disposition)) throw new TypeError(`${section}[${index}].disposition is unsupported.`);
      return { ...item, id: id.trim(), kind: kind.trim(), name: name.trim(), section };
    });
  }
  const ids = new Set();
  for (const items of Object.values(normalized)) for (const item of items) {
    if (ids.has(item.id)) throw new TypeError("Inventory IDs must be globally unique.");
    ids.add(item.id);
  }
  return { normalized, canonical };
}

function stableSort(values, key) {
  return [...values].sort((left, right) => String(key(left)).localeCompare(String(key(right)), "en"));
}

function pushHeap(heap, value) {
  let index = heap.length;
  heap.push(value);
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].localeCompare(value, "en") <= 0) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = value;
}

function popHeap(heap) {
  const first = heap[0];
  const last = heap.pop();
  if (heap.length) {
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= heap.length) break;
      const right = left + 1;
      const child = right < heap.length && heap[right].localeCompare(heap[left], "en") < 0 ? right : left;
      if (heap[child].localeCompare(last, "en") >= 0) break;
      heap[index] = heap[child];
      index = child;
    }
    heap[index] = last;
  }
  return first;
}

function planRecords(sections) {
  const all = SECTIONS.flatMap((section) => sections[section]);
  const candidates = sections.packages;
  const repository = sections.repository;
  const contracts = sections.contracts;
  const byIdentity = new Map();
  for (const item of [...repository, ...candidates]) {
    const identity = `${item.kind.toLowerCase()}\u0000${item.name.toLowerCase()}`;
    const group = byIdentity.get(identity) || [];
    group.push(item);
    byIdentity.set(identity, group);
  }

  const collisions = [];
  for (const [identity, items] of byIdentity) {
    const existing = items.filter((item) => item.section === "repository");
    const proposed = items.filter((item) => item.section === "packages");
    if (existing.length && proposed.length) {
      collisions.push({ identity, existingIds: stableSort(existing, (item) => item.id).map((item) => item.id), proposedIds: stableSort(proposed, (item) => item.id).map((item) => item.id) });
    }
    if (existing.length > 1 || proposed.length > 1) {
      collisions.push({ identity, existingIds: stableSort(existing, (item) => item.id).map((item) => item.id), proposedIds: stableSort(proposed, (item) => item.id).map((item) => item.id), duplicateName: true });
    }
  }

  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));
  const dispositions = [];
  for (const candidate of candidates) {
    const identity = `${candidate.kind.toLowerCase()}\u0000${candidate.name.toLowerCase()}`;
    const matched = byIdentity.get(identity)?.filter((item) => item.section === "repository") || [];
    let disposition = "Unknown";
    let reason = "insufficient_compatibility_evidence";
    if (matched.some((item) => item.stronger === true || item.preserve === true)) {
      disposition = "Preserve";
      reason = "existing_strength_marked_for_preservation";
    } else if (matched.length > 1) {
      reason = "ambiguous_existing_name_collision";
    } else if (matched.length === 1 && matched[0].contractId && candidate.contractId) {
      disposition = matched[0].contractId === candidate.contractId ? "Preserve" : "Migrate";
      reason = matched[0].contractId === candidate.contractId ? "same_contract_identity" : "contract_identity_differs";
    } else if (matched.length === 1 && matched[0].fingerprint && candidate.fingerprint) {
      disposition = matched[0].fingerprint === candidate.fingerprint ? "Preserve" : "Unknown";
      reason = matched[0].fingerprint === candidate.fingerprint ? "same_source_fingerprint" : "source_differs_without_migration_evidence";
    } else if (candidate.disposition) {
      disposition = candidate.disposition;
      reason = "explicit_dry_run_disposition";
    } else if (matched.length === 0 && candidate.contractId && contractById.has(candidate.contractId)) {
      disposition = "Migrate";
      reason = "new_candidate_has_declared_contract";
    }
    dispositions.push({ id: safeLabel(candidate.id), kind: safeLabel(candidate.kind), name: safeLabel(candidate.name), disposition, reason });
  }

  // Existing-only behavior is always preserved until a separately verified retirement plan exists.
  for (const item of repository) {
    const identity = `${item.kind.toLowerCase()}\u0000${item.name.toLowerCase()}`;
    const matches = byIdentity.get(identity)?.filter((entry) => entry.section === "packages") || [];
    if (!matches.length || item.stronger === true || item.preserve === true) dispositions.push({ id: safeLabel(item.id), kind: safeLabel(item.kind), name: safeLabel(item.name), disposition: "Preserve", reason: matches.length ? "existing_strength_marked_for_preservation" : "existing_behavior_has_no_replacement_candidate" });
  }

  const dependencyGraph = buildDependencyOrder(all);
  const migrationNames = new Map();
  for (const migration of sections.migrations) {
    const normalizedName = migration.name.toLowerCase();
    migrationNames.set(normalizedName, [...(migrationNames.get(normalizedName) || []), migration]);
  }
  const migrationCollisions = [...migrationNames.entries()].filter(([, group]) => group.length > 1).map(([name, group]) => ({ name: safeLabel(name), ids: stableSort(group, (item) => item.id).map((item) => safeLabel(item.id)) }));

  return {
    dispositions: stableSort(dispositions, (entry) => entry.id),
    collisions: stableSort(collisions, (entry) => `${entry.identity}:${entry.duplicateName ? "duplicate" : "overlap"}`).map((entry) => ({
      kind: safeLabel(entry.identity.split("\u0000")[0]),
      name: safeLabel(entry.identity.split("\u0000")[1]),
      existingIds: entry.existingIds.map(safeLabel),
      proposedIds: entry.proposedIds.map(safeLabel),
      ...(entry.duplicateName ? { duplicateName: true } : {}),
    })),
    migrationNameCollisions: migrationCollisions,
    dependencyOrder: dependencyGraph.order.map(safeLabel),
    dependencyProblems: dependencyGraph.problems.map((problem) => ({ ...problem, itemId: safeLabel(problem.itemId), ...(problem.dependencyId ? { dependencyId: safeLabel(problem.dependencyId) } : {}) })),
  };
}

function buildDependencyOrder(items) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const indegree = new Map(items.map((item) => [item.id, 0]));
  const outgoing = new Map(items.map((item) => [item.id, []]));
  const reverse = new Map(items.map((item) => [item.id, []]));
  const problems = [];
  for (const item of items) for (const dependencyId of item.dependsOn || []) {
    if (!byId.has(dependencyId)) {
      problems.push({ itemId: item.id, dependencyId, reason: "missing_dependency" });
      continue;
    }
    indegree.set(item.id, indegree.get(item.id) + 1);
    outgoing.get(dependencyId).push(item.id);
    reverse.get(item.id).push(dependencyId);
  }
  const ready = [];
  for (const item of items) if (indegree.get(item.id) === 0) pushHeap(ready, item.id);
  const order = [];
  const ordered = new Set();
  while (ready.length > 0) {
    const id = popHeap(ready);
    order.push(id);
    ordered.add(id);
    for (const dependent of outgoing.get(id)) {
      indegree.set(dependent, indegree.get(dependent) - 1);
      if (indegree.get(dependent) === 0) pushHeap(ready, dependent);
    }
  }

  // Kosaraju's iterative SCC pass distinguishes actual cycle members from nodes
  // merely blocked downstream, without recursion or quadratic leftover scans.
  const visited = new Set();
  const finishOrder = [];
  for (const item of stableSort(items, (entry) => entry.id)) {
    if (visited.has(item.id)) continue;
    visited.add(item.id);
    const stack = [{ id: item.id, next: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const neighbors = outgoing.get(frame.id);
      if (frame.next < neighbors.length) {
        const neighbor = neighbors[frame.next];
        frame.next += 1;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push({ id: neighbor, next: 0 });
        }
      } else {
        finishOrder.push(frame.id);
        stack.pop();
      }
    }
  }
  const assigned = new Set();
  const cycleMembers = new Set();
  for (let index = finishOrder.length - 1; index >= 0; index -= 1) {
    const root = finishOrder[index];
    if (assigned.has(root)) continue;
    const component = [];
    const stack = [root];
    assigned.add(root);
    while (stack.length) {
      const id = stack.pop();
      component.push(id);
      for (const neighbor of reverse.get(id)) {
        if (!assigned.has(neighbor)) {
          assigned.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    if (component.length > 1 || outgoing.get(root).includes(root)) {
      for (const id of component) cycleMembers.add(id);
    }
  }
  for (const item of stableSort(items.filter((entry) => !ordered.has(entry.id)), (entry) => entry.id)) {
    problems.push({ itemId: item.id, reason: cycleMembers.has(item.id) ? "dependency_cycle" : "blocked_by_dependency_cycle" });
  }
  return { order, problems: stableSort(problems, (problem) => `${problem.itemId}:${problem.dependencyId || problem.reason}`) };
}

async function fingerprint(canonicalInventory) {
  if (!globalThis.crypto?.subtle) throw new Error("SHA-256 fingerprinting requires Web Crypto.");
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalInventory));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Produce a read-only integration/migration plan from caller supplied inventories.
 * The plan never mutates the repository, executes a migration, authorizes a replacement,
 * or makes disposition claims without explicit metadata/contract evidence.
 */
export async function planIntegrationMigration({ inventory } = {}) {
  const { normalized, canonical } = validateInventory(inventory);
  const plan = planRecords(normalized);
  const repositoryState = canonical.repositoryState;
  if (repositoryState !== undefined && !isPlainRecord(repositoryState)) throw new TypeError("Repository state must be a plain object.");
  const dirty = repositoryState?.dirty === true;
  const untracked = repositoryState?.untracked === true;
  const repositoryStatePresent = repositoryState !== undefined;
  if (repositoryStatePresent && ["dirty", "untracked"].some((key) => repositoryState[key] !== undefined && typeof repositoryState[key] !== "boolean")) {
    throw new TypeError("Repository dirty and untracked state flags must be booleans.");
  }
  return {
    schemaVersion: 1,
    mode: "dry_run",
    sourceFingerprint: await fingerprint(canonical),
    inventoryCounts: Object.fromEntries(SECTIONS.map((section) => [section, normalized[section].length])),
    repositoryState: {
      dirty,
      untracked,
      preservationRequired: dirty || untracked,
      stateKnown: repositoryStatePresent,
    },
    ...plan,
  };
}

export const INTEGRATION_MIGRATION_DISPOSITIONS = Object.freeze([...DISPOSITIONS]);
