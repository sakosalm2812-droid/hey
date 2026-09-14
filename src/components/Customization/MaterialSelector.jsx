import { motion } from "framer-motion";

import { press, springs } from "../../lib/heyMotion";
import {
  Droplets,
  Gem,
  Leaf,
  Cpu,
  Cloud,
  Layers3,
} from "lucide-react";

const materials = [
  {
    id: "glass",
    name: "Glass",
    description: "Clean, transparent, and fluid.",
    icon: Droplets,
  },
  {
    id: "crystal",
    name: "Crystal",
    description: "Sharper reflections and luminous depth.",
    icon: Gem,
  },
  {
    id: "nature",
    name: "Nature",
    description: "Organic, calm, and atmospheric.",
    icon: Leaf,
  },
  {
    id: "futuristic",
    name: "Futuristic",
    description: "Precise, technical, and energetic.",
    icon: Cpu,
  },
  {
    id: "soft",
    name: "Soft",
    description: "Smooth surfaces with subtle depth.",
    icon: Cloud,
  },
  {
    id: "layered",
    name: "Layered",
    description: "Stacked surfaces and stronger dimension.",
    icon: Layers3,
  },
];

export default function MaterialSelector({
  value = "glass",
  onChange,
}) {
  return (
    <section>
      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            color: "var(--accent)",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: ".16em",
            marginBottom: 7,
          }}
        >
          MATERIAL SYSTEM
        </div>

        <h2
          style={{
            margin: 0,
            fontSize: 28,
            letterSpacing: "-.04em",
          }}
        >
          Choose how HEY feels.
        </h2>

        <p
          style={{
            margin: "9px 0 0",
            color: "var(--text-secondary)",
            fontSize: 13,
          }}
        >
          Change the visual material used across your HEY
          experience.
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
        {materials.map((material) => {
          const Icon = material.icon;
          const active = value === material.id;

          return (
            <motion.button
              key={material.id}
              type="button"
              onClick={() =>
                onChange?.(material.id)
              }
              whileHover={{ y: -4, transition: springs.gentle }}
              whileTap={{ scale: 0.97, transition: press }}
              style={{
                position: "relative",
                minHeight: 145,
                padding: 18,
                textAlign: "left",
                borderRadius: 20,
                border: active
                  ? "1px solid var(--accent)"
                  : "1px solid var(--border)",
                background: active
                  ? "var(--glass-bg)"
                  : "rgba(255,255,255,.025)",
                color: "var(--text-primary)",
                cursor: "pointer",
                boxShadow: active
                  ? "0 0 30px var(--accent-glow)"
                  : "none",
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 12,
                  marginBottom: 20,
                  background: active
                    ? "var(--accent)"
                    : "var(--glass-bg)",
                  color: active
                    ? "var(--bg-primary)"
                    : "var(--accent)",
                }}
              >
                <Icon size={19} />
              </div>

              <strong
                style={{
                  display: "block",
                  fontSize: 14,
                  marginBottom: 6,
                }}
              >
                {material.name}
              </strong>

              <span
                style={{
                  display: "block",
                  color: "var(--text-secondary)",
                  fontSize: 11,
                  lineHeight: 1.5,
                }}
              >
                {material.description}
              </span>

              {active && (
                <span
                  style={{
                    position: "absolute",
                    top: 14,
                    right: 14,
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "var(--accent)",
                    boxShadow:
                      "0 0 14px var(--accent)",
                  }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}