const PERSISTENCE_CONTRACTS = [
  ["lesson", "hey.teacher.lesson.v1"],
  ["teacherArtifact", "hey.teacher.assessment.v1"],
  ["studentArtifact", "hey.teacher.worksheet.v1"],
];
const PRIVATE_STUDENT_FIELDS = new Set([
  "answer", "answers", "teacheranswer", "answerkey", "correctanswer", "correctanswers",
  "expectedlearning", "solution", "solutions",
]);

function normalizedFieldName(value) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function hasTeacherAnswerKeyField(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasTeacherAnswerKeyField(item, seen));
  return Object.entries(value).some(([key, item]) => PRIVATE_STUDENT_FIELDS.has(normalizedFieldName(key)) || hasTeacherAnswerKeyField(item, seen));
}

export function studentExportHasTeacherKeyMarker(content) {
  return typeof content === "string"
    && /(?:^|\n)\s*(?:#{1,6}\s*)?(?:teacher[- ]only\s+)?answer key\b|\*\*answer:\*\*|teacherAnswer\s*:/i.test(content);
}

export function teacherPreparedJourneyMatches(journey, { accountScope, workspaceId, classId } = {}) {
  const lesson = journey?.lesson;
  const teacherArtifact = journey?.teacherArtifact;
  const studentArtifact = journey?.studentArtifact;
  if (!lesson || !teacherArtifact || !studentArtifact) return false;
  const lessonMetadata = lesson.metadata;
  const teacherMetadata = teacherArtifact.metadata;
  const studentMetadata = studentArtifact.metadata;
  return lessonMetadata?.accountScope === accountScope && lessonMetadata?.workspaceId === workspaceId
    && teacherMetadata?.accountScope === accountScope && teacherMetadata?.workspaceId === workspaceId
    && teacherMetadata?.classId === classId && teacherMetadata?.audience === "teacher_only"
    && studentMetadata?.accountScope === accountScope && studentMetadata?.workspaceId === workspaceId
    && studentMetadata?.classId === classId && studentMetadata?.audience === "student"
    && !hasTeacherAnswerKeyField(studentArtifact.content);
}

export function teacherJourneyPersistenceMatches(journey, { accountScope, workspaceId, classId } = {}) {
  const saved = journey?.saved;
  if (!saved || !PERSISTENCE_CONTRACTS.every(([key]) => saved[key])) return false;
  const ids = [];
  for (const [key, contract] of PERSISTENCE_CONTRACTS) {
    const artifact = saved[key];
    const metadata = artifact?.metadata;
    if (typeof artifact?.id !== "string" || !artifact.id || artifact.projectId !== workspaceId
      || metadata?.accountScope !== accountScope || metadata?.workspaceId !== workspaceId
      || metadata?.classId !== classId || metadata?.artifactContract !== contract) return false;
    ids.push(artifact.id);
  }
  return new Set(ids).size === PERSISTENCE_CONTRACTS.length
    && saved.teacherArtifact.metadata.audience === "teacher_only"
    && saved.studentArtifact.metadata.audience === "student"
    && !hasTeacherAnswerKeyField(saved.studentArtifact.content);
}

export function teacherJourneyMatchesPreview(preview, journey) {
  return PERSISTENCE_CONTRACTS.every(([key]) => {
    const before = preview?.[key];
    const after = journey?.[key];
    return before && after
      && JSON.stringify(before.content) === JSON.stringify(after.content)
      && before.metadata?.safety?.reviewRequired === after.metadata?.safety?.reviewRequired
      && JSON.stringify(before.metadata?.safety?.reviewReasons || []) === JSON.stringify(after.metadata?.safety?.reviewReasons || []);
  });
}

export function teacherExportsAreComplete(exportsByAudience) {
  const expected = [
    ["lesson", "lesson-plan.md"],
    ["teacherAnswerKey", "teacher-answer-key.md"],
    ["studentWorksheet", "student-worksheet.md"],
  ];
  return expected.every(([key, filename]) => {
    const exported = exportsByAudience?.[key];
    return exported?.filename === filename && exported.mimeType === "text/markdown"
      && typeof exported.content === "string" && exported.content.trim().length > 0;
  }) && !studentExportHasTeacherKeyMarker(exportsByAudience.studentWorksheet?.content);
}
