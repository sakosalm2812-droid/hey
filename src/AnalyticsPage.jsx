import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { springs } from "./lib/heyMotion";
import Sidebar from "./Sidebar";
import { useAuth } from "./AuthContext.jsx";
import { listRecords } from "./lib/heyRecords.js";
import { getMemory } from "./lib/heyMemory.js";
import { listAuditEntries } from "./core/auditLog.js";
import { subscribe } from "./core/eventBus.js";
import allAgents from "../agents/agents.js";

import {
  BarChart3,
  Brain,
  Clock3,
  Sparkles,
  Activity,
  Target,
  TrendingUp,
  Network,
  Database,
  BookOpen,
  ShieldCheck,
} from "lucide-react";


function journalStreak(entries) {
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


function lastSevenDays() {
  const labels = [];
  for (let index = 6; index >= 0; index -= 1) {
    const day = new Date();
    day.setDate(day.getDate() - index);
    labels.push(day.toDateString());
  }
  return labels;
}


function explainReceipt(entry) {
  const action = entry.action || "unknown";
  if (action.startsWith("authorization.")) return "Checked who is allowed to do this and recorded the decision.";
  if (action.startsWith("execution.")) return "Ran a verified action through the execution layer.";
  if (action.startsWith("memory.")) return "Created, approved, or rejected a stored memory.";
  if (action.startsWith("device.handoff")) return "Passed or accepted your place between devices.";
  if (action.startsWith("fabric.")) return "Broadcast or received device presence.";
  if (action.startsWith("permission.")) return "Granted, revoked, or checked a permission.";
  if (action.startsWith("skill.")) return "Created or ran a reusable skill workflow.";
  if (action.startsWith("tool.")) return "Called a tool with a verified result.";
  if (action.startsWith("workflow.")) return "Prepared or ran a multi-step workflow.";
  return "Recorded an internal HEY event.";
}

function riskColor(riskLevel) {
  switch (riskLevel) {
    case "critical":
    case "high":
      return "var(--coral)";
    case "medium":
      return "var(--gold-primary)";
    default:
      return "var(--green-accent)";
  }
}


export default function AnalyticsPage(){

  const { user } = useAuth();
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [tasksTotal, setTasksTotal] = useState(0);
  const [journalEntries, setJournalEntries] = useState([]);
  const [memories, setMemories] = useState(0);
  const [goals, setGoals] = useState(0);
  const [habits, setHabits] = useState([]);
  const [activity, setActivity] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let stop = null;

    async function loadAnalytics() {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      setError("");

      const refresh = async () => {
        try {
          const [tasks, journal, memoryNodes, goalRecords, habitRecords, audit] = await Promise.all([
            listRecords(user.id, "task"),
            listRecords(user.id, "journal"),
            getMemory(user.id),
            listRecords(user.id, "goal"),
            listRecords(user.id, "habit"),
            Promise.resolve(listAuditEntries(500)),
          ]);
          if (cancelled) return;

          const completed = tasks.filter((task) => task.status === "completed").length;
          setTasksCompleted(completed);
          setTasksTotal(tasks.length);
          setJournalEntries(journal.map((record) => ({
            day: new Date(record.created_at).toDateString(),
          })));
          setMemories(memoryNodes.length);
          setGoals(goalRecords.length);
          setHabits(habitRecords);

          const labels = lastSevenDays();
          setActivity(labels.map((label) =>
            audit.filter((entry) => new Date(entry.createdAt).toDateString() === label).length
          ));
          setReceipts(audit.slice(0, 25));
        } catch (loadError) {
          if (!cancelled) setError(loadError.message || "Could not load your analytics.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      };

      await refresh();
      stop = subscribe("audit.recorded", () => {
        if (!cancelled) refresh();
      });
    }

    loadAnalytics();

    return () => {
      cancelled = true;
      if (stop) stop();
    };
  }, [user?.id]);

  const streak = journalStreak(journalEntries);
  const habitsComplete = habits.filter((habit) => habit.completed).length;
  const completionRate = tasksTotal ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;
  const maxActivity = Math.max(1, ...activity);

  const overview = [
    {
      title: "Tasks Completed",
      value: tasksTotal ? `${tasksCompleted}/${tasksTotal}` : "0",
      icon: Clock3,
    },
    {
      title: "Journal Entries",
      value: String(journalEntries.length),
      icon: BookOpen,
    },
    {
      title: "Memories Stored",
      value: String(memories),
      icon: Database,
    },
    {
      title: "Active Goals",
      value: String(goals),
      icon: Target,
    },
  ];

  const systems = [
    {
      name: "Agents",
      value: `${allAgents.length} specialists available`,
      icon: Network,
    },
    {
      name: "Memory",
      value: `${memories} nodes stored`,
      icon: Database,
    },
    {
      name: "Goals",
      value: `${goals} goals tracked`,
      icon: Target,
    },
  ];

  const facts = [
    {
      title: "Journal Streak",
      text: streak > 0
        ? `${streak} day${streak === 1 ? "" : "s"} in a row.`
        : "Write a journal entry today to start a streak.",
      icon: TrendingUp,
    },
    {
      title: "Task Completion",
      text: tasksTotal
        ? `${tasksCompleted} of ${tasksTotal} tasks completed (${completionRate}%).`
        : "Add tasks to see your completion rate.",
      icon: Brain,
    },
    {
      title: "Habits",
      text: habits.length
        ? `${habitsComplete} of ${habits.length} habits are complete today.`
        : "Add a habit to start tracking consistency.",
      icon: Sparkles,
    },
  ];


  return (

    <div
      style={{
        display:"flex",
        minHeight:"100vh",
        background:"var(--bg-primary)",
      }}
    >

      <Sidebar />


      <main
        style={{
          flex:1,
          marginLeft:300,
          padding:40,
        }}
      >


        <div
          style={{
            display:"flex",
            justifyContent:"space-between",
            alignItems:"center",
            marginBottom:45,
          }}
        >

          <div>

            <div
              style={{
                color:"var(--gold-primary)",
                fontSize:12,
                letterSpacing:".2em",
                textTransform:"uppercase",
                marginBottom:12,
              }}
            >
              Your Activity
            </div>


            <h1
              style={{
                fontFamily:'"Instrument Serif", serif',
                fontSize:68,
                fontWeight:400,
              }}
            >
              Analytics
            </h1>


            <p
              style={{
                color:"var(--text-secondary)",
                marginTop:12,
                fontSize:16,
              }}
            >
              Real numbers from your saved tasks, journal, memory, and habits.
            </p>

          </div>



          <div
            className="glass-card"
            style={{
              padding:"18px 24px",
              display:"flex",
              alignItems:"center",
              gap:12,
            }}
          >

            <Activity
              color="var(--gold-primary)"
            />

            Tasks Done

            <strong
              style={{
                fontSize:24,
                color:"var(--gold-primary)",
              }}
            >
              {loading ? "–" : tasksCompleted}
            </strong>

          </div>


        </div>

        {error && <p style={{ color:"var(--coral)", marginBottom:20 }}>{error}</p>}

        {loading ? (
          <p style={{ color:"var(--text-secondary)" }}>Loading your analytics...</p>
        ) : (


        <>
        {/* Overview Cards */}

                <div
          style={{
            display:"grid",
            gridTemplateColumns:"repeat(4,1fr)",
            gap:20,
            marginBottom:30,
          }}
        >

          {overview.map((item)=>{

            const Icon = item.icon;

            return (

              <motion.div
                key={item.title}
                whileHover={{
                  y:-4,
                  transition:springs.gentle,
                }}
                className="glass-card"
                style={{
                  padding:26,
                }}
              >

                <Icon
                  size={24}
                  color="var(--gold-primary)"
                />


                <div
                  style={{
                    marginTop:18,
                    fontSize:42,
                    fontFamily:'"Instrument Serif", serif',
                  }}
                >
                  {item.value}
                </div>


                <div
                  style={{
                    color:"var(--text-secondary)",
                    marginTop:6,
                    fontSize:13,
                  }}
                >
                  {item.title}
                </div>


              </motion.div>

            );

          })}

        </div>




        {/* Main Analytics Grid */}


        <div
          style={{
            display:"grid",
            gridTemplateColumns:"1.5fr .8fr",
            gap:24,
          }}
        >



          {/* Activity Graph */}


          <div
            className="glass-card"
            style={{
              padding:30,
            }}
          >

            <div
              style={{
                display:"flex",
                justifyContent:"space-between",
                alignItems:"center",
                marginBottom:30,
              }}
            >

              <div>

                <h2
                  style={{
                    fontFamily:'"Instrument Serif", serif',
                    fontSize:36,
                    fontWeight:400,
                  }}
                >
                  Recent Activity
                </h2>


                <p
                  style={{
                    color:"var(--text-secondary)",
                    marginTop:8,
                  }}
                >
                  HEY actions recorded per day over the last 7 days
                </p>

              </div>


              <BarChart3
                color="var(--gold-primary)"
              />


            </div>




            <div
              style={{
                height:280,
                display:"flex",
                alignItems:"flex-end",
                gap:18,
              }}
            >

              {activity.map((value,index)=>(

                <motion.div

                  key={index}

                  initial={{
                    height:0,
                  }}

                  animate={{
                    height:`${(value/maxActivity)*100}%`,
                  }}

                  transition={{
                    duration:.8,
                    delay:index*.08,
                  }}

                  style={{
                    flex:1,
                    borderRadius:18,
                    minHeight:value ? 20 : 4,
                    background:
                    "linear-gradient(180deg,#F7C96F,var(--green-primary))",
                  }}

                  title={`${value} action${value === 1 ? "" : "s"}`}

                />

              ))}


            </div>


          </div>




          {/* HEY Systems */}


          <div
            style={{
              display:"grid",
              gap:18,
            }}
          >

            {systems.map((system)=>{

              const Icon = system.icon;


              return (

                <motion.div
                  key={system.name}
                  whileHover={{
                    x:4,
                    transition:springs.snappy,
                  }}
                  className="glass-card"
                  style={{
                    padding:24,
                  }}
                >

                  <Icon
                    size={24}
                    color="var(--gold-primary)"
                  />


                  <h3
                    style={{
                      marginTop:18,
                      fontSize:22,
                    }}
                  >
                    {system.name}
                  </h3>


                  <p
                    style={{
                      color:"var(--text-secondary)",
                      marginTop:8,
                    }}
                  >
                    {system.value}
                  </p>


                </motion.div>

              );

            })}

          </div>


        </div>
                {/* Your HEY Activity */}


                <div
          style={{
            marginTop:30,
            display:"grid",
            gridTemplateColumns:"repeat(3,1fr)",
            gap:20,
          }}
        >

          {facts.map((item)=>{

            const Icon = item.icon;


            return (

              <motion.div
                key={item.title}
                whileHover={{
                  y:-4,
                  transition:springs.gentle,
                }}
                className="glass-card"
                style={{
                  padding:26,
                }}
              >

                <Icon
                  size={26}
                  color="var(--gold-primary)"
                />


                <h3
                  style={{
                    marginTop:18,
                    fontSize:22,
                  }}
                >
                  {item.title}
                </h3>


                <p
                  style={{
                    marginTop:12,
                    color:"var(--text-secondary)",
                    lineHeight:1.8,
                    fontSize:14,
                  }}
                >
                  {item.text}
                </p>


              </motion.div>

            );

          })}


        </div>




        {/* Activity Receipts */}

        <div
          className="glass-card"
          style={{
            padding: 30,
            marginTop: 30,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 8,
            }}
          >
            <ShieldCheck
              size={24}
              style={{ color: "var(--green-accent)" }}
            />

            <h2
              style={{
                fontFamily: '"Instrument Serif", serif',
                fontSize: 38,
                fontWeight: 400,
              }}
            >
              Activity receipts
            </h2>
          </div>

          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: 14,
              lineHeight: 1.7,
              marginBottom: 20,
            }}
          >
            Every meaningful action leaves a receipt — what ran, what it touched, and when.
            Receipts come from the real audit log; nothing is invented here.
          </p>

          {receipts.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
              No receipts yet. Ask HEY to do something with permission, and a receipt appears here.
            </p>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {receipts.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "12px 16px",
                    borderRadius: 14,
                    background: "rgba(255,255,255,.03)",
                    border: "1px solid rgba(255,255,255,.05)",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      marginTop: 6,
                      flexShrink: 0,
                      background: riskColor(entry.riskLevel),
                    }}
                  />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                      {entry.action}
                      {entry.tool ? <span style={{ opacity: 0.6, fontWeight: 400 }}> · {entry.tool}</span> : null}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.5 }}>
                      {explainReceipt(entry)}
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      flexShrink: 0,
                      textAlign: "right",
                    }}
                  >
                    <div style={{ textTransform: "capitalize" }}>
                      {entry.status}
                    </div>
                    <div style={{ opacity: 0.7, marginTop: 2 }}>
                      {new Date(entry.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Analytics Report */}


        <motion.div

          whileHover={{
            y:-4,
            transition:springs.gentle,
          }}

          className="glass-card"

          style={{
            padding:32,
            marginTop:30,
          }}

        >

          <div
            style={{
              display:"flex",
              alignItems:"center",
              gap:14,
              marginBottom:18,
            }}
          >

            <Activity
              color="var(--gold-primary)"
              size={26}
            />


            <h2
              style={{
                fontFamily:'"Instrument Serif", serif',
                fontSize:38,
                fontWeight:400,
              }}
            >
              What this page shows
            </h2>


          </div>



          <p
            style={{
              color:"var(--text-secondary)",
              lineHeight:2,
              fontSize:15,
            }}
          >

            These numbers come directly from what you have saved:
            tasks, journal entries, memory nodes, goals, habits, and
            the HEY audit log.

            <br/><br/>

            HEY does not guess your mood, focus, or sleep. Insights
            here are limited to clear counts from your own records so
            nothing is invented on your behalf.

            <br/><br/>

            To grow these numbers: finish tasks, write journal entries,
            add memory nodes, and update your goals and habits.

          </p>


        </motion.div>

</>
        )}


      </main>


    </div>

  );

}