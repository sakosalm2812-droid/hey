import { motion } from "framer-motion";
import { springs } from "../../lib/heyMotion";

export default function HEYCard({
  children,
  padding = 28,
  hover = true,
  style = {},
}) {
  return (
    <motion.div
      whileHover={
        hover
          ? { y: -4, transition: springs.gentle }
          : undefined
      }
      style={{
        background:
          "var(--glass-bg)",

        border:
          "1px solid var(--border)",

        backdropFilter:
          "blur(24px)",

        WebkitBackdropFilter:
          "blur(24px)",

        borderRadius: 28,

        padding,

        boxShadow:
          "0 20px 60px rgba(0,0,0,.25)",

        ...style,
      }}
    >
      {children}
    </motion.div>
  );
}