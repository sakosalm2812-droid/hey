import { useRef, useCallback } from "react";

export function useLongPress(callback, { delay = 500 } = {}) {
  const timerRef = useRef(null);
  const pending = useRef(false);

  const start = useCallback((e) => {
    pending.current = true;
    timerRef.current = setTimeout(() => {
      if (pending.current) {
        callback?.(e);
      }
    }, delay);
  }, [callback, delay]);

  const stop = useCallback(() => {
    pending.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onPointerDown: start,
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
  };
}
