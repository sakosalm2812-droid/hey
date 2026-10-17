import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { downloadForgeArtifactDocx, downloadForgeArtifactJson, prepareForgeArtifactDocx, prepareForgeArtifactJson } from "../src/lib/forgeArtifactExport.js";

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

function readStoredZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 0xffff - 22); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { endOffset = offset; break; }
  }
  assert.notEqual(endOffset, -1, "ZIP end record exists");
  const count = view.getUint16(endOffset + 10, true);
  const directoryLength = view.getUint32(endOffset + 12, true);
  const directoryOffset = view.getUint32(endOffset + 16, true);
  assert.equal(directoryOffset + directoryLength, endOffset);
  const decoder = new TextDecoder();
  const entries = new Map();
  let cursor = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    assert.equal(view.getUint32(cursor, true), 0x02014b50, "central directory signature");
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const checksum = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    assert.equal(flags & 0x0800, 0x0800, "UTF-8 filename flag");
    assert.equal(method, 0, "stored ZIP entry");
    assert.equal(compressedSize, uncompressedSize);
    assert.equal(view.getUint32(localOffset, true), 0x04034b50, "local file signature");
    assert.equal(view.getUint16(localOffset + 6, true), flags);
    assert.equal(view.getUint16(localOffset + 8, true), method);
    assert.equal(view.getUint32(localOffset + 14, true), checksum);
    assert.equal(view.getUint32(localOffset + 18, true), compressedSize);
    assert.equal(view.getUint32(localOffset + 22, true), uncompressedSize);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    assert.equal(decoder.decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength)), name);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const content = bytes.subarray(dataOffset, dataOffset + uncompressedSize);
    let crc = 0xffffffff;
    for (const byte of content) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    assert.equal(((crc ^ 0xffffffff) >>> 0), checksum, `${name} CRC-32`);
    entries.set(name, decoder.decode(content));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(cursor, directoryOffset + directoryLength);
  return entries;
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

test("DOCX export is a valid stored ZIP with connected Office Open XML parts", () => {
  const prepared = prepareForgeArtifactDocx(validArtifact());
  assert.equal(prepared.filename, "lesson-plan-q-a.docx");
  assert.equal(prepared.mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const parts = readStoredZip(prepared.bytes);
  assert.deepEqual([...parts.keys()], ["[Content_Types].xml", "_rels/.rels", "docProps/core.xml", "word/document.xml"]);
  assert.match(parts.get("[Content_Types].xml"), /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml/);
  assert.match(parts.get("_rels/.rels"), /Target="word\/document\.xml"/);
  assert.match(parts.get("docProps/core.xml"), /Lesson Plan \/ Q&amp;A/);
  const document = parts.get("word/document.xml");
  assert.match(document, /xmlns:w="http:\/\/schemas\.openxmlformats\.org\/wordprocessingml\/2006\/main"/);
  assert.match(document, /<w:body>/);
  assert.match(document, /# Lesson/);
  assert.match(document, /Ready to teach\./);
});

test("DOCX export rejects the same hostile artifacts as the structured exporter", () => {
  assert.equal(prepareForgeArtifactDocx(validArtifact({ validation: { valid: false } })), null);
  assert.equal(prepareForgeArtifactDocx(validArtifact({ files: [{ path: "..\\private.docx", content: "x" }] })), null);
  assert.equal(prepareForgeArtifactDocx(validArtifact({ files: [{ path: "secrets.md", content: "api_key=private-value" }] })), null);
  assert.equal(prepareForgeArtifactDocx(validArtifact({ files: [{ path: "large.md", content: "x".repeat(1_000_001) }] })), null);
});

test("DOCX download dispatch uses the Office MIME type and the real .docx filename", () => {
  let blob;
  let downloaded;
  const result = downloadForgeArtifactDocx(validArtifact(), {
    Blob: class MockBlob { constructor(parts, options) { this.parts = parts; this.type = options.type; blob = this; } },
    URL: { createObjectURL: () => "blob:docx", revokeObjectURL() {} },
    document: { body: { appendChild(anchor) { downloaded = anchor.download; } }, createElement: () => ({ click() {}, remove() {} }) },
    setTimeout(callback) { callback(); },
  });
  assert.deepEqual(result, { ok: true, filename: "lesson-plan-q-a.docx" });
  assert.equal(downloaded, "lesson-plan-q-a.docx");
  assert.equal(blob.type, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.ok(blob.parts[0] instanceof Uint8Array);
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

test("Forge exposes accessible JSON and Word exports only for validated artifacts and reports failures", async () => {
  const [page, edge, exporter] = await Promise.all([
    source("../src/ForgePage.jsx"),
    source("../supabase/functions/hey/index.ts"),
    source("../src/lib/forgeArtifactExport.js"),
  ]);
  const helper = page.slice(page.indexOf("function downloadStructuredArtifact()"), page.indexOf("function updateAgentField", page.indexOf("function downloadStructuredArtifact()")));
  assert.match(page, /await createForgeArtifact\(draft\.trim\(\), forgeCategory, plan\.plan\)/);
  assert.match(helper, /downloadForgeArtifactJson\(artifact\)/);
  assert.match(exporter, /validateGeneratedForgeArtifact\(\{ title: normalizedTitle, summary, files: exportedFiles \}\)/);
  assert.match(page, /role="alert"/);
  assert.match(page, /onClick=\{downloadStructuredArtifact\}/);
  assert.match(page, /disabled=\{!artifact\.validation\?\.valid\}/);
  assert.match(page, /aria-label="Export the validated Forge artifact as JSON"/);
  assert.match(page, /downloadForgeArtifactDocx\(artifact\)/);
  assert.match(page, /function downloadWordDocument\(\)/);
  assert.match(page, /aria-label="Export the validated Forge artifact as a Word document"/);
  assert.match(page, /Export Word \(\.docx\)/);
  assert.match(helper, /setForgeExportError\(result\.error\)/);
  assert.doesNotMatch(helper, /setForgeError\(/);
  const projectInsert = edge.indexOf('.from("hey_records")');
  const savedFiles = edge.indexOf("files: artifact.files", projectInsert);
  const successResponse = edge.indexOf("return jsonResponse({ artifact, validation, projectId", projectInsert);
  assert.ok(projectInsert >= 0 && savedFiles > projectInsert && successResponse > savedFiles);
});
