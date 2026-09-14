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
    name: "Glass",
    icon: Droplets,
    description: "Transparent surfaces with soft depth.",
  },
  {
    id: "crystal",
    name: "Crystal",
    icon: Gem,
    description: "Sharp luminous surfaces and stronger highlights.",
  },
  {
    id: "nature",
    name: "Nature",
    icon: Leaf,
    description: "Organic textures and natural atmosphere.",
  },
  {
    id: "futuristic",
    name: "Futuristic",
    icon: Cpu,
    description: "Technical surfaces with a precise digital feel.",
  },
  {
    id: "soft",
    name: "Soft",
    icon: Circle,
    description: "Rounded, calm surfaces with gentle depth.",
  },
  {
    id: "layered",
    name: "Layered",
    icon: Layers3,
    description: "Clear visual hierarchy through multiple layers.",
  },
];

export default function MaterialGallery({
  selectedMaterial = "glass",
  onSelect,
  theme,
}) {
  const accent = theme?.accent || "var(--accent)";

  return (
    <section
      style={{
        marginTop: 30,
      }}
    >
      <div
        style={{
          marginBottom: 18,
        }}
      >
        <div
          style={{
            color: accent,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: ".16em",
            marginBottom: 8,
          }}
        >
          MATERIAL GALLERY
        </div>

        <h2
          style={{
            margin: 0,
            fontSize: 28,
            letterSpacing: "-.045em",
          }}
        >
          Pick the surface language.
        </h2>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        {materials.map((material) => {
          const Icon = material.icon;
          const active =
            selectedMaterial === material.id;

          return (
            <motion.button
              key={material.id}
              type="button"
              onClick={() =>
                onSelect?.(material.id)
              }
              whileHover={{ y: -5 }}
              whileTap={{ scale: 0.985 }}
              style={{
                position: "relative",
                minHeight: 180,
                overflow: "hidden",
                padding: 20,
                borderRadius: 22,
                border: active
                  ? `1px solid ${accent}`
                  : "1px solid var(--border)",
                background: active
                  ? `radial-gradient(circle at 80% 20%, ${accent}18, transparent 42%), var(--glass-bg)`
                  : "var(--glass-bg)",
                color: "var(--text-primary)",
                textAlign: "left",
                cursor: "pointer",
                boxShadow: active
                  ? `0 0 35px ${accent}18`
                  : "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,.05), transparent 55%)",
                  pointerEvents: "none",
                }}
              />

              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 30,
                }}
              >
                <Icon
                  size={24}
                  style={{
                    color: accent,
                  }}
                />

                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: active
                      ? accent
                      : "transparent",
                    border: `1px solid ${
                      active
                        ? accent
                        : "var(--border)"
                    }`,
                    boxShadow: active
                      ? `0 0 14px ${accent}`
                      : "none",
                  }}
                />
              </div>

              <strong
                style={{
                  position: "relative",
                  display: "block",
                  fontSize: 15,
                  marginBottom: 7,
                }}
              >
                {material.name}
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
                {material.description}
              </span>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}