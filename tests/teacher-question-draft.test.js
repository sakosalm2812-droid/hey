import assert from "node:assert/strict";
import test from "node:test";

import { buildTeacherAssessmentQuestions, createTeacherQuestionDraft } from "../src/teacherQuestionDraft.js";

const draft = (id, overrides = {}) => createTeacherQuestionDraft(id, {
  prompt: `Question ${id}`,
  expectedLearning: `Learning check ${id}`,
  teacherAnswer: `Private answer ${id}`,
  points: "2",
  ...overrides,
});

test("Teacher quiz drafts become a typed multi-question answer-key request without UI IDs", () => {
  const questions = buildTeacherAssessmentQuestions([
    draft("q1"), draft("q2", { points: "3" }),
  ], "Place unit fractions on a number line");
  assert.equal(questions.length, 2);
  assert.deepEqual(questions.map(({ prompt, teacherAnswer, points }) => ({ prompt, teacherAnswer, points })), [
    { prompt: "Question q1", teacherAnswer: "Private answer q1", points: 2 },
    { prompt: "Question q2", teacherAnswer: "Private answer q2", points: 3 },
  ]);
  assert.equal(Object.hasOwn(questions[0], "id"), false);
  assert.equal(Object.isFrozen(questions), true);
  assert.equal(Object.isFrozen(questions[0]), true);
});

test("quiz draft builder rejects missing questions, oversized sets, invalid scoring, and learner data", () => {
  assert.throws(() => buildTeacherAssessmentQuestions([], "Objective"), /between 1 and 20/);
  assert.throws(() => buildTeacherAssessmentQuestions(Array.from({ length: 21 }, (_, index) => draft(`q${index}`)), "Objective"), /between 1 and 20/);
  assert.throws(() => buildTeacherAssessmentQuestions([draft("q1", { points: "1.5" })], "Objective"), /whole number/);
  assert.throws(() => buildTeacherAssessmentQuestions([draft("q1", { teacherAnswer: " " })], "Objective"), /teacherAnswer/);
  assert.throws(() => buildTeacherAssessmentQuestions([draft("q1"), draft("q1")], "Objective"), /unique draft ID/);
  assert.throws(() => buildTeacherAssessmentQuestions([{ ...draft("q1"), studentName: "Learner" }], "Objective"), /Unsupported question/);
  const accessor = draft("q1");
  Object.defineProperty(accessor, "prompt", { get() { throw new Error("must not invoke getter"); } });
  assert.throws(() => buildTeacherAssessmentQuestions([accessor], "Objective"), /data fields/);
});

test("quiz draft builder rejects sparse and accessor question lists without invoking getters", () => {
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => buildTeacherAssessmentQuestions(sparse, "Objective"), /dense data entries/);

  const accessor = [];
  let getterCalls = 0;
  Object.defineProperty(accessor, "0", { enumerable: true, get() { getterCalls += 1; return draft("q1"); } });
  accessor.length = 1;
  assert.throws(() => buildTeacherAssessmentQuestions(accessor, "Objective"), /dense data entries/);
  assert.equal(getterCalls, 0);
});
