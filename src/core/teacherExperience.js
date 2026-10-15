import { createArtifact as createForgeArtifact } from "./artifactEngine.js";

const REQUEST_FIELDS = new Set([
  "title", "subject", "gradeBand", "durationMinutes", "learningObjectives",
  "curriculumReferences", "resources", "activities", "assessment", "accountScope",
  "workspaceId", "currentAccountScope", "currentWorkspaceId", "createdAt",
]);
const ASSESSMENT_REQUEST_FIELDS = new Set(["title", "directions", "questions", "createdAt"]);
const WORKSHEET_ARTIFACT_FIELDS = new Set(["type", "title", "description", "content", "metadata"]);
const REFERENCE_FIELDS = new Set(["title", "url"]);
const ACTIVITY_FIELDS = new Set(["title", "instructions", "minutes"]);
const ASSESSMENT_FIELDS = new Set(["prompt", "expectedLearning"]);
const ASSESSMENT_QUESTION_FIELDS = new Set(["objective", "prompt", "expectedLearning", "teacherAnswer", "points"]);
const WORKSHEET_QUESTION_FIELDS = new Set(["prompt", "points"]);
const ARTIFACT_FIELDS = new Set(["type", "title", "description", "content", "metadata"]);
const METADATA_FIELDS = new Set(["workflow", "accountScope", "workspaceId", "studentDataPolicy", "audience", "provenance", "safety", "verification"]);
const VERIFICATION_FIELDS = new Set(["valid", "checks", "contentDigest"]);
const VERIFICATION_CHECK_FIELDS = new Set(["accountWorkspaceBound", "studentDataAbsent", "objectivesPresent", "assessmentPresent", "activityTimeWithinDuration"]);
const ASSESSMENT_VERIFICATION_CHECK_FIELDS = new Set(["accountWorkspaceBound", "studentDataAbsent", "objectivesPresent", "questionsPresent", "sourceLessonBound"]);
const WORKSHEET_VERIFICATION_CHECK_FIELDS = new Set(["accountWorkspaceBound", "studentDataAbsent", "promptsPresent", "sourceAssessmentBound", "teacherKeySeparated"]);
const SAVE_CONTEXT_FIELDS = new Set(["accountScope", "workspaceId", "currentAccountScope", "currentWorkspaceId"]);
const SAVE_OPTION_FIELDS = new Set(["createArtifact"]);
const BUILT_TEACHER_LESSON_ARTIFACTS = new WeakSet();
const BUILT_TEACHER_ASSESSMENT_ARTIFACTS = new WeakSet();
const BUILT_TEACHER_WORKSHEET_ARTIFACTS = new WeakSet();
const STUDENT_DATA_FIELDS = new Set([
  "student", "students", "studentData", "studentRecords", "learnerRecords",
  "studentAnswers", "studentName", "learnerName", "studentId", "learnerId", "studentEmail",
  "studentPhone", "studentNumber", "studentResponses", "learnerResponses", "answers",
  "grades", "roster", "names", "email", "phone", "dateOfBirth", "date_of_birth",
]);
const GRADE_BANDS = new Set([
  "pre-k", "kindergarten", "1-2", "3-5", "6-8", "9-12", "adult", "mixed",
]);
const SENSITIVE_CONTENT = [
  { category: "sexual_content", pattern: /\b(?:porn(?:ography)?|explicit sexual|sexual intercourse)\b/i },
  { category: "self_harm", pattern: /\b(?:suicide|self[- ]harm|kill myself)\b/i },
  { category: "weapons_or_violence", pattern: /\b(?:how to make a bomb|build a weapon|graphic gore)\b/i },
  { category: "controlled_substances", pattern: /\b(?:make methamphetamine|synthesize cocaine)\b/i },
];

/**
 * Teacher Mode contract for the frontend: provide the active account scope and
 * Space ID twice (request scope plus active context), then call the async
 * lesson or assessment builder and verifier, then await the Markdown export
 * before offering it. Verification rechecks a SHA-256 content digest for stale edits; this
 * digest detects changes but is not a signature or authenticity proof. Verified
 * lesson and assessment artifacts can be saved as draft documents through the
 * shared Forge artifact contract; neither flow writes artifacts into Cosmos memory.
 * Do not pass student records. Curriculum references remain teacher-supplied
 * and unverified, and exported artifacts always carry a teacher-review notice.
 */

function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function freezeDeep(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((child) => freezeDeep(child, seen));
  return Object.freeze(value);
}

function assertOnlyDataFields(value, label, allowedFields = REQUEST_FIELDS) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be a plain object`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !descriptor || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label} must contain only string data fields`);
    }
    if (STUDENT_DATA_FIELDS.has(key)) throw new Error("Student personal data is not accepted by the teacher lesson workflow");
    if (!allowedFields.has(key)) {
      throw new Error(`Unsupported ${label} field: ${key}`);
    }
  }
}

function assertDenseArray(value, label, maxLength) {
  if (!Array.isArray(value) || value.length > maxLength) throw new TypeError(`${label} must be an array of at most ${maxLength} entries`);
  if (Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError(`${label} must use a plain array`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor) throw new TypeError(`${label} cannot contain missing entries`);
    if (!Object.hasOwn(descriptor, "value")) throw new TypeError(`${label} cannot contain accessor entries`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length" || typeof key === "string" && /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length) continue;
    throw new TypeError(`${label} cannot contain custom properties`);
  }
}

function requiredText(value, label, maxLength = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new TypeError(`${label} must be a non-empty string of at most ${maxLength} characters`);
  }
  return value.trim();
}

function scanText(value, label, maxLength = 4000) {
  const text = requiredText(value, label, maxLength);
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)
    || /\b(?:\+?\d[\d ().-]{7,}\d)\b/.test(text)) {
    throw new Error(`${label} appears to contain student contact information; remove personal data and try again`);
  }
  if (/\b(?:student|learner)\s+(?:name|id)\s*[:#]\s*[A-Z0-9][A-Z0-9_-]*\b/i.test(text)
    || /\b(?:student|learner)\s+(?:named|called)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/i.test(text)) {
    throw new Error(`${label} appears to contain student-identifying information; remove personal data and try again`);
  }
  return text;
}

function scanAssessmentText(value, label, maxLength = 4000) {
  const text = scanText(value, label, maxLength);
  if (/<\/?[a-z][^>]*>|<!--|<!doctype|\b(?:javascript|vbscript)\s*:|\bdata\s*:\s*text\/html/i.test(text)) {
    throw new Error(`${label} cannot contain HTML or active markup`);
  }
  return text;
}

