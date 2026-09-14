import { motion } from "framer-motion";
import {
  Sparkles,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";

export default function CustomizationFooter({
  theme,
  onReset,
}) {
  return (
    <motion.footer
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        marginTop: 55,
        padding: 28,
        borderRadius: 26,
        border: "1px solid var(--border)",
        background:
          "linear-gradient(135deg, var(--glass-bg), rgba(255,255,255,.018))",
        backdropFilter: "blur(25px)",
        WebkitBackdropFilter: "blur(25px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 25,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 15,
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              display: "grid",
              placeItems: "center",
              borderRadius: 15,
              background: "var(--accent)",
              color: "var(--bg-primary)",
              boxShadow:
                "0 0 28px var(--accent-glow)",
            }}
          >
            <Sparkles size={20} />
          </div>

          <div>
            <strong
              style={{
                display: "block",
                fontSize: 15,
                letterSpacing: "-.02em",
              }}
            >
              Your HEY. Your world.
            </strong>

            <span
              style={{
                display: "block",
                marginTop: 5,
                color: "var(--text-secondary)",
                fontSize: 12,
              }}
            >
              {theme?.name || "Aurora"} is active.
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              color: "var(--text-secondary)",
              fontSize: 11,
            }}
          >
            <ShieldCheck size={15} />
            Saved locally
          </div>

          <button
            type="button"
            onClick={onReset}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--glass-bg)",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <RotateCcw size={14} />
            Restore default
          </button>
        </div>
      </div>
    </motion.footer>
  );
}