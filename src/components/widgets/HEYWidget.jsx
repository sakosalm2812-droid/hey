import { motion } from "framer-motion";
import { springs } from "../../lib/heyMotion";

export default function HEYWidget({
  title,
  subtitle,
  icon,
  children,
  size = "normal",
  style = {},
}) {
  const sizes = {
    small: {
      minHeight: 140,
    },

    normal: {
      minHeight: 220,
    },

    large: {
      minHeight: 340,
    },
  };

  return (
    <motion.section
      initial={{
        opacity: 0,
        y: 12,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      whileHover={{
        y: -4,
        transition: springs.gentle,
      }}
      transition={{
        duration: 0.3,
        ease: [0.22, 1, 0.36, 1],
      }}
      style={{
        background:
          "var(--glass-bg)",

        backdropFilter:
          "blur(24px)",

        WebkitBackdropFilter:
          "blur(24px)",

        border:
          "1px solid var(--border)",

        borderRadius: 28,

        padding: 24,

        boxShadow:
          "0 18px 60px rgba(0,0,0,.25)",

        overflow: "hidden",

        ...sizes[size],

        ...style,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,

          marginBottom: 20,
        }}
      >
        {icon && (
          <div>
            {icon}
          </div>
        )}

        <div>
          <h3
            style={{
              margin: 0,

              fontSize: 18,

              fontWeight: 600,

              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </h3>

          {subtitle && (
            <p
              style={{
                margin: "6px 0 0",

                color:
                  "var(--text-secondary)",

                fontSize: 13,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </header>


      <div>
        {children}
      </div>

    </motion.section>
  );
}