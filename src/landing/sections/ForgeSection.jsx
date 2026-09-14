import { motion } from "framer-motion";
import {
  Hammer,
  Sparkles,
  Bot,
  Wand2,
  Settings,
} from "lucide-react";


const steps = [
  {
    title:"Define",
    text:"Give your intelligence a purpose.",
    icon:Settings,
  },
  {
    title:"Create",
    text:"Shape personality and abilities.",
    icon:Wand2,
  },
  {
    title:"Activate",
    text:"Your custom agent comes alive.",
    icon:Bot,
  },
];


export default function ForgeSection(){

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
              color:"#f7c96f",
              letterSpacing:".25em",
              fontSize:12,
            }}
          >

            <Hammer size={18}/>

            THE FORGE

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

            Build your own
            intelligence.

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

            Create personal AI agents that
            understand your goals, your style,
            and the way you think.

          </p>


        </motion.div>







        {/* Forge chamber */}

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
            marginTop:80,
            height:550,
            borderRadius:45,
            position:"relative",
            overflow:"hidden",
            background:
            "linear-gradient(145deg,#11100d,#020508)",
            border:
            "1px solid rgba(247,201,111,.15)",
          }}

        >



          {/* Core */}

          <motion.div

            animate={{
              scale:[1,1.2,1],
            }}

            transition={{
              duration:4,
              repeat:Infinity,
            }}

            style={{
              position:"absolute",
              top:"45%",
              left:"50%",
              transform:
              "translate(-50%,-50%)",
              width:160,
              height:160,
              borderRadius:"50%",
              background:
              "radial-gradient(circle,#f7c96f,transparent 70%)",
              filter:"blur(15px)",
            }}

          />






          {/* Hammer icon */}

          <div

            style={{
              position:"absolute",
              top:"45%",
              left:"50%",
              transform:
              "translate(-50%,-50%)",
              width:90,
              height:90,
              borderRadius:"50%",
              display:"grid",
              placeItems:"center",
              background:
              "rgba(255,255,255,.08)",
              backdropFilter:"blur(20px)",
            }}

          >

            <Hammer
              size={40}
              color="#f7c96f"
            />

          </div>







          <div

            style={{
              position:"absolute",
              bottom:35,
              left:35,
              right:35,
              display:"grid",
              gridTemplateColumns:
              "repeat(3,1fr)",
              gap:15,
            }}

          >

            {steps.map((step)=>{

              const Icon = step.icon;


              return (

                <motion.div

                  key={step.title}

                  whileHover={{
                    y:-8,
                  }}

                  style={{
                    padding:20,
                    borderRadius:22,
                    background:
                    "rgba(255,255,255,.06)",
                    border:
                    "1px solid rgba(255,255,255,.1)",
                  }}

                >

                  <Icon
                    color="#f7c96f"
                  />


                  <h3
                    style={{
                      marginTop:15,
                    }}
                  >
                    {step.title}
                  </h3>


                  <p
                    style={{
                      marginTop:8,
                      color:
                      "rgba(255,255,255,.55)",
                      fontSize:14,
                    }}
                  >
                    {step.text}
                  </p>


                </motion.div>

              );

            })}


          </div>





          <Sparkles

            style={{
              position:"absolute",
              top:30,
              right:40,
            }}

            color="#f7c96f"

          />



        </motion.div>



      </div>


    </section>

  );

}