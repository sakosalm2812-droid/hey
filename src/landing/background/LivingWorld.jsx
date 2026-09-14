import { motion } from "framer-motion";


export default function LivingWorld(){

  const particles = Array.from(
    {length:80},
    (_,i)=>i
  );


  return (

    <div

      style={{
        position:"fixed",
        inset:0,
        overflow:"hidden",
        zIndex:-1,
        background:
        "radial-gradient(circle at 50% 20%, #0b2230 0%, #020508 45%, #000 100%)",
      }}

    >


      {/* Deep atmosphere */}

      <motion.div

        animate={{
          scale:[1,1.2,1],
          opacity:[0.25,0.45,0.25],
        }}

        transition={{
          duration:10,
          repeat:Infinity,
          ease:"easeInOut",
        }}

        style={{
          position:"absolute",
          width:700,
          height:700,
          borderRadius:"50%",
          background:
          "rgba(0,191,255,.12)",
          filter:"blur(140px)",
          top:-250,
          left:"30%",
        }}

      />



      {/* Golden energy */}

      <motion.div

        animate={{
          scale:[1,1.1,1],
          opacity:[0.15,0.3,0.15],
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
          "rgba(247,201,111,.08)",
          filter:"blur(130px)",
          bottom:-200,
          right:-100,
        }}

      />





      {/* Stars / particles */}

      {particles.map((p)=>(

        <motion.div

          key={p}

          animate={{
            y:[0,-40,0],
            opacity:[0.15,0.8,0.15],
          }}

          transition={{
            duration:
            4+(p%5),
            repeat:Infinity,
            delay:
            p*0.05,
          }}

          style={{
            position:"absolute",
            width:
            p%4===0 ? 3 : 2,
            height:
            p%4===0 ? 3 : 2,
            borderRadius:"50%",
            background:
            "rgba(255,255,255,.8)",
            left:
            `${(p*37)%100}%`,
            top:
            `${(p*53)%100}%`,
          }}

        />

      ))}






      {/* Digital forest silhouette */}

      <div

        style={{
          position:"absolute",
          bottom:0,
          width:"100%",
          height:"35%",
          background:
          "linear-gradient(180deg,transparent,#020508)",
        }}

      />


      <motion.div

        animate={{
          x:[0,25,0],
        }}

        transition={{
          duration:20,
          repeat:Infinity,
        }}

        style={{
          position:"absolute",
          bottom:0,
          left:"-5%",
          width:"110%",
          height:220,

          background:
          "linear-gradient(145deg,#06110d,#020508)",

          clipPath:
          "polygon(0 75%,8% 45%,18% 70%,30% 35%,42% 65%,55% 30%,70% 70%,82% 40%,100% 70%,100% 100%,0 100%)",

        }}

      />




      {/* Center HEY energy core */}

      <motion.div

        animate={{
          scale:[1,1.08,1],
          opacity:[.5,.9,.5],
        }}

        transition={{
          duration:4,
          repeat:Infinity,
        }}

        style={{
          position:"absolute",
          top:"35%",
          left:"50%",
          transform:"translate(-50%,-50%)",
          width:120,
          height:120,
          borderRadius:"50%",
          background:
          "radial-gradient(circle,#00bfff,transparent 70%)",
          filter:"blur(20px)",
        }}

      />


    </div>

  );

}