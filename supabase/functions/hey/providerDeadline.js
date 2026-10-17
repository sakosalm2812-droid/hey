export function remainingProviderTimeMs(deadline, now = Date.now(), limitMs = 18_000) {
  if (!Number.isFinite(deadline) || !Number.isFinite(now) || !Number.isFinite(limitMs) || limitMs <= 0) return 0;
  return Math.max(0, Math.min(limitMs, deadline - now));
}
