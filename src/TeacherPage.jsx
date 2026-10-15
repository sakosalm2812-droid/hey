import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, Check, Download, GraduationCap, LoaderCircle, Plus, RotateCw, ShieldCheck, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { HEY } from "./core/index.js";
import { getAccountScope } from "./core/accountScope.js";
import { useAuth } from "./AuthContext.jsx";
import { supabaseClient } from "./lib/supabase.js";
import { listRecords } from "./lib/heyRecords.js";
import { hasTeacherAnswerKeyField, teacherExportsAreComplete, teacherJourneyPersistenceMatches } from "./teacherPageContract.js";
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
        setAccess({ status: "ready", message: "Teacher access verified." });
      } catch (loadError) {
        if (!cancelled && accountRef.current === accountId) {
          const denied = /Teacher account|authorized class/i.test(loadError?.message || "");
          setAccess({
            status: denied ? "denied" : "error",
            message: denied ? loadError.message : "Teacher access or your Forge workspaces could not be loaded. Check your account and retry.",
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
    setSavedJourney(null);
    setStatus("complete");
    setError("");
  }

  async function createLessonJourney(event) {
    event.preventDefault();
    if (status === "saving" || status === "exporting" || !workspaceId || !selectedClassId) return;
    setStatus("saving");
    setError("");
    setPersistenceConfirmed(false);
    setSavedJourney(null);
    setExportsByAudience(null);
    setOutputAccountId("");
    setSafetyAcknowledged(false);
    let confirmedJourney = false;
    try {
      const teacher = await readCurrentTeacher(accountId, selectedClassId);
      const currentProjects = await listRecords(teacher.userId, "project");
      if (!currentProjects.some((project) => project.id === workspaceId)) {
        throw new Error("Select an existing project that is still available in your account.");
      }
      if (accountRef.current !== accountId || getAccountScope() !== teacher.accountScope) {
        throw new Error("Your account changed before the lesson could be created.");
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
      const journey = await HEY.teacher.createTeacherLessonWorksheetJourney({ lesson, assessment, context });
      if (accountRef.current !== accountId || getAccountScope() !== accountScope) {
        throw new Error("Your account changed while Forge was saving. The save confirmations could not be applied to the active account.");
      }
      if (!teacherJourneyPersistenceMatches(journey, context)) {
        throw new Error("Forge did not return matching persistence confirmations for the lesson, answer key, and worksheet.");
      }
      confirmedJourney = true;
      setPersistenceConfirmed(true);
      const reasons = [...new Set([
        ...(journey.lesson.metadata.safety.reviewReasons || []),
        ...(journey.teacherArtifact.metadata.safety.reviewReasons || []),
        ...(journey.studentArtifact.metadata.safety.reviewReasons || []),
      ])];
      setSavedJourney(journey);
      setSafetyReasons(reasons);
      if (reasons.length) {
        setStatus("review");
        return;
      }
      setStatus("exporting");
      await prepareExports(journey, context);
    } catch (journeyError) {
      if (accountRef.current === accountId) {
        setStatus("error");
        setError(confirmedJourney
          ? `Forge confirmed all three saves, but the exports could not be prepared: ${journeyError.message || "verification failed"}`
          : `HEY could not confirm all three Forge saves. Some items may have been saved; check Forge before retrying. ${journeyError.message || ""}`.trim());
      }
    }
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
      await prepareExports(savedJourney, {
        accountScope: teacher.accountScope,
        workspaceId,
        classId: selectedClassId,
      }, {
        accountScope: teacher.accountScope,
        workspaceId,
        reviewerId: teacher.userId,
        reviewedAt: new Date().toISOString(),
      });
    } catch (reviewError) {
      if (accountRef.current === accountId) {
        setStatus("error");
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
  const pageBusy = status === "saving" || status === "exporting" || status === "review";

  return (
    <main className="teacher-page" aria-labelledby="teacher-page-title">
      <header className="teacher-page__header">
        <div><p className="teacher-page__eyebrow">Verified teacher workflow</p><h1 id="teacher-page-title">Lesson builder</h1><p>Create a lesson, a teacher-only answer key, and a student worksheet for a class you’re authorized to teach.</p></div>
        <span className="teacher-page__secure"><GraduationCap size={17} aria-hidden="true" /> Teacher access required</span>
      </header>

      {access.status === "checking" && <p className="teacher-page__status" role="status"><LoaderCircle className="teacher-page__spin" size={17} aria-hidden="true" /> {access.message}</p>}
      {(access.status === "denied" || access.status === "error") && <div className="teacher-page__message teacher-page__message--error" role="alert"><AlertCircle size={18} aria-hidden="true" /><p>{access.message}</p>{access.status === "error" && <button type="button" onClick={() => setAccessRetry((current) => current + 1)}><RotateCw size={15} aria-hidden="true" /> Retry</button>}</div>}

      {access.status === "ready" && !classIds.length && <div className="teacher-page__message" role="status"><ShieldCheck size={18} aria-hidden="true" /><p>Your account has no authorized class assignments.</p></div>}
      {access.status === "ready" && !projects.length && <div className="teacher-page__message" role="status"><AlertCircle size={18} aria-hidden="true" /><p>Create a project first. Forge uses an existing project as the lesson workspace.</p><Link to="/projects">Open Projects</Link></div>}

      {access.status === "ready" && classIds.length > 0 && projects.length > 0 && (
        <>
          <form className="teacher-page__form" onSubmit={createLessonJourney}>
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

            <div className="teacher-page__submit-row"><button className="teacher-page__primary" type="submit" disabled={pageBusy || !selectedClassId || !workspaceId || !lessonTitle.trim() || !subject.trim()}>{pageBusy ? <LoaderCircle className="teacher-page__spin" size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}{status === "saving" ? "Saving all three artifacts…" : status === "exporting" ? "Verifying exports…" : "Create and save lesson set"}</button></div>
          </form>

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

          {error && <div className="teacher-page__message teacher-page__message--error" role="alert"><AlertCircle size={18} aria-hidden="true" /><p>{error}</p></div>}
          {status === "complete" && persistenceConfirmed && <p className="teacher-page__success" role="status"><Check size={16} aria-hidden="true" /> Forge confirmed the lesson, teacher answer key, and student worksheet.</p>}
        </>
      )}
    </main>
  );
}
