import { motion } from "framer-motion";

export default function ThemePreview({
  theme,
  material = "glass",
}) {
  if (!theme) return null;

  const accent = theme.accent || "#00BFFF";
  const accent2 = theme.accent2 || theme.secondary || accent;

  const materialStyles = {
    glass: {
      backdropFilter: "blur(30px)",
      WebkitBackdropFilter: "blur(30px)",
      border: `1px solid ${accent}35`,
    },
    crystal: {
      backdropFilter: "blur(18px)",
      WebkitBackdropFilter: "blur(18px)",
      border: `1px solid ${accent2}55`,
    },
    nature: {
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      border: `1px solid ${accent}30`,
    },
    futuristic: {
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      border: `1px solid ${accent}60`,
    },
    soft: {
      backdropFilter: "blur(34px)",
      WebkitBackdropFilter: "blur(34px)",
      border: `1px solid ${accent}25`,
    },
    layered: {
      backdropFilter: "blur(22px)",
      WebkitBackdropFilter: "blur(22px)",
      border: `1px solid ${accent}40`,
    },
  };

  const selectedMaterial =
    materialStyles[material] || materialStyles.glass;

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45 }}
      style={{
        position: "relative",
        minHeight: 430,
        overflow: "hidden",
        padding: 28,
        borderRadius: 30,
        background: theme.bg,
        color: theme.text || "#F5FBFF",
        boxShadow: `
          0 30px 90px rgba(0,0,0,.25),
          0 0 80px ${accent}20
        `,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 300,
          height: 300,
          top: -120,
          right: -80,
          borderRadius: "50%",
          background: accent,
          opacity: 0.18,
          filter: "blur(80px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          width: 240,
          height: 240,
          bottom: -130,
          left: -70,
          borderRadius: "50%",
          background: accent2,
          opacity: 0.12,
          filter: "blur(70px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 35,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: ".16em",
              opacity: 0.55,
            }}
          >
            LIVE PREVIEW
          </div>

          <h3
            style={{
              margin: "7px 0 0",
              fontSize: 24,
              letterSpacing: "-.04em",
            }}
          >
            {theme.name}
          </h3>
        </div>

        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: accent,
            boxShadow: `0 0 22px ${accent}`,
          }}
        />
      </div>

      <div
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns:
            "minmax(0, 1.5fr) minmax(180px, .7fr)",
          gap: 16,
        }}
      >
        <div
          style={{
            ...selectedMaterial,
            minHeight: 260,
            padding: 24,
            borderRadius: 24,
            background: `${theme.surface || "#091018"}CC`,
            boxShadow: `inset 0 1px 0 ${accent}12`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 24,
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                display: "grid",
                placeItems: "center",
                borderRadius: 11,
                background: accent,
                color: theme.bg,
                fontWeight: 900,
              }}
            >
              H
            </div>

            <div>
              <strong
                style={{
                  display: "block",
                  fontSize: 13,
                }}
              >
                HEY
              </strong>

              <span
                style={{
                  fontSize: 9,
                  opacity: 0.55,
                }}
              >
                Ready when you are.
              </span>
            </div>
          </div>

          <div
            style={{
              maxWidth: 430,
              fontSize: "clamp(25px, 4vw, 43px)",
              lineHeight: 1,
              fontWeight: 800,
              letterSpacing: "-.055em",
            }}
          >
            Intelligence
            <br />
            that feels
            <br />
            <span style={{ color: accent }}>
              like yours.
            </span>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 28,
            }}
          >
            {["Chat", "Cosmos", "Forge"].map(
              (item, index) => (
                <span
                  key={item}
                  style={{
                    padding: "8px 11px",
                    borderRadius: 10,
                    background:
                      index === 0
                        ? `${accent}20`
                        : "var(--glass-bg)",
                    border:
                      index === 0
                        ? `1px solid ${accent}35`
                        : "1px solid var(--border)",
                    color:
                      index === 0
                        ? accent
                        : "inherit",
                    fontSize: 10,
                  }}
                >
                  {item}
                </span>
              )
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 12,
          }}
        >
          {[
            ["Accent", accent],
            ["Surface", theme.surface || "#091018"],
            ["Material", material],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                ...selectedMaterial,
                padding: 17,
                borderRadius: 18,
                background: `${theme.surface || "#091018"}AA`,
              }}
            >
              <span
                style={{
                  display: "block",
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: ".12em",
                  opacity: 0.5,
                  marginBottom: 9,
                }}
              >
                {label.toUpperCase()}
              </span>

              <strong
                style={{
                  fontSize: 12,
                  textTransform:
                    label === "Material"
                      ? "capitalize"
                      : "none",
                  wordBreak: "break-word",
                }}
              >
                {value}
              </strong>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}