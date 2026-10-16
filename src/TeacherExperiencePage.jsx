import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, Download, GraduationCap, LoaderCircle, ShieldCheck } from "lucide-react";

import HEY from "./core/index.js";
import { useAuth } from "./AuthContext.jsx";
import { supabaseClient } from "./lib/supabase.js";
import { listRecords } from "./lib/heyRecords.js";
import { getAccountScope, subscribeAccountScope } from "./core/accountScope.js";
import { hasTeacherAnswerKeyField, resolveTeacherPageAccess, teacherJourneyPersistenceMatches } from "./teacherExperiencePageContract.js";
import "./TeacherExperiencePage.css";

const EMPTY_LESSON = Object.freeze({
  title: "Fractions on a number line",
  subject: "Mathematics",
  gradeBand: "3-5",
  durationMinutes: "40",
  objectives: "Place unit fractions on a number line",
  activityTitle: "Build a number line",
  activityInstructions: "Place fraction cards and explain each choice.",
  activityMinutes: "20",
  questionPrompt: "Where does 1/4 belong on the number line?",
  expectedLearning: "Learner places 1/4 between 0 and 1/2 and explains why.",
  teacherAnswer: "One quarter is one of four equal parts; mark it one quarter of the way from zero to one.",
  points: "2",
});

