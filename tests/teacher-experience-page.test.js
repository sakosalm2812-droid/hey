import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { hasTeacherAnswerKeyField, resolveTeacherPageAccess, teacherArtifactOperationContextMatches, teacherJourneyPersistenceMatches } from "../src/teacherExperiencePageContract.js";
import { shouldResetTeacherDraft, teacherPageStateMatchesAccount, teacherOperationCanStart, teacherOperationLockBelongsToAccount, readTeacherJourneyRecoveryHint, writeTeacherJourneyRecoveryHint } from "../src/teacherPageState.js";

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

test("in-flight artifact results are fenced to the exact active teacher class and project", () => {
  const context = { userId: "teacher-1", accountScope: "account:teacher-1", workspaceId: "project-1", classId: "class-1" };
  assert.equal(teacherArtifactOperationContextMatches(context, { ...context }), true);
  assert.equal(teacherArtifactOperationContextMatches(context, { ...context, classId: "class-2" }), false);
  assert.equal(teacherArtifactOperationContextMatches(context, { ...context, workspaceId: "project-2" }), false);
  assert.equal(teacherArtifactOperationContextMatches(context, { ...context, userId: "teacher-2" }), false);
  assert.equal(teacherArtifactOperationContextMatches(context, { ...context, accountScope: "account:teacher-2" }), false);
  assert.match(page, /activeTeacherContextRef\.current = \{ \.\.\.activeTeacherContextRef\.current, classId: event\.target\.value \}/);
  assert.match(page, /activeTeacherContextRef\.current = \{ \.\.\.activeTeacherContextRef\.current, workspaceId: event\.target\.value \}/);
  assert.match(page, /teacherContextIsCurrent\(preview\.expected\)/);
  assert.match(page, /teacherContextIsCurrent\(expected\)/);
});

test("worksheet answer-key classifier fails closed on cycles and scans nested data", () => {
  assert.equal(hasTeacherAnswerKeyField({ questions: [{ nested: { teacherAnswer: "private" } }] }), true);
  assert.equal(hasTeacherAnswerKeyField({ type: "teacher_worksheet", questions: [{ prompt: "Question", points: 1 }] }), false);
  const cyclic = {}; cyclic.self = cyclic;
  assert.equal(hasTeacherAnswerKeyField(cyclic), true);
});

