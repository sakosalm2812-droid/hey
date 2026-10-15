import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTeacherAssessmentArtifact,
  buildTeacherLessonArtifact,
  buildTeacherWorksheetArtifact,
  exportTeacherAssessmentMarkdown,
  exportTeacherLessonMarkdown,
  exportTeacherWorksheetMarkdown,
  saveTeacherAssessmentArtifact,
  saveTeacherLessonArtifact,
  saveTeacherWorksheetArtifact,
  verifyTeacherAssessmentArtifact,
  verifyTeacherLessonArtifact,
  verifyTeacherWorksheetArtifact,
} from "../src/core/teacherExperience.js";
import HEY from "../src/core/index.js";
import { supabaseClient } from "../src/lib/supabase.js";
import { authorizeTeacherArtifactRead, authorizeTeacherArtifactWrite } from "../src/core/teacherArtifactAccess.js";
import { artifactEngine } from "../src/core/artifactEngine.js";

supabaseClient.auth.getUser = async () => ({ data: { user: {
  id: "teacher-1",
  app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
} }, error: null });

const lessonInput = (overrides = {}) => ({
  title: "Fractions on a number line",
  subject: "Mathematics",
  gradeBand: "3-5",
  durationMinutes: 45,
  learningObjectives: ["Place unit fractions on a number line"],
  curriculumReferences: [{ title: "District mathematics guide", url: "https://school.example/curriculum/math" }],
  resources: ["Number line cards"],
  activities: [{ title: "Build a number line", instructions: "Place fraction cards and explain each choice.", minutes: 20 }],
  assessment: { prompt: "Place 1/4 and 3/4 on the number line.", expectedLearning: "Learner locates both fractions in order." },
  accountScope: "account:teacher-1",
  workspaceId: "school-space",
  currentAccountScope: "account:teacher-1",
  currentWorkspaceId: "school-space",
  createdAt: "2026-10-15T09:00:00.000Z",
  ...overrides,
});

const teacherContext = () => ({
  accountScope: "account:teacher-1",
  workspaceId: "school-space",
  currentAccountScope: "account:teacher-1",
  currentWorkspaceId: "school-space",
  classId: "class-1",
  currentClassId: "class-1",
});

const assessmentInput = (overrides = {}) => ({
  title: "Fractions exit check",
  directions: "Show your reasoning for each answer.",
  questions: [{
    objective: "Place unit fractions on a number line",
    prompt: "Where does 1/4 belong on the number line?",
    expectedLearning: "Learner places 1/4 between 0 and 1/2 and explains why.",
    teacherAnswer: "One quarter is one of four equal parts; mark it one quarter of the way from zero to one.",
    points: 2,
  }],
  createdAt: "2026-10-15T09:00:00.000Z",
  ...overrides,
});

async function withForgePersistence(operation, failureMessage = null) {
  const originalFrom = supabaseClient.from;
  const writes = [];
  supabaseClient.from = (table) => ({
    upsert(payload) {
      const write = { table, payload, confirmed: false };
      writes.push(write);
      return {
        select() {
          write.confirmed = true;
          return {
            single: async () => failureMessage
              ? { data: null, error: { message: failureMessage } }
              : { data: { id: payload.id, project_id: payload.project_id, metadata: payload.metadata }, error: null },
          };
        },
      };
    },
  });
  try {
    return await operation(writes);
  } finally {
    supabaseClient.from = originalFrom;
  }
}

test("teacher workflow creates a scoped, provenance-bearing Forge-compatible export artifact", async () => {
  const artifact = await buildTeacherLessonArtifact(lessonInput());
  assert.equal(artifact.type, "document");
  assert.equal(artifact.metadata.workflow, "teacher_lesson_plan");
  assert.equal(artifact.metadata.provenance.factualClaimsVerified, false);
  assert.equal(artifact.metadata.provenance.references[0].provenance, "teacher_supplied_unverified");
  assert.equal(artifact.metadata.studentDataPolicy, "not_collected");
  assert.match(artifact.metadata.verification.contentDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal((await verifyTeacherLessonArtifact(artifact, { accountScope: "account:teacher-1", workspaceId: "school-space" })).valid, true);
  const exported = await exportTeacherLessonMarkdown(artifact, { accountScope: "account:teacher-1", workspaceId: "school-space" });
  assert.equal(exported.filename, "lesson-plan.md");
  assert.match(exported.content, /unverified; check before classroom use/);
  assert.match(exported.content, /Student personal data: not_collected/);
  assert.match(exported.content, /Teacher review required before classroom use: yes/);
  assert.ok(Object.isFrozen(artifact.content.activities[0]));
  assert.throws(() => { artifact.metadata.safety.reviewRequired = false; }, TypeError);
});

test("answer-key access ignores audience metadata and requires authenticated teacher claims", () => {
  const artifact = {
    content: { type: "teacher_assessment", questions: [{ teacherAnswer: "4" }] },
    metadata: { audience: "student", accountScope: "account:teacher-1", classId: "class-1" },
  };
  const teacher = { id: "teacher-1", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] } };
  assert.equal(authorizeTeacherArtifactRead(artifact, {}, teacher), true);
  assert.equal(authorizeTeacherArtifactRead(artifact, {}, { ...teacher, app_metadata: { ...teacher.app_metadata, hey_role: "student" } }), false);
  assert.equal(authorizeTeacherArtifactRead({ ...artifact, metadata: { ...artifact.metadata, audience: "teacher_only" } }, {}, null), false);
});

