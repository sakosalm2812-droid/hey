/**
 * HEY V1 — Motion Tokens
 * Authoritative motion design tokens per specification sections 1, 2, 36, 37, 49
 */

// =========================================
// DURATIONS (ms)
// =========================================
export const durations = {
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

// =========================================
// EASINGS
// =========================================
export const easings = {
  primary: 'cubic-bezier(.22,1,.36,1)',
  fastOut: 'cubic-bezier(.16,1,.3,1)',
  press: 'cubic-bezier(.2,.8,.2,1)',
  linear: 'linear',
  // Spring configurations for use with spring libraries (framer-motion, motion-one, etc.)
  spring: {
    gentle: { damping: 0.8, stiffness: 120 },
    standard: { damping: 0.7, stiffness: 180 },
    snappy: { damping: 0.6, stiffness: 280 },
    morph: { damping: 0.75, stiffness: 160 },
  },
};

// =========================================
// DISTANCES (px)
// =========================================
export const distances = {
  micro: { min: 2, max: 4 },
  small: { min: 6, max: 12 },
  panel: { min: 16, max: 24 },
  page: { min: 24, max: 40 },
  large: { min: 40, max: 80 },
};

// =========================================
// SCALE FACTORS
// =========================================
export const scale = {
  hoverLift: { min: 1.005, max: 1.015 },
  press: { min: 0.985, max: 0.995 },
  modalEnter: { from: 0.975, to: 1 },
  widgetPickup: { from: 1, to: 1.015 },
  heroMax: 1.08,
};

// =========================================
// BLUR VALUES (px)
// =========================================
export const blur = {
  enterMax: 12,
  decorativeMax: 12,
  backdrop: 28,
  backdropStrong: 32,
};

// =========================================
// ELEVATION / SHADOWS
// =========================================
export const elevation = {
  level0: '0 0 0 rgba(0,0,0,0)',
  level1: '0 2px 8px rgba(0,0,0,0.08)',
  level2: '0 8px 24px rgba(0,0,0,0.12)',
  level3: '0 16px 48px rgba(0,0,0,0.16)',
  level4: '0 24px 80px rgba(0,0,0,0.22)',
  level5: '0 32px 100px rgba(0,0,0,0.3)',
};

// =========================================
// Z-INDEX SCALE
// =========================================
export const zIndex = {
  canvas: 0,
  widget: 100,
  widgetSelected: 200,
  chrome: 300,
  island: 500,
  popover: 700,
  toast: 800,
  modalBackdrop: 900,
  modal: 1000,
  security: 1200,
  tutorial: 1300,
};

// =========================================
// PERFORMANCE TIERS (section 37)
// =========================================
export const performanceTierDefaults = {
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
};

// =========================================
// REDUCED MOTION FALLBACKS (section 36)
// =========================================
export const reducedMotionFallbacks = {
  // translation > 8px → fade
  translation: 'fade',
  // zoom → fade
  zoom: 'fade',
  // parallax → none
  parallax: 'none',
  // continuous breathing → static state
  breathing: 'static',
  // graph drift → static
  graphDrift: 'static',
  // page shared-element motion → crossfade
  sharedElement: 'crossfade',
  // liquid morph → simple size/fade
  liquidMorph: 'simple',
  // tutorial hand/path animations → step-by-step still frames
  tutorialGesture: 'staticFrames',
  // Keep these even in reduced motion
  keep: [
    'essentialProgress',
    'focusStates',
    'pressedState',
    'stateColorChanges',
    'directDragResponse',
  ],
};

// =========================================
// COMPONENT-SPECIFIC TOKENS
// =========================================

// Button (section 3)
export const buttonMotion = {
  hover: {
    translateY: -1,
    shadowIncrease: '10-20%',
    highlightIncrease: '8-12%',
    duration: durations.micro,
    easing: easings.primary,
  },
  press: {
    translateY: 1,
    scale: 0.992,
    duration: durations.instant,
    easing: easings.press,
  },
  release: {
    duration: durations.fast,
    easing: easings.primary,
  },
  keyboardActivation: {
    duration: durations.instant,
  },
  toggle: {
    knobDuration: 200,
    trackDelay: 20,
  },
  segmented: {
    plateDuration: 200,
    textCrossfade: durations.micro,
  },
};

// Page Transition (section 4)
export const pageTransition = {
  outgoing: {
    opacity: { from: 1, to: 0.96 },
    duration: 100,
  },
  incoming: {
    opacity: { from: 0, to: 1 },
    translateY: { from: 10, to: 0 },
    duration: 250,
    easing: easings.primary,
  },
  sibling: {
    horizontal: { min: 8, max: 16 },
  },
  deep: {
    translateX: { min: 16, max: 24 },
  },
  reduced: {
    crossfadeDuration: 130,
  },
};

// Modal / Drawer / Sheet (section 7)
export const modalMotion = {
  backdrop: {
    opacity: { from: 0, to: 0.5 },
    duration: 160,
  },
  panel: {
    scale: { from: 0.975, to: 1 },
    translateY: { from: 8, to: 0 },
    duration: 250,
    easing: easings.primary,
  },
  close: {
    duration: 180,
  },
  drawer: {
    translateX: { from: '100%', to: 0 },
    duration: 290,
    easing: easings.primary,
  },
  bottomSheet: {
    spring: easings.spring.standard,
    velocitySensitive: true,
  },
  highRisk: {
    duration: 280,
    noBounce: true,
  },
};

// Tooltip / Popover / Context Menu (section 8)
export const tooltipMotion = {
  showDelay: 300,
  animation: {
    fade: true,
    lift: 2,
    duration: 90,
  },
  hide: {
    duration: 70,
  },
};

export const popoverMotion = {
  scale: { from: 0.98, to: 1 },
  duration: 140,
  easing: easings.primary,
};

export const contextMenuMotion = {
  scale: { from: 0.97, to: 1 },
  duration: 120,
  easing: easings.primary,
};

// Toast / Notification (section 9)
export const toastMotion = {
  desktop: {
    translateX: 16,
    duration: 220,
    easing: easings.primary,
  },
  mobile: {
    translateY: -8,
    duration: 220,
    easing: easings.primary,
  },
  grouped: {
    stackShift: { min: 8, max: 12 },
  },
  success: {
    iconPop: 120,
  },
  error: {
    correctionNudge: 2,
  },
  dismiss: {
    translate: 8,
    duration: 140,
  },
};

// Voice Visualizer (section 12)
export const voiceVisualizerMotion = {
  idle: {
    scale: { from: 1, to: 1.015 },
    cycle: { min: 3500, max: 5000 },
    brightness: 'low',
  },
  listening: {
    maxRadiusExcursion: 0.12,
    smoothing: true,
  },
  thinking: {
    ordered: true,
    energy: 'inwardOutward',
  },
  speaking: {
    brightness: 'high',
    audioDriven: true,
  },
  interrupted: {
    contractDuration: 150,
  },
  muted: {
    dampened: true,
  },
  reduced: {
    staticOrb: true,
    opacityStates: true,
  },
};

// Dynamic Island (section 14)
export const dynamicIslandMotion = {
  collapsed: {
    widthExpand: { min: 8, max: 20 },
  },
  expanded: {
    morphDuration: { min: 300, max: 420 },
    spring: easings.spring.morph,
    contentHierarchy: ['status', 'primaryControl', 'secondaryInfo'],
  },
  collapse: {
    order: ['secondaryInfo', 'shapeMorph'],
  },
  progress: {
    thinLine: true,
  },
  success: {
    checkMorph: true,
    returnToIdle: { min: 1200, max: 2000 },
  },
  error: {
    edgeColorShift: true,
    noShake: true,
  },
  crossMonitor: {
    fadeAndMaterialize: true,
  },
};

// Widget (section 15)
export const widgetMotion = {
  create: {
    scale: { from: 0.96, to: 1 },
    duration: 240,
  },
  pickup: {
    scale: 1.015,
    elevationIncrease: true,
  },
  drag: {
    directResponse: true,
    noEasing: true,
  },
  snap: {
    guidePreDrop: true,
    releaseSpring: { min: 180, max: 240 },
  },
  resize: {
    directResponse: true,
    debounceLayout: true,
  },
  minimize: {
    duration: { min: 220, max: 320 },
  },
  maximize: {
    duration: { min: 300, max: 420 },
  },
  close: {
    scale: { from: 1, to: 0.98 },
    duration: 160,
  },
  stack: {
    duration: { min: 160, max: 220 },
  },
};

// Tutorial (sections 38, 40)
export const tutorialMotion = {
  spotlight: {
    duration: 300,
  },
  pointer: {
    move: { min: 300, max: 500 },
    press: 80,
    highlight: true,
  },
  touch: {
    fingertipCircle: true,
    tapPulse: true,
    swipeTrail: 250,
  },
  gesture: {
    handSilhouette: true,
    directionalPath: true,
    startEndPoses: true,
    realSpeed: true,
  },
  controls: ['back', 'next', 'skip', 'replay', 'practice'],
  completion: {
    checkIcon: true,
    replayMessage: true,
  },
  reduced: {
    staticFrames: true,
    stepTransitions: true,
  },
};

// =========================================
// CSS VARIABLE GENERATOR
// =========================================
export function generateCSSVariables(prefix = 'motion') {
  const vars = {};

  // Durations
  Object.entries(durations).forEach(([key, value]) => {
    vars[`--${prefix}-duration-${key}`] = `${value}ms`;
  });

  // Easings
  Object.entries(easings).forEach(([key, value]) => {
    if (typeof value === 'string') {
      vars[`--${prefix}-ease-${key}`] = value;
    }
  });

  // Spring presets as CSS custom properties (for JS consumption)
  Object.entries(easings.spring).forEach(([key, value]) => {
    vars[`--${prefix}-spring-${key}-damping`] = String(value.damping);
    vars[`--${prefix}-spring-${key}-stiffness`] = String(value.stiffness);
  });

  // Distances
  Object.entries(distances).forEach(([key, value]) => {
    vars[`--${prefix}-distance-${key}-min`] = `${value.min}px`;
    vars[`--${prefix}-distance-${key}-max`] = `${value.max}px`;
  });

  // Scale
  Object.entries(scale).forEach(([key, value]) => {
    if ('from' in value && 'to' in value) {
      vars[`--${prefix}-scale-${key}-from`] = String(value.from);
      vars[`--${prefix}-scale-${key}-to`] = String(value.to);
    } else if ('min' in value && 'max' in value) {
      vars[`--${prefix}-scale-${key}-min`] = String(value.min);
      vars[`--${prefix}-scale-${key}-max`] = String(value.max);
    } else {
      vars[`--${prefix}-scale-${key}`] = String(value);
    }
  });

  // Blur
  Object.entries(blur).forEach(([key, value]) => {
    vars[`--${prefix}-blur-${key}`] = `${value}px`;
  });

  // Elevation
  Object.entries(elevation).forEach(([key, value]) => {
    vars[`--${prefix}-elevation-${key}`] = value;
  });

  // Z-index
  Object.entries(zIndex).forEach(([key, value]) => {
    vars[`--${prefix}-z-${key}`] = String(value);
  });

  // Reduced motion fallbacks
  vars[`--${prefix}-reduced-translation`] = reducedMotionFallbacks.translation;
  vars[`--${prefix}-reduced-zoom`] = reducedMotionFallbacks.zoom;
  vars[`--${prefix}-reduced-parallax`] = reducedMotionFallbacks.parallax;
  vars[`--${prefix}-reduced-breathing`] = reducedMotionFallbacks.breathing;

  return vars;
}