import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import HEYButton from "../Button/HEYButton";

import styles from "./HomeHero.module.css";


export default function HomeHero() {

  const navigate = useNavigate();


  return (

    <section className={styles.hero}>

      <div className={styles.background}></div>


      <div className={styles.content}>


        <motion.div
          className={styles.badge}
          initial={{
            opacity:0,
            y:20,
          }}
          animate={{
            opacity:1,
            y:0,
          }}
        >

          <Sparkles size={15}/>

          PERSONAL INTELLIGENCE SYSTEM

        </motion.div>




        <motion.h1
          initial={{
            opacity:0,
            y:30,
          }}
          animate={{
            opacity:1,
            y:0,
          }}
        >

          Your intelligence.

          <br/>

          Your universe.

        </motion.h1>




        <motion.p
          initial={{
            opacity:0,
            y:30,
          }}
          animate={{
            opacity:1,
            y:0,
          }}
        >

          HEY is a personal intelligence system
          that learns, adapts, and evolves around you.

          <br/>

          Not an AI you use.

          <br/>

          An intelligence you own.

        </motion.p>




        <motion.div
          className={styles.buttons}
          initial={{
            opacity:0,
          }}
          animate={{
            opacity:1,
          }}
        >


          <HEYButton
            variant="primary"
            icon={<ArrowRight size={18}/>}
            onClick={() => navigate("/signup")}
          >

            Enter HEY

          </HEYButton>



          <HEYButton
            variant="secondary"
            onClick={() => navigate("/features")}
          >

            Explore

          </HEYButton>


        </motion.div>



        <motion.div

          className={styles.orbit}

          animate={{
            rotate:360,
          }}

          transition={{
            duration:60,
            repeat:Infinity,
            ease:"linear",
          }}

        >

          <span></span>

        </motion.div>



      </div>


    </section>

  );

}