import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, Download, GraduationCap, LoaderCircle, RotateCw, ShieldCheck } from "lucide-react";

import HEY from "./core/index.js";
import { useAuth } from "./AuthContext.jsx";
import { supabaseClient } from "./lib/supabase.js";
import { listRecords } from "./lib/heyRecords.js";
import { getAccountScope, subscribeAccountScope } from "./core/accountScope.js";
import { hasTeacherAnswerKeyField, resolveTeacherPageAccess, teacherArtifactOperationContextMatches, teacherJourneyPersistenceMatches } from "./teacherExperiencePageContract.js";
import { shouldResetTeacherDraft, teacherPageStateMatchesAccount, teacherOperationCanStart, teacherOperationLockBelongsToAccount, readTeacherJourneyRecoveryHint, writeTeacherJourneyRecoveryHint } from "./teacherPageState.js";
import { buildTeacherAssessmentQuestions, createTeacherQuestionDraft } from "./teacherQuestionDraft.js";
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
  questions: [createTeacherQuestionDraft("question-1", {
    prompt: "Where does 1/4 belong on the number line?",
    expectedLearning: "Learner places 1/4 between 0 and 1/2 and explains why.",
    teacherAnswer: "One quarter is one of four equal parts; mark it one quarter of the way from zero to one.",
    points: "2",
  })],
});

function createEmptyLessonForm() {
  return { ...EMPTY_LESSON, questions: EMPTY_LESSON.questions.map((question) => ({ ...question })) };
}

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

function getSessionStorageSafely() {
  try { return globalThis.sessionStorage; } catch { return null; }
}

