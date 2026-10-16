import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { hasTeacherAnswerKeyField, studentExportHasTeacherKeyMarker, teacherExportsAreComplete, teacherJourneyPersistenceMatches, teacherPreparedJourneyMatches } from "../src/teacherPageContract.js";

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

function preparedJourney() {
  const saved = persistedJourney().saved;
  return { lesson: saved.lesson, teacherArtifact: saved.teacherArtifact, studentArtifact: saved.studentArtifact };
}

test("Teacher route and navigation reach a fresh server-claim guarded workflow", () => {
  assert.match(routes, /path="\/teacher"[^\n]*TeacherPage/);
  assert.match(appNavigation, /label: "Teacher", path: "\/teacher"/);
  assert.match(legacyNavigation, /label: "Teacher", path: "\/teacher"/);
  assert.match(page, /supabaseClient\.auth\.getUser\(\)/);
  assert.match(page, /isSupabaseConfigured/);
  assert.match(page, /service-unavailable/);
  assert.match(page, /Each Forge save is checked separately/);
  assert.match(page, /claims\.hey_role !== "teacher"/);
  assert.match(page, /claims\.hey_account_scope !== accountScope/);
  assert.match(page, /claims\.hey_class_ids/);
  assert.match(page, /listRecords\(teacher\.userId, "project"\)/);
  assert.match(page, /HEY\.teacher\.prepareLessonWorksheetJourney/);
  assert.match(page, /HEY\.teacher\.createLessonWorksheetJourney/);
  assert.match(page, /saveInFlightRef\.current/);
  assert.match(page, /Save all three to Forge/);
  assert.match(page, /Build lesson preview/);
  assert.doesNotMatch(page, /name="role"|Select role|Choose your role/i);
});

test("Teacher entrypoint explains denied access and exposes truthful readiness and Forge states", () => {
  assert.match(page, /access\.status === "checking"[^\n]*role="status"/);
  assert.match(page, /access\.status === "ready"[^\n]*role="status"/);
  assert.match(page, /access\.status === "denied" \|\| access\.status === "error" \|\| access\.status === "service-unavailable"[^\n]*role="alert"/);
  assert.match(page, /Teacher role and class assignments come from verified school access/);
  assert.match(page, /Contact your school administrator/);
  assert.match(page, /HEY cannot grant access from this page/);
  assert.match(page, /Retry readiness check/);
  assert.match(page, /Saving three artifacts and checking Forge receipts/);
  assert.match(page, /Save all three to Forge/);
  assert.match(page, /teacherJourneyPersistenceMatches\(journey, journeyContext\)/);
  assert.match(page, /status === "saved" && persistenceConfirmed/);
});

test("Teacher creation entrypoint is teacher-authored and requires preview before an explicit Forge save", () => {
  assert.match(page, /This screen organizes the lesson and assessment content you enter/);
  assert.match(page, /AI-generated drafting is unavailable here/);
  assert.match(page, /HEY will not invent lesson or question content/);
  assert.match(page, /Build lesson preview/);
  assert.match(page, /Save all three to Forge/);
  assert.match(page, /HEY\.teacher\.prepareLessonWorksheetJourney/);
  assert.match(page, /HEY\.teacher\.createLessonWorksheetJourney\(journeySaveRequest\)/);
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
  assert.equal(teacherExportsAreComplete({ ...completeExports, studentWorksheet: { ...completeExports.studentWorksheet, content: "# Student Worksheet\n## Teacher-only answer key" } }), false);
  assert.match(page, /teacherJourneyPersistenceMatches\(journey, journeyContext\)/);
  assert.match(page, /teacherExportsAreComplete\(allExports\)/);
  assert.match(page, /outputAccountId === accountId && access.status === "ready"/);
});

test("unsaved previews are bound to the active account, project, and class and reject private-key leakage", () => {
  const context = { accountScope: "account:teacher", workspaceId: "project-id", classId: "class-a" };
  assert.equal(teacherPreparedJourneyMatches(preparedJourney(), context), true);

  const wrongAccount = preparedJourney();
  wrongAccount.teacherArtifact.metadata.accountScope = "account:other";
  assert.equal(teacherPreparedJourneyMatches(wrongAccount, context), false);

  const wrongWorkspace = preparedJourney();
  wrongWorkspace.studentArtifact.metadata.workspaceId = "project-other";
  assert.equal(teacherPreparedJourneyMatches(wrongWorkspace, context), false);

  const wrongClass = preparedJourney();
  wrongClass.teacherArtifact.metadata.classId = "class-other";
  assert.equal(teacherPreparedJourneyMatches(wrongClass, context), false);

  const leaked = preparedJourney();
  leaked.studentArtifact.content.questions[0].teacherAnswer = "private answer";
  assert.equal(teacherPreparedJourneyMatches(leaked, context), false);
  for (const key of ["answerKey", "correct_answer", "expectedLearning", "solutions"]) {
    const malicious = preparedJourney();
    malicious.studentArtifact.content.questions[0][key] = "private material";
    assert.equal(teacherPreparedJourneyMatches(malicious, context), false, `reject leaked field ${key}`);
  }
});

test("student worksheet output is checked for answer-key fields and stays distinct from teacher exports", () => {
  assert.equal(hasTeacherAnswerKeyField({ questions: [{ prompt: "Question", points: 1 }] }), false);
  assert.equal(hasTeacherAnswerKeyField({ questions: [{ prompt: "Question", teacherAnswer: "Answer" }] }), true);
  assert.equal(hasTeacherAnswerKeyField({ questions: [{ prompt: "Question", answer_key: "Answer" }] }), true);
  assert.equal(studentExportHasTeacherKeyMarker("# Student Worksheet\n## Teacher-only answer key"), true);
  assert.match(page, /HEY\.teacher\.exportAnswerKeyMarkdown/);
  assert.match(page, /HEY\.teacher\.exportWorksheetMarkdown/);
  assert.match(page, /Teacher-only answer key/);
  assert.match(page, /Student worksheet/);
  assert.match(page, /teacher-page__teacher-answer/);
  assert.match(page, /no student records are collected/i);
});
