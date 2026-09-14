import { useState } from "react";
import {
    Palette,
    Layers,
    Sparkles,
    Sliders,
    Check,
    Wand2,
    RotateCcw,
  } from "lucide-react";
import { motion } from "framer-motion";
import { press, springs } from "../lib/heyMotion";
import { useHEYTheme } from "../context/ThemeContext.jsx";

const options = [
    {
      icon: Palette,
      title: "Colors",
      text: "Choose the atmosphere and personality of your HEY experience.",
    },
    {
      icon: Layers,
      title: "Materials",
      text: "Glass, crystal, nature, futuristic, and custom worlds.",
    },
    {
      icon: Sparkles,
      title: "Themes",
      text: "Transform every interaction into something unique.",
    },
    {
      icon: Sliders,
      title: "Deep control",
      text: "Customize HEY down to the smallest detail.",
    },
  ];

const glass = {
    background: "var(--glass-bg)",
    border: "1px solid rgba(255,255,255,.09)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
  };

export default function Customization() {
  const { themes, themeId, setTheme, customAccent, setCustomAccent } = useHEYTheme();
  const themeEntries = Object.entries(themes);
  const currentTheme = themes[themeId] || themeEntries[0][1];

  const [activeSection, setActiveSection] = useState("themes");
  const [customColor, setCustomColor] = useState(customAccent);

  const applyTheme = (nextThemeId, customColorValue) => {
    if (!themes[nextThemeId]) return;
    setTheme(nextThemeId);
    if (nextThemeId === "custom" && customColorValue) {
      setCustomAccent(customColorValue);
    }
  };

  const resetTheme = () => {
    const defaultThemeId = Object.keys(themes)[0];
    setTheme(defaultThemeId);
    setCustomAccent("#00BFFF");
    setCustomColor("#00BFFF");
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "42px clamp(18px, 4vw, 64px) 90px",
        color: "var(--text-primary, #F5FBFF)",
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
        }}
      >
        <motion.section
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          style={{
            marginBottom: 42,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 24,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 12,
                  color: "var(--accent, #00BFFF)",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: ".18em",
                }}
              >
                <Wand2 size={14} />
                HEY CUSTOMIZATION
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: "clamp(38px, 6vw, 76px)",
                  lineHeight: .94,
                  letterSpacing: "-.065em",
                  fontWeight: 800,
                }}
              >
                Make HEY
                <br />
                uniquely yours.
              </h1>

              <p
                style={{
                  maxWidth: 580,
                  margin: "20px 0 0",
                  color: "var(--text-secondary, rgba(245,251,255,.62))",
                  fontSize: 15,
                  lineHeight: 1.7,
                }}
              >
                Your intelligence.
                <br />
                Your style.
                <br />
                Your world.
              </p>
            </div>

            <div
              style={{
                ...glass,
                padding: 16,
                borderRadius: 20,
                minWidth: 210,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: ".12em",
                  color: "var(--text-secondary)",
                  marginBottom: 8,
                }}
              >
                CURRENT WORLD
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: "50%",
                    background: currentTheme.accent,
                    boxShadow: `0 0 20px ${currentTheme.accent}`,
                  }}
                />

                <strong>{currentTheme.name}</strong>
              </div>
            </div>
          </div>
        </motion.section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
            marginBottom: 36,
          }}
        >
          {options.map((item) => {
            const Icon = item.icon;
            const key = item.title.toLowerCase();

            return (
              <motion.button
                key={item.title}
                type="button"
                onClick={() =>
                  setActiveSection(
                    item.title === "Themes"
                      ? "themes"
                      : key
                  )
                }
                whileHover={{ y: -4, transition: springs.gentle }}
                whileTap={{ scale: 0.97, transition: press }}
                style={{
                  ...glass,
                  padding: 18,
                  borderRadius: 18,
                  textAlign: "left",
                  cursor: "pointer",
                  color: "inherit",
                  outline: "none",
                  border:
                    activeSection ===
                    (item.title === "Themes"
                      ? "themes"
                      : key)
                      ? "1px solid var(--accent, #00BFFF)"
                      : glass.border,
                  boxShadow:
                    activeSection ===
                    (item.title === "Themes"
                      ? "themes"
                      : key)
                      ? "0 0 30px var(--accent-glow, rgba(0,191,255,.15))"
                      : "none",
                }}
              >
                <Icon
                  size={22}
                  style={{
                    color: "var(--accent, #00BFFF)",
                    marginBottom: 18,
                  }}
                />

                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 15,
                    marginBottom: 7,
                  }}
                >
                  {item.title}
                </div>

                <div
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: 12,
                    lineHeight: 1.55,
                  }}
                >
                  {item.text}
                </div>
              </motion.button>
            );
          })}
        </section>

        {activeSection === "themes" && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 15,
                marginBottom: 18,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    color: "var(--accent)",
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: ".16em",
                    marginBottom: 7,
                  }}
                >
                  VISUAL WORLDS
                </div>

                <h2
                  style={{
                    margin: 0,
                    fontSize: 28,
                    letterSpacing: "-.04em",
                  }}
                >
                  Choose your world.
                </h2>
              </div>

              <button
                type="button"
                onClick={resetTheme}
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
                  "repeat(auto-fill, minmax(190px, 1fr))",
                gap: 12,
              }}
            >
              {themeEntries.map(([tid, theme], index) => {
                const active = tid === themeId;
                const previewAccent = theme.id === "custom" ? customColor : theme.accent;

                return (
                  <motion.button
                    key={tid}
                    type="button"
                    onClick={() => applyTheme(tid, customColor)}
                    whileHover={{ y: -4, transition: springs.gentle }}
                    whileTap={{ scale: 0.97, transition: press }}
                    style={{
                      position: "relative",
                      minHeight: 155,
                      overflow: "hidden",
                      padding: 16,
                      borderRadius: 19,
                      border: active
                        ? `1px solid ${previewAccent}`
                        : "1px solid rgba(255,255,255,.09)",
                      background: `
                          radial-gradient(
                            circle at 85% 15%,
                            ${previewAccent}55,
                            transparent 35%
                          ),
                          ${theme.bg}
                        `,
                      color: theme.light
                        ? "#111827"
                        : "#F5FBFF",
                      cursor: "pointer",
                      textAlign: "left",
                      boxShadow: active
                        ? `0 0 35px ${previewAccent}30`
                        : "none",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 14,
                        right: 14,
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        background: previewAccent,
                        boxShadow: `0 0 25px ${previewAccent}90`,
                      }}
                    />

                    {active && (
                      <span
                        style={{
                          position: "absolute",
                          top: 20,
                          right: 51,
                          width: 20,
                          height: 20,
                          display: "grid",
                          placeItems: "center",
                          borderRadius: "50%",
                          background: previewAccent,
                          color: theme.light
                            ? "#fff"
                            : "#000",
                        }}
                      >
                        <Check size={12} />
                      </span>
                    )}

                    <span
                      style={{
                        display: "block",
                        opacity: .5,
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: ".14em",
                        marginBottom: 52,
                      }}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <strong
                      style={{
                        display: "block",
                        fontSize: 14,
                        letterSpacing: ".02em",
                      }}
                    >
                      {theme.name}
                    </strong>

                    <span
                      style={{
                        display: "block",
                        marginTop: 5,
                        fontSize: 9,
                        opacity: .55,
                        fontFamily: "monospace",
                      }}
                    >
                      {previewAccent.toUpperCase()}
                    </span>

                    {theme.id === "custom" && (
                      <input
                        type="color"
                        value={customColor}
                        onClick={(event) =>
                          event.stopPropagation()
                        }
                        onChange={(event) => {
                          const color = event.target.value;
                          setCustomColor(color);
                          applyTheme(tid, color);
                        }}
                        style={{
                          position: "absolute",
                          bottom: 15,
                          right: 15,
                          width: 27,
                          height: 27,
                          padding: 0,
                          border: 0,
                          background: "transparent",
                          cursor: "pointer",
                        }}
                        aria-label="Custom HEY color"
                      />
                    )}
                  </motion.button>
                );
              })}
            </div>
          </motion.section>
        )}

        {activeSection !== "themes" && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              ...glass,
              padding: 28,
              borderRadius: 24,
            }}
          >
            <div
              style={{
                color: "var(--accent)",
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: ".16em",
                marginBottom: 10,
              }}
            >
              {activeSection.toUpperCase()}
            </div>

            <h2
              style={{
                margin: 0,
                fontSize: 28,
                letterSpacing: "-.04em",
              }}
            >
              Deep customization is coming here.
            </h2>

            <p
              style={{
                maxWidth: 650,
                marginTop: 12,
                color: "var(--text-secondary)",
                lineHeight: 1.7,
              }}
            >
              This section will control the corresponding
              HEY system without forcing users to customize
              anything. The default HEY experience remains
              fully designed out of the box.
            </p>
          </motion.section>
        )}
      </div>
    </main>
  );
}