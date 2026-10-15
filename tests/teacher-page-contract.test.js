import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { hasTeacherAnswerKeyField, teacherExportsAreComplete, teacherJourneyPersistenceMatches } from "../src/teacherPageContract.js";

const [page, routes, appNavigation, legacyNavigation] = await Promise.all([
  readFile(new URL("../src/TeacherPage.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/layout/AppLayout.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/layout/Sidebar.jsx", import.meta.url), "utf8"),
]);

function persistedJourney() {
  return {
    saved: {
      lesson: { id: "lesson-id", projectId: "project-id", metadata: { accountScope: "account:teacher", workspaceId: "project-id", classId: "class-a", artifactContract: "hey.teacher.lesson.v1" } },
      teacherArtifact: { id: "key-id", projectId: "project-id", metadata: { accountScope: "account:teacher", workspaceId: "project-id", classId: "class-a", artifactContract: "hey.teacher.assessment.v1", audience: "teacher_only" } },
      studentArtifact: { id: "worksheet-id", projectId: "project-id", content: { type: "teacher_worksheet", questions: [{ prompt: "Q", points: 1 }] }, metadata: { accountScope: "account:teacher", workspaceId: "project-id", classId: "class-a", artifactContract: "hey.teacher.worksheet.v1", audience: "student" } },
    },
  };
}

test("Teacher route and navigation reach a fresh server-claim guarded workflow", () => {
  assert.match(routes, /path="\/teacher"[^\n]*TeacherPage/);
  assert.match(appNavigation, /label: "Teacher", path: "\/teacher"/);
  assert.match(legacyNavigation, /label: "Teacher", path: "\/teacher"/);
  assert.match(page, /supabaseClient\.auth\.getUser\(\)/);
  assert.match(page, /claims\.hey_role !== "teacher"/);
  assert.match(page, /claims\.hey_account_scope !== accountScope/);
  assert.match(page, /claims\.hey_class_ids/);
  assert.match(page, /listRecords\(teacher\.userId, "project"\)/);
  assert.match(page, /HEY\.teacher\.createTeacherLessonWorksheetJourney/);
  assert.doesNotMatch(page, /name="role"|Select role|Choose your role/i);
});

test("Forge output appears only after three matching persistence receipts and complete audience exports", () => {
  const context = { accountScope: "account:teacher", workspaceId: "project-id", classId: "class-a" };
  assert.equal(teacherJourneyPersistenceMatches(persistedJourney(), context), true);

  const partial = persistedJourney();
  partial.saved.studentArtifact.metadata.classId = "class-b";
  assert.equal(teacherJourneyPersistenceMatches(partial, context), false);

  const duplicated = persistedJourney();
  duplicated.saved.studentArtifact.id = duplicated.saved.teacherArtifact.id;
  assert.equal(teacherJourneyPersistenceMatches(duplicated, context), false);

  const leaked = persistedJourney();
  leaked.saved.studentArtifact.content.questions[0].teacherAnswer = "private answer";
  assert.equal(teacherJourneyPersistenceMatches(leaked, context), false);

  const completeExports = {
    lesson: { filename: "lesson-plan.md", mimeType: "text/markdown", content: "# Lesson" },
    teacherAnswerKey: { filename: "teacher-answer-key.md", mimeType: "text/markdown", content: "# Answer key" },
    studentWorksheet: { filename: "student-worksheet.md", mimeType: "text/markdown", content: "# Worksheet" },
  };
  assert.equal(teacherExportsAreComplete(completeExports), true);
  assert.equal(teacherExportsAreComplete({ ...completeExports, studentWorksheet: { ...completeExports.studentWorksheet, content: " " } }), false);
  assert.match(page, /teacherJourneyPersistenceMatches\(journey, context\)/);
  assert.match(page, /teacherExportsAreComplete\(allExports\)/);
  assert.match(page, /outputAccountId === accountId && access.status === "ready"/);
});

test("student worksheet output is checked for answer-key fields and stays distinct from teacher exports", () => {
  assert.equal(hasTeacherAnswerKeyField({ questions: [{ prompt: "Question", points: 1 }] }), false);
  assert.equal(hasTeacherAnswerKeyField({ questions: [{ prompt: "Question", teacherAnswer: "Answer" }] }), true);
  assert.match(page, /HEY\.teacher\.exportAnswerKeyMarkdown/);
  assert.match(page, /HEY\.teacher\.exportWorksheetMarkdown/);
  assert.match(page, /Teacher-only answer key/);
  assert.match(page, /Student worksheet/);
  assert.match(page, /teacher-page__teacher-answer/);
  assert.match(page, /no student records are collected/i);
});
