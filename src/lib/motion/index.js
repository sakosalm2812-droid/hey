/**
 * HEY V1 — Motion System
 * Main entry point for motion primitives
 */

// Tokens
export * from './tokens';

// Hooks
export * from './hooks';

// Re-export commonly used combinations
export {
  useReducedMotion,
  useReducedTransparency,
  usePrefersContrast,
  usePerformanceTier,
  usePerformanceConfig,
  useMotionPreset,
  useInterruptibleAnimation,
  useFLIP,
  useTutorialChoreography,
  sharedTransitions,
  springPresets,
  animationQAChecklist,
  runAnimationQA,
  usePerformanceBudget,
} from './hooks';

export {
  durations,
  easings,
  distances,
  scale,
  blur,
  elevation,
  zIndex,
  performanceTierDefaults,
  reducedMotionFallbacks,
  buttonMotion,
  pageTransition,
  modalMotion,
  tooltipMotion,
  popoverMotion,
  contextMenuMotion,
  toastMotion,
  voiceVisualizerMotion,
  dynamicIslandMotion,
  widgetMotion,
  tutorialMotion,
  generateCSSVariables,
} from './tokens';