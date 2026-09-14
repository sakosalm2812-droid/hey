import { motion } from "framer-motion";
import { Monitor, Smartphone, Globe2, ShieldCheck, HardDriveDownload } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { RELEASE_SURFACES, RELEASE_STATUS } from "../core/platformMatrix.js";
import styles from "./Landing.module.css";

const platformIcon = { Browser: Globe2, Desktop: Monitor, Mobile: Smartphone };

export default function Download() {
  const navigate = useNavigate();
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <motion.h1 initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}>
          Download HEY.
          <br />
          Bring it home.
        </motion.h1>
        <p>
          HEY is being released for web, Windows, macOS, Linux, iOS, and Android.
          This page shows the verified state of each target.
        </p>
        <div className={styles.ctaRow}>
          <button className="hey-landing-cta" onClick={() => navigate("/signup")}>
            Get started free
          </button>
          <button className="hey-landing-cta secondary" onClick={() => navigate("/features")}>
            Explore first
          </button>
        </div>
      </section>

      <section className={styles.grid}>
        {RELEASE_SURFACES.map((item) => {
          const Icon = platformIcon[item.family];
          return (
            <motion.article
              key={item.id}
              className={styles.card}
              whileHover={{ y: -10, scale: 1.02 }}
            >
              <div className={styles.icon}>
                <Icon size={32} />
              </div>
              <h2>{item.name}</h2>
              <p className={item.status === RELEASE_STATUS.verifiedSource ? styles.statusReady : styles.statusGate}>
                {item.statusLabel}
              </p>
              <p className={styles.cardDetail}>{item.detail}</p>
              <p className={styles.releaseGate}>{item.releaseGate}</p>
            </motion.article>
          );
        })}
      </section>

      <section className={styles.banner}>
        <div className={styles.bannerIcon}>
          <HardDriveDownload size={36} />
        </div>
        <div>
          <h2>Release standard</h2>
          <p>
            A platform is released only after its signed build or deployed web app is exercised
            on real target hardware with authentication, providers, storage, permissions, and
            updates working end to end.
          </p>
        </div>
        <div className={styles.badgeRow}>
          <span className="badge badge-sky">
            <ShieldCheck size={14} /> Private by design
          </span>
          <span className="badge badge-sky">
            <HardDriveDownload size={14} /> Six release targets
          </span>
        </div>
      </section>
    </main>
  );
}
