const REQUEST_FIELDS = new Set([
  "title", "subject", "gradeBand", "durationMinutes", "learningObjectives",
  "curriculumReferences", "resources", "activities", "assessment", "accountScope",
  "workspaceId", "currentAccountScope", "currentWorkspaceId", "createdAt",
]);
const REFERENCE_FIELDS = new Set(["title", "url"]);
const ACTIVITY_FIELDS = new Set(["title", "instructions", "minutes"]);
const ASSESSMENT_FIELDS = new Set(["prompt", "expectedLearning"]);
const ARTIFACT_FIELDS = new Set(["type", "title", "description", "content", "metadata"]);
const METADATA_FIELDS = new Set(["workflow", "accountScope", "workspaceId", "studentDataPolicy", "provenance", "safety", "verification"]);
const VERIFICATION_FIELDS = new Set(["valid", "checks", "contentDigest"]);
const VERIFICATION_CHECK_FIELDS = new Set(["accountWorkspaceBound", "studentDataAbsent", "objectivesPresent", "assessmentPresent", "activityTimeWithinDuration"]);
const STUDENT_DATA_FIELDS = new Set([
  "student", "students", "studentData", "studentRecords", "learnerRecords",
  "studentAnswers", "grades", "roster", "names", "email", "phone", "dateOfBirth",
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
 * Space ID twice (request scope plus trusted current context), then call this
 * async builder and verifier, then await the Markdown export before offering
 * it. Verification rechecks a SHA-256 content digest for stale edits; this
 * digest detects changes but is not a signature or authenticity proof. This is
 * a local artifact contract; it does not call or replace HEY Brain, Cosmos, or Forge.
 * Do not pass student records. Curriculum references remain teacher-supplied
 * and unverified, and exported lessons always carry a teacher-review notice.
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

function scanText(value, label) {
  const text = requiredText(value, label, 4000);
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)
    || /\b(?:\+?\d[\d ().-]{7,}\d)\b/.test(text)) {
    throw new Error(`${label} appears to contain student contact information; remove personal data and try again`);
  }
  return text;
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

function escapeMarkdown(value) {
  return String(value).replace(/[\\`*_{}[\]()#+.!|>]/g, "\\$&").replace(/[\r\n]+/g, " ");
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
  return freezeDeep(artifact);
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

export default { buildTeacherLessonArtifact, verifyTeacherLessonArtifact, exportTeacherLessonMarkdown };
