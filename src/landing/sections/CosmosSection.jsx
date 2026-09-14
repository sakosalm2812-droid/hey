import { motion } from "framer-motion";
import {
  Orbit,
  Sparkles,
  Brain,
  Network,
} from "lucide-react";


const memories = [
  {
    title:"Ideas",
    x:"25%",
    y:"30%",
  },
  {
    title:"Knowledge",
    x:"70%",
    y:"25%",
  },
  {
    title:"Projects",
    x:"55%",
    y:"65%",
  },
  {
    title:"Experiences",
    x:"30%",
    y:"70%",
  },
];


export default function CosmosSection(){

  return (

    <section

      style={{
        minHeight:"100vh",
        padding:"140px 8%",
        display:"flex",
        justifyContent:"center",
        alignItems:"center",
      }}

    >

      <div
        style={{
          width:"100%",
          maxWidth:1200,
        }}
      >



        <motion.div

          initial={{
            opacity:0,
            y:40,
          }}

          whileInView={{
            opacity:1,
            y:0,
          }}

          viewport={{
            once:true,
          }}

          style={{
            textAlign:"center",
          }}

        >


          <div

            style={{
              display:"flex",
              justifyContent:"center",
              alignItems:"center",
              gap:10,
              color:"#00bfff",
              letterSpacing:".25em",
              fontSize:12,
            }}

          >

            <Orbit size={18}/>

            THE COSMOS

          </div>




          <h2

            style={{
              marginTop:25,
              fontSize:
              "clamp(50px,7vw,90px)",
              fontFamily:
              '"Instrument Serif",serif',
              fontWeight:400,
            }}

          >

            Your mind.
            <br/>
            As a universe.

          </h2>




          <p

            style={{
              maxWidth:650,
              margin:"25px auto",
              color:"rgba(255,255,255,.65)",
              fontSize:19,
              lineHeight:1.8,
            }}

          >

            HEY transforms your memories,
            ideas and knowledge into a living
            constellation that grows with you.

          </p>


        </motion.div>








        {/* Galaxy */}

        <motion.div

          initial={{
            opacity:0,
            scale:.85,
          }}

          whileInView={{
            opacity:1,
            scale:1,
          }}

          viewport={{
            once:true,
          }}

          style={{
            marginTop:80,
            height:600,
            borderRadius:50,
            position:"relative",
            overflow:"hidden",
            background:
            "radial-gradient(circle,#071c2b,#020508 70%)",
            border:
            "1px solid rgba(255,255,255,.1)",
          }}

        >




          {/* Central intelligence */}

          <motion.div

            animate={{
              scale:[1,1.15,1],
            }}

            transition={{
              duration:4,
              repeat:Infinity,
            }}

            style={{
              position:"absolute",
              top:"50%",
              left:"50%",
              transform:
              "translate(-50%,-50%)",
              width:130,
              height:130,
              borderRadius:"50%",
              background:
              "radial-gradient(circle,#00bfff,transparent 70%)",
              filter:"blur(10px)",
            }}

          />




          {/* Orbit lines */}

          <motion.div

            animate={{
              rotate:360,
            }}

            transition={{
              duration:35,
              repeat:Infinity,
              ease:"linear",
            }}

            style={{
              position:"absolute",
              width:400,
              height:400,
              top:"50%",
              left:"50%",
              transform:
              "translate(-50%,-50%)",
              borderRadius:"50%",
              border:
              "1px solid rgba(0,191,255,.25)",
            }}

          />






          {memories.map((memory)=>(
            
            <motion.div

              key={memory.title}

              animate={{
                y:[0,-10,0],
              }}

              transition={{
                duration:3,
                repeat:Infinity,
              }}

              style={{
                position:"absolute",
                left:memory.x,
                top:memory.y,
                padding:"14px 20px",
                borderRadius:999,
                background:
                "rgba(255,255,255,.08)",
                border:
                "1px solid rgba(255,255,255,.1)",
                backdropFilter:"blur(10px)",
                display:"flex",
                alignItems:"center",
                gap:8,
              }}

            >

              <Sparkles size={15}/>

              {memory.title}

            </motion.div>

          ))}





          <div

            style={{
              position:"absolute",
              bottom:30,
              left:30,
              display:"flex",
              gap:12,
            }}

          >

            <div

              style={{
                padding:"12px 18px",
                borderRadius:999,
                background:
                "rgba(255,255,255,.06)",
                display:"flex",
                alignItems:"center",
                gap:8,
              }}

            >

              <Brain size={16}/>

              Memory

            </div>



            <div

              style={{
                padding:"12px 18px",
                borderRadius:999,
                background:
                "rgba(255,255,255,.06)",
                display:"flex",
                alignItems:"center",
                gap:8,
              }}

            >

              <Network size={16}/>

              Connected

            </div>


          </div>


        </motion.div>



      </div>


    </section>

  );

}