test("real protected entrypoint uses the atomic journey API and keeps retry IDs stable", () => {
  assert.equal((app.match(/path="\/teacher"/g) || []).length, 1);
  assert.doesNotMatch(app, /TeacherPage\.jsx/);
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
  assert.match(page, /HEY\.teacher\.buildActivityHandoutArtifact\(savedJourney\.lesson, activityIndex, context\)/);
  assert.match(page, /HEY\.teacher\.verifyActivityHandoutArtifact\(artifact, context\)/);
  assert.match(page, /HEY\.teacher\.saveActivityHandoutArtifact\(artifact, context\)/);
  assert.match(page, /HEY\.teacher\.exportActivityHandoutMarkdown\(artifact,/);
  assert.match(page, /HEY\.teacher\.exportDifferentiatedWorksheetMarkdown\(worksheet,/);
  assert.match(page, /Support hint for question/);
  assert.match(page, /Extension challenge/);
  assert.match(page, /I reviewed all three versions/);
  assert.match(page, /teacherJourneyPersistenceMatches\(savedJourney, \{ \.\.\.preview\.expected, journeyId: preview\.journeyId \}\)/);
  assert.match(page, /downloadMarkdown\(differentiatedExport\)/);
  assert.match(page, /activityHandoutReviewAcknowledged/);
  assert.match(page, /Prepare printable handout/);
  assert.match(page, /downloadMarkdown\(activityHandoutExport\)/);
  assert.match(page, /JSON\.stringify\(savedActivityHandout\.content\) !== JSON\.stringify\(artifact\.content\)/);
  assert.match(page, /Teacher review is required before classroom use; this does not distribute it to students/);
});

test("active Teacher page fences readiness and drafts to the signed-in account", () => {
  assert.equal(teacherPageStateMatchesAccount("teacher-1", "teacher-1"), true);
  assert.equal(teacherPageStateMatchesAccount("teacher-1", "teacher-2"), false);
  assert.equal(shouldResetTeacherDraft("teacher-1", "teacher-2"), true);
  assert.equal(shouldResetTeacherDraft("teacher-1", "teacher-1"), false);
  assert.match(page, /previousAccountIdRef/);
  assert.match(page, /setLessonForm\(createEmptyLessonForm\(\)\)/);
  assert.match(page, /setAccessAccountId\(""\)/);
  assert.match(page, /const currentAccess = accessIsCurrent/);
  assert.match(page, /currentAccess\.status === "ready" && projects\.length > 0/);
  assert.match(page, /accountRef\.current === operationAccountId && getAccountScope\(\) === operationAccountScope/);
  assert.match(page, /buildTeacherAssessmentQuestions\(lessonForm\.questions, learningObjectives\[0\]\)/);
  assert.match(page, /lessonForm\.questions\.map\(\(question, index\)/);
  assert.match(page, /onClick=\{\(\) => removeQuestion\(question\.id\)\}/);
  assert.match(page, /Add question/);
  assert.match(page, /preview\.assessment\.content\.questions\.map/);
});

test("in-flight Teacher actions do not block the newly signed-in account or clear its lock", () => {
  assert.equal(teacherOperationCanStart(null, "teacher-1"), true);
  assert.equal(teacherOperationCanStart("teacher-1", "teacher-1"), false);
  assert.equal(teacherOperationCanStart("teacher-1", "teacher-2"), true);
  assert.equal(teacherOperationCanStart(null, ""), false);
  assert.equal(teacherOperationLockBelongsToAccount("teacher-1", "teacher-1"), true);
  assert.equal(teacherOperationLockBelongsToAccount("teacher-2", "teacher-1"), false);
  assert.match(page, /teacherOperationCanStart\(busyRef\.current, accountId\)/);
  assert.match(page, /teacherOperationLockBelongsToAccount\(busyRef\.current, operationAccountId\)/);
});

test("recovery hints are account-keyed metadata only and malformed or foreign hints are ignored", () => {
  const values = new Map();
  const storage = {
    setItem(key, value) { values.set(key, value); },
    getItem(key) { return values.get(key) || null; },
  };
  const hint = {
    userId: "teacher-1", accountScope: "account:teacher-1", workspaceId: "project-1",
    classId: "class-1", journeyId: "e0e5c6a1-29a6-4ccb-9ca8-f57a7073fe93",
  };
  assert.equal(writeTeacherJourneyRecoveryHint(storage, hint), true);
  assert.deepEqual(readTeacherJourneyRecoveryHint(storage, "teacher-1"), hint);
  assert.equal(readTeacherJourneyRecoveryHint(storage, "teacher-2"), null);
  assert.doesNotMatch([...values.values()][0], /teacherAnswer|Fractions|worksheet/i);
  values.set("hey.teacher.journey-recovery.v1:teacher-1", JSON.stringify({ ...hint, answerKey: "private" }));
  assert.equal(readTeacherJourneyRecoveryHint(storage, "teacher-1"), null);
});

test("Teacher recovery hint helpers reject accessor and symbol properties without invoking getters", () => {
  const values = new Map();
  const storage = {
    setItem(key, value) { values.set(key, value); },
    getItem(key) { return values.get(key) || null; },
  };
  let getterCalls = 0;
  const hint = {
    accountScope: "account:teacher-1", classId: "class-1", journeyId: "e0e5c6a1-29a6-4ccb-9ca8-f57a7073fe93",
    userId: "teacher-1", workspaceId: "project-1",
  };
  Object.defineProperty(hint, "classId", { enumerable: true, get() { getterCalls += 1; return "class-1"; } });
  assert.equal(writeTeacherJourneyRecoveryHint(storage, hint), false);
  assert.equal(getterCalls, 0);
  assert.equal(values.size, 0);

  const symbolHint = {
    accountScope: "account:teacher-1", classId: "class-1", journeyId: "e0e5c6a1-29a6-4ccb-9ca8-f57a7073fe93",
    userId: "teacher-1", workspaceId: "project-1", [Symbol("unexpected")]: "ignored",
  };
  assert.equal(writeTeacherJourneyRecoveryHint(storage, symbolHint), false);
  assert.equal(values.size, 0);
});

test("Teacher recovery rechecks access and reloads persisted data through Forge", () => {
  assert.match(page, /HEY\.teacher\.getLessonWorksheetJourney\(/);
  assert.match(page, /readCurrentTeacherAccess\(operationAccountId\)/);
  assert.match(page, /teacherJourneyPersistenceMatches\(result, expected\)/);
  assert.match(page, /hasTeacherAnswerKeyField\(result\.studentArtifact\.content\)/);
  assert.match(page, /readTeacherJourneyRecoveryHint\(getSessionStorageSafely\(\), accountId\)/);
  assert.match(page, /Check Forge for the saved set/);
});