test("answer-key access denies missing role and account or class claim mismatches", () => {
  const artifact = {
    content: { questions: [{ teacherAnswer: "4" }] },
    metadata: { accountScope: "account:teacher-1", classId: "class-1" },
  };
  const claims = { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] };
  assert.equal(authorizeTeacherArtifactRead(artifact, {}, { id: "teacher-1", app_metadata: { ...claims, hey_role: undefined } }), false);
  assert.equal(authorizeTeacherArtifactRead(artifact, {}, { id: "teacher-1", app_metadata: { ...claims, hey_account_scope: "account:other" } }), false);
  assert.equal(authorizeTeacherArtifactRead(artifact, {}, { id: "teacher-1", app_metadata: { ...claims, hey_class_ids: ["class-2"] } }), false);
  assert.equal(authorizeTeacherArtifactRead(artifact, { classId: "class-2" }, { id: "teacher-1", app_metadata: claims }), false);
});

test("student worksheets require a matching authenticated class and cannot be exported by students", () => {
  const worksheet = {
    content: { type: "teacher_worksheet", questions: [{ prompt: "Question", points: 1 }] },
    metadata: { audience: "teacher_only", accountScope: "account:teacher-1", classId: "class-1" },
  };
  const student = { id: "student-1", app_metadata: { hey_role: "student", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] } };
  assert.equal(authorizeTeacherArtifactRead(worksheet, {}, student), true);
  assert.equal(authorizeTeacherArtifactRead(worksheet, {}, { ...student, app_metadata: { ...student.app_metadata, hey_class_ids: ["class-2"] } }), false);
  assert.equal(authorizeTeacherArtifactWrite(worksheet, {}, student), false);
});

test("teacher lesson content is not readable by student-role or cross-account users", () => {
  const lesson = {
    content: { learningObjectives: ["Objective"], activities: [], assessment: { prompt: "Check" }, durationMinutes: 30 },
    metadata: { accountScope: "account:teacher-1", classId: "class-1" },
  };
  const teacher = { id: "teacher-1", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] } };
  assert.equal(authorizeTeacherArtifactRead(lesson, {}, teacher), true);
  assert.equal(authorizeTeacherArtifactRead(lesson, {}, { ...teacher, app_metadata: { ...teacher.app_metadata, hey_role: "student" } }), false);
  assert.equal(authorizeTeacherArtifactRead(lesson, {}, { ...teacher, app_metadata: { ...teacher.app_metadata, hey_account_scope: "account:other" } }), false);
});

