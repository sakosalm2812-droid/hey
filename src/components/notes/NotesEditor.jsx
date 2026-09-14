import { motion } from "framer-motion";
import { useState } from "react";

export default function NotesEditor({ onSave, initial, onCancel }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(initial?.id);

  async function saveNote() {
    if (!title.trim() && !content.trim()) return;
    setSaving(true);
    const saved = await onSave({ title: title.trim() || "Untitled note", content: content.trim() });
    if (!saved) {
      setSaving(false);
      return;
    }
    setTitle("");
    setContent("");
    setSaving(false);
  }

  return (
    <motion.div
      initial={{
        opacity: 0,
        y: 10,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      style={{
        padding: 28,

        borderRadius: 28,

        background:
          "var(--glass-bg)",

        border:
          "1px solid var(--border)",

        backdropFilter:
          "blur(20px)",
      }}
    >

      <h2
        style={{
          fontSize:32,
          marginBottom:20,
        }}
      >
        {isEditing ? "Edit Note" : "New Note"}
      </h2>


<input
        placeholder="Title..."
        aria-label="Note title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        style={{
          width:"100%",

          padding:14,

          marginBottom:16,

          background:
            "rgba(255,255,255,.04)",

          border:
            "1px solid var(--border)",

          borderRadius:16,

          color:"var(--text-primary)",

          outline:"none",
        }}
      />


<textarea
        placeholder="Write your thoughts..."
        aria-label="Note body"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        style={{
          width:"100%",

          minHeight:220,

          padding:16,

          resize:"none",

          background:
            "rgba(255,255,255,.04)",

          border:
            "1px solid var(--border)",

          borderRadius:16,

          color:"var(--text-primary)",

          outline:"none",

          lineHeight:1.7,
        }}
      />

      <div
        style={{
          display:"flex",

          gap:10,

          marginTop:16,
        }}
      >
        <button
          type="button"
          className="hey-btn-primary"
          onClick={saveNote}
          disabled={saving}
          style={{ flex:1 }}
        >
          {saving ? "Saving..." : isEditing ? "Save changes" : "Save note"}
        </button>

        {isEditing && (
          <button
            type="button"
            className="hey-btn-ghost"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
        )}
      </div>

    </motion.div>
  );
}