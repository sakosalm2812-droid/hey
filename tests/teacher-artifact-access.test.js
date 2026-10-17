import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeTeacherArtifactRead,
  canReadTeacherArtifact,
  canWriteTeacherArtifact,
  isStudentWorksheetArtifact,
  isTeacherAnswerKeyArtifact,
  isTeacherLessonArtifact,
} from "../src/core/teacherArtifactAccess.js";

const teacher = {
  id: "teacher-1",
  app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
};

const student = {
  id: "student-1",
  app_metadata: { hey_role: "student", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
};

const worksheet = (content = { type: "teacher_worksheet", questions: [{ prompt: "Question", points: 1 }] }) => ({
  content,
  metadata: { accountScope: "account:teacher-1", classId: "class-1" },
});

test("ordinary worksheets preserve same-class teacher and student access", () => {
  const artifact = worksheet();
  assert.equal(isStudentWorksheetArtifact(artifact), true);
  assert.equal(isTeacherAnswerKeyArtifact(artifact), false);
  assert.equal(authorizeTeacherArtifactRead(artifact, {}, teacher), true);
  assert.equal(authorizeTeacherArtifactRead(artifact, {}, student), true);
  assert.equal(authorizeTeacherArtifactRead(artifact, {}, {
    ...student,
    app_metadata: { ...student.app_metadata, hey_class_ids: ["class-2"] },
  }), false);
});

test("missing or primitive artifacts are ambiguous and denied", async () => {
  for (const artifact of [null, undefined, "teacher_worksheet", 42]) {
    assert.equal(isTeacherAnswerKeyArtifact(artifact), true);
    assert.equal(authorizeTeacherArtifactRead(artifact, {}, student), false);
    assert.equal(await canReadTeacherArtifact(artifact), false);
  }
});

test("nested accessors are never invoked and ambiguous artifacts are private", async () => {
  let getterCalls = 0;
  const questions = {};
  Object.defineProperty(questions, "teacherAnswer", {
    enumerable: true,
    get() { getterCalls += 1; throw new Error("must not run"); },
  });
  const artifact = worksheet({ type: "teacher_worksheet", questions: [questions] });

  assert.equal(isTeacherAnswerKeyArtifact(artifact), true);
  assert.equal(isStudentWorksheetArtifact(artifact), false);
  assert.equal(isTeacherLessonArtifact(artifact), true);
  assert.equal(authorizeTeacherArtifactRead(artifact, {}, student), false);
  assert.equal(await canReadTeacherArtifact(artifact), false);
  assert.equal(await canWriteTeacherArtifact(artifact), false);

  const metadataArtifact = worksheet();
  Object.defineProperty(metadataArtifact.metadata, "workflow", {
    enumerable: true,
    get() { getterCalls += 1; throw new Error("must not run"); },
  });
  assert.equal(isTeacherAnswerKeyArtifact(metadataArtifact), true);
  assert.equal(authorizeTeacherArtifactRead(metadataArtifact, {}, student), false);
  assert.equal(getterCalls, 0);
});

test("cycles in content or metadata fail closed without recursing indefinitely", () => {
  const content = { type: "teacher_worksheet" };
  content.nested = content;
  const metadata = { accountScope: "account:teacher-1", classId: "class-1" };
  metadata.self = metadata;
  for (const artifact of [worksheet(content), { content: { type: "teacher_worksheet" }, metadata }]) {
    assert.equal(isTeacherAnswerKeyArtifact(artifact), true);
    assert.equal(isStudentWorksheetArtifact(artifact), false);
    assert.equal(authorizeTeacherArtifactRead(artifact, {}, student), false);
  }
});

test("hostile proxies that throw during inspection fail closed", async () => {
  const hostileContent = new Proxy({ type: "teacher_worksheet" }, {
    ownKeys() { throw new Error("hostile ownKeys trap"); },
  });
  const artifact = worksheet(hostileContent);
  assert.equal(isTeacherAnswerKeyArtifact(artifact), true);
  assert.equal(isStudentWorksheetArtifact(artifact), false);
  assert.equal(authorizeTeacherArtifactRead(artifact, {}, student), false);
  assert.equal(await canReadTeacherArtifact(artifact), false);

  const revoked = Proxy.revocable({ type: "teacher_worksheet" }, {});
  revoked.revoke();
  assert.equal(isTeacherAnswerKeyArtifact(worksheet(revoked.proxy)), true);
  assert.equal(authorizeTeacherArtifactRead(worksheet(revoked.proxy), {}, student), false);
});

test("classification reads proxy data descriptors without invoking its get trap", () => {
  let getTrapCalls = 0;
  const proxyContent = new Proxy({ type: "teacher_worksheet" }, {
    get() { getTrapCalls += 1; throw new Error("property get trap must not run"); },
  });
  const artifact = worksheet(proxyContent);
  assert.equal(isTeacherAnswerKeyArtifact(artifact), false);
  assert.equal(isStudentWorksheetArtifact(artifact), true);
  assert.equal(authorizeTeacherArtifactRead(artifact, {}, student), true);
  assert.equal(getTrapCalls, 0);
});

test("content or metadata beyond the inspection depth limit is treated as private", () => {
  const content = { type: "teacher_worksheet" };
  let nested = content;
  for (let index = 0; index < 40; index += 1) {
    nested.child = {};
    nested = nested.child;
  }
  const metadataArtifact = worksheet();
  nested = metadataArtifact.metadata;
  for (let index = 0; index < 40; index += 1) {
    nested.child = {};
    nested = nested.child;
  }
  for (const artifact of [worksheet(content), metadataArtifact]) {
    assert.equal(isTeacherAnswerKeyArtifact(artifact), true);
    assert.equal(isStudentWorksheetArtifact(artifact), false);
    assert.equal(authorizeTeacherArtifactRead(artifact, {}, student), false);
  }
});

test("an answer marker in a student-facing artifact keeps it teacher-only", () => {
  const artifact = worksheet({ type: "teacher_worksheet", prompts: [{ teacherAnswer: "private" }] });
  const privateVersion = { ...artifact, createdBy: teacher.id };
  assert.equal(isTeacherAnswerKeyArtifact(privateVersion), true);
  assert.equal(authorizeTeacherArtifactRead(privateVersion, {}, student), false);
  assert.equal(authorizeTeacherArtifactRead(privateVersion, {}, teacher), true);
});
