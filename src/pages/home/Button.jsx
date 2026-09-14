import { motion } from "framer-motion";
import { press, springs } from "../../lib/heyMotion";

export default function LandingButton({ children, onClick, secondary = false, type = "button", href }) {
  const className = secondary ? "hey-landing-cta secondary" : "hey-landing-cta";
  const gesture = { whileHover: { y: -2, transition: springs.snappy }, whileTap: { scale: 0.96, transition: press } };

  if (href) {
    return (
      <motion.a href={href} className={className} {...gesture}>
        {children}
      </motion.a>
    );
  }

  return (
    <motion.button type={type} onClick={onClick} className={className} {...gesture}>
      {children}
    </motion.button>
  );
}