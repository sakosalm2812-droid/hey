import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, Check, Download, GraduationCap, LoaderCircle, Plus, RotateCw, ShieldCheck, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { HEY } from "./core/index.js";
import { getAccountScope } from "./core/accountScope.js";
import { useAuth } from "./AuthContext.jsx";
import { isSupabaseConfigured, supabaseClient } from "./lib/supabase.js";
import { listRecords } from "./lib/heyRecords.js";
import { hasTeacherAnswerKeyField, teacherExportsAreComplete, teacherJourneyPersistenceMatches, teacherPreparedJourneyMatches } from "./teacherPageContract.js";
import "./TeacherPage.css";

const GRADE_BANDS = ["pre-k", "kindergarten", "1-2", "3-5", "6-8", "9-12", "adult", "mixed"];
const EMPTY_ACTIVITY = { title: "", instructions: "", minutes: "10" };
const EMPTY_QUESTION = { objective: "", prompt: "", expectedLearning: "", teacherAnswer: "", points: "1" };

function textLines(value) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

async function readCurrentTeacher(accountId, classId) {
  const { data, error } = await supabaseClient.auth.getUser();
  const authenticatedUser = data?.user;
  if (error || !authenticatedUser?.id || authenticatedUser.id !== accountId) {
    throw new Error("Your signed-in account could not be verified. Refresh your session and try again.");
  }
  const accountScope = `account:${authenticatedUser.id}`;
  const claims = authenticatedUser.app_metadata || {};
  if (getAccountScope() !== accountScope || claims.hey_role !== "teacher" || claims.hey_account_scope !== accountScope) {
    throw new Error("This workflow requires an authenticated Teacher account for the active account scope.");
  }
  const classIds = Array.isArray(claims.hey_class_ids)
    ? [...new Set(claims.hey_class_ids.filter((value) => typeof value === "string" && value.trim()))]
    : [];
  if (!classIds.length || classId && !classIds.includes(classId)) {
    throw new Error("Your Teacher account is not authorized for the selected class.");
  }
  return { userId: authenticatedUser.id, accountScope, classIds };
}

