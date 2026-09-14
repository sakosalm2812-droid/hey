import { motion } from "framer-motion";

export default function ForgeBlock({
  title,
  description,
  icon,
}) {
  return (
    <motion.div
      whileHover={{
        y:-5,
      }}
      transition={{
        duration:.25,
      }}
      style={{
        padding:24,

        borderRadius:24,

        background:
        "var(--glass-bg)",

        border:
        "1px solid var(--border)",

        backdropFilter:
        "blur(20px)",

        cursor:"pointer",
      }}
    >

      <div
        style={{
          width:48,
          height:48,

          borderRadius:16,

          display:"grid",
          placeItems:"center",

          background:
          "rgba(46,111,87,.2)",

          marginBottom:18,
        }}
      >
        {icon}
      </div>


      <h3
        style={{
          fontSize:24,
          marginBottom:10,
        }}
      >
        {title}
      </h3>


      <p
        style={{
          color:
          "var(--text-secondary)",

          lineHeight:1.7,
        }}
      >
        {description}
      </p>


    </motion.div>
  );
}