import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { useRef } from "react";
import { Hammer, Mic2, ShieldCheck } from "lucide-react";

function MemoryMapArt() {
  const nodes = [
    { l: "8%", t: "62%", label: "decision" },
    { l: "30%", t: "22%", label: "goal" },
    { l: "58%", t: "68%", label: "idea" },
    { l: "82%", t: "28%", label: "habit" },
  ];
  return (
    <div className="hey-memmap" aria-hidden="true">
      {nodes.map((node) => (
        <span key={node.label} className="hey-memmap-node" style={{ left: node.l, top: node.t }}>
          {node.label}
        </span>
      ))}
    </div>
  );
}

function ForgeStepsArt() {
  const steps = ["choose a pattern", "give it context", "set its boundaries", "run it"];
  return (
    <div className="hey-forge-steps" aria-hidden="true">
      {steps.map((step) => (
        <span key={step} className="hey-voice-state">
          <span className="hey-live-dot" /> {step}
        </span>
      ))}
    </div>
  );
}

function ConsentGateArt() {
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

const STEPS = [
  {
    index: "01 — 03",
    Icon: Mic2,
    title: "Understand.",
    text: "Memories, goals, and decisions stay connected — so HEY begins every conversation already knowing where you are.",
    Art: MemoryMapArt,
  },
  {
    index: "02 — 03",
    Icon: Hammer,
    title: "Create.",
    text: "Compose agents and workflows the way you think and move, then hand them context and boundaries.",
    Art: ForgeStepsArt,
  },
  {
    index: "03 — 03",
    Icon: ShieldCheck,
    title: "Act.",
    text: "The next useful move runs through gates you control — and every action leaves a receipt.",
    Art: ConsentGateArt,
  },
];

export default function Universe() {
  const sceneRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: sceneRef, offset: ["start start", "end end"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 90, damping: 26, mass: 0.4 });

  const stepOpacity = [
    useTransform(smooth, [0, 0.24, 0.34], [1, 1, 0]),
    useTransform(smooth, [0.3, 0.4, 0.6, 0.7], [0, 1, 1, 0]),
    useTransform(smooth, [0.64, 0.76, 1], [0, 1, 1]),
  ];
  const frameScale = useTransform(smooth, [0, 1], [0.94, 1.02]);
  const frameY = useTransform(smooth, [0, 1], [40, -40]);

  return (
    <section className="hey-universe-scroll" ref={sceneRef}>
      <div className="hey-universe-sticky">
        <div className="hey-universe-copy">
          {STEPS.map(({ index, title, text }, i) => (
            <motion.div key={title} className="hey-universe-step" style={{ opacity: stepOpacity[i] }}>
              <div className="hey-universe-step-inner">
                <span className="hey-universe-step-index">{index}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div className="hey-universe-frame" style={{ scale: frameScale, y: frameY }}>
          {STEPS.map(({ title, Art }, i) => (
            <motion.div
              key={title}
              className="hey-universe-screen"
              style={{ opacity: stepOpacity[i] }}
              aria-hidden="true"
            >
              <div className="hey-demo-visual">
                <Art />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}