function downloadMarkdown(exported) {
  const url = URL.createObjectURL(new Blob([exported.content], { type: exported.mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = exported.filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TeacherPage() {
  const { user } = useAuth();
  const accountId = user?.id || "";
  const accountRef = useRef(accountId);
  const saveInFlightRef = useRef(false);
  useLayoutEffect(() => { accountRef.current = accountId; }, [accountId]);

  const [access, setAccess] = useState({ status: "checking", message: "Verifying your Teacher access…" });
  const [classIds, setClassIds] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [accessRetry, setAccessRetry] = useState(0);
  const [lessonTitle, setLessonTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [gradeBand, setGradeBand] = useState("6-8");
  const [durationMinutes, setDurationMinutes] = useState("45");
  const [objectives, setObjectives] = useState("");
  const [resources, setResources] = useState("");
  const [activities, setActivities] = useState([{ ...EMPTY_ACTIVITY }]);
  const [assessmentTitle, setAssessmentTitle] = useState("");
  const [assessmentDirections, setAssessmentDirections] = useState("");
  const [assessmentPrompt, setAssessmentPrompt] = useState("");
  const [assessmentSuccessCriteria, setAssessmentSuccessCriteria] = useState("");
  const [questions, setQuestions] = useState([{ ...EMPTY_QUESTION }]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [preparedJourney, setPreparedJourney] = useState(null);
  const [journeyContext, setJourneyContext] = useState(null);
  const [persistenceConfirmed, setPersistenceConfirmed] = useState(false);
  const [savedJourney, setSavedJourney] = useState(null);
  const [safetyReasons, setSafetyReasons] = useState([]);
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);
  const [exportsByAudience, setExportsByAudience] = useState(null);
  const [outputAccountId, setOutputAccountId] = useState("");

  useEffect(() => {
    let cancelled = false;
    setAccess({ status: "checking", message: "Verifying your Teacher access…" });
    setClassIds([]);
    setProjects([]);
    setSelectedClassId("");
    setWorkspaceId("");
    setSavedJourney(null);
    setPreparedJourney(null);
    setJourneyContext(null);
    setSafetyReasons([]);
    setSafetyAcknowledged(false);
    setExportsByAudience(null);
    setOutputAccountId("");
    setPersistenceConfirmed(false);
    setStatus("idle");
    setError("");

    async function loadTeacherContext() {
      if (!accountId) {
        setAccess({ status: "denied", message: "Sign in with a Teacher account to use this workflow." });
        return;
      }
      if (!isSupabaseConfigured) {
        setAccess({ status: "service-unavailable", message: "HEY’s account service is not configured in this build. Teacher role, class access, Forge workspaces, and persistence cannot be verified." });
        return;
      }
      try {
        const teacher = await readCurrentTeacher(accountId);
        const records = await listRecords(teacher.userId, "project");
        if (cancelled || accountRef.current !== accountId || getAccountScope() !== teacher.accountScope) return;
        const availableProjects = records
          .filter((record) => typeof record?.id === "string" && record.id && typeof record?.title === "string")
          .map((record) => ({ id: record.id, title: record.title }));
        setClassIds(teacher.classIds);
        setProjects(availableProjects);
        setSelectedClassId(teacher.classIds[0] || "");
        setWorkspaceId(availableProjects[0]?.id || "");
        setAccess({
          status: "ready",
          message: `Teacher account and authorized classes verified; ${availableProjects.length} existing project${availableProjects.length === 1 ? "" : "s"} loaded. Each Forge save is checked separately.`,
        });
      } catch (loadError) {
        if (!cancelled && accountRef.current === accountId) {
          const denied = /Teacher account|authorized class/i.test(loadError?.message || "");
          setAccess({
            status: denied ? "denied" : "error",
            message: denied ? loadError.message : `Teacher account or Forge workspace readiness could not be verified. ${loadError.message || "Check your connection and retry."}`,
          });
        }
      }
    }

    loadTeacherContext();
    return () => { cancelled = true; };
  }, [accountId, accessRetry]);

  async function prepareExports(journey, context, safetyReview) {
    const teacher = await readCurrentTeacher(accountId, context.classId);
    if (teacher.accountScope !== context.accountScope || accountRef.current !== accountId) {
      throw new Error("Your account changed before the exports were prepared.");
    }
    const [lesson, teacherAnswerKey, studentWorksheet] = await Promise.all([
      HEY.teacher.exportLessonMarkdown(journey.lesson, {
        accountScope: context.accountScope,
        workspaceId: context.workspaceId,
        ...(safetyReview ? { safetyReview } : {}),
      }),
      HEY.teacher.exportAnswerKeyMarkdown(journey.teacherArtifact, {
        accountScope: context.accountScope,
        workspaceId: context.workspaceId,
        classId: context.classId,
        ...(safetyReview ? { safetyReview } : {}),
      }),
      HEY.teacher.exportWorksheetMarkdown(journey.studentArtifact, {
        accountScope: context.accountScope,
        workspaceId: context.workspaceId,
        ...(safetyReview ? { safetyReview } : {}),
      }),
    ]);
    const allExports = { lesson, teacherAnswerKey, studentWorksheet };
    if (!teacherExportsAreComplete(allExports) || hasTeacherAnswerKeyField(journey.studentArtifact.content)
      || accountRef.current !== accountId || getAccountScope() !== context.accountScope) {
      throw new Error("HEY could not verify all three audience-specific exports. No output was displayed.");
    }
    setExportsByAudience(allExports);
    setOutputAccountId(accountId);
    setStatus("complete");
    setError("");
  }

  async function prepareLessonPreview(event) {
    event.preventDefault();
    if (status === "preparing" || status === "saving" || status === "exporting" || !workspaceId || !selectedClassId) return;
    setStatus("preparing");
    setError("");
    setPersistenceConfirmed(false);
    setSavedJourney(null);
    setPreparedJourney(null);
    setJourneyContext(null);
    setExportsByAudience(null);
    setOutputAccountId("");
    setSafetyAcknowledged(false);
    try {
      const teacher = await readCurrentTeacher(accountId, selectedClassId);
      const currentProjects = await listRecords(teacher.userId, "project");
      if (!currentProjects.some((project) => project.id === workspaceId)) {
        throw new Error("Select an existing project that is still available in your account.");
      }
      if (accountRef.current !== accountId || getAccountScope() !== teacher.accountScope) {
        throw new Error("Your account changed before the preview could be prepared.");
      }

      const accountScope = teacher.accountScope;
      const currentWorkspaceId = workspaceId;
      const currentClassId = selectedClassId;
      const lesson = {
        title: lessonTitle,
        subject,
        gradeBand,
        durationMinutes: Number(durationMinutes),
        learningObjectives: textLines(objectives),
        resources: textLines(resources),
        activities: activities.filter((activity) => activity.title.trim() || activity.instructions.trim()).map((activity) => ({
          title: activity.title,
          instructions: activity.instructions,
          minutes: Number(activity.minutes),
        })),
        assessment: { prompt: assessmentPrompt, expectedLearning: assessmentSuccessCriteria },
        accountScope,
        workspaceId: currentWorkspaceId,
        currentAccountScope: getAccountScope(),
        currentWorkspaceId,
      };
      const assessment = {
        title: assessmentTitle,
        directions: assessmentDirections,
        questions: questions.map((question) => ({ ...question, points: Number(question.points) })),
      };
      const context = {
        accountScope,
        workspaceId: currentWorkspaceId,
        classId: currentClassId,
        currentAccountScope: getAccountScope(),
        currentWorkspaceId,
        currentClassId,
      };
      const journey = await HEY.teacher.prepareLessonWorksheetJourney({ lesson, assessment, context });
      if (accountRef.current !== accountId || getAccountScope() !== accountScope) {
        throw new Error("Your account changed while the preview was being prepared. It was discarded.");
      }
      if (!teacherPreparedJourneyMatches(journey, context)) {
        throw new Error("HEY could not verify the account, class, workspace, and audience boundaries for this preview.");
      }
      const reasons = [...new Set([
        ...(journey.lesson.metadata.safety.reviewReasons || []),
        ...(journey.teacherArtifact.metadata.safety.reviewReasons || []),
        ...(journey.studentArtifact.metadata.safety.reviewReasons || []),
      ])];
      setPreparedJourney(journey);
      setJourneyContext(context);
      setSafetyReasons(reasons);
      setStatus("preview");
    } catch (previewError) {
      if (accountRef.current === accountId) {
        setStatus("error");
        setError(`Preview could not be prepared. Nothing was saved to Forge. ${previewError.message || "Check account and workspace access, then retry."}`);
      }
    }
  }

  async function savePreparedJourney() {
    if (!preparedJourney || !journeyContext || status !== "preview" || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setStatus("saving");
    setError("");
    let saveStarted = false;
    try {
      const teacher = await readCurrentTeacher(accountId, journeyContext.classId);
      const currentProjects = await listRecords(teacher.userId, "project");
      if (!currentProjects.some((project) => project.id === journeyContext.workspaceId)) {
        throw new Error("The selected Forge project is no longer available to this account.");
      }
      if (teacher.accountScope !== journeyContext.accountScope || accountRef.current !== accountId
        || getAccountScope() !== journeyContext.accountScope) {
        throw new Error("Your account or class authorization changed before saving.");
      }
      saveStarted = true;
      const journey = await HEY.teacher.saveLessonWorksheetJourney(preparedJourney, journeyContext);
      if (accountRef.current !== accountId || getAccountScope() !== journeyContext.accountScope) {
        throw new Error("Your account changed while Forge was saving. Verify the workspace before continuing.");
      }
      if (!teacherJourneyPersistenceMatches(journey, journeyContext)) {
        throw new Error("Forge did not return matching persistence confirmations for all three artifacts.");
      }
      setPersistenceConfirmed(true);
      setSavedJourney(journey);
      setPreparedJourney(null);
      if (safetyReasons.length) setStatus("review");
      else setStatus("saved");
    } catch (saveError) {
      if (accountRef.current === accountId) {
        if (saveStarted) {
          setStatus("partial-error");
          setError(`Forge did not confirm all three saves. One or more artifacts may already exist, so review the selected project in Forge before trying again. ${saveError.message || ""}`.trim());
        } else {
          setStatus("preview");
          setError(`The save could not start, so nothing was written. Check your teacher access and selected project, then retry. ${saveError.message || ""}`.trim());
        }
      }
    } finally {
      saveInFlightRef.current = false;
    }
  }

  async function exportSavedJourney(safetyReview) {
    if (!savedJourney || !journeyContext || status !== "saved") return;
    setStatus("exporting");
    setError("");
    try {
      await prepareExports(savedJourney, journeyContext, safetyReview);
    } catch (exportError) {
      if (accountRef.current === accountId) {
        setStatus("export-error");
        setError(`Forge confirmed all three saves, but exports could not be verified. Your saved artifacts remain in Forge. ${exportError.message || "Retry export when account access is ready."}`);
      }
    }
  }

  function discardPreview() {
    if (status !== "preview") return;
    setPreparedJourney(null);
    setJourneyContext(null);
    setSafetyReasons([]);
    setStatus("idle");
    setError("");
  }

  async function completeSafetyReview() {
    if (!savedJourney || !safetyAcknowledged || status !== "review") return;
    setStatus("exporting");
    setError("");
    try {
      const teacher = await readCurrentTeacher(accountId, selectedClassId);
      if (teacher.accountScope !== `account:${accountId}` || accountRef.current !== accountId) {
        throw new Error("Your account or class authorization changed before export.");
      }
      await prepareExports(savedJourney, journeyContext, {
        accountScope: teacher.accountScope,
        workspaceId: journeyContext.workspaceId,
        reviewerId: teacher.userId,
        reviewedAt: new Date().toISOString(),
      });
    } catch (reviewError) {
      if (accountRef.current === accountId) {
        setStatus("export-error");
        setError(`Forge confirmed all three saves, but the reviewed exports could not be verified: ${reviewError.message || "export failed"}`);
      }
    }
  }

  function updateActivity(index, key, value) {
    setActivities((current) => current.map((activity, position) => position === index ? { ...activity, [key]: value } : activity));
  }

  function updateQuestion(index, key, value) {
    setQuestions((current) => current.map((question, position) => position === index ? { ...question, [key]: value } : question));
  }

  const visibleExports = outputAccountId === accountId && access.status === "ready" ? exportsByAudience : null;
  const pageBusy = status === "preparing" || status === "saving" || status === "exporting";
  const formLocked = pageBusy || ["preview", "review", "saved", "complete", "partial-error", "export-error"].includes(status);

  return (
    <main className="teacher-page" aria-labelledby="teacher-page-title">
      <header className="teacher-page__header">
        <div><p className="teacher-page__eyebrow">Verified teacher workflow</p><h1 id="teacher-page-title">Lesson builder</h1><p>Create a lesson, a teacher-only answer key, and a student worksheet for a class you’re authorized to teach.</p></div>
        <span className="teacher-page__secure"><GraduationCap size={17} aria-hidden="true" /> Teacher access required</span>
      </header>

      {status === "preparing" && <p className="teacher-page__status" role="status"><LoaderCircle className="teacher-page__spin" size={17} aria-hidden="true" /> Building a local preview. Nothing is being saved.</p>}
      {status === "saving" && <p className="teacher-page__status" role="status"><LoaderCircle className="teacher-page__spin" size={17} aria-hidden="true" /> Saving three artifacts and checking Forge receipts…</p>}
      {status === "exporting" && <p className="teacher-page__status" role="status"><LoaderCircle className="teacher-page__spin" size={17} aria-hidden="true" /> Checking teacher and student exports…</p>}

      {access.status === "checking" && <p className="teacher-page__status" role="status"><LoaderCircle className="teacher-page__spin" size={17} aria-hidden="true" /> {access.message}</p>}
      {access.status === "ready" && <p className="teacher-page__status" role="status"><ShieldCheck size={17} aria-hidden="true" /> {access.message}</p>}
      {(access.status === "denied" || access.status === "error" || access.status === "service-unavailable") && <div className="teacher-page__message teacher-page__message--error" role="alert"><AlertCircle size={18} aria-hidden="true" /><p>{access.message}</p>{(access.status === "error" || access.status === "service-unavailable") && <button type="button" onClick={() => setAccessRetry((current) => current + 1)}><RotateCw size={15} aria-hidden="true" /> Retry readiness check</button>}</div>}

      {access.status === "ready" && !classIds.length && <div className="teacher-page__message" role="status"><ShieldCheck size={18} aria-hidden="true" /><p>Your account has no authorized class assignments.</p></div>}
      {access.status === "ready" && !projects.length && <div className="teacher-page__message" role="status"><AlertCircle size={18} aria-hidden="true" /><p>Create a project first. Forge uses an existing project as the lesson workspace.</p><Link to="/projects">Open Projects</Link></div>}

      {access.status === "ready" && classIds.length > 0 && projects.length > 0 && (
        <>
          <form className="teacher-page__form" onSubmit={prepareLessonPreview}>
            <fieldset className="teacher-page__form-fields" disabled={formLocked}>
            <section className="teacher-page__scope" aria-labelledby="teacher-scope-title">
              <div><p className="teacher-page__eyebrow">Verified context</p><h2 id="teacher-scope-title">Class and workspace</h2><p>These choices come from your account’s authorized classes and existing projects. Your role is read from your signed-in account.</p></div>
              <label>Authorized class
                <select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)} required disabled={pageBusy}>
                  {classIds.map((classId) => <option key={classId} value={classId}>{classId}</option>)}
                </select>
              </label>
              <label>Forge project
                <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} required disabled={pageBusy}>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
                </select>
              </label>
            </section>

            <section className="teacher-page__form-section" aria-labelledby="lesson-brief-title">
              <div className="teacher-page__section-heading"><span>01</span><div><h2 id="lesson-brief-title">Lesson brief</h2><p>Describe the lesson and the learning goals.</p></div></div>
              <div className="teacher-page__field-grid">
                <label>Lesson title<input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} maxLength={160} required /></label>
                <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={120} required /></label>
                <label>Grade band<select value={gradeBand} onChange={(event) => setGradeBand(event.target.value)}>{GRADE_BANDS.map((grade) => <option value={grade} key={grade}>{grade}</option>)}</select></label>
                <label>Duration in minutes<input type="number" min="5" max="240" step="1" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} required /></label>
              </div>
              <label>Learning objectives <span>One objective per line; questions must target these objectives.</span><textarea value={objectives} onChange={(event) => setObjectives(event.target.value)} rows={3} required /></label>
              <label>Resources <span>Optional; one per line.</span><textarea value={resources} onChange={(event) => setResources(event.target.value)} rows={2} /></label>
              <div className="teacher-page__repeat-heading"><h3>Class activities</h3><button type="button" onClick={() => setActivities((current) => [...current, { ...EMPTY_ACTIVITY }])} disabled={activities.length >= 20 || pageBusy}><Plus size={15} aria-hidden="true" /> Add activity</button></div>
              <div className="teacher-page__repeat-list">{activities.map((activity, index) => <fieldset className="teacher-page__repeat-card" key={index}><legend>Activity {index + 1}</legend>
                <label>Title<input value={activity.title} onChange={(event) => updateActivity(index, "title", event.target.value)} /></label>
                <label>Instructions<textarea value={activity.instructions} onChange={(event) => updateActivity(index, "instructions", event.target.value)} rows={2} /></label>
                <label>Minutes<input type="number" min="1" max="180" value={activity.minutes} onChange={(event) => updateActivity(index, "minutes", event.target.value)} /></label>
                {activities.length > 1 && <button type="button" className="teacher-page__remove" onClick={() => setActivities((current) => current.filter((_, position) => position !== index))} aria-label={`Remove activity ${index + 1}`}><Trash2 size={15} aria-hidden="true" /></button>}
              </fieldset>)}</div>
            </section>

            <section className="teacher-page__form-section" aria-labelledby="assessment-title">
              <div className="teacher-page__section-heading"><span>02</span><div><h2 id="assessment-title">Assessment and answer key</h2><p>Teacher answers stay in the teacher-only artifact. No student records are collected.</p></div></div>
              <div className="teacher-page__field-grid">
                <label>Assessment title<input value={assessmentTitle} onChange={(event) => setAssessmentTitle(event.target.value)} maxLength={160} required /></label>
                <label>Directions<input value={assessmentDirections} onChange={(event) => setAssessmentDirections(event.target.value)} required /></label>
                <label>Assessment prompt<input value={assessmentPrompt} onChange={(event) => setAssessmentPrompt(event.target.value)} required /></label>
                <label>Overall success criteria<input value={assessmentSuccessCriteria} onChange={(event) => setAssessmentSuccessCriteria(event.target.value)} required /></label>
              </div>
              <div className="teacher-page__repeat-heading"><h3>Questions and teacher answers</h3><button type="button" onClick={() => setQuestions((current) => [...current, { ...EMPTY_QUESTION }])} disabled={questions.length >= 20 || pageBusy}><Plus size={15} aria-hidden="true" /> Add question</button></div>
              <div className="teacher-page__repeat-list">{questions.map((question, index) => <fieldset className="teacher-page__repeat-card teacher-page__question-card" key={index}><legend>Question {index + 1}</legend>
                <label>Learning objective<select value={question.objective} onChange={(event) => updateQuestion(index, "objective", event.target.value)} required><option value="">Select an objective</option>{textLines(objectives).map((objective, objectiveIndex) => <option key={`${objectiveIndex}-${objective}`} value={objective}>{objective}</option>)}</select></label>
                <label>Question<input value={question.prompt} onChange={(event) => updateQuestion(index, "prompt", event.target.value)} required /></label>
                <label>Question success criteria<input value={question.expectedLearning} onChange={(event) => updateQuestion(index, "expectedLearning", event.target.value)} required /></label>
                <label className="teacher-page__teacher-answer">Teacher answer<textarea value={question.teacherAnswer} onChange={(event) => updateQuestion(index, "teacherAnswer", event.target.value)} rows={2} required /></label>
                <label>Points<input type="number" min="1" max="10" value={question.points} onChange={(event) => updateQuestion(index, "points", event.target.value)} required /></label>
                {questions.length > 1 && <button type="button" className="teacher-page__remove" onClick={() => setQuestions((current) => current.filter((_, position) => position !== index))} aria-label={`Remove question ${index + 1}`}><Trash2 size={15} aria-hidden="true" /></button>}
              </fieldset>)}</div>
              <p className="teacher-page__privacy-note"><ShieldCheck size={16} aria-hidden="true" /> Do not enter student names, grades, records, or personal answers.</p>
            </section>

            <div className="teacher-page__submit-row"><button className="teacher-page__primary" type="submit" disabled={formLocked || !selectedClassId || !workspaceId || !lessonTitle.trim() || !subject.trim()}>{status === "preparing" ? <LoaderCircle className="teacher-page__spin" size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}{status === "preparing" ? "Preparing preview…" : "Build lesson preview"}</button></div>
            </fieldset>
          </form>

          {status === "preview" && preparedJourney && (
            <section className="teacher-page__preview" aria-labelledby="teacher-preview-title">
              <div className="teacher-page__outputs-heading"><div><p className="teacher-page__eyebrow">Unsaved draft</p><h2 id="teacher-preview-title">Review the lesson set</h2><p>This preview is not in Forge yet. Saving creates three separate artifacts in the selected project.</p></div></div>
              {safetyReasons.length > 0 && <div className="teacher-page__message" role="status"><ShieldCheck size={18} aria-hidden="true" /><p>Safety review flags: {safetyReasons.join(", ")}. Review the content before exporting.</p></div>}
              <article className="teacher-page__output teacher-page__output--lesson"><header><div><h3>{preparedJourney.lesson.title}</h3><p>Lesson plan · {preparedJourney.lesson.content.subject} · {preparedJourney.lesson.content.gradeBand}</p></div></header><div className="teacher-page__preview-content"><p>{preparedJourney.lesson.content.durationMinutes} minutes</p><h4>Learning objectives</h4><ul>{preparedJourney.lesson.content.learningObjectives.map((objective, index) => <li key={`${index}-${objective}`}>{objective}</li>)}</ul><h4>Class activities</h4>{preparedJourney.lesson.content.activities.map((activity, index) => <p key={`${index}-${activity.title}`}><strong>{activity.title}</strong> · {activity.minutes} min<br />{activity.instructions}</p>)}<h4>Assessment</h4><p>{preparedJourney.lesson.content.assessment.prompt}</p><p>{preparedJourney.lesson.content.assessment.expectedLearning}</p></div></article>
              <article className="teacher-page__output teacher-page__output--teacher"><header><div><h3>Teacher-only answer key</h3><p>Private teacher preview for the selected authorized class.</p></div></header><div className="teacher-page__preview-content"><p>{preparedJourney.teacherArtifact.content.title} · {preparedJourney.teacherArtifact.content.directions}</p>{preparedJourney.teacherArtifact.content.questions.map((question, index) => <p key={`${index}-${question.prompt}`}><strong>{index + 1}. {question.prompt}</strong><br />Answer: {question.teacherAnswer}<br />Success criteria: {question.expectedLearning}</p>)}</div></article>
              <article className="teacher-page__output teacher-page__output--student"><header><div><h3>Student worksheet</h3><p>Separate preview checked for teacher-answer fields.</p></div></header><div className="teacher-page__preview-content"><p>{preparedJourney.studentArtifact.content.title} · {preparedJourney.studentArtifact.content.directions}</p><ol>{preparedJourney.studentArtifact.content.questions.map((question, index) => <li key={`${index}-${question.prompt}`}>{question.prompt} <span>({question.points} points)</span></li>)}</ol></div></article>
              <div className="teacher-page__submit-row"><button className="teacher-page__primary" type="button" onClick={savePreparedJourney} disabled={pageBusy}>{status === "saving" ? <LoaderCircle className="teacher-page__spin" size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}{status === "saving" ? "Saving all three…" : "Save all three to Forge"}</button><button type="button" className="teacher-page__secondary" onClick={discardPreview} disabled={pageBusy}>Edit lesson brief</button></div>
            </section>
          )}

          {status === "saved" && persistenceConfirmed && <section className="teacher-page__review" aria-labelledby="teacher-saved-title"><h2 id="teacher-saved-title">All three Forge saves confirmed</h2><p>The lesson, teacher-only answer key, and student worksheet are saved in the selected project. Export files when you’re ready.</p><button type="button" className="teacher-page__primary" onClick={() => exportSavedJourney()}><Download size={16} aria-hidden="true" /> Prepare all three exports</button></section>}

          {status === "review" && savedJourney && persistenceConfirmed && (
            <section className="teacher-page__review" aria-labelledby="teacher-review-title">
              <h2 id="teacher-review-title">Teacher safety review</h2>
              <p>Forge confirmed the lesson, answer key, and worksheet saves. Review these flags before the export APIs prepare the outputs:</p>
              <ul>{safetyReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              <label className="teacher-page__review-check"><input type="checkbox" checked={safetyAcknowledged} onChange={(event) => setSafetyAcknowledged(event.target.checked)} /> I reviewed these flags and will verify the material before classroom use.</label>
              <button type="button" className="teacher-page__primary" onClick={completeSafetyReview} disabled={!safetyAcknowledged || pageBusy}><ShieldCheck size={16} aria-hidden="true" /> Review and prepare exports</button>
            </section>
          )}

          {status === "complete" && persistenceConfirmed && visibleExports && (
            <section className="teacher-page__outputs" aria-labelledby="teacher-output-title" aria-live="polite">
              <div className="teacher-page__outputs-heading"><div><p className="teacher-page__eyebrow">Forge saves confirmed</p><h2 id="teacher-output-title">Lesson set ready</h2><p>All three persistence confirmations and export checks passed.</p></div></div>
              <article className="teacher-page__output teacher-page__output--lesson"><header><div><h3>Lesson plan</h3><p>Teacher review required before classroom use.</p></div><button type="button" onClick={() => downloadMarkdown(visibleExports.lesson)}><Download size={15} aria-hidden="true" /> Download</button></header><pre>{visibleExports.lesson.content}</pre></article>
              <article className="teacher-page__output teacher-page__output--teacher"><header><div><h3>Teacher-only answer key</h3><p>Restricted to your verified Teacher account and class.</p></div><button type="button" onClick={() => downloadMarkdown(visibleExports.teacherAnswerKey)}><Download size={15} aria-hidden="true" /> Download</button></header><pre>{visibleExports.teacherAnswerKey.content}</pre></article>
              <article className="teacher-page__output teacher-page__output--student"><header><div><h3>Student worksheet</h3><p>Separate worksheet export contains no teacher-answer fields.</p></div><button type="button" onClick={() => downloadMarkdown(visibleExports.studentWorksheet)}><Download size={15} aria-hidden="true" /> Download</button></header><pre>{visibleExports.studentWorksheet.content}</pre></article>
            </section>
          )}

          {status === "export-error" && savedJourney && <div className="teacher-page__submit-row"><button type="button" className="teacher-page__primary" onClick={() => { setStatus(safetyReasons.length ? "review" : "saved"); setError(""); }}><RotateCw size={16} aria-hidden="true" /> Retry exports</button></div>}
          {status === "partial-error" && <div className="teacher-page__message teacher-page__message--error" role="alert"><AlertCircle size={18} aria-hidden="true" /><p>{error}</p><Link to="/forge">Open Forge and inspect the selected project</Link></div>}
          {error && status !== "partial-error" && <div className="teacher-page__message teacher-page__message--error" role="alert"><AlertCircle size={18} aria-hidden="true" /><p>{error}</p></div>}
          {status === "saved" && persistenceConfirmed && <p className="teacher-page__success" role="status"><Check size={16} aria-hidden="true" /> Forge confirmed the lesson, teacher answer key, and student worksheet.</p>}
          {status === "complete" && persistenceConfirmed && <p className="teacher-page__success" role="status"><Check size={16} aria-hidden="true" /> Forge confirmed the lesson, teacher answer key, and student worksheet.</p>}
        </>
      )}
    </main>
  );
}
