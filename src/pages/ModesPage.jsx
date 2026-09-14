import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Compass, LayoutGrid, Lock } from "lucide-react";

import Sidebar from "../Sidebar";
import PageHeader from "../components/layout/PageHeader";
import ModeChrome from "../components/modes/ModeChrome.jsx";
import useModeWorkspace from "../hooks/useModeWorkspace.js";
import { allSurfaceModes, getSurfaceMode } from "../core/surfaceModes.js";

import CodeWB from "../components/modes/wb/CodeWB.jsx";
import FixWB from "../components/modes/wb/FixWB.jsx";
import CoworkWB from "../components/modes/wb/CoworkWB.jsx";
import TeachWB from "../components/modes/wb/TeachWB.jsx";
import ResearchWB from "../components/modes/wb/ResearchWB.jsx";
import CreateWB from "../components/modes/wb/CreateWB.jsx";
import WriteWB from "../components/modes/wb/WriteWB.jsx";
import DesignWB from "../components/modes/wb/DesignWB.jsx";
import AnalyzeWB from "../components/modes/wb/AnalyzeWB.jsx";
import OrganizeWB from "../components/modes/wb/OrganizeWB.jsx";
import AutomateWB from "../components/modes/wb/AutomateWB.jsx";
import PresentWB from "../components/modes/wb/PresentWB.jsx";
import MeetWB from "../components/modes/wb/MeetWB.jsx";
import PlanWB from "../components/modes/wb/PlanWB.jsx";
import ReviewWB from "../components/modes/wb/ReviewWB.jsx";
import FocusWB from "../components/modes/wb/FocusWB.jsx";
import ExploreWB from "../components/modes/wb/ExploreWB.jsx";
import TranslateWB from "../components/modes/wb/TranslateWB.jsx";
import RememberWB from "../components/modes/wb/RememberWB.jsx";
import HomeWB from "../components/modes/wb/HomeWB.jsx";
import AccessWB from "../components/modes/wb/AccessWB.jsx";
import OperateWB from "../components/modes/wb/OperateWB.jsx";
import PersonalWB from "../components/modes/wb/PersonalWB.jsx";
import CustomWB from "../components/modes/wb/CustomWB.jsx";

const WORKBENCHES = {
  code: CodeWB,
  fix: FixWB,
  cowork: CoworkWB,
  teach: TeachWB,
  research: ResearchWB,
  create: CreateWB,
  write: WriteWB,
  design: DesignWB,
  analyze: AnalyzeWB,
  organize: OrganizeWB,
  automate: AutomateWB,
  present: PresentWB,
  meet: MeetWB,
  plan: PlanWB,
  review: ReviewWB,
  focus: FocusWB,
  explore: ExploreWB,
  translate: TranslateWB,
  remember: RememberWB,
  home: HomeWB,
  access: AccessWB,
  operate: OperateWB,
  personal: PersonalWB,
  custom: CustomWB,
};

const ACCENT = {
  gold: "var(--gold)",
  coral: "var(--coral)",
  green: "var(--green-accent)",
  lavender: "var(--lavender)",
};

function SurfaceWorkbench({ wbId, workspace }) {
  const ActiveWB = WORKBENCHES[wbId] || HomeWB;
  return <ActiveWB workspace={workspace} />;
}

export default function ModesPage() {
  const [activeId, setActiveId] = useState(() => localStorage.getItem("hey_surface_active") || "home");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [query, setQuery] = useState("");

  const mode = getSurfaceMode(activeId);
  const workspace = useModeWorkspace(activeId);
  const allModes = allSurfaceModes();

  function selectMode(id) {
    setActiveId(id);
    localStorage.setItem("hey_surface_active", id);
    setLibraryOpen(false);
    workspace.log(`Switched to ${getSurfaceMode(id)?.name || "Home"} surface.`);
  }

  const filtered = allModes.filter((m) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${m.name} ${m.purpose} ${(m.keywords || []).join(" ")} ${m.modeId}`.toLowerCase().includes(q);
  });

  return (
    <div className="page-with-sidebar">
      <Sidebar />
      <main className="page-content">
        <motion.div className="px-8 py-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <PageHeader
            title="Modes"
            subtitle="24 surfaces. Every one of them permission-gated, every one of them honest about what it can and cannot do."
            icon={<Compass size={22} color="var(--gold)" />}
          />

          {/* Surface switcher */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="hey-btn-primary flex items-center gap-2"
              onClick={() => { setLibraryOpen((value) => !value); }}
              aria-expanded={libraryOpen}
            >
              <LayoutGrid size={15} /> Choose mode
            </button>
            <span className="text-xs" style={{ color: "var(--gold)" }}>
              {mode?.modeId} — {mode?.name}
            </span>
            <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <Lock size={12} /> every capability requests permission
            </span>
          </div>

          <AnimatePresence>
            {libraryOpen && (
              <motion.section
                className="glass-card mt-4 p-5"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <input
                  className="hey-input mb-4 w-full"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search all 24 modes…"
                  aria-label="Search modes"
                />
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((m) => {
                    const accent = ACCENT[m.color] || ACCENT.lavender;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => selectMode(m.id)}
                        className="text-left rounded-2xl border p-4 transition"
                        style={{
                          borderColor: m.id === activeId ? accent : "rgba(255,255,255,.08)",
                          background: m.id === activeId ? `${accent}14` : "rgba(255,255,255,.02)",
                        }}
                      >
                        <span className="text-[10px] tracking-widest" style={{ color: accent }}>{m.modeId}</span>
                        <h3 className="mt-1 font-heading text-xl text-[var(--text-primary)]">{m.name}</h3>
                        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{m.purpose}</p>
                      </button>
                    );
                  })}
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {mode && (
            <ModeChrome mode={mode} workspace={workspace}>
              <SurfaceWorkbench wbId={mode.wb} workspace={workspace} />
            </ModeChrome>
          )}
        </motion.div>
      </main>
    </div>
  );
}