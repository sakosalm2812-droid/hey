import { useReducedMotion } from "framer-motion";

export const springs = {
  snappy: { type: "spring", stiffness: 300, damping: 30, mass: 1 },
  gentle: { type: "spring", stiffness: 120, damping: 20, mass: 1 },
  heavy: { type: "spring", stiffness: 280, damping: 28, mass: 1 },
  playful: { type: "spring", stiffness: 180, damping: 17, mass: 1 },
};

export const press = {
  type: "tween",
  duration: 0.08,
  ease: [0.4, 0, 0.2, 1],
};

export const durations = {
  instant: 0.15,
  quick: 0.3,
  flow: 0.5,
  bounce: 0.6,
};

export const easeOut = [0.22, 1, 0.36, 1];

export const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, ...springs.gentle },
  }),
};

export const stagger = (staggerBy = 0.05, delayChildren = 0) => ({
  hidden: {},
  show: {
    transition: { staggerChildren: staggerBy, delayChildren },
  },
});

export function useMotion(transition) {
  const reduced = useReducedMotion();
  if (!reduced) return transition ?? springs.gentle;
  const base =
    transition && typeof transition === "object" ? transition : {};
  return { ...base, duration: 0.01 };
}