import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { springs } from "./lib/heyMotion";
import Sidebar from "./Sidebar";
import { useAuth } from "./AuthContext.jsx";
import { createRecord, listRecords } from "./lib/heyRecords.js";
import {
  Flame,
  Plus,
  CheckCircle2,
  Calendar,
  TrendingUp,
  Trophy,
} from "lucide-react";

const habits = [];

export default function HabitsPage() {
  const { user } = useAuth();
  const [habitItems, setHabitItems] = useState(habits);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newHabitOpen, setNewHabitOpen] = useState(false);
  const [newHabitTitle, setNewHabitTitle] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadHabits() {
      if (!user?.id) {
        setLoading(false);
        setHabitItems([]);
        return;
      }
      setLoading(true);
      setError("");

      try {
        const records = await listRecords(user.id, "habit");
        if (cancelled) return;
        const savedHabits = records.map((record) => ({
          id: record.id,
          title: record.title,
          streak: record.metadata?.streak || 0,
          progress: record.metadata?.progress || 0,
          completed: record.metadata?.completed || false,
        }));
        setHabitItems(savedHabits);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Could not load your habits.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHabits();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function addHabit(event) {
    event.preventDefault();
    const title = newHabitTitle.trim();
    if (!title) return;
    const habit = { id: `local-${Date.now()}`, title, streak: 0, progress: 0, completed: false };

    try {
      if (user?.id) {
        const saved = await createRecord(user.id, "habit", {
          title,
          metadata: { streak: 0, progress: 0, completed: false },
        });
        habit.id = saved.id;
      }
      setHabitItems((current) => [...current, habit]);
      setNewHabitTitle("");
      setNewHabitOpen(false);
    } catch (saveError) {
      setError(saveError.message || "Could not save that habit.");
    }
  }

  async function toggleHabit(habit) {
    const newCompleted = !habit.completed;
    const newProgress = newCompleted ? 100 : 0;
    const updatedHabit = { ...habit, completed: newCompleted, progress: newProgress };

    setHabitItems((current) => current.map((h) => (h.id === habit.id ? updatedHabit : h)));

    if (user?.id && !habit.id?.startsWith("local-")) {
      try {
        await createRecord(user.id, "habit", {
          title: habit.title,
          metadata: { streak: habit.streak, progress: newProgress, completed: newCompleted },
        });
      } catch {
        // swallow, UI already updated
      }
    }
  }

  const completedCount = habitItems.filter((habit) => habit.completed).length;
  const longestStreak = habitItems.reduce((max, habit) => Math.max(max, habit.streak), 0);
  const completionRate = habitItems.length
    ? Math.round((completedCount / habitItems.length) * 100)
    : 0;
  const stats = [
    ["Today's Habits", String(habitItems.length)],
    ["Completed", String(completedCount)],
    ["Completion Rate", `${completionRate}%`],
  ];

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--bg-primary)",
      }}
    >
      <Sidebar />

      <main
        style={{
          flex: 1,
          marginLeft: 300,
          padding: 40,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 40,
          }}
        >
          <div>
            <div
              style={{
                color: "var(--gold-primary)",
                fontSize: 12,
                letterSpacing: ".15em",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Daily Systems
            </div>

            <h1
              style={{
                fontFamily: '"Instrument Serif", serif',
                fontSize: 64,
                fontWeight: 400,
              }}
            >
              Habits
            </h1>
          </div>

          <button
            onClick={() => setNewHabitOpen((current) => !current)}
            className="hey-btn-primary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Plus size={18} />
            New Habit
          </button>
        </div>

{newHabitOpen && (
          <form onSubmit={addHabit} className="glass-card" style={{ display: "flex", gap: 10, marginBottom: 28, padding: 16 }}>
            <input
              value={newHabitTitle}
              onChange={(event) => setNewHabitTitle(event.target.value)}
              className="hey-input"
              placeholder="What habit are you building?"
              aria-label="New habit title"
              autoFocus
            />
            <button type="submit" className="hey-btn-primary">Save Habit</button>
          </form>
        )}

        {error && <p style={{ color: "var(--coral)", marginBottom: 20 }}>{error}</p>}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "320px 1fr",
            gap: 28,
          }}
        >
          <div
            className="glass-card"
            style={{
              padding: 26,
            }}
          >
            <Flame
              color="var(--gold-primary)"
              size={30}
            />

            <div
              style={{
                marginTop: 18,
                fontFamily: '"Instrument Serif", serif',
                fontSize: 42,
              }}
            >
              {longestStreak}
            </div>

            <div
              style={{
                color: "var(--text-secondary)",
                marginBottom: 28,
              }}
            >
              Longest Streak
            </div>

            {stats.map(([label, value]) => (
              <div
                key={label}
                style={{
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    color: "var(--text-secondary)",
                    marginBottom: 6,
                  }}
                >
                  {label}
                </div>

                <div
                  style={{
                    fontFamily: '"Instrument Serif", serif',
                    fontSize: 30,
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>

<div
            style={{
              display: "grid",
              gap: 18,
            }}
          >
            {loading ? (
              <p style={{ color: "var(--text-secondary)" }}>Loading your habits...</p>
            ) : habitItems.length === 0 ? (
              <div className="glass-card" style={{ padding: 24, color: "var(--text-secondary)" }}>
                No habits yet. Add your first habit to start tracking it.
              </div>
) : habitItems.map((habit) => (
              <motion.div
                key={habit.id || habit.title}
                whileHover={{ y: -4, transition: springs.gentle }}
                className="glass-card"
                style={{
                  padding: 24,
                  cursor: "pointer",
                }}
                onClick={() => toggleHabit(habit)}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 18,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                    }}
                  >
                    <CheckCircle2
                      size={22}
                      color={
                        habit.completed
                          ? "#6DB58A"
                          : "var(--gold-primary)"
                      }
                    />

                    <h3
                      style={{
                        fontSize: 22,
                      }}
                    >
                      {habit.title}
                    </h3>
                  </div>

                  <span
                    style={{
                      color: "var(--gold-primary)",
                      fontWeight: 600,
                    }}
                  >
                    {habit.streak} 🔥
                  </span>
                </div>

                <div
                  style={{
                    height: 8,
                    background: "rgba(255,255,255,.06)",
                    borderRadius: 999,
                    overflow: "hidden",
                    marginBottom: 18,
                  }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: `${habit.progress}%`,
                    }}
                    transition={springs.gentle}
                    style={{
                      height: "100%",
                      background:
                        "linear-gradient(90deg,var(--green-primary),#6DB58A)",
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 22,
                    color: "var(--text-secondary)",
                    fontSize: 13,
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <Calendar size={14} />
                    {habit.completed ? "Done" : "Today"}
                  </span>

                  <span
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <TrendingUp size={14} />
                    {habit.progress}%
                  </span>

                  <span
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <Trophy size={14} />
                    {habit.completed ? "Complete" : "In Progress"}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
