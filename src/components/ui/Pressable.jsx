import { motion } from "framer-motion";
import { buzz, tapSound } from "../../lib/heyFeedback";
import { press } from "../../lib/heyMotion";

export default function Pressable({
  as = "button",
  haptic = "light",
  sound = false,
  scale = 0.97,
  whileTap,
  onPointerDown,
  children,
  ...props
}) {
  const Comp = motion[as];

  const handlePointerDown = (e) => {
    buzz(haptic);
    if (sound) tapSound();
    onPointerDown?.(e);
  };

  return (
    <Comp
      onPointerDown={handlePointerDown}
      whileTap={{ scale, ...(whileTap || {}) }}
      transition={press}
      {...props}
    >
      {children}
    </Comp>
  );
}