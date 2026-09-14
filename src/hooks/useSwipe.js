import { useRef, useCallback } from "react";

export function useSwipe(onSwipe, { threshold = 50, direction = "horizontal" } = {}) {
  const start = useRef(null);
  const locked = useRef(false);
  const swipedRef = useRef(false);

  const onPointerDown = useCallback((e) => {
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    locked.current = false;
    swipedRef.current = false;
  }, []);

  const onPointerUp = useCallback((e) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    const dt = Date.now() - start.current.t;
    start.current = null;

    if (dt > 800) return;

    let outcome = null;
    if (direction === "horizontal" && Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.5) {
      outcome = dx > 0 ? "right" : "left";
    } else if (direction === "vertical" && Math.abs(dy) > threshold && Math.abs(dy) > Math.abs(dx) * 1.5) {
      outcome = dy > 0 ? "down" : "up";
    } else if (direction === "both" && Math.max(Math.abs(dx), Math.abs(dy)) > threshold) {
      outcome = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    }

    if (outcome) {
      locked.current = true;
      swipedRef.current = true;
      onSwipe?.(outcome, { dx, dy, dt });
    }
  }, [onSwipe, threshold, direction]);

  return { onPointerDown, onPointerUp, swipedRef };
}