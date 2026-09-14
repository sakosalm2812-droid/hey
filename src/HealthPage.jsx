import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { springs } from "./lib/heyMotion";
import Sidebar from "./Sidebar";
import { useAuth } from "./AuthContext.jsx";
import { createRecord, listRecords } from "./lib/heyRecords.js";
import {
  HeartPulse,
  Dumbbell,
  Moon,
  Footprints,
  Flame,
  Droplets,
  Timer,
  Plus,
} from "lucide-react";

const METRIC_TYPES = [
  { kind: "workout", unit: "min", label: "Workout" },
  { kind: "sleep", unit: "h", label: "Sleep" },
  { kind: "steps", unit: "steps", label: "Steps" },
  { kind: "water", unit: "L", label: "Water" },
];

export default function HealthPage() {
  const { user } = useAuth();
  const [readings, setReadings] = useState([]);
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newReading, setNewReading] = useState(false);
  const [newKind, setNewKind] = useState("workout");
  const [newValue, setNewValue] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      setError("");

      try {
        const [records, habitRecords] = await Promise.all([
          listRecords(user.id, "health"),
          listRecords(user.id, "habit"),
        ]);
        if (cancelled) return;
        setReadings(records.map((record) => ({
          id: record.id,
          kind: record.metadata?.kind || "other",
          value: Number(record.metadata?.value) || 0,
          createdAt: new Date(record.created_at),
        })));
        setHabits(habitRecords.filter((habit) => habit.completed));
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Could not load your health data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHealth();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function addReading(event) {
    event.preventDefault();
    if (!user?.id) return;

    try {
      const saved = await createRecord(user.id, "health", {
        title: newKind,
        metadata: {
          kind: newKind,
          value: Number(newValue) || 0,
        },
      });
      setReadings((current) => [{
        id: saved.id,
        kind: newKind,
        value: Number(newValue) || 0,
        createdAt: new Date(saved.created_at),
      }, ...current]);
      setNewValue("");
      setNewReading(false);
    } catch (saveError) {
      setError(saveError.message || "That reading could not be saved.");
    }
  }

  const latest = (kind) => {
    const match = readings.find((reading) => reading.kind === kind);
    return match ? match.value : null;
  };

  const todayCount = readings.filter((reading) => reading.createdAt.toDateString() === new Date().toDateString()).length;
  const habitsComplete = habits.length;

  const format = (kind, value) => {
    if (value === null) return "–";
    if (kind === "workout") return `${value} min`;
    if (kind === "sleep") return `${value} h`;
    if (kind === "steps") return value.toLocaleString();
    return `${value} L`;
  };

  const metricCards = METRIC_TYPES.map(({ kind, label }) => ({
    label,
    value: format(kind, latest(kind)),
    icon: metricIcons[kind] || Timer,
  }));

  const metricIcons = {
    workout: Dumbbell,
    sleep: Moon,
    steps: Footprints,
    water: Droplets,
  };

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
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: ".18em",
                marginBottom: 10,
              }}
            >
              Performance
            </div>

            <h1
              style={{
                fontFamily: '"Instrument Serif", serif',
                fontWeight: 400,
                fontSize: 64,
              }}
            >
              Health
            </h1>

            <p style={{ color: "var(--text-secondary)", marginTop: 10 }}>
              A log of readings you enter yourself. HEY does not connect to wearables or guess values.
            </p>
          </div>

          <button
            onClick={() => setNewReading((current) => !current)}
            className="hey-btn-primary"
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <Plus size={18} />
            New Reading
          </button>

          <div
            className="glass-card"
            style={{
              padding: "16px 22px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <HeartPulse color="var(--gold-primary)" />

            Readings
            <strong
              style={{
                marginLeft: 8,
                fontSize: 20,
              }}
            >
              {loading ? "–" : readings.length}
            </strong>
          </div>
        </div>

        {error && <p style={{ color: "var(--coral)", marginBottom: 20 }}>{error}</p>}

        {newReading && (
          <form onSubmit={addReading} className="glass-card" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28, padding: 18 }}>
            <select value={newKind} onChange={(event) => setNewKind(event.target.value)} className="hey-input" aria-label="Reading type">
              {METRIC_TYPES.map(({ kind, label }) => <option key={kind} value={kind}>{label}</option>)}
            </select>
            <input value={newValue} onChange={(event) => setNewValue(event.target.value)} className="hey-input" placeholder="Value" aria-label="Reading value" type="number" autoFocus />
            <button type="submit" className="hey-btn-primary">Save Reading</button>
          </form>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 20,
            marginBottom: 28,
          }}
        >
          {metricCards.map((item) => {
            const Icon = item.icon;
            return (
              <motion.div
                whileHover={{ y: -4, transition: springs.gentle }}
                key={item.label}
                className="glass-card"
                style={{
                  padding: 24,
                }}
              >
                <Icon size={24} color="var(--gold-primary)" /> 
                <div
                  style={{
                    marginTop: 14,
                    color: "var(--text-secondary)",
                  }}
                >
                  {item.label}
                </div>

                <div
                  style={{
                    marginTop: 6,
                    fontFamily: '"Instrument Serif", serif',
                    fontSize: 36,
                  }}
                >
                  {item.value}
                </div>
              </motion.div>
            );
          })}
        </div>

        {loading ? (
          <p style={{ color: "var(--text-secondary)" }}>Loading your health data...</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr .8fr",
              gap: 24,
            }}
          >
            <div className="glass-card" style={{ padding: 28 }}>
              <h2
                style={{
                  fontFamily: '"Instrument Serif", serif',
                  fontSize: 36,
                  fontWeight: 400,
                  marginBottom: 24,
                }}
              >
                Tracking Log
              </h2>

              {readings.length === 0 ? (
                <p style={{ color: "var(--text-secondary)" }}>
                  No readings yet. Add a workout, sleep, steps, or water value and it appears here.
                </p>
              ) : (
                readings.slice(0, 12).map((reading) => {
                  const Icon = metricIcons[reading.kind] || Timer;
                  return (
                    <div
                      key={reading.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "14px 0",
                        borderBottom: "1px solid rgba(255,255,255,.05)",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Icon size={16} color="var(--gold-primary)" />
                        {reading.kind}
                      </span>

                      <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                        {reading.createdAt.toLocaleDateString()}
                      </span>

                      <strong>{format(reading.kind, reading.value)}</strong>
                    </div>
                  );
                })
              )}
            </div>

            <div
              style={{
                display: "grid",
                gap: 20,
              }}
            >
              <div className="glass-card" style={{ padding: 24 }}>
                <Flame color="var(--gold-primary)" />

                <h3
                  style={{
                    marginTop: 18,
                  }}
                >
                  Habits Complete
                </h3>

                <div
                  style={{
                    fontFamily: '"Instrument Serif", serif',
                    fontSize: 44,
                    marginTop: 10,
                  }}
                >
                  {loading ? "–" : habitsComplete}
                </div>

                <p style={{ color: "var(--text-secondary)", marginTop: 8, fontSize: 13 }}>
                  Habits you checked off on the Habits page.
                </p>
              </div>

              <div className="glass-card" style={{ padding: 24 }}>
                <Timer
                  color="var(--gold-primary)"
                />

                <h3
                  style={{
                    marginTop: 18,
                  }}
                >
                  Recorded Today
                </h3>

                <div
                  style={{
                    fontFamily: '"Instrument Serif", serif',
                    fontSize: 44,
                    marginTop: 10,
                  }}
                >
                  {todayCount}
                </div>
              </div>

              <div className="glass-card" style={{ padding: 24 }}>
                <Droplets
                  color="var(--gold-primary)"
                />

                <h3
                  style={{
                    marginTop: 18,
                    marginBottom: 10,
                  }}
                >
                  How HEY records this
                </h3>

                <p
                  style={{
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                  }}
                >
                  Every reading you add is saved to your account. There is no
                  health score and no inference — the numbers are exactly what
                  you logged.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}