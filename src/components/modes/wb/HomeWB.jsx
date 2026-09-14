import { useState } from "react";
import { Sunrise, Sunset, CalendarDays } from "lucide-react";
import { Panel, Stat } from "./primitives.jsx";

export default function HomeWB({ workspace }) {
  const { state, log } = workspace;
  const [now, setNow] = useState(new Date());
  const hour = now.getHours();
  const greeting = hour < 12 ? "Sabah al-khair" : hour < 18 ? "Nahaarak sa'eed" : "Masa' al-khair";
  const Icon = hour < 12 ? Sunrise : hour < 18 ? CalendarDays : Sunset;
  const focus = state.task || "Nothing set yet — start in any surface below.";

  function refresh() {
    setNow(new Date());
    log("Home refreshed.");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Time" value={now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} tone="var(--lavender)" />
        <Stat label="Day" value={now.toLocaleDateString([], { weekday: "long" })} tone="var(--gold)" />
        <Stat label="Greeting" value="Salam" tone="var(--green-accent)" />
      </div>

      <Panel label="Home" right={<Icon size={16} color="var(--gold)" onClick={refresh} role="button" aria-label="Refresh" tabIndex={0} style={{ cursor: "pointer" }} />}>
        <h2 className="font-heading text-4xl text-[var(--text-primary)]">{greeting}</h2>
        <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">This is HEY Home — the calm start of every session. It reports what is true: your current focus and where you left off.</p>

        <div className="mt-6 rounded-2xl border border-[rgba(255,255,255,.08)] p-5">
          <span className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Current focus</span>
          <p className="mt-2 text-xl leading-8 text-[var(--text-primary)]">{focus}</p>
        </div>
      </Panel>

      <p className="text-xs text-[var(--text-muted)]">Boundary: Home reports what is true. It never invents status.</p>
    </div>
  );
}