import { motion } from "framer-motion";
import { Palette, RotateCcw } from "lucide-react";

const presets = [
  { name: "Cyan", color: "#00BFFF" },
  { name: "Violet", color: "#A78BFA" },
  { name: "Emerald", color: "#34D399" },
  { name: "Amber", color: "#F59E0B" },
  { name: "Rose", color: "#F472B6" },
  { name: "Red", color: "#F87171" },
  { name: "Lime", color: "#84CC16" },
  { name: "White", color: "var(--text-primary)" },
];

export default function ColorCustomizer({
  value = "#00BFFF",
  onChange,
}) {
  const updateColor = (color) => {
    onChange?.(color);
  };

  const reset = () => {
    updateColor("#00BFFF");
  };

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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 20,
          marginBottom: 26,
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
              letterSpacing: ".16em",
              marginBottom: 9,
            }}
          >
            <Palette size={14} />
            COLOR SYSTEM
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: "clamp(25px, 3vw, 38px)",
              letterSpacing: "-.05em",
            }}
          >
            Choose your color.
          </h2>

          <p
            style={{
              maxWidth: 600,
              margin: "11px 0 0",
              color: "var(--text-secondary)",
              fontSize: 13,
              lineHeight: 1.65,
            }}
          >
            Control the accent color that defines your
            HEY experience.
          </p>
        </div>

        <button
          type="button"
          onClick={reset}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "9px 13px",
            borderRadius: 11,
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
            "repeat(auto-fit, minmax(145px, 1fr))",
          gap: 10,
        }}
      >
        {presets.map((preset) => {
          const active =
            value.toUpperCase() ===
            preset.color.toUpperCase();

          return (
            <motion.button
              key={preset.color}
              type="button"
              onClick={() =>
                updateColor(preset.color)
              }
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                minHeight: 58,
                padding: "10px 13px",
                borderRadius: 15,
                border: active
                  ? `1px solid ${preset.color}`
                  : "1px solid var(--border)",
                background: active
                  ? `${preset.color}12`
                  : "rgba(255,255,255,.025)",
                color: "var(--text-primary)",
                cursor: "pointer",
                textAlign: "left",
                boxShadow: active
                  ? `0 0 25px ${preset.color}20`
                  : "none",
              }}
            >
              <span
                style={{
                  width: 25,
                  height: 25,
                  flexShrink: 0,
                  borderRadius: "50%",
                  background: preset.color,
                  border:
                    preset.color === "#FFFFFF"
                      ? "1px solid rgba(0,0,0,.15)"
                      : "none",
                  boxShadow:
                    `0 0 18px ${preset.color}80`,
                }}
              />

              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {preset.name}
              </span>
            </motion.button>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginTop: 18,
          padding: 14,
          borderRadius: 17,
          border: "1px solid var(--border)",
          background: "rgba(255,255,255,.025)",
        }}
      >
        <input
          type="color"
          value={value}
          aria-label="Pick theme color"
          onChange={(event) =>
            updateColor(event.target.value)
          }
          style={{
            width: 45,
            height: 45,
            padding: 0,
            border: 0,
            borderRadius: 12,
            background: "transparent",
            cursor: "pointer",
          }}
          aria-label="Choose custom HEY accent color"
        />

        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: ".12em",
              color: "var(--text-secondary)",
              marginBottom: 5,
            }}
          >
            CUSTOM COLOR
          </div>

          <strong
            style={{
              fontFamily: "monospace",
              fontSize: 13,
            }}
          >
            {value.toUpperCase()}
          </strong>
        </div>
      </div>
    </motion.section>
  );
}