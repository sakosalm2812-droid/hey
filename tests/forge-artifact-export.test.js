import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { downloadForgeArtifactJson, prepareForgeArtifactJson } from "../src/lib/forgeArtifactExport.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

function validArtifact(overrides = {}) {
  return {
    title: "Lesson Plan / Q&A",
    summary: "A saved structured artifact.",
    files: [{ path: "docs/lesson.md", language: "markdown", content: "# Lesson\n\nReady to teach." }],
    validation: { valid: true },
    user_id: "must-not-export",
    providerApiKey: "must-not-export",
    ...overrides,
  };
}

test("structured export round-trips only the validated Forge artifact content", () => {
  const prepared = prepareForgeArtifactJson(validArtifact());
  assert.equal(prepared.filename, "lesson-plan-q-a.json");
  assert.equal(prepared.mimeType, "application/json;charset=utf-8");
  assert.deepEqual(JSON.parse(prepared.content), {
    format: "hey.forge.artifact.v1",
    title: "Lesson Plan / Q&A",
    summary: "A saved structured artifact.",
    files: [{ path: "docs/lesson.md", language: "markdown", content: "# Lesson\n\nReady to teach." }],
  });
  assert.doesNotMatch(prepared.content, /must-not-export|providerApiKey/);
});

test("structured export rejects invalid validation, unsafe paths, oversized files, and accessor-backed input", () => {
  assert.equal(prepareForgeArtifactJson(validArtifact({ validation: { valid: false } })), null);
  assert.equal(prepareForgeArtifactJson(validArtifact({ files: [{ path: "../../private.json", content: "{}" }] })), null);
  assert.equal(prepareForgeArtifactJson(validArtifact({ files: [
    { path: "data.json", content: "{}" },
    { path: "data.json", content: "different content" },
  ] })), null);
  assert.equal(prepareForgeArtifactJson(validArtifact({ files: [{ path: "data.json", content: "x".repeat(1_000_001) }] })), null);
  assert.equal(prepareForgeArtifactJson(validArtifact({ files: [{ path: "secrets.md", content: "api_key=private-value" }] })), null);

  let getterCalls = 0;
  const hostile = validArtifact();
  Object.defineProperty(hostile, "title", { enumerable: true, get() { getterCalls += 1; return "unsafe"; } });
  assert.equal(prepareForgeArtifactJson(hostile), null);
  assert.equal(getterCalls, 0);
  assert.equal(prepareForgeArtifactJson(new Proxy({}, { getPrototypeOf() { throw new Error("hostile artifact"); } })), null);
});

test("download dispatch keeps its object URL alive through the click and revokes it later", () => {
  const events = [];
  let revoke;
  let revokeDelay;
  let downloadName = "";
  const anchor = {
    click() { events.push("click"); },
    remove() { events.push("remove"); },
  };
  const result = downloadForgeArtifactJson(validArtifact(), {
    URL: {
      createObjectURL(blob) {
        assert.equal(blob.type, "application/json;charset=utf-8");
        events.push("create-url");
        return "blob:forge-export";
      },
      revokeObjectURL(url) { events.push(`revoke:${url}`); },
    },
    document: {
      body: { appendChild(node) { downloadName = node.download; events.push("append"); } },
      createElement(tag) { assert.equal(tag, "a"); events.push("create-anchor"); return anchor; },
    },
    setTimeout(callback, delay) { revoke = callback; revokeDelay = delay; events.push("schedule-revoke"); },
  });

  assert.deepEqual(result, { ok: true, filename: "lesson-plan-q-a.json" });
  assert.equal(downloadName, "lesson-plan-q-a.json");
  assert.deepEqual(events, ["create-url", "create-anchor", "append", "click", "remove", "schedule-revoke"]);
  assert.equal(revokeDelay, 1000);
  assert.equal(events.some((event) => event.startsWith("revoke:")), false);
  revoke();
  assert.equal(events.at(-1), "revoke:blob:forge-export");
});

test("download failures are reported and still schedule cleanup after a partial dispatch", () => {
  let revoke;
  let anchorRemoved = false;
  let urlRevoked = false;
  const result = downloadForgeArtifactJson(validArtifact(), {
    URL: {
      createObjectURL: () => "blob:failed-export",
      revokeObjectURL: () => { urlRevoked = true; },
    },
    document: {
      body: { appendChild() {} },
      createElement: () => ({ click() { throw new Error("blocked"); }, remove() { anchorRemoved = true; } }),
    },
    setTimeout(callback, delay) { assert.equal(delay, 1000); revoke = callback; },
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /could not be started/);
  assert.equal(anchorRemoved, true);
  assert.equal(urlRevoked, false);
  assert.equal(typeof revoke, "function");
  revoke();
  assert.equal(urlRevoked, true);
  assert.deepEqual(downloadForgeArtifactJson(validArtifact(), {}), {
    ok: false,
    error: "This browser cannot prepare a JSON download.",
  });
});

test("Forge exposes an accessible JSON export only for validated artifacts and reports failures", async () => {
  const [page, edge, exporter] = await Promise.all([
    source("../src/ForgePage.jsx"),
    source("../supabase/functions/hey/index.ts"),
    source("../src/lib/forgeArtifactExport.js"),
  ]);
  const helper = page.slice(page.indexOf("function downloadStructuredArtifact()"), page.indexOf("function updateAgentField", page.indexOf("function downloadStructuredArtifact()")));
  assert.match(page, /await createForgeArtifact\(draft\.trim\(\), forgeCategory, plan\.plan\)/);
  assert.match(helper, /downloadForgeArtifactJson\(artifact\)/);
  assert.match(exporter, /validateGeneratedForgeArtifact\(\{ title, summary, files: exportedFiles \}\)/);
  assert.match(page, /role="alert"/);
  assert.match(page, /onClick=\{downloadStructuredArtifact\}/);
  assert.match(page, /disabled=\{!artifact\.validation\?\.valid\}/);
  assert.match(page, /aria-label="Export the validated Forge artifact as JSON"/);
  assert.match(helper, /setForgeExportError\(result\.error\)/);
  assert.doesNotMatch(helper, /setForgeError\(/);
  const projectInsert = edge.indexOf('.from("hey_records")');
  const savedFiles = edge.indexOf("files: artifact.files", projectInsert);
  const successResponse = edge.indexOf("return jsonResponse({ artifact, validation, projectId", projectInsert);
  assert.ok(projectInsert >= 0 && savedFiles > projectInsert && successResponse > savedFiles);
});
