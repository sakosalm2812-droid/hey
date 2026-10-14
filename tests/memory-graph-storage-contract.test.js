import test from "node:test";
import assert from "node:assert/strict";
import { MemoryGraphService } from "../src/core/memoryGraphService.js";

class Query {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.filters = [];
    this.action = "select";
  }
  select() { return this; }
  eq(key, value) { this.filters.push((row) => row[key] === value); return this; }
  ilike(key, pattern) {
    const needle = pattern.slice(1, -1).replaceAll("%", "").toLowerCase();
    this.filters.push((row) => String(row[key] || "").toLowerCase().includes(needle));
    return this;
  }
  order() { return this; }
  range() { return this; }
  limit() { return this; }
  or(expression) {
    const [, left, right] = expression.match(/from_node\.eq\.([^,]+),to_node\.eq\.(.+)/) || [];
    this.filters.push((row) => row.from_node === left || row.to_node === right || row.from_node === right || row.to_node === left);
    return this;
  }
  upsert(value) { this.action = "upsert"; this.value = value; return this; }
  delete() { this.action = "delete"; return this; }
  single() { return Promise.resolve(this.execute(true)); }
  maybeSingle() { return Promise.resolve(this.execute(true)); }
  then(resolve, reject) { return Promise.resolve(this.execute()).then(resolve, reject); }
  execute(single = false) {
    const rows = this.client.tables[this.table];
    const matches = () => rows.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.action === "delete") {
      const removed = matches();
      this.client.tables[this.table] = rows.filter((row) => !removed.includes(row));
      return { data: null, error: null };
    }
    if (this.action === "upsert") {
      const values = Array.isArray(this.value) ? this.value : [this.value];
      const saved = values.map((value) => {
        const keyField = this.table === "hey_memory_nodes" ? "node_key" : "from_node";
        const existing = rows.find((row) => row.user_id === value.user_id && row[keyField] === value[keyField] && (this.table !== "hey_memory_edges" || (row.to_node === value.to_node && row.relation === value.relation)));
        if (existing) Object.assign(existing, value);
        else rows.push({ id: `row-${++this.client.sequence}`, created_at: new Date().toISOString(), ...value });
        return existing || rows.at(-1);
      });
      return { data: single ? saved[0] : saved, error: null };
    }
    const selected = matches();
    return { data: single ? selected[0] || null : selected, error: null };
  }
}

function fakeClient() {
  const client = { tables: { hey_memory_nodes: [], hey_memory_edges: [] }, sequence: 0 };
  client.from = (table) => new Query(client, table);
  return client;
}

test("memory graph storage keeps app node keys separate from database row UUIDs", async () => {
  const service = new MemoryGraphService(fakeClient());
  const first = await service.upsertMemoryNode("user-a", { id: "mem-a", value: "first fact" });
  const second = await service.upsertMemoryNode("user-a", { id: "mem-b", value: "second fact" });

  assert.equal(first.id, "mem-a");
  assert.equal(first.rowId, "row-1");
  const reread = await service.getMemoryNode("user-a", "mem-a");
  assert.equal(reread.rowId, first.rowId);
  const updated = await service.upsertMemoryNode("user-a", { ...reread, value: "updated fact" });
  assert.equal(updated.id, "mem-a");
  assert.equal((await service.getMemoryNodes("user-a")).length, 2, "updating a node must not create a UUID-keyed duplicate");

  const edge = await service.upsertMemoryEdge("user-a", { fromNode: "mem-a", toNode: "mem-b" });
  assert.equal(edge.from_node, first.rowId);
  assert.equal(edge.to_node, second.rowId);
  assert.equal((await service.getMemoryEdges("user-a", "mem-a")).length, 1);
  const graph = await service.getMemoryGraph("user-a");
  assert.deepEqual(graph.nodes.map((node) => [node.id, node.rowId]), [["mem-a", first.rowId], ["mem-b", second.rowId]]);
  assert.deepEqual((await service.getMemoryNeighborhood("user-a", "mem-a", 1)).map((node) => node.id).sort(), ["mem-a", "mem-b"], JSON.stringify(graph));

  await service.deleteMemoryNode("user-a", "mem-a");
  assert.equal(await service.getMemoryNode("user-a", "mem-a"), null);
  assert.equal((await service.getMemoryNodes("user-a")).length, 1);
});

test("memory graph edge storage rejects absent or cross-account endpoints", async () => {
  const service = new MemoryGraphService(fakeClient());
  await service.upsertMemoryNode("user-a", { id: "owned", value: "owned" });
  await assert.rejects(service.upsertMemoryEdge("user-a", { fromNode: "owned", toNode: "foreign" }), /Both memory graph endpoints/);
  assert.deepEqual(await service.getMemoryEdges("user-b", "owned"), []);
});
