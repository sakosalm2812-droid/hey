import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { events, onboarding } from "../../core/index.js";

const { subscribe } = events;
const { getTutorial, getTutorialProgress, completeTutorialStep, skipTutorial, completeTutorial } = onboarding;

const positionStyle = {
  bottom: { transform: "translate(-50%, calc(100% + 20px))", left: "50%" },
  top: { transform: "translate(-50%, calc(-100% - 20px))", left: "50%" },
};

function getAnchorRect(selector) {
  try {
    const el = typeof selector === "string" ? document.querySelector(selector) : selector;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    return rect;
  } catch {
    return null;
  }
}

export default function TutorialOverlay() {
  const [active, setActive] = useState(null); // { capabilityId, stepIndex }
  const [rect, setRect] = useState(null);

  const updateRect = useCallback((selector) => {
    setRect(getAnchorRect(selector));
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (active) updateRect(getTutorial(active.capabilityId)?.steps[active.stepIndex]?.anchor);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active, updateRect]);

  useEffect(() => {
    const events = [
      ["tutorial.started", (payload) => {
        const tutorial = payload?.tutorial || getTutorial(payload?.capabilityId);
        if (!tutorial) return;
        setActive({ capabilityId: payload.capabilityId, stepIndex: 0 });
      }],
      ["tutorial.step_completed", (payload) => {
        if (!payload?.capabilityId) return;
        const prog = getTutorialProgress(payload.capabilityId);
        setActive((current) => current ? { ...current, stepIndex: prog?.currentStep ?? current.stepIndex } : current);
      }],
    ];
    const unsubs = events.map(([name, handler]) => subscribe(name, handler));
    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    if (!active) { setRect(null); return; }
    const tutorial = getTutorial(active.capabilityId);
    const step = tutorial?.steps?.[active.stepIndex];
    if (!step) { setActive(null); return; }
    if (step.anchor) {
      updateRect(step.anchor);
      const measure = () => updateRect(step.anchor);
      const t = window.setTimeout(measure, 400);
      return () => window.clearTimeout(t);
    }
    setRect(null);
  }, [active, updateRect]);

  const tutorial = useMemo(() => active ? getTutorial(active.capabilityId) : null, [active]);
  const step = tutorial?.steps?.[active?.stepIndex];

  const total = tutorial?.steps?.length || 0;
  const current = step ? (active?.stepIndex ?? 0) + 1 : 0;

  const goStep = useCallback((index) => {
    if (!active) return;
    completeTutorialStep(active.capabilityId, index);
    setActive({ ...active, stepIndex: index });
  }, [active]);

  const handleNext = useCallback(() => {
    if (!active || !tutorial) return;
    const last = tutorial.steps.length - 1;
    if (active.stepIndex >= last) {
      completeTutorial(active.capabilityId);
      setActive(null);
      return;
    }
    goStep(active.stepIndex + 1);
  }, [active, tutorial, goStep]);

  const handleBack = useCallback(() => {
    if (!active || active.stepIndex === 0) return;
    setActive({ ...active, stepIndex: active.stepIndex - 1 });
  }, [active]);

  const handleSkip = useCallback(() => {
    if (!active) return;
    skipTutorial(active.capabilityId);
    setActive(null);
  }, [active]);

  const spotlight = rect ? {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  } : null;

  return (
    <AnimatePresence>
      {active && step && (
        <motion.div
          className="hey-tutorial-overlay"
          key={`${active.capabilityId}-${active.stepIndex}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="hey-tutorial-dim" />
          {spotlight && (
            <div
              className="hey-tutorial-spotlight"
              style={{
                left: spotlight.left,
                top: spotlight.top,
                width: spotlight.width,
                height: spotlight.height,
              }}
            />
          )}
          <motion.div
            className="hey-tutorial-card"
            role="dialog"
            aria-modal="true"
            aria-label={`${tutorial.title}: step ${current} of ${total}`}
            style={spotlight ? {
              ...(positionStyle.bottom),
              left: spotlight.left + spotlight.width / 2,
              top: spotlight.top,
            } : { left: "50%", top: "45%", transform: "translate(-50%, -50%)" }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <button type="button" className="hey-tutorial-close" onClick={handleSkip} aria-label="Close tutorial">
              <X size={16} />
            </button>
            <span className="hey-tutorial-kicker">{tutorial.title} · {current} / {total}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
            <div className="hey-tutorial-dots" aria-hidden="true">
              {tutorial.steps.map((_, i) => (
                <span key={i} className={i === active.stepIndex ? "active" : ""} />
              ))}
            </div>
            <div className="hey-tutorial-actions">
              <button type="button" className="hey-tutorial-skip" onClick={handleSkip}>Skip</button>
              {current > 1 && (
                <button type="button" className="hey-tutorial-back" onClick={handleBack}>Back</button>
              )}
              <button type="button" className="hey-tutorial-next" onClick={handleNext} autoFocus>
                {current === total ? (<><Check size={15} /> Done</>) : (<>Next <ChevronRight size={15} /></>)}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}