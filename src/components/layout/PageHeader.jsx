import { motion } from "framer-motion";

export default function PageHeader({
  title,
  subtitle,
  action,
  icon,
}) {
  return (
    <motion.header
      initial={{
        opacity: 0,
        y: 10,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      transition={{
        duration: 0.35,
      }}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",

        marginBottom: 40,

        gap: 20,
      }}
    >
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          {icon && (
            <div
              style={{
                display: "grid",
                placeItems: "center",
                width: 44,
                height: 44,
                borderRadius: 16,
                background: "rgba(255,255,255,.06)",
                border: "1px solid rgba(255,255,255,.1)",
              }}
            >
              {icon}
            </div>
          )}

          <h1
            style={{
              margin: 0,

              fontSize: 46,

              fontWeight: 400,

              letterSpacing: "-0.03em",

              fontFamily:
                "var(--font-heading)",
            }}
          >
            {title}
          </h1>
        </div>

        {subtitle && (
          <p
            style={{
              marginTop: 10,

              marginBottom: 0,

              color:
                "var(--text-secondary)",

              fontSize: 15,

              lineHeight: 1.6,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>


      {action && (
        <div>
          {action}
        </div>
      )}

    </motion.header>
  );
}