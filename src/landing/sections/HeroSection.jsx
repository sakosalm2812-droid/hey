import { motion } from "framer-motion";
import {
  ArrowRight,
  Sparkles,
  Orbit,
  Mic,
} from "lucide-react";


export default function HeroSection(){

  return (

    <section

      style={{
        minHeight:"100vh",
        display:"flex",
        alignItems:"center",
        justifyContent:"center",
        textAlign:"center",
        position:"relative",
        padding:"40px 20px",
      }}

    >

      <div
        style={{
          maxWidth:1100,
        }}
      >


        {/* Label */}

        <motion.div

          initial={{
            opacity:0,
            y:20,
          }}

          animate={{
            opacity:1,
            y:0,
          }}

          transition={{
            duration:1,
          }}

          style={{
            display:"flex",
            justifyContent:"center",
            alignItems:"center",
            gap:10,
            color:"#00bfff",
            fontSize:13,
            letterSpacing:".35em",
          }}

        >

          <Sparkles size={16}/>

          PERSONAL INTELLIGENCE SYSTEM

        </motion.div>





        {/* Logo */}

        <motion.h1

          initial={{
            opacity:0,
            scale:.8,
          }}

          animate={{
            opacity:1,
            scale:1,
          }}

          transition={{
            duration:1,
            delay:.2,
          }}

          style={{
            marginTop:35,
            fontSize:
            "clamp(100px,18vw,220px)",
            fontWeight:300,
            letterSpacing:"-.05em",
            fontFamily:
            '"Instrument Serif", serif',
            lineHeight:.8,
          }}

        >

          HEY

        </motion.h1>





        {/* Main statement */}

        <motion.h2

          initial={{
            opacity:0,
          }}

          animate={{
            opacity:1,
          }}

          transition={{
            duration:1,
            delay:.5,
          }}

          style={{
            marginTop:30,
            fontSize:
            "clamp(35px,5vw,70px)",
            fontWeight:400,
            lineHeight:1.1,
          }}

        >

          Your intelligence.
          <br/>

          Your memory.
          <br/>

          Your universe.

        </motion.h2>






        <motion.p

          initial={{
            opacity:0,
            y:20,
          }}

          animate={{
            opacity:1,
            y:0,
          }}

          transition={{
            delay:.8,
          }}

          style={{
            maxWidth:650,
            margin:"35px auto",
            color:"rgba(255,255,255,.65)",
            fontSize:20,
            lineHeight:1.8,
          }}

        >

          HEY is a living AI system that learns,
          creates and evolves with you.

          A universe where your ideas,
          memories and intelligence connect.

        </motion.p>







        {/* Actions */}

        <motion.div

          initial={{
            opacity:0,
            y:20,
          }}

          animate={{
            opacity:1,
            y:0,
          }}

          transition={{
            delay:1,
          }}

          style={{
            display:"flex",
            justifyContent:"center",
            gap:16,
            flexWrap:"wrap",
          }}

        >

          <button

            className="hey-btn-primary"

            style={{
              display:"flex",
              alignItems:"center",
              gap:10,
            }}

          >

            Enter HEY

            <ArrowRight size={18}/>

          </button>





          <button

            style={{
              padding:"14px 28px",
              borderRadius:999,
              background:
              "rgba(255,255,255,.06)",
              border:
              "1px solid rgba(255,255,255,.15)",
              color:"var(--text-primary)",
              display:"flex",
              alignItems:"center",
              gap:10,
            }}

          >

            <Orbit size={18}/>

            Explore Cosmos

          </button>



        </motion.div>






        {/* Voice hint */}

        <motion.div

          animate={{
            y:[0,-8,0],
          }}

          transition={{
            duration:3,
            repeat:Infinity,
          }}

          style={{
            marginTop:80,
            display:"flex",
            justifyContent:"center",
            alignItems:"center",
            gap:10,
            color:
            "rgba(255,255,255,.45)",
            fontSize:14,
          }}

        >

          <Mic size={16}/>

          Say "HEY" to begin

        </motion.div>




      </div>


    </section>

  );
}