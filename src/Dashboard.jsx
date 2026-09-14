import { motion } from "framer-motion";
import { buzz } from "./lib/heyFeedback";
import { press } from "./lib/heyMotion";
import {
  Activity,
  BrainCircuit,
  Globe2,
  Hammer,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import allAgents from "../agents/agents.js";

import PullToRefresh from "./components/ui/PullToRefresh";
import { useAuth } from "./AuthContext.jsx";
import { getMemoryGraph } from "./core/memoryGraph.js";
import { subscribe } from "./core/eventBus.js";

// Dashboard widgets
import ProactiveSuggestionsWidget from "./components/widgets/dashboard/ProactiveSuggestionsWidget";
import DailyPlanWidget from "./components/widgets/dashboard/DailyPlanWidget";
import FocusTimerWidget from "./components/widgets/dashboard/FocusTimerWidget";
import MemoryGalaxyWidget from "./components/widgets/dashboard/MemoryGalaxyWidget";
import QuickNoteWidget from "./components/widgets/dashboard/QuickNoteWidget";
import HabitStreakWidget from "./components/widgets/dashboard/HabitStreakWidget";
import GoalProgressWidget from "./components/widgets/dashboard/GoalProgressWidget";
import PrayerTimesWidget from "./components/widgets/dashboard/PrayerTimesWidget";
import ActivityWidget from "./components/widgets/dashboard/ActivityWidget";

const tiles = [
  { label: "Explore the Cosmos", description: "Your memory, as a universe", icon: Globe2, path: "/cosmos", tone: "accent" },
  { label: "Open the Forge", description: "Build an agent or tool", icon: Hammer, path: "/forge", tone: "coral" },
  { label: "Plan your day", description: "See what is next", icon: Sparkles, path: "/calendar", tone: "green" },
];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const [memoryCount, setMemoryCount] = useState(() => getMemoryGraph().nodes.length);
  const [online, setOnline] = useState(() => navigator.onLine);

  const dateLabel = useMemo(
    () => new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date()),
    [],
  );

  useEffect(() => {
    const refresh = () => setMemoryCount(getMemoryGraph().nodes.length);
    const stopNode = subscribe("memory.node.updated", refresh);
    const stopEdge = subscribe("memory.edge.created", refresh);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      stopNode();
      stopEdge();
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const displayName = profile?.display_name?.trim() || user?.email?.split("@")[0] || null;
  const [showWidgets, setShowWidgets] = useState(false);

  async function handleRefresh() {
    setMemoryCount(getMemoryGraph().nodes.length);
    setOnline(navigator.onLine);
    return Promise.resolve();
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="hey-modern-dashboard">

      <motion.header
        className="hey-dashboard-hero"
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div>
          <div className="hey-dashboard-kicker">
            <Sparkles size={13} />
            {dateLabel}
          </div>
          <h1>
            {getGreeting()}, <span className="hey-script">{displayName || "there"}.</span>
          </h1>
          <p>What matters most to you right now?</p>
        </div>
      </motion.header>

      <motion.button
        type="button"
        className="hey-dashboard-talk"
        onClick={() => navigate("/chat")}
        onPointerDown={() => buzz("light")}
        whileHover={{ y: -3 }}
        whileTap={{ scale: 0.985, transition: press }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.08 }}
      >
        <span className="hey-dashboard-talk-icon"><MessageCircle size={22} /></span>
        <span>
          <strong>Talk to HEY</strong>
          <small>Your intelligence, one message away</small>
        </span>
        <span className="hey-dashboard-talk-send">↗</span>
      </motion.button>

      <section className="hey-dashboard-stats" aria-label="HEY overview">
        <div className="hey-stat-card">
          <span className="hey-stat-icon accent"><BrainCircuit size={18} /></span>
          <div><strong>{allAgents.length}</strong><span>specialists ready</span></div>
        </div>
        <div className="hey-stat-card">
          <span className="hey-stat-icon lavender"><Activity size={18} /></span>
          <div><strong>{memoryCount}</strong><span>memories in your Cosmos</span></div>
        </div>
        <div className="hey-stat-card">
          <span className="hey-stat-icon green"><ShieldCheck size={18} /></span>
          <div><strong>{online ? "Online" : "Offline"}</strong><span>{online ? "working in this browser" : "changes will sync later"}</span></div>
        </div>
      </section>

      <div className="hey-dashboard-section-heading">
        <div><span className="section-label">Move through your day</span><h2>Three steps from here.</h2></div>
      </div>

      <section className="hey-action-grid" aria-label="Quick actions">
        {tiles.map(({ label, description, icon: Icon, path, tone }, index) => (
          <motion.button
            key={label}
            type="button"
            className={`hey-action-card ${tone}`}
            onClick={() => navigate(path)}
            onPointerDown={() => buzz("light")}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.97, transition: press }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.16 + index * 0.07 }}
          >
            <span className="hey-action-icon"><Icon size={19} /></span>
            <span><strong>{label}</strong><small>{description}</small></span>
          </motion.button>
        ))}
      </section>

      <button
        type="button"
        className="hey-dashboard-expand"
        onClick={() => setShowWidgets(!showWidgets)}
        aria-expanded={showWidgets}
      >
        <span>{showWidgets ? "Show less" : "Explore more"}</span>
        <ChevronDown size={18} style={{ transform: showWidgets ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>

      <motion.div
        initial={false}
        animate={{ height: showWidgets ? "auto" : 0, opacity: showWidgets ? 1 : 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        style={{ overflow: "hidden" }}
      >
        <div className="hey-dashboard-section-heading">
          <div><span className="section-label">Your intelligence workspace</span><h2>Widgets that keep you in flow.</h2></div>
        </div>

        <section className="hey-widget-grid" aria-label="Dashboard widgets">
          <ProactiveSuggestionsWidget />
          <DailyPlanWidget />
          <FocusTimerWidget />
          <MemoryGalaxyWidget />
          <QuickNoteWidget />
          <HabitStreakWidget />
          <GoalProgressWidget />
          <PrayerTimesWidget />
          <ActivityWidget />
        </section>
      </motion.div>

    </div>
    </PullToRefresh>
  );
}