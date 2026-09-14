import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { buzz, confirmSound } from "./lib/heyFeedback";
import { springs } from "./lib/heyMotion";
import Sidebar from "./Sidebar";
import { useAuth } from "./AuthContext.jsx";
import { createRecord, listRecords, updateRecord } from "./lib/heyRecords.js";
import {
  GraduationCap,
  Brain,
  BookOpen,
  Plus,
  PlayCircle,
  Clock3,
} from "lucide-react";

export default function LearnPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newCourseOpen, setNewCourseOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("Technology");
  const [newLessons, setNewLessons] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCourses() {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      setError("");

      try {
        const records = await listRecords(user.id, "course");
        if (cancelled) return;
        setCourses(records.map((record) => ({
          id: record.id,
          title: record.title,
          category: record.metadata?.category || "Learning",
          lessons: Number(record.metadata?.lessons) || 0,
          done: Number(record.metadata?.done) || 0,
        })));
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Could not load your courses.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCourses();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function addCourse(event) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || !user?.id) return;

    try {
      const saved = await createRecord(user.id, "course", {
        title,
        metadata: {
          category: newCategory,
          lessons: Number(newLessons) || 0,
          done: 0,
        },
      });
      setCourses((current) => [{
        id: saved.id,
        title: saved.title,
        category: newCategory,
        lessons: Number(newLessons) || 0,
        done: 0,
      }, ...current]);
      setNewTitle("");
      setNewLessons("");
      setNewCourseOpen(false);
    } catch (saveError) {
      setError(saveError.message || "Could not save that course.");
    }
  }

  async function advanceCourse(course) {
    if (!user?.id) return;
    const nextDone = Math.min(course.lessons || 1, (course.done || 0) + 1);
    try {
      const updated = await updateRecord(course.id, {
        metadata: {
          category: course.category,
          lessons: course.lessons,
          done: nextDone,
        },
      });
      setCourses((current) => current.map((item) => item.id === course.id
        ? { ...item, done: updated.metadata?.done ?? nextDone }
        : item));
    } catch {
      setError("That lesson could not be recorded.");
    }
  }

  const totalLessons = courses.reduce((sum, course) => sum + course.lessons, 0);
  const totalDone = courses.reduce((sum, course) => sum + course.done, 0);
  const completedCourses = courses.filter((course) => course.lessons > 0 && course.done >= course.lessons).length;
  const progressFor = (course) => course.lessons ? Math.min(100, Math.round((course.done / course.lessons) * 100)) : 0;
  const nextCourse = courses.find((course) => course.lessons > 0 && course.done < course.lessons);

  const stats = [
    ["Courses", String(courses.length)],
    ["Lessons", String(totalLessons)],
    ["Completed", String(completedCourses)],
    ["Lessons Done", String(totalDone)],
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
            marginBottom: 36,
          }}
        >
          <div>
            <div
              style={{
                color: "var(--gold-primary)",
                letterSpacing: ".18em",
                textTransform: "uppercase",
                fontSize: 12,
                marginBottom: 10,
              }}
            >
              Growth
            </div>

            <h1
              style={{
                fontFamily: '"Instrument Serif", serif',
                fontWeight: 400,
                fontSize: 64,
              }}
            >
              Learn
            </h1>

            <p style={{ color: "var(--text-secondary)", marginTop: 10 }}>
              Track the courses you are studying and your progress through them.
            </p>
          </div>

          <button
            onClick={() => setNewCourseOpen((current) => !current)}
            className="hey-btn-primary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Plus size={18} />
            New Course
          </button>
        </div>

        {error && <p style={{ color: "var(--coral)", marginBottom: 20 }}>{error}</p>}

        {newCourseOpen && (
          <form onSubmit={addCourse} className="glass-card" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28, padding: 18 }}>
            <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} className="hey-input" placeholder="Course name" aria-label="New course name" autoFocus />
            <input value={newLessons} onChange={(event) => setNewLessons(event.target.value)} className="hey-input" placeholder="Total lessons" aria-label="Total lessons" type="number" min="0" />
            <select value={newCategory} onChange={(event) => setNewCategory(event.target.value)} className="hey-input" aria-label="Course category">
              {["Technology", "Business", "Mind", "Faith", "Creative"].map((value) => <option key={value}>{value}</option>)}
            </select>
            <button type="submit" className="hey-btn-primary">Save Course</button>
          </form>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 20,
            marginBottom: 30,
          }}
        >
          {stats.map(([label, value]) => (
            <div
              key={label}
              className="glass-card"
              style={{ padding: 24 }}
            >
              <div
                style={{
                  color: "var(--text-secondary)",
                  marginBottom: 8,
                }}
              >
                {label}
              </div>

              <div
                style={{
                  fontFamily: '"Instrument Serif", serif',
                  fontSize: 38,
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        {loading ? (
          <p style={{ color: "var(--text-secondary)" }}>Loading your courses...</p>
        ) : courses.length === 0 ? (
          <div className="glass-card" style={{ padding: 28, color: "var(--text-secondary)" }}>
            No courses yet. Add your first course and HEY will track your progress through its lessons.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(360px,1fr))",
              gap: 22,
            }}
          >
            {courses.map((course) => (
              <motion.div
                key={course.id}
                whileHover={{
                  y: -4,
                  transition: springs.gentle,
                }}
                className="glass-card"
                style={{
                  padding: 24,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 18,
                  }}
                >
                  <GraduationCap
                    color="var(--gold-primary)"
                  />

                  <button
                    type="button"
                    onClick={() => {
                    confirmSound();
                    advanceCourse(course);
                  }}
                    onPointerDown={() => buzz("light")}
                    className="hey-btn-ghost"
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px" }}
                    aria-label={`Record a completed lesson in ${course.title}`}
                  >
                    <PlayCircle size={16} />
                    Lesson done
                  </button>
                </div>

                <h2
                  style={{
                    fontSize: 24,
                    marginBottom: 8,
                  }}
                >
                  {course.title}
                </h2>

                <div
                  style={{
                    color: "var(--text-secondary)",
                    marginBottom: 20,
                  }}
                >
                  {course.category}
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
                      width: `${progressFor(course)}%`,
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
                    justifyContent: "space-between",
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
                    <BookOpen size={14} />
                    {course.done} of {course.lessons || "-"} lessons done
                  </span>

                  <span>{progressFor(course)}%</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 20,
            marginTop: 28,
          }}
        >
          <div className="glass-card" style={{ padding: 24 }}>
            <PlayCircle
              color="var(--gold-primary)"
            />

            <h3
              style={{
                marginTop: 18,
                marginBottom: 12,
              }}
            >
              Continue Learning
            </h3>

            <p
              style={{
                color: "var(--text-secondary)",
                lineHeight: 1.8,
              }}
            >
              {nextCourse
                ? `Next up is "${nextCourse.title}" — ${nextCourse.done} of ${nextCourse.lessons} lessons done.`
                : "Add a course and mark lessons done as you finish them. HEY will track your progress here."}
            </p>
          </div>

          <div className="glass-card" style={{ padding: 24 }}>
            <Brain
              color="var(--gold-primary)"
            />

            <h3
              style={{
                marginTop: 18,
                marginBottom: 12,
              }}
            >
              How HEY tracks this
            </h3>

            <p
              style={{
                color: "var(--text-secondary)",
                lineHeight: 1.8,
              }}
            >
              Progress is stored with your account and updates only from the
              "Lesson done" buttons. HEY never guesses how much you have studied.
            </p>

            <div
              style={{
                display: "flex",
                gap: 20,
                marginTop: 20,
                color: "var(--text-secondary)",
              }}
            >
              <span
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                <Clock3 size={14} />
                {totalLessons ? `${totalDone} / ${totalLessons} lessons` : "No lessons yet"}
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}