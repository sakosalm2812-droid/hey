import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { springs } from "../../../lib/heyMotion";
import {
  Orbit,
  Sparkles,
  Brain,
} from "lucide-react";
import { getMemoryGraph } from "../../../core/memoryGraph.js";
import { subscribe } from "../../../core/eventBus.js";


function typeLabel(type) {
  if (!type || type === "memory") return "Memory";
  if (type === "important") return "Preference";
  if (type === "fact") return "Fact";
  if (type === "preference") return "Preference";
  if (type === "pattern") return "Pattern";
  return type;
}


export default function MemoryGalaxyWidget() {
  const [nodes, setNodes] = useState(() => getMemoryGraph().nodes);

  useEffect(() => {
    const refresh = () => setNodes(getMemoryGraph().nodes);
    const stopNode = subscribe("memory.node.updated", refresh);
    const stopEdge = subscribe("memory.edge.created", refresh);
    return () => {
      stopNode();
      stopEdge();
    };
  }, []);

  const recent = nodes
    .slice()
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))
    .slice(0, 4);

  const isHighConfidence = (node) => node.confidence != null && node.confidence >= 0.9;

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
        padding:28,
        height:"100%",
        overflow:"hidden",
        position:"relative",
      }}
    >

      <motion.div
        animate={{
          rotate:360,
        }}
        transition={{
          duration:40,
          repeat:Infinity,
          ease:"linear",
        }}
        style={{
          position:"absolute",
          width:260,
          height:260,
          borderRadius:"50%",
          border:
          "1px solid rgba(0,191,255,.15)",
          top:-80,
          right:-80,
        }}
      />


      <div
        style={{
          position:"relative",
          zIndex:2,
        }}
      >

        <div
          style={{
            display:"flex",
            alignItems:"center",
            gap:12,
          }}
        >

          <div
            style={{
              width:48,
              height:48,
              borderRadius:16,
              display:"grid",
              placeItems:"center",
              background:
              "rgba(0,191,255,.12)",
            }}
          >
            <Orbit
              color="var(--gold-primary)"
            />
          </div>


          <div>

            <div
              style={{
                fontSize:12,
                color:
                "var(--text-secondary)",
              }}
            >
              MEMORY SYSTEM
            </div>

            <h2
              style={{
                fontSize:24,
              }}
            >
              The Cosmos
            </h2>

          </div>

        </div>



        <p
          style={{
            marginTop:18,
            color:
            "var(--text-secondary)",
            lineHeight:1.7,
            fontSize:14,
          }}
        >
          Recently captured memories live in your account's Cosmos.
        </p>



        <div
          style={{
            marginTop:24,
            display:"grid",
            gap:12,
          }}
        >

          {recent.length === 0 ? (
            <div
              style={{
                padding:16,
                borderRadius:16,
                background:
                "rgba(255,255,255,.04)",
                color:
                "var(--text-secondary)",
                fontSize:14,
                lineHeight:1.6,
              }}
            >
              Nothing here yet. Ask HEY in chat and it will remember what matters to you here.
            </div>
          ) : (
            recent.map((node,index)=>(
            <motion.div
              key={node.id}
              animate={{
                x:[
                  0,
                  index%2===0 ? 6:-6,
                  0,
                ],
              }}
              transition={{
                duration:4+index,
                repeat:Infinity,
              }}
              style={{
                display:"flex",
                alignItems:"center",
                gap:12,
                padding:14,
                borderRadius:16,
                background:
                "rgba(255,255,255,.04)",
              }}
            >

              <Sparkles
                size={16}
                color={isHighConfidence(node)
                  ? "var(--gold-primary)"
                  : "var(--text-secondary)"}
              />

              <div
                style={{
                  flex:1,
                  minWidth:0,
                }}
              >
                <div
                  style={{
                    whiteSpace:"nowrap",
                    overflow:"hidden",
                    textOverflow:"ellipsis",
                  }}
                >
                  {node.value}
                </div>

                <small
                  style={{
                    color:
                    "var(--text-secondary)",
                  }}
                >
                  {typeLabel(node.type)}
                </small>

              </div>


            </motion.div>

          ))
          )}

        </div>


        <div
          style={{
            marginTop:22,
            display:"flex",
            alignItems:"center",
            gap:10,
            color:
            "var(--green-primary)",
            fontSize:13,
          }}
        >

          <Brain size={16}/>
          {nodes.length} memories connected

        </div>


      </div>

    </motion.div>
  );
}
