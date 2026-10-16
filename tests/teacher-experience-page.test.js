import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { hasTeacherAnswerKeyField, resolveTeacherPageAccess, teacherJourneyPersistenceMatches } from "../src/teacherExperiencePageContract.js";

const readSource = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const page = readSource("../src/TeacherExperiencePage.jsx");
const app = readSource("../src/App.jsx");
const layout = readSource("../src/components/layout/AppLayout.jsx");
const palette = readSource("../src/components/CommandPalette.jsx");

function artifact({ contract, userId = "teacher-1", account = "account:teacher-1", workspace = "project-1", classId = "class-1", content = {} } = {}) {
  return {
    id: `${contract}-id`,
    projectId: workspace,
    createdBy: userId,
    content,
    metadata: { artifactContract: contract, accountScope: account, workspaceId: workspace, classId },
  };
}

test("Teacher authoring requires fresh teacher identity, account scope, and assigned class claims", () => {
  const teacher = { id: "teacher-1", app_metadata: {
    hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"],
  } };
  assert.deepEqual(resolveTeacherPageAccess(teacher, "account:teacher-1"), {
    status: "ready", userId: "teacher-1", accountScope: "account:teacher-1", classIds: ["class-1"],
  });
  assert.equal(resolveTeacherPageAccess(null, "account:teacher-1").status, "identity-missing");
  assert.equal(resolveTeacherPageAccess({ ...teacher, app_metadata: { ...teacher.app_metadata, hey_role: "student" } }, "account:teacher-1").status, "role-denied");
  assert.equal(resolveTeacherPageAccess(teacher, "account:teacher-2").status, "scope-mismatch");
  assert.equal(resolveTeacherPageAccess({ ...teacher, app_metadata: { ...teacher.app_metadata, hey_class_ids: [] } }, "account:teacher-1").status, "class-unassigned");
});

test("Forge confirmation must return three unique creator- and class-bound artifacts with an answer-free worksheet", () => {
  const expected = { journeyId: "journey-1", userId: "teacher-1", accountScope: "account:teacher-1", workspaceId: "project-1", classId: "class-1" };
  const result = { journeyId: "journey-1", saved: {
    lesson: artifact({ contract: "hey.teacher.lesson.v1" }),
    teacherArtifact: artifact({ contract: "hey.teacher.assessment.v1", content: { questions: [{ teacherAnswer: "Teacher-only" }] } }),
    studentArtifact: artifact({ contract: "hey.teacher.worksheet.v1", content: { type: "teacher_worksheet", questions: [{ prompt: "Question", points: 1 }] } }),
  } };
  assert.equal(teacherJourneyPersistenceMatches(result, expected), true);
  assert.equal(teacherJourneyPersistenceMatches({ ...result, saved: { ...result.saved, studentArtifact: { ...result.saved.studentArtifact, createdBy: "peer-teacher" } } }, expected), false);
  assert.equal(teacherJourneyPersistenceMatches({ ...result, saved: { ...result.saved, lesson: { ...result.saved.lesson, metadata: { ...result.saved.lesson.metadata, classId: "other-class" } } } }, expected), false);
  assert.equal(teacherJourneyPersistenceMatches({ ...result, saved: { ...result.saved, studentArtifact: { ...result.saved.studentArtifact, content: { type: "teacher_worksheet", question: { teacherAnswer: "leak" } } } } }, expected), false);
  assert.equal(teacherJourneyPersistenceMatches({ ...result, journeyId: "different-retry" }, expected), false);
});

test("worksheet answer-key classifier fails closed on cycles and scans nested data", () => {
  assert.equal(hasTeacherAnswerKeyField({ questions: [{ nested: { teacherAnswer: "private" } }] }), true);
  assert.equal(hasTeacherAnswerKeyField({ type: "teacher_worksheet", questions: [{ prompt: "Question", points: 1 }] }), false);
  const cyclic = {}; cyclic.self = cyclic;
  assert.equal(hasTeacherAnswerKeyField(cyclic), true);
});

test("real protected entrypoint uses the atomic journey API and keeps retry IDs stable", () => {
  assert.match(app, /path="\/teacher" element=\{<ProtectedLayout><TeacherExperiencePage \/><\/ProtectedLayout>\}/);
  assert.match(layout, /label: "Teacher", path: "\/teacher"/);
  assert.match(palette, /\["Open Teacher", "\/teacher"/);
  assert.match(page, /HEY\.teacher\.createLessonWorksheetJourney\(/);
  assert.match(page, /journeyId: preview\.journeyId/);
  assert.match(page, /Retry the same journey save/);
  assert.match(page, /HEY\.teacher\.exportAnswerKeyMarkdown/);
  assert.match(page, /HEY\.teacher\.exportWorksheetMarkdown/);
  assert.match(page, /readCurrentTeacherAccess\(preview\.expected\.userId\)/);
  assert.match(page, /hasTeacherAnswerKeyField\(savedJourney\.studentArtifact\.content\)/);
  assert.match(page, /Nothing was written to Forge while preparing this preview/);
});
