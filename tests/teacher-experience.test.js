import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTeacherActivityHandoutArtifact,
  buildTeacherAssessmentArtifact,
  buildTeacherLessonArtifact,
  buildTeacherWorksheetArtifact,
  exportTeacherAssessmentMarkdown,
  exportTeacherLessonMarkdown,
  exportTeacherWorksheetMarkdown,
  saveTeacherActivityHandoutArtifact,
  saveTeacherAssessmentArtifact,
  saveTeacherLessonArtifact,
  saveTeacherWorksheetArtifact,
  verifyTeacherAssessmentArtifact,
  verifyTeacherLessonArtifact,
  verifyTeacherWorksheetArtifact,
} from "../src/core/teacherExperience.js";
import HEY from "../src/core/index.js";
import { supabaseClient } from "../src/lib/supabase.js";
import { authorizeTeacherArtifactRead, authorizeTeacherArtifactWrite, isTeacherActivityHandoutArtifact, isTeacherAnswerKeyArtifact } from "../src/core/teacherArtifactAccess.js";
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

async function withForgeBatchPersistence(operation, { failBeforeCommit = false, loseFirstResponse = false, mismatchResponse = false, mismatchReceipt = null } = {}) {
  const originalRpc = supabaseClient.rpc;
  const rowsById = new Map();
  const calls = [];
  let transactionTail = Promise.resolve();
  let rpcCalls = 0;
  supabaseClient.rpc = (name, args) => {
    const transaction = transactionTail.then(async () => {
      calls.push({ name, args });
      rpcCalls += 1;
      if (failBeforeCommit && rpcCalls === 1) return { data: null, error: { message: "injected atomic batch failure" } };
      const batch = args.p_artifacts;
      for (const row of batch) {
        const existing = rowsById.get(row.id);
        if (existing && (JSON.stringify(existing.content) !== JSON.stringify(row.content)
          || JSON.stringify(existing.metadata) !== JSON.stringify(row.metadata))) {
          return { data: null, error: { message: "idempotency payload mismatch" } };
        }
      }
      for (const row of batch) {
        if (!rowsById.has(row.id)) rowsById.set(row.id, {
          ...row,
          status: "draft", version: 1, branch_name: "main", parent_version_id: null,
          created_at: "2026-10-15T00:00:00.000Z", updated_at: "2026-10-15T00:00:00.000Z", created_by: "teacher-1",
        });
      }
      if (loseFirstResponse && rpcCalls === 1) return { data: null, error: { message: "injected lost response after commit" } };
      const response = batch.map((row) => rowsById.get(row.id));
      if (mismatchResponse && rpcCalls === 1) response[0] = { ...response[0], metadata: { ...response[0].metadata, classId: "other-class" } };
      if (mismatchReceipt && rpcCalls === 1) response[0] = { ...response[0], ...mismatchReceipt };
      return { data: response, error: null };
    });
    transactionTail = transaction.then(() => undefined, () => undefined);
    return transaction;
  };
  try {
    return await operation(calls, rowsById);
  } finally {
    supabaseClient.rpc = originalRpc;
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
    createdBy: "teacher-1",
    metadata: { audience: "student", accountScope: "account:teacher-1", classId: "class-1" },
  };
  const teacher = { id: "teacher-1", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] } };
  assert.equal(authorizeTeacherArtifactRead(artifact, {}, teacher), true);
  assert.equal(authorizeTeacherArtifactRead(artifact, {}, { ...teacher, id: "teacher-2" }), false);
  assert.equal(authorizeTeacherArtifactRead(artifact, {}, { ...teacher, app_metadata: { ...teacher.app_metadata, hey_role: "student" } }), false);
  assert.equal(authorizeTeacherArtifactRead({ ...artifact, metadata: { ...artifact.metadata, audience: "teacher_only" } }, {}, null), false);
});

test("answer-key access denies missing role and account or class claim mismatches", () => {
  const artifact = {
    content: { questions: [{ teacherAnswer: "4" }] },
    createdBy: "teacher-1",
    metadata: { accountScope: "account:teacher-1", classId: "class-1" },
  };
  const claims = { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] };
  assert.equal(authorizeTeacherArtifactRead(artifact, {}, { id: "teacher-1", app_metadata: { ...claims, hey_role: undefined } }), false);
  assert.equal(authorizeTeacherArtifactRead(artifact, {}, { id: "teacher-1", app_metadata: { ...claims, hey_account_scope: "account:other" } }), false);
  assert.equal(authorizeTeacherArtifactRead(artifact, {}, { id: "teacher-1", app_metadata: { ...claims, hey_class_ids: ["class-2"] } }), false);
  assert.equal(authorizeTeacherArtifactRead(artifact, { classId: "class-2" }, { id: "teacher-1", app_metadata: claims }), false);
});

test("same-class Teacher cannot derive private artifacts from another Teacher's lesson", async () => {
  const lesson = await buildTeacherLessonArtifact(lessonInput());
  const originalGetUser = supabaseClient.auth.getUser;
  try {
    supabaseClient.auth.getUser = async () => ({ data: { user: {
      id: "teacher-2", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
    } }, error: null });
    await assert.rejects(buildTeacherAssessmentArtifact(lesson, assessmentInput(), teacherContext()), /authored this lesson/);
    assert.equal(authorizeTeacherArtifactRead({ ...lesson, id: "legacy-private-lesson", createdBy: undefined }, {}, {
      id: "teacher-2", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
    }), false, "legacy private artifacts without a creator fail closed");
  } finally {
    supabaseClient.auth.getUser = originalGetUser;
  }
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
    createdBy: "teacher-1",
    metadata: { accountScope: "account:teacher-1", classId: "class-1" },
  };
  const teacher = { id: "teacher-1", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] } };
  assert.equal(authorizeTeacherArtifactRead(lesson, {}, teacher), true);
  assert.equal(authorizeTeacherArtifactRead(lesson, {}, { ...teacher, app_metadata: { ...teacher.app_metadata, hey_role: "student" } }), false);
  assert.equal(authorizeTeacherArtifactRead(lesson, {}, { ...teacher, app_metadata: { ...teacher.app_metadata, hey_account_scope: "account:other" } }), false);
});

