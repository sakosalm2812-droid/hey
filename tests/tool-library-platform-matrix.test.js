import assert from "node:assert/strict";
import test from "node:test";
import { getToolLibraryPlatformMatrix, TOOL_LIBRARY_PLATFORMS } from "../src/lib/toolLibraryPlatformMatrix.js";

test("platform matrix reflects catalog states for all canonical platforms", () => {
  const catalogs = Object.fromEntries(TOOL_LIBRARY_PLATFORMS.map(({ id }) => [id, [
    { name: "demo.tool", status: id === "web" ? "supported" : id === "windows" ? "permission_required" : "unsupported" },
  ]]));
  assert.deepEqual(getToolLibraryPlatformMatrix(catalogs, "demo.tool").map(({ platform, status }) => [platform, status]), [
    ["web", "supported"], ["windows", "permission_required"], ["macos", "unsupported"],
    ["linux", "unsupported"], ["android", "unsupported"], ["ios", "unsupported"],
  ]);
});

test("missing, failed, malformed, and unknown catalog rows stay unknown", () => {
  const matrix = getToolLibraryPlatformMatrix({ web: null, windows: [{ name: "demo.tool", status: "invented" }] }, "demo.tool");
  assert.equal(matrix[0].status, "unknown");
  assert.equal(matrix[1].status, "unknown");
  assert.equal(matrix[2].status, "unknown");
});

test("hostile getters are not invoked and output remains bounded and immutable", () => {
  let getterCalls = 0;
  const row = {};
  Object.defineProperty(row, "name", { get() { getterCalls += 1; return "demo.tool"; } });
  const catalog = Array.from({ length: 600 }, () => ({ name: "other.tool", status: "supported" }));
  catalog[0] = row;
  catalog[511] = { name: "demo.tool", status: "restricted" };
  catalog[512] = { name: "demo.tool", status: "supported" };
  const matrix = getToolLibraryPlatformMatrix({ web: catalog }, "demo.tool");
  assert.equal(matrix[0].status, "restricted");
  assert.equal(getterCalls, 0);
  assert.equal(matrix.length, 6);
  assert.ok(Object.isFrozen(matrix));
  assert.ok(Object.isFrozen(matrix[0]));
});

test("malformed catalog proxies fail closed as unknown", () => {
  const revoked = Proxy.revocable([], {});
  revoked.revoke();
  assert.equal(getToolLibraryPlatformMatrix({ web: revoked.proxy }, "demo.tool")[0].status, "unknown");
});