function normalizeAssessmentQuestions(questions, lessonObjectives) {
  assertDenseArray(questions, "Assessment questions", 20);
  if (questions.length < 1) throw new TypeError("Provide between 1 and 20 assessment questions");
  const normalized = questions.map((question, index) => {
    assertOnlyDataFields(question, `Assessment question ${index + 1}`, ASSESSMENT_QUESTION_FIELDS);
    const objective = scanAssessmentText(question.objective, `Assessment question ${index + 1} objective`);
    if (!lessonObjectives.includes(objective)) throw new Error(`Assessment question ${index + 1} must target a lesson objective`);
    if (!Number.isInteger(question.points) || question.points < 1 || question.points > 10) {
      throw new TypeError(`Assessment question ${index + 1} points must be an integer from 1 to 10`);
    }
    return Object.freeze({
      objective,
      prompt: scanAssessmentText(question.prompt, `Assessment question ${index + 1} prompt`),
      expectedLearning: scanAssessmentText(question.expectedLearning, `Assessment question ${index + 1} success criteria`),
      teacherAnswer: scanAssessmentText(question.teacherAnswer, `Assessment question ${index + 1} teacher answer`),
      points: question.points,
    });
  });
  if (normalized.reduce((total, question) => total + question.points, 0) > 100) {
    throw new TypeError("Assessment total points cannot exceed 100");
  }
  return normalized;
}

function normalizeReferences(references = []) {
  assertDenseArray(references, "Curriculum references", 30);
  return references.map((reference, index) => {
    assertOnlyDataFields(reference, `Curriculum reference ${index + 1}`, REFERENCE_FIELDS);
    const title = scanText(reference.title, `Curriculum reference ${index + 1} title`);
    let url;
    try { url = new URL(reference.url); } catch { throw new TypeError("Curriculum reference must use a valid HTTPS URL"); }
    if (url.protocol !== "https:" || url.username || url.password) throw new TypeError("Curriculum reference must use a valid HTTPS URL");
    return Object.freeze({ title, url: url.href, provenance: "teacher_supplied_unverified" });
  });
}

function normalizeActivities(activities = []) {
  assertDenseArray(activities, "Activities", 20);
  return activities.map((activity, index) => {
    assertOnlyDataFields(activity, `Activity ${index + 1}`, ACTIVITY_FIELDS);
    const minutes = Number(activity.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) throw new TypeError("Activity minutes must be an integer from 1 to 180");
    return Object.freeze({
      title: scanText(activity.title, `Activity ${index + 1} title`),
      instructions: scanText(activity.instructions, `Activity ${index + 1} instructions`),
      minutes,
    });
  });
}

function detectSafetyReview(lesson) {
  const text = [lesson.title, lesson.subject, ...lesson.learningObjectives, ...lesson.activities.map((activity) => `${activity.title} ${activity.instructions}`), lesson.assessment.prompt].join("\n");
  if (["pre-k", "kindergarten", "1-2", "3-5", "6-8"].includes(lesson.gradeBand)) {
    return SENSITIVE_CONTENT.filter(({ pattern }) => pattern.test(text)).map(({ category }) => category);
  }
  return [];
}

function detectAssessmentSafetyReview(assessment) {
  const text = [assessment.title, assessment.sourceLessonTitle, assessment.subject, assessment.directions,
    ...assessment.learningObjectives,
    ...assessment.questions.map((question) => `${question.prompt} ${question.expectedLearning} ${question.teacherAnswer}`)].join("\n");
  if (["pre-k", "kindergarten", "1-2", "3-5", "6-8"].includes(assessment.gradeBand)) {
    return SENSITIVE_CONTENT.filter(({ pattern }) => pattern.test(text)).map(({ category }) => category);
  }
  return [];
}

function detectWorksheetSafetyReview(worksheet) {
  const text = [worksheet.title, worksheet.sourceAssessmentTitle, worksheet.subject, worksheet.directions,
    ...worksheet.questions.map((question) => question.prompt)].join("\n");
  if (["pre-k", "kindergarten", "1-2", "3-5", "6-8"].includes(worksheet.gradeBand)) {
    return SENSITIVE_CONTENT.filter(({ pattern }) => pattern.test(text)).map(({ category }) => category);
  }
  return [];
}