test("legacy assessment markers keep malformed or answer-free private artifacts owner-only through history", async () => {
  const artifact = {
    id: "teacher-key-legacy-contract-marker", projectId: "school-space", type: "document", title: "Imported assessment",
    content: { type: "teacher_assessment", questions: [{ prompt: "Legacy prompt" }] },
    createdBy: "teacher-1",
    metadata: { workflow: "teacher_assessment", artifactContract: "hey.teacher.assessment.v1", audience: "student",
      accountScope: "account:teacher-1", classId: "class-1" },
  };
  const version = {
    id: "teacher-key-legacy-contract-version", artifact_id: artifact.id, version_number: 1,
    branch_name: "main", content: { type: "teacher_assessment", questions: [{ prompt: "Historical prompt" }] },
    metadata: {}, created_by: "teacher-1",
  };
  assert.equal(isTeacherAnswerKeyArtifact(artifact), true, "legacy assessment metadata keeps a damaged key in the private path");
  const owner = { id: "teacher-1", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] } };
  const sameClassTeacher = { ...owner, id: "teacher-2" };
  const damagedLesson = {
    content: { title: "Incomplete imported lesson" }, createdBy: "teacher-1",
    metadata: { workflow: "teacher_lesson_plan", accountScope: "account:teacher-1", classId: "class-1" },
  };
  assert.equal(authorizeTeacherArtifactRead(damagedLesson, {}, owner), true);
  assert.equal(authorizeTeacherArtifactRead(damagedLesson, {}, sameClassTeacher), false);
  assert.equal(authorizeTeacherArtifactRead(damagedLesson, {}, null), false);
  const deeplyNested = {};
  let cursor = deeplyNested;
  for (let index = 0; index < 36; index += 1) cursor = cursor.child = {};
  cursor.teacherAnswer = "deep answer";
  const deepArtifact = { content: deeplyNested, createdBy: "teacher-1", metadata: artifact.metadata };
  assert.equal(isTeacherAnswerKeyArtifact(deepArtifact), true, "uninspectable imported depth fails closed as private");
  assert.equal(authorizeTeacherArtifactRead(deepArtifact, {}, sameClassTeacher), false);
  artifactEngine.artifacts.set(artifact.id, artifact);
  const originalFrom = supabaseClient.from;
  const originalGetUser = supabaseClient.auth.getUser;
  supabaseClient.from = (table) => {
    assert.equal(table, "hey_artifact_versions");
    return {
      select() { return this; },
      eq() { return this; },
      single: async () => ({ data: version, error: null }),
      order() { return this; },
      limit: async () => ({ data: [version], error: null }),
    };
  };
  try {
    supabaseClient.auth.getUser = async () => ({ data: { user: {
      id: "teacher-2", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
    } }, error: null });
    assert.equal(await HEY.artifacts.get(artifact.id), null);
    assert.equal(await HEY.artifacts.getVersion(artifact.id, version.id), null);
    assert.deepEqual(await HEY.artifacts.getHistory(artifact.id), []);

    supabaseClient.auth.getUser = async () => ({ data: { user: {
      id: "teacher-1", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
    } }, error: null });
    assert.equal((await HEY.artifacts.get(artifact.id)).id, artifact.id);
    assert.equal((await HEY.artifacts.getVersion(artifact.id, version.id)).id, version.id);
    assert.equal((await HEY.artifacts.getHistory(artifact.id)).length, 1);

    supabaseClient.auth.getUser = async () => ({ data: { user: {
      id: "student-1", app_metadata: { hey_role: "student", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
    } }, error: null });
    assert.equal(await HEY.artifacts.get(artifact.id), null);
  } finally {
    supabaseClient.from = originalFrom;
    supabaseClient.auth.getUser = originalGetUser;
    artifactEngine.artifacts.delete(artifact.id);
    artifactEngine.versionGraphs.delete(artifact.id);
  }
});

