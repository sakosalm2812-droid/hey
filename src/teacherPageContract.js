const PERSISTENCE_CONTRACTS = [
  ["lesson", "hey.teacher.lesson.v1"],
  ["teacherArtifact", "hey.teacher.assessment.v1"],
  ["studentArtifact", "hey.teacher.worksheet.v1"],
];

export function hasTeacherAnswerKeyField(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasTeacherAnswerKeyField(item, seen));
  return Object.entries(value).some(([key, item]) => key === "teacherAnswer" || hasTeacherAnswerKeyField(item, seen));
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
  });
}
