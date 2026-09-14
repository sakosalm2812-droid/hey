import { motion } from "framer-motion";
import {
  Globe2,
  Sparkles,
  Layers3,
  Palette,
} from "lucide-react";

const worldParts = [
  {
    icon: Globe2,
    title: "Environment",
    text: "Shape the visual atmosphere surrounding your HEY experience.",
  },
  {
    icon: Layers3,
    title: "Surfaces",
    text: "Control the depth, glass, blur, and material language.",
  },
  {
    icon: Palette,
    title: "Color",
    text: "Build a color identity that follows your world everywhere.",
  },
  {
    icon: Sparkles,
    title: "Effects",
    text: "Bring your interface alive with controlled glow and motion.",
  },
];

export default function CustomizationWorld({
  theme,
}) {
  const accent = theme?.accent || "var(--accent)";
  const secondary =
    theme?.secondary ||
    theme?.accent2 ||
    accent;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        position: "relative",
        overflow: "hidden",
        marginTop: 30,
        padding: "34px",
        borderRadius: 30,
        border: `1px solid ${accent}30`,
        background: `
          radial-gradient(
            circle at 85% 15%,
            ${accent}20,
            transparent 32%
          ),
          radial-gradient(
            circle at 10% 90%,
            ${secondary}14,
            transparent 35%
          ),
          var(--glass-bg)
        `,
        backdropFilter: "blur(30px)",
        WebkitBackdropFilter: "blur(30px)",
      }}
    >
      <div
        style={{
          position: "relative",
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            color: accent,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: ".16em",
            marginBottom: 10,
          }}
        >
          <Globe2 size={15} />
          YOUR WORLD
        </div>

        <h2
          style={{
            margin: 0,
            fontSize: "clamp(28px, 4vw, 46px)",
            letterSpacing: "-.055em",
          }}
        >
          Make every layer feel like HEY.
        </h2>

        <p
          style={{
            maxWidth: 650,
            margin: "14px 0 30px",
            color:
              theme?.muted ||
              "var(--text-secondary)",
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          Customization isn't just about changing a
          color. It's about creating an entire visual
          environment that follows you throughout HEY.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 12,
          }}
        >
          {worldParts.map((part, index) => {
            const Icon = part.icon;

            return (
              <motion.div
                key={part.title}
                whileHover={{ y: -5 }}
                transition={{
                  duration: 0.2,
                }}
                style={{
                  padding: 19,
                  minHeight: 145,
                  borderRadius: 20,
                  border:
                    "1px solid var(--border)",
                  background:
                    "rgba(255,255,255,.025)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent:
                      "space-between",
                    marginBottom: 18,
                  }}
                >
                  <Icon
                    size={21}
                    style={{
                      color: accent,
                    }}
                  />

                  <span
                    style={{
                      color:
                        "var(--text-secondary)",
                      fontSize: 9,
                      fontFamily:
                        "monospace",
                      opacity: 0.55,
                    }}
                  >
                    {String(index + 1).padStart(
                      2,
                      "0"
                    )}
                  </span>
                </div>

                <strong
                  style={{
                    display: "block",
                    fontSize: 14,
                    marginBottom: 7,
                  }}
                >
                  {part.title}
                </strong>

                <span
                  style={{
                    display: "block",
                    color:
                      "var(--text-secondary)",
                    fontSize: 11,
                    lineHeight: 1.55,
                  }}
                >
                  {part.text}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>

      <motion.div
        animate={{
          scale: [1, 1.08, 1],
          opacity: [0.08, 0.14, 0.08],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{
          position: "absolute",
          width: 280,
          height: 280,
          right: -110,
          bottom: -150,
          borderRadius: "50%",
          background: accent,
          filter: "blur(75px)",
          pointerEvents: "none",
        }}
      />
    </motion.section>
  );
}