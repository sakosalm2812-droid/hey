import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { springs, press } from "../../../lib/heyMotion";
import { buzz } from "../../../lib/heyFeedback";
import { PenLine, ArrowRight, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../AuthContext.jsx";
import { createRecord } from "../../../lib/heyRecords.js";

export default function QuickNoteWidget() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  const save = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !user?.id) return;
    buzz("light");
    try {
      await createRecord(user.id, "note", {
        title: "Quick note",
        content: trimmed,
      });
      setText("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* swallow */ }
  }, [text, user]);

  const handleKey = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
  };

  return (
    <motion.div
      className="glass-card h-full p-6 flex flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, transition: springs.gentle }}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="badge mb-3 flex w-fit items-center gap-2" style={{ color: "var(--gold)" }}>
            <PenLine size={14} />
            Quick Note
          </div>
          <h2 className="font-heading text-2xl">Capture a thought</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {saved ? "Saved to your notes." : "Write anything. Save instantly."}
          </p>
        </div>
      </div>

      <div className="mt-6 flex-1 flex flex-col gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="What's on your mind?"
          aria-label="Quick note text"
          className="hey-input flex-1 min-h-[80px] resize-none"
        />
        <div className="flex gap-2">
          <motion.button
            type="button"
            onClick={save}
            disabled={!text.trim()}
            className="hey-btn-primary flex items-center gap-2 flex-1 justify-center"
            whileHover={{ scale: 1.02, transition: springs.snappy }}
            whileTap={{ scale: 0.97, transition: press }}
            onPointerDown={() => buzz("light")}
          >
            {saved ? <Check size={16} /> : <PenLine size={16} />}
            {saved ? "Saved" : "Save Note"}
          </motion.button>
          <motion.button
            type="button"
            onClick={() => navigate("/notes")}
            className="hey-btn-ghost flex items-center gap-2"
            whileHover={{ scale: 1.02, transition: springs.snappy }}
            whileTap={{ scale: 0.97, transition: press }}
            onPointerDown={() => buzz("light")}
          >
            <ArrowRight size={16} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
