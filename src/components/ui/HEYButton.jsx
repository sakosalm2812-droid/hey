import { motion } from "framer-motion";
import { springs, press } from "../../lib/heyMotion";

export default function HEYButton({
  children,
  onClick,
  variant = "primary",
  size = "md",
  icon,
  disabled = false,
  fullWidth = false,
  style = {},
  type = "button",
  ...props
}) {
  const variants = {
    primary: {
      background:
        "var(--accent)",
      color: "var(--on-accent)",
      border: "1px solid var(--border)",
    },

    secondary: {
      background: "rgba(255,255,255,.06)",
      color: "var(--text-primary)",
      border: "1px solid var(--border)",
      backdropFilter: "blur(18px)",
    },

    ghost: {
      background: "transparent",
      color: "var(--text-primary)",
      border: "1px solid var(--border)",
    },

    gold: {
      background:
        "linear-gradient(135deg,#F7C96F,#D8AA4F)",
      color: "#111",
      border: "none",
    },
  };

  const sizes = {
    sm: {
      padding: "8px 14px",
      fontSize: 13,
    },

    md: {
      padding: "12px 20px",
      fontSize: 15,
    },

    lg: {
      padding: "16px 28px",
      fontSize: 16,
    },
  };

  return (
    <motion.button
      {...props}
      type={type}
      whileHover={{
        scale: 1.02,
        y: -2,
        transition: springs.snappy,
      }}
      whileTap={{
        scale: 0.97,
        transition: press,
      }}
      disabled={disabled}
      onClick={onClick}
      style={{
        borderRadius: 18,
        cursor: disabled
          ? "not-allowed"
          : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        fontWeight: 600,
        fontFamily: "inherit",
        transition:
          "background-color .25s var(--ease), border-color .25s var(--ease)",
        width: fullWidth ? "100%" : "auto",
        opacity: disabled ? .45 : 1,
        ...sizes[size],
        ...variants[variant],
        ...style,
      }}
    >
      {icon}

      {children}
    </motion.button>
  );
}