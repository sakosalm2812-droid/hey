import { motion } from "framer-motion";
import {
  Check,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";

export default function CustomizationControls({
  theme,
  customColor,
  onCustomColorChange,
  onReset,
}) {
  if (!theme) return null;

  const accent = theme.id === "custom"
    ? customColor
    : theme.accent;

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        padding: 26,
        borderRadius: 26,
        border: "1px solid var(--border)",
        background: "var(--glass-bg)",
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 20,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--accent)",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: ".15em",
              marginBottom: 8,
            }}
          >
            <SlidersHorizontal size={14} />
            WORLD CONTROLS
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: 25,
              letterSpacing: "-.04em",
            }}
          >
            Fine-tune your world.
          </h2>
        </div>

        <button
          type="button"
          onClick={onReset}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--glass-bg)",
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          <RotateCcw size={14} />
          Reset
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 14,
        }}
      >
        <div
          style={{
            padding: 18,
            borderRadius: 18,
            border: "1px solid var(--border)",
            background: "rgba(255,255,255,.025)",
          }}
        >
          <div
            style={{
              color: "var(--text-secondary)",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: ".12em",
              marginBottom: 13,
            }}
          >
            ACTIVE THEME
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 11,
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: accent,
                boxShadow: `0 0 20px ${accent}`,
              }}
            />

            <strong>{theme.name}</strong>

            <Check
              size={15}
              style={{
                marginLeft: "auto",
                color: accent,
              }}
            />
          </div>
        </div>

        <div
          style={{
            padding: 18,
            borderRadius: 18,
            border: "1px solid var(--border)",
            background: "rgba(255,255,255,.025)",
          }}
        >
          <div
            style={{
              color: "var(--text-secondary)",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: ".12em",
              marginBottom: 13,
            }}
          >
            ACCENT COLOR
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <input
              type="color"
              value={accent}
              disabled={theme.id !== "custom"}
              aria-label="Custom accent color"
              onChange={(event) =>
                onCustomColorChange(
                  event.target.value
                )
              }
              style={{
                width: 42,
                height: 42,
                padding: 3,
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--glass-bg)",
                cursor:
                  theme.id === "custom"
                    ? "pointer"
                    : "not-allowed",
                opacity:
                  theme.id === "custom" ? 1 : 0.45,
              }}
              aria-label="HEY accent color"
            />

            <div>
              <strong
                style={{
                  display: "block",
                  fontFamily: "monospace",
                  fontSize: 13,
                }}
              >
                {accent.toUpperCase()}
              </strong>

              <span
                style={{
                  display: "block",
                  marginTop: 4,
                  color: "var(--text-secondary)",
                  fontSize: 11,
                }}
              >
                {theme.id === "custom"
                  ? "Custom accent"
                  : "Controlled by theme"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}