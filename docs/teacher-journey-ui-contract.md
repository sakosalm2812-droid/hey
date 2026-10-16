# Teacher lesson journey UI contract

The protected HEY app can use `HEY.teacher.createLessonWorksheetJourney({ lesson, assessment, context, journeyId? })` from `src/core/index.js`. It builds the lesson, teacher-only assessment/answer key, and student worksheet, then saves all three through one atomic Forge RPC. The builders validate and shape the teacher's supplied content; this API does not call an AI text generator.

## Standalone class activity handout

A Teacher can turn one selected activity from a verified lesson into a separate, student-facing Forge draft without first creating an assessment. Call `HEY.teacher.buildActivityHandoutArtifact(verifiedLesson, activityIndex, context)`, then await `HEY.teacher.saveActivityHandoutArtifact(handout, context)`. `activityIndex` is a zero-based index into the verified lesson activities. The active authenticated user must have the Teacher role, matching account scope, and the class in their server-managed class claims. The saved artifact uses `hey.teacher.activity_handout.v1`, carries source-lesson digest and class provenance, contains only the selected activity directions and materials, and never copies assessment answers. Treat any save rejection, including an unavailable Forge provider, as not saved. This API does not distribute the handout to students.

After Forge confirms the saved handout, the Teacher may download a student-facing Markdown export using `HEY.teacher.exportActivityHandoutMarkdown(handout, { accountScope, workspaceId, classId, safetyReview })`. Export rechecks the authenticated teacher, account, workspace, class, source digest and artifact content. A review receipt matching the active account/workspace and handout author is required for every export. The file states that factual claims and curriculum alignment remain unverified; downloading it does not distribute it.

## Request

`lesson` accepts these fields:

- `title`, `subject`, `gradeBand`, `durationMinutes`
- `learningObjectives: string[]` (1–12)
- `activities: { title, instructions, minutes }[]` (up to 20; total minutes must fit the duration)
- `assessment: { prompt, expectedLearning }`
- Optional `resources: string[]` and `curriculumReferences: { title, url }[]`
- `accountScope`, `workspaceId`, `currentAccountScope`, `currentWorkspaceId`

`assessment` accepts `title`, `directions`, and `questions` (1–20). Each question has `objective`, `prompt`, `expectedLearning`, `teacherAnswer`, and `points` (integer 1–10). `objective` must exactly match one of the lesson's learning objectives.

`context` must include `accountScope`, `workspaceId`, `classId`, `currentAccountScope`, `currentWorkspaceId`, and `currentClassId`. The account, workspace, and class values must match their `current*` counterparts. These request values do not prove identity: the logged-in Supabase user must also have server-managed teacher, account, and class claims. Do not include student records or personal data.

Example call shape (fill values from the active authenticated app context):

```js
const result = await HEY.teacher.createLessonWorksheetJourney({
  lesson: {
    title: "Fractions on a number line",
    subject: "Mathematics",
    gradeBand: "3-5",
    durationMinutes: 45,
    learningObjectives: ["Place unit fractions on a number line"],
    activities: [{ title: "Build a number line", instructions: "Place fraction cards and explain their positions.", minutes: 20 }],
    assessment: { prompt: "Place one-half on the number line.", expectedLearning: "The learner identifies the midpoint." },
    accountScope,
    workspaceId,
    currentAccountScope: accountScope,
    currentWorkspaceId: workspaceId,
  },
  assessment: {
    title: "Fractions check",
    directions: "Answer each question.",
    questions: [{
      objective: "Place unit fractions on a number line",
      prompt: "Where does one-quarter belong?",
      expectedLearning: "One of four equal parts from zero.",
      teacherAnswer: "At one-quarter of the distance from zero to one.",
      points: 1,
    }],
  },
  context: {
    accountScope, workspaceId, classId,
    currentAccountScope: accountScope,
    currentWorkspaceId: workspaceId,
    currentClassId: classId,
  },
});
```

## States and recovery

- Only show completion after the promise resolves. The response includes `journeyId` and `saved.lesson`, `saved.teacherArtifact`, and `saved.studentArtifact`; each is a persisted row returned and verified by Forge.
- On rejection, show a save failure. If `error.recovery` is present, retain the unchanged lesson, assessment, and context plus `journeyId` and `journeyCreatedAt`. Offer retry by sending the same inputs, the recovered `journeyId`, and `context` extended with `journeyCreatedAt`. The generated IDs are deterministic for that journey, so a committed transaction whose response was lost can be read back without duplicate rows.
- `error.recovery.artifactIds` lists the stable IDs when available. An empty list means failure happened before ID derivation; retry with the same `journeyId` still derives the same IDs.
- Treat missing teacher claims or a missing Supabase configuration as unavailable/unauthorized, not as a saved draft. Do not display a saved state from local form data or a retry handle.
- Student worksheets contain prompts only; the returned teacher assessment contains answer fields and must stay teacher-only. Route the two outputs separately in the UI.

## Deployment boundary

The RPC is defined in `supabase/migrations/20261015000500_teacher_artifact_batch.sql`. That migration has not been applied or exercised against live Supabase in this checkout. Application APIs enforce read/export access, but direct table access is not proven safe without database RLS. The frontend should surface that configured persistence is required and must not imply production durability until deployment and live verification are complete.
