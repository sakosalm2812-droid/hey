import { motion } from "framer-motion";
import {
  Sparkles,
  Crown,
  Rocket,
  Infinity as InfinityIcon,
} from "lucide-react";


const plans = [
  {
    name:"Explorer",
    price:"Free",
    description:
    "Begin your journey inside HEY.",
    icon:Sparkles,
    features:[
      "Basic AI access",
      "Personal memory",
      "Core experiences",
    ],
  },

  {
    name:"Pro",
    price:"$15 / month",
    description:
    "For creators and builders.",
    icon:Rocket,
    featured:true,
    features:[
      "Advanced agents",
      "The Cosmos",
      "The Forge",
      "Expanded memory",
    ],
  },

  {
    name:"Elite",
    price:"$45 / month",
    description:
    "The complete intelligence ecosystem.",
    icon:Crown,
    features:[
      "Maximum intelligence",
      "Priority systems",
      "Deep customization",
      "Future HEY technologies",
    ],
  },
];


export default function PricingSection(){

  return (

    <section

      style={{
        minHeight:"100vh",
        padding:"140px 8%",
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

          <InfinityIcon size={18}/>

          ENTER THE SYSTEM

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

          Choose your
          <br/>
          connection.

        </h2>




        <p

          style={{
            maxWidth:650,
            margin:"25px auto",
            color:
            "rgba(255,255,255,.65)",
            fontSize:19,
          }}

        >

          HEY grows with you.
          Start your journey and unlock
          deeper intelligence when you are ready.

        </p>


      </motion.div>







      <div

        style={{
          marginTop:80,
          display:"grid",
          gridTemplateColumns:
          "repeat(auto-fit,minmax(280px,1fr))",
          gap:25,
        }}

      >

        {plans.map((plan)=>{

          const Icon = plan.icon;


          return (

            <motion.div

              key={plan.name}

              whileHover={{
                y:-10,
              }}

              style={{
                padding:35,
                borderRadius:35,
                background:
                plan.featured
                ?
                "rgba(0,191,255,.12)"
                :
                "rgba(255,255,255,.04)",
                border:
                plan.featured
                ?
                "1px solid rgba(0,191,255,.4)"
                :
                "1px solid rgba(255,255,255,.1)",
                position:"relative",
              }}

            >

              {plan.featured && (

                <div

                  style={{
                    position:"absolute",
                    top:20,
                    right:25,
                    fontSize:12,
                    color:"#00bfff",
                  }}

                >

                  MOST POWERFUL

                </div>

              )}



              <Icon
                size={35}
                color={
                  plan.featured
                  ?
                  "#00bfff"
                  :
                  "#f7c96f"
                }
              />



              <h3

                style={{
                  marginTop:25,
                  fontSize:30,
                }}

              >

                {plan.name}

              </h3>



              <h4

                style={{
                  marginTop:15,
                  fontSize:35,
                  fontWeight:400,
                }}

              >

                {plan.price}

              </h4>




              <p

                style={{
                  marginTop:15,
                  color:
                  "rgba(255,255,255,.6)",
                }}

              >

                {plan.description}

              </p>





              <div

                style={{
                  marginTop:25,
                  display:"grid",
                  gap:12,
                }}

              >

                {plan.features.map((feature)=>(

                  <div

                    key={feature}

                    style={{
                      padding:"12px 0",
                      borderBottom:
                      "1px solid var(--border)",
                      color:
                      "rgba(255,255,255,.8)",
                    }}

                  >

                    {feature}

                  </div>

                ))}


              </div>





              <button

                className="hey-btn-primary"

                style={{
                  width:"100%",
                  marginTop:30,
                }}

              >

                Enter HEY

              </button>


            </motion.div>

          );

        })}


      </div>


    </section>

  );

}
