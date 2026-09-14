import { useRef, useCallback } from "react";

export function useDoubleTap(callback, { delay = 300 } = {}) {
  const lastTap = useRef(0);

  const handler = useCallback((e) => {
    const now = Date.now();
    if (now - lastTap.current < delay) {
      callback?.(e);
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  }, [callback, delay]);

  return { onClick: handler };
}
