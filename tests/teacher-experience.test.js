import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTeacherLessonArtifact,
  exportTeacherLessonMarkdown,
  verifyTeacherLessonArtifact,
} from "../src/core/teacherExperience.js";

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
  await assert.rejects(buildTeacherLessonArtifact(lessonInput({ durationMinutes: 15 })), /exceed the lesson duration/);
  await assert.rejects(buildTeacherLessonArtifact(lessonInput({ resources: new Array(1) })), /cannot contain missing entries/);
  const accessorResources = [];
  Object.defineProperty(accessorResources, "0", { enumerable: true, get() { throw new Error("getter must not run"); } });
  accessorResources.length = 1;
  await assert.rejects(buildTeacherLessonArtifact(lessonInput({ resources: accessorResources })), /cannot contain accessor entries/);
  await assert.rejects(buildTeacherLessonArtifact(lessonInput({ resources: Array(31).fill("resource") })), /at most 30 entries/);
  await assert.rejects(buildTeacherLessonArtifact(lessonInput({ curriculumReferences: [{ title: "unexpected", url: "https://school.example", sourceEvidence: "unverified claim" }] })), /Unsupported Curriculum reference/);
});
