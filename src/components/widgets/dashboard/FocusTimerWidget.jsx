import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { buzz, confirmSound } from "../../../lib/heyFeedback";
import { press, springs } from "../../../lib/heyMotion";
import {
  Timer,
  Play,
  Pause,
  RotateCcw,
  Flame,
} from "lucide-react";

export default function FocusTimerWidget() {
  const totalSeconds = 45 * 60;
  const [remaining, setRemaining] = useState(totalSeconds);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!isRunning) return undefined;
    const timer = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          setIsRunning(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = ((totalSeconds - remaining) / totalSeconds) * 100;

  return (
    <motion.div
      className="glass-card h-full p-6 flex flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, transition: springs.gentle }}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="badge badge-green mb-3 flex w-fit items-center gap-2">
            <Timer size={14} />
            Focus Timer
          </div>

          <h2 className="font-heading text-2xl text-[var(--text-primary)]">
            Deep Work
          </h2>

          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Stay locked in.
          </p>
        </div>

        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--green-primary)]/15">
          <Flame
            size={22}
            color="var(--green-accent)"
          />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div className="relative flex h-56 w-56 items-center justify-center">
          <svg
            className="absolute inset-0 h-full w-full -rotate-90"
            viewBox="0 0 220 220"
          >
            <circle
              cx="110"
              cy="110"
              r="94"
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="10"
            />

            <motion.circle
              cx="110"
              cy="110"
              r="94"
              fill="none"
              stroke="var(--green-accent)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={590}
              initial={{ strokeDashoffset: 590 }}
              animate={{
                strokeDashoffset: 590 - (590 * progress) / 100,
              }}
              transition={{ duration: 1 }}
            />
          </svg>

          <div className="text-center">
            <div className="font-heading text-5xl text-[var(--text-primary)]">
              {String(minutes).padStart(2, "0")}:
              {String(seconds).padStart(2, "0")}
            </div>

            <div className="mt-2 text-sm text-[var(--text-secondary)]">
              Focus Session
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-center gap-4">
        <motion.button
          type="button"
          aria-label="Reset focus timer"
onClick={() => { setRemaining(totalSeconds); setIsRunning(false); }}
          onPointerDown={() => buzz("light")}
          whileHover={{ scale: 1.04, transition: springs.snappy }}
          whileTap={{ scale: 0.97, transition: press }}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--bg-secondary)]"
        >
          <RotateCcw
            size={18}
            color="var(--text-secondary)"
          />
        </motion.button>

        <motion.button
          type="button"
          aria-label={isRunning ? "Pause focus timer" : "Start focus timer"}
onClick={() => {
            const current = isRunning;
            setIsRunning(!current);
            if (!current) confirmSound();
          }}
          onPointerDown={() => buzz("medium")}
          whileHover={{ scale: 1.04, transition: springs.snappy }}
          whileTap={{ scale: 0.97, transition: press }}
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--green-primary)]"
        >
{isRunning ? <Pause size={22} color="white" /> : <Play size={22} color="white" />}
        </motion.button>
      </div>
    </motion.div>
  );
}
