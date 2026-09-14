import { motion } from "framer-motion";

export default function CalendarEvent({
  title,
  time,
  type,
}) {
  return (
    <motion.div
      whileHover={{
        x: 4,
      }}
      style={{
        display:"flex",

        alignItems:"center",

        justifyContent:"space-between",

        padding:18,

        borderRadius:20,

        background:
          "var(--glass-bg)",

        border:
          "1px solid var(--border)",
      }}
    >

      <div>

        <h3
          style={{
            fontSize:18,

            marginBottom:8,
          }}
        >
          {title}
        </h3>


        <p
          style={{
            margin:0,

            color:
              "var(--text-secondary)",
          }}
        >
          {time}
        </p>

      </div>


      <span
        style={{
          color:
            "var(--gold-primary)",

          fontSize:12,

          textTransform:"uppercase",

          letterSpacing:".1em",
        }}
      >
        {type}
      </span>


    </motion.div>
  );
}