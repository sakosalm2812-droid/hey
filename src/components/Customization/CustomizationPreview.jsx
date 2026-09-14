import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export default function CustomizationPreview({
  theme,
}) {
  if (!theme) return null;

  const accent = theme.accent;
  const secondary = theme.secondary || theme.accent2;

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      style={{
        position: "relative",
        minHeight: 420,
        overflow: "hidden",
        marginBottom: 45,
        borderRadius: 32,
        border: `1px solid ${accent}35`,
        background: `
          radial-gradient(
            circle at 75% 20%,
            ${accent}35,
            transparent 32%
          ),
          radial-gradient(
            circle at 20% 90%,
            ${secondary}20,
            transparent 35%
          ),
          ${theme.bg}
        `,
        boxShadow: `0 0 80px ${accent}18`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(135deg, rgba(255,255,255,.07), rgba(255,255,255,.015))",
          backdropFilter: "blur(35px)",
          WebkitBackdropFilter: "blur(35px)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          minHeight: 420,
          padding: "45px clamp(24px, 6vw, 70px)",
          display: "grid",
          gridTemplateColumns:
            "minmax(0, 1.3fr) minmax(240px, .7fr)",
          gap: 40,
          alignItems: "center",
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 11px",
              marginBottom: 24,
              borderRadius: 999,
              border: `1px solid ${accent}35`,
              background: `${accent}12`,
              color: accent,
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: ".14em",
            }}
          >
            <Sparkles size={13} />
            LIVE PREVIEW
          </div>

          <h2
            style={{
              margin: 0,
              maxWidth: 650,
              fontSize: "clamp(42px, 6vw, 82px)",
              lineHeight: 0.95,
              letterSpacing: "-.065em",
              fontWeight: 800,
            }}
          >
            This is
            <br />
            your HEY.
          </h2>

          <p
            style={{
              maxWidth: 520,
              margin: "22px 0 0",
              color: theme.muted || "var(--text-secondary)",
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            Every color, surface, glow, and visual detail
            can become part of your world.
          </p>
        </div>

        <motion.div
          animate={{
            y: [0, -8, 0],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            minHeight: 230,
            borderRadius: 28,
            border: `1px solid ${accent}45`,
            background: `
              radial-gradient(
                circle at 50% 35%,
                ${accent}30,
                transparent 45%
              ),
              rgba(255,255,255,.045)
            `,
            backdropFilter: "blur(25px)",
            WebkitBackdropFilter: "blur(25px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `
              inset 0 1px 0 rgba(255,255,255,.08),
              0 0 60px ${accent}20
            `,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              display: "grid",
              placeItems: "center",
              borderRadius: 22,
              background: accent,
              color: theme.bg,
              fontSize: 38,
              fontWeight: 900,
              boxShadow: `0 0 45px ${accent}90`,
            }}
          >
            H
          </div>

          <strong
            style={{
              marginTop: 20,
              fontSize: 22,
              letterSpacing: "-.04em",
            }}
          >
            HEY
          </strong>

          <span
            style={{
              marginTop: 6,
              fontSize: 10,
              color: theme.muted || "var(--text-secondary)",
              letterSpacing: ".14em",
              textTransform: "uppercase",
            }}
          >
            {theme.name} world
          </span>
        </motion.div>
      </div>

      <div
        style={{
          position: "absolute",
          width: 260,
          height: 260,
          right: -100,
          bottom: -120,
          borderRadius: "50%",
          background: accent,
          opacity: 0.08,
          filter: "blur(70px)",
        }}
      />
    </motion.section>
  );
}