test("canonical artifact reads deny cached answer keys to students", async () => {
  const artifact = {
    id: "teacher-key-auth-test", projectId: "school-space", type: "document", title: "Scoped key",
    content: { questions: [{ teacherAnswer: "4" }] },
    createdBy: "teacher-1",
    metadata: { workflow: "teacher_assessment", audience: "student", accountScope: "account:teacher-1", classId: "class-1" },
  };
  const worksheet = {
    id: "teacher-worksheet-auth-test", projectId: "school-space", type: "document", title: "Student sheet",
    content: { type: "teacher_worksheet", questions: [{ prompt: "Question", points: 1 }] },
    createdBy: "teacher-1",
    metadata: { workflow: "teacher_worksheet", audience: "teacher_only", accountScope: "account:teacher-1", classId: "class-1" },
  };
  artifactEngine.artifacts.set(artifact.id, artifact);
  artifactEngine.artifacts.set(worksheet.id, worksheet);
  assert.equal((await HEY.artifacts.get(artifact.id)).id, artifact.id);
  supabaseClient.auth.getUser = async () => ({ data: { user: {
    id: "teacher-2", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
  } }, error: null });
  assert.equal(await HEY.artifacts.get(artifact.id), null, "same-class Teacher cannot reopen another Teacher's answer key");
  assert.equal((await HEY.artifacts.get(worksheet.id)).id, worksheet.id, "student worksheet remains class-readable");
  assert.equal(await HEY.artifacts.getVersion(artifact.id, "version-1"), null);
  assert.deepEqual(await HEY.artifacts.getHistory(artifact.id), []);
  await assert.rejects(HEY.artifacts.restore(artifact.id, "version-1"), /Artifact or version not found/);
  supabaseClient.auth.getUser = async () => ({ data: { user: {
    id: "teacher-1", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
  } }, error: null });
  assert.equal((await HEY.artifacts.get(artifact.id)).id, artifact.id, "author retains access to the answer key");
  supabaseClient.auth.getUser = async () => ({ data: { user: {
    id: "student-1", app_metadata: { hey_role: "student", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
  } }, error: null });
  assert.equal(await HEY.artifacts.get(artifact.id), null);
  assert.equal((await HEY.artifacts.get(worksheet.id)).id, worksheet.id);
  const originalFrom = supabaseClient.from;
  let artifactTableReads = 0;
  supabaseClient.from = (table) => {
    if (table !== "hey_artifacts") throw new Error(`Unexpected table read: ${table}`);
    artifactTableReads += 1;
    const rows = [artifact, worksheet].map((value) => ({
      id: value.id, project_id: value.projectId, type: value.type, title: value.title,
      description: value.description, content: value.content, metadata: value.metadata,
      status: "draft", version: 1, parent_version_id: null, branch_name: "main",
      created_at: "2026-10-15T00:00:00.000Z", updated_at: "2026-10-15T00:00:00.000Z", created_by: value.createdBy, tags: [],
    }));
    const query = {
      select() { return this; },
      eq() { return this; },
      order() { return Promise.resolve({ data: rows, error: null }); },
    };
    return query;
  };
  assert.deepEqual((await HEY.artifacts.list("school-space")).map((value) => value.id), [worksheet.id]);
  const readsBeforeVersionCalls = artifactTableReads;
  assert.equal(await HEY.artifacts.getVersion(artifact.id, "version-1"), null);
  assert.deepEqual(await HEY.artifacts.getHistory(artifact.id), []);
  assert.deepEqual(await HEY.artifacts.getBranches(artifact.id), []);
  await assert.rejects(HEY.artifacts.compare(artifact.id, "v1", "v2"), /Artifact not found/);
  assert.equal(artifactTableReads, readsBeforeVersionCalls, "denied cached artifact must stop version reads before storage access");
  assert.deepEqual(await HEY.artifacts.getGraph(artifact.id), { nodes: [], edges: [] });
  supabaseClient.from = originalFrom;
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

test("artifact mutations require teacher write access even when a worksheet is readable", async () => {
  const originalGetUser = supabaseClient.auth.getUser;
  const worksheet = {
    id: "teacher-worksheet-write-auth-test", projectId: "school-space", type: "document", title: "Student sheet",
    content: { type: "teacher_worksheet", questions: [{ prompt: "Question", points: 1 }] },
    createdBy: "teacher-1",
    metadata: { workflow: "teacher_worksheet", accountScope: "account:teacher-1", classId: "class-1" },
    status: "draft", version: 1, branchName: "main", tags: [],
  };
  const key = {
    ...worksheet, id: "teacher-key-write-auth-test", createdBy: "teacher-1",
    content: { type: "teacher_assessment", questions: [{ prompt: "Question", teacherAnswer: "Private" }] },
    metadata: { workflow: "teacher_assessment", accountScope: "account:teacher-1", classId: "class-1" },
  };
  artifactEngine.artifacts.set(worksheet.id, worksheet);
  artifactEngine.artifacts.set(key.id, key);
  const readableStudent = { id: "student-1", app_metadata: { hey_role: "student", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] } };
  const peerTeacher = { id: "teacher-2", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] } };
  try {
    supabaseClient.auth.getUser = async () => ({ data: { user: readableStudent }, error: null });
    assert.equal((await artifactEngine.getArtifact(worksheet.id)).id, worksheet.id, "student can read class worksheet");
    await assert.rejects(artifactEngine.updateArtifact(worksheet.id, { title: "Tampered" }), /Artifact not found/);
    await assert.rejects(artifactEngine.createVersion(worksheet.id, { content: { type: "teacher_worksheet", answers: "injected" } }), /Artifact not found/);
    await assert.rejects(artifactEngine.branchArtifact(worksheet.id, { createdBy: "student-1" }), /Artifact not found/);
    await assert.rejects(artifactEngine.deleteArtifact(worksheet.id), /Artifact not found/);

    supabaseClient.auth.getUser = async () => ({ data: { user: peerTeacher }, error: null });
    await assert.rejects(artifactEngine.updateArtifact(key.id, { content: { questions: [] } }), /Artifact not found/);

    supabaseClient.auth.getUser = async () => ({ data: { user: null }, error: null });
    await assert.rejects(artifactEngine.updateArtifact(worksheet.id, { title: "No identity" }), /Artifact not found/);

    supabaseClient.auth.getUser = async () => ({ data: { user: {
      id: "teacher-1", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
    } }, error: null });
    assert.equal((await artifactEngine.updateArtifact(worksheet.id, { title: "Teacher edit" })).title, "Teacher edit");
  } finally {
    artifactEngine.artifacts.delete(worksheet.id);
    artifactEngine.artifacts.delete(key.id);
    artifactEngine.versionGraphs.delete(worksheet.id);
    artifactEngine.versionGraphs.delete(key.id);
    supabaseClient.auth.getUser = originalGetUser;
  }
});

test("canonical database reads fail closed for legacy private artifacts without a creator", async () => {
  const originalFrom = supabaseClient.from;
  const originalGetUser = supabaseClient.auth.getUser;
  const id = "teacher-key-legacy-no-creator";
  const row = {
    id, project_id: "school-space", type: "document", title: "Legacy private key", description: "",
    content: { questions: [{ prompt: "Question", teacherAnswer: "Answer" }] },
    metadata: { accountScope: "account:teacher-1", classId: "class-1", audience: "teacher_only" },
    created_by: null, status: "draft", version: 1, parent_version_id: null, branch_name: "main", tags: [],
  };
  artifactEngine.artifacts.delete(id);
  supabaseClient.auth.getUser = async () => ({ data: { user: {
    id: "teacher-1", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
  } }, error: null });
  supabaseClient.from = (table) => {
    assert.equal(table, "hey_artifacts");
    return { select() { return this; }, eq() { return this; }, single: async () => ({ data: row, error: null }) };
  };
  try {
    assert.equal(await HEY.artifacts.get(id), null);
    assert.equal(artifactEngine.artifacts.has(id), false, "unowned legacy private rows are not admitted to the cache");
  } finally {
    supabaseClient.from = originalFrom;
    supabaseClient.auth.getUser = originalGetUser;
    artifactEngine.artifacts.delete(id);
  }
});

test("restoring legacy worksheet history preserves scope and rejects answer-key injection", async () => {
  const worksheet = {
    id: "teacher-worksheet-legacy-restore", projectId: "school-space", type: "document", title: "Student activity",
    content: { type: "teacher_worksheet", title: "Student activity", questions: [{ prompt: "Original", points: 1 }] },
    metadata: { workflow: "teacher_worksheet", artifactContract: "hey.teacher.worksheet.v1", accountScope: "account:teacher-1",
      workspaceId: "school-space", classId: "class-1", audience: "student", studentDataPolicy: "not_collected" },
    createdBy: "teacher-1", status: "draft", version: 2, parentVersionId: null, branchName: "main", tags: [],
  };
  artifactEngine.artifacts.set(worksheet.id, worksheet);
  const originalFrom = supabaseClient.from;
  const originalGetUser = supabaseClient.auth.getUser;
  let selectedVersion;
  let persistedArtifact;
  const versionRow = (id, content, metadata = {}) => ({
    id, artifact_id: worksheet.id, version_number: 1, branch_name: "main", parent_version_id: null,
    content, metadata, status: "draft", created_at: "2026-10-15T09:00:00.000Z", created_by: "teacher-1",
  });
  supabaseClient.auth.getUser = async () => ({ data: { user: {
    id: "teacher-1", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
  } }, error: null });
  supabaseClient.from = (table) => {
    if (table === "hey_artifacts") return { upsert: async (payload) => { persistedArtifact = payload; return { data: payload, error: null }; } };
    if (table !== "hey_artifact_versions") throw new Error(`Unexpected table read: ${table}`);
    return {
      select() { return this; },
      eq() { return this; },
      order() { return this; },
      limit: async () => ({ data: [selectedVersion], error: null }),
      single: async () => ({ data: selectedVersion, error: null }),
      upsert: async () => ({ data: null, error: null }),
    };
  };
  try {
    selectedVersion = versionRow("legacy-worksheet-v1", {
      type: "teacher_worksheet", title: "Student activity", questions: [{ prompt: "Recovered prompt", points: 1 }],
    });
    const restored = await HEY.artifacts.restore(worksheet.id, selectedVersion.id);
    assert.equal(restored.createdBy, "teacher-1");
    assert.equal(restored.metadata.accountScope, "account:teacher-1");
    assert.equal(restored.metadata.workspaceId, "school-space");
    assert.equal(restored.metadata.classId, "class-1");
    assert.equal(restored.metadata.audience, "student");
    assert.equal(persistedArtifact.metadata.classId, "class-1");
    assert.doesNotMatch(JSON.stringify(restored.content), /teacherAnswer/);
    assert.equal((await HEY.artifacts.getHistory(worksheet.id)).length, 1, "owner can read recovered worksheet history");

    selectedVersion = versionRow("unsafe-worksheet-v2", {
      type: "teacher_worksheet", title: "Student activity",
      questions: [{ prompt: "Recovered prompt", points: 1, teacherAnswer: "leaked" }],
    });
    const before = restored.content;
    await assert.rejects(HEY.artifacts.restore(worksheet.id, selectedVersion.id), /answer-key data cannot be restored/);
    assert.equal(artifactEngine.artifacts.get(worksheet.id).content, before);

    selectedVersion = versionRow("wrong-scope-worksheet-v3", {
      type: "teacher_worksheet", title: "Student activity", questions: [{ prompt: "Cross-class", points: 1 }],
    }, { classId: "class-2" });
    supabaseClient.auth.getUser = async () => ({ data: { user: {
      id: "teacher-1", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1", "class-2"] },
    } }, error: null });
    await assert.rejects(HEY.artifacts.restore(worksheet.id, selectedVersion.id), /cannot change its classId scope/);
    assert.equal(artifactEngine.artifacts.get(worksheet.id).content, before);
  } finally {
    supabaseClient.from = originalFrom;
    supabaseClient.auth.getUser = originalGetUser;
    artifactEngine.artifacts.delete(worksheet.id);
    artifactEngine.versionGraphs.delete(worksheet.id);
  }
});

