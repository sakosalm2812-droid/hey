import { motion } from "framer-motion";
import { press, springs } from "../../lib/heyMotion";
import styles from "./HEYButton.module.css";

export default function HEYButton({
  children,
  variant = "primary",
  icon,
  onClick,
}) {

  return (

    <motion.button

      onClick={onClick}

      className={`${styles.button} ${styles[variant]}`}

      whileHover={{
        y: -3,
        scale: 1.02,
        transition: springs.snappy,
      }}

      whileTap={{
        scale: 0.97,
        transition: press,
      }}

    >

      {children}

      {icon && (
        <span className={styles.icon}>
          {icon}
        </span>
      )}

    </motion.button>

  );
}