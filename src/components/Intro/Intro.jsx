import { motion } from "framer-motion";
import styles from "./Intro.module.css";


export default function Intro({ finish }) {

  return (

    <motion.div

      className={styles.intro}

      initial={{
        opacity: 1
      }}

      animate={{
        opacity: 0
      }}

      transition={{ delay: 4.4, duration: 1.1, ease: "easeInOut" }}

      onAnimationComplete={finish}

    >
      <button type="button" className="hey-btn-ghost" onClick={finish} style={{ position: "absolute", bottom: 32, right: 32, zIndex: 10 }}>Skip intro</button>
      <div className={styles.scene}>
        <div className={styles.halo} />
        <motion.div
          className={styles.orbit}
          animate={{ rotate: 360 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className={styles.wordmark}
          initial={{ opacity: 0, scale: 0.82, filter: "blur(18px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
        >
          HEY
        </motion.div>
        <motion.div
          className={styles.subline}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.55, duration: 0.8 }}
        >
          your second brain
        </motion.div>
        <motion.div
          className={styles.quote}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.9, duration: 1 }}
        >
          There are no limits to anything.
        </motion.div>
        <motion.div
          className={styles.loadingLine}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 1.7, duration: 2.2, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </motion.div>

  );

}