test("answer-key and worksheet export APIs reject student identities", async () => {
  const lesson = await buildTeacherLessonArtifact(lessonInput());
  const assessment = await buildTeacherAssessmentArtifact(lesson, assessmentInput(), teacherContext());
  const worksheet = await buildTeacherWorksheetArtifact(assessment, teacherContext());
  supabaseClient.auth.getUser = async () => ({ data: { user: {
    id: "student-1", app_metadata: { hey_role: "student", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
  } }, error: null });
  await assert.rejects(HEY.teacher.exportAssessmentMarkdown(assessment, {
    accountScope: "account:teacher-1", workspaceId: "school-space",
  }), /Authenticated teacher access/);
  await assert.rejects(HEY.teacher.exportAnswerKeyMarkdown(assessment, {
    accountScope: "account:teacher-1", workspaceId: "school-space",
  }), /Authenticated teacher access/);
  await assert.rejects(HEY.teacher.exportWorksheetMarkdown(worksheet, {
    accountScope: "account:teacher-1", workspaceId: "school-space",
  }), /Authenticated teacher access/);
  supabaseClient.auth.getUser = async () => ({ data: { user: {
    id: "teacher-1", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
  } }, error: null });
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
  assert.equal(saved.created_by, "teacher-1");
  assert.equal(saved.metadata.accountScope, "account:teacher-1");
  assert.equal(saved.metadata.workspaceId, "school-space");
  assert.equal(saved.metadata.verification.contentDigest, lesson.metadata.verification.contentDigest);
  assert.deepEqual(saved.tags, ["teacher", "lesson-plan"]);
  assert.equal(saved.metadata.safety.teacherReviewRequiredBeforeUse, true);
});

test("Teacher activity handout is class-authorized, answer-free, and saved through Forge", async () => {
  let lesson;
  await withForgeBatchPersistence(async () => {
    lesson = (await HEY.teacher.createLessonWorksheetJourney({
      lesson: lessonInput({ activities: [{
        title: "Build *a number line*", instructions: "Place [fraction] cards and explain each choice.", minutes: 20,
      }] }), assessment: assessmentInput(), context: teacherContext(),
    })).lesson;
  });
  const handout = await buildTeacherActivityHandoutArtifact(lesson, 0, teacherContext());
  assert.equal(handout.content.type, "teacher_activity_handout");
  assert.equal(handout.metadata.classId, "class-1");
  assert.equal(handout.metadata.audience, "student");
  assert.doesNotMatch(JSON.stringify(handout), /teacherAnswer|expectedLearning/);
  assert.equal(isTeacherActivityHandoutArtifact(handout), true);
  const classTeacher = { id: "teacher-1", app_metadata: {
    hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"],
  } };
  const sameClassStudent = { id: "student-1", app_metadata: {
    hey_role: "student", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"],
  } };
  const otherClassStudent = { id: "student-2", app_metadata: {
    hey_role: "student", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-2"],
  } };
  const otherClassTeacher = { id: "teacher-2", app_metadata: {
    hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-2"],
  } };
  assert.equal(authorizeTeacherArtifactRead(handout, { accountScope: "account:teacher-1", classId: "class-1" }, classTeacher), true);
  assert.equal(authorizeTeacherArtifactRead(handout, { accountScope: "account:teacher-1", classId: "class-1" }, sameClassStudent), true);
  assert.equal(authorizeTeacherArtifactRead(handout, { accountScope: "account:teacher-1", classId: "class-1" }, otherClassStudent), false);
  assert.equal(authorizeTeacherArtifactRead(handout, { accountScope: "account:teacher-1", classId: "class-1" }, otherClassTeacher), false);
  assert.equal(authorizeTeacherArtifactRead(handout, { accountScope: "account:teacher-2", classId: "class-1" }, classTeacher), false);
  assert.equal(authorizeTeacherArtifactWrite(handout, { accountScope: "account:teacher-1", classId: "class-1" }, classTeacher), true);
  assert.equal(authorizeTeacherArtifactWrite(handout, { accountScope: "account:teacher-1", classId: "class-1" }, sameClassStudent), false);
  assert.equal(authorizeTeacherArtifactWrite(handout, { accountScope: "account:teacher-1", classId: "class-1" }, otherClassTeacher), false);
  assert.equal((await HEY.teacher.verifyActivityHandoutArtifact(handout, {
    accountScope: "account:teacher-1", workspaceId: "school-space", classId: "class-1",
  })).valid, true);

  const saved = await withForgePersistence(async (writes) => {
    const artifact = await HEY.teacher.saveActivityHandoutArtifact(handout, teacherContext());
    assert.equal(writes.length, 1);
    assert.equal(writes[0].table, "hey_artifacts");
    assert.equal(writes[0].payload.metadata.artifactContract, "hey.teacher.activity_handout.v1");
    assert.equal(writes[0].payload.metadata.classId, "class-1");
    return artifact;
  });
  assert.equal(saved.content.type, "teacher_activity_handout");

  const safetyReview = {
    accountScope: "account:teacher-1", workspaceId: "school-space", reviewerId: "teacher-1",
    reviewedAt: "2026-10-16T10:30:00.000Z",
  };
  const exported = await HEY.teacher.exportActivityHandoutMarkdown(handout, {
    ...teacherContext(), safetyReview,
  });
  assert.equal(exported.filename, "student-activity-handout.md");
  assert.equal(exported.mimeType, "text/markdown");
  assert.match(exported.content, /## Activity directions/);
  assert.ok(exported.content.includes("# Build \\*a number line\\*"));
  assert.match(exported.content, /Teacher review completed for this account and workspace/);
  assert.doesNotMatch(exported.content, /teacherAnswer|expectedLearning/);
  await assert.rejects(HEY.teacher.exportActivityHandoutMarkdown(handout, teacherContext()), /Teacher review is required/);
  await assert.rejects(HEY.teacher.exportActivityHandoutMarkdown(handout, {
    ...teacherContext(), accountScope: "account:teacher-2", safetyReview,
  }), /Authenticated teacher access|failed verification/);
  await assert.rejects(HEY.teacher.exportActivityHandoutMarkdown(handout, {
    ...teacherContext(), safetyReview: { ...safetyReview, workspaceId: "other-space" },
  }), /must match the active account, workspace, and handout author/);
  let getterCalls = 0;
  const hostileReview = { ...safetyReview };
  Object.defineProperty(hostileReview, "reviewedAt", { enumerable: true, get() { getterCalls += 1; return safetyReview.reviewedAt; } });
  await assert.rejects(HEY.teacher.exportActivityHandoutMarkdown(handout, {
    ...teacherContext(), safetyReview: hostileReview,
  }), /safe, bounded data/);
  assert.equal(getterCalls, 0);
});

test("Teacher activity handout denies unauthorized class access and fails when Forge is unavailable", async () => {
  let lesson;
  await withForgeBatchPersistence(async () => {
    lesson = (await HEY.teacher.createLessonWorksheetJourney({
      lesson: lessonInput(), assessment: assessmentInput(), context: teacherContext(),
    })).lesson;
  });
  const originalGetUser = supabaseClient.auth.getUser;
  try {
    supabaseClient.auth.getUser = async () => ({ data: { user: {
      id: "teacher-1", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-other"] },
    } }, error: null });
    await assert.rejects(buildTeacherActivityHandoutArtifact(lesson, 0, teacherContext()), /Authenticated teacher access|source lesson failed verification/);
    supabaseClient.auth.getUser = async () => ({ data: { user: {
      id: "teacher-2", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
    } }, error: null });
    await assert.rejects(buildTeacherActivityHandoutArtifact(lesson, 0, teacherContext()), /Only the Teacher who authored this lesson/);
    supabaseClient.auth.getUser = originalGetUser;
    const handout = await buildTeacherActivityHandoutArtifact(lesson, 0, teacherContext());
    let failedArtifactId;
    await assert.rejects(withForgePersistence(async (writes) => {
      try {
        return await saveTeacherActivityHandoutArtifact(handout, teacherContext());
      } finally {
        failedArtifactId = writes[0]?.payload.id;
      }
    }, "provider unavailable"), /Forge did not confirm durable artifact persistence/);
    assert.ok(failedArtifactId);
    assert.equal(artifactEngine.artifacts.has(failedArtifactId), false);
  } finally {
    supabaseClient.auth.getUser = originalGetUser;
  }
});

test("Teacher activity handout rejects mismatched or accessor-backed scope before saving", async () => {
  let lesson;
  await withForgeBatchPersistence(async () => {
    lesson = (await HEY.teacher.createLessonWorksheetJourney({
      lesson: lessonInput(), assessment: assessmentInput(), context: teacherContext(),
    })).lesson;
  });
  const wrongScope = { ...teacherContext(), currentAccountScope: "account:teacher-2" };
  await assert.rejects(buildTeacherActivityHandoutArtifact(lesson, 0, wrongScope), /must match the active context/);
  const wrongClass = { ...teacherContext(), classId: "class-2", currentClassId: "class-2" };
  await assert.rejects(buildTeacherActivityHandoutArtifact(lesson, 0, wrongClass), /source lesson failed verification/);

  let getterCalls = 0;
  const hostileContext = teacherContext();
  Object.defineProperty(hostileContext, "classId", { enumerable: true, get() { getterCalls += 1; return "class-1"; } });
  await assert.rejects(buildTeacherActivityHandoutArtifact(lesson, 0, hostileContext), /safe, bounded data/);
  assert.equal(getterCalls, 0);
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
  let forgeCalls;
  const journey = await withForgeBatchPersistence(async (calls) => {
    const result = await HEY.teacher.createLessonWorksheetJourney({
      lesson: lessonInput(), assessment: assessmentInput({ questions: [
        assessmentInput().questions[0],
        { objective: "Place unit fractions on a number line", prompt: "Which is greater, 2/4 or 3/4?", expectedLearning: "Learner compares fractions with the same denominator.", teacherAnswer: "3/4 is greater because three equal parts exceed two.", points: 3 },
      ] }), context: teacherContext(),
    });
    forgeCalls = calls;
    return result;
  });

  assert.equal(forgeCalls.length, 1);
  assert.equal(forgeCalls[0].name, "hey_create_teacher_artifacts_batch");
  const forgeWrites = forgeCalls[0].args.p_artifacts;
  assert.equal(forgeWrites.length, 3);
  assert.deepEqual(forgeWrites.map((write) => write.project_id), ["school-space", "school-space", "school-space"]);
  assert.deepEqual(forgeWrites.map((write) => write.metadata.accountScope), Array(3).fill("account:teacher-1"));
  assert.deepEqual(forgeWrites.map((write) => write.metadata.classId), Array(3).fill("class-1"));
  assert.equal(new Set(forgeWrites.map((write) => write.id)).size, 3);
  assert.equal(journey.saved.teacherArtifact.metadata.audience, "teacher_only");
  assert.equal(journey.saved.studentArtifact.metadata.audience, "student");
  assert.notEqual(journey.saved.teacherArtifact.id, journey.saved.studentArtifact.id);
  assert.equal(journey.saved.teacherArtifact.content.questions.length, 2);
  assert.equal(journey.saved.teacherArtifact.content.questions[1].teacherAnswer, "3/4 is greater because three equal parts exceed two.");
  assert.equal(journey.saved.studentArtifact.content.questions.length, 2);
  assert.match(JSON.stringify(journey.saved.teacherArtifact.content), /teacherAnswer/);
  assert.doesNotMatch(JSON.stringify(journey.saved.studentArtifact.content), /teacherAnswer|expectedLearning|One quarter is one of four equal parts|three equal parts exceed two/);
  assert.match(JSON.stringify(journey.saved.studentArtifact.content), /Which is greater, 2\/4 or 3\/4\?/);
  assert.equal(new Set(forgeWrites.map((write) => write.metadata.journeyId)).size, 1);
});

test("atomic journey write failures return a retry handle and retry without duplicating artifacts", async () => {
  const journeyId = "a2d27b18-0935-4a93-957a-46ca018ce3d7";
  const request = { lesson: lessonInput(), assessment: assessmentInput(), context: teacherContext(), journeyId };
  await withForgeBatchPersistence(async (calls, rowsById) => {
    let recovery;
    await assert.rejects(HEY.teacher.createLessonWorksheetJourney(request), (error) => {
      recovery = error.recovery;
      assert.equal(error.journeyId, journeyId);
      assert.equal(error.artifactIds.length, 3);
      return true;
    });
    assert.equal(rowsById.size, 3, "simulates a committed transaction whose response was lost");

    const retried = await HEY.teacher.createLessonWorksheetJourney({
      ...request,
      context: { ...request.context, journeyCreatedAt: recovery.journeyCreatedAt },
    });
    assert.equal(retried.journeyId, journeyId);
    assert.deepEqual([retried.saved.lesson.id, retried.saved.teacherArtifact.id, retried.saved.studentArtifact.id], recovery.artifactIds);
    assert.equal(rowsById.size, 3);
    assert.equal(calls.length, 2);
  }, { loseFirstResponse: true });
});

test("concurrent retries with one journey ID resolve to the same complete artifact set", async () => {
  const request = {
    lesson: lessonInput(),
    assessment: assessmentInput(),
    context: { ...teacherContext(), journeyCreatedAt: "2026-10-15T09:00:00.000Z" },
    journeyId: "0dbb3951-d0de-4eab-b0db-bc952bf5e253",
  };
  await withForgeBatchPersistence(async (calls, rowsById) => {
    const [first, second] = await Promise.all([
      HEY.teacher.createLessonWorksheetJourney(request),
      HEY.teacher.createLessonWorksheetJourney(request),
    ]);
    const firstIds = [first.saved.lesson.id, first.saved.teacherArtifact.id, first.saved.studentArtifact.id];
    const secondIds = [second.saved.lesson.id, second.saved.teacherArtifact.id, second.saved.studentArtifact.id];
    assert.deepEqual(firstIds, secondIds);
    assert.equal(calls.length, 2);
    assert.equal(rowsById.size, 3);
  });
});

test("an atomic batch rejection leaves no partial artifacts in the Forge cache", async () => {
  const journeyId = "d701efb8-a154-48c4-a685-fb1df02c7792";
  await withForgeBatchPersistence(async (_calls, rowsById) => {
    await assert.rejects(HEY.teacher.createLessonWorksheetJourney({
      lesson: lessonInput(), assessment: assessmentInput(), context: teacherContext(), journeyId,
    }), /atomic teacher artifact batch/);
    assert.equal(rowsById.size, 0);
  }, { failBeforeCommit: true });
});

test("a mismatched batch readback is rejected before any artifact enters the Forge cache", async () => {
  const journeyId = "75cd2c32-1b86-4e53-aebf-5be8e269f6b1";
  const ids = await Promise.all(["lesson", "answer-key", "worksheet"].map((kind) =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${journeyId}:${kind}`))));
  await withForgeBatchPersistence(async () => {
    await assert.rejects(HEY.teacher.createLessonWorksheetJourney({
      lesson: lessonInput(), assessment: assessmentInput(), context: teacherContext(), journeyId,
    }), /atomic teacher artifact batch/);
    for (const digest of ids) {
      const bytes = new Uint8Array(digest).slice(0, 16);
      bytes[6] = (bytes[6] & 0x0f) | 0x50;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      assert.equal(artifactEngine.artifacts.has(id), false);
    }
  }, { mismatchResponse: true });
});

test("saved teacher journeys reopen from persisted rows and reject incomplete or cross-scope readbacks", async () => {
  const journeyId = "8e204c16-97c1-4f3b-a8e8-8bb39e7426f1";
  const context = teacherContext();
  await withForgeBatchPersistence(async (_calls, rowsById) => {
    const originalFrom = supabaseClient.from;
    const originalGetUser = supabaseClient.auth.getUser;
    let reads = 0;
    supabaseClient.from = (table) => ({
      select() { assert.equal(table, "hey_artifacts"); return this; },
      in(field, ids) {
        assert.equal(field, "id");
        reads += 1;
        return Promise.resolve({ data: ids.map((id) => rowsById.get(id)).filter(Boolean), error: null });
      },
    });
    try {
      const created = await HEY.teacher.createLessonWorksheetJourney({
        lesson: lessonInput(), assessment: assessmentInput(), context, journeyId,
      });
      const bypassAttempt = await verifyTeacherAssessmentArtifact(created.saved.teacherArtifact, {
        accountScope: context.accountScope, workspaceId: context.workspaceId, classId: context.classId,
      }, true);
      assert.equal(bypassAttempt.valid, false, "public callers cannot forge the private persisted-readback token");
      const reopened = await HEY.teacher.getLessonWorksheetJourney({ journeyId, context });
      assert.equal(reopened.recovered, true);
      assert.equal(reopened.saved.lesson.metadata.journeyId, journeyId);
      assert.match(JSON.stringify(reopened.saved.teacherArtifact.content), /teacherAnswer/);
      assert.doesNotMatch(JSON.stringify(reopened.saved.studentArtifact.content), /teacherAnswer|One quarter is one of four equal parts/);
      const recoveredHandout = await HEY.teacher.buildActivityHandoutArtifact(reopened.lesson, 0, context);
      assert.equal(recoveredHandout.content.type, "teacher_activity_handout");
      assert.doesNotMatch(JSON.stringify(recoveredHandout), /teacherAnswer|expectedLearning/);

      await assert.rejects(HEY.teacher.getLessonWorksheetJourney({
        journeyId, context: { ...context, classId: "other-class", currentClassId: "other-class" },
      }), /Authenticated teacher access/);
      supabaseClient.auth.getUser = async () => ({ data: { user: {
        id: "student-1", app_metadata: { hey_role: "student", hey_account_scope: context.accountScope, hey_class_ids: [context.classId] },
      } }, error: null });
      await assert.rejects(HEY.teacher.getLessonWorksheetJourney({ journeyId, context }), /Authenticated teacher access/);
      assert.equal(reads, 1, "unauthorized recovery must be denied before querying Forge");
      supabaseClient.auth.getUser = originalGetUser;

      supabaseClient.from = (table) => ({
        select() { assert.equal(table, "hey_artifacts"); return this; },
        in(_field, ids) { return Promise.resolve({ data: ids.slice(0, 2).map((id) => rowsById.get(id)), error: null }); },
      });
      await assert.rejects(HEY.teacher.getLessonWorksheetJourney({ journeyId, context }), /complete saved lesson set/);

      supabaseClient.from = (table) => ({
        select() { assert.equal(table, "hey_artifacts"); return this; },
        in(_field, ids) {
          const records = ids.map((id) => rowsById.get(id));
          records[2] = { ...records[2], content: { ...records[2].content, questions: [{ prompt: "Question", points: 1, teacherAnswer: "secret" }] } };
          return Promise.resolve({ data: records, error: null });
        },
      });
      await assert.rejects(HEY.teacher.getLessonWorksheetJourney({ journeyId, context }), /content verification/);

      supabaseClient.from = (table) => ({
        select() { assert.equal(table, "hey_artifacts"); return this; },
        in(_field, ids) {
          const records = ids.map((id) => rowsById.get(id));
          records[0] = { ...records[0], status: "final" };
          return Promise.resolve({ data: records, error: null });
        },
      });
      await assert.rejects(HEY.teacher.getLessonWorksheetJourney({ journeyId, context }), /out-of-scope/);
    } finally {
      supabaseClient.from = originalFrom;
      supabaseClient.auth.getUser = originalGetUser;
    }
  });
});

test("batch persistence receipts must confirm draft status and version lineage before caching", async () => {
  const cases = [
    { journeyId: "55d17586-dc08-43f8-9dd4-8072243cb629", receipt: { status: "final" } },
    { journeyId: "a1b374c0-fda2-44f3-9cb0-07ff1a55edbd", receipt: { version: 2 } },
    { journeyId: "731cfa4a-aae5-4fb7-af8c-396cf015e6d8", receipt: { parent_version_id: "previous-version" } },
    { journeyId: "9de9684e-96e8-4cc3-924a-86a20c936ce5", receipt: { branch_name: "unreviewed" } },
  ];

  for (const { journeyId, receipt } of cases) {
    await withForgeBatchPersistence(async () => {
      await assert.rejects(HEY.teacher.createLessonWorksheetJourney({
        lesson: lessonInput(), assessment: assessmentInput(), context: teacherContext(), journeyId,
      }), (error) => {
        assert.match(error.message, /atomic teacher artifact batch/);
        assert.equal(error.artifactIds.length, 3);
        assert.equal(error.artifactIds.some((id) => artifactEngine.artifacts.has(id)), false);
        return true;
      });
    }, { mismatchReceipt: receipt });
  }
});

test("wrong-role and cross-class journey attempts never call the batch persistence function", async () => {
  const request = { lesson: lessonInput(), assessment: assessmentInput(), context: teacherContext() };
  const originalGetUser = supabaseClient.auth.getUser;
  try {
    await withForgeBatchPersistence(async (calls) => {
      supabaseClient.auth.getUser = async () => ({ data: { user: {
        id: "student-1", app_metadata: { hey_role: "student", hey_account_scope: "account:teacher-1", hey_class_ids: ["class-1"] },
      } }, error: null });
      await assert.rejects(HEY.teacher.createLessonWorksheetJourney(request), /Authenticated teacher access/);
      supabaseClient.auth.getUser = async () => ({ data: { user: {
        id: "teacher-1", app_metadata: { hey_role: "teacher", hey_account_scope: "account:teacher-1", hey_class_ids: ["other-class"] },
      } }, error: null });
      await assert.rejects(HEY.teacher.createLessonWorksheetJourney(request), /Authenticated teacher access/);
      assert.equal(calls.length, 0);
    });
  } finally {
    supabaseClient.auth.getUser = originalGetUser;
  }
});

test("Teacher preview performs no writes, then the explicit atomic save returns verified readback", async () => {
  const request = {
    lesson: lessonInput(),
    assessment: assessmentInput(),
    context: { ...teacherContext(), journeyCreatedAt: "2026-10-15T09:00:00.000Z" },
    journeyId: "e0e5c6a1-29a6-4ccb-9ca8-f57a7073fe93",
  };
  await withForgeBatchPersistence(async (calls, rowsById) => {
    const preview = await HEY.teacher.prepareLessonWorksheetJourney({
      lesson: request.lesson, assessment: request.assessment, context: request.context,
    });
    assert.equal(calls.length, 0, "preview preparation must not persist artifacts");
    assert.equal(preview.teacherArtifact.metadata.audience, "teacher_only");
    assert.equal(preview.studentArtifact.metadata.audience, "student");
    assert.doesNotMatch(JSON.stringify(preview.studentArtifact.content), /teacherAnswer|expectedLearning|One quarter is one of four equal parts/);

    const saved = await HEY.teacher.createLessonWorksheetJourney(request);
    assert.equal(calls.length, 1, "explicit save should make one atomic batch request");
    assert.equal(rowsById.size, 3);
    assert.equal(saved.saved.lesson.metadata.artifactContract, "hey.teacher.lesson.v1");
    assert.equal(saved.saved.teacherArtifact.metadata.audience, "teacher_only");
    assert.equal(saved.saved.studentArtifact.metadata.audience, "student");
    assert.doesNotMatch(JSON.stringify(saved.saved.studentArtifact.content), /teacherAnswer|expectedLearning|One quarter is one of four equal parts/);
  });
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
