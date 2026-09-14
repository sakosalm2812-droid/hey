import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Hammer, Mic2, Orbit, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import LandingButton from "./Button.jsx";

const VOICE_CYCLE = ["listening", "processing", "speaking", "idle"];

const TABS = [
  {
    id: "cosmos",
    label: "Cosmos",
    Icon: Orbit,
    title: "Memory that has shape.",
    body: "Ideas, decisions, goals, and patterns stay connected after the conversation ends.",
    note: "A living map of context — not a scrolling chat history.",
  },
  {
    id: "forge",
    label: "Forge",
    Icon: Hammer,
    title: "Build for the work ahead.",
    body: "Compose agents, workflows, and tools the way you think and move.",
    note: "Everything HEY builds runs behind gates you control.",
  },
  {
    id: "voice",
    label: "Voice",
    Icon: Mic2,
    title: "Speak at the speed of thought.",
    body: "Talk naturally, keep the context, and move from an idea to the next useful action.",
    note: "A real voice state machine: listen, process, speak, rest.",
  },
  {
    id: "consent",
    label: "Consent",
    Icon: ShieldCheck,
    title: "Power with boundaries.",
    body: "Sensitive moves ask first. Every action leaves a receipt.",
    note: "Terminal, input, and file-deletion moves never run silently.",
  },
];

function MemoryMap() {
  const nodes = [
    { l: "8%", t: "62%", label: "decision" },
    { l: "30%", t: "22%", label: "goal" },
    { l: "58%", t: "68%", label: "idea" },
    { l: "82%", t: "28%", label: "habit" },
  ];
  return (
    <div className="hey-memmap" aria-hidden="true">
      {nodes.map((node, index) => (
        <span key={node.label} className="hey-memmap-node" style={{ left: node.l, top: node.t, transitionDelay: `${index * 90}ms` }}>
          {node.label}
        </span>
      ))}
    </div>
  );
}

function ForgeSteps() {
  const steps = ["choose a pattern", "give it context", "set its boundaries", "run it"];
  return (
    <div className="hey-forge-steps" aria-hidden="true">
      {steps.map((step, index) => (
        <span key={step} className="hey-voice-state" style={{ animationDelay: `${index * 220}ms` }}>
          <span className="hey-live-dot" /> {step}
        </span>
      ))}
    </div>
  );
}

function VoiceWalker({ active }) {
  return (
    <div className="hey-voice-walker" aria-hidden="true">
      {VOICE_CYCLE.map((state) => (
        <span key={state} className={`hey-voice-state${state === active ? " live" : ""}`}>
          {state === active && <span className="hey-live-dot" />}
          {state}
        </span>
      ))}
    </div>
  );
}

function ConsentGate() {
  return (
    <div className="hey-consent-card" aria-hidden="true">
      <span>Confirmation required</span>
      <strong>HEY wants to run a terminal command</strong>
      <div className="hey-consent-row">
        <div><span>command</span><span>term.sh</span></div>
        <div><span>risk</span><span>high — never runs silently</span></div>
      </div>
      <div className="hey-consent-actions">
        <span className="hey-voice-state">Approve</span>
        <span className="hey-voice-state">Deny</span>
      </div>
    </div>
  );
}

function Panel({ tab }) {
  const { Icon, title, body, note } = tab;
  return (
    <div className="hey-demo-panel">
      <motion.div
        className="hey-demo-visual"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
        id={`panel-${tab.id}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab.id}`}
      >
        {tab.id === "cosmos" && <MemoryMap />}
        {tab.id === "forge" && <ForgeSteps />}
        {tab.id === "voice" && <VoiceWalker active="processing" />}
        {tab.id === "consent" && <ConsentGate />}
        {tab.id !== "consent" && (
          <div className="hey-demo-icon"><Icon size={24} /></div>
        )}
        <strong>{title}</strong>
        <p>{body}</p>
        <small>{note}</small>
      </motion.div>
    </div>
  );
}

export default function ProductDemo() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [activeId, setActiveId] = useState("cosmos");
  const [paused, setPaused] = useState(false);
  const active = TABS.find((tab) => tab.id === activeId) || TABS[0];

  useEffect(() => {
    if (reduceMotion || paused) return undefined;
    const timer = setInterval(() => {
      setActiveId((current) => {
        const at = TABS.findIndex((tab) => tab.id === current);
        return TABS[(at + 1) % TABS.length].id;
      });
    }, 6000);
    return () => clearInterval(timer);
  }, [reduceMotion, paused]);

  return (
    <section className="hey-demo">
      <div className="hey-demo-head">
        <span className="hey-landing-kicker">See it in motion</span>
        <h2>Not another<br /><em>chat window.</em></h2>
        <p>Four surfaces, one calm system. This is the interface HEY actually ships — the parts you can touch today.</p>
      </div>

      <div className="hey-demo-stage">
        <div className="hey-demo-tabs" role="tablist" aria-label="HEY product surfaces" onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={tab.id === activeId}
              aria-controls={`panel-${tab.id}`}
              className={tab.id === activeId ? "hey-demo-tab active" : "hey-demo-tab"}
              onClick={() => setActiveId(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="hey-demo-window" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <div className="hey-demo-bar">
            <span className="hey-demo-dot" />
            <span className="hey-demo-dot" />
            <span className="hey-demo-dot" />
            <small>HEY — {active.label}</small>
          </div>
          <AnimatePresence mode="wait">
            <Panel key={active.id} tab={active} />
          </AnimatePresence>
        </div>

        <div className="hey-demo-foot">
          <p>Every surface above is live inside HEY.</p>
          <LandingButton secondary onClick={() => navigate("/features")}>
            Explore the system <ArrowRight size={15} />
          </LandingButton>
        </div>
      </div>
    </section>
  );
}