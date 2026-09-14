import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { springs } from "./lib/heyMotion";
import {
  BookOpen,
  PenSquare,
  Calendar,
  Search,
  Heart,
  Sparkles,
  Brain,
  Clock,
  Feather,
} from "lucide-react";

import Sidebar from "./Sidebar";
import { useAuth } from "./AuthContext.jsx";
import { createRecord, listRecords } from "./lib/heyRecords.js";


const moods = [
  "Focused",
  "Inspired",
  "Grateful",
  "Creative",
  "Reflective",
  "Calm",
  "Energetic",
  "Thoughtful",
];


function dailyStreak(entries) {
  const days = new Set(entries.map((entry) => entry.day).filter(Boolean));
  let streak = 0;
  const cursor = new Date();
  if (!days.has(cursor.toDateString())) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (days.has(cursor.toDateString())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}


export default function JournalPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selectedMood, setSelectedMood] = useState("Reflective");
  const [error, setError] = useState("");

  const [search,setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadJournal() {
      if (!user) {
        setLoading(false);
        setEntries([]);
        return;
      }
      setLoading(true);
      setError("");

      try {
        const records = await listRecords(user.id, "journal");
        if (cancelled) return;
        setEntries(records.map((record) => ({
          id: record.id,
          title: record.title,
          mood: record.metadata?.mood || "Reflective",
          date: new Date(record.created_at).toLocaleDateString(),
          day: new Date(record.created_at).toDateString(),
          preview: record.content,
          insight: "Saved to your private HEY journal.",
        })));
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Could not load your journal.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadJournal();

    return () => {
      cancelled = true;
    };
  }, [user]);

  async function saveEntry(event) {
    event.preventDefault();
    if (!user || !content.trim()) return;
    try {
      const record = await createRecord(user.id, "journal", {
        title: title.trim() || "Journal entry",
        content: content.trim(),
        metadata: { mood: selectedMood },
      });
      setEntries((current) => [{
        id: record.id,
        title: record.title,
        mood: selectedMood,
        date: "Today",
        day: new Date().toDateString(),
        preview: record.content,
        insight: "Saved to your private HEY journal.",
      }, ...current]);
      setTitle("");
      setContent("");
      setSelectedMood("Reflective");
      setComposerOpen(false);
    } catch (saveError) {
      setError(saveError.message || "Could not save that entry.");
    }
  }

  const filteredEntries =
    entries.filter((entry)=>
      entry.title
      .toLowerCase()
      .includes(search.toLowerCase())
    );

  const totalEntries = entries.length;
  const totalWords = entries.reduce((sum, entry) =>
    sum + String(entry.preview || "").trim().split(/\s+/).filter(Boolean).length, 0);
  const currentStreak = dailyStreak(entries);
  const commonMoods = Array.from(new Set(entries.map((entry) => entry.mood)));


  return (

    <div className="page-with-sidebar">

      <Sidebar />


      <main className="page-content">

        <motion.div
          className="px-8 py-8"
          initial={{
            opacity:0,
            y:20,
          }}
          animate={{
            opacity:1,
            y:0,
          }}
        >


          <div className="mb-10 flex items-center justify-between">

            <div>

              <div className="section-label mb-3">
                Personal Reflection
              </div>


              <h1 className="font-heading text-6xl">
                Journal
              </h1>


              <p className="mt-3 text-[var(--text-secondary)]">
                Your private space for thoughts, memories, and self discovery.
              </p>

            </div>


            <button
              className="hey-btn-primary flex items-center gap-2"
              onClick={() => setComposerOpen((current) => !current)}
            >
              <PenSquare size={18}/>
              New Entry
            </button>

          </div>

          {error && <p className="mb-4 text-[var(--coral)]">{error}</p>}

{composerOpen && (
            <form onSubmit={saveEntry} className="glass-card mb-6 p-6">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Entry title"
                aria-label="Journal entry title"
                className="hey-input mb-3 w-full"
              />
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="What is on your mind?"
                aria-label="Journal entry body"
                className="hey-input mb-3 min-h-40 w-full"
              />
              <div className="mb-3">
                <div className="text-sm text-[var(--text-secondary)] mb-2">How are you feeling?</div>
                <div className="flex flex-wrap gap-2">
                  {moods.map((mood) => (
                    <button
                      key={mood}
                      type="button"
                      onClick={() => setSelectedMood(mood)}
                      className={`badge cursor-pointer transition ${
                        selectedMood === mood
                          ? "bg-[var(--accent)] text-white"
                          : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,.08)]"
                      }`}
                    >
                      {mood}
                    </button>
                  ))}
                </div>
              </div>
              <button className="hey-btn-primary" type="submit">Save entry</button>
            </form>
          )}




          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">



            <aside className="glass-card p-6">


              <div className="mb-8 flex items-center gap-3">

                <Search
                  size={18}
                  color="var(--text-secondary)"
                />


                <input
                  value={search}
                  onChange={(e)=>setSearch(e.target.value)}
                  placeholder="Search journal..."
                  aria-label="Search journal"
                  className="hey-input flex-1"
                />

              </div>




              <div className="space-y-6">


                {[
                  ["Entries", String(totalEntries)],
                  [currentStreak > 0 ? "Current Streak" : "Longest Streak", `${currentStreak} Day${currentStreak === 1 ? "" : "s"}`],
                  ["Words Written", totalWords.toLocaleString()],
                ].map(([label,value])=>(

                  <div key={label}>

                    <div className="text-sm text-[var(--text-secondary)]">
                      {label}
                    </div>

                    <div className="mt-2 font-heading text-4xl">
                      {value}
                    </div>

                  </div>

                ))}


              </div>




              <div className="mt-10">

                <div className="mb-4 flex items-center gap-2">
                  <Brain
                    size={18}
                    color="var(--gold)"
                  />

                  <span>
                    Your Moods
                  </span>
                </div>


                <div className="flex flex-wrap gap-2">

                {(commonMoods.length ? commonMoods : moods).map((mood)=>(

                  <span
                    key={mood}
                    className="badge"
                  >
                    {mood}
                  </span>

                ))}

                </div>

                {commonMoods.length === 0 && (
                  <p className="mt-3 text-sm text-[var(--text-secondary)]">
                    Moods appear here as you write entries.
                  </p>
                )}


              </div>


            </aside>





            <section className="space-y-5">

            {loading ? (
              <p className="text-[var(--text-secondary)]">Loading your journal...</p>
            ) : filteredEntries.length === 0 ? (
              <div className="glass-card p-7 text-[var(--text-secondary)] leading-7">
                {entries.length === 0
                  ? "Nothing here yet. Write your first entry and it will appear here."
                  : "No entries match your search."}
              </div>
) : filteredEntries.map((entry) => (

              <motion.article
                key={entry.id || entry.title}
                className="glass-card p-7"
                whileHover={{
                  y:-4,
                  transition:springs.gentle,
                }}
              >


                <div className="flex items-start justify-between">


                  <div className="flex items-center gap-3">

                    <div className="rounded-2xl bg-[rgba(247,201,111,.12)] p-3">

                      <BookOpen
                        size={22}
                        color="var(--gold)"
                      />

                    </div>


                    <div>

                      <h2 className="font-heading text-2xl">
                        {entry.title}
                      </h2>

                      <span className="text-sm text-[var(--gold)]">
                        {entry.mood}
                      </span>

                    </div>


                  </div>


                  <Heart
                    size={20}
                    color="var(--coral)"
                  />


                </div>





                <p className="mt-5 leading-8 text-[var(--text-secondary)]">
                  {entry.preview}
                </p>




                <div className="mt-5 glass-card p-4">

                  <div className="flex items-center gap-2 text-sm">

                    <Sparkles
                      size={15}
                      color="var(--gold)"
                    />

                    From HEY

                  </div>


                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {entry.insight}
                  </p>

                </div>




                <div className="mt-5 flex gap-6 text-sm text-[var(--text-secondary)]">


                  <span className="flex items-center gap-2">

                    <Calendar size={14}/>

                    {entry.date}

                  </span>



                  <span className="flex items-center gap-2">

                    <Clock size={14}/>

                    Reflection

                  </span>



                  <span className="flex items-center gap-2">

                    <Feather size={14}/>

                    Personal Growth

                  </span>


                </div>



              </motion.article>

            ))}


            </section>


          </div>


        </motion.div>

      </main>


    </div>

  );

}