function escapeMarkdown(value) {
  return String(value).replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/[\\`*_{}[\]()#+.!|]/g, "\\$&").replace(/[\r\n]+/g, " ");
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function snapshotLessonData(value, path = new WeakSet(), budget = { nodes: 0 }, depth = 0) {
  budget.nodes += 1;
  if (budget.nodes > 10000 || depth > 32) throw new TypeError("Lesson artifact exceeds verification bounds");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object" || path.has(value)) throw new TypeError("Lesson artifact must contain only acyclic plain data");
  path.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 2000) throw new TypeError("Lesson artifact arrays must be plain and bounded");
      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || keys.some((key) => key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) {
        throw new TypeError("Lesson artifact arrays cannot contain holes or custom properties");
      }
      const clone = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new TypeError("Lesson artifact arrays cannot contain accessors");
        clone.push(snapshotLessonData(descriptor.value, path, budget, depth + 1));
      }
      return clone;
    }
    if (!isPlainRecord(value)) throw new TypeError("Lesson artifact must contain plain objects");
    const clone = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== "string" || !descriptor || !Object.hasOwn(descriptor, "value")) throw new TypeError("Lesson artifact objects cannot contain symbols or accessors");
      Object.defineProperty(clone, key, {
        value: snapshotLessonData(descriptor.value, path, budget, depth + 1),
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }
    return clone;
  } finally {
    path.delete(value);
  }
}

async function digestLesson(lesson) {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto SHA-256 is required to verify teacher lesson exports");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(lesson)));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function buildTeacherLessonArtifact(input) {
  assertOnlyDataFields(input, "Lesson request", REQUEST_FIELDS);
  const accountScope = requiredText(input.accountScope, "Account scope", 240);
  const workspaceId = requiredText(input.workspaceId, "Workspace ID", 200);
  if (input.currentAccountScope !== accountScope || input.currentWorkspaceId !== workspaceId) {
    throw new Error("Lesson request account and workspace must match the active context");
  }
  if (!GRADE_BANDS.has(input.gradeBand)) throw new TypeError("Choose a supported grade band");

  const learningObjectives = input.learningObjectives;
  assertDenseArray(learningObjectives, "Learning objectives", 12);
  if (learningObjectives.length < 1) {
    throw new TypeError("Provide between 1 and 12 learning objectives");
  }
  const objectives = learningObjectives.map((objective, index) => scanText(objective, `Learning objective ${index + 1}`));
  const durationMinutes = Number(input.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 240) throw new TypeError("Lesson duration must be an integer from 5 to 240 minutes");

  assertOnlyDataFields(input.assessment, "Assessment", ASSESSMENT_FIELDS);
  const assessment = Object.freeze({
    prompt: scanText(input.assessment.prompt, "Assessment prompt"),
    expectedLearning: scanText(input.assessment.expectedLearning, "Assessment success criteria"),
  });
  const resources = input.resources || [];
  assertDenseArray(resources, "Resources", 30);
  const lesson = {
    title: scanText(input.title, "Lesson title"),
    subject: scanText(input.subject, "Subject", 120),
    gradeBand: input.gradeBand,
    durationMinutes,
    learningObjectives: Object.freeze(objectives),
    curriculumReferences: Object.freeze(normalizeReferences(input.curriculumReferences)),
    resources: Object.freeze(resources.map((resource, index) => scanText(resource, `Resource ${index + 1}`))),
    activities: Object.freeze(normalizeActivities(input.activities)),
    assessment,
  };
  if (lesson.resources.length > 30) throw new TypeError("A lesson may include at most 30 resources");
  if (lesson.activities.reduce((total, activity) => total + activity.minutes, 0) > durationMinutes) {
    throw new Error("Activity durations exceed the lesson duration");
  }

  const safetyReview = detectSafetyReview(lesson);
  const createdAt = input.createdAt || new Date().toISOString();
  if (!Number.isFinite(Date.parse(createdAt))) throw new TypeError("createdAt must be a valid date");
  const contentDigest = await digestLesson(lesson);
  const artifact = {
    type: "document",
    title: lesson.title,
    description: `${lesson.subject} · ${lesson.gradeBand} · ${lesson.durationMinutes} minutes`,
    content: lesson,
    metadata: {
      workflow: "teacher_lesson_plan",
      accountScope,
      workspaceId,
      studentDataPolicy: "not_collected",
      provenance: {
        generatedBy: "HEY Teacher Lesson Workflow",
        method: "structured_from_teacher_provided_inputs",
        references: lesson.curriculumReferences,
        createdAt: new Date(createdAt).toISOString(),
        factualClaimsVerified: false,
      },
      safety: {
        gradeBand: lesson.gradeBand,
        reviewRequired: safetyReview.length > 0,
        reviewReasons: safetyReview,
        teacherReviewRequiredBeforeUse: true,
      },
      verification: { valid: true, checks: { accountWorkspaceBound: true, studentDataAbsent: true, objectivesPresent: true, assessmentPresent: true, activityTimeWithinDuration: true }, contentDigest },
    },
  };
  const frozenArtifact = freezeDeep(artifact);
  BUILT_TEACHER_LESSON_ARTIFACTS.add(frozenArtifact);
  return frozenArtifact;
}

export async function verifyTeacherLessonArtifact(artifact, { accountScope, workspaceId } = {}) {
  try {
    artifact = snapshotLessonData(artifact);
  } catch {
    return Object.freeze({ valid: false, checks: Object.freeze({ safeSnapshot: false }) });
  }
  let lessonShapeSafe = false;
  let detectedSafetyReview = null;
  try {
    assertOnlyDataFields(artifact, "Artifact", ARTIFACT_FIELDS);
    assertOnlyDataFields(artifact.metadata, "Artifact metadata", METADATA_FIELDS);
    assertOnlyDataFields(artifact.metadata.provenance, "Artifact provenance", new Set(["generatedBy", "method", "references", "createdAt", "factualClaimsVerified"]));
    assertOnlyDataFields(artifact.metadata.safety, "Artifact safety metadata", new Set(["gradeBand", "reviewRequired", "reviewReasons", "teacherReviewRequiredBeforeUse"]));
    assertOnlyDataFields(artifact.metadata.verification, "Artifact verification", VERIFICATION_FIELDS);
    assertOnlyDataFields(artifact.metadata.verification.checks, "Artifact verification checks", VERIFICATION_CHECK_FIELDS);
    const lesson = artifact.content;
    assertOnlyDataFields(lesson, "Lesson content", new Set(["title", "subject", "gradeBand", "durationMinutes", "learningObjectives", "curriculumReferences", "resources", "activities", "assessment"]));
    scanText(lesson.title, "Lesson title");
    scanText(lesson.subject, "Subject", 120);
    if (!GRADE_BANDS.has(lesson.gradeBand) || !Number.isInteger(lesson.durationMinutes) || lesson.durationMinutes < 5 || lesson.durationMinutes > 240) throw new Error("Invalid lesson scope");
    assertDenseArray(lesson.learningObjectives, "Learning objectives", 12);
    if (lesson.learningObjectives.length < 1) throw new Error("Invalid objectives");
    lesson.learningObjectives.forEach((objective, index) => scanText(objective, `Learning objective ${index + 1}`));
    assertDenseArray(lesson.resources, "Resources", 30);
    lesson.resources.forEach((resource, index) => scanText(resource, `Resource ${index + 1}`));
    assertDenseArray(lesson.activities, "Activities", 20);
    lesson.activities.forEach((activity, index) => {
      assertOnlyDataFields(activity, `Activity ${index + 1}`, ACTIVITY_FIELDS);
      scanText(activity.title, `Activity ${index + 1} title`);
      scanText(activity.instructions, `Activity ${index + 1} instructions`);
      if (!Number.isInteger(activity.minutes) || activity.minutes < 1 || activity.minutes > 180) throw new Error("Invalid activity duration");
    });
    if (lesson.activities.reduce((total, activity) => total + activity.minutes, 0) > lesson.durationMinutes) throw new Error("Activities exceed duration");
    assertOnlyDataFields(lesson.assessment, "Assessment", ASSESSMENT_FIELDS);
    scanText(lesson.assessment.prompt, "Assessment prompt");
    scanText(lesson.assessment.expectedLearning, "Assessment success criteria");
    assertDenseArray(lesson.curriculumReferences, "Curriculum references", 30);
    lesson.curriculumReferences.forEach((reference, index) => {
      assertOnlyDataFields(reference, `Reference ${index + 1}`, new Set(["title", "url", "provenance"]));
      if (reference.provenance !== "teacher_supplied_unverified") throw new Error("Invalid reference provenance");
      scanText(reference.title, `Reference ${index + 1} title`);
      const url = new URL(reference.url);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid reference URL");
    });
    detectedSafetyReview = detectSafetyReview(lesson);
    lessonShapeSafe = true;
  } catch {
    // Imported, mutated, and otherwise malformed artifact payloads fail verification.
  }
  let contentDigest;
  try {
    contentDigest = typeof artifact?.metadata?.verification?.contentDigest === "string"
      && /^sha256:[a-f0-9]{64}$/.test(artifact.metadata.verification.contentDigest)
      && await digestLesson(artifact.content) === artifact.metadata.verification.contentDigest;
  } catch {
    contentDigest = false;
  }
  const checks = {
    workflow: artifact?.metadata?.workflow === "teacher_lesson_plan",
    artifactType: artifact?.type === "document",
    titleMatchesContent: artifact?.title === artifact?.content?.title,
    lessonShapeSafe,
    accountScope: typeof accountScope === "string" && artifact?.metadata?.accountScope === accountScope,
    workspace: typeof workspaceId === "string" && artifact?.metadata?.workspaceId === workspaceId,
    studentDataPolicy: artifact?.metadata?.studentDataPolicy === "not_collected",
    provenance: artifact?.metadata?.provenance?.generatedBy === "HEY Teacher Lesson Workflow"
      && artifact?.metadata?.provenance?.method === "structured_from_teacher_provided_inputs"
      && artifact?.metadata?.provenance?.factualClaimsVerified === false
      && Array.isArray(artifact?.metadata?.provenance?.references)
      && JSON.stringify(artifact?.metadata?.provenance?.references) === JSON.stringify(artifact?.content?.curriculumReferences)
      && Number.isFinite(Date.parse(artifact?.metadata?.provenance?.createdAt || "")),
    teacherReviewRequired: artifact?.metadata?.safety?.teacherReviewRequiredBeforeUse === true,
    verificationEvidence: artifact?.metadata?.verification?.valid === true
      && VERIFICATION_CHECK_FIELDS.size === Object.keys(artifact?.metadata?.verification?.checks || {}).length
      && [...VERIFICATION_CHECK_FIELDS].every((field) => artifact.metadata.verification.checks[field] === true),
    contentDigest,
    safetyGradeMatchesContent: artifact?.metadata?.safety?.gradeBand === artifact?.content?.gradeBand,
    objectives: Array.isArray(artifact?.content?.learningObjectives) && artifact.content.learningObjectives.length > 0,
    assessment: Boolean(artifact?.content?.assessment?.prompt && artifact.content.assessment.expectedLearning),
    safetyReview: Array.isArray(detectedSafetyReview)
      && artifact?.metadata?.safety?.reviewRequired === (detectedSafetyReview.length > 0)
      && JSON.stringify(artifact?.metadata?.safety?.reviewReasons) === JSON.stringify(detectedSafetyReview),
  };
  return Object.freeze({ valid: Object.values(checks).every(Boolean), checks });
}

export async function buildTeacherAssessmentArtifact(lessonArtifact, input, context) {
  if (!lessonArtifact || typeof lessonArtifact !== "object" || !BUILT_TEACHER_LESSON_ARTIFACTS.has(lessonArtifact)) {
    throw new Error("Assessment requires a lesson built in the active Teacher runtime");
  }
  let stableLesson;
  let stableInput;
  let stableContext;
  try {
    stableLesson = snapshotLessonData(lessonArtifact);
    stableInput = snapshotLessonData(input);
    stableContext = snapshotLessonData(context);
  } catch {
    throw new Error("Assessment inputs must contain only safe, bounded lesson and context data");
  }
  assertOnlyDataFields(stableInput, "Teacher assessment request", ASSESSMENT_REQUEST_FIELDS);
  assertOnlyDataFields(stableContext, "Teacher assessment context", SAVE_CONTEXT_FIELDS);
  const accountScope = requiredText(stableContext.accountScope, "Account scope", 240);
  const workspaceId = requiredText(stableContext.workspaceId, "Workspace ID", 200);
  if (stableContext.currentAccountScope !== accountScope || stableContext.currentWorkspaceId !== workspaceId) {
    throw new Error("Assessment account and workspace must match the active context");
  }
  const lessonVerification = await verifyTeacherLessonArtifact(stableLesson, { accountScope, workspaceId });
  if (!lessonVerification.valid) throw new Error("Assessment source lesson failed verification for the active account and workspace");

  const lesson = stableLesson.content;
  const title = scanAssessmentText(stableInput.title, "Assessment title");
  const directions = scanAssessmentText(stableInput.directions, "Assessment directions");
  const sourceLessonTitle = scanAssessmentText(lesson.title, "Source lesson title");
  const subject = scanAssessmentText(lesson.subject, "Subject");
  const learningObjectives = Object.freeze(lesson.learningObjectives.map((objective, index) =>
    scanAssessmentText(objective, `Lesson objective ${index + 1}`)));
  const questions = Object.freeze(normalizeAssessmentQuestions(stableInput.questions, learningObjectives));
  const content = {
    type: "teacher_assessment",
    title,
    sourceLessonTitle,
    sourceLessonDigest: stableLesson.metadata.verification.contentDigest,
    parentSafetyReviewReasons: [...stableLesson.metadata.safety.reviewReasons],
    subject,
    gradeBand: lesson.gradeBand,
    directions,
    learningObjectives: Object.freeze([...new Set(questions.map((question) => question.objective))]),
    questions,
  };
  const parentSafetyReasons = [...stableLesson.metadata.safety.reviewReasons];
  const reviewReasons = [...new Set([...parentSafetyReasons, ...detectAssessmentSafetyReview(content)])];
  const createdAt = stableInput.createdAt || new Date().toISOString();
  if (typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt))) throw new TypeError("createdAt must be a valid date");
  const contentDigest = await digestLesson(content);
  const artifact = {
    type: "document",
    title,
    description: `${subject} · ${lesson.gradeBand} · ${questions.length} questions`,
    content,
    metadata: {
      workflow: "teacher_assessment",
      accountScope,
      workspaceId,
      studentDataPolicy: "not_collected",
      audience: "teacher_only",
      provenance: {
        generatedBy: "HEY Teacher Assessment Workflow",
        method: "structured_from_verified_teacher_lesson",
        sourceLessonDigest: stableLesson.metadata.verification.contentDigest,
        createdAt: new Date(createdAt).toISOString(),
        factualClaimsVerified: false,
      },
      safety: {
        gradeBand: lesson.gradeBand,
        reviewRequired: reviewReasons.length > 0,
        reviewReasons,
        teacherReviewRequiredBeforeUse: true,
      },
      verification: {
        valid: true,
        checks: {
          accountWorkspaceBound: true,
          studentDataAbsent: true,
          objectivesPresent: true,
          questionsPresent: true,
          sourceLessonBound: true,
        },
        contentDigest,
      },
    },
  };
  const frozenArtifact = freezeDeep(artifact);
  BUILT_TEACHER_ASSESSMENT_ARTIFACTS.add(frozenArtifact);
  return frozenArtifact;
}

export async function verifyTeacherAssessmentArtifact(artifact, { accountScope, workspaceId } = {}) {
  if (!artifact || typeof artifact !== "object" || !BUILT_TEACHER_ASSESSMENT_ARTIFACTS.has(artifact)) {
    return Object.freeze({ valid: false, checks: Object.freeze({ trustedTeacherRuntime: false }) });
  }
  try {
    artifact = snapshotLessonData(artifact);
  } catch {
    return Object.freeze({ valid: false, checks: Object.freeze({ safeSnapshot: false }) });
  }
  let contentShapeSafe = false;
  let detectedSafetyReview = null;
  try {
    assertOnlyDataFields(artifact, "Assessment artifact", ARTIFACT_FIELDS);
    assertOnlyDataFields(artifact.metadata, "Assessment metadata", METADATA_FIELDS);
    assertOnlyDataFields(artifact.metadata.provenance, "Assessment provenance", new Set([
      "generatedBy", "method", "sourceLessonDigest", "createdAt", "factualClaimsVerified",
    ]));
    assertOnlyDataFields(artifact.metadata.safety, "Assessment safety metadata", new Set([
      "gradeBand", "reviewRequired", "reviewReasons", "teacherReviewRequiredBeforeUse",
    ]));
    assertOnlyDataFields(artifact.metadata.verification, "Assessment verification", VERIFICATION_FIELDS);
    assertOnlyDataFields(artifact.metadata.verification.checks, "Assessment verification checks", ASSESSMENT_VERIFICATION_CHECK_FIELDS);
    const content = artifact.content;
    assertOnlyDataFields(content, "Assessment content", new Set([
      "type", "title", "sourceLessonTitle", "sourceLessonDigest", "parentSafetyReviewReasons",
      "subject", "gradeBand", "directions", "learningObjectives", "questions",
    ]));
    if (content.type !== "teacher_assessment" || !GRADE_BANDS.has(content.gradeBand)) throw new Error("Invalid assessment type or grade band");
    scanAssessmentText(content.title, "Assessment title");
    scanAssessmentText(content.sourceLessonTitle, "Source lesson title");
    scanAssessmentText(content.subject, "Subject");
    scanAssessmentText(content.directions, "Assessment directions");
    assertDenseArray(content.learningObjectives, "Assessment learning objectives", 12);
    if (content.learningObjectives.length < 1) throw new Error("Assessment must target at least one lesson objective");
    content.learningObjectives.forEach((objective, index) => scanAssessmentText(objective, `Assessment objective ${index + 1}`));
    assertDenseArray(content.questions, "Assessment questions", 20);
    if (content.questions.length < 1) throw new Error("Assessment must contain at least one question");
    let totalPoints = 0;
    content.questions.forEach((question, index) => {
      assertOnlyDataFields(question, `Assessment question ${index + 1}`, ASSESSMENT_QUESTION_FIELDS);
      scanAssessmentText(question.objective, `Assessment question ${index + 1} objective`);
      if (!content.learningObjectives.includes(question.objective)) throw new Error("Assessment question targets an unlisted objective");
      scanAssessmentText(question.prompt, `Assessment question ${index + 1} prompt`);
      scanAssessmentText(question.expectedLearning, `Assessment question ${index + 1} success criteria`);
      scanAssessmentText(question.teacherAnswer, `Assessment question ${index + 1} teacher answer`);
      if (!Number.isInteger(question.points) || question.points < 1 || question.points > 10) throw new Error("Invalid assessment question points");
      totalPoints += question.points;
    });
    if (totalPoints > 100) throw new Error("Assessment total points cannot exceed 100");
    const parentReasons = content.parentSafetyReviewReasons;
    assertDenseArray(parentReasons, "Parent safety review reasons", SENSITIVE_CONTENT.length);
    if (parentReasons.some((reason) => !SENSITIVE_CONTENT.some((entry) => entry.category === reason))) throw new Error("Invalid parent safety review reason");
    if (!/^sha256:[a-f0-9]{64}$/.test(content.sourceLessonDigest || "")) throw new Error("Invalid source lesson digest");
    detectedSafetyReview = [...new Set([...parentReasons, ...detectAssessmentSafetyReview(content)])];
    contentShapeSafe = true;
  } catch {
    // Imported, mutated, and otherwise malformed assessment payloads fail verification.
  }
  let contentDigest;
  try {
    contentDigest = typeof artifact?.metadata?.verification?.contentDigest === "string"
      && /^sha256:[a-f0-9]{64}$/.test(artifact.metadata.verification.contentDigest)
      && await digestLesson(artifact.content) === artifact.metadata.verification.contentDigest;
  } catch {
    contentDigest = false;
  }
  const checks = {
    workflow: artifact?.metadata?.workflow === "teacher_assessment",
    artifactType: artifact?.type === "document",
    titleMatchesContent: artifact?.title === artifact?.content?.title,
    contentShapeSafe,
    accountScope: typeof accountScope === "string" && artifact?.metadata?.accountScope === accountScope,
    workspace: typeof workspaceId === "string" && artifact?.metadata?.workspaceId === workspaceId,
    studentDataPolicy: artifact?.metadata?.studentDataPolicy === "not_collected",
    audience: artifact?.metadata?.audience === "teacher_only",
    provenance: artifact?.metadata?.provenance?.generatedBy === "HEY Teacher Assessment Workflow"
      && artifact?.metadata?.provenance?.method === "structured_from_verified_teacher_lesson"
      && artifact?.metadata?.provenance?.factualClaimsVerified === false
      && /^sha256:[a-f0-9]{64}$/.test(artifact?.metadata?.provenance?.sourceLessonDigest || "")
      && artifact?.metadata?.provenance?.sourceLessonDigest === artifact?.content?.sourceLessonDigest
      && Number.isFinite(Date.parse(artifact?.metadata?.provenance?.createdAt || "")),
    teacherReviewRequired: artifact?.metadata?.safety?.teacherReviewRequiredBeforeUse === true,
    verificationEvidence: artifact?.metadata?.verification?.valid === true
      && ASSESSMENT_VERIFICATION_CHECK_FIELDS.size === Object.keys(artifact?.metadata?.verification?.checks || {}).length
      && [...ASSESSMENT_VERIFICATION_CHECK_FIELDS].every((field) => artifact.metadata.verification.checks[field] === true),
    contentDigest,
    safetyGradeMatchesContent: artifact?.metadata?.safety?.gradeBand === artifact?.content?.gradeBand,
    objectives: Array.isArray(artifact?.content?.learningObjectives) && artifact.content.learningObjectives.length > 0,
    questions: Array.isArray(artifact?.content?.questions) && artifact.content.questions.length > 0,
    safetyReview: Array.isArray(detectedSafetyReview)
      && artifact?.metadata?.safety?.reviewRequired === (detectedSafetyReview.length > 0)
      && JSON.stringify(artifact?.metadata?.safety?.reviewReasons) === JSON.stringify(detectedSafetyReview),
  };
  return Object.freeze({ valid: Object.values(checks).every(Boolean), checks });
}

export async function buildTeacherWorksheetArtifact(assessmentArtifact, context) {
  if (!assessmentArtifact || typeof assessmentArtifact !== "object" || !BUILT_TEACHER_ASSESSMENT_ARTIFACTS.has(assessmentArtifact)) {
    throw new Error("Worksheet requires an assessment built in the active Teacher runtime");
  }
  let stableAssessment;
  let stableContext;
  try {
    stableAssessment = snapshotLessonData(assessmentArtifact);
    stableContext = snapshotLessonData(context);
    assertOnlyDataFields(stableContext, "Teacher worksheet context", SAVE_CONTEXT_FIELDS);
  } catch {
    throw new Error("Worksheet source and context must be safe, bounded data");
  }
  const accountScope = requiredText(stableContext.accountScope, "Account scope", 240);
  const workspaceId = requiredText(stableContext.workspaceId, "Workspace ID", 200);
  if (stableContext.currentAccountScope !== accountScope || stableContext.currentWorkspaceId !== workspaceId) {
    throw new Error("Worksheet account and workspace must match the active context");
  }
  const sourceVerification = await verifyTeacherAssessmentArtifact(assessmentArtifact, { accountScope, workspaceId });
  if (!sourceVerification.valid) throw new Error("Worksheet source assessment failed verification for the active account and workspace");

  const assessment = stableAssessment.content;
  const content = {
    type: "teacher_worksheet",
    title: scanAssessmentText(assessment.title, "Worksheet title"),
    sourceAssessmentTitle: assessment.title,
    sourceAssessmentDigest: stableAssessment.metadata.verification.contentDigest,
    parentSafetyReviewReasons: [...stableAssessment.metadata.safety.reviewReasons],
    subject: scanAssessmentText(assessment.subject, "Subject"),
    gradeBand: assessment.gradeBand,
    directions: scanAssessmentText(assessment.directions, "Worksheet directions"),
    questions: Object.freeze(assessment.questions.map((question, index) => Object.freeze({
      prompt: scanAssessmentText(question.prompt, `Worksheet question ${index + 1} prompt`),
      points: question.points,
    }))),
  };
  const reviewReasons = [...new Set([...content.parentSafetyReviewReasons, ...detectWorksheetSafetyReview(content)])];
  const contentDigest = await digestLesson(content);
  const artifact = {
    type: "document",
    title: content.title,
    description: `${content.subject} · ${content.gradeBand} · ${content.questions.length} questions`,
    content,
    metadata: {
      workflow: "teacher_worksheet",
      accountScope,
      workspaceId,
      studentDataPolicy: "not_collected",
      audience: "student",
      provenance: {
        generatedBy: "HEY Teacher Worksheet Workflow",
        method: "derived_from_teacher_assessment_without_answer_key",
        sourceAssessmentDigest: content.sourceAssessmentDigest,
        createdAt: new Date().toISOString(),
        factualClaimsVerified: false,
      },
      safety: {
        gradeBand: content.gradeBand,
        reviewRequired: reviewReasons.length > 0,
        reviewReasons,
        teacherReviewRequiredBeforeUse: true,
      },
      verification: {
        valid: true,
        checks: {
          accountWorkspaceBound: true,
          studentDataAbsent: true,
          promptsPresent: true,
          sourceAssessmentBound: true,
          teacherKeySeparated: true,
        },
        contentDigest,
      },
    },
  };
  const frozenArtifact = freezeDeep(artifact);
  BUILT_TEACHER_WORKSHEET_ARTIFACTS.add(frozenArtifact);
  return frozenArtifact;
}

export async function verifyTeacherWorksheetArtifact(artifact, { accountScope, workspaceId } = {}) {
  if (!artifact || typeof artifact !== "object" || !BUILT_TEACHER_WORKSHEET_ARTIFACTS.has(artifact)) {
    return Object.freeze({ valid: false, checks: Object.freeze({ trustedTeacherRuntime: false }) });
  }
  try {
    artifact = snapshotLessonData(artifact);
  } catch {
    return Object.freeze({ valid: false, checks: Object.freeze({ safeSnapshot: false }) });
  }
  let contentShapeSafe = false;
  let detectedSafetyReview = null;
  try {
    assertOnlyDataFields(artifact, "Worksheet artifact", WORKSHEET_ARTIFACT_FIELDS);
    assertOnlyDataFields(artifact.metadata, "Worksheet metadata", METADATA_FIELDS);
    assertOnlyDataFields(artifact.metadata.provenance, "Worksheet provenance", new Set([
      "generatedBy", "method", "sourceAssessmentDigest", "createdAt", "factualClaimsVerified",
    ]));
    assertOnlyDataFields(artifact.metadata.safety, "Worksheet safety metadata", new Set([
      "gradeBand", "reviewRequired", "reviewReasons", "teacherReviewRequiredBeforeUse",
    ]));
    assertOnlyDataFields(artifact.metadata.verification, "Worksheet verification", VERIFICATION_FIELDS);
    assertOnlyDataFields(artifact.metadata.verification.checks, "Worksheet verification checks", WORKSHEET_VERIFICATION_CHECK_FIELDS);
    const content = artifact.content;
    assertOnlyDataFields(content, "Worksheet content", new Set([
      "type", "title", "sourceAssessmentTitle", "sourceAssessmentDigest", "parentSafetyReviewReasons",
      "subject", "gradeBand", "directions", "questions",
    ]));
    if (content.type !== "teacher_worksheet" || !GRADE_BANDS.has(content.gradeBand)) throw new Error("Invalid worksheet type or grade band");
    scanAssessmentText(content.title, "Worksheet title");
    scanAssessmentText(content.sourceAssessmentTitle, "Source assessment title");
    scanAssessmentText(content.subject, "Subject", 120);
    scanAssessmentText(content.directions, "Worksheet directions");
    if (!/^sha256:[a-f0-9]{64}$/.test(content.sourceAssessmentDigest || "")) throw new Error("Invalid source assessment digest");
    assertDenseArray(content.questions, "Worksheet questions", 20);
    if (content.questions.length < 1) throw new Error("Worksheet must contain at least one question");
    let totalPoints = 0;
    content.questions.forEach((question, index) => {
      assertOnlyDataFields(question, `Worksheet question ${index + 1}`, WORKSHEET_QUESTION_FIELDS);
      scanAssessmentText(question.prompt, `Worksheet question ${index + 1} prompt`);
      if (!Number.isInteger(question.points) || question.points < 1 || question.points > 10) throw new Error("Invalid worksheet question points");
      totalPoints += question.points;
    });
    if (totalPoints > 100) throw new Error("Worksheet total points cannot exceed 100");
    const parentReasons = content.parentSafetyReviewReasons;
    assertDenseArray(parentReasons, "Parent safety review reasons", SENSITIVE_CONTENT.length);
    if (parentReasons.some((reason) => !SENSITIVE_CONTENT.some((entry) => entry.category === reason))) throw new Error("Invalid parent safety review reason");
    detectedSafetyReview = [...new Set([...parentReasons, ...detectWorksheetSafetyReview(content)])];
    contentShapeSafe = true;
  } catch {
    // Imported, mutated, and otherwise malformed worksheet payloads fail verification.
  }
  let contentDigest;
  try {
    contentDigest = typeof artifact?.metadata?.verification?.contentDigest === "string"
      && /^sha256:[a-f0-9]{64}$/.test(artifact.metadata.verification.contentDigest)
      && await digestLesson(artifact.content) === artifact.metadata.verification.contentDigest;
  } catch {
    contentDigest = false;
  }
  const checks = {
    workflow: artifact?.metadata?.workflow === "teacher_worksheet",
    artifactType: artifact?.type === "document",
    titleMatchesContent: artifact?.title === artifact?.content?.title,
    contentShapeSafe,
    accountScope: typeof accountScope === "string" && artifact?.metadata?.accountScope === accountScope,
    workspace: typeof workspaceId === "string" && artifact?.metadata?.workspaceId === workspaceId,
    studentDataPolicy: artifact?.metadata?.studentDataPolicy === "not_collected",
    audience: artifact?.metadata?.audience === "student",
    provenance: artifact?.metadata?.provenance?.generatedBy === "HEY Teacher Worksheet Workflow"
      && artifact?.metadata?.provenance?.method === "derived_from_teacher_assessment_without_answer_key"
      && artifact?.metadata?.provenance?.factualClaimsVerified === false
      && artifact?.metadata?.provenance?.sourceAssessmentDigest === artifact?.content?.sourceAssessmentDigest
      && Number.isFinite(Date.parse(artifact?.metadata?.provenance?.createdAt || "")),
    teacherReviewRequired: artifact?.metadata?.safety?.teacherReviewRequiredBeforeUse === true,
    verificationEvidence: artifact?.metadata?.verification?.valid === true
      && WORKSHEET_VERIFICATION_CHECK_FIELDS.size === Object.keys(artifact?.metadata?.verification?.checks || {}).length
      && [...WORKSHEET_VERIFICATION_CHECK_FIELDS].every((field) => artifact.metadata.verification.checks[field] === true),
    contentDigest,
    safetyGradeMatchesContent: artifact?.metadata?.safety?.gradeBand === artifact?.content?.gradeBand,
    questions: Array.isArray(artifact?.content?.questions) && artifact.content.questions.length > 0,
    safetyReview: Array.isArray(detectedSafetyReview)
      && artifact?.metadata?.safety?.reviewRequired === (detectedSafetyReview.length > 0)
      && JSON.stringify(artifact?.metadata?.safety?.reviewReasons) === JSON.stringify(detectedSafetyReview),
  };
  return Object.freeze({ valid: Object.values(checks).every(Boolean), checks });
}

/**
 * Store a verified teacher lesson in the shared Forge artifact graph as a
 * draft document. The active account and Space must be supplied independently
 * of the artifact's embedded scope. This stores lesson-planning content only;
 * it does not send the lesson to Cosmos memory or claim database durability.
 */
async function saveTeacherArtifact(artifact, context, options, builtArtifacts, verifyArtifact, label, contract, tags) {
  if (!artifact || typeof artifact !== "object" || !builtArtifacts.has(artifact)) {
    const article = label === "assessment" ? "an" : "a";
    throw new Error(`Only ${article} ${label} artifact built in the active Teacher runtime can be saved`);
  }
  let stableArtifact;
  let stableContext;
  try {
    stableArtifact = snapshotLessonData(artifact);
    stableContext = snapshotLessonData(context);
    assertOnlyDataFields(stableContext, "Teacher artifact save context", SAVE_CONTEXT_FIELDS);
    assertOnlyDataFields(options, "Teacher artifact save options", SAVE_OPTION_FIELDS);
  } catch {
    throw new Error(`${label} artifact failed verification for the active account and workspace`);
  }
  const accountScope = requiredText(stableContext.accountScope, "Account scope", 240);
  const workspaceId = requiredText(stableContext.workspaceId, "Workspace ID", 200);
  if (stableContext.currentAccountScope !== accountScope || stableContext.currentWorkspaceId !== workspaceId) {
    throw new Error(`${label} artifact account and workspace must match the active context`);
  }
  const createArtifact = options.createArtifact ?? createForgeArtifact;
  if (typeof createArtifact !== "function") throw new TypeError("Shared artifact creator must be a function");

  const verification = await verifyArtifact(artifact, { accountScope, workspaceId });
  if (!verification.valid) throw new Error(`${label} artifact failed verification for the active account and workspace`);
  freezeDeep(stableArtifact);

  const { content, metadata } = stableArtifact;
  return createArtifact({
    projectId: workspaceId,
    type: "document",
    title: stableArtifact.title,
    description: stableArtifact.description,
    content,
    metadata: {
      ...metadata,
      artifactContract: contract,
      accountScope,
      workspaceId,
    },
    tags,
  });
}

export async function saveTeacherLessonArtifact(artifact, context, options = {}) {
  return saveTeacherArtifact(
    artifact, context, options, BUILT_TEACHER_LESSON_ARTIFACTS, verifyTeacherLessonArtifact,
    "lesson", "hey.teacher.lesson.v1", ["teacher", "lesson-plan"],
  );
}

export async function saveTeacherAssessmentArtifact(artifact, context, options = {}) {
  return saveTeacherArtifact(
    artifact, context, options, BUILT_TEACHER_ASSESSMENT_ARTIFACTS, verifyTeacherAssessmentArtifact,
    "assessment", "hey.teacher.assessment.v1", ["teacher", "assessment", "answer-key"],
  );
}

export async function saveTeacherWorksheetArtifact(artifact, context, options = {}) {
  return saveTeacherArtifact(
    artifact, context, options, BUILT_TEACHER_WORKSHEET_ARTIFACTS, verifyTeacherWorksheetArtifact,
    "worksheet", "hey.teacher.worksheet.v1", ["teacher", "student-worksheet"],
  );
}

export async function exportTeacherLessonMarkdown(artifact, { accountScope, workspaceId, safetyReview } = {}) {
  let stableArtifact;
  let stableSafetyReview;
  try {
    stableArtifact = snapshotLessonData(artifact);
    stableSafetyReview = safetyReview === undefined ? undefined : snapshotLessonData(safetyReview);
  } catch {
    throw new Error("Lesson artifact failed verification for the active account and workspace");
  }
  const verification = await verifyTeacherLessonArtifact(stableArtifact, { accountScope, workspaceId });
  if (!verification.valid) throw new Error("Lesson artifact failed verification for the active account and workspace");
  if (stableArtifact.metadata.safety.reviewRequired) {
    if (!isPlainRecord(stableSafetyReview)) throw new Error("Teacher safety review is required for the active account and workspace before exporting this lesson");
    assertOnlyDataFields(stableSafetyReview, "Teacher safety review", new Set(["accountScope", "workspaceId", "reviewerId", "reviewedAt"]));
    if (stableSafetyReview.accountScope !== accountScope
      || stableSafetyReview.workspaceId !== workspaceId
      || typeof stableSafetyReview.reviewerId !== "string" || !stableSafetyReview.reviewerId.trim()
      || !Number.isFinite(Date.parse(stableSafetyReview.reviewedAt || ""))) {
      throw new Error("Teacher safety review is required for the active account and workspace before exporting this lesson");
    }
  }
  const { content: lesson, metadata } = stableArtifact;
  const lines = [
    `# ${escapeMarkdown(lesson.title)}`, "", `**Subject:** ${escapeMarkdown(lesson.subject)}  `,
    `**Grade band:** ${escapeMarkdown(lesson.gradeBand)}  `, `**Duration:** ${lesson.durationMinutes} minutes`, "",
    "## Learning objectives", ...lesson.learningObjectives.map((objective) => `- ${escapeMarkdown(objective)}`), "",
    "## Resources", ...(lesson.resources.length ? lesson.resources.map((resource) => `- ${escapeMarkdown(resource)}`) : ["- No additional resources supplied."]), "",
    "## Classroom activities", ...(lesson.activities.length ? lesson.activities.flatMap((activity) => [`### ${escapeMarkdown(activity.title)} (${activity.minutes} min)`, escapeMarkdown(activity.instructions), ""]) : ["No activities supplied.", ""]),
    "## Assessment", escapeMarkdown(lesson.assessment.prompt), "", `**Success criteria:** ${escapeMarkdown(lesson.assessment.expectedLearning)}`, "",
    "## Provenance and review", `- References supplied by teacher: ${lesson.curriculumReferences.length}`,
    ...lesson.curriculumReferences.map((reference) => `- ${escapeMarkdown(reference.title)} — ${reference.url} — unverified; check before classroom use`),
    `- Curriculum alignment and factual claims: not independently verified`,
    `- Student personal data: ${metadata.studentDataPolicy}`,
    `- Teacher review required before classroom use: yes`,
    ...(metadata.safety.reviewRequired ? [`- Safety review recorded for account/workspace by: ${escapeMarkdown(safetyReview.reviewerId)}`, `- Safety review time: ${new Date(safetyReview.reviewedAt).toISOString()}`] : []),
  ];
  return Object.freeze({ filename: "lesson-plan.md", mimeType: "text/markdown", content: lines.join("\n") });
}

