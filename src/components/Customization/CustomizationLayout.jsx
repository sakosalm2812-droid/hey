import { useState } from "react";
import { motion } from "framer-motion";
import { Palette, Layers, Sparkles, Sliders } from "lucide-react";

const sections = [
  {
    id: "colors",
    label: "Colors",
    icon: Palette,
  },
  {
    id: "materials",
    label: "Materials",
    icon: Layers,
  },
  {
    id: "effects",
    label: "Effects",
    icon: Sparkles,
  },
  {
    id: "controls",
    label: "Deep Control",
    icon: Sliders,
  },
];

export default function CustomizationLayout({
  children,
  activeSection: controlledSection,
  onSectionChange,
}) {
  const [internalSection, setInternalSection] =
    useState("colors");

  const activeSection =
    controlledSection ?? internalSection;

  const selectSection = (id) => {
    setInternalSection(id);
    onSectionChange?.(id);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "220px minmax(0, 1fr)",
        gap: 28,
        width: "min(1400px, 100%)",
        margin: "0 auto",
      }}
    >
      <aside
        style={{
          position: "sticky",
          top: 95,
          alignSelf: "start",
          padding: 12,
          borderRadius: 24,
          border: "1px solid var(--border)",
          background: "var(--glass-bg)",
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
        }}
      >
        <div
          style={{
            padding: "10px 12px 15px",
            color: "var(--text-secondary)",
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: ".16em",
          }}
        >
          CUSTOMIZE
        </div>

        <div
          style={{
            display: "grid",
            gap: 4,
          }}
        >
          {sections.map((section) => {
            const Icon = section.icon;
            const active =
              activeSection === section.id;

            return (
              <motion.button
                key={section.id}
                type="button"
                onClick={() =>
                  selectSection(section.id)
                }
                whileTap={{ scale: 0.98 }}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "12px 13px",
                  border: "0",
                  borderRadius: 13,
                  background: active
                    ? "var(--glass-bg)"
                    : "transparent",
                  color: active
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                }}
              >
                {active && (
                  <motion.span
                    layoutId="customization-active"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 8,
                      bottom: 8,
                      width: 3,
                      borderRadius: 99,
                      background: "var(--accent)",
                      boxShadow:
                        "0 0 14px var(--accent)",
                    }}
                  />
                )}

                <Icon
                  size={16}
                  style={{
                    color: active
                      ? "var(--accent)"
                      : "currentColor",
                  }}
                />

                {section.label}
              </motion.button>
            );
          })}
        </div>
      </aside>

      <main
        style={{
          minWidth: 0,
        }}
      >
        {typeof children === "function"
          ? children(activeSection)
          : children}
      </main>
    </div>
  );
}