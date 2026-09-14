import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";

export default function MemoryCard({
  title,
  category,
  date,
  description,
  id,
  onDelete,
}) {

  return (
    <motion.div
      whileHover={{
        y:-4,
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
      }}
    >

      <div
        style={{
          display:"flex",

          justifyContent:"space-between",

          marginBottom:16,
        }}
      >

        <span
          style={{
            color:
            "var(--gold-primary)",

            fontSize:12,

            textTransform:"uppercase",

            letterSpacing:".1em",
          }}
        >
          {category}
        </span>


        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              color:
              "var(--text-secondary)",

              fontSize:12,
            }}
          >
            {date}
          </span>

          {onDelete && (
            <button
              type="button"
              aria-label="Delete memory"
              onClick={() => onDelete(id)}
              style={{
                display: "grid",
                placeItems: "center",
                border: "none",
                background: "transparent",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>

      </div>



      <h3
        style={{
          fontSize:24,

          marginBottom:12,
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
