import { motion } from "framer-motion";
import { CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { buzz, confirmSound } from "../../lib/heyFeedback";
import { press, springs } from "../../lib/heyMotion";
import { useSwipe } from "../../hooks/useSwipe.js";

export default function TaskCard({
  title,
  priority,
  completed,
  onToggle,
  onEdit,
  onDelete,
  deleteArmed,
}) {

const swipe = useSwipe((direction) => {
  if (onToggle && (direction === "left" || direction === "right")) {
    if (!completed) confirmSound();
    onToggle();
  }
}, { threshold: 60 });

return (
    <motion.div
      role={onToggle ? "button" : undefined}
      tabIndex={onToggle ? 0 : undefined}
      aria-pressed={onToggle ? completed : undefined}
      aria-label={onToggle ? `${completed ? "Mark active" : "Complete"} task: ${title}` : undefined}
      whileHover={{
        y:-4,
        transition:springs.gentle,
      }}
      whileTap={{
        scale:0.98,
        transition:press,
      }}
      {...swipe}

      style={{
        display:"flex",

        alignItems:"center",

        gap:16,

        padding:20,

        borderRadius:22,

        background:
          "var(--glass-bg)",

        border:
          "1px solid var(--border)",
        cursor: onToggle ? "pointer" : "default",
      }}
      onClick={() => {
        if (swipe.swipedRef.current) return;
        if (!completed) confirmSound();
        onToggle();
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse") return;
        buzz("light");
      }}
      onKeyDown={onToggle ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      } : undefined}
    >

      <CheckCircle2
        size={22}
        color={
          completed
          ? "var(--forest-primary)"
          : "var(--text-secondary)"
        }
      />


      <div
        style={{
          flex:1,
        }}
      >

        <h3
          style={{
            fontSize:18,

            marginBottom:6,
          }}
        >
          {title}
        </h3>


        <span
          style={{
            color:
              "var(--gold-primary)",

            fontSize:12,

            textTransform:"uppercase",

            letterSpacing:".1em",
          }}
        >
          {priority}
        </span>


      </div>

      <div
        style={{
          display:"flex",

          gap:6,
        }}
        onClick={(event)=>event.stopPropagation()}
        onKeyDown={(event)=>event.stopPropagation()}
      >

        <button
          type="button"
          aria-label={`Edit task: ${title}`}
          title="Edit task"
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
          aria-label={deleteArmed ? `Confirm delete task: ${title}` : `Delete task: ${title}`}
          title={deleteArmed ? "Confirm delete" : "Delete task"}
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