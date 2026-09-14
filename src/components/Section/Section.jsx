import { motion } from "framer-motion";

import styles from "./Section.module.css";


export default function Section({
  children,
  className = "",
  animate = true,
}) {


  return (

    <motion.section

      className={`${styles.section} ${className}`}


      initial={
        animate
        ? {
            opacity:0,
            y:40,
          }
        : false
      }


      whileInView={
        animate
        ? {
            opacity:1,
            y:0,
          }
        : false
      }


      viewport={{
        once:true,
        amount:.2,
      }}


    >

      <div className={styles.container}>

        {children}

      </div>


    </motion.section>

  );

}