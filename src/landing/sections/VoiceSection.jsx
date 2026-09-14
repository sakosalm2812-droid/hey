import { motion } from "framer-motion";
import {
  Mic,
  Volume2,
  Sparkles,
  Waves,
} from "lucide-react";


export default function VoiceSection(){

  return (

    <section

      style={{
        minHeight:"100vh",
        padding:"140px 8%",
        display:"flex",
        alignItems:"center",
        justifyContent:"center",
      }}

    >

      <div
        style={{
          width:"100%",
          maxWidth:1200,
          display:"grid",
          gridTemplateColumns:"1fr 1fr",
          gap:70,
          alignItems:"center",
        }}
      >



        {/* Voice visualization */}


        <motion.div

          initial={{
            opacity:0,
            scale:.9,
          }}

          whileInView={{
            opacity:1,
            scale:1,
          }}

          viewport={{
            once:true,
          }}

          style={{
            height:550,
            borderRadius:50,
            position:"relative",
            overflow:"hidden",
            background:
            "radial-gradient(circle,#082331,#020508)",
            border:
            "1px solid rgba(255,255,255,.1)",
          }}

        >



          {/* Main voice core */}

          <motion.div

            animate={{
              scale:[1,1.15,1],
            }}

            transition={{
              duration:3,
              repeat:Infinity,
            }}

            style={{
              position:"absolute",
              top:"50%",
              left:"50%",
              transform:
              "translate(-50%,-50%)",
              width:170,
              height:170,
              borderRadius:"50%",
              background:
              "radial-gradient(circle,#00bfff,transparent 70%)",
              filter:"blur(15px)",
            }}

          />



          <motion.div

            animate={{
              rotate:360,
            }}

            transition={{
              duration:20,
              repeat:Infinity,
              ease:"linear",
            }}

            style={{
              position:"absolute",
              top:"50%",
              left:"50%",
              width:300,
              height:300,
              transform:
              "translate(-50%,-50%)",
              borderRadius:"50%",
              border:
              "1px solid rgba(0,191,255,.25)",
            }}

          />





          <div

            style={{
              position:"absolute",
              top:"50%",
              left:"50%",
              transform:
              "translate(-50%,-50%)",
              width:80,
              height:80,
              borderRadius:"50%",
              display:"grid",
              placeItems:"center",
              background:
              "rgba(255,255,255,.08)",
              backdropFilter:"blur(20px)",
            }}

          >

            <Mic
              size={35}
              color="#00bfff"
            />

          </div>





          {/* Sound waves */}

          {[1,2,3].map((wave)=>(

            <motion.div

              key={wave}

              animate={{
                scale:[1,1.5,1],
                opacity:[.4,0,.4],
              }}

              transition={{
                duration:2,
                repeat:Infinity,
                delay:wave*.4,
              }}

              style={{
                position:"absolute",
                top:"50%",
                left:"50%",
                transform:
                "translate(-50%,-50%)",
                width:
                160+(wave*70),
                height:
                160+(wave*70),
                borderRadius:"50%",
                border:
                "1px solid rgba(0,191,255,.3)",
              }}

            />

          ))}





          <div

            style={{
              position:"absolute",
              bottom:35,
              left:"50%",
              transform:
              "translateX(-50%)",
              display:"flex",
              gap:10,
            }}

          >

            <div
              style={{
                padding:"12px 18px",
                borderRadius:999,
                background:
                "rgba(255,255,255,.06)",
                display:"flex",
                gap:8,
                alignItems:"center",
              }}
            >

              <Volume2 size={15}/>

              Listening

            </div>


          </div>



        </motion.div>







        {/* Text */}


        <motion.div

          initial={{
            opacity:0,
            x:40,
          }}

          whileInView={{
            opacity:1,
            x:0,
          }}

          viewport={{
            once:true,
          }}

        >


          <div

            style={{
              display:"flex",
              alignItems:"center",
              gap:10,
              color:"#00bfff",
              letterSpacing:".25em",
              fontSize:12,
            }}

          >

            <Mic size={18}/>

            HEY VOICE

          </div>





          <h2

            style={{
              marginTop:25,
              fontSize:
              "clamp(50px,7vw,85px)",
              fontFamily:
              '"Instrument Serif",serif',
              fontWeight:400,
              lineHeight:1.1,
            }}

          >

            Just say
            <br/>
            HEY.

          </h2>





          <p

            style={{
              marginTop:25,
              color:
              "rgba(255,255,255,.65)",
              fontSize:19,
              lineHeight:1.8,
            }}

          >

            A natural voice interface
            that understands your commands,
            remembers context and stays with you.

          </p>





          <div

            style={{
              marginTop:30,
              display:"flex",
              alignItems:"center",
              gap:12,
              color:"#00bfff",
            }}

          >

            <Waves size={22}/>

            Always ready

            <Sparkles size={18}/>

          </div>


        </motion.div>


      </div>


    </section>

  );

}