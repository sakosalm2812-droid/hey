import { motion } from "framer-motion";
import {
  Sparkles,
  Zap,
  Waves,
  Wind,
  Eye,
  CircleDot,
} from "lucide-react";

const effects = [
  {
    id: "glow",
    icon: Sparkles,
    name: "Ambient Glow",
    description: "Soft light surrounding important interface elements.",
  },
  {
    id: "pulse",
    icon: Zap,
    name: "Pulse",
    description: "Subtle energy pulses around active states.",
  },
  {
    id: "fluid",
    icon: Waves,
    name: "Fluid Motion",
    description: "Smooth flowing transitions between interface states.",
  },
  {
    id: "drift",
    icon: Wind,
    name: "Drift",
    description: "Slow atmospheric movement across your world.",
  },
  {
    id: "focus",
    icon: Eye,
    name: "Focus",
    description: "Bring attention toward the element you're using.",
  },
  {
    id: "particles",
    icon: CircleDot,
    name: "Particles",
    description: "Small ambient particles add depth to the environment.",
  },
];

export default function CustomizationEffects({
  enabledEffects = [],
  onEffectsChange,
  theme,
}) {
  const accent = theme?.accent || "var(--accent)";

  const toggleEffect = (effectId) => {
    const enabled = enabledEffects.includes(effectId);

    const nextEffects = enabled
      ? enabledEffects.filter((id) => id !== effectId)
      : [...enabledEffects, effectId];

    onEffectsChange?.(nextEffects);
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
          marginBottom: 25,
        }}
      >
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
          EFFECTS
        </div>

        <h2
          style={{
            margin: 0,
            fontSize: "clamp(25px, 3vw, 38px)",
            letterSpacing: "-.05em",
          }}
        >
          Bring your world alive.
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
          Choose the motion and atmosphere that make
          your HEY experience feel alive.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 12,
        }}
      >
        {effects.map((effect) => {
          const Icon = effect.icon;
          const active = enabledEffects.includes(effect.id);

          return (
            <motion.button
              key={effect.id}
              type="button"
              onClick={() => toggleEffect(effect.id)}
              whileHover={{ y: -5 }}
              whileTap={{ scale: 0.98 }}
              style={{
                position: "relative",
                minHeight: 165,
                padding: 20,
                overflow: "hidden",
                borderRadius: 21,
                border: active
                  ? `1px solid ${accent}`
                  : "1px solid var(--border)",
                background: active
                  ? `${accent}0D`
                  : "rgba(255,255,255,.025)",
                color: "var(--text-primary)",
                textAlign: "left",
                cursor: "pointer",
                boxShadow: active
                  ? `0 0 32px ${accent}18`
                  : "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  width: 110,
                  height: 110,
                  right: -40,
                  top: -40,
                  borderRadius: "50%",
                  background: accent,
                  opacity: active ? 0.13 : 0.035,
                  filter: "blur(24px)",
                  pointerEvents: "none",
                }}
              />

              <Icon
                size={23}
                style={{
                  position: "relative",
                  color: accent,
                  marginBottom: 24,
                }}
              />

              <strong
                style={{
                  position: "relative",
                  display: "block",
                  fontSize: 14,
                  marginBottom: 7,
                }}
              >
                {effect.name}
              </strong>

              <span
                style={{
                  position: "relative",
                  display: "block",
                  color: "var(--text-secondary)",
                  fontSize: 11,
                  lineHeight: 1.6,
                }}
              >
                {effect.description}
              </span>

              <span
                style={{
                  position: "absolute",
                  top: 18,
                  right: 18,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  border: `1px solid ${active ? accent : "var(--border)"}`,
                  background: active
                    ? accent
                    : "transparent",
                  boxShadow: active
                    ? `0 0 14px ${accent}`
                    : "none",
                }}
              />

              {active && (
                <motion.span
                  layoutId={`effect-${effect.id}`}
                  style={{
                    position: "absolute",
                    left: 20,
                    bottom: 14,
                    width: 30,
                    height: 3,
                    borderRadius: 999,
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