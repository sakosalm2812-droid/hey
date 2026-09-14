import { motion } from "framer-motion";
import {
  Sparkles,
  Orbit,
  Brain,
  Hammer,
  Mic,
  ArrowRight,
  Trees,
} from "lucide-react";

import allAgents from "../agents/agents.js";


const features = [
  {
    title:"The Cosmos",
    text:"A living memory universe where your ideas, knowledge and experiences connect.",
    icon:Orbit,
  },
  {
    title:`${allAgents.length} Agent Definitions`,
    text:"Specialized roles that run only through configured, verified execution providers.",
    icon:Brain,
  },
  {
    title:"The Forge",
    text:"Create your own AI agents and build systems around your life.",
    icon:Hammer,
  },
  {
    title:"HEY Voice",
    text:"A natural AI presence that is always ready when you need it.",
    icon:Mic,
  },
];


export default function LandingPage(){


  return (

    <div
      style={{
        minHeight:"100vh",
        background:"#020508",
        color:"var(--text-primary)",
        overflow:"hidden",
        position:"relative",
      }}
    >


      {/* Ambient light */}

      <motion.div

        animate={{
          scale:[1,1.2,1],
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
          "rgba(0,191,255,.15)",
          filter:"blur(120px)",
          top:-200,
          left:"35%",
        }}

      />



      {/* HERO */}

      <section

        style={{
          minHeight:"100vh",
          display:"flex",
          alignItems:"center",
          justifyContent:"center",
          textAlign:"center",
          padding:40,
          position:"relative",
        }}

      >


        <div>


          <motion.div

            initial={{
              opacity:0,
              y:20,
            }}

            animate={{
              opacity:1,
              y:0,
            }}

          >

            <div
              style={{
                display:"flex",
                justifyContent:"center",
                alignItems:"center",
                gap:10,
                color:"#00bfff",
                letterSpacing:".3em",
                fontSize:13,
              }}
            >

              <Sparkles size={16}/>

              NEXT GENERATION INTELLIGENCE

            </div>



            <h1

              style={{
                marginTop:30,
                fontSize:"clamp(60px,9vw,120px)",
                fontWeight:400,
                fontFamily:'"Instrument Serif",serif',
              }}

            >

              HEY

            </h1>



            <h2

              style={{
                fontSize:"clamp(30px,5vw,60px)",
                fontWeight:400,
                marginTop:-20,
              }}

            >

              Your intelligence.
              <br/>
              Your memory.
              <br/>
              Your universe.

            </h2>



            <p

              style={{
                maxWidth:650,
                margin:"30px auto",
                color:"rgba(255,255,255,.65)",
                fontSize:18,
                lineHeight:1.8,
              }}

            >

              HEY is a living AI system that learns,
              creates and evolves with you.

              Not just an assistant.
              A personal intelligence ecosystem.

            </p>




            <div

              style={{
                display:"flex",
                justifyContent:"center",
                gap:16,
                marginTop:35,
              }}

            >

              <button
                className="hey-btn-primary"
              >

                Enter HEY

                <ArrowRight size={18}/>

              </button>


              <button

                style={{
                  padding:"14px 28px",
                  borderRadius:999,
                  background:"rgba(255,255,255,.06)",
                  border:"1px solid rgba(255,255,255,.1)",
                  color:"var(--text-primary)",
                }}

              >

                Explore Cosmos

              </button>


            </div>


          </motion.div>


        </div>


      </section>






      {/* IDENTITY */}

      <section
        style={{
          padding:"100px 8%",
        }}
      >

        <div
          style={{
            textAlign:"center",
            marginBottom:60,
          }}
        >

          <Trees
            color="#00bfff"
          />

          <h2
            style={{
              fontSize:50,
              fontFamily:'"Instrument Serif",serif',
            }}
          >
            A living digital universe
          </h2>


          <p
            style={{
              color:"rgba(255,255,255,.6)",
            }}
          >
            Where intelligence meets imagination.
          </p>


        </div>





        <div

          style={{
            display:"grid",
            gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",
            gap:25,
          }}

        >

          {features.map((item)=>{

            const Icon=item.icon;


            return (

              <motion.div

                key={item.title}

                whileHover={{
                  y:-8,
                }}

                style={{
                  padding:30,
                  borderRadius:28,
                  background:
                  "rgba(255,255,255,.04)",
                  border:
                  "1px solid var(--border)",
                }}

              >

                <Icon
                  color="#00bfff"
                  size={35}
                />


                <h3
                  style={{
                    marginTop:20,
                    fontSize:28,
                  }}
                >
                  {item.title}
                </h3>


                <p
                  style={{
                    marginTop:12,
                    color:"rgba(255,255,255,.6)",
                    lineHeight:1.7,
                  }}
                >
                  {item.text}
                </p>


              </motion.div>

            )

          })}


        </div>


      </section>






      {/* FINAL CTA */}

      <section

        style={{
          padding:"120px 20px",
          textAlign:"center",
        }}

      >

        <h2
          style={{
            fontSize:60,
            fontFamily:'"Instrument Serif",serif',
          }}
        >

          Enter your universe.

        </h2>


        <button
          className="hey-btn-primary"
          style={{
            marginTop:35,
          }}
        >

          Start with HEY

        </button>


      </section>



    </div>

  );

}
