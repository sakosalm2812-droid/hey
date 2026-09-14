import { motion } from "framer-motion";
import { buzz } from "../../../lib/heyFeedback";
import { press, springs } from "../../../lib/heyMotion";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  ArrowRight,
  Flag,
} from "lucide-react";
import { getContext } from "../../../core/contextManager.js";


export default function DailyPlanWidget(){
  const navigate = useNavigate();

  const tasks = getContext().task.pendingTasks || [];
  const plan = tasks.slice(0, 4).map(task => ({
    title: task.title || task.name || task.description || "Task",
    completed: task.status === "completed" || task.status === "done",
  }));

  const completed =
    plan.filter(item => item.completed).length;


  const progress =
    plan.length === 0 ? 0 :
      Math.round(
        (completed / plan.length) * 100
      );


  return (

    <motion.div

      className="glass-card"

      initial={{
        opacity:0,
        y:20,
      }}

      animate={{
        opacity:1,
        y:0,
      }}

      transition={{
        duration:.45,
        ease:[0.22,1,0.36,1],
      }}

      whileHover={{
        y:-4,
        transition:springs.gentle,
      }}

      style={{
        height:"100%",
        padding:24,
        display:"flex",
        flexDirection:"column",
      }}

    >


      {/* Header */}

      <div
        style={{
          display:"flex",
          justifyContent:"space-between",
          alignItems:"flex-start",
        }}
      >

        <div>

          <div
            style={{
              display:"flex",
              alignItems:"center",
              gap:8,
              color:"var(--green-accent)",
              fontSize:12,
              letterSpacing:".12em",
              textTransform:"uppercase",
              marginBottom:12,
            }}
          >

            <CalendarDays size={14}/>

            Today's Plan

          </div>


          <h2
            style={{
              fontSize:32,
              fontFamily:'"Instrument Serif", serif',
              fontWeight:400,
            }}
          >
            Daily Roadmap
          </h2>


          <p
            style={{
              marginTop:8,
              color:"var(--text-secondary)",
              fontSize:14,
            }}
          >
            {plan.length === 0
              ? "Nothing planned yet. Add tasks to see them here."
              : `${completed} of ${plan.length} tasks completed today.`}
          </p>


        </div>



        <div
          style={{
            width:48,
            height:48,
            borderRadius:16,
            background:"rgba(46,111,87,.15)",
            display:"grid",
            placeItems:"center",
          }}
        >

          <Flag
            size={22}
            color="var(--green-accent)"
          />

        </div>


      </div>




      {/* Tasks */}

      <div
        style={{
          marginTop:28,
          display:"flex",
          flexDirection:"column",
          gap:12,
          flex:1,
        }}
      >

        {
          plan.length === 0 ? (

            <div
              style={{
                flex:1,
                display:"grid",
                placeItems:"center",
                padding:24,
                borderRadius:18,
                background:"rgba(255,255,255,.03)",
                color:"var(--text-secondary)",
                fontSize:14,
                lineHeight:1.7,
                textAlign:"center",
              }}
            >
              Your daily plan will appear here once you add tasks today.
            </div>

          ) : (

            plan.map(item => (

            <motion.div

              key={item.title}

              whileHover={{
                x:4,
                transition:springs.snappy,
              }}

              style={{
                display:"flex",
                alignItems:"center",
                gap:14,
                padding:16,
                borderRadius:18,
                background:"rgba(255,255,255,.03)",
              }}

            >

              {
                item.completed ?

                <CheckCircle2
                  size={20}
                  color="var(--green-accent)"
                />

                :

                <Circle
                  size={20}
                  color="var(--text-secondary)"
                />

              }


              <div>

                <div
                  style={{
                    color:"var(--text-primary)",
                    fontSize:15,
                  }}
                >
                  {item.title}
                </div>

              </div>


            </motion.div>

          ))
          )
        }
      </div>




      {/* Progress */}

      <div
        style={{
          marginTop:24,
        }}
      >

        <div
          style={{
            display:"flex",
            justifyContent:"space-between",
            marginBottom:8,
            fontSize:13,
          }}
        >

          <span
            style={{
              color:"var(--text-secondary)",
            }}
          >
            Daily Progress
          </span>


          <span>
            {progress}%
          </span>


        </div>



        <div
          style={{
            height:8,
            borderRadius:999,
            overflow:"hidden",
            background:"rgba(255,255,255,.06)",
          }}
        >

          <motion.div

            initial={{
              width:0,
            }}

            animate={{
              width:`${progress}%`,
            }}

            transition={springs.gentle}

            style={{
              height:"100%",
              borderRadius:999,
              background:
              "linear-gradient(90deg,var(--green-primary),var(--green-accent))",
            }}

          />


        </div>


      </div>




      {/* Button */}

      <motion.button
        type="button"
        onClick={() => navigate("/tasks")}

        whileHover={{
          scale:1.02,
          transition:springs.snappy,
        }}

        whileTap={{
          scale:.97,
          transition:press,
        }}

        onPointerDown={()=>buzz("light")}

        className="hey-btn-primary"

        style={{
          marginTop:24,
          display:"flex",
          alignItems:"center",
          justifyContent:"center",
          gap:8,
        }}

      >

        Open Planner

        <ArrowRight size={16}/>

      </motion.button>



    </motion.div>

  );

}
