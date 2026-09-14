import { useEffect, useState } from "react";
import {
  CheckSquare,
  Sparkles,
  Brain,
  Plus,
} from "lucide-react";

import PageHeader from "./components/layout/PageHeader";
import HEYCard from "./components/ui/HEYCard";
import TaskBoard from "./components/tasks/TaskBoard";
import { useAuth } from "./AuthContext.jsx";
import { buzz } from "./lib/heyFeedback";
import { listRecords } from "./lib/heyRecords.js";


export default function TasksPage(){

  const { user } = useAuth();
  const [priority,setPriority] =
    useState("All");
  const [stats, setStats] = useState({ completed: 0, active: 0, total: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsMessage, setStatsMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      if (!user?.id) {
        setStatsLoading(false);
        return;
      }
      try {
        const tasks = await listRecords(user.id, "task");
        if (cancelled) return;
        const completed = tasks.filter((task) => task.status === "completed").length;
        setStats({ completed, active: tasks.length - completed, total: tasks.length });
      } catch (statsError) {
        if (!cancelled) setStatsMessage(statsError.message || "Task counts could not be loaded.");
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    }

    loadStats();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);


  return (

    <div>


      <PageHeader
        title="Tasks"
        subtitle="Turn intentions into meaningful progress."
      />



      <div
        style={{
          display:"grid",

          gridTemplateColumns:
          "1fr 360px",

          gap:24,
        }}
      >



        <HEYCard
          padding={28}
        >


          <div
            style={{
              display:"flex",
              justifyContent:"space-between",
              alignItems:"center",
              marginBottom:28,
            }}
          >


            <div
              style={{
                display:"flex",
                alignItems:"center",
                gap:12,
              }}
            >

              <CheckSquare
                color="var(--gold-primary)"
              />

              <h2
                style={{
                  fontSize:34,
                }}
              >
                Today's Mission
              </h2>

            </div>



            <button
              type="button"
onClick={() => document.querySelector('input[placeholder="Add a task..."]')?.focus()}
              onPointerDown={() => buzz("light")}
              className="hey-btn-primary"
              style={{
                display:"flex",
                alignItems:"center",
                gap:8,
              }}
            >

              <Plus size={16}/>

              Add Task

            </button>


          </div>



          {statsMessage && (
            <p style={{ color: "var(--coral)", fontSize: 13, marginBottom: 14 }}>
              {statsMessage}
            </p>
          )}

          <div
            style={{
              display:"grid",
              gridTemplateColumns:
              "repeat(3,1fr)",
              gap:14,
              marginBottom:28,
            }}
          >


            {[
              {
                title:"Completed",
                value: statsLoading ? "–" : String(stats.completed),
                icon:CheckSquare,
              },
              {
                title:"Active",
                value: statsLoading ? "–" : String(stats.active),
                icon:CheckSquare,
              },
              {
                title:"Total",
                value: statsLoading ? "–" : String(stats.total),
                icon:CheckSquare,
              },
            ].map((item)=>{

              const Icon=item.icon;


              return(

                <div
                  key={item.title}
                  className="glass-card"
                  style={{
                    padding:18,
                  }}
                >

                  <Icon
                    size={20}
                    color="var(--gold-primary)"
                  />


                  <div
                    style={{
                      fontSize:32,
                      marginTop:12,
                    }}
                  >
                    {item.value}
                  </div>


                  <div
                    style={{
                      color:
                      "var(--text-secondary)",
                      fontSize:13,
                    }}
                  >
                    {item.title}
                  </div>


                </div>

              );

            })}


          </div>




          <TaskBoard filter={priority} />


        </HEYCard>






        <div
          style={{
            display:"flex",
            flexDirection:"column",
            gap:24,
          }}
        >



          <HEYCard
            padding={28}
          >

            <Sparkles
              color="var(--gold-primary)"
            />


            <h3
              style={{
                marginTop:16,
                fontSize:26,
              }}
            >
              Focus Guidance
            </h3>


            <p
              style={{
                marginTop:12,
                color:
                "var(--text-secondary)",
                lineHeight:1.8,
              }}
            >
              {stats.total
                ? `You have ${stats.active} active task${stats.active === 1 ? "" : "s"} of ${stats.total} total, with ${stats.completed} completed. Complete a task and this page tracks it.`
                : "Add a task above and this card will report your progress in real counts."}
            </p>


          </HEYCard>





          <HEYCard
            padding={28}
          >

            <Brain
              color="var(--gold-primary)"
            />


            <h3
              style={{
                marginTop:16,
                fontSize:24,
              }}
            >
              Filter by Priority
            </h3>


            <div
              style={{
                display:"flex",
                flexDirection:"column",
                gap:10,
                marginTop:18,
              }}
            >

              {
                [
                  "All",
                  "High",
                  "Medium",
                  "Low",
                ].map(mode=>(

                  <button
                    key={mode}
                    onClick={()=>
                      setPriority(mode)
                    }
                    onPointerDown={()=>buzz("light")}
                    style={{
                      padding:"12px 16px",
                      borderRadius:14,
                      border:
                      priority===mode
                      ?
                      "1px solid var(--gold-primary)"
                      :
                      "1px solid var(--border)",

                      background:
                      priority===mode
                      ?
                      "rgba(247,201,111,.1)"
                      :
                      "transparent",

                      color:"var(--text-primary)",
                      textAlign:"left",
                      cursor:"pointer",
                    }}
                  >
                    {mode}
                  </button>

                ))
              }

            </div>


          </HEYCard>



        </div>



      </div>


    </div>

  );

}
