import { useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Circle,
  FileText,
  ListChecks,
  LockKeyhole,
  Play,
  Sparkles,
} from "lucide-react";

import { springs } from "../../lib/heyMotion.js";
import { buzz } from "../../lib/heyFeedback.js";

const ICONS = {
  Braces: "Braces",
  Wrench: "Wrench",
  Users: "Users",
  GraduationCap: "GraduationCap",
  Search: "Search",
  Sparkles: "Sparkles",
  Feather: "Feather",
  PenTool: "PenTool",
  BarChart3: "BarChart3",
  FolderKanban: "FolderKanban",
  Workflow: "Workflow",
  MonitorUp: "MonitorUp",
  Mic: "Mic",
  Route: "Route",
  ShieldCheck: "ShieldCheck",
  Clock3: "Clock3",
  Compass: "Compass",
  Languages: "Languages",
  Brain: "Brain",
  House: "House",
  Accessibility: "Accessibility",
  Smartphone: "Smartphone",
  Heart: "Heart",
  Spline: "Spline",
};

const ACCENT = {
  gold: "var(--gold)",
  coral: "var(--coral)",
  green: "var(--green-accent)",
  lavender: "var(--lavender)",
};

function StageDots({ states, stage, onStage }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {states.map((stageName, index) => {
        const active = index === stage;
        const done = index < stage;
        return (
          <button
            key={stageName}
            type="button"
            onClick={() => onStage(index)}
            aria-label={`Stage ${stageName}`}
            onPointerDown={() => buzz("light")}
            className="flex items-center gap-2 rounded-2xl px-3 py-2 text-xs transition"
            style={{
              background: active ? "rgba(255,255,255,.09)" : "transparent",
              border: active ? "1px solid rgba(255,255,255,.18)" : "1px solid transparent",
              color: "var(--text-secondary)",
            }}
          >
            {done ? <CheckCircle2 size={13} color="var(--green-accent)" /> : <Circle size={13} />}
            <span style={{ fontSize: 11, textTransform: "capitalize", color: active ? "var(--text-primary)" : "var(--text-secondary)" }}>
              {stageName}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ActivityLog({ activity }) {
  return (
    <div className="space-y-2">
      {activity.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">No activity yet. Start working and HEY will keep the receipts.</p>
      ) : (
        activity.map((entry) => (
          <div key={entry.id} className="flex items-start gap-2 text-xs leading-6">
            <span style={{ color: ACCENT.gold }}>·</span>
            <span className="min-w-0 text-[var(--text-secondary)]">{entry.message}</span>
          </div>
        ))
      )}
    </div>
  );
}

export default function ModeChrome({ mode, workspace, children }) {
  const [tab, setTab] = useState("surface");
  const { state, setStage, setCheckResult, addCheck } = workspace;
  const accent = ACCENT[mode.color] || ACCENT.lavender;
  const passed = state.checks.filter((check) => check.result === "pass").length;
  const failed = state.checks.filter((check) => check.result === "fail").length;
  const done = state.checks.length > 0 && failed === 0 && passed === state.checks.length;

  const stages = mode.states || ["start", "work", "done"];

  return (
    <div className="mt-6">
      {/* Surface header */}
      <motion.section
        className="glass-card p-6"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.gentle}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className="grid h-12 w-12 place-items-center rounded-2xl"
              style={{ background: `${accent}1c`, border: "1px solid rgba(255,255,255,.1)" }}
            >
              <span className="font-heading text-lg" style={{ color: accent }}>{ICONS[mode.icon] || "◆"}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs tracking-widest" style={{ color: accent }}>{mode.modeId}</span>
                <h2 className="font-heading text-3xl text-[var(--text-primary)]">{mode.name}</h2>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{mode.purpose}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-[rgba(255,255,255,.08)] px-4 py-2 text-xs text-[var(--text-secondary)]">
            <LockKeyhole size={14} color="var(--gold)" />
            {passed} passed · {failed} failed · {state.checks.length - passed - failed} pending
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <StageDots states={stages} stage={state.stage || 0} onStage={(index) => { setStage(index); buzz("light"); }} />
        </div>

        <p className="mt-4 rounded-2xl border border-[rgba(255,255,255,.06)] bg-[rgba(255,255,255,.03)] p-4 text-xs leading-6 text-[var(--text-secondary)]">
          <span className="mr-1 inline-flex items-center gap-1" style={{ color: accent }}>
            <Sparkles size={12} /> Boundary rule
          </span>
          {mode.gates}
        </p>
      </motion.section>

      {/* Task line */}
      <section className="glass-card mt-4 p-5">
        <div className="flex items-center gap-3">
          <Play size={14} color="var(--gold)" />
          <input
            value={state.task}
            onChange={(event) => workspace.patch({ task: event.target.value })}
            placeholder="What are you working on in this mode?"
            aria-label="Current task"
            className="hey-input"
            style={{ flex: 1, background: "rgba(0,0,0,.18)", border: 0, color: "var(--text-primary)" }}
          />
        </div>
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        {["surface", "musts", "notes"].map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => { setTab(name); buzz("light"); }}
            onPointerDown={buzz}
            className="hey-btn-ghost"
            style={{
              minHeight: 34,
              padding: "7px 14px",
              fontSize: 12,
              background: tab === name ? "rgba(255,255,255,.1)" : "transparent",
              borderColor: tab === name ? "rgba(255,255,255,.2)" : "var(--border)",
            }}
          >
            {name === "surface" && <FileText size={13} />}
            {name === "musts" && <ListChecks size={13} />}
            {name === "notes" && <Activity size={13} />}
            {name === "surface" ? "Surface" : name === "musts" ? `Musts (${state.checks.length})` : "Notes"}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr] xl:grid-cols-[380px_1fr]">
        <aside className="glass-card p-5">
          {tab === "surface" && (
            <div>
              <div className="mb-4 flex items-center gap-2">
                <Activity size={14} color="var(--lavender)" />
                <span className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Activity log</span>
              </div>
              <ActivityLog activity={state.activity} />
            </div>
          )}

          {tab === "musts" && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Musts before done</span>
                <span className="text-lg font-semibold" style={{ color: done ? "var(--green-accent)" : "var(--gold)" }}>{done ? "✓" : `${passed}/${state.checks.length}`}</span>
              </div>

              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const input = event.currentTarget.elements.namedItem("check");
                  if (input?.value?.trim()) {
                    addCheck(input.value.trim());
                    input.value = "";
                  }
                }}
              >
                <input name="check" placeholder="Add a must…" aria-label="Add a must" className="hey-input" style={{ background: "rgba(0,0,0,.18)", border: 0, fontSize: 12 }} />
                <button type="submit" className="hey-btn-ghost" style={{ minHeight: 38, padding: "0 12px", fontSize: 11 }}>Add</button>
              </form>

              <div className="mt-4 space-y-2">
                {state.checks.length === 0 && <p className="text-xs text-[var(--text-muted)]">No musts yet. Add the checks that make this surface truthful.</p>}
                {state.checks.map((check) => (
                  <div key={check.id} className="rounded-2xl border border-[rgba(255,255,255,.08)] p-3" style={{ background: "rgba(255,255,255,.03)" }}>
                    <p className="text-sm leading-6 text-[var(--text-primary)]">{check.text}</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="hey-btn-ghost"
                        style={{ minHeight: 28, padding: "3px 10px", fontSize: 10, borderColor: "rgba(124,184,124,.35)", color: "var(--green-accent)" }}
                        onClick={() => setCheckResult(check.id, check.result === "pass" ? null : "pass")}
                      >
                        Pass
                      </button>
                      <button
                        type="button"
                        className="hey-btn-ghost"
                        style={{ minHeight: 28, padding: "3px 10px", fontSize: 10, borderColor: "rgba(255,122,138,.35)", color: "var(--coral)" }}
                        onClick={() => setCheckResult(check.id, check.result === "fail" ? null : "fail")}
                      >
                        Fail
                      </button>
                      <span className="ml-auto self-center text-xs" style={{ color: check.result === "pass" ? "var(--green-accent)" : check.result === "fail" ? "var(--coral)" : "var(--text-muted)" }}>
                        {check.result === "pass" ? "✓ passed" : check.result === "fail" ? "✕ failed" : "pending"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "notes" && (
            <div>
              <div className="mb-4 flex items-center gap-2">
                <ChevronRight size={14} color="var(--green-accent)" />
                <span className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Sticky notes</span>
              </div>
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const input = event.currentTarget.elements.namedItem("note");
                  if (input?.value?.trim()) {
                    workspace.addNote(input.value.trim());
                    input.value = "";
                  }
                }}
              >
                <input name="note" placeholder="Note something…" aria-label="Add a note" className="hey-input" style={{ background: "rgba(0,0,0,.18)", border: 0, fontSize: 12 }} />
                <button type="submit" className="hey-btn-ghost" style={{ minHeight: 38, padding: "0 12px", fontSize: 11 }}>Keep</button>
              </form>

              <div className="mt-4 space-y-2">
                {state.notes.length === 0 && <p className="text-xs text-[var(--text-muted)]">No notes yet.</p>}
                {state.notes.map((note) => (
                  <div key={note.id} className="rounded-2xl border border-[rgba(255,255,255,.08)] p-3">
                    <p className="text-sm leading-6 text-[var(--text-primary)]">{note.text}</p>
                    <span className="text-[10px] text-[var(--text-muted)]">{new Date(note.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        <section className="glass-card p-5 lg:min-h-[420px]" style={{ borderColor: "rgba(255,255,255,.09)" }}>
          {children}
        </section>
      </div>
    </div>
  );
}