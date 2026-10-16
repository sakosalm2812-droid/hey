import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROUTES = ["/login", "/download"];
const MAX_WAIT_MS = 60_000;
const REQUEST_TIMEOUT_MS = 3_000;

function smokeError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function entryAssetFromHtml(html) {
  if (!/<div\b[^>]*\bid=["']root["']/i.test(html) || !/<title>[^<]*HEY[^<]*<\/title>/i.test(html)) {
    throw smokeError("built_spa_shell_invalid");
  }
  const match = html.match(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/i);
  if (!match || !match[1].startsWith("/assets/") || match[1].includes("..")) {
    throw smokeError("built_spa_entry_asset_missing");
  }
  return match[1];
}

async function verifyResponse(response, expectedStatus, code) {
  if (response.status !== expectedStatus) throw smokeError(code, `${code}: expected ${expectedStatus}, received ${response.status}`);
}

async function verifySpaHttp(baseUrl, expectedEntryAsset, fetchImpl = fetch) {
  for (const route of ROUTES) {
    let response;
    try {
      response = await fetchImpl(new URL(route, baseUrl), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      throw smokeError("spa_route_request_failed", `${route} request failed`);
    }
    await verifyResponse(response, 200, "spa_route_http_status");
    if (!/text\/html/i.test(response.headers.get("content-type") || "")) throw smokeError("spa_route_content_type_invalid");
    const html = await response.text();
    if (!/<div\b[^>]*\bid=["']root["']/i.test(html) || !/<title>[^<]*HEY[^<]*<\/title>/i.test(html)) {
      throw smokeError("spa_route_shell_invalid", `${route} did not serve the HEY application shell`);
    }
    if (entryAssetFromHtml(html) !== expectedEntryAsset) throw smokeError("spa_route_entry_mismatch");
  }

  let assetResponse;
  try {
    assetResponse = await fetchImpl(new URL(expectedEntryAsset, baseUrl), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw smokeError("spa_entry_asset_request_failed");
  }
  await verifyResponse(assetResponse, 200, "spa_entry_asset_http_status");
  if (!/(?:javascript|ecmascript)/i.test(assetResponse.headers.get("content-type") || "")) {
    throw smokeError("spa_entry_asset_content_type_invalid");
  }
  if (!(await assetResponse.text()).trim()) throw smokeError("spa_entry_asset_empty");
}

function createPreviewServer({ port, root, fetchImpl, readinessTimeoutMs }) {
  let viteCli;
  try {
    const vitePackageJson = createRequire(import.meta.url).resolve("vite/package.json");
    viteCli = path.join(path.dirname(vitePackageJson), "bin", "vite.js");
  } catch {
    throw smokeError("vite_cli_unavailable");
  }
  const child = spawn(process.execPath, [viteCli, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: root,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  let spawnError = null;
  let stderr = "";
  child.once("error", (error) => { spawnError = error; });
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk.toString()}`.slice(-4096); });

  async function stop() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    const stopped = await Promise.race([exited.then(() => true), delay(2_000).then(() => false)]);
    if (stopped) return;
    child.kill("SIGKILL");
    const killed = await Promise.race([exited.then(() => true), delay(1_000).then(() => false)]);
    if (!killed) throw smokeError("preview_process_cleanup_failed");
  }

  async function waitUntilReady(baseUrl) {
    const deadline = Date.now() + readinessTimeoutMs;
    while (Date.now() < deadline) {
      if (spawnError) throw smokeError("preview_process_start_failed", spawnError.message);
      if (child.exitCode !== null || child.signalCode !== null) {
        const portConflict = /port .* in use|eaddrinuse/i.test(stderr);
        throw smokeError(portConflict ? "preview_port_conflict" : "preview_server_exited", `Preview exited (${child.exitCode ?? child.signalCode}). ${stderr.trim()}`);
      }
      let response;
      try {
        response = await fetchImpl(new URL("/", baseUrl), { signal: AbortSignal.timeout(Math.min(500, REQUEST_TIMEOUT_MS)) });
      } catch { /* Retry until the bounded readiness deadline. */ }
      if (response?.status === 200) return;
      if (response?.status === 503) throw smokeError("preview_port_conflict");
      await delay(100);
    }
    throw smokeError("preview_readiness_timeout");
  }

  return { waitUntilReady, stop };
}

/** Smoke-test only static SPA route and entry-bundle delivery from an already-built dist directory. */
export async function runSpaRouteSmoke({
  root = process.cwd(),
  distDirectory = path.resolve(root, "dist"),
  port = 4173,
  readinessTimeoutMs = 12_000,
  fetchImpl = fetch,
  startPreviewServer = createPreviewServer,
} = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw smokeError("invalid_preview_port");
  if (!Number.isInteger(readinessTimeoutMs) || readinessTimeoutMs < 1 || readinessTimeoutMs > MAX_WAIT_MS) {
    throw smokeError("invalid_readiness_timeout");
  }
  let builtHtml;
  try {
    builtHtml = await readFile(path.join(distDirectory, "index.html"), "utf8");
  } catch {
    throw smokeError("built_spa_missing", "Build the app before running the SPA route smoke.");
  }
  const entryAsset = entryAssetFromHtml(builtHtml);
  const baseUrl = `http://127.0.0.1:${port}/`;
  let server;
  try {
    server = await startPreviewServer({ port, root, fetchImpl, readinessTimeoutMs });
    await server.waitUntilReady(baseUrl);
    await verifySpaHttp(baseUrl, entryAsset, fetchImpl);
    return {
      status: "passed",
      scope: "frontend_route_delivery_only",
      origin: baseUrl,
      routes: [...ROUTES],
      entryAsset,
    };
  } finally {
    if (server) await server.stop();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(await runSpaRouteSmoke(), null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: "failed", scope: "frontend_route_delivery_only", reason: error.code || "spa_smoke_failed" }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
