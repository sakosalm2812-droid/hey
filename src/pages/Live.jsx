import { motion } from "framer-motion";
import { Mic, Clock, Type } from "lucide-react";
import { useNavigate } from "react-router-dom";

import styles from "./Landing.module.css";

const liveModes = [
  {
    icon: Mic,
    title: "Live voice",
    text: "Start a voice session when you choose. Microphone permission, browser speech support, and connected services determine what is available.",
  },
  {
    icon: Type,
    title: "Live assist",
    text: "Request help while you write, plan, or create. Suggestions depend on the signed-in session and configured provider.",
  },
  {
    icon: Clock,
    title: "Ambient memory",
    text: "Review and save selected memories. Saving depends on an authenticated account and configured storage; HEY does not imply background monitoring here.",
  },
];

export default function Live() {
  const navigate = useNavigate();
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <motion.h1 initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}>
          HEY Live.
          <br />
          Here when you choose.
        </motion.h1>
        <p>
          Explore voice, writing help, and memory in HEY. Availability depends on the feature,
          permissions, account, browser, and connected services shown in the app.
        </p>
        <div className={styles.ctaRow}>
          <button className="hey-landing-cta" onClick={() => navigate("/signup")}>
            Start with HEY
          </button>
          <button className="hey-landing-cta secondary" onClick={() => navigate("/features")}>
            See all features
          </button>
        </div>
      </section>

      <section className={styles.grid}>
        {liveModes.map((item) => {
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

      <section className={styles.banner}>
        <div className={styles.bannerIcon}>
          <Mic size={36} />
        </div>
        <div>
          <h2>Available the moment you need it</h2>
          <p>
            HEY is designed for voice, text, shortcuts, and scheduled work. This page describes
            product surfaces; check each in-app feature for its current availability and data path.
          </p>
        </div>
        <div className={styles.badgeRow}>
          <span className="badge badge-sky">
            User initiated
          </span>
          <span className="badge badge-sky">
            Availability shown in app
          </span>
        </div>
      </section>
    </main>
  );
}
