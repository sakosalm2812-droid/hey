import assert from "node:assert/strict";
import test from "node:test";

import { artifactEngine } from "../src/core/artifactEngine.js";

test("artifact updates reject identity and persistence-field tampering", async () => {
  const artifact = await artifactEngine.createArtifact({
    projectId: "project-integrity-test",
    type: "note",
    title: "Stable identity",
    createdBy: "test-user",
  });
  const original = { ...artifact };

  await assert.rejects(
    artifactEngine.updateArtifact(artifact.id, { id: "attacker-controlled-id" }),
    /cannot be updated: id/i,
  );
  await assert.rejects(
    artifactEngine.updateArtifact(artifact.id, { projectId: "other-project" }),
    /cannot be updated: projectId/i,
  );
  await assert.rejects(
    artifactEngine.updateArtifact(artifact.id, { version: 900 }),
    /cannot be updated: version/i,
  );

  assert.equal(artifactEngine.artifacts.get(artifact.id).id, original.id);
  assert.equal(artifactEngine.artifacts.get(artifact.id).projectId, original.projectId);
  assert.equal(artifactEngine.artifacts.get(artifact.id).version, original.version);
});

test("artifact updates reject accessor-based and invalid status changes", async () => {
  const artifact = await artifactEngine.createArtifact({
    projectId: "project-integrity-test",
    type: "note",
    title: "Descriptor validation",
    createdBy: "test-user",
  });
  let getterCalled = false;
  const accessorUpdate = Object.defineProperty({}, "title", {
    enumerable: true,
    get() {
      getterCalled = true;
      return "unexpected";
    },
  });

  await assert.rejects(artifactEngine.updateArtifact(artifact.id, accessorUpdate), /data fields/i);
  await assert.rejects(artifactEngine.updateArtifact(artifact.id, { status: "made-up" }), /invalid artifact status/i);
  assert.equal(getterCalled, false);
  assert.equal(artifactEngine.artifacts.get(artifact.id).title, "Descriptor validation");
});

test("artifact updates continue to accept supported fields", async () => {
  const artifact = await artifactEngine.createArtifact({
    projectId: "project-integrity-test",
    type: "note",
    title: "Before update",
    createdBy: "test-user",
  });

  const updated = await artifactEngine.updateArtifact(artifact.id, {
    title: "After update",
    status: "verified",
    content: { text: "verified" },
  });

  assert.equal(updated.title, "After update");
  assert.equal(updated.status, "verified");
  assert.equal(updated.version, artifact.version + 1);
});