export async function exportTeacherAssessmentMarkdown(artifact, { accountScope, workspaceId, safetyReview } = {}) {
  if (!artifact || typeof artifact !== "object" || !BUILT_TEACHER_ASSESSMENT_ARTIFACTS.has(artifact)) {
    throw new Error("Only an assessment artifact built in the active Teacher runtime can be exported");
  }
  const verification = await verifyTeacherAssessmentArtifact(artifact, { accountScope, workspaceId });
  if (!verification.valid) throw new Error("Assessment artifact failed verification for the active account and workspace");
  let stableArtifact;
  let stableSafetyReview;
  try {
    stableArtifact = snapshotLessonData(artifact);
    stableSafetyReview = safetyReview === undefined ? undefined : snapshotLessonData(safetyReview);
  } catch {
    throw new Error("Assessment artifact failed verification for the active account and workspace");
  }
  if (stableArtifact.metadata.safety.reviewRequired) {
    if (!isPlainRecord(stableSafetyReview)) throw new Error("Teacher safety review is required for the active account and workspace before exporting this assessment");
    assertOnlyDataFields(stableSafetyReview, "Teacher safety review", new Set(["accountScope", "workspaceId", "reviewerId", "reviewedAt"]));
    if (stableSafetyReview.accountScope !== accountScope
      || stableSafetyReview.workspaceId !== workspaceId
      || typeof stableSafetyReview.reviewerId !== "string" || !stableSafetyReview.reviewerId.trim()
      || !Number.isFinite(Date.parse(stableSafetyReview.reviewedAt || ""))) {
      throw new Error("Teacher safety review is required for the active account and workspace before exporting this assessment");
    }
  }
  const { content, metadata } = stableArtifact;
  const lines = [
    `# ${escapeMarkdown(content.title)}`, "", `**Subject:** ${escapeMarkdown(content.subject)}  `,
    `**Grade band:** ${escapeMarkdown(content.gradeBand)}  `,
    `**Based on lesson:** ${escapeMarkdown(content.sourceLessonTitle)}`, "",
    "**Audience:** teacher only; do not distribute this file to learners.", "",
    "## Directions", escapeMarkdown(content.directions), "", "## Teacher answer key",
    ...content.questions.flatMap((question, index) => [
      `### ${index + 1}. ${escapeMarkdown(question.prompt)} (${question.points} points)`,
      `**Objective:** ${escapeMarkdown(question.objective)}`,
      `**Answer:** ${escapeMarkdown(question.teacherAnswer)}`,
      `**Success criteria:** ${escapeMarkdown(question.expectedLearning)}`, "",
    ]),
    "## Provenance and review",
    `- Source lesson digest: ${metadata.provenance.sourceLessonDigest}`,
    "- Assessment claims and curriculum alignment: not independently verified",
    `- Student personal data: ${metadata.studentDataPolicy}`,
    "- Teacher review required before classroom use: yes",
    ...(metadata.safety.reviewRequired ? [
      `- Safety review recorded for account/workspace by: ${escapeMarkdown(safetyReview.reviewerId)}`,
      `- Safety review time: ${new Date(safetyReview.reviewedAt).toISOString()}`,
    ] : []),
  ];
  return Object.freeze({ filename: "teacher-answer-key.md", mimeType: "text/markdown", content: lines.join("\n") });
}

