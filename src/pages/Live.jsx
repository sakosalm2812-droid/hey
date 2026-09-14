import { motion } from "framer-motion";
import { Radio, ShieldCheck, Zap, Mic, Clock, Type } from "lucide-react";
import { useNavigate } from "react-router-dom";

import styles from "./Landing.module.css";

const liveModes = [
  {
    icon: Mic,
    title: "Live voice",
    text: "Speak naturally. HEY listens, understands, and follows up — hands-free, in real time.",
  },
  {
    icon: Type,
    title: "Live assist",
    text: "Inline suggestions as you write, plan, and create — without leaving your flow.",
  },
  {
    icon: Clock,
    title: "Ambient memory",
    text: "Runs quietly in the background so nothing important is forgotten.",
  },
];

const liveChannels = ["Voice", "Text", "Shortcuts", "Scheduled"];

export default function Live() {
  const navigate = useNavigate();
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <motion.h1 initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}>
          HEY Live.
          <br />
          Always listening.
        </motion.h1>
        <p>
          Keep HEY by your side. It speaks, listens, and acts the moment you need it — on your
          terms, with privacy built in.
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
          <Radio size={36} />
        </div>
        <div>
          <h2>Available the moment you need it</h2>
          <p>
            Live features work across everyday channels: {liveChannels.join(" · ")}. On-device
            processing keeps your words yours.
          </p>
        </div>
        <div className={styles.badgeRow}>
          <span className="badge badge-sky">
            <ShieldCheck size={14} /> On-device
          </span>
          <span className="badge badge-sky">
            <Zap size={14} /> Instant
          </span>
        </div>
      </section>
    </main>
  );
}