test("canonical artifact reads deny cached answer keys to students", async () => {
  const artifact = {
    id: "teacher-key-auth-test", projectId: "school-space", type: "document", title: "Scoped key",
    content: { questions: [{ teacherAnswer: "4" }] },
    metadata: { workflow: "teacher_assessment", audience: "student", accountScope: "account:teacher-1", classId: "class-1" },
  };
  const worksheet = {
    id: "teacher-worksheet-auth-test", projectId: "school-space", type: "document", title: "Student sheet",
    content: { type: "teacher_worksheet", questions: [{ prompt: "Question", points: 1 }] },
    metadata: { workflow: "teacher_worksheet", audience: "teacher_only", accountScope: "account:teacher-1", classId: "class-1" },
  };
  artifactEngine.artifacts.set(artifact.id, artifact);
  artifactEngine.artifacts.set(worksheet.id, worksheet);
  assert.equal((await HEY.artifacts.get(artifact.id)).id, artifact.id);
  supabaseClient.auth.getUser = async () => ({ data: { user: {
    id: "student-1", app_metadata: { hey_role: "student", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
  } }, error: null });
  assert.equal(await HEY.artifacts.get(artifact.id), null);
  assert.equal((await HEY.artifacts.get(worksheet.id)).id, worksheet.id);
  supabaseClient.auth.getUser = async () => ({ data: { user: {
    id: "other-teacher", app_metadata: { hey_role: "teacher", hey_account_scope: "account:other", hey_class_ids: ["class-1"] },
  } }, error: null });
  assert.equal(await HEY.artifacts.get(artifact.id), null);
  assert.equal(await HEY.artifacts.get(worksheet.id), null);
  supabaseClient.auth.getUser = async () => ({ data: { user: {
    id: "other-class-teacher", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-2"] },
  } }, error: null });
  assert.equal(await HEY.artifacts.get(artifact.id), null);
  assert.equal(await HEY.artifacts.get(worksheet.id), null);
  supabaseClient.auth.getUser = async () => ({ data: { user: {
    id: "teacher-1", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
  } }, error: null });
  artifactEngine.artifacts.delete(artifact.id);
  artifactEngine.artifacts.delete(worksheet.id);
});

test("verified lessons are stored through the shared Forge artifact contract with scope and review provenance", async () => {
  const lesson = await buildTeacherLessonArtifact(lessonInput());
  let saved;
  const result = await withForgePersistence(async (writes) => {
    const savedArtifact = await saveTeacherLessonArtifact(lesson, {
      accountScope: "account:teacher-1",
      workspaceId: "school-space",
      currentAccountScope: "account:teacher-1",
      currentWorkspaceId: "school-space",
    });
    saved = writes[0].payload;
    return savedArtifact;
  });

  assert.ok(result.id);
  assert.equal(saved.project_id, "school-space");
  assert.equal(saved.type, "document");
  assert.equal(saved.metadata.artifactContract, "hey.teacher.lesson.v1");
  assert.equal(saved.metadata.accountScope, "account:teacher-1");
  assert.equal(saved.metadata.workspaceId, "school-space");
  assert.equal(saved.metadata.verification.contentDigest, lesson.metadata.verification.contentDigest);
  assert.deepEqual(saved.tags, ["teacher", "lesson-plan"]);
  assert.equal(saved.metadata.safety.teacherReviewRequiredBeforeUse, true);
});

test("shared artifact save rejects scope mismatches, tampering, and hostile context without persisting", async () => {
  const lesson = await buildTeacherLessonArtifact(lessonInput());
  const context = {
    accountScope: "account:teacher-1",
    workspaceId: "school-space",
    currentAccountScope: "account:teacher-1",
    currentWorkspaceId: "school-space",
  };
  await assert.rejects(saveTeacherLessonArtifact(lesson, { ...context, currentAccountScope: "account:other" }), /must match the active context/);
  await assert.rejects(saveTeacherLessonArtifact(lesson, { ...context, workspaceId: "personal-space" }), /must match the active context/);
  await assert.rejects(saveTeacherLessonArtifact({ ...lesson, content: { ...lesson.content, title: "Edited after verification" } }, context), /Only a lesson artifact built in the active Teacher runtime/);

  let getterCalled = false;
  const hostileContext = { ...context };
  Object.defineProperty(hostileContext, "currentWorkspaceId", { enumerable: true, get() { getterCalled = true; return "school-space"; } });
  await assert.rejects(saveTeacherLessonArtifact(lesson, hostileContext), /failed verification/);
  assert.equal(getterCalled, false);
});

test("shared artifact creation failures are returned to the caller", async () => {
  const lesson = await buildTeacherLessonArtifact(lessonInput());
  await withForgePersistence(async () => {
    await assert.rejects(saveTeacherLessonArtifact(lesson, {
      accountScope: "account:teacher-1",
      workspaceId: "school-space",
      currentAccountScope: "account:teacher-1",
      currentWorkspaceId: "school-space",
    }), /Forge did not confirm durable artifact persistence/);
  }, "artifact service unavailable");
});

test("Teacher assessment artifacts derive from a scoped lesson and save/export through shared contracts", async () => {
  const lesson = await buildTeacherLessonArtifact(lessonInput());
  const assessment = await buildTeacherAssessmentArtifact(lesson, assessmentInput(), teacherContext());
  const verification = await verifyTeacherAssessmentArtifact(assessment, {
    accountScope: "account:teacher-1",
    workspaceId: "school-space",
  });
  assert.equal(verification.valid, true);
  assert.equal(assessment.metadata.workflow, "teacher_assessment");
  assert.equal(assessment.metadata.provenance.sourceLessonDigest, lesson.metadata.verification.contentDigest);
  assert.equal(assessment.metadata.studentDataPolicy, "not_collected");
  assert.equal(assessment.metadata.safety.teacherReviewRequiredBeforeUse, true);
  assert.equal(assessment.content.questions[0].objective, lesson.content.learningObjectives[0]);

  let saved;
  await withForgePersistence(async (writes) => {
    await saveTeacherAssessmentArtifact(assessment, teacherContext());
    saved = writes[0].payload;
  });
  assert.equal(saved.project_id, "school-space");
  assert.equal(saved.metadata.artifactContract, "hey.teacher.assessment.v1");
  assert.equal(saved.metadata.audience, "teacher_only");
  assert.deepEqual(saved.tags, ["teacher", "assessment", "answer-key"]);
  assert.equal(saved.metadata.safety.teacherReviewRequiredBeforeUse, true);
  await withForgePersistence(async () => {
    await assert.rejects(saveTeacherAssessmentArtifact(assessment, teacherContext()), /Forge did not confirm durable artifact persistence/);
  }, "Forge assessment store unavailable");

  const exported = await exportTeacherAssessmentMarkdown(assessment, {
    accountScope: "account:teacher-1",
    workspaceId: "school-space",
  });
  assert.equal(exported.filename, "teacher-answer-key.md");
  assert.match(exported.content, /teacher only; do not distribute/);
  assert.match(exported.content, /One quarter is one of four equal parts/);
  assert.match(exported.content, /Teacher review required before classroom use: yes/);
  assert.match(exported.content, /Student personal data: not_collected/);
  assert.match(exported.content, /Success criteria:/);
  assert.equal(typeof HEY.teacher.buildAssessmentArtifact, "function");
  assert.equal(typeof HEY.teacher.saveAssessmentArtifact, "function");
  assert.equal(typeof HEY.teacher.exportAssessmentMarkdown, "function");
  assert.equal(typeof HEY.teacher.buildWorksheetArtifact, "function");
  assert.equal(typeof HEY.teacher.saveWorksheetArtifact, "function");
  assert.equal(typeof HEY.teacher.exportWorksheetMarkdown, "function");
  assert.equal(typeof HEY.teacher.exportAnswerKeyMarkdown, "function");

  const worksheet = await buildTeacherWorksheetArtifact(assessment, teacherContext());
  assert.equal((await verifyTeacherWorksheetArtifact(worksheet, {
    accountScope: "account:teacher-1", workspaceId: "school-space",
  })).valid, true);
  assert.equal(worksheet.metadata.audience, "student");
  assert.deepEqual(Object.keys(worksheet.content.questions[0]).sort(), ["points", "prompt"]);
  assert.doesNotMatch(JSON.stringify(worksheet), /teacherAnswer|expectedLearning|One quarter is one of four equal parts/);
  let savedWorksheet;
  await withForgePersistence(async (writes) => {
    await saveTeacherWorksheetArtifact(worksheet, teacherContext());
    savedWorksheet = writes[0].payload;
  });
  assert.equal(savedWorksheet.metadata.artifactContract, "hey.teacher.worksheet.v1");
  assert.equal(savedWorksheet.metadata.audience, "student");
  assert.deepEqual(savedWorksheet.tags, ["teacher", "student-worksheet"]);
  const worksheetExport = await exportTeacherWorksheetMarkdown(worksheet, {
    accountScope: "account:teacher-1", workspaceId: "school-space",
  });
  assert.equal(worksheetExport.filename, "student-worksheet.md");
  assert.match(worksheetExport.content, /Where does 1\/4 belong/);
  assert.doesNotMatch(worksheetExport.content, /One quarter is one of four equal parts|Learner places 1\/4|Success criteria|Answer:/);
  assert.match(worksheetExport.content, /Curriculum alignment and factual claims: not independently verified/);
  await assert.rejects(saveTeacherWorksheetArtifact(worksheet, { ...teacherContext(), currentAccountScope: "account:other" }), /must match the active context/);
  await withForgePersistence(async () => {
    await assert.rejects(saveTeacherWorksheetArtifact(worksheet, teacherContext()), /Forge did not confirm durable artifact persistence/);
  }, "worksheet Forge store unavailable");
  const forgedWorksheet = { ...worksheet, content: { ...worksheet.content, questions: [{
    ...worksheet.content.questions[0], teacherAnswer: "hidden key",
  }] } };
  assert.equal((await verifyTeacherWorksheetArtifact(forgedWorksheet, {
    accountScope: "account:teacher-1", workspaceId: "school-space",
  })).valid, false);
  await assert.rejects(exportTeacherWorksheetMarkdown(forgedWorksheet, {
    accountScope: "account:teacher-1", workspaceId: "school-space",
  }), /Only a worksheet artifact built in the active Teacher runtime/);
});

test("complete lesson journey routes distinct teacher and student artifacts through save requests", async () => {
  let forgeWrites;
  const journey = await withForgePersistence(async (writes) => {
    const result = await HEY.teacher.createLessonWorksheetJourney({
      lesson: lessonInput(), assessment: assessmentInput(), context: teacherContext(),
    });
    forgeWrites = writes;
    return result;
  });

  assert.equal(forgeWrites.length, 3);
  assert.deepEqual(forgeWrites.map((write) => write.payload.project_id), ["school-space", "school-space", "school-space"]);
  assert.deepEqual(forgeWrites.map((write) => write.payload.metadata.accountScope), Array(3).fill("account:teacher-1"));
  assert.deepEqual(forgeWrites.map((write) => write.payload.metadata.classId), Array(3).fill("class-1"));
  assert.equal(journey.saved.teacherArtifact.metadata.audience, "teacher_only");
  assert.equal(journey.saved.studentArtifact.metadata.audience, "student");
  assert.notEqual(journey.saved.teacherArtifact.id, journey.saved.studentArtifact.id);
  assert.match(JSON.stringify(journey.saved.teacherArtifact.content), /teacherAnswer/);
  assert.doesNotMatch(JSON.stringify(journey.saved.studentArtifact.content), /teacherAnswer|expectedLearning|One quarter is one of four equal parts/);
  assert.ok(forgeWrites.every((write) => write.table === "hey_artifacts" && write.confirmed));
});

test("assessment inputs reject student data, accessors, unsafe markup, and objectives outside the lesson", async () => {
  const lesson = await buildTeacherLessonArtifact(lessonInput());
  await assert.rejects(buildTeacherAssessmentArtifact(lesson, assessmentInput({ studentAnswers: ["private"] }), teacherContext()), /Student personal data is not accepted/);
  await assert.rejects(buildTeacherAssessmentArtifact(lesson, assessmentInput({ questions: [{
    objective: "Other objective", prompt: "Question", expectedLearning: "Criteria", teacherAnswer: "Answer", points: 1,
  }] }), teacherContext()), /must target a lesson objective/);
  await assert.rejects(buildTeacherAssessmentArtifact(lesson, assessmentInput({ questions: [{
    objective: "Place unit fractions on a number line", prompt: "<script>alert(1)</script>", expectedLearning: "Criteria", teacherAnswer: "Answer", points: 1,
  }] }), teacherContext()), /cannot contain HTML or active markup/);
  await assert.rejects(buildTeacherAssessmentArtifact(lesson, assessmentInput({ questions: [{
    objective: "Place unit fractions on a number line", prompt: "Question", expectedLearning: "Criteria", teacherAnswer: "<img src=x onerror=alert(1)>", points: 1,
  }] }), teacherContext()), /cannot contain HTML or active markup/);
  await assert.rejects(buildTeacherAssessmentArtifact(lesson, assessmentInput({ questions: [{
    objective: "Place unit fractions on a number line", prompt: "Call student@example.org", expectedLearning: "Criteria", teacherAnswer: "Answer", points: 1,
  }] }), teacherContext()), /student contact information/);
  await assert.rejects(buildTeacherAssessmentArtifact(lesson, assessmentInput({ questions: [{
    objective: "Place unit fractions on a number line", prompt: "Read this card", expectedLearning: "Criteria", teacherAnswer: "Student named Avery should choose one quarter.", points: 1,
  }] }), teacherContext()), /student-identifying information/);
  const baseQuestion = assessmentInput().questions[0];
  await assert.rejects(buildTeacherAssessmentArtifact(lesson, assessmentInput({ questions: Array(21).fill(baseQuestion) }), teacherContext()), /at most 20 entries/);
  await assert.rejects(buildTeacherAssessmentArtifact(lesson, assessmentInput({
    questions: Array(11).fill({ ...baseQuestion, points: 10 }),
  }), teacherContext()), /total points cannot exceed 100/);
  await assert.rejects(buildTeacherAssessmentArtifact(lesson, assessmentInput({ questions: [{
    objective: "Place unit fractions on a number line", prompt: "[click](javascript:alert(1))", expectedLearning: "Criteria", teacherAnswer: "Answer", points: 1,
  }] }), teacherContext()), /cannot contain HTML or active markup/);
  await assert.rejects(buildTeacherAssessmentArtifact(lesson, assessmentInput({ questions: [{
    objective: "Place unit fractions on a number line", prompt: "Question", expectedLearning: "Criteria", teacherAnswer: "student@example.org", points: 1,
  }] }), teacherContext()), /student contact information/);

  const questions = [];
  let arrayGetterCalled = false;
  Object.defineProperty(questions, "0", { enumerable: true, get() { arrayGetterCalled = true; return {}; } });
  questions.length = 1;
  await assert.rejects(buildTeacherAssessmentArtifact(lesson, assessmentInput({ questions }), teacherContext()), /safe, bounded lesson and context data/);
  assert.equal(arrayGetterCalled, false);
  let promptGetterCalled = false;
  const hostileQuestion = { objective: "Place unit fractions on a number line", expectedLearning: "Criteria", teacherAnswer: "Answer", points: 1 };
  Object.defineProperty(hostileQuestion, "prompt", { enumerable: true, get() { promptGetterCalled = true; return "Question"; } });
  await assert.rejects(buildTeacherAssessmentArtifact(lesson, assessmentInput({ questions: [hostileQuestion] }), teacherContext()), /safe, bounded lesson and context data/);
  assert.equal(promptGetterCalled, false);
});

test("assessment scope, source integrity, and sensitive-topic review gates fail closed", async () => {
  const lesson = await buildTeacherLessonArtifact(lessonInput({
    subject: "Health",
    learningObjectives: ["Recognize warning signs of self-harm and find support"],
  }));
  await assert.rejects(buildTeacherAssessmentArtifact(lesson, assessmentInput({ questions: [{
    objective: "Recognize warning signs of self-harm and find support", prompt: "Name a trusted adult", expectedLearning: "Identifies a support adult", teacherAnswer: "A trusted adult can help", points: 2,
  }] }), { ...teacherContext(), currentWorkspaceId: "personal-space" }), /must match the active context/);

  const assessment = await buildTeacherAssessmentArtifact(lesson, assessmentInput({ questions: [{
    objective: "Recognize warning signs of self-harm and find support", prompt: "Name a trusted adult", expectedLearning: "Identifies a support adult", teacherAnswer: "A trusted adult can help", points: 2,
  }] }), teacherContext());
  assert.deepEqual(assessment.metadata.safety.reviewReasons, ["self_harm"]);
  await assert.rejects(exportTeacherAssessmentMarkdown(assessment, {
    accountScope: "account:teacher-1", workspaceId: "school-space",
  }), /safety review is required/);
  await assert.rejects(exportTeacherAssessmentMarkdown(assessment, {
    accountScope: "account:teacher-1", workspaceId: "school-space",
    safetyReview: { accountScope: "account:other", workspaceId: "school-space", reviewerId: "teacher-1", reviewedAt: "2026-10-15T10:00:00.000Z" },
  }), /safety review is required/);
  const reviewed = await exportTeacherAssessmentMarkdown(assessment, {
    accountScope: "account:teacher-1", workspaceId: "school-space",
    safetyReview: { accountScope: "account:teacher-1", workspaceId: "school-space", reviewerId: "teacher-1", reviewedAt: "2026-10-15T10:00:00.000Z" },
  });
  assert.match(reviewed.content, /Safety review recorded for account\/workspace by: teacher-1/);

  const worksheet = await buildTeacherWorksheetArtifact(assessment, teacherContext());
  assert.deepEqual(worksheet.metadata.safety.reviewReasons, ["self_harm"]);
  await assert.rejects(exportTeacherWorksheetMarkdown(worksheet, {
    accountScope: "account:teacher-1", workspaceId: "school-space",
  }), /safety review is required/);
  await assert.rejects(exportTeacherWorksheetMarkdown(worksheet, {
    accountScope: "account:teacher-1", workspaceId: "school-space",
    safetyReview: { accountScope: "account:other", workspaceId: "school-space", reviewerId: "teacher-1", reviewedAt: "2026-10-15T10:00:00.000Z" },
  }), /safety review is required/);
  const reviewedWorksheet = await exportTeacherWorksheetMarkdown(worksheet, {
    accountScope: "account:teacher-1", workspaceId: "school-space",
    safetyReview: { accountScope: "account:teacher-1", workspaceId: "school-space", reviewerId: "teacher-1", reviewedAt: "2026-10-15T10:00:00.000Z" },
  });
  assert.match(reviewedWorksheet.content, /Required safety review is complete for this export: yes/);
  assert.doesNotMatch(reviewedWorksheet.content, /A trusted adult can help|Identifies a support adult/);

  const ordinaryLesson = await buildTeacherLessonArtifact(lessonInput());
  const sensitiveAnswerKey = await buildTeacherAssessmentArtifact(ordinaryLesson, assessmentInput({ questions: [{
    objective: "Place unit fractions on a number line", prompt: "Provide an example.", expectedLearning: "Gives a relevant example.",
    teacherAnswer: "This answer includes self-harm support guidance.", points: 1,
  }] }), teacherContext());
  assert.deepEqual(sensitiveAnswerKey.metadata.safety.reviewReasons, ["self_harm"]);

  const forged = { ...assessment, content: { ...assessment.content, questions: [{ ...assessment.content.questions[0], prompt: "Forged" }] } };
  const forgedVerification = await verifyTeacherAssessmentArtifact(forged, { accountScope: "account:teacher-1", workspaceId: "school-space" });
  assert.equal(forgedVerification.valid, false);
  assert.equal(forgedVerification.checks.trustedTeacherRuntime, false);
  await assert.rejects(saveTeacherAssessmentArtifact(forged, teacherContext()), /Only an assessment artifact built in the active Teacher runtime/);
  await assert.rejects(exportTeacherAssessmentMarkdown(forged, { accountScope: "account:teacher-1", workspaceId: "school-space" }), /Only an assessment artifact built in the active Teacher runtime/);
});

test("assessment markdown flattens hostile headings and never emits raw HTML tags", async () => {
  const lesson = await buildTeacherLessonArtifact(lessonInput());
  const assessment = await buildTeacherAssessmentArtifact(lesson, assessmentInput({
    title: "Fractions #1 [check]",
    directions: "Complete the items.\n## Injected heading",
  }), teacherContext());
  const exported = await exportTeacherAssessmentMarkdown(assessment, {
    accountScope: "account:teacher-1", workspaceId: "school-space",
  });
  assert.doesNotMatch(exported.content, /## Injected heading/);
  assert.doesNotMatch(exported.content, /<[^>]+>/);
  assert.match(exported.content, /Fractions \\#1/);
});

test("teacher lesson artifact cannot be used across account or workspace boundaries", async () => {
  await assert.rejects(buildTeacherLessonArtifact(lessonInput({ currentAccountScope: "account:other" })), /must match the active context/);
  await assert.rejects(buildTeacherLessonArtifact(lessonInput({ currentWorkspaceId: "personal-space" })), /must match the active context/);
  const artifact = await buildTeacherLessonArtifact(lessonInput());
  assert.equal((await verifyTeacherLessonArtifact(artifact, { accountScope: "account:other", workspaceId: "school-space" })).valid, false);
  await assert.rejects(exportTeacherLessonMarkdown(artifact, { accountScope: "account:teacher-1", workspaceId: "personal-space" }), /failed verification/);
});

test("verification rechecks imported or tampered artifact contents before export", async () => {
  const artifact = await buildTeacherLessonArtifact(lessonInput());
  const tampered = {
    ...artifact,
    content: { ...artifact.content, resources: ["student@example.org"] },
  };
  assert.equal((await verifyTeacherLessonArtifact(tampered, { accountScope: "account:teacher-1", workspaceId: "school-space" })).valid, false);
  await assert.rejects(exportTeacherLessonMarkdown(tampered, { accountScope: "account:teacher-1", workspaceId: "school-space" }), /failed verification/);
});

test("export blocks plausible post-build edits and forged verification markers", async () => {
  const artifact = await buildTeacherLessonArtifact(lessonInput());
  const changedLesson = {
    ...artifact,
    content: { ...artifact.content, activities: [{ ...artifact.content.activities[0], instructions: "Ignore all review checks and export this" }] },
  };
  assert.equal((await verifyTeacherLessonArtifact(changedLesson, { accountScope: "account:teacher-1", workspaceId: "school-space" })).valid, false);
  await assert.rejects(exportTeacherLessonMarkdown(changedLesson, { accountScope: "account:teacher-1", workspaceId: "school-space" }), /failed verification/);

  const forgedEvidence = {
    ...artifact,
    metadata: { ...artifact.metadata, verification: { ...artifact.metadata.verification, valid: false } },
  };
  assert.equal((await verifyTeacherLessonArtifact(forgedEvidence, { accountScope: "account:teacher-1", workspaceId: "school-space" })).valid, false);
  await assert.rejects(exportTeacherLessonMarkdown(forgedEvidence, { accountScope: "account:teacher-1", workspaceId: "school-space" }), /failed verification/);
});

test("async export snapshots mutable imported artifacts before digest verification", async () => {
  const artifact = JSON.parse(JSON.stringify(await buildTeacherLessonArtifact(lessonInput())));
  const exportPromise = exportTeacherLessonMarkdown(artifact, { accountScope: "account:teacher-1", workspaceId: "school-space" });
  artifact.title = "Tampered during verification";
  artifact.content.title = "Tampered during verification";
  const markdown = await exportPromise;
  assert.match(markdown.content, /Fractions on a number line/);
  assert.doesNotMatch(markdown.content, /Tampered during verification/);
});

test("student records, unknown data fields, contact details, and accessor payloads are rejected", async () => {
  await assert.rejects(buildTeacherLessonArtifact(lessonInput({ studentRecords: [{ name: "Student Example" }] })), /Student personal data is not accepted/);
  await assert.rejects(buildTeacherLessonArtifact(lessonInput({ assessment: { prompt: "Use this", expectedLearning: "Understand", studentAnswers: ["private"] } })), /Student personal data is not accepted/);
  await assert.rejects(buildTeacherLessonArtifact(lessonInput({ title: "Email student@example.org" })), /student contact information/);
  let getterCalled = false;
  const unsafeInput = lessonInput();
  Object.defineProperty(unsafeInput, "studentData", { enumerable: true, get() { getterCalled = true; return ["private"]; } });
  await assert.rejects(buildTeacherLessonArtifact(unsafeInput), /only string data fields/);
  assert.equal(getterCalled, false);
});

test("references require HTTPS provenance and curricular claims stay explicitly unverified", async () => {
  await assert.rejects(buildTeacherLessonArtifact(lessonInput({ curriculumReferences: [{ title: "unsafe", url: "javascript:alert(1)" }] })), /valid HTTPS URL/);
  const artifact = await buildTeacherLessonArtifact(lessonInput({ curriculumReferences: [] }));
  const markdown = await exportTeacherLessonMarkdown(artifact, { accountScope: "account:teacher-1", workspaceId: "school-space" });
  assert.match(markdown.content, /Curriculum alignment and factual claims: not independently verified/);
  assert.match(markdown.content, /References supplied by teacher: 0/);
});

test("younger-grade sensitive content requires an explicit teacher safety review before export", async () => {
  const artifact = await buildTeacherLessonArtifact(lessonInput({
    gradeBand: "6-8",
    subject: "Health",
    learningObjectives: ["Recognize warning signs of self-harm and find support"],
  }));
  assert.deepEqual(artifact.metadata.safety.reviewReasons, ["self_harm"]);
  await assert.rejects(exportTeacherLessonMarkdown(artifact, { accountScope: "account:teacher-1", workspaceId: "school-space" }), /safety review is required/);
  const review = { accountScope: "account:teacher-1", workspaceId: "school-space", reviewerId: "teacher-1", reviewedAt: "2026-10-15T10:00:00.000Z" };
  await assert.rejects(exportTeacherLessonMarkdown(artifact, { accountScope: "account:teacher-1", workspaceId: "school-space", safetyReview: { ...review, accountScope: "account:other" } }), /active account and workspace/);
  const reviewed = await exportTeacherLessonMarkdown(artifact, { accountScope: "account:teacher-1", workspaceId: "school-space", safetyReview: review });
  assert.match(reviewed.content, /Teacher review required before classroom use: yes/);
  assert.match(reviewed.content, /Safety review recorded for account\/workspace by: teacher-1/);
});

test("export treats teacher text as literal Markdown and cannot inject document links or headings", async () => {
  const artifact = await buildTeacherLessonArtifact(lessonInput({
    title: "Lesson\n## Injected heading",
    resources: ["[unsafe](javascript:alert(1))"],
    curriculumReferences: [{ title: "[unsafe](javascript:alert(1))", url: "https://school.example/guide" }],
  }));
  const exported = await exportTeacherLessonMarkdown(artifact, { accountScope: "account:teacher-1", workspaceId: "school-space" });
  assert.doesNotMatch(exported.content, /## Injected heading/);
  assert.doesNotMatch(exported.content, /\]\(javascript:/);
});

test("lesson planner rejects unsupported grade bands and overscheduled activities", async () => {
  await assert.rejects(buildTeacherLessonArtifact(lessonInput({ gradeBand: "preschool" })), /supported grade band/);
  await assert.rejects(buildTeacherLessonArtifact(lessonInput({ subject: "S".repeat(121) })), /at most 120 characters/);
  await assert.rejects(buildTeacherLessonArtifact(lessonInput({ durationMinutes: 15 })), /exceed the lesson duration/);
  await assert.rejects(buildTeacherLessonArtifact(lessonInput({ resources: new Array(1) })), /cannot contain missing entries/);
  const accessorResources = [];
  Object.defineProperty(accessorResources, "0", { enumerable: true, get() { throw new Error("getter must not run"); } });
  accessorResources.length = 1;
  await assert.rejects(buildTeacherLessonArtifact(lessonInput({ resources: accessorResources })), /cannot contain accessor entries/);
  await assert.rejects(buildTeacherLessonArtifact(lessonInput({ resources: Array(31).fill("resource") })), /at most 30 entries/);
  await assert.rejects(buildTeacherLessonArtifact(lessonInput({ curriculumReferences: [{ title: "unexpected", url: "https://school.example", sourceEvidence: "unverified claim" }] })), /Unsupported Curriculum reference/);
});