export const exportTeacherAnswerKeyMarkdown = exportTeacherAssessmentMarkdown;

export async function exportTeacherWorksheetMarkdown(artifact, { accountScope, workspaceId, safetyReview } = {}) {
  if (!artifact || typeof artifact !== "object" || !BUILT_TEACHER_WORKSHEET_ARTIFACTS.has(artifact)) {
    throw new Error("Only a worksheet artifact built in the active Teacher runtime can be exported");
  }
  const verification = await verifyTeacherWorksheetArtifact(artifact, { accountScope, workspaceId });
  if (!verification.valid) throw new Error("Worksheet artifact failed verification for the active account and workspace");
  let stableArtifact;
  let stableSafetyReview;
  try {
    stableArtifact = snapshotLessonData(artifact);
    stableSafetyReview = safetyReview === undefined ? undefined : snapshotLessonData(safetyReview);
  } catch {
    throw new Error("Worksheet artifact failed verification for the active account and workspace");
  }
  if (stableArtifact.metadata.safety.reviewRequired) {
    if (!isPlainRecord(stableSafetyReview)) throw new Error("Teacher safety review is required for the active account and workspace before exporting this worksheet");
    assertOnlyDataFields(stableSafetyReview, "Teacher safety review", new Set(["accountScope", "workspaceId", "reviewerId", "reviewedAt"]));
    if (stableSafetyReview.accountScope !== accountScope
      || stableSafetyReview.workspaceId !== workspaceId
      || typeof stableSafetyReview.reviewerId !== "string" || !stableSafetyReview.reviewerId.trim()
      || !Number.isFinite(Date.parse(stableSafetyReview.reviewedAt || ""))) {
      throw new Error("Teacher safety review is required for the active account and workspace before exporting this worksheet");
    }
  }
  const { content, metadata } = stableArtifact;
  const lines = [
    `# ${escapeMarkdown(content.title)}`, "", `**Subject:** ${escapeMarkdown(content.subject)}  `,
    `**Grade band:** ${escapeMarkdown(content.gradeBand)}  `, "",
    "## Directions", escapeMarkdown(content.directions), "", "## Questions",
    ...content.questions.flatMap((question, index) => [
      `### ${index + 1}. ${escapeMarkdown(question.prompt)} (${question.points} points)`, "",
    ]),
    "## Provenance and review",
    "- Curriculum alignment and factual claims: not independently verified",
    `- Student personal data: ${metadata.studentDataPolicy}`,
    "- Teacher review required before classroom use: yes",
    ...(metadata.safety.reviewRequired ? ["- Required safety review is complete for this export: yes"] : []),
  ];
  return Object.freeze({ filename: "student-worksheet.md", mimeType: "text/markdown", content: lines.join("\n") });
}

export default {
  buildTeacherLessonArtifact,
  verifyTeacherLessonArtifact,
  saveTeacherLessonArtifact,
  exportTeacherLessonMarkdown,
  buildTeacherAssessmentArtifact,
  verifyTeacherAssessmentArtifact,
  saveTeacherAssessmentArtifact,
  exportTeacherAssessmentMarkdown,
  exportTeacherAnswerKeyMarkdown,
  buildTeacherWorksheetArtifact,
  verifyTeacherWorksheetArtifact,
  saveTeacherWorksheetArtifact,
  exportTeacherWorksheetMarkdown,
};
