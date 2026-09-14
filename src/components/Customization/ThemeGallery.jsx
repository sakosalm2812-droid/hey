import { motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";

import { useHEYTheme } from "../../context/ThemeContext";
import styles from "./ThemeGallery.module.css";


export default function ThemeGallery() {
  const {
    themeId,
    themes,
    setTheme,
  } = useHEYTheme();


  return (
    <section className={styles.gallery}>

      <div className={styles.heading}>
        <div className={styles.eyebrow}>
          <Sparkles size={15} />
          HEY THEMES
        </div>

        <h2>
          Choose your world.
        </h2>

        <p>
          Every theme changes the atmosphere of your entire HEY experience.
        </p>
      </div>


      <div className={styles.grid}>

        {Object.entries(themes).map(
          ([id, theme], index) => {

            const active = themeId === id;

            return (
              <motion.button
                key={id}
                type="button"
                className={`${styles.theme} ${
                  active ? styles.active : ""
                }`}
                onClick={() => setTheme(id)}
                whileHover={{
                  y: -6,
                  scale: 1.015,
                }}
                whileTap={{
                  scale: 0.985,
                }}
                initial={{
                  opacity: 0,
                  y: 20,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                transition={{
                  delay: index * 0.025,
                }}
              >

                <div
                  className={styles.preview}
                  style={{
                    "--theme-bg": theme.bg,
                    "--theme-surface": theme.surface,
                    "--theme-accent": theme.accent,
                    "--theme-accent-2": theme.accent2,
                  }}
                >

                  <div className={styles.orb} />

                  <div className={styles.previewWindow}>

                    <div className={styles.previewTop}>
                      <span />
                      <span />
                      <span />
                    </div>

                    <div className={styles.previewContent}>

                      <div className={styles.previewLineLarge} />

                      <div className={styles.previewLine} />

                      <div className={styles.previewLineShort} />

                      <div className={styles.previewCards}>
                        <span />
                        <span />
                        <span />
                      </div>

                    </div>

                  </div>

                </div>


                <div className={styles.info}>

                  <div>
                    <strong>
                      {theme.name}
                    </strong>

                    <span>
                      {id === "custom"
                        ? "Build your own atmosphere"
                        : "HEY experience"}
                    </span>
                  </div>


                  <div
                    className={styles.accent}
                    style={{
                      background: theme.accent,
                      boxShadow:
                        `0 0 18px ${theme.accent}88`,
                    }}
                  />


                  {active && (
                    <div className={styles.check}>
                      <Check size={14} />
                    </div>
                  )}

                </div>

              </motion.button>
            );
          }
        )}

      </div>

    </section>
  );
}