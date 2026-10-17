export function reconcileTutorialOverlayProgress(active, payload, tutorial) {
  if (!active || active.capabilityId !== payload?.capabilityId) return active;
  if (active.accountScope !== payload.accountScope) return null;
  const progress = payload.progress;
  if (payload.status === "unavailable" || !tutorial?.steps?.length || !progress?.startedAt || progress.completedAt || progress.skipped) return null;
  return { ...active, stepIndex: Math.max(0, Math.min(progress.currentStep, tutorial.steps.length - 1)) };
}

export function closeTutorialOverlayForAccount(active, accountScope) {
  return active?.accountScope === accountScope ? null : active;
}
