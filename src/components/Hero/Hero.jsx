import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

import { PrimaryButton, GlassButton } from "../Buttons";

import styles from "./Hero.module.css";


export default function Hero() {

  return (

    <main className={styles.hero}>


      <div className={styles.backgroundGlow}></div>



      <motion.section

        className={styles.content}

        initial={{
          opacity:0,
          y:40
        }}

        animate={{
          opacity:1,
          y:0
        }}

        transition={{
          duration:1,
          ease:[0.22,1,0.36,1]
        }}

      >


        <div className={styles.eyebrow}>

          <Sparkles size={16}/>

          PERSONAL INTELLIGENCE SYSTEM

        </div>



        <h1>

          The intelligence
          <br/>

          that becomes

          <span>
            yours.
          </span>

        </h1>



        <p>

          HEY is a living AI system that learns,
          adapts, and evolves around your world.

          <br/>

          Your memory.
          Your voice.
          Your universe.

        </p>



        <div className={styles.actions}>


          <PrimaryButton icon={<ArrowRight size={18}/>}>
            Enter HEY
          </PrimaryButton>



          <GlassButton>
            Explore the system
          </GlassButton>


        </div>


      </motion.section>





      <motion.div

        className={styles.orbit}

        animate={{
          rotate:360
        }}

        transition={{
          duration:40,
          repeat:Infinity,
          ease:"linear"
        }}

      >

        <div></div>

      </motion.div>





      <motion.div

        className={styles.glassCore}

        animate={{
          y:[0,-20,0]
        }}

        transition={{
          duration:6,
          repeat:Infinity
        }}

      >

        HEY

      </motion.div>



    </main>

  );

}