import { motion } from "framer-motion";
import { springs } from "../lib/heyMotion";

export default function ScrollReveal({ children, className = "", delay = 0, y = 24 }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{ ...springs.gentle, delay }}
    >
      {children}
    </motion.div>
  );
}