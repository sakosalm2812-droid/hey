import { motion } from "framer-motion";
import {
  ArrowRight,
  Sparkles,
  Orbit,
} from "lucide-react";


export default function FinalCTA(){

  return (

    <section

      style={{
        minHeight:"90vh",
        display:"flex",
        alignItems:"center",
        justifyContent:"center",
        textAlign:"center",
        padding:"120px 20px",
        position:"relative",
      }}

    >


      {/* Glow */}

      <motion.div

        animate={{
          scale:[1,1.3,1],
          opacity:[.2,.5,.2],
        }}

        transition={{
          duration:8,
          repeat:Infinity,
        }}

        style={{
          position:"absolute",
          width:500,
          height:500,
          borderRadius:"50%",
          background:
          "rgba(0,191,255,.12)",
          filter:"blur(120px)",
        }}

      />




      <div
        style={{
          position:"relative",
          zIndex:2,
          maxWidth:900,
        }}
      >



        <motion.div

          initial={{
            opacity:0,
            y:30,
          }}

          whileInView={{
            opacity:1,
            y:0,
          }}

          viewport={{
            once:true,
          }}

        >

          <Sparkles
            size={30}
            color="#00bfff"
          />



          <h2

            style={{
              marginTop:30,
              fontSize:
              "clamp(45px,7vw,92px)",
              fontFamily:
              '"Orbitron", "Instrument Serif", serif',
              fontWeight:500,
              lineHeight:1.05,
              letterSpacing:".02em",
              textTransform:"uppercase",
            }}

          >

            No limits
            <br/>
            to the sky.

          </h2>





          <p

            style={{
              marginTop:30,
              color:
              "rgba(255,255,255,.65)",
              fontSize:20,
              lineHeight:1.8,
            }}

          >

            Enter HEY and experience
            intelligence that grows,
            creates and evolves with you.

          </p>






          <div

            style={{
              marginTop:45,
              display:"flex",
              justifyContent:"center",
              gap:15,
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


          </div>



        </motion.div>



      </div>


    </section>

  );
}