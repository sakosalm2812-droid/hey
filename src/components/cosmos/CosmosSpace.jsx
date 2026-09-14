import { useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  Brain,
  Lightbulb,
  Target,
  FolderKanban,
  CheckSquare,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minus,
} from "lucide-react";
import { useDoubleTap } from "../../hooks/useDoubleTap.js";
import { usePinch } from "../../hooks/usePinch.js";

function iconFor(type) {
  switch (type) {
    case "project":
      return FolderKanban;
    case "task":
      return CheckSquare;
    case "memory":
      return Brain;
    case "idea":
      return Lightbulb;
    case "goal":
      return Target;
    default:
      return Sparkles;
  }
}

const hubNodes = [
  { title: "Projects", type: "project", x: "50%", y: "22%", size: 72 },
  { title: "Memory", type: "memory", x: "18%", y: "62%", size: 72 },
  { title: "Knowledge", type: "idea", x: "82%", y: "58%", size: 72 },
];

const hubPositions = {
  Projects: { x: "50%", y: "22%" },
  Memory: { x: "18%", y: "62%" },
  Knowledge: { x: "82%", y: "58%" },
};

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.2;

function pointsAround(hub, index, total) {
  const xRaw = 50 + (index - (total - 1) / 2) * 14 + (hub === "Projects" ? 0 : hub === "Memory" ? -34 : 34);
  const yRaw = (hub === "Projects" ? 22 : hub === "Memory" ? 62 : 58) + (index % 2 === 0 ? 14 : -4);
  return { x: `${Math.max(6, Math.min(94, xRaw))}%`, y: `${Math.max(6, Math.min(92, yRaw))}%` };
}

