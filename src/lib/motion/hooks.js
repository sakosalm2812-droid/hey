/**
 * HEY V1 — Motion Hooks & Primitives
 * Implements section 49: Motion Implementation Architecture
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';

// =========================================
// REDUCED MOTION HOOK (section 36, 49)
// =========================================

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mediaQuery.matches);

    const handler = (event) => {
      setReduced(event.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return reduced;
}

export function useReducedTransparency() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-transparency: reduce)');
    setReduced(mediaQuery.matches);

    const handler = (event) => {
      setReduced(event.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return reduced;
}

export function usePrefersContrast() {
  const [contrast, setContrast] = useState('no-preference');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-contrast: more)');
    const lessQuery = window.matchMedia('(prefers-contrast: less)');

    const update = () => {
      if (mediaQuery.matches) setContrast('more');
      else if (lessQuery.matches) setContrast('less');
      else setContrast('no-preference');
    };

    update();
    mediaQuery.addEventListener('change', update);
    lessQuery.addEventListener('change', update);

    return () => {
      mediaQuery.removeEventListener('change', update);
      lessQuery.removeEventListener('change', update);
    };
  }, []);

  return contrast;
}

// =========================================
// PERFORMANCE TIER HOOK (section 37, 49)
// =========================================

export function usePerformanceTier() {
  const [tier, setTier] = useState('balanced');

  useEffect(() => {
    const detectTier = () => {
      // Check for battery saver
      if ('getBattery' in navigator) {
        navigator.getBattery?.().then((battery) => {
          if (battery.savingMode) {
            setTier('lightweight');
            return;
          }
        });
      }

      // Check hardware concurrency
      const cores = navigator.hardwareConcurrency || 4;
      const memory = navigator.deviceMemory || 4;

      // Check for reduced motion (forces lightweight)
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reducedMotion) {
        setTier('lightweight');
        return;
      }

      // Check for low-end GPU (rough heuristic)
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      const isLowEnd = !gl || cores <= 4 || memory <= 4;

      if (isLowEnd) {
        setTier('lightweight');
      } else if (cores >= 8 && memory >= 8) {
        setTier('full');
      } else {
        setTier('balanced');
      }
    };

    detectTier();

    // Re-check on visibility change (thermal throttling)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        detectTier();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return tier;
}

export function usePerformanceConfig(tier) {
  const detectedTier = usePerformanceTier();
  const currentTier = tier || detectedTier;

  const config = useMemo(() => {
    return {
      full: {
        liquidReflections: true,
        subtleParallax: true,
        richerShadows: true,
        backgroundBlur: true,
        ambientAnimations: true,
        particleSystems: true,
      },
      balanced: {
        liquidReflections: false,
        subtleParallax: true,
        richerShadows: false,
        backgroundBlur: true,
        ambientAnimations: true,
        particleSystems: false,
      },
      lightweight: {
        liquidReflections: false,
        subtleParallax: false,
        richerShadows: false,
        backgroundBlur: false,
        ambientAnimations: false,
        particleSystems: false,
      },
    }[currentTier];
  }, [currentTier]);

  return { tier: currentTier, config };
}

// =========================================
// MOTION PRESET HOOK (section 49)
// =========================================

export function useMotionPreset(presetName, customDuration, customEasing) {
  const reduced = useReducedMotion();

  return useMemo(() => {
    const durations = {
      instant: 80,
      micro: 120,
      fast: 160,
      standard: 240,
      medium: 300,
      large: 420,
      panel: 500,
      cinematicMin: 700,
      cinematicMax: 1200,
      tutorialStepMin: 700,
      tutorialStepMax: 1600,
    };

    const easings = {
      primary: 'cubic-bezier(.22,1,.36,1)',
      fastOut: 'cubic-bezier(.16,1,.3,1)',
      press: 'cubic-bezier(.2,.8,.2,1)',
      linear: 'linear',
    };

    if (reduced) {
      // Reduced motion: use instant or very fast durations
      return {
        duration: 1,
        easing: 'linear',
      };
    }

    if (presetName === 'custom') {
      return {
        duration: customDuration || durations.standard,
        easing: customEasing || easings.primary,
      };
    }

    return {
      duration: durations[presetName] || durations.standard,
      easing: easings.primary,
    };
  }, [reduced, presetName, customDuration, customEasing]);
}

// =========================================
// SHARED TRANSITION VARIANTS (section 49)
// =========================================

export const sharedTransitions = {
  // Page enter/exit (section 4)
  pageEnter: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0.96, y: 0 },
    transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
  },

  pageExit: {
    initial: { opacity: 1, y: 0 },
    animate: { opacity: 0.96, y: 0 },
    transition: { duration: 0.1, ease: [0.22, 1, 0.36, 1] },
  },

  // Modal (section 7)
  modalBackdrop: {
    initial: { opacity: 0 },
    animate: { opacity: 0.5 },
    exit: { opacity: 0 },
    transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
  },

  modalPanel: {
    initial: { scale: 0.975, y: 8, opacity: 0 },
    animate: { scale: 1, y: 0, opacity: 1 },
    exit: { scale: 0.975, y: 8, opacity: 0 },
    transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
  },

  // Drawer (section 7)
  drawer: {
    initial: { x: '100%' },
    animate: { x: 0 },
    exit: { x: '100%' },
    transition: { duration: 0.29, ease: [0.22, 1, 0.36, 1] },
  },

  // Toast (section 9)
  toastDesktop: {
    initial: { x: 16, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: 8, opacity: 0 },
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  },

  toastMobile: {
    initial: { y: -8, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: -8, opacity: 0 },
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  },

  // Tooltip (section 8)
  tooltip: {
    initial: { scale: 0.95, y: 2, opacity: 0 },
    animate: { scale: 1, y: 0, opacity: 1 },
    exit: { scale: 0.95, y: 2, opacity: 0 },
    transition: { duration: 0.09, ease: [0.22, 1, 0.36, 1] },
  },

  // Popover (section 8)
  popover: {
    initial: { scale: 0.98, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.98, opacity: 0 },
    transition: { duration: 0.14, ease: [0.22, 1, 0.36, 1] },
  },

  // Context menu (section 8)
  contextMenu: {
    initial: { scale: 0.97, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.97, opacity: 0 },
    transition: { duration: 0.12, ease: [0.22, 1, 0.36, 1] },
  },

  // Button hover/press (section 3)
  buttonHover: {
    scale: 1.01,
    y: -1,
    transition: { duration: 0.12, ease: [0.22, 1, 0.36, 1] },
  },

  buttonPress: {
    scale: 0.992,
    y: 1,
    transition: { duration: 0.08, ease: [0.2, 0.8, 0.2, 1] },
  },

  // Card hover (section 17)
  cardHover: {
    y: -1,
    transition: { duration: 0.12, ease: [0.22, 1, 0.36, 1] },
  },

  // Widget (section 15)
  widgetCreate: {
    initial: { scale: 0.96, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
  },

  widgetPickup: {
    scale: 1.015,
    transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
  },

  widgetSnap: {
    transition: { type: 'spring', damping: 0.75, stiffness: 160 },
  },

  // Dynamic Island (section 14)
  islandExpand: {
    transition: { type: 'spring', damping: 0.75, stiffness: 160, duration: 0.36 },
  },

  islandCollapse: {
    transition: { type: 'spring', damping: 0.8, stiffness: 140, duration: 0.32 },
  },

  // Voice visualizer (section 12)
  voiceIdle: {
    scale: [1, 1.015, 1],
    transition: { duration: 4.25, ease: 'easeInOut', repeat: Infinity },
  },

  // Tutorial (section 38, 40)
  tutorialSpotlight: {
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
  },

  tutorialPointer: {
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
};

// =========================================
// TUTORIAL CHOREOGRAPHY PRIMITIVES (section 49)
// =========================================

export function useTutorialChoreography(choreography, autoStart = false) {
  const reduced = useReducedMotion();

  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [completed, setCompleted] = useState(false);
  const stepCount = reduced && choreography?.reducedMotionSteps
    ? choreography.reducedMotionSteps.length
    : choreography?.steps?.length || 0;

  useEffect(() => {
    const start = () => {
      setCurrentStep(0);
      setCompleted(false);
      setIsPlaying(true);
    };
    const handleStart = (event) => {
      if (event.detail?.tutorialId === choreography?.id) start();
    };

    window.addEventListener('hey:tutorial:start', handleStart);
    if (autoStart) start();
    return () => window.removeEventListener('hey:tutorial:start', handleStart);
  }, [autoStart, choreography?.id]);

  const nextStep = useCallback(() => {
    if (currentStep < stepCount - 1) {
      setCurrentStep((step) => step + 1);
    } else {
      setIsPlaying(false);
      setCompleted(true);
    }
  }, [currentStep, stepCount]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  const skip = useCallback(() => {
    setIsPlaying(false);
    setCompleted(true);
  }, []);

  const replay = useCallback(() => {
    setCurrentStep(0);
    setCompleted(false);
    setIsPlaying(true);
  }, []);

  return {
    choreography,
    currentStep,
    isPlaying,
    completed,
    reduced,
    nextStep,
    prevStep,
    skip,
    replay,
    setIsPlaying,
  };
}

// =========================================
// INTERRUPTIBLE ANIMATION HELPER (section 13, 14)
// =========================================

export function useInterruptibleAnimation() {
  const [isAnimating, setIsAnimating] = useState(false);
  const abortControllerRef = useRef(null);

  const startAnimation = useCallback(async (animation) => {
    // Cancel any in-flight animation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsAnimating(true);

    try {
      await animation();
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        // Expected interruption
        return;
      }
      throw e;
    } finally {
      setIsAnimating(false);
      abortControllerRef.current = null;
    }
  }, []);

  const interrupt = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { isAnimating, startAnimation, interrupt };
}

// =========================================
// FLIP ANIMATION HELPER (section 17, 25)
// =========================================

export function useFLIP() {
  const reduced = useReducedMotion();

  const flip = useCallback(({ target, onComplete }) => {
    if (reduced) {
      onComplete?.();
      return;
    }

    // First: get initial position
    const firstRect = target.getBoundingClientRect();

    // Force browser to process any pending layout changes
    requestAnimationFrame(() => {
      // Last: get final position
      const lastRect = target.getBoundingClientRect();

      // Invert: calculate transform to make it look like it's still in first position
      const dx = firstRect.left - lastRect.left;
      const dy = firstRect.top - lastRect.top;
      const dw = firstRect.width / lastRect.width;
      const dh = firstRect.height / lastRect.height;

      // Play: animate from inverted to identity
      target.style.transformOrigin = 'top left';
      target.style.transition = 'transform 0.22s cubic-bezier(.22,1,.36,1)';
      target.style.transform = `translate(${dx}px, ${dy}px) scale(${dw}, ${dh})`;

      // Force reflow
      target.offsetHeight;

      // Animate to identity
      target.style.transform = 'translate(0, 0) scale(1, 1)';

      const handleTransitionEnd = () => {
        target.style.transition = '';
        target.style.transform = '';
        target.style.transformOrigin = '';
        target.removeEventListener('transitionend', handleTransitionEnd);
        onComplete?.();
      };

      target.addEventListener('transitionend', handleTransitionEnd);
    });
  }, [reduced]);

  return { flip };
}

// =========================================
// SPRING PRESETS FOR EXTERNAL LIBS
// =========================================

export const springPresets = {
  gentle: { damping: 0.8, stiffness: 120, mass: 1 },
  standard: { damping: 0.7, stiffness: 180, mass: 1 },
  snappy: { damping: 0.6, stiffness: 280, mass: 1 },
  morph: { damping: 0.75, stiffness: 160, mass: 1 },
  island: { damping: 0.75, stiffness: 160, mass: 1 },
  widget: { damping: 0.7, stiffness: 200, mass: 1 },
  dragRelease: { damping: 0.65, stiffness: 220, mass: 1 },
};

// =========================================
// ANIMATION QA HELPERS (section 47)
// =========================================

export const animationQAChecklist = [
  '60Hz',
  '120Hz',
  'weak integrated GPU',
  'battery saver',
  'reduced motion',
  'browser zoom 200%',
  'RTL',
  'mobile',
  'tablet',
  'desktop',
  'keyboard',
  'touch',
  'screen reader focus',
  'interrupted mid-animation',
];

export function runAnimationQA(animationName) {
  console.group(`Animation QA: ${animationName}`);
  animationQAChecklist.forEach((check) => {
    console.log(`☐ ${check}`);
  });
  console.groupEnd();
}

// =========================================
// PERFORMANCE BUDGET MONITOR (section 48)
// =========================================

export function usePerformanceBudget() {
  const [warnings, setWarnings] = useState([]);

  useEffect(() => {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'animation' && entry.duration > 16.67) {
          setWarnings((prev) => [...prev, `Long frame: ${entry.name} (${entry.duration.toFixed(2)}ms)`]);
        }
      }
    });

    observer.observe({ entryTypes: ['animation', 'frame'] });
    return () => observer.disconnect();
  }, []);

  return { warnings, clearWarnings: () => setWarnings([]) };
}