export default function TeacherExperiencePage() {
  const { user, loading: authLoading } = useAuth();
  const accountId = user?.id || "";
  const accountRef = useRef(accountId);
  const previousAccountIdRef = useRef(accountId);
  const nextQuestionIdRef = useRef(1);
  useLayoutEffect(() => { accountRef.current = accountId; }, [accountId]);
  const [access, setAccess] = useState({ status: "checking", classIds: [] });
  const [accessAccountId, setAccessAccountId] = useState("");
  const [accessEpoch, setAccessEpoch] = useState(0);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [lessonForm, setLessonForm] = useState(createEmptyLessonForm);
  const [preview, setPreview] = useState(null);
  const [savedJourney, setSavedJourney] = useState(null);
  const [activityHandout, setActivityHandout] = useState(null);
  const [savedActivityHandout, setSavedActivityHandout] = useState(null);
  const [activityHandoutExport, setActivityHandoutExport] = useState(null);
  const [activityHandoutStatus, setActivityHandoutStatus] = useState("idle");
  const [activityHandoutError, setActivityHandoutError] = useState("");
  const [activityHandoutReviewAcknowledged, setActivityHandoutReviewAcknowledged] = useState(false);
  const [recoveryHint, setRecoveryHint] = useState(null);
  const [exports, setExports] = useState(null);
  const [differentiatedHints, setDifferentiatedHints] = useState([]);
  const [differentiatedExtensionPrompt, setDifferentiatedExtensionPrompt] = useState("");
  const [differentiatedReviewAcknowledged, setDifferentiatedReviewAcknowledged] = useState(false);
  const [differentiatedExport, setDifferentiatedExport] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);
  const busyRef = useRef(null);
  const draftRevisionRef = useRef(0);
  const activeTeacherContextRef = useRef(null);
  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedProjectId) || null, [projects, selectedProjectId]);

  useLayoutEffect(() => {
    activeTeacherContextRef.current = {
      userId: accountId,
      accountScope: `account:${accountId}`,
      workspaceId: selectedProjectId,
      classId: selectedClassId,
    };
  }, [accountId, selectedProjectId, selectedClassId]);

  function teacherContextIsCurrent(expected) {
    return teacherArtifactOperationContextMatches(expected, activeTeacherContextRef.current);
  }

  const resetTransientJourney = useCallback(() => {
    setPreview(null);
    setSavedJourney(null);
    setActivityHandout(null);
    setSavedActivityHandout(null);
    setActivityHandoutExport(null);
    setActivityHandoutStatus("idle");
    setActivityHandoutError("");
    setActivityHandoutReviewAcknowledged(false);
    setExports(null);
    setDifferentiatedHints([]);
    setDifferentiatedExtensionPrompt("");
    setDifferentiatedReviewAcknowledged(false);
    setDifferentiatedExport(null);
    setSafetyAcknowledged(false);
    setStatus("idle");
    setError("");
  }, []);

  useEffect(() => subscribeAccountScope((_previousScope, nextScope) => {
    const nextAccountId = nextScope.startsWith("account:") ? nextScope.slice("account:".length) : "";
    previousAccountIdRef.current = nextAccountId;
    accountRef.current = nextAccountId;
    activeTeacherContextRef.current = { userId: nextAccountId, accountScope: nextScope, workspaceId: "", classId: "" };
    draftRevisionRef.current += 1;
    resetTransientJourney();
    setRecoveryHint(null);
    setLessonForm(createEmptyLessonForm());
    setProjects([]);
    setSelectedProjectId("");
    setSelectedClassId("");
    setAccess({ status: "checking", classIds: [] });
    setAccessAccountId("");
    setAccessEpoch((current) => current + 1);
  }), [resetTransientJourney]);

  useEffect(() => {
    let cancelled = false;
    const accountChanged = shouldResetTeacherDraft(previousAccountIdRef.current, accountId);
    previousAccountIdRef.current = accountId;
    setAccessAccountId("");
    if (accountChanged) {
      draftRevisionRef.current += 1;
      setLessonForm(createEmptyLessonForm());
      resetTransientJourney();
      setProjects([]);
      setSelectedProjectId("");
      setSelectedClassId("");
    }
    async function loadTeacherAccess() {
      if (authLoading) {
        setAccess({ status: "checking", classIds: [] });
        return;
      }
      if (!accountId) {
        setAccess({ status: "identity-missing", classIds: [] });
        setAccessAccountId(accountId);
        return;
      }
      const expectedAccountScope = `account:${accountId}`;
      setAccess({ status: "checking", classIds: [] });
      setProjects([]);
      try {
        const { data, error: authError } = await supabaseClient.auth.getUser();
        if (cancelled) return;
        if (authError || data?.user?.id !== accountId || getAccountScope() !== expectedAccountScope) {
          setAccess({ status: "service-unavailable", classIds: [] });
          setAccessAccountId(accountId);
          return;
        }
        const verifiedAccess = resolveTeacherPageAccess(data.user, expectedAccountScope);
        setAccess(verifiedAccess);
        setAccessAccountId(accountId);
        if (verifiedAccess.status !== "ready") return;
        const records = await listRecords(accountId, "project");
        if (cancelled || accountRef.current !== accountId || getAccountScope() !== expectedAccountScope) return;
        const eligibleProjects = (records || []).filter((record) => typeof record?.id === "string" && record.id.trim())
          .map((record) => ({ id: record.id, name: record.title || "Untitled project" }));
        setProjects(eligibleProjects);
        setSelectedProjectId((current) => eligibleProjects.some((project) => project.id === current)
          ? current : eligibleProjects[0]?.id || "");
        setSelectedClassId((current) => verifiedAccess.classIds.includes(current) ? current : verifiedAccess.classIds[0] || "");
      } catch {
        if (!cancelled && accountRef.current === accountId) {
          setAccess({ status: "service-unavailable", classIds: [] });
          setAccessAccountId(accountId);
        }
      }
    }
    loadTeacherAccess();
    return () => { cancelled = true; };
  }, [authLoading, accountId, accessEpoch, resetTransientJourney]);

  useEffect(() => {
    if (authLoading || !accountId || accessAccountId !== accountId || access.status !== "ready") {
      setRecoveryHint(null);
      return;
    }
    const hint = readTeacherJourneyRecoveryHint(getSessionStorageSafely(), accountId);
    if (!hint || !access.classIds.includes(hint.classId)) {
      setRecoveryHint(null);
      return;
    }
    setRecoveryHint(hint);
    setSelectedClassId(hint.classId);
    if (projects.some((project) => project.id === hint.workspaceId)) setSelectedProjectId(hint.workspaceId);
  }, [authLoading, accountId, accessAccountId, access.status, access.classIds, projects]);

  function updateField(field, value) {
    draftRevisionRef.current += 1;
    setLessonForm((current) => ({ ...current, [field]: value }));
    resetTransientJourney();
  }

  function updateQuestion(questionId, field, value) {
    draftRevisionRef.current += 1;
    setLessonForm((current) => ({
      ...current,
      questions: current.questions.map((question) => question.id === questionId ? { ...question, [field]: value } : question),
    }));
    resetTransientJourney();
  }

  function addQuestion() {
    if (lessonForm.questions.length >= 20) return;
    draftRevisionRef.current += 1;
    const id = globalThis.crypto?.randomUUID?.() || `question-${nextQuestionIdRef.current++}`;
    setLessonForm((current) => ({ ...current, questions: [...current.questions, createTeacherQuestionDraft(id)] }));
    resetTransientJourney();
  }

  function removeQuestion(questionId) {
    if (lessonForm.questions.length <= 1) return;
    draftRevisionRef.current += 1;
    setLessonForm((current) => ({ ...current, questions: current.questions.filter((question) => question.id !== questionId) }));
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
    const learningObjectives = lessonForm.objectives.split("\n").map((item) => item.trim()).filter(Boolean);
    const assessmentQuestions = buildTeacherAssessmentQuestions(lessonForm.questions, learningObjectives[0]);
    const lessonRequest = {
      title: lessonForm.title.trim(),
      subject: lessonForm.subject.trim(),
      gradeBand: lessonForm.gradeBand,
      durationMinutes: Number(lessonForm.durationMinutes),
      learningObjectives,
      curriculumReferences: [],
      resources: [],
      activities: [{ title: lessonForm.activityTitle.trim(), instructions: lessonForm.activityInstructions.trim(), minutes: Number(lessonForm.activityMinutes) }],
      assessment: { prompt: assessmentQuestions[0].prompt, expectedLearning: assessmentQuestions[0].expectedLearning },
      accountScope,
      workspaceId,
      currentAccountScope: accountScope,
      currentWorkspaceId: workspaceId,
      createdAt: new Date().toISOString(),
    };
    const assessmentRequest = {
      title: `${lessonForm.title.trim()} — exit check`,
      directions: "Show your reasoning for each answer.",
      questions: assessmentQuestions,
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
    const operationAccountId = accountId;
    const operationAccountScope = `account:${operationAccountId}`;
    if (!teacherOperationCanStart(busyRef.current, operationAccountId)) return;
    busyRef.current = operationAccountId;
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
      if (accountRef.current !== operationAccountId || getAccountScope() !== operationAccountScope
        || !hasActiveContext({ ...requests.expected, classId: requests.context.classId }, access.classIds)) {
        throw new Error("Teacher access changed while the preview was being prepared. Review your class and try again.");
      }
      setPreview({ ...requests, lesson, assessment, worksheet, journeyId });
      setStatus("preview-ready");
    } catch (prepareError) {
      if (accountRef.current === operationAccountId && getAccountScope() === operationAccountScope
        && draftRevisionRef.current === draftRevision) {
        setError(prepareError?.message || "The lesson preview could not be prepared.");
        setStatus("error");
      }
    } finally {
      if (teacherOperationLockBelongsToAccount(busyRef.current, operationAccountId)) busyRef.current = null;
    }
  }

  async function saveJourney() {
    if (!preview || !teacherOperationCanStart(busyRef.current, accountId)) return;
    const operationAccountId = accountId;
    const operationAccountScope = preview.expected.accountScope;
    busyRef.current = operationAccountId;
    setStatus("saving");
    setError("");
    setExports(null);
    try {
      const freshAccess = await readCurrentTeacherAccess(preview.expected.userId);
      if (freshAccess.userId !== preview.expected.userId
        || !hasActiveContext(preview.expected, freshAccess.classIds)
        || !teacherContextIsCurrent(preview.expected)) {
        throw new Error("Teacher access or the selected class changed. Recheck access and prepare a fresh preview.");
      }
      const hint = {
        userId: preview.expected.userId,
        accountScope: preview.expected.accountScope,
        workspaceId: preview.expected.workspaceId,
        classId: preview.expected.classId,
        journeyId: preview.journeyId,
      };
      if (writeTeacherJourneyRecoveryHint(getSessionStorageSafely(), hint)) setRecoveryHint(hint);
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
      if (accountRef.current !== operationAccountId || getAccountScope() !== operationAccountScope
        || !teacherContextIsCurrent(preview.expected)) {
        throw new Error("Your account changed before the saved lesson could be shown.");
      }
      setSavedJourney(result);
      setStatus("saved");
    } catch (saveError) {
      if (accountRef.current === operationAccountId && getAccountScope() === operationAccountScope
        && teacherContextIsCurrent(preview.expected)) {
        setError(saveError?.recovery?.journeyId === preview.journeyId
          ? "Forge could not confirm this journey. Retry the same save to safely verify or complete it; the journey ID is unchanged."
          : saveError?.message || "Forge could not confirm the lesson set.");
        setStatus("save-error");
      }
    } finally {
      if (teacherOperationLockBelongsToAccount(busyRef.current, operationAccountId)) busyRef.current = null;
    }
  }

  async function prepareActivityHandout(activityIndex) {
    if (!savedJourney || !preview || !teacherOperationCanStart(busyRef.current, accountId)) return;
    const operationAccountId = preview.expected.userId;
    const operationAccountScope = preview.expected.accountScope;
    busyRef.current = operationAccountId;
    setActivityHandoutStatus("preparing");
    setActivityHandoutError("");
    setActivityHandout(null);
    setSavedActivityHandout(null);
    setActivityHandoutExport(null);
    setActivityHandoutReviewAcknowledged(false);
    try {
      const freshAccess = await readCurrentTeacherAccess(operationAccountId);
      if (!teacherJourneyPersistenceMatches(savedJourney, { ...preview.expected, journeyId: preview.journeyId })
        || freshAccess.userId !== operationAccountId
        || !hasActiveContext(preview.expected, freshAccess.classIds)
        || !teacherContextIsCurrent(preview.expected)) {
        throw new Error("Recheck your saved lesson and assigned class before preparing an activity handout.");
      }
      const context = {
        accountScope: preview.expected.accountScope,
        workspaceId: preview.expected.workspaceId,
        classId: preview.expected.classId,
        currentAccountScope: preview.expected.accountScope,
        currentWorkspaceId: preview.expected.workspaceId,
        currentClassId: preview.expected.classId,
      };
      const artifact = await HEY.teacher.buildActivityHandoutArtifact(savedJourney.lesson, activityIndex, context);
      if (hasTeacherAnswerKeyField(artifact.content)) throw new Error("The activity handout failed its answer-key separation check.");
      const confirmedAccess = await readCurrentTeacherAccess(operationAccountId);
      if (confirmedAccess.userId !== operationAccountId || !hasActiveContext(preview.expected, confirmedAccess.classIds)
        || accountRef.current !== operationAccountId || getAccountScope() !== operationAccountScope
        || !teacherContextIsCurrent(preview.expected)) {
        throw new Error("Teacher access changed while preparing the activity handout. Recheck your class and try again.");
      }
      setActivityHandout({ artifact, activityIndex, expected: preview.expected });
      setActivityHandoutStatus("preview-ready");
    } catch (handoutError) {
      if (accountRef.current === operationAccountId && getAccountScope() === operationAccountScope
        && teacherContextIsCurrent(preview.expected)) {
        setActivityHandoutError(handoutError?.message || "The activity handout preview could not be prepared.");
        setActivityHandoutStatus("error");
      }
    } finally {
      if (teacherOperationLockBelongsToAccount(busyRef.current, operationAccountId)) busyRef.current = null;
    }
  }

  async function saveActivityHandout() {
    if (!activityHandout || !teacherOperationCanStart(busyRef.current, accountId)) return;
    const { artifact, expected } = activityHandout;
    const operationAccountId = expected.userId;
    const operationAccountScope = expected.accountScope;
    busyRef.current = operationAccountId;
    setActivityHandoutStatus("saving");
    setActivityHandoutError("");
    setActivityHandoutExport(null);
    setActivityHandoutReviewAcknowledged(false);
    try {
      const context = {
        accountScope: expected.accountScope,
        workspaceId: expected.workspaceId,
        classId: expected.classId,
        currentAccountScope: expected.accountScope,
        currentWorkspaceId: expected.workspaceId,
        currentClassId: expected.classId,
      };
      const freshAccess = await readCurrentTeacherAccess(operationAccountId);
      if (freshAccess.userId !== operationAccountId || !hasActiveContext(expected, freshAccess.classIds)
        || !teacherJourneyPersistenceMatches(savedJourney, { ...expected, journeyId: preview.journeyId })
        || !teacherContextIsCurrent(expected)) {
        throw new Error("Teacher access or the saved lesson changed. Recheck access and prepare a fresh handout.");
      }
      const verification = await HEY.teacher.verifyActivityHandoutArtifact(artifact, context);
      if (!verification.valid || hasTeacherAnswerKeyField(artifact.content) || !teacherContextIsCurrent(expected)) {
        throw new Error("The activity handout failed its account, class, source, or answer-key verification.");
      }
      const persisted = await HEY.teacher.saveActivityHandoutArtifact(artifact, context);
      if (!persisted?.id || persisted.type !== "document" || persisted.status !== "draft"
        || persisted.createdBy !== operationAccountId
        || persisted.projectId !== expected.workspaceId
        || persisted.metadata?.artifactContract !== "hey.teacher.activity_handout.v1"
        || persisted.metadata?.accountScope !== expected.accountScope
        || persisted.metadata?.workspaceId !== expected.workspaceId
        || persisted.metadata?.classId !== expected.classId
        || persisted.metadata?.audience !== "student"
        || persisted.metadata?.safety?.teacherReviewRequiredBeforeUse !== true
        || persisted.content?.type !== "teacher_activity_handout"
        || hasTeacherAnswerKeyField(persisted.content)) {
        throw new Error("Forge did not return a verified, answer-free activity handout for this class.");
      }
      const confirmedAccess = await readCurrentTeacherAccess(operationAccountId);
      if (confirmedAccess.userId !== operationAccountId || !hasActiveContext(expected, confirmedAccess.classIds)
        || accountRef.current !== operationAccountId || getAccountScope() !== operationAccountScope
        || !teacherContextIsCurrent(expected)) {
        throw new Error("Teacher access changed before the saved handout could be shown. Reopen Forge to verify it.");
      }
      setSavedActivityHandout(persisted);
      setActivityHandoutStatus("saved");
    } catch (handoutError) {
      if (accountRef.current === operationAccountId && getAccountScope() === operationAccountScope
        && teacherContextIsCurrent(expected)) {
        setActivityHandoutError(handoutError?.message || "Forge could not confirm the activity handout save. Check Forge before retrying.");
        setActivityHandoutStatus("error");
      }
    } finally {
      if (teacherOperationLockBelongsToAccount(busyRef.current, operationAccountId)) busyRef.current = null;
    }
  }

  async function exportActivityHandout() {
    if (!activityHandout || !savedActivityHandout || !activityHandoutReviewAcknowledged
      || !teacherOperationCanStart(busyRef.current, accountId)) return;
    const { artifact, expected } = activityHandout;
    const operationAccountId = expected.userId;
    const operationAccountScope = expected.accountScope;
    busyRef.current = operationAccountId;
    setActivityHandoutStatus("exporting");
    setActivityHandoutError("");
    setActivityHandoutExport(null);
    try {
      const freshAccess = await readCurrentTeacherAccess(operationAccountId);
      if (freshAccess.userId !== operationAccountId || !hasActiveContext(expected, freshAccess.classIds)
        || !teacherContextIsCurrent(expected)
        || !teacherJourneyPersistenceMatches(savedJourney, { ...expected, journeyId: preview.journeyId })
        || savedActivityHandout.createdBy !== operationAccountId
        || savedActivityHandout.projectId !== expected.workspaceId
        || savedActivityHandout.metadata?.accountScope !== expected.accountScope
        || savedActivityHandout.metadata?.workspaceId !== expected.workspaceId
        || savedActivityHandout.metadata?.classId !== expected.classId
        || savedActivityHandout.metadata?.artifactContract !== "hey.teacher.activity_handout.v1"
        || JSON.stringify(savedActivityHandout.content) !== JSON.stringify(artifact.content)) {
        throw new Error("Teacher access, saved lesson, or handout changed. Recheck Forge before exporting.");
      }
      if (hasTeacherAnswerKeyField(artifact.content)) throw new Error("Export stopped because the student handout contains a teacher-only field.");
      const safetyReview = {
        accountScope: expected.accountScope,
        workspaceId: expected.workspaceId,
        reviewerId: operationAccountId,
        reviewedAt: new Date().toISOString(),
      };
      const exported = await HEY.teacher.exportActivityHandoutMarkdown(artifact, {
        accountScope: expected.accountScope,
        workspaceId: expected.workspaceId,
        classId: expected.classId,
        safetyReview,
      });
      if (exported?.filename !== "student-activity-handout.md" || exported.mimeType !== "text/markdown"
        || typeof exported.content !== "string" || !exported.content.trim()) {
        throw new Error("The activity handout export failed its format check.");
      }
      const confirmedAccess = await readCurrentTeacherAccess(operationAccountId);
      if (confirmedAccess.userId !== operationAccountId || !hasActiveContext(expected, confirmedAccess.classIds)
        || accountRef.current !== operationAccountId || getAccountScope() !== operationAccountScope
        || !teacherContextIsCurrent(expected)) {
        throw new Error("Teacher access changed during export preparation. Check your class and try again.");
      }
      setActivityHandoutExport(exported);
      setActivityHandoutStatus("exported");
    } catch (exportError) {
      if (accountRef.current === operationAccountId && getAccountScope() === operationAccountScope
        && teacherContextIsCurrent(expected)) {
        setActivityHandoutError(exportError?.message || "Teacher access could not be verified for handout export.");
        setActivityHandoutStatus("error");
      }
    } finally {
      if (teacherOperationLockBelongsToAccount(busyRef.current, operationAccountId)) busyRef.current = null;
    }
  }

  async function recoverSavedJourney() {
    if (!recoveryHint || !teacherOperationCanStart(busyRef.current, accountId)) return;
    const operationAccountId = accountId;
    const operationAccountScope = recoveryHint.accountScope;
    const expected = {
      userId: recoveryHint.userId,
      accountScope: recoveryHint.accountScope,
      workspaceId: recoveryHint.workspaceId,
      classId: recoveryHint.classId,
    };
    busyRef.current = operationAccountId;
    setStatus("recovering");
    setError("");
    try {
      const freshAccess = await readCurrentTeacherAccess(operationAccountId);
      Object.assign(expected, { journeyId: recoveryHint.journeyId });
      if (freshAccess.userId !== recoveryHint.userId || expected.accountScope !== operationAccountScope
        || !hasActiveContext(expected, freshAccess.classIds)) {
        throw new Error("This saved journey is outside your current Teacher account or class access.");
      }
      const context = {
        accountScope: expected.accountScope,
        workspaceId: expected.workspaceId,
        classId: expected.classId,
        currentAccountScope: expected.accountScope,
        currentWorkspaceId: expected.workspaceId,
        currentClassId: expected.classId,
      };
      const result = await HEY.teacher.getLessonWorksheetJourney({ journeyId: expected.journeyId, context });
      if (!teacherJourneyPersistenceMatches(result, expected)) {
        throw new Error("Forge did not return the complete saved lesson set for this account, project, and class.");
      }
      if (hasTeacherAnswerKeyField(result.studentArtifact.content)) {
        throw new Error("Recovery stopped because the saved student worksheet contains a teacher-only field.");
      }
      const confirmedAccess = await readCurrentTeacherAccess(operationAccountId);
      if (confirmedAccess.status !== "ready" || !hasActiveContext(expected, confirmedAccess.classIds)
        || accountRef.current !== operationAccountId || getAccountScope() !== operationAccountScope
        || !teacherContextIsCurrent(expected)) {
        throw new Error("Your account or class access changed while Forge reopened this journey.");
      }
      const recoveryPreview = {
        journeyId: expected.journeyId,
        expected,
        lesson: result.lesson,
        assessment: result.teacherArtifact,
        worksheet: result.studentArtifact,
      };
      setPreview(recoveryPreview);
      setSavedJourney(result);
      setSafetyAcknowledged(false);
      setExports(null);
      setStatus("saved");
    } catch (recoveryError) {
      if (accountRef.current === operationAccountId && getAccountScope() === operationAccountScope
        && teacherContextIsCurrent(expected)) {
        setError(recoveryError?.message || "Forge could not verify the saved Teacher journey.");
        setStatus("recovery-error");
      }
    } finally {
      if (teacherOperationLockBelongsToAccount(busyRef.current, operationAccountId)) busyRef.current = null;
    }
  }

  async function prepareExports() {
    if (!savedJourney || !preview || !teacherOperationCanStart(busyRef.current, accountId)) return;
    const operationAccountId = accountId;
    const operationAccountScope = preview.expected.accountScope;
    busyRef.current = operationAccountId;
    setStatus("exporting");
    setError("");
    try {
      const freshAccess = await readCurrentTeacherAccess(preview.expected.userId);
      if (freshAccess.userId !== preview.expected.userId
        || !hasActiveContext(preview.expected, freshAccess.classIds)
        || !teacherContextIsCurrent(preview.expected)) {
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
      if (confirmedAccess.status !== "ready" || !hasActiveContext(preview.expected, confirmedAccess.classIds)
        || !teacherContextIsCurrent(preview.expected)) throw new Error("Teacher access changed during export preparation.");
      if (accountRef.current !== operationAccountId || getAccountScope() !== operationAccountScope) throw new Error("Your account changed during export preparation.");
      setExports({ lesson, answerKey, worksheet });
      setStatus("complete");
    } catch (exportError) {
      if (accountRef.current === operationAccountId && getAccountScope() === operationAccountScope
        && teacherContextIsCurrent(preview.expected)) {
        setError(exportError?.message || "Teacher access could not be verified for export.");
        setStatus("export-error");
      }
    } finally {
      if (teacherOperationLockBelongsToAccount(busyRef.current, operationAccountId)) busyRef.current = null;
    }
  }

  async function prepareDifferentiatedExports() {
    if (!savedJourney || !preview || !differentiatedReviewAcknowledged
      || !teacherOperationCanStart(busyRef.current, accountId)) return;
    const operationAccountId = accountId;
    const operationAccountScope = preview.expected.accountScope;
    busyRef.current = operationAccountId;
    setStatus("differentiating");
    setError("");
    setDifferentiatedExport(null);
    try {
      const freshAccess = await readCurrentTeacherAccess(preview.expected.userId);
      if (freshAccess.userId !== preview.expected.userId || !hasActiveContext(preview.expected, freshAccess.classIds)
        || !teacherContextIsCurrent(preview.expected)) {
        throw new Error("Teacher access changed. Sign in again with the assigned class before exporting.");
      }
      if (!teacherJourneyPersistenceMatches(savedJourney, { ...preview.expected, journeyId: preview.journeyId })) {
        throw new Error("The saved worksheet no longer matches the selected Teacher account, class, and project.");
      }
      const worksheet = savedJourney.studentArtifact;
      if (hasTeacherAnswerKeyField(worksheet.content)) {
        throw new Error("Export stopped because the saved student worksheet contains a teacher-only field.");
      }
      const review = {
        accountScope: preview.expected.accountScope,
        workspaceId: preview.expected.workspaceId,
        classId: preview.expected.classId,
        reviewerId: preview.expected.userId,
        reviewedAt: new Date().toISOString(),
      };
      const safetyReview = worksheet.metadata?.safety?.reviewRequired === true ? {
        accountScope: review.accountScope,
        workspaceId: review.workspaceId,
        reviewerId: review.reviewerId,
        reviewedAt: review.reviewedAt,
      } : undefined;
      const exported = await HEY.teacher.exportDifferentiatedWorksheetMarkdown(worksheet, {
        accountScope: review.accountScope,
        workspaceId: review.workspaceId,
        classId: review.classId,
        supportHints: differentiatedHints,
        extensionPrompt: differentiatedExtensionPrompt,
        teacherReview: review,
        safetyReview,
      });
      if (hasTeacherAnswerKeyField(worksheet.content)) throw new Error("Student worksheet answer-key check failed.");
      const confirmedAccess = await readCurrentTeacherAccess(preview.expected.userId);
      if (confirmedAccess.status !== "ready" || !hasActiveContext(preview.expected, confirmedAccess.classIds)) {
        throw new Error("Teacher access changed during differentiated export preparation.");
      }
      if (!teacherContextIsCurrent(preview.expected)) throw new Error("The selected class or project changed during export preparation.");
      if (accountRef.current !== operationAccountId || getAccountScope() !== operationAccountScope) {
        throw new Error("Your account changed during differentiated export preparation.");
      }
      setDifferentiatedExport(exported);
      setStatus("differentiated");
    } catch (exportError) {
      if (accountRef.current === operationAccountId && getAccountScope() === operationAccountScope
        && teacherContextIsCurrent(preview.expected)) {
        setError(exportError?.message || "Differentiated worksheets could not be prepared.");
        setStatus("differentiation-error");
      }
    } finally {
      if (teacherOperationLockBelongsToAccount(busyRef.current, operationAccountId)) busyRef.current = null;
    }
  }

  const accessIsCurrent = !authLoading && Boolean(accountId) && teacherPageStateMatchesAccount(accessAccountId, accountId);
  const currentAccess = accessIsCurrent
    ? access
    : authLoading || accountId ? { status: "checking", classIds: [] } : { status: "identity-missing", classIds: [] };
  const accountIsCurrent = accessIsCurrent && currentAccess.status === "ready";
  const busy = ["preparing", "saving", "recovering", "exporting", "differentiating"].includes(status)
    || ["preparing", "saving", "exporting"].includes(activityHandoutStatus);

  return (
    <main className="teacher-experience" aria-labelledby="teacher-experience-title">
      <header className="teacher-experience__header">
        <div><p className="teacher-experience__eyebrow">Verified Teacher workspace</p><h1 id="teacher-experience-title">Lesson builder</h1>
          <p>Build an editable lesson, a private answer key, and a separate student worksheet for an assigned class.</p></div>
        <span className="teacher-experience__secure"><GraduationCap size={17} aria-hidden="true" /> Teacher access required</span>
      </header>

      {currentAccess.status === "checking" ? <p className="teacher-experience__notice" role="status"><LoaderCircle className="teacher-experience__spin" size={17} aria-hidden="true" /> Checking your signed-in Teacher access…</p> : null}
      {currentAccess.status === "identity-missing" || currentAccess.status === "role-denied" || currentAccess.status === "scope-mismatch" ? (
        <div className="teacher-experience__notice teacher-experience__notice--error" role="alert"><AlertCircle size={18} aria-hidden="true" /><p>This workspace is available only to a Teacher account with a verified school account and assigned class.</p></div>
      ) : null}
      {currentAccess.status === "class-unassigned" ? <div className="teacher-experience__notice" role="status"><ShieldCheck size={18} aria-hidden="true" /><p>Your account has no verified class assignments. A school administrator must provision Teacher access.</p></div> : null}
      {currentAccess.status === "service-unavailable" ? <div className="teacher-experience__notice teacher-experience__notice--error" role="alert"><AlertCircle size={18} aria-hidden="true" /><p>HEY could not verify your current account with Supabase. No lesson data was loaded or saved.</p></div> : null}
      {currentAccess.status === "ready" && !projects.length ? <div className="teacher-experience__notice" role="status"><AlertCircle size={18} aria-hidden="true" /><p>Create a project first. Forge saves the lesson set to a project you can access.</p></div> : null}

      {currentAccess.status === "ready" && recoveryHint && !preview ? <section className="teacher-experience__section" aria-labelledby="teacher-recovery-heading">
        <div className="teacher-experience__section-heading"><span><RotateCw size={17} aria-hidden="true" /></span><div><h2 id="teacher-recovery-heading">Check for an interrupted Forge save</h2><p>Only the journey ID and class/project scope are kept in this tab. Forge reloads content only if all three saved artifacts pass your current access and content checks.</p></div></div>
        <button type="button" className="teacher-experience__primary" onClick={recoverSavedJourney} disabled={busy}>{status === "recovering" ? <LoaderCircle className="teacher-experience__spin" size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}{status === "recovering" ? "Checking Forge…" : "Check Forge for the saved set"}</button>
      </section> : null}

      {currentAccess.status === "ready" && projects.length > 0 ? (
        <>
          <p className="teacher-experience__privacy" role="note">No student names, grades, records, or personal answers are collected here. Use fictional examples. Teacher answers stay in the private answer key.</p>
          <form className="teacher-experience__form" onSubmit={preparePreview}>
            <section className="teacher-experience__section" aria-labelledby="teacher-scope-heading">
              <div className="teacher-experience__section-heading"><span>01</span><div><h2 id="teacher-scope-heading">Verified class and project</h2><p>These choices are limited to your signed-in account’s assignments.</p></div></div>
              <div className="teacher-experience__grid">
                <label>Class<select value={selectedClassId} onChange={(event) => { draftRevisionRef.current += 1; activeTeacherContextRef.current = { ...activeTeacherContextRef.current, classId: event.target.value }; setSelectedClassId(event.target.value); resetTransientJourney(); }} required>
                  {currentAccess.classIds.map((classId) => <option key={classId} value={classId}>{classId}</option>)}
                </select></label>
                <label>Forge project<select value={selectedProjectId} onChange={(event) => { draftRevisionRef.current += 1; activeTeacherContextRef.current = { ...activeTeacherContextRef.current, workspaceId: event.target.value }; setSelectedProjectId(event.target.value); resetTransientJourney(); }} required>
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
              <div className="teacher-experience__section-heading"><span>03</span><div><h2 id="teacher-assessment-heading">Assessment question bank</h2><p>Teacher answers are stored only in the Teacher-only artifact. Add 1–20 authored questions.</p></div></div>
              <div className="teacher-experience__question-list" aria-label="Assessment questions">
                {lessonForm.questions.map((question, index) => <fieldset className="teacher-experience__question" key={question.id}>
                  <legend>Question {index + 1}</legend>
                  <div className="teacher-experience__grid">
                    <label className="teacher-experience__wide">Question prompt<input value={question.prompt} onChange={(event) => updateQuestion(question.id, "prompt", event.target.value)} required /></label>
                    <label className="teacher-experience__wide">Expected learning<textarea rows={2} value={question.expectedLearning} onChange={(event) => updateQuestion(question.id, "expectedLearning", event.target.value)} required /></label>
                    <label className="teacher-experience__wide teacher-experience__answer">Teacher answer<textarea rows={2} value={question.teacherAnswer} onChange={(event) => updateQuestion(question.id, "teacherAnswer", event.target.value)} required /></label>
                    <label>Points<input type="number" min="1" max="10" value={question.points} onChange={(event) => updateQuestion(question.id, "points", event.target.value)} required /></label>
                    <button className="teacher-experience__secondary teacher-experience__remove-question" type="button" onClick={() => removeQuestion(question.id)} disabled={lessonForm.questions.length <= 1}>Remove question</button>
                  </div>
                </fieldset>)}
              </div>
              <div className="teacher-experience__question-controls"><span>{lessonForm.questions.length} of 20 questions</span><button className="teacher-experience__secondary" type="button" onClick={addQuestion} disabled={lessonForm.questions.length >= 20}>Add question</button></div>
              <p className="teacher-experience__privacy"><ShieldCheck size={16} aria-hidden="true" /> Student records and personal answers are not part of this workflow.</p>
            </section>

            <button className="teacher-experience__primary" type="submit" disabled={busy || !selectedClassId || !selectedProjectId}>
              {status === "preparing" ? <LoaderCircle className="teacher-experience__spin" size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
              {status === "preparing" ? "Preparing local preview…" : "Build lesson preview"}
            </button>
          </form>

          {preview ? <section className="teacher-experience__preview" aria-labelledby="teacher-preview-heading">
            <header><div><p className="teacher-experience__eyebrow">{savedJourney ? "Saved in Forge" : "Unsaved preview"}</p><h2 id="teacher-preview-heading">Review the lesson set</h2><p>{savedJourney ? "Reopened from the persisted Forge artifacts. Review the content before preparing exports." : "Nothing was written to Forge while preparing this preview."}</p></div></header>
            {[preview.lesson, preview.assessment].some((artifact) => artifact.metadata?.safety?.reviewRequired)
              ? <div className="teacher-experience__notice" role="status"><ShieldCheck size={18} aria-hidden="true" /><p>Safety review flags: {[...new Set([...(preview.lesson.metadata.safety.reviewReasons || []), ...(preview.assessment.metadata.safety.reviewReasons || [])])].join(", ")}. Review the content before classroom use.</p></div> : null}
            <div className="teacher-experience__outputs">
              <article><h3>{preview.lesson.title}</h3><p>{preview.lesson.content.subject} · {preview.lesson.content.gradeBand} · {preview.lesson.content.durationMinutes} minutes</p><h4>Objectives</h4><ul>{preview.lesson.content.learningObjectives.map((objective) => <li key={objective}>{objective}</li>)}</ul><h4>Activity</h4><p>{preview.lesson.content.activities[0]?.instructions}</p></article>
              <article className="teacher-experience__private"><h3>Teacher-only answer key</h3><ol>{preview.assessment.content.questions.map((question, index) => <li key={`${index}-${question.prompt}`}><strong>{question.prompt}</strong><p>{question.expectedLearning}</p><p><strong>Answer:</strong> {question.teacherAnswer} ({question.points} points)</p></li>)}</ol></article>
              <article><h3>Student worksheet</h3><p>Checked to exclude teacher-answer fields.</p><ol>{preview.worksheet.content.questions.map((question, index) => <li key={`${index}-${question.prompt}`}>{question.prompt} ({question.points} points)</li>)}</ol></article>
            </div>
            <div className="teacher-experience__actions">
              <button className="teacher-experience__primary" type="button" onClick={saveJourney} disabled={busy || Boolean(savedJourney)}>{status === "saving" ? <LoaderCircle className="teacher-experience__spin" size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}{savedJourney ? "Forge confirmed all three" : status === "saving" ? "Saving all three…" : "Save all three to Forge"}</button>
              <button className="teacher-experience__secondary" type="button" onClick={() => { resetTransientJourney(); setStatus("idle"); }}>Edit lesson</button>
            </div>
            {savedJourney ? <div className="teacher-experience__saved" role="status"><Check size={17} aria-hidden="true" /><div><strong>Forge confirmed the complete lesson set.</strong><span>Lesson, private answer key, and student worksheet readback matched the selected project, class, account, and creator.</span></div></div> : null}
            {savedJourney ? <section className="teacher-experience__handout" aria-labelledby="teacher-handout-heading">
              <h3 id="teacher-handout-heading">Separate student activity handout</h3>
              <p>Prepare one activity from this verified lesson as a separate Forge draft. Teacher review is required before classroom use; this does not distribute it to students.</p>
              {!activityHandout && !savedActivityHandout ? <div className="teacher-experience__actions">
                {savedJourney.lesson.content.activities.map((activity, index) => <button key={`${index}-${activity.title}`} type="button" className="teacher-experience__secondary" onClick={() => prepareActivityHandout(index)} disabled={busy}>Prepare “{activity.title}” handout</button>)}
              </div> : null}
              {activityHandout ? <article className="teacher-experience__handout-preview"><h4>{activityHandout.artifact.content.title}</h4><p>{activityHandout.artifact.content.subject} · {activityHandout.artifact.content.gradeBand} · {activityHandout.artifact.content.estimatedMinutes} minutes</p><p>{activityHandout.artifact.content.directions}</p>
                {activityHandout.artifact.content.materials.length ? <><strong>Materials</strong><ul>{activityHandout.artifact.content.materials.map((material) => <li key={material}>{material}</li>)}</ul></> : null}
                <div className="teacher-experience__actions"><button type="button" className="teacher-experience__primary" onClick={saveActivityHandout} disabled={busy || Boolean(savedActivityHandout)}>{activityHandoutStatus === "saving" ? "Saving handout…" : savedActivityHandout ? "Forge confirmed handout" : "Save separate handout to Forge"}</button>{!savedActivityHandout ? <button type="button" className="teacher-experience__secondary" onClick={() => { setActivityHandout(null); setActivityHandoutError(""); setActivityHandoutStatus("idle"); }} disabled={busy}>Choose another activity</button> : null}</div>
              </article> : null}
              {savedActivityHandout ? <div className="teacher-experience__saved" role="status"><Check size={17} aria-hidden="true" /><div><strong>Forge confirmed the separate student handout.</strong><span>Saved to the selected project for the assigned class. Student distribution was not started.</span></div></div> : null}
              {savedActivityHandout && activityHandout ? <div className="teacher-experience__review">
                <label><input type="checkbox" checked={activityHandoutReviewAcknowledged} onChange={(event) => { setActivityHandoutReviewAcknowledged(event.target.checked); setActivityHandoutExport(null); }} /> I reviewed the activity handout and will verify it before classroom use.</label>
                <button type="button" className="teacher-experience__primary" onClick={exportActivityHandout} disabled={busy || !activityHandoutReviewAcknowledged}>{activityHandoutStatus === "exporting" ? <LoaderCircle className="teacher-experience__spin" size={17} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}{activityHandoutStatus === "exporting" ? "Checking access and export…" : "Prepare printable handout"}</button>
              </div> : null}
              {activityHandoutExport ? <article className="teacher-experience__handout-export"><h4>Teacher-reviewed handout export</h4><button type="button" className="teacher-experience__secondary" onClick={() => downloadMarkdown(activityHandoutExport)}><Download size={15} aria-hidden="true" /> Download {activityHandoutExport.filename}</button><pre>{activityHandoutExport.content}</pre></article> : null}
              {activityHandoutError ? <div className="teacher-experience__notice teacher-experience__notice--error" role="alert"><AlertCircle size={17} aria-hidden="true" /><p>{activityHandoutError}</p></div> : null}
            </section> : null}
            {savedJourney && !exports ? <div className="teacher-experience__review">
              <label><input type="checkbox" checked={safetyAcknowledged} onChange={(event) => setSafetyAcknowledged(event.target.checked)} /> I reviewed the safety flags and will verify this material before classroom use.</label>
              <button type="button" className="teacher-experience__primary" onClick={prepareExports} disabled={busy}>{status === "exporting" ? <LoaderCircle className="teacher-experience__spin" size={17} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}{status === "exporting" ? "Checking access and exports…" : "Prepare the three exports"}</button>
            </div> : null}
            {exports ? <div className="teacher-experience__outputs teacher-experience__exports" aria-live="polite">
              {[["Lesson plan", exports.lesson], ["Teacher-only answer key", exports.answerKey], ["Student worksheet", exports.worksheet]].map(([label, exported]) => <article key={exported.filename}><div><h3>{label}</h3><p>Access and content checks passed for this export.</p></div><button className="teacher-experience__secondary" type="button" onClick={() => downloadMarkdown(exported)}><Download size={15} aria-hidden="true" /> Download {exported.filename}</button><pre>{exported.content}</pre></article>)}
            </div> : null}
            {savedJourney ? <section className="teacher-experience__handout" aria-labelledby="teacher-differentiated-heading">
              <h3 id="teacher-differentiated-heading">Make three difficulty levels</h3>
              <p>Add your own support hint for each saved worksheet question and one teacher-authored extension challenge. HEY preserves the original on-level prompts and does not invent answer content.</p>
              {savedJourney.studentArtifact.content.questions.map((question, index) => <label key={`${index}-${question.prompt}`}>
                Support hint for question {index + 1}
                <textarea rows={2} maxLength={800} disabled={busy} value={differentiatedHints[index] || ""} onChange={(event) => {
                  setDifferentiatedHints((current) => { const next = [...current]; next[index] = event.target.value; return next; });
                  setDifferentiatedReviewAcknowledged(false);
                  setDifferentiatedExport(null);
                }} />
              </label>)}
              <label>Extension challenge
                <textarea rows={2} maxLength={1200} disabled={busy} value={differentiatedExtensionPrompt} onChange={(event) => {
                  setDifferentiatedExtensionPrompt(event.target.value);
                  setDifferentiatedReviewAcknowledged(false);
                  setDifferentiatedExport(null);
                }} />
              </label>
              <div className="teacher-experience__review">
                <label><input type="checkbox" disabled={busy} checked={differentiatedReviewAcknowledged} onChange={(event) => { setDifferentiatedReviewAcknowledged(event.target.checked); setDifferentiatedExport(null); }} /> I reviewed all three versions and will verify them before classroom use.</label>
                <button type="button" className="teacher-experience__primary" onClick={prepareDifferentiatedExports} disabled={busy || !differentiatedReviewAcknowledged || differentiatedHints.length !== savedJourney.studentArtifact.content.questions.length || Array.from({ length: savedJourney.studentArtifact.content.questions.length }, (_, index) => !differentiatedHints[index]?.trim()).some(Boolean) || !differentiatedExtensionPrompt.trim()}>
                  {status === "differentiating" ? <LoaderCircle className="teacher-experience__spin" size={17} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
                  {status === "differentiating" ? "Checking access and preparing levels…" : "Prepare printable level pack"}
                </button>
              </div>
              {differentiatedExport ? <article className="teacher-experience__handout-export"><h4>Teacher-reviewed differentiated worksheets</h4><button type="button" className="teacher-experience__secondary" onClick={() => downloadMarkdown(differentiatedExport)}><Download size={15} aria-hidden="true" /> Download {differentiatedExport.filename}</button><pre>{differentiatedExport.content}</pre></article> : null}
            </section> : null}
          </section> : null}
        </>
      ) : null}

      {accountIsCurrent && error ? <div className="teacher-experience__notice teacher-experience__notice--error" role="alert"><AlertCircle size={18} aria-hidden="true" /><p>{error}</p>{status === "save-error" && preview ? <button className="teacher-experience__secondary" type="button" onClick={saveJourney} disabled={busy}>Retry the same journey save</button> : null}</div> : null}
    </main>
  );
}
