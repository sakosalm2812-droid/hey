import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart,
  Wind,
  Compass,
  PenLine,
  MessageCircle,
  Phone,
  Mic,
  X,
  ArrowRight,
  Sparkles,
  Shield,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const feelings = [
  "I feel anxious",
  "I feel overwhelmed",
  "I feel stressed",
  "I need someone to listen",
];

const tools = [
  {
    title: "Breathing",
    icon: Wind,
    description: "Slow breathing exercise",
  },
  {
    title: "Grounding",
    icon: Compass,
    description: "Reconnect with the present",
  },
  {
    title: "Journal",
    icon: PenLine,
    description: "Write your thoughts",
  },
  {
    title: "Talk",
    icon: MessageCircle,
    description: "Start a conversation",
  },
];

const crisisHotlines = [
  {
    name: "988 Suicide & Crisis Lifeline",
    number: "988",
    description: "Call or text 24/7 (US)",
    url: "https://988lifeline.org",
  },
  {
    name: "Crisis Text Line",
    number: "Text HOME to 741741",
    description: "Free 24/7 text support (US)",
    url: "https://www.crisistextline.org",
  },
  {
    name: "International Association for Suicide Prevention",
    number: "https://www.iasp.info/resources/Crisis_Centres/",
    description: "Find a crisis centre worldwide",
    url: "https://www.iasp.info/resources/Crisis_Centres/",
  },
  {
    name: "Emergency Services",
    number: "911",
    description: "Call for immediate emergency help (US)",
    url: null,
  },
];

const stages = [
  "check-in",
  "calm",
  "support",
];

export default function CrisisMode() {
  const navigate = useNavigate();

  const [stage, setStage] = useState(0);
  const [selected, setSelected] = useState("");

  const [breathing, setBreathing] = useState(true);


  function chooseFeeling(value) {
    setSelected(value);
    setStage(1);
  }


  function next() {
    setStage((value) =>
      value < stages.length - 1
        ? value + 1
        : value
    );
  }

  function handleSupportTool(title) {
    if (title === "Journal") navigate("/journal");
    else if (title === "Talk") navigate("/chat");
    else {
      setSelected(title);
      setStage(1);
    }
  }


  return (
    <div className="landscape-bg min-h-screen flex items-center justify-center p-6">

      <button
        onClick={() => navigate("/chat")}
        aria-label="Exit crisis mode"
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

        <div className="mb-6 flex justify-center">
          <div className="badge badge-coral flex items-center gap-2">
            <Shield size={14}/>
            Crisis Mode
          </div>
        </div>


        <AnimatePresence mode="wait">


        {stage === 0 && (

          <motion.div
            key="check"
            initial={{
              opacity:0,
              y:20,
            }}
            animate={{
              opacity:1,
              y:0,
            }}
          >

            <motion.div
              animate={{
                scale:[1,1.08,1],
              }}
              transition={{
                duration:3,
                repeat:Infinity,
              }}
              className="mx-auto mb-8 flex h-28 w-28 items-center justify-center rounded-full border border-[var(--coral)]"
            >
              <Heart
                size={42}
                color="var(--coral)"
              />
            </motion.div>


            <h1 className="font-heading text-4xl text-[var(--coral)]">
              HEY is here.
            </h1>


            <p className="mt-3 text-[var(--text-secondary)]">
              Tell me what you are feeling right now.
            </p>


            <div className="mt-8 space-y-3">

            {feelings.map((item)=>(

              <button
                key={item}
                onClick={()=>chooseFeeling(item)}
                className="glass-card w-full p-4 text-left transition hover:-translate-y-1"
              >
                {item}
              </button>

            ))}

            </div>


            <div className="relative mt-5">
              <input
                className="hey-input w-full pr-12"
                placeholder="Write how you feel..."
                aria-label="Write how you feel"
                value={selected}
                onChange={(e)=>setSelected(e.target.value)}
              />

              <Mic
                size={17}
                className="absolute right-4 top-1/2 -translate-y-1/2"
              />
            </div>

          </motion.div>

        )}



        {stage === 1 && (

          <motion.div
            key="calm"
            initial={{
              opacity:0,
              y:20,
            }}
            animate={{
              opacity:1,
              y:0,
            }}
          >

            <h2 className="font-heading text-3xl">
              Let's slow things down.
            </h2>


            <p className="mt-3 text-[var(--text-secondary)]">
              {selected || "Take a moment for yourself."}
            </p>


            <motion.div
              animate={{
                scale: breathing
                  ? 1.15
                  : 0.9,
              }}
              transition={{
                duration:4,
              }}
              onAnimationComplete={()=>
                setBreathing(!breathing)
              }
              className="mx-auto mt-8 flex h-36 w-36 items-center justify-center rounded-full border border-[var(--coral)]"
            >

              <Wind
                size={40}
                color="var(--coral)"
              />

            </motion.div>


            <p className="mt-5 text-sm text-[var(--text-secondary)]">
              Breathe {breathing ? "in" : "out"}
            </p>


            <div className="mt-8 glass-card p-5 text-left">
              <Sparkles color="var(--gold)"/>

              <p className="mt-3 text-[var(--text-secondary)]">
                One moment does not define your whole journey.
                Keep moving one step at a time.
              </p>
            </div>


            <button
              onClick={next}
              className="hey-btn-primary mt-6 flex w-full justify-center gap-2"
            >
              Continue
              <ArrowRight size={18}/>
            </button>

          </motion.div>

        )}



        {stage === 2 && (

          <motion.div
            key="support"
            initial={{
              opacity:0,
              y:20,
            }}
            animate={{
              opacity:1,
              y:0,
            }}
          >

            <h2 className="font-heading text-3xl">
              Support Tools
            </h2>


            <div className="mt-6 grid gap-4 sm:grid-cols-2">

            {tools.map((tool)=>{

              const Icon = tool.icon;

              return(
                <button
                  key={tool.title}
                  type="button"
                  onClick={() => handleSupportTool(tool.title)}
                  className="glass-card p-5 text-left"
                >

                  <Icon
                    color="var(--coral)"
                  />

                  <h3 className="mt-3">
                    {tool.title}
                  </h3>

                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {tool.description}
                  </p>

                </button>
              );

            })}

            </div>


            <div className="mt-6 text-left">
              <div className="flex items-center gap-3 mb-4">
                <Phone color="var(--coral)"/>
                <div className="font-heading text-lg">Immediate Support</div>
              </div>

              <div className="space-y-3">
                {crisisHotlines.map((line) => (
                  <a
                    key={line.name}
                    href={line.url || `tel:${line.number}`}
                    target={line.url ? "_blank" : undefined}
                    rel={line.url ? "noopener noreferrer" : undefined}
                    className="glass-card p-4 flex items-center gap-4 block transition hover:-translate-y-0.5"
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(239,68,68,.12)", flexShrink: 0 }}>
                      <Phone size={18} color="var(--coral)" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{line.name}</div>
                      <div className="text-xs text-[var(--text-secondary)] mt-0.5">{line.description}</div>
                    </div>
                    <div className="text-sm font-semibold" style={{ color: "var(--coral)", flexShrink: 0 }}>
                      {line.number}
                    </div>
                  </a>
                ))}
              </div>

              <p className="mt-4 text-xs text-[var(--text-secondary)]">
                You are not alone. Professional support is available 24/7.
              </p>
            </div>

          </motion.div>

        )}


        </AnimatePresence>


      </motion.div>

    </div>
  );
}
