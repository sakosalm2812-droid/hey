import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runSpaRouteSmoke } from "../scripts/spa-route-smoke.mjs";

const ENTRY_ASSET = "/assets/index-test123.js";
const SHELL = `<!doctype html><html><head><title>HEY — Your Second Brain</title></head><body><div id="root"></div><script type="module" src="${ENTRY_ASSET}"></script></body></html>`;
let viteCliAvailable = false;
try { viteCliAvailable = existsSync(path.join(path.dirname(createRequire(import.meta.url).resolve("vite/package.json")), "bin", "vite.js")); }
catch { /* The real preview subprocess test skips when dependencies are absent. */ }

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "hey-spa-smoke-test-"));
  const distDirectory = path.join(root, "dist");
  await mkdir(distDirectory);
  await writeFile(path.join(distDirectory, "index.html"), SHELL);
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, distDirectory };
}

function fakePreview({ waitError, onStop = () => {} } = {}) {
  return async () => ({
    async waitUntilReady() { if (waitError) throw waitError; },
    async stop() { onStop(); },
  });
}

function responses({ routeStatus = 200, shell = SHELL, assetStatus = 200, assetType = "text/javascript" } = {}) {
  return async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === ENTRY_ASSET) return new Response("export{};", { status: assetStatus, headers: { "content-type": assetType } });
    return new Response(shell, { status: routeStatus, headers: { "content-type": "text/html; charset=utf-8" } });
  };
}

test("SPA smoke verifies both routes and the built JavaScript entry asset, then stops the preview server", async (t) => {
  const files = await fixture(t);
  let stopped = false;
  const result = await runSpaRouteSmoke({
    ...files,
    port: 51231,
    startPreviewServer: fakePreview({ onStop: () => { stopped = true; } }),
    fetchImpl: responses(),
  });
  assert.equal(result.status, "passed");
  assert.equal(result.scope, "frontend_route_delivery_only");
  assert.deepEqual(result.routes, ["/login", "/download"]);
  assert.equal(result.entryAsset, ENTRY_ASSET);
  assert.equal(stopped, true);
});

for (const [name, responseOptions, expectedCode] of [
  ["route status", { routeStatus: 503 }, "spa_route_http_status"],
  ["route content", { shell: "<html><body>generic error</body></html>" }, "spa_route_shell_invalid"],
  ["entry asset status", { assetStatus: 404 }, "spa_entry_asset_http_status"],
  ["entry asset content type", { assetType: "text/html" }, "spa_entry_asset_content_type_invalid"],
]) {
  test(`SPA smoke rejects invalid ${name} and still stops the preview server`, async (t) => {
    const files = await fixture(t);
    let stopped = false;
    await assert.rejects(
      runSpaRouteSmoke({
        ...files,
        port: 51232,
        startPreviewServer: fakePreview({ onStop: () => { stopped = true; } }),
        fetchImpl: responses(responseOptions),
      }),
      (error) => error.code === expectedCode,
    );
    assert.equal(stopped, true);
  });
}

test("SPA smoke stops a preview process when bounded readiness fails", async (t) => {
  const files = await fixture(t);
  let stopped = false;
  await assert.rejects(runSpaRouteSmoke({
    ...files,
    readinessTimeoutMs: 15,
    startPreviewServer: fakePreview({ waitError: Object.assign(new Error("timeout"), { code: "preview_readiness_timeout" }), onStop: () => { stopped = true; } }),
  }), (error) => error.code === "preview_readiness_timeout");
  assert.equal(stopped, true);
});

test("SPA smoke stops its preview process on a port-conflict failure", async (t) => {
  const files = await fixture(t);
  let stopped = false;
  await assert.rejects(runSpaRouteSmoke({
    ...files,
    startPreviewServer: fakePreview({ waitError: Object.assign(new Error("port in use"), { code: "preview_port_conflict" }), onStop: () => { stopped = true; } }),
  }), (error) => error.code === "preview_port_conflict");
  assert.equal(stopped, true);
});

test("strict preview port conflict exits and releases the child process", { skip: !viteCliAvailable && "Vite CLI is not installed in this worktree" }, async (t) => {
  const files = await fixture(t);
  const blocker = createServer((_request, response) => {
    response.writeHead(503, { "content-type": "text/plain" });
    response.end("port intentionally occupied");
  });
  await new Promise((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(0, "127.0.0.1", resolve);
  });
  const { port } = blocker.address();
  try {
    await assert.rejects(
      runSpaRouteSmoke({ ...files, port, readinessTimeoutMs: 2_000 }),
      (error) => ["preview_port_conflict", "preview_server_exited"].includes(error.code),
    );
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
  }
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve) => probe.close(resolve));
});

test("SPA smoke refuses to start without a built entry point and validates timeouts and ports", async (t) => {
  const files = await fixture(t);
  let starts = 0;
  const startPreviewServer = async () => { starts += 1; return fakePreview()(); };
  await assert.rejects(runSpaRouteSmoke({ ...files, distDirectory: path.join(files.root, "missing"), startPreviewServer }), (error) => error.code === "built_spa_missing");
  await assert.rejects(runSpaRouteSmoke({ ...files, port: 0, startPreviewServer }), (error) => error.code === "invalid_preview_port");
  await assert.rejects(runSpaRouteSmoke({ ...files, readinessTimeoutMs: 0, startPreviewServer }), (error) => error.code === "invalid_readiness_timeout");
  assert.equal(starts, 0);
});
