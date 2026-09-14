import { motion } from "framer-motion";
import {
  Droplets,
  Gem,
  Leaf,
  Cpu,
  Circle,
  Layers3,
} from "lucide-react";

const materials = [
  {
    id: "glass",
    icon: Droplets,
    name: "Glass",
    description: "Clear, soft, and translucent.",
  },
  {
    id: "crystal",
    icon: Gem,
    name: "Crystal",
    description: "Sharper edges with luminous depth.",
  },
  {
    id: "nature",
    icon: Leaf,
    name: "Nature",
    description: "Organic surfaces inspired by the natural world.",
  },
  {
    id: "futuristic",
    icon: Cpu,
    name: "Futuristic",
    description: "Precise, technological, and advanced.",
  },
  {
    id: "soft",
    icon: Circle,
    name: "Soft",
    description: "Rounded surfaces with gentle depth.",
  },
  {
    id: "layered",
    icon: Layers3,
    name: "Layered",
    description: "Distinct visual layers with stronger separation.",
  },
];

export default function CustomizationMaterials({
  material = "glass",
  onMaterialChange,
  theme,
}) {
  const accent = theme?.accent || "var(--accent)";

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
      <div style={{ marginBottom: 25 }}>
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
          <Layers3 size={14} />
          MATERIAL SYSTEM
        </div>

        <h2
          style={{
            margin: 0,
            fontSize: "clamp(25px, 3vw, 38px)",
            letterSpacing: "-.05em",
          }}
        >
          Choose how HEY feels.
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
          Materials control the visual language of
          surfaces, cards, panels, and interactive elements.
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
        {materials.map((item) => {
          const Icon = item.icon;
          const active = material === item.id;

          return (
            <motion.button
              key={item.id}
              type="button"
              onClick={() =>
                onMaterialChange?.(item.id)
              }
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
                  width: 100,
                  height: 100,
                  right: -35,
                  top: -35,
                  borderRadius: "50%",
                  background: accent,
                  opacity: active ? 0.12 : 0.035,
                  filter: "blur(20px)",
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
                {item.name}
              </strong>

              <span
                style={{
                  position: "relative",
                  display: "block",
                  maxWidth: 210,
                  color: "var(--text-secondary)",
                  fontSize: 11,
                  lineHeight: 1.6,
                }}
              >
                {item.description}
              </span>

              {active && (
                <motion.span
                  layoutId="material-indicator"
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