import { motion } from "framer-motion";
import {
  Sun,
  Moon,
  Sparkles,
  Waves,
} from "lucide-react";

const atmosphereModes = [
  {
    id: "calm",
    icon: Moon,
    title: "Calm",
    description: "Soft, quiet, and focused.",
  },
  {
    id: "balanced",
    icon: Waves,
    title: "Balanced",
    description: "The default HEY atmosphere.",
  },
  {
    id: "energetic",
    icon: Sparkles,
    title: "Energetic",
    description: "Brighter and more expressive.",
  },
  {
    id: "bright",
    icon: Sun,
    title: "Bright",
    description: "Open, vivid, and optimistic.",
  },
];

export default function CustomizationAtmosphere({
  atmosphere = "balanced",
  onAtmosphereChange,
  theme,
}) {
  const accent =
    theme?.accent || "var(--accent)";

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        marginTop: 30,
        padding: 28,
        borderRadius: 28,
        border: "1px solid var(--border)",
        background: "var(--glass-bg)",
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
      }}
    >
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: accent,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: ".16em",
            marginBottom: 9,
          }}
        >
          <Sparkles size={14} />
          ATMOSPHERE
        </div>

        <h2
          style={{
            margin: 0,
            fontSize: "clamp(25px, 3vw, 38px)",
            letterSpacing: "-.05em",
          }}
        >
          How should HEY feel?
        </h2>

        <p
          style={{
            maxWidth: 620,
            margin: "11px 0 0",
            color: "var(--text-secondary)",
            fontSize: 13,
            lineHeight: 1.65,
          }}
        >
          Choose the overall emotional and visual
          energy of your interface.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        {atmosphereModes.map((mode) => {
          const Icon = mode.icon;
          const active =
            atmosphere === mode.id;

          return (
            <motion.button
              key={mode.id}
              type="button"
              onClick={() =>
                onAtmosphereChange?.(mode.id)
              }
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              style={{
                position: "relative",
                minHeight: 145,
                padding: 19,
                borderRadius: 20,
                border: active
                  ? `1px solid ${accent}`
                  : "1px solid var(--border)",
                background: active
                  ? `${accent}10`
                  : "rgba(255,255,255,.025)",
                color: "var(--text-primary)",
                textAlign: "left",
                cursor: "pointer",
                boxShadow: active
                  ? `0 0 30px ${accent}18`
                  : "none",
              }}
            >
              <Icon
                size={22}
                style={{
                  color: accent,
                  marginBottom: 20,
                }}
              />

              <strong
                style={{
                  display: "block",
                  fontSize: 14,
                  marginBottom: 6,
                }}
              >
                {mode.title}
              </strong>

              <span
                style={{
                  display: "block",
                  color: "var(--text-secondary)",
                  fontSize: 11,
                  lineHeight: 1.55,
                }}
              >
                {mode.description}
              </span>

              {active && (
                <motion.span
                  layoutId="atmosphere-indicator"
                  style={{
                    position: "absolute",
                    top: 15,
                    right: 15,
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: accent,
                    boxShadow: `0 0 14px ${accent}`,
                  }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </motion.section>
  );
}