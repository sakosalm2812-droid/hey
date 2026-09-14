import { motion } from "framer-motion";
import {
  Bot,
  Sparkles,
  Code2,
  BookOpen,
  Palette,
  Shield,
  Rocket,
} from "lucide-react";

import allAgents from "../../../agents/agents.js";


const agents = [
  {
    name:"Creator",
    description:"Turns ideas into reality.",
    icon:Palette,
  },
  {
    name:"Developer",
    description:"Builds and solves technical problems.",
    icon:Code2,
  },
  {
    name:"Teacher",
    description:"Helps you learn anything.",
    icon:BookOpen,
  },
  {
    name:"Guardian",
    description:"Protects your systems and privacy.",
    icon:Shield,
  },
  {
    name:"Explorer",
    description:"Finds knowledge and possibilities.",
    icon:Rocket,
  },
];


export default function AgentsSection(){

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
          maxWidth:1200,
          width:"100%",
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
              fontSize:12,
              letterSpacing:".25em",
            }}
          >

            <Bot size={18}/>

            AGENT ECOSYSTEM

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

            {allAgents.length} minds.
            <br/>
            One intelligence.

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

            HEY combines specialized agents
            that work together around your goals,
            creating a complete intelligence system.

          </p>


        </motion.div>








        {/* Agent universe */}

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
            height:600,
            borderRadius:50,
            position:"relative",
            overflow:"hidden",
            background:
            "radial-gradient(circle,#071c2b,#020508)",
            border:
            "1px solid rgba(255,255,255,.1)",
          }}

        >





          {/* Core */}

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
              filter:"blur(12px)",
            }}

          />





          <div

            style={{
              position:"absolute",
              top:"50%",
              left:"50%",
              transform:
              "translate(-50%,-50%)",
            }}

          >

            <Bot
              size={45}
              color="#00bfff"
            />

          </div>







          {agents.map((agent,index)=>{

            const Icon = agent.icon;


            const positions=[
              {
                top:"15%",
                left:"25%",
              },
              {
                top:"20%",
                right:"20%",
              },
              {
                bottom:"18%",
                left:"20%",
              },
              {
                bottom:"20%",
                right:"25%",
              },
              {
                top:"50%",
                left:"8%",
              },
            ];


            return (

              <motion.div

                key={agent.name}

                animate={{
                  y:[0,-10,0],
                }}

                transition={{
                  duration:3+index,
                  repeat:Infinity,
                }}

                style={{
                  position:"absolute",
                  ...positions[index],
                  width:180,
                  padding:18,
                  borderRadius:22,
                  background:
                  "rgba(255,255,255,.06)",
                  border:
                  "1px solid rgba(255,255,255,.1)",
                  backdropFilter:"blur(15px)",
                }}

              >

                <Icon
                  size={22}
                  color="#00bfff"
                />


                <h3
                  style={{
                    marginTop:10,
                  }}
                >
                  {agent.name}
                </h3>


                <p

                  style={{
                    marginTop:6,
                    fontSize:13,
                    color:
                    "rgba(255,255,255,.55)",
                  }}

                >
                  {agent.description}
                </p>


              </motion.div>

            );

          })}






          <Sparkles

            color="#00bfff"

            style={{
              position:"absolute",
              top:40,
              right:50,
            }}

          />


        </motion.div>



      </div>


    </section>

  );

}