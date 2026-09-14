import { useState, useRef, useCallback } from "react";

export function usePullToRefresh(onRefresh, { threshold = 80, resistance = 2.5 } = {}) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const containerRef = useRef(null);

  const onTouchStart = useCallback((e) => {
    if (refreshing) return;
    const el = containerRef.current;
    if (el && el.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
  }, [refreshing]);

  const onTouchMove = useCallback((e) => {
    if (startY.current === null || refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) {
      setPullDistance(Math.min(dy / resistance, threshold * 1.5));
    }
  }, [refreshing, resistance, threshold]);

  const onTouchEnd = useCallback(async () => {
    if (startY.current === null) return;
    startY.current = null;
    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      try {
        await onRefresh?.();
      } catch { /* swallow */ }
      setRefreshing(false);
    }
    setPullDistance(0);
  }, [pullDistance, threshold, refreshing, onRefresh]);

  const progress = Math.min(pullDistance / threshold, 1);

  return {
    containerRef,
    pullDistance,
    refreshing,
    progress,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
