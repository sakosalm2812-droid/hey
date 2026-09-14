import { useEffect, useRef, useState } from "react";
import { BellRing, Pause, Play, RotateCcw, Timer } from "lucide-react";
import { Field, Panel, SmallButton, Stat } from "./primitives.jsx";

const MINUTE = 60;

export default function FocusWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [minutes, setMinutes] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(MINUTE * 25);
  const [running, setRunning] = useState(false);
  const [sessionLabel, setSessionLabel] = useState("Deep work");
  const timerRef = useRef(null);

  function notifyDone() {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("HEY Focus", { body: `${sessionLabel} — session complete.` });
    }
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  }

  useEffect(() => {
    if (!running) return;
    timerRef.current = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          setRunning(false);
          patch({ stage: 2 });
          workspace.log(`Session complete: ${sessionLabel}.`);
          notifyDone();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function configure(event) {
    event.preventDefault();
    const value = Math.max(1, Math.min(180, Number(minutes) || 25));
    setMinutes(value);
    setSecondsLeft(MINUTE * value);
    setSessionLabel(event.currentTarget.elements.namedItem("label")?.value || "Deep work");
    patch({ payload: { ...state.payload, session: sessionLabel }, stage: 0 });
    log(`Session configured: ${sessionLabel} (${value} min).`);
  }

  function toggle() {
    if (running) {
      setRunning(false);
      log("Session paused — time is preserved, not run in the background.");
    } else {
      if (secondsLeft === 0) setSecondsLeft(MINUTE * minutes);
      setRunning(true);
      patch({ stage: 1 });
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
      log(`Focus started: ${sessionLabel}.`);
    }
  }

  function reset() {
    setRunning(false);
    setSecondsLeft(MINUTE * minutes);
    log("Session reset.");
  }

  const mm = String(Math.floor(secondsLeft / MINUTE)).padStart(2, "0");
  const ss = String(secondsLeft % MINUTE).padStart(2, "0");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Session" value={sessionLabel} tone="var(--lavender)" />
        <Stat label="Time left" value={`${mm}:${ss}`} tone={running ? "var(--coral)" : "var(--gold)"} />
        <Stat label="Status" value={running ? "running" : secondsLeft === 0 ? "done" : "ready"} tone={running ? "var(--green-accent)" : "var(--text-muted)"} />
      </div>

      <form onSubmit={configure} className="flex flex-wrap items-end gap-3">
        <Field label="Minutes">
          <input className="hey-input" type="number" min={1} max={180} value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="Minutes" style={{ width: 100 }} />
        </Field>
        <Field label="What are you focusing on?">
          <input className="hey-input" name="label" defaultValue="Deep work" aria-label="Session label" style={{ width: 220 }} />
        </Field>
        <SmallButton type="submit" kind="primary"><Timer size={13} /> Configure</SmallButton>
      </form>

      <Panel label="Focus clock" right={
        <div className="flex gap-2">
          {running ? <SmallButton onClick={toggle}><Pause size={13} /> Pause</SmallButton> : <SmallButton onClick={toggle} kind="primary"><Play size={13} /> Start</SmallButton>}
          <SmallButton onClick={reset}><RotateCcw size={13} /> Reset</SmallButton>
        </div>
      }>
        <div className="py-8 text-center">
          <span className="font-heading text-7xl" style={{ color: "var(--text-primary)", letterSpacing: "-0.04em" }}>{mm}:{ss}</span>
          <p className="mt-3 text-sm text-[var(--text-secondary)]">{running ? "Keep going — you asked for this protection." : "Focus protects your time; it doesn't fake blocking the internet. You keep the control."}</p>
          {running && <p className="mt-3 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]"><BellRing size={12} /> You'll be notified when it's over.</p>}
        </div>
      </Panel>
    </div>
  );
}