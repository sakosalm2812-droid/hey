import { motion } from "framer-motion";
import { Pencil, Trash2 } from "lucide-react";

export default function NoteCard({
  title,
  tag,
  content,
  onEdit,
  onDelete,
  deleteArmed,
}) {
  return (
    <motion.div
      whileHover={{
        y: -4,
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
          marginBottom:14,
        }}
      >

        <h3
          style={{
            fontSize:22,
          }}
        >
          {title}
        </h3>


        <span
          style={{
            fontSize:12,

            color:
              "var(--gold-primary)",

            textTransform:"uppercase",
          }}
        >
          {tag}
        </span>

      </div>


      <p
        style={{
          color:
            "var(--text-secondary)",

          lineHeight:1.8,
        }}
      >
        {content}
      </p>

      <div
        style={{
          display:"flex",

          justifyContent:"flex-end",

          gap:6,

          marginTop:16,
        }}
      >

        <button
          type="button"
          aria-label={`Edit note: ${title}`}
          title="Edit note"
          onClick={onEdit}
          style={{
            display:"grid",

            placeItems:"center",

            width:34,

            height:34,

            border:"1px solid rgba(255,255,255,.1)",

            borderRadius:999,

            background:"rgba(255,255,255,.05)",

            color:"var(--text-secondary)",

            cursor:"pointer",

            transition:"color .2s var(--ease), border-color .2s var(--ease)",
          }}
        >
          <Pencil size={15} />
        </button>

        <button
          type="button"
          aria-label={deleteArmed ? `Confirm delete note: ${title}` : `Delete note: ${title}`}
          title={deleteArmed ? "Confirm delete" : "Delete note"}
          onClick={onDelete}
          style={{
            display:"grid",

            placeItems:"center",

            width:34,

            height:34,

            border: deleteArmed
              ? "1px solid rgba(255,122,138,.5)"
              : "1px solid rgba(255,255,255,.1)",

            borderRadius:999,

            background: deleteArmed
              ? "rgba(255,122,138,.14)"
              : "rgba(255,255,255,.05)",

            color: deleteArmed
              ? "#FFB4BD"
              : "var(--text-secondary)",

            cursor:"pointer",

            transition:"color .2s var(--ease), background .2s var(--ease), border-color .2s var(--ease)",
          }}
        >
          <Trash2 size={15} />
        </button>

      </div>

    </motion.div>
  );
}