function downloadMarkdown(exported) {
  const url = URL.createObjectURL(new Blob([exported.content], { type: exported.mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = exported.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function hasActiveContext(expected, classIds) {
  return Boolean(expected?.userId
    && getAccountScope() === expected.accountScope
    && expected.accountScope === `account:${expected.userId}`
    && classIds.includes(expected.classId));
}

async function readCurrentTeacherAccess(expectedUserId) {
  const { data, error: authError } = await supabaseClient.auth.getUser();
  const accountScope = getAccountScope();
  if (authError || data?.user?.id !== expectedUserId || accountScope !== `account:${expectedUserId}`) {
    throw new Error("The signed-in account changed or could not be verified. Reload Teacher Mode before continuing.");
  }
  const current = resolveTeacherPageAccess(data.user, accountScope);
  if (current.status !== "ready") throw new Error("Current Teacher role or class access could not be verified.");
  return current;
}

export default function TeacherExperiencePage() {
  const { user, loading: authLoading } = useAuth();
  const [access, setAccess] = useState({ status: "checking", classIds: [] });
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [lessonForm, setLessonForm] = useState({ ...EMPTY_LESSON });
  const [preview, setPreview] = useState(null);
  const [savedJourney, setSavedJourney] = useState(null);
  const [exports, setExports] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);
  const busyRef = useRef(false);
  const draftRevisionRef = useRef(0);
  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedProjectId) || null, [projects, selectedProjectId]);

  const resetTransientJourney = useCallback(() => {
    setPreview(null);
    setSavedJourney(null);
    setExports(null);
    setSafetyAcknowledged(false);
    setStatus("idle");
    setError("");
  }, []);

  useEffect(() => subscribeAccountScope(() => {
    draftRevisionRef.current += 1;
    resetTransientJourney();
    setProjects([]);
    setSelectedProjectId("");
    setSelectedClassId("");
    setAccess({ status: "checking", classIds: [] });
  }), [resetTransientJourney]);

  useEffect(() => {
    let cancelled = false;
    async function loadTeacherAccess() {
      if (authLoading) return;
      if (!user?.id) {
        setAccess({ status: "identity-missing", classIds: [] });
        return;
      }
      const expectedAccountScope = `account:${user.id}`;
      setAccess({ status: "checking", classIds: [] });
      setProjects([]);
      try {
        const { data, error: authError } = await supabaseClient.auth.getUser();
        if (cancelled) return;
        if (authError || data?.user?.id !== user.id || getAccountScope() !== expectedAccountScope) {
          setAccess({ status: "service-unavailable", classIds: [] });
          return;
        }
        const verifiedAccess = resolveTeacherPageAccess(data.user, expectedAccountScope);
        setAccess(verifiedAccess);
        if (verifiedAccess.status !== "ready") return;
        const records = await listRecords(data.user.id, "project");
        if (cancelled || getAccountScope() !== expectedAccountScope) return;
        const eligibleProjects = (records || []).filter((record) => typeof record?.id === "string" && record.id.trim())
          .map((record) => ({ id: record.id, name: record.title || "Untitled project" }));
        setProjects(eligibleProjects);
        setSelectedProjectId((current) => eligibleProjects.some((project) => project.id === current)
          ? current : eligibleProjects[0]?.id || "");
        setSelectedClassId((current) => verifiedAccess.classIds.includes(current) ? current : verifiedAccess.classIds[0] || "");
      } catch {
        if (!cancelled) setAccess({ status: "service-unavailable", classIds: [] });
      }
    }
    loadTeacherAccess();
    return () => { cancelled = true; };
  }, [authLoading, user?.id]);

  function updateField(field, value) {
    draftRevisionRef.current += 1;
    setLessonForm((current) => ({ ...current, [field]: value }));
    resetTransientJourney();
  }

  function buildRequests() {
    const accountScope = access.accountScope;
    const workspaceId = selectedProject?.id;
    const classId = selectedClassId;
    if (access.status !== "ready" || !hasActiveContext({ userId: access.userId, accountScope, classId }, access.classIds)
      || !workspaceId || !projects.some((project) => project.id === workspaceId)) {
      throw new Error("Choose a project and a class assigned to your verified Teacher account.");
    }
    const lessonRequest = {
      title: lessonForm.title.trim(),
      subject: lessonForm.subject.trim(),
      gradeBand: lessonForm.gradeBand,
      durationMinutes: Number(lessonForm.durationMinutes),
      learningObjectives: lessonForm.objectives.split("\n").map((item) => item.trim()).filter(Boolean),
      curriculumReferences: [],
      resources: [],
      activities: [{ title: lessonForm.activityTitle.trim(), instructions: lessonForm.activityInstructions.trim(), minutes: Number(lessonForm.activityMinutes) }],
      assessment: { prompt: lessonForm.questionPrompt.trim(), expectedLearning: lessonForm.expectedLearning.trim() },
      accountScope,
      workspaceId,
      currentAccountScope: accountScope,
      currentWorkspaceId: workspaceId,
      createdAt: new Date().toISOString(),
    };
    const assessmentRequest = {
      title: `${lessonForm.title.trim()} — exit check`,
      directions: "Show your reasoning for each answer.",
      questions: [{
        objective: lessonRequest.learningObjectives[0],
        prompt: lessonForm.questionPrompt.trim(),
        expectedLearning: lessonForm.expectedLearning.trim(),
        teacherAnswer: lessonForm.teacherAnswer.trim(),
        points: Number(lessonForm.points),
      }],
      createdAt: lessonRequest.createdAt,
    };
    const context = {
      accountScope,
      workspaceId,
      currentAccountScope: accountScope,
      currentWorkspaceId: workspaceId,
      classId,
      currentClassId: classId,
      journeyCreatedAt: lessonRequest.createdAt,
    };
    return { lessonRequest, assessmentRequest, context, expected: { userId: access.userId, accountScope, workspaceId, classId } };
  }

  async function preparePreview(event) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    const draftRevision = draftRevisionRef.current;
    resetTransientJourney();
    setStatus("preparing");
    try {
      const requests = buildRequests();
      const lesson = await HEY.teacher.buildLessonArtifact(requests.lessonRequest);
      const assessment = await HEY.teacher.buildAssessmentArtifact(lesson, requests.assessmentRequest, requests.context);
      const worksheet = await HEY.teacher.buildWorksheetArtifact(assessment, requests.context);
      if (hasTeacherAnswerKeyField(worksheet.content)) throw new Error("The worksheet preview failed its answer-key separation check.");
      if (draftRevisionRef.current !== draftRevision) throw new Error("Your lesson or class changed while the preview was being prepared. Review the current form and try again.");
      const journeyId = globalThis.crypto?.randomUUID?.();
      if (!journeyId) throw new Error("A secure journey ID is unavailable in this browser. Try an up-to-date browser.");
      if (!hasActiveContext({ ...requests.expected, classId: requests.context.classId }, access.classIds)) {
        throw new Error("Teacher access changed while the preview was being prepared. Review your class and try again.");
      }
      setPreview({ ...requests, lesson, assessment, worksheet, journeyId });
      setStatus("preview-ready");
    } catch (prepareError) {
      setError(prepareError?.message || "The lesson preview could not be prepared.");
      setStatus("error");
    } finally {
      busyRef.current = false;
    }
  }

  async function saveJourney() {
    if (!preview || busyRef.current) return;
    busyRef.current = true;
    setStatus("saving");
    setError("");
    setExports(null);
    try {
      const freshAccess = await readCurrentTeacherAccess(preview.expected.userId);
      if (freshAccess.userId !== preview.expected.userId
        || !hasActiveContext(preview.expected, freshAccess.classIds)) {
        throw new Error("Teacher access or the selected class changed. Recheck access and prepare a fresh preview.");
      }
      const result = await HEY.teacher.createLessonWorksheetJourney({
        lesson: preview.lessonRequest,
        assessment: preview.assessmentRequest,
        context: preview.context,
        journeyId: preview.journeyId,
      });
      if (!teacherJourneyPersistenceMatches(result, { ...preview.expected, journeyId: preview.journeyId })) {
        throw new Error("Forge did not return the complete verified lesson, private answer key, and answer-free worksheet.");
      }
      const confirmedAccess = await readCurrentTeacherAccess(preview.expected.userId);
      if (confirmedAccess.status !== "ready" || !hasActiveContext(preview.expected, confirmedAccess.classIds)) {
        throw new Error("The signed-in account changed before Forge confirmation could be shown. Reload Teacher Mode to check the saved journey.");
      }
      setSavedJourney(result);
      setStatus("saved");
    } catch (saveError) {
      setError(saveError?.recovery?.journeyId === preview.journeyId
        ? "Forge could not confirm this journey. Retry the same save to safely verify or complete it; the journey ID is unchanged."
        : saveError?.message || "Forge could not confirm the lesson set.");
      setStatus("save-error");
    } finally {
      busyRef.current = false;
    }
  }

  async function prepareExports() {
    if (!savedJourney || !preview || busyRef.current) return;
    busyRef.current = true;
    setStatus("exporting");
    setError("");
    try {
      const freshAccess = await readCurrentTeacherAccess(preview.expected.userId);
      if (freshAccess.userId !== preview.expected.userId
        || !hasActiveContext(preview.expected, freshAccess.classIds)) {
        throw new Error("Teacher access changed. Sign in again with the assigned class before exporting.");
      }
      if (!teacherJourneyPersistenceMatches(savedJourney, { ...preview.expected, journeyId: preview.journeyId })) {
        throw new Error("The verified Forge readback no longer matches the selected Teacher account, class, and project.");
      }
      if (hasTeacherAnswerKeyField(savedJourney.studentArtifact.content)) {
        throw new Error("Export stopped because the saved student worksheet contains a teacher-only field.");
      }
      const safetyReviewRequired = [savedJourney.lesson, savedJourney.teacherArtifact, savedJourney.studentArtifact]
        .some((artifact) => artifact.metadata?.safety?.reviewRequired === true);
      if (safetyReviewRequired && !safetyAcknowledged) {
        throw new Error("Review the safety flags and confirm before preparing classroom exports.");
      }
      const safetyReview = safetyReviewRequired ? {
        accountScope: preview.expected.accountScope,
        workspaceId: preview.expected.workspaceId,
        reviewerId: preview.expected.userId,
        reviewedAt: new Date().toISOString(),
      } : undefined;
      const common = { accountScope: preview.expected.accountScope, workspaceId: preview.expected.workspaceId, classId: preview.expected.classId, safetyReview };
      const [lesson, answerKey, worksheet] = await Promise.all([
        HEY.teacher.exportLessonMarkdown(savedJourney.lesson, common),
        HEY.teacher.exportAnswerKeyMarkdown(savedJourney.teacherArtifact, { ...common, classId: preview.expected.classId }),
        HEY.teacher.exportWorksheetMarkdown(savedJourney.studentArtifact, common),
      ]);
      if (hasTeacherAnswerKeyField(savedJourney.studentArtifact.content)) throw new Error("Student worksheet answer-key check failed.");
      const confirmedAccess = await readCurrentTeacherAccess(preview.expected.userId);
      if (confirmedAccess.status !== "ready" || !hasActiveContext(preview.expected, confirmedAccess.classIds)) throw new Error("Teacher access changed during export preparation.");
      setExports({ lesson, answerKey, worksheet });
      setStatus("complete");
    } catch (exportError) {
      setError(exportError?.message || "Teacher access could not be verified for export.");
      setStatus("export-error");
    } finally {
      busyRef.current = false;
    }
  }

  const busy = ["preparing", "saving", "exporting"].includes(status);

  return (
    <main className="teacher-experience" aria-labelledby="teacher-experience-title">
      <header className="teacher-experience__header">
        <div><p className="teacher-experience__eyebrow">Verified Teacher workspace</p><h1 id="teacher-experience-title">Lesson builder</h1>
          <p>Build an editable lesson, a private answer key, and a separate student worksheet for an assigned class.</p></div>
        <span className="teacher-experience__secure"><GraduationCap size={17} aria-hidden="true" /> Teacher access required</span>
      </header>

      {authLoading || access.status === "checking" ? <p className="teacher-experience__notice" role="status"><LoaderCircle className="teacher-experience__spin" size={17} aria-hidden="true" /> Checking your signed-in Teacher access…</p> : null}
      {access.status === "identity-missing" || access.status === "role-denied" || access.status === "scope-mismatch" ? (
        <div className="teacher-experience__notice teacher-experience__notice--error" role="alert"><AlertCircle size={18} aria-hidden="true" /><p>This workspace is available only to a Teacher account with a verified school account and assigned class.</p></div>
      ) : null}
      {access.status === "class-unassigned" ? <div className="teacher-experience__notice" role="status"><ShieldCheck size={18} aria-hidden="true" /><p>Your account has no verified class assignments. A school administrator must provision Teacher access.</p></div> : null}
      {access.status === "service-unavailable" ? <div className="teacher-experience__notice teacher-experience__notice--error" role="alert"><AlertCircle size={18} aria-hidden="true" /><p>HEY could not verify your current account with Supabase. No lesson data was loaded or saved.</p></div> : null}
      {access.status === "ready" && !projects.length ? <div className="teacher-experience__notice" role="status"><AlertCircle size={18} aria-hidden="true" /><p>Create a project first. Forge saves the lesson set to a project you can access.</p></div> : null}

      {access.status === "ready" && projects.length > 0 ? (
        <>
          <p className="teacher-experience__privacy" role="note">No student names, grades, records, or personal answers are collected here. Use fictional examples. Teacher answers stay in the private answer key.</p>
          <form className="teacher-experience__form" onSubmit={preparePreview}>
            <section className="teacher-experience__section" aria-labelledby="teacher-scope-heading">
              <div className="teacher-experience__section-heading"><span>01</span><div><h2 id="teacher-scope-heading">Verified class and project</h2><p>These choices are limited to your signed-in account’s assignments.</p></div></div>
              <div className="teacher-experience__grid">
                <label>Class<select value={selectedClassId} onChange={(event) => { draftRevisionRef.current += 1; setSelectedClassId(event.target.value); resetTransientJourney(); }} required>
                  {access.classIds.map((classId) => <option key={classId} value={classId}>{classId}</option>)}
                </select></label>
                <label>Forge project<select value={selectedProjectId} onChange={(event) => { draftRevisionRef.current += 1; setSelectedProjectId(event.target.value); resetTransientJourney(); }} required>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select></label>
              </div>
            </section>

            <section className="teacher-experience__section" aria-labelledby="teacher-lesson-heading">
              <div className="teacher-experience__section-heading"><span>02</span><div><h2 id="teacher-lesson-heading">Lesson outline</h2><p>Write the material you want to teach; HEY will not invent lesson or assessment content.</p></div></div>
              <div className="teacher-experience__grid">
                <label>Lesson title<input value={lessonForm.title} onChange={(event) => updateField("title", event.target.value)} required /></label>
                <label>Subject<input value={lessonForm.subject} onChange={(event) => updateField("subject", event.target.value)} required /></label>
                <label>Grade band<select value={lessonForm.gradeBand} onChange={(event) => updateField("gradeBand", event.target.value)}>
                  {["pre-k", "kindergarten", "1-2", "3-5", "6-8", "9-12", "adult", "mixed"].map((gradeBand) => <option key={gradeBand} value={gradeBand}>{gradeBand}</option>)}
                </select></label>
                <label>Lesson duration in minutes<input type="number" min="5" max="240" value={lessonForm.durationMinutes} onChange={(event) => updateField("durationMinutes", event.target.value)} required /></label>
                <label className="teacher-experience__wide">Learning objectives<textarea rows={2} value={lessonForm.objectives} onChange={(event) => updateField("objectives", event.target.value)} required /></label>
                <label>Activity title<input value={lessonForm.activityTitle} onChange={(event) => updateField("activityTitle", event.target.value)} required /></label>
                <label>Activity minutes<input type="number" min="1" max="180" value={lessonForm.activityMinutes} onChange={(event) => updateField("activityMinutes", event.target.value)} required /></label>
                <label className="teacher-experience__wide">Activity instructions<textarea rows={2} value={lessonForm.activityInstructions} onChange={(event) => updateField("activityInstructions", event.target.value)} required /></label>
              </div>
            </section>

            <section className="teacher-experience__section" aria-labelledby="teacher-assessment-heading">
              <div className="teacher-experience__section-heading"><span>03</span><div><h2 id="teacher-assessment-heading">Assessment and private answer</h2><p>Assessment answers are stored only in the Teacher-only artifact.</p></div></div>
              <div className="teacher-experience__grid">
                <label className="teacher-experience__wide">Question<input value={lessonForm.questionPrompt} onChange={(event) => updateField("questionPrompt", event.target.value)} required /></label>
                <label className="teacher-experience__wide">Expected learning<textarea rows={2} value={lessonForm.expectedLearning} onChange={(event) => updateField("expectedLearning", event.target.value)} required /></label>
                <label className="teacher-experience__wide teacher-experience__answer">Teacher answer<textarea rows={2} value={lessonForm.teacherAnswer} onChange={(event) => updateField("teacherAnswer", event.target.value)} required /></label>
                <label>Points<input type="number" min="1" max="10" value={lessonForm.points} onChange={(event) => updateField("points", event.target.value)} required /></label>
              </div>
              <p className="teacher-experience__privacy"><ShieldCheck size={16} aria-hidden="true" /> Student records and personal answers are not part of this workflow.</p>
            </section>

            <button className="teacher-experience__primary" type="submit" disabled={busy || !selectedClassId || !selectedProjectId}>
              {status === "preparing" ? <LoaderCircle className="teacher-experience__spin" size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
              {status === "preparing" ? "Preparing local preview…" : "Build lesson preview"}
            </button>
          </form>

          {preview ? <section className="teacher-experience__preview" aria-labelledby="teacher-preview-heading">
            <header><div><p className="teacher-experience__eyebrow">Unsaved preview</p><h2 id="teacher-preview-heading">Review the lesson set</h2><p>Nothing was written to Forge while preparing this preview.</p></div></header>
            {[preview.lesson, preview.assessment].some((artifact) => artifact.metadata?.safety?.reviewRequired)
              ? <div className="teacher-experience__notice" role="status"><ShieldCheck size={18} aria-hidden="true" /><p>Safety review flags: {[...new Set([...(preview.lesson.metadata.safety.reviewReasons || []), ...(preview.assessment.metadata.safety.reviewReasons || [])])].join(", ")}. Review the content before classroom use.</p></div> : null}
            <div className="teacher-experience__outputs">
              <article><h3>{preview.lesson.title}</h3><p>{preview.lesson.content.subject} · {preview.lesson.content.gradeBand} · {preview.lesson.content.durationMinutes} minutes</p><h4>Objectives</h4><ul>{preview.lesson.content.learningObjectives.map((objective) => <li key={objective}>{objective}</li>)}</ul><h4>Activity</h4><p>{preview.lesson.content.activities[0]?.instructions}</p></article>
              <article className="teacher-experience__private"><h3>Teacher-only answer key</h3><p>{preview.assessment.content.questions[0]?.prompt}</p><p><strong>Answer:</strong> {preview.assessment.content.questions[0]?.teacherAnswer}</p></article>
              <article><h3>Student worksheet</h3><p>Checked to exclude teacher-answer fields.</p><ol>{preview.worksheet.content.questions.map((question, index) => <li key={`${index}-${question.prompt}`}>{question.prompt} ({question.points} points)</li>)}</ol></article>
            </div>
            <div className="teacher-experience__actions">
              <button className="teacher-experience__primary" type="button" onClick={saveJourney} disabled={busy || Boolean(savedJourney)}>{status === "saving" ? <LoaderCircle className="teacher-experience__spin" size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}{savedJourney ? "Forge confirmed all three" : status === "saving" ? "Saving all three…" : "Save all three to Forge"}</button>
              <button className="teacher-experience__secondary" type="button" onClick={() => { resetTransientJourney(); setStatus("idle"); }}>Edit lesson</button>
            </div>
            {savedJourney ? <div className="teacher-experience__saved" role="status"><Check size={17} aria-hidden="true" /><div><strong>Forge confirmed the complete lesson set.</strong><span>Lesson, private answer key, and student worksheet readback matched the selected project, class, account, and creator.</span></div></div> : null}
            {savedJourney && !exports ? <div className="teacher-experience__review">
              <label><input type="checkbox" checked={safetyAcknowledged} onChange={(event) => setSafetyAcknowledged(event.target.checked)} /> I reviewed the safety flags and will verify this material before classroom use.</label>
              <button type="button" className="teacher-experience__primary" onClick={prepareExports} disabled={busy}>{status === "exporting" ? <LoaderCircle className="teacher-experience__spin" size={17} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}{status === "exporting" ? "Checking access and exports…" : "Prepare the three exports"}</button>
            </div> : null}
            {exports ? <div className="teacher-experience__outputs teacher-experience__exports" aria-live="polite">
              {[["Lesson plan", exports.lesson], ["Teacher-only answer key", exports.answerKey], ["Student worksheet", exports.worksheet]].map(([label, exported]) => <article key={exported.filename}><div><h3>{label}</h3><p>Access and content checks passed for this export.</p></div><button className="teacher-experience__secondary" type="button" onClick={() => downloadMarkdown(exported)}><Download size={15} aria-hidden="true" /> Download {exported.filename}</button><pre>{exported.content}</pre></article>)}
            </div> : null}
          </section> : null}
        </>
      ) : null}

      {error ? <div className="teacher-experience__notice teacher-experience__notice--error" role="alert"><AlertCircle size={18} aria-hidden="true" /><p>{error}</p>{status === "save-error" && preview ? <button className="teacher-experience__secondary" type="button" onClick={saveJourney} disabled={busy}>Retry the same journey save</button> : null}</div> : null}
    </main>
  );
}
