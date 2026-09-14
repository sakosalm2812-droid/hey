import { motion } from "framer-motion";
import { press, springs } from "../lib/heyMotion";
import styles from "./Buttons.module.css";


export function PrimaryButton({children, icon}) {

  return (

    <motion.button

      className={styles.primary}

      whileHover={{
        y:-4,
        scale:1.02,
        transition:springs.snappy,
      }}

      whileTap={{
        scale:.97,
        transition:press,
      }}

    >

      {children}

      {icon}

    </motion.button>

  );

}



export function GlassButton({children}) {

  return (

    <motion.button

      className={styles.glass}

      whileHover={{
        y:-4,
        transition:springs.snappy,
      }}

      whileTap={{
        scale:.97,
        transition:press,
      }}

    >

      {children}

    </motion.button>

  );

}