export default function CosmosSpace({ nodes = [], edges = [], hubs = hubNodes }) {
  const [scale, setScale] = useState(1);
  const [focused, setFocused] = useState(null);

  const doubleTap = useDoubleTap((event) => {
    const title = event?.currentTarget?.getAttribute?.("data-title");
    if (!title) return;
    setFocused((current) => (current === title ? null : title));
  }, { delay: 260 });

  const pinch = usePinch((direction) => {
    const amount = direction === "out" ? 0.12 : -0.12;
    setScale((current) => clampScale(current + amount));
  }, { threshold: 0.08 });

  function clampScale(value) {
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(value * 100) / 100));
  }

  function changeScale(amount) {
    setScale((current) => clampScale(current + amount));
  }

  const positioned = [];
  const byTitle = new Map();
  const byId = new Map();

  hubs.forEach((hub) => {
    const entry = { ...hub, hub: true, x: hubPositions[hub.title]?.x || "50%", y: hubPositions[hub.title]?.y || "40%" };
    byTitle.set(hub.title, entry);
    positioned.push(entry);
  });

  const hubsOf = (type) => ({ project: "Projects", task: "Projects", memory: "Memory", idea: "Knowledge", goal: "Knowledge" }[type] || "Memory");
  const leafGroups = { Projects: [], Memory: [], Knowledge: [] };
  nodes.forEach((node) => {
    const hubTitle = node.hub || hubsOf(node.type);
    const leaf = {
      ...node,
      icon: node.icon || iconFor(node.type),
      x: node.x,
      y: node.y,
      hubExtra: null,
    };
    if (!node.x) {
      leafGroups[hubTitle]?.push(node);
    }
    if (leaf.title) byTitle.set(leaf.title, leaf);
    if (leaf.id) byId.set(leaf.id, leaf);
    positioned.push(leaf);
  });

  Object.entries(leafGroups).forEach(([hubTitle, leaves]) => {
    leaves.forEach((leaf, index) => {
      const spot = pointsAround(hubTitle, index, leaves.length);
      leaf.x = spot.x;
      leaf.y = spot.y;
    });
  });

  const resolve = (ref) => byId.get(ref) || byTitle.get(ref);

  const connectionPairs = edges
    .map((edge) => ({ from: resolve(edge.from), to: resolve(edge.to) }))
    .filter((pair) => pair.from && pair.to)
    .filter((pair) => pair.from !== pair.to);

  return (
    <div
      {...pinch}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 650,
        position: "relative",
        overflow: "hidden",
        borderRadius: 32,
        background: "radial-gradient(circle at center,#10232B 0%,#020508 65%)",
        border: "1px solid var(--border)",
        touchAction: "none",
      }}
    >
      <motion.div
        animate={{ scale }}
        transition={{ type: "spring", stiffness: 220, damping: 24 }}
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "center",
        }}
      >
        <svg
          aria-hidden
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {connectionPairs.map((pair, index) => (
            <motion.line
              key={index}
              x1={pair.from.x}
              y1={pair.from.y}
              x2={pair.to.x}
              y2={pair.to.y}
              stroke="rgba(0,191,255,.45)"
              strokeWidth={1.6}
              vectorEffect="non-scaling-stroke"
              animate={{ opacity: [0.15, 0.6, 0.15] }}
              transition={{ duration: 3, repeat: Infinity, delay: index * 0.6 }}
            />
          ))}
        </svg>

        {/* Core */}
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 5, repeat: Infinity }}
          style={{
            position: "absolute",
            left: "50%",
            top: "45%",
            transform: "translate(-50%,-50%)",
            width: 220,
            height: 220,
            borderRadius: "50%",
            background: "rgba(0,191,255,.15)",
            filter: "blur(60px)",
          }}
        />

        {/* Decorative rings (only when the graph is empty) */}
        {positioned.length === hubs.length &&
          positioned.map((_, index) => (
            <motion.div
              key={index}
              animate={{ opacity: [0.1, 0.4, 0.1] }}
              transition={{ duration: 3, repeat: Infinity, delay: index }}
              style={{
                position: "absolute",
                left: "50%",
                top: "45%",
                width: 250,
                height: 1,
                background: "linear-gradient(90deg,transparent,rgba(0,191,255,.5),transparent)",
                transform: `rotate(${index * 72}deg)`,
                transformOrigin: "left",
              }}
            />
          ))}

        {/* Nodes */}
        {positioned.map((node, index) => {
          const Icon = node.icon;
          const color = node.type === "project" ? "var(--gold)" : node.type === "task" ? "var(--green-accent)" : "var(--gold-primary)";
          const isFocused = focused === node.title;
          return (
            <motion.div
              key={`${node.title}-${index}`}
              data-title={node.title}
              animate={{ y: [0, -10, 0], scale: isFocused ? 1.25 : 1, opacity: focused && !isFocused ? 0.45 : 1 }}
              transition={{ duration: isFocused ? 0.35 : 4 + index, repeat: isFocused ? 0 : Infinity }}
              style={{
                position: "absolute",
                left: node.x,
                top: node.y,
                transform: "translate(-50%,-50%)",
                width: node.size,
                height: node.size,
                borderRadius: "50%",
                background: isFocused || node.hub ? "rgba(0,191,255,.12)" : "rgba(255,255,255,.06)",
                backdropFilter: "blur(20px)",
                border: node.hub ? "1px solid rgba(0,191,255,.4)" : "1px solid rgba(255,255,255,.12)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: "pointer",
                zIndex: isFocused ? 5 : 1,
              }}
              onPointerDown={(event) => event.stopPropagation()}
              {...doubleTap}
              title={`${node.title} — double-tap to focus`}
            >
              {Icon && <Icon size={node.hub ? 26 : 22} color={color} />}
              <span style={{ fontSize: 11, color: "var(--text-secondary)", maxWidth: "90%", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {node.title}
              </span>
            </motion.div>
          );
        })}
      </motion.div>

      <div style={{ position: "absolute", bottom: 30, left: 30, pointerEvents: "none" }}>
        <div style={{ color: "var(--gold-primary)", fontSize: 12, letterSpacing: ".2em" }}>
          HEY COSMOS
        </div>
        <h1 style={{ marginTop: 8, fontFamily: '"Instrument Serif",serif', fontSize: 42 }}>
          Your Living Memory
        </h1>
      </div>

      {/* Controls */}
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={() => changeScale(0.15)}
          className="hey-cosmos-zoom"
          aria-label="Zoom in"
        >
          <ZoomIn size={16} />
        </button>
        <button
          type="button"
          onClick={() => changeScale(-0.15)}
          className="hey-cosmos-zoom"
          aria-label="Zoom out"
        >
          <ZoomOut size={16} />
        </button>
        <button
          type="button"
          onClick={() => { setScale(1); setFocused(null); }}
          className="hey-cosmos-zoom"
          aria-label="Reset view"
        >
          <Maximize2 size={16} />
        </button>
        <span style={{ color: "var(--text-secondary)", fontSize: 12, marginLeft: 4 }}>
          {Math.round(scale * 100)}%
        </span>
      </div>

      <div style={{ position: "absolute", top: 22, left: 24, color: "var(--text-secondary)", fontSize: 12, display: "flex", gap: 14, alignItems: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Minus size={12} /> pinch
        </span>
        <span>&middot;</span>
        <span>double-tap a node to focus</span>
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export { hubNodes };