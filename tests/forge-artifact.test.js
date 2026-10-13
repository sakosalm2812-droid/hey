import assert from "node:assert/strict";
import test from "node:test";

import {
  normaliseForgeArtifact,
  parseJsonResponse,
  validateForgeArtifact,
} from "../supabase/functions/hey/forgeArtifact.js";

test("Forge rejects collisions created by path truncation", () => {
  const prefix = "a".repeat(180);
  const artifact = normaliseForgeArtifact({
    title: "Collision test",
    summary: "A test artifact.",
    files: [
      { path: `${prefix}one.txt`, content: "first" },
      { path: `${prefix}two.txt`, content: "second" },
    ],
  }, "collision test");

  assert.equal(artifact.files.length, 1);
  assert.equal(artifact.files[0].path, prefix);
  assert.equal(validateForgeArtifact(artifact).checks.uniquePaths, true);
  assert.equal(validateForgeArtifact(artifact).valid, true);
});

test("Forge checks forbidden path segments before truncation", () => {
  const artifact = normaliseForgeArtifact({
    title: "Traversal test",
    summary: "A test artifact.",
    files: [{ path: `${"a".repeat(181)}../.env`, content: "unsafe" }],
  }, "traversal test");

  assert.deepEqual(artifact.files, []);
  assert.equal(validateForgeArtifact(artifact).valid, false);
});

test("Forge rejects generated files containing secret-shaped values", () => {
  const artifact = normaliseForgeArtifact({
    title: "Secret test",
    summary: "A test artifact.",
    files: [{ path: "README.md", content: "api_key=example-secret" }],
  }, "secret test");

  assert.equal(validateForgeArtifact(artifact).checks.noSecrets, false);
  assert.equal(validateForgeArtifact(artifact).valid, false);
});

test("Forge parses fenced JSON and rejects malformed provider output", () => {
  assert.deepEqual(parseJsonResponse(' ```json\n{"title":"ok"}\n``` '), { title: "ok" });
  assert.equal(parseJsonResponse("not JSON"), null);
});
