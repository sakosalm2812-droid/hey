import { useEffect, useState } from "react";
import PageHeader from "./components/layout/PageHeader";
import HEYCard from "./components/ui/HEYCard";
import { useAuth } from "./AuthContext.jsx";
import { createRecord, listRecords, updateRecord, deleteRecord } from "./lib/heyRecords.js";
import { buzz, confirmSound, errorSound } from "./lib/heyFeedback";

import NoteCard from "./components/notes/NoteCard";
import NotesEditor from "./components/notes/NotesEditor";


export default function NotesPage(){
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingNote, setEditingNote] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadNotes() {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const nextNotes = await listRecords(user.id, "note");
        if (!cancelled) setNotes(nextNotes);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadNotes();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

async function saveNote(note) {
    try {
      if (editingNote?.id) {
        const updated = await updateRecord(editingNote.id, {
          title: note.title,
          content: note.content,
        });
        buzz("light");
        confirmSound();
        setNotes((current) => current.map((item) => item.id === updated.id ? updated : item));
        setEditingNote(null);
        return updated;
      }

      const saved = await createRecord(user.id, "note", note);
      buzz("light");
      confirmSound();
      setNotes((current) => [saved, ...current]);
      return saved;
    } catch (saveError) {
      errorSound();
      setError(saveError.message);
      return null;
    }
  }

  function startEdit(note) {
    setEditingNote(note);
    setError("");
  }

  async function handleDelete(note) {
    if (confirmDeleteId !== note.id) {
      setConfirmDeleteId(note.id);
      setTimeout(() => {
        setConfirmDeleteId((current) => current === note.id ? null : current);
      }, 2600);
      return;
    }

    setConfirmDeleteId(null);
    try {
      await deleteRecord(note.id);
      errorSound();
      setNotes((current) => current.filter((item) => item.id !== note.id));
      if (editingNote?.id === note.id) setEditingNote(null);
    } catch (deleteError) {
      errorSound();
      setError(deleteError.message);
    }
  }

  return (

    <div>

      <PageHeader
        title="Notes"
        subtitle="Capture ideas, knowledge, and moments."
      />


      <div
        style={{
          display:"grid",

          gridTemplateColumns:
          "1fr 380px",

          gap:24,
        }}
      >


        <HEYCard
          padding={24}
        >

          <div
            style={{
              display:"flex",

              flexDirection:"column",

              gap:20,
            }}
          >

{error && <p style={{ color:"var(--coral)", marginBottom:16 }}>{error}</p>}
            {loading && <p style={{ color:"var(--text-secondary)" }}>Loading your notes...</p>}
            {!loading && notes.map((note) => (
                <NoteCard
                  key={note.id}
                  title={note.title}
                  tag={note.metadata?.tag || "Note"}
                  content={note.content}
                  onEdit={() => startEdit(note)}
                  onDelete={() => handleDelete(note)}
                  deleteArmed={confirmDeleteId === note.id}
                />
            ))}
            {!loading && !notes.length && !error && <p style={{ color:"var(--text-secondary)" }}>No notes yet. Write one and it will appear here.</p>}

          </div>


        </HEYCard>



        <NotesEditor
          key={editingNote?.id ?? "new"}
          onSave={saveNote}
          initial={editingNote}
          onCancel={() => setEditingNote(null)}
        />


      </div>


    </div>

  );

}