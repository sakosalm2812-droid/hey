import {
    Palette,
    Layers,
    Sparkles,
    Sliders,
  } from "lucide-react";
  import { motion } from "framer-motion";
  
  const sections = [
    {
      id: "colors",
      icon: Palette,
      title: "Colors",
      description:
        "Control the colors that define your HEY world.",
    },
    {
      id: "materials",
      icon: Layers,
      title: "Materials",
      description:
        "Choose how HEY feels: glass, crystal, nature, futuristic, and more.",
    },
    {
      id: "themes",
      icon: Sparkles,
      title: "Themes",
      description:
        "Transform the entire HEY experience with visual worlds.",
    },
    {
      id: "deep-control",
      icon: Sliders,
      title: "Deep Control",
      description:
        "Fine-tune HEY down to the smallest details.",
    },
  ];
  
  export default function CustomizationSections({
    activeSection,
    onSectionChange,
  }) {
    return (
      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 12,
          marginBottom: 40,
        }}
      >
        {sections.map((section) => {
          const Icon = section.icon;
          const active = activeSection === section.id;
  
          return (
            <motion.button
              key={section.id}
              type="button"
              onClick={() =>
                onSectionChange(section.id)
              }
              whileHover={{ y: -5 }}
              whileTap={{ scale: 0.98 }}
              style={{
                position: "relative",
                padding: 22,
                minHeight: 155,
                borderRadius: 22,
                border: active
                  ? "1px solid var(--accent)"
                  : "1px solid var(--border)",
                background: active
                  ? "var(--glass-bg)"
                  : "rgba(255,255,255,.025)",
                color: "var(--text-primary)",
                textAlign: "left",
                cursor: "pointer",
                boxShadow: active
                  ? "0 0 35px var(--accent-glow)"
                  : "none",
                transition:
                  "border-color .25s ease, box-shadow .25s ease, background .25s ease",
              }}
            >
              <Icon
                size={24}
                style={{
                  color: "var(--accent)",
                  marginBottom: 22,
                }}
              />
  
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  letterSpacing: "-.02em",
                  marginBottom: 8,
                }}
              >
                {section.title}
              </div>
  
              <div
                style={{
                  color: "var(--text-secondary)",
                  fontSize: 12,
                  lineHeight: 1.6,
                }}
              >
                {section.description}
              </div>
  
              {active && (
                <motion.span
                  layoutId="customization-active-indicator"
                  style={{
                    position: "absolute",
                    left: 22,
                    bottom: 14,
                    width: 28,
                    height: 3,
                    borderRadius: 999,
                    background: "var(--accent)",
                    boxShadow:
                      "0 0 14px var(--accent)",
                  }}
                />
              )}
            </motion.button>
          );
        })}
      </section>
    );
  }