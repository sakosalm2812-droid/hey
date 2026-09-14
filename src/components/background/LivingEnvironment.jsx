import { motion } from "framer-motion";


export default function LivingEnvironment() {

  return (
    <div
      style={{
        position:"fixed",
        inset:0,
        zIndex:0,
        pointerEvents:"none",
        overflow:"hidden",
      }}
    >

      {/* Deep dark atmosphere */}
      <div
        style={{
          position:"absolute",
          inset:0,
          background:
          "linear-gradient(180deg,var(--bg-primary) 0%,var(--bg-secondary) 45%,var(--bg-primary) 100%)",
        }}
      />


      {/* Moon glow */}
      <motion.div

        animate={{
          opacity:[0.25,0.5,0.25],
          scale:[1,1.05,1],
        }}

        transition={{
          duration:8,
          repeat:Infinity,
          ease:"easeInOut",
        }}

        style={{
          position:"absolute",
          width:260,
          height:260,
          borderRadius:"50%",
          background:
          "var(--ambient-one)",
          filter:"blur(90px)",
          top:80,
          right:160,
        }}

      />



      {/* Mountain layers */}

      <div
        style={{
          position:"absolute",
          bottom:0,
          width:"100%",
          height:"45%",
          background:
          "linear-gradient(180deg,transparent,var(--bg-primary))",
        }}
      />


      <motion.div

        animate={{
          x:[0,20,0],
        }}

        transition={{
          duration:15,
          repeat:Infinity,
          ease:"easeInOut",
        }}

        style={{
          position:"absolute",
          bottom:-80,
          left:-100,
          width:"120%",
          height:260,
          background:
          "linear-gradient(135deg,var(--bg-secondary),var(--bg-primary))",
          clipPath:
          "polygon(0 70%,15% 45%,30% 65%,45% 35%,60% 60%,75% 30%,100% 55%,100% 100%,0 100%)",
          opacity:.9,
        }}

      />



      {/* Floating particles */}

      {[...Array(35)].map((_,i)=>(

        <motion.div

          key={i}

          animate={{
            y:[0,-40,0],
            opacity:[0.1,0.7,0.1],
          }}

          transition={{
            duration:
            4 + (i%5),
            repeat:Infinity,
            delay:
            i*.2,
          }}

          style={{
            position:"absolute",
            width:i%3===0?3:2,
            height:i%3===0?3:2,
            borderRadius:"50%",
            background:"var(--text-primary)",
            left:`${(i * 37) % 100}%`,
            top:`${(i * 53) % 80}%`,
          }}

        />

      ))}



      {/* Fog layers */}

      <motion.div

        animate={{
          x:[-50,50,-50],
        }}

        transition={{
          duration:25,
          repeat:Infinity,
          ease:"linear",
        }}

        style={{
          position:"absolute",
          bottom:100,
          left:-200,
          width:"140%",
          height:120,
          background:
          "var(--glass-bg)",
          filter:"blur(40px)",
        }}

      />

    </div>
  );
}
