import { useEffect, useState } from "react";
import { useAuth } from "../../AuthContext.jsx";
import { createRecord, listRecords } from "../../lib/heyRecords.js";
import CalendarEvent from "./CalendarEvent";

export default function CalendarGrid(){
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [type] = useState("Planning");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      if (!user) {
        setLoading(false);
        setEvents([]);
        return;
      }
      setError("");
      try {
        const records = await listRecords(user.id, "event");
        if (!cancelled) setEvents(records);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadEvents();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function addEvent(event) {
    event.preventDefault();
    if (!user || !title.trim()) return;
    try {
      const saved = await createRecord(user.id, "event", {
        title: title.trim(),
        content: time,
        metadata: { type },
      });
      setEvents((current) => [saved, ...current]);
      setTitle("");
      setTime("");
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <form onSubmit={addEvent} style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto", gap:10 }}>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Event title" aria-label="New event title" className="hey-input" />
        <input value={time} onChange={(event) => setTime(event.target.value)} placeholder="Time or date" aria-label="Event time or date" className="hey-input" />
        <button className="hey-btn-primary" type="submit">Add</button>
      </form>
      {error && <p style={{ color:"var(--coral)" }}>{error}</p>}
      {loading && <p style={{ color:"var(--text-secondary)" }}>Loading your schedule...</p>}
      {!loading && events.map((event) => (
        <CalendarEvent
          key={event.id}
          title={event.title}
          time={event.content || "Scheduled"}
          type={event.metadata?.type || "Planning"}
        />
      ))}
      {!loading && !events.length && !error && <p style={{ color:"var(--text-secondary)" }}>Your schedule is ready for its first event.</p>}
    </div>
  );
}
