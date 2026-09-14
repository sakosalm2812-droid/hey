import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const IDLE_AFTER = 3 * 60 * 1000;

export default function IdleScreensaver() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let idleTimer;

    const resetIdle = () => {
      setVisible(false);
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setVisible(true), IDLE_AFTER);
    };

    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, resetIdle, { passive: true }));
    resetIdle();

    return () => {
      window.clearTimeout(idleTimer);
      events.forEach((eventName) => window.removeEventListener(eventName, resetIdle));
    };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="hey-idle-scene"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: "easeInOut" }}
          onPointerDown={() => setVisible(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setVisible(false);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Return to HEY"
        >
          <div className="hey-idle-stars" aria-hidden="true" />
          <div className="hey-idle-orbit hey-idle-orbit-one" aria-hidden="true" />
          <div className="hey-idle-orbit hey-idle-orbit-two" aria-hidden="true" />
          <motion.div
            className="hey-idle-sun"
            animate={{ scale: [1, 1.04, 1], opacity: [0.72, 1, 0.72] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden="true"
          />
          <motion.div
            className="hey-idle-copy"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 1.2 }}
          >
            <span className="hey-script">HEY</span>
            <small>still here when you are ready</small>
          </motion.div>
          <div className="hey-idle-hint">Move or click to return</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
