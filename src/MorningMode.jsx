import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { buzz } from "./lib/heyFeedback";
import {
  Sun,
  Mic,
  Camera,
  CloudSun,
  CheckCircle2,
  Circle,
  Quote,
  ArrowRight,
  X,
  Volume2,
  Brain,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import { listRecords, updateRecord } from "./lib/heyRecords.js";
import { createMorningBriefing } from "./core/briefingEngine.js";

const stages = [
  "wake",
  "overview",
  "focus",
];

export default function MorningMode() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [stage, setStage] = useState(0);
  const [plan, setPlan] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wins, setWins] = useState([]);
  const [briefing, setBriefing] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDay() {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        const [tasks, goalRecords] = await Promise.all([
          listRecords(user.id, "task"),
          listRecords(user.id, "goal"),
        ]);
        if (cancelled) return;

        const pendingTasks = tasks
          .filter((task) => task.status !== "completed")
          .slice(0, 6)
          .map((task) => ({
            title: task.title,
            time: task.due_at
              ? new Date(task.due_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "Today",
          }));

        const goalTexts = goalRecords.slice(0, 6).map((goal) => ({
          id: goal.id,
          text: goal.title,
        }));

        setPlan(pendingTasks);
        setWins(goalTexts.map((goal) => {
          const record = goalRecords.find((g) => g.id === goal.id);
          const today = new Date().toDateString();
          const completedDays = record?.metadata?.completedDays || [];
          return {
            id: goal.id,
            recordId: record?.id,
            text: goal.text,
            metadata: record?.metadata || {},
            streak: record?.metadata?.streak || 0,
            completedDays,
            done: Array.isArray(completedDays) && completedDays.includes(today),
          };
        }));

        setBriefing(createMorningBriefing({
          greeting: "Good morning.",
          tasks,
          priorities: goalTexts.map((goal) => ({ description: goal.text })),
        }));
      } catch {
        if (!cancelled) setPlan([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDay();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  function toggleGoal(id) {
    buzz("light");
    setWins((current) => {
      const next = current.map((goal) => {
        const isDone = goal.id === id ? !goal.done : goal.done;
        if (goal.id === id && goal.recordId) {
          const completedDays = goal.completedDays || [];
          const today = new Date().toDateString();
          const updatedDays = isDone
            ? Array.from(new Set([...completedDays, today]))
            : completedDays.filter((day) => day !== today);
          updateRecord(goal.recordId, {
            status: "active",
            metadata: {
              ...goal.metadata,
              completedToday: isDone,
              streak: isDone ? (goal.streak || 0) + 1 : Math.max(0, (goal.streak || 0) - 1),
              completedDays: updatedDays,
            },
          }).catch(() => {});
        }
        return goal.id === id ? { ...goal, done: isDone } : goal;
      });
      return next;
    });
  }

  function next() {
    if (stage === stages.length - 1) {
      navigate("/chat");
      return;
    }

    setStage((value) => value + 1);
  }

  return (
    <div className="landscape-bg min-h-screen flex items-center justify-center p-6">

      <button
        onClick={() => navigate("/chat")}
        aria-label="Exit morning mode"
        className="absolute right-6 top-6 glass-card p-3"
      >
        <X size={18}/>
      </button>


      <motion.div
        className="glass-card w-full max-w-xl p-8 text-center"
        initial={{
          opacity:0,
          y:20,
        }}
        animate={{
          opacity:1,
          y:0,
        }}
      >

        <div className="mb-8 flex justify-center gap-2">
          {stages.map((item,index)=>(
            <div
              key={item}
              className={
                `h-2 rounded-full transition-all ${
                  index <= stage
                  ? "w-8 bg-[var(--gold)]"
                  : "w-2 bg-white/20"
                }`
              }
            />
          ))}
        </div>



        <AnimatePresence mode="wait">

        {stage === 0 && (

          <motion.div
            key="wake"
            initial={{opacity:0,y:20}}
            animate={{opacity:1,y:0}}
            exit={{opacity:0,y:-20}}
          >

            <motion.div
              animate={{
                boxShadow:[
                  "0 0 0px var(--gold)",
                  "0 0 50px var(--gold)",
                  "0 0 0px var(--gold)"
                ]
              }}
              transition={{
                duration:3,
                repeat:Infinity
              }}
              className="mx-auto mb-8 flex h-32 w-32 items-center justify-center rounded-full border border-[var(--gold)]"
            >
              <Sun
                size={50}
                color="var(--gold)"
              />
            </motion.div>


            <h1 className="font-heading text-4xl">
              Good Morning
            </h1>

            <p className="mt-3 text-[var(--text-secondary)]">
              HEY is ready. Your day begins now.
            </p>


            <div className="mt-8 flex justify-center gap-6">
              <Mic/>
              <Volume2/>
              <Camera/>
            </div>

          </motion.div>

        )}



        {stage === 1 && (

          <motion.div
            key="overview"
            initial={{opacity:0,y:20}}
            animate={{opacity:1,y:0}}
            exit={{opacity:0,y:-20}}
          >

            <h2 className="font-heading text-3xl">
              Your Day
            </h2>


            {loading ? (
              <p className="mt-8 text-[var(--text-secondary)]">
                Loading your tasks...
              </p>
            ) : plan.length === 0 ? (
              <div
                className="mt-8 rounded-xl border border-white/10 p-6 text-left"
                style={{ color: "var(--text-secondary)" }}
              >
                No pending tasks yet. Add tasks on the Tasks page and they will
                appear here each morning.
              </div>
            ) : (
              <div className="mt-8 space-y-3 text-left">

                {plan.map((item)=>(
                  <div
                    key={item.title}
                    className="glass-card flex items-center justify-between p-4"
                  >

                    <div className="flex items-center gap-3">
                      <Brain
                        size={22}
                        color="var(--green-accent)"
                      />

                      <span>
                        {item.title}
                      </span>
                    </div>

                    <span className="text-sm text-[var(--text-secondary)]">
                      {item.time}
                    </span>

                  </div>
                ))}

              </div>
            )}


            <div className="mt-6 flex gap-3 text-left">
              <Sparkles color="var(--gold)"/>

              <div>
                <div className="text-[var(--text-primary)]">
                  Today's focus
                </div>

                <p className="mt-1 italic text-[var(--text-secondary)]">
                  {briefing?.focus || "Choose one meaningful priority for today."}
                </p>
              </div>
            </div>

            {briefing?.gaps?.length > 0 && (
              <div className="mt-4 space-y-1 text-left text-sm text-[var(--text-secondary)]">
                {briefing.gaps.map((gap) => (
                  <p key={gap}>• {gap}</p>
                ))}
              </div>
            )}


            <div className="mt-6 flex items-center gap-3 text-left">
              <CloudSun
                color="var(--gold)"
              />

              <div>
                <div>
                  {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
                </div>

                <div className="text-sm text-[var(--text-secondary)]">
                  {loading ? "Syncing your day..." : `${plan.length} pending task${plan.length === 1 ? "" : "s"} on your list.`}
                </div>
              </div>

            </div>


            <div className="mt-6 flex gap-3 text-left">
              <Quote color="var(--gold)"/>

              <p className="italic text-[var(--text-secondary)]">
                Small actions repeated daily create extraordinary results.
              </p>
            </div>

          </motion.div>

        )}



        {stage === 2 && (

          <motion.div
            key="focus"
            initial={{opacity:0,y:20}}
            animate={{opacity:1,y:0}}
            exit={{opacity:0,y:-20}}
          >

            <h2 className="font-heading text-3xl">
              Win Today
            </h2>


            {loading ? (
              <p className="mt-6 text-[var(--text-secondary)]">
                Loading your goals...
              </p>
            ) : wins.length === 0 ? (
              <p className="mt-6 text-[var(--text-secondary)]">
                Add goals on the Goals page and your top wins will appear here.
              </p>
            ) : (
              <div className="mt-6 space-y-3">

                {wins.map((goal)=>(
                  <button
                    key={goal.id}
                    onClick={()=>toggleGoal(goal.id)}
                    className="glass-card flex w-full items-center gap-3 p-4 text-left"
                    aria-pressed={goal.done}
                  >

                    {
                      goal.done
                      ?
                      <CheckCircle2
                        color="var(--green-accent)"
                      />
                      :
                      <Circle
                        color="var(--text-secondary)"
                      />
                    }


                    <span className={
                      goal.done
                      ?"line-through text-[var(--text-secondary)]"
                      :""
                    }>
                      {goal.text}
                    </span>

                  </button>
                ))}

              </div>
            )}


            <div className="mt-8 glass-card p-5">
              <Sparkles color="var(--gold)" />

              <p className="mt-3 text-[var(--text-secondary)]">
                Focus on progress. HEY is with you.
              </p>
            </div>


          </motion.div>

        )}

        </AnimatePresence>


        <button
          onClick={next}
          className="hey-btn-primary mt-8 flex w-full items-center justify-center gap-2"
        >

          Continue

          <ArrowRight size={18}/>

        </button>


      </motion.div>

    </div>
  );
}