import { motion } from "framer-motion";
import { Pencil, CalendarDays, Code2, NotebookPen } from "lucide-react";
import { useNavigate } from "react-router-dom";

import styles from "./Landing.module.css";

const createTools = [
  {
    icon: NotebookPen,
    title: "Notes that think",
    text: "Capture thoughts and let HEY organize, connect, and recall them later.",
  },
  {
    icon: Pencil,
    title: "Drafts & ideas",
    text: "Start anywhere — a sentence, a prompt, a sketch — and grow it into something finished.",
  },
  {
    icon: CalendarDays,
    title: "Plans & tasks",
    text: "Turn intentions into schedules, reminders, and done lists.",
  },
  {
    icon: Code2,
    title: "Custom systems",
    text: "Build personal tools and workflows in the Forge.",
  },
];

export default function Create() {
  const navigate = useNavigate();
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <motion.h1 initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}>
          Create.
          <br />
          Anything you can imagine.
        </motion.h1>
        <p>
          From quick notes to full systems, HEY is a canvas for your ideas — with the
          intelligence to take them further.
        </p>
        <div className={styles.ctaRow}>
          <button className="hey-landing-cta" onClick={() => navigate("/signup")}>
            Start creating
          </button>
          <button className="hey-landing-cta secondary" onClick={() => navigate("/customization")}>
            Make it yours
          </button>
        </div>
      </section>

      <section className={styles.grid}>
        {createTools.map((item) => {
          const Icon = item.icon;
          return (
            <motion.article
              key={item.title}
              className={styles.card}
              whileHover={{ y: -10, scale: 1.02 }}
            >
              <div className={styles.icon}>
                <Icon size={32} />
              </div>
              <h2>{item.title}</h2>
              <p>{item.text}</p>
            </motion.article>
          );
        })}
      </section>
    </main>
  );
}