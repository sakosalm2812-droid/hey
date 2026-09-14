/**
 * HEY V1 — Tutorial System Components
 * Implements Sections 38, 40, 41, 42: Tutorial Animation Catalog & Visual Language
 */

import { useState, useRef, useEffect, useCallback, useMemo, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion, tutorialMotion, useTutorialChoreography } from '../../lib/motion';
import '../../styles/motion.css';

interface TutorialStep {
  id: string;
  target: string; // CSS selector
  action: 'click' | 'hover' | 'drag' | 'type' | 'scroll' | 'gesture' | 'wait' | 'explain';
  caption: string;
  captionPosition?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  pointerPath?: { x: number; y: number }[];
  gestureType?: 'tap' | 'swipe' | 'pinch' | 'drag' | 'hold';
  waitFor?: () => boolean;
  highlight?: boolean;
  skipable?: boolean;
}

interface TutorialChoreography {
  id: string;
  version: number;
  title: string;
  steps: TutorialStep[];
  reducedMotionSteps?: TutorialStep[];
  onComplete?: () => void;
  onSkip?: () => void;
}

interface TutorialSpotlightProps {
  step: TutorialStep;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onReplay: () => void;
  currentStep: number;
  totalSteps: number;
  reduced?: boolean;
}

// Spotlight overlay for tutorial
const TutorialSpotlight = ({
  step,
  onNext,
  onPrev,
  onSkip,
  onReplay,
  currentStep,
  totalSteps,
  reduced = false,
}: TutorialSpotlightProps) => {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [pointerPosition, setPointerPosition] = useState({ x: 0, y: 0 });
  const [showPointer, setShowPointer] = useState(false);
  const spotlightRef = useRef(null);
  const pointerRef = useRef(null);
  const targetRef = useRef(null);

  // Find and measure target element
  useEffect(() => {
    const findTarget = () => {
      const element = document.querySelector(step.target);
      if (element) {
        targetRef.current = element;
        const rect = element.getBoundingClientRect();
        setTargetRect(rect);
        return true;
      }
      return false;
    };

    if (!findTarget()) {
      // Retry after a short delay
      const timer = setTimeout(() => findTarget(), 100);
      return () => clearTimeout(timer);
    }
  }, [step.target]);

  // Animate pointer along path
  useEffect(() => {
    if (reduced || !step.pointerPath || step.pointerPath.length < 2) {
      setShowPointer(false);
      return;
    }

    const path = step.pointerPath;
    let pathIndex = 0;

    const animatePointer = () => {
      if (pathIndex >= path.length - 1) {
        // At end, show press animation
        if (pointerRef.current) {
          pointerRef.current.style.transform = 'scale(0.9)';
        }
        setTimeout(() => {
          if (pointerRef.current) {
            pointerRef.current.style.transform = 'scale(1)';
          }
          // Highlight target
          if (targetRef.current) {
            targetRef.current.classList.add('hey-tutorial-target-highlight');
            setTimeout(() => {
              targetRef.current?.classList.remove('hey-tutorial-target-highlight');
            }, 300);
          }
          setShowPointer(false);
        }, 80);
        return;
      }

      const start = path[pathIndex];
      const end = path[pathIndex + 1];
      const duration = tutorialMotion.pointer.move.min;

      // Animate along segment
      const startTime = performance.now();
      const animate = (now) => {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out
        const x = start.x + (end.x - start.x) * eased;
        const y = start.y + (end.y - start.y) * eased;
        setPointerPosition({ x, y });
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          pathIndex++;
          animatePointer();
        }
      };
      requestAnimationFrame(animate);
    };

    setShowPointer(true);
    setPointerPosition(path[0]);
    animatePointer();
  }, [step, reduced]);

  // Position spotlight
  const spotlightStyles = targetRect ? {
    '--spotlight-x': `${targetRect.left + targetRect.width / 2}px`,
    '--spotlight-y': `${targetRect.top + targetRect.height / 2}px`,
    '--spotlight-width': `${Math.max(targetRect.width, targetRect.height) + 24}px`,
    '--spotlight-height': `${Math.max(targetRect.width, targetRect.height) + 24}px`,
    '--spotlight-radius': `${Math.max(8, Math.min(targetRect.width, targetRect.height) / 2)}px`,
  } : {};

  const captionStyles = targetRect && step.captionPosition ? {
    '--caption-x': step.captionPosition === 'left' ? `${targetRect.left - 16}px` :
                    step.captionPosition === 'right' ? `${targetRect.right + 16}px` :
                    `${targetRect.left + targetRect.width / 2}px`,
    '--caption-y': step.captionPosition === 'top' ? `${targetRect.top - 16}px` :
                    step.captionPosition === 'bottom' ? `${targetRect.bottom + 16}px` :
                    `${targetRect.top + targetRect.height / 2}px`,
  } : {};

  if (!targetRect) {
    return <div className="hey-tutorial-loading">Finding target...</div>;
  }

  return (
    <div className="hey-tutorial-spotlight-overlay" style={spotlightStyles as React.CSSProperties}>
      {/* Spotlight ring */}
      <div className="hey-tutorial-spotlight" />

      {/* Pointer */}
      {showPointer && (
        <div
          ref={pointerRef}
          className="hey-tutorial-pointer"
          style={{
            left: `${pointerPosition.x}px`,
            top: `${pointerPosition.y}px`,
          } as React.CSSProperties}
          aria-hidden="true"
        >
          <div className="hey-tutorial-pointer-ring" />
          <div className="hey-tutorial-pointer-dot" />
        </div>
      )}

      {/* Gesture silhouette */}
      {step.gestureType && !reduced && (
        <div className={`hey-tutorial-gesture hey-tutorial-gesture-${step.gestureType}`} aria-hidden="true">
          <GestureSilhouette type={step.gestureType} />
        </div>
      )}

      {/* Caption */}
      <div
        className="hey-tutorial-caption"
        style={captionStyles as React.CSSProperties}
        role="dialog"
        aria-label="Tutorial step"
      >
        <div className="hey-tutorial-caption-content">
          <p>{step.caption}</p>
          <div className="hey-tutorial-caption-controls">
            <span className="hey-tutorial-progress">
              Step {currentStep + 1} of {totalSteps}
            </span>
            <div className="hey-tutorial-buttons">
              {currentStep > 0 && (
                <button className="hey-tutorial-btn" onClick={onPrev}>
                  Back
                </button>
              )}
              <button className="hey-tutorial-btn hey-tutorial-btn-skip" onClick={onSkip}>
                Skip
              </button>
              <button className="hey-tutorial-btn hey-tutorial-btn-primary" onClick={onNext}>
                {currentStep === totalSteps - 1 ? 'Done' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Gesture silhouettes for tutorial (section 40)
const GestureSilhouette = ({ type }: { type: string }) => {
  const silhouettes = {
    tap: (
      <svg viewBox="0 0 60 80" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 70 L30 40" />
        <ellipse cx="30" cy="30" rx="15" ry="10" />
        <circle cx="30" cy="30" r="5" style={{ animation: 'hey-tap-pulse 0.5s ease-out' }} />
      </svg>
    ),
    swipe: (
      <svg viewBox="0 0 60 80" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 70 L30 40" />
        <ellipse cx="30" cy="30" rx="15" ry="10" />
        <path d="M30 30 L50 10" style={{ strokeDasharray: '20', animation: 'hey-swipe-trail 0.8s ease-out' }} />
        <polygon points="50,10 44,18 56,18" />
      </svg>
    ),
    pinch: (
      <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="20" cy="40" r="8" style={{ animation: 'hey-pinch-move 1s ease-in-out infinite alternate' }} />
        <circle cx="60" cy="40" r="8" style={{ animation: 'hey-pinch-move 1s ease-in-out infinite alternate-reverse' }} />
      </svg>
    ),
    drag: (
      <svg viewBox="0 0 60 80" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 70 L30 40" />
        <ellipse cx="30" cy="30" rx="15" ry="10" />
        <rect x="20" y="20" width="20" height="20" rx="4" style={{ animation: 'hey-drag-move 1.5s ease-in-out infinite' }} />
      </svg>
    ),
    hold: (
      <svg viewBox="0 0 60 80" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 70 L30 40" />
        <ellipse cx="30" cy="30" rx="15" ry="10" />
        <circle cx="30" cy="30" r="12" style={{ strokeDasharray: '75', animation: 'hey-hold-ring 2s ease-in-out infinite' }} />
      </svg>
    ),
  };

  return silhouettes[type as keyof typeof silhouettes] || silhouettes.tap;
};

// Main Tutorial Component
interface MotionTutorialProps {
  choreography: TutorialChoreography;
  autoStart?: boolean;
  className?: string;
}

const MotionTutorial = forwardRef(({
  choreography,
  autoStart = false,
  className = '',
}, ref) => {
  const reduced = useReducedMotion();
  const {
    currentStep,
    isPlaying,
    completed,
    nextStep,
    prevStep,
    skip,
    replay,
    setIsPlaying,
  } = useTutorialChoreography(choreography, autoStart);

  const steps = reduced && choreography.reducedMotionSteps
    ? choreography.reducedMotionSteps
    : choreography.steps;

  const currentStepData = steps[currentStep];

  const handleNext = useCallback(() => {
    if (currentStepData?.waitFor && !currentStepData.waitFor()) {
      return;
    }
    nextStep();
    if (currentStep === steps.length - 1) {
      choreography.onComplete?.();
    }
  }, [currentStep, currentStepData, nextStep, steps.length, choreography]);

  const handleSkip = useCallback(() => {
    skip();
    choreography.onSkip?.();
  }, [skip, choreography]);

  const handleReplay = useCallback(() => {
    replay();
  }, [replay]);

  if (!isPlaying && !completed) return null;

  return createPortal(
    <div
      ref={ref}
      className={`hey-tutorial ${completed ? 'completed' : ''} ${reduced ? 'reduced-motion' : ''} ${className}`}
      role="dialog"
      aria-modal="true"
      aria-label={choreography.title}
    >
      <TutorialSpotlight
        step={currentStepData}
        onNext={handleNext}
        onPrev={prevStep}
        onSkip={handleSkip}
        onReplay={handleReplay}
        currentStep={currentStep}
        totalSteps={steps.length}
        reduced={reduced}
      />

      {completed && (
        <div className="hey-tutorial-completion" role="status">
          <div className="hey-tutorial-completion-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3>Tutorial Complete!</h3>
          <p>You can replay this anytime from Tutorials.</p>
          <button className="hey-tutorial-btn hey-tutorial-btn-primary" onClick={handleReplay}>
            Replay
          </button>
          <button className="hey-tutorial-btn" onClick={handleSkip}>
            Close
          </button>
        </div>
      )}
    </div>,
    document.body
  );
});

MotionTutorial.displayName = 'MotionTutorial';

// Tutorial Registry - maps tutorial IDs to choreographies
export const tutorialRegistry: Record<string, TutorialChoreography> = {
  'first-launch': {
    id: 'first-launch',
    version: 1,
    title: 'Welcome to HEY',
    steps: [
      {
        id: 'wordmark',
        target: '.hey-app-brand',
        action: 'explain',
        caption: 'This is HEY. Your AI companion.',
      },
      {
        id: 'chat',
        target: '.hey-dashboard-talk',
        action: 'click',
        caption: 'Click here to start a conversation with HEY.',
        pointerPath: [
          { x: 100, y: 100 },
          { x: 200, y: 300 },
        ],
      },
      {
        id: 'voice',
        target: '.hey-voice-button',
        action: 'click',
        caption: 'Or press and hold to talk with your voice.',
        gestureType: 'hold',
      },
    ],
  },
  'chat': {
    id: 'chat',
    version: 1,
    title: 'Chat with HEY',
    steps: [
      {
        id: 'input',
        target: '.hey-chat-input',
        action: 'click',
        caption: 'Type your message here.',
      },
      {
        id: 'attach',
        target: '.hey-chat-attach',
        action: 'click',
        caption: 'Attach files, images, or code.',
        gestureType: 'tap',
      },
      {
        id: 'send',
        target: '.hey-chat-send',
        action: 'click',
        caption: 'Send to start the conversation.',
        pointerPath: [
          { x: 200, y: 100 },
          { x: 400, y: 500 },
        ],
      },
    ],
  },
  // Add more tutorial choreographies as needed
};

// Tutorial Provider Hook
export function useTutorial(tutorialId: string) {
  const choreography = useMemo(() => tutorialRegistry[tutorialId], [tutorialId]);

  const start = useCallback(() => {
    // Dispatch event to start tutorial
    window.dispatchEvent(new CustomEvent('hey:tutorial:start', { detail: { tutorialId } }));
  }, [tutorialId]);

  return { choreography, start };
}

export { MotionTutorial, TutorialSpotlight, GestureSilhouette };
export default MotionTutorial;
