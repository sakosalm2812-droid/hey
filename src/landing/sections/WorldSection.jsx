import { motion } from "framer-motion";
import {
  Trees,
  Sparkles,
  Layers,
} from "lucide-react";


export default function WorldSection(){

  return (

    <section

      style={{
        minHeight:"90vh",
        display:"flex",
        alignItems:"center",
        justifyContent:"center",
        padding:"120px 8%",
      }}

    >

      <div
        style={{
          maxWidth:1200,
          width:"100%",
          display:"grid",
          gridTemplateColumns:
          "1fr 1fr",
          gap:60,
          alignItems:"center",
        }}
      >



        {/* Left text */}

        <motion.div

          initial={{
            opacity:0,
            x:-40,
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
              letterSpacing:".2em",
              fontSize:12,
            }}
          >

            <Trees size={18}/>

            THE HEY WORLD

          </div>




          <h2

            style={{
              marginTop:25,
              fontSize:
              "clamp(45px,6vw,75px)",
              fontFamily:
              '"Instrument Serif",serif',
              fontWeight:400,
              lineHeight:1.1,
            }}

          >

            Intelligence
            should feel alive.

          </h2>




          <p

            style={{
              marginTop:25,
              color:"rgba(255,255,255,.65)",
              fontSize:19,
              lineHeight:1.8,
            }}

          >

            Most AI tools are just windows.

            HEY is a world.

            A place where your memories,
            creations and ideas connect into
            something that grows with you.

          </p>




        </motion.div>





        {/* Right world visualization */}

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
            height:500,
            borderRadius:40,
            position:"relative",
            overflow:"hidden",
            background:
            "linear-gradient(180deg,#071722,#020508)",
            border:
            "1px solid rgba(255,255,255,.1)",
          }}

        >


          {/* floating core */}

          <motion.div

            animate={{
              y:[0,-20,0],
            }}

            transition={{
              duration:5,
              repeat:Infinity,
            }}

            style={{
              position:"absolute",
              top:"35%",
              left:"50%",
              transform:
              "translate(-50%,-50%)",
              width:140,
              height:140,
              borderRadius:"50%",
              background:
              "radial-gradient(circle,#00bfff,transparent 70%)",
              filter:"blur(15px)",
            }}

          />




          <div

            style={{
              position:"absolute",
              bottom:0,
              width:"100%",
              height:"45%",
              background:
              "linear-gradient(180deg,transparent,#020508)",
            }}

          />



          <motion.div

            animate={{
              rotate:360,
            }}

            transition={{
              duration:30,
              repeat:Infinity,
              ease:"linear",
            }}

            style={{
              position:"absolute",
              top:"50%",
              left:"50%",
              width:250,
              height:250,
              transform:
              "translate(-50%,-50%)",
              borderRadius:"50%",
              border:
              "1px solid rgba(0,191,255,.3)",
            }}

          />





          <div

            style={{
              position:"absolute",
              bottom:35,
              left:35,
              right:35,
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

              <Sparkles size={15}/>

              Alive

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

              <Layers size={15}/>

              Connected

            </div>


          </div>



        </motion.div>


      </div>


    </section>

  );
}