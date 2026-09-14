import { useRef, useCallback } from "react";

export function usePinch(onPinch, { threshold = 0.1 } = {}) {
  const distRef = useRef(null);

  const getDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const onTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      distRef.current = getDistance(e.touches);
    }
  }, []);

  const onTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && distRef.current !== null) {
      const newDist = getDistance(e.touches);
      const scale = newDist / distRef.current;
      if (Math.abs(scale - 1) > threshold) {
        onPinch?.(scale > 1 ? "out" : "in", { scale });
        distRef.current = newDist;
      }
    }
  }, [onPinch, threshold]);

  const onTouchEnd = useCallback(() => {
    distRef.current = null;
  }, []);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
