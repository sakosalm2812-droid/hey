import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Plus, Save } from "lucide-react";
import { Field, Panel, SmallButton, Stat, Tag } from "./primitives.jsx";

export default function MeetWB({ workspace }) {
  const { state, patch, log, addItem } = workspace;
  const [agenda, setAgenda] = useState("");
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef(null);
  const items = (state.items || []).filter((i) => i.kind === "followup");

  function setTopic(event) {
    event.preventDefault();
    const text = agenda.trim();
    if (!text) return;
    patch({ payload: { ...state.payload, agenda: text }, stage: 0 });
    log(`Agenda: "${text}".`);
    setAgenda("");
  }

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop?.();
      setListening(false);
      log("Transcription stopped.");
      return;
    }

    // Permission-required by the document: microphone always gated.
    if (!navigator.mediaDevices?.getUserMedia) {
      log("Microphone not available in this browser.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      log("Live speech not supported here — add notes manually below.");
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(() => {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      recognition.onresult = (event) => {
        const text = Array.from(event.results)
          .map((result) => result[0].transcript)
          .join(" ");
        setTranscript(text);
      };
      recognition.onerror = (event) => {
        log(`Mic (${event.error}) — nothing was recorded without permission.`);
      };
      recognition.onend = () => setListening(false);
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
      patch({ stage: 1 });
      log("Live transcription started after your permission.");
    }).catch(() => {
      log("Microphone permission not granted.");
    });
  }

  function saveMeeting() {
    addItem({
      kind: "followup",
      text: transcript || "Meeting held — no captured lines.",
      agenda: state.payload?.agenda || "No agenda",
    });
    workspace.log("Meeting saved to follow-ups.");
    setTranscript("");
  }

  function saveFollowUp(event) {
    event.preventDefault();
    const text = agenda.trim();
    if (!text) return;
    addItem({ kind: "followup", text, agenda: state.payload?.agenda || "No agenda" });
    setAgenda("");
    log("Follow-up noted.");
  }

  // Clean up mic on unmount.
  useEffect(() => () => recognitionRef.current?.stop?.(), []);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Agenda" value={state.payload?.agenda ? "set" : "none"} tone="var(--lavender)" />
        <Stat label="Mic" value={listening ? "live" : "off"} tone={listening ? "var(--coral)" : "var(--gold)"} />
        <Stat label="Follow-ups" value={items.length} tone="var(--green-accent)" />
      </div>

      <form onSubmit={setTopic}>
        <Field label="Agenda/topic">
          <div className="flex gap-2">
            <input className="hey-input flex-1" value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder="What is this conversation about?" aria-label="Agenda" />
            <SmallButton>Set</SmallButton>
          </div>
        </Field>
      </form>

      <Panel
        label="Session"
        right={
          <SmallButton onClick={toggleMic} kind={listening ? "ghost" : "primary"}>
            {listening ? <MicOff size={13} /> : <Mic size={13} />} {listening ? "Stop transcription" : "Start transcription"}
          </SmallButton>
        }
      >
        <textarea
          className="hey-input w-full"
          rows={6}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Live transcription or your own notes appear here. The microphone only opens after you approve it."
          aria-label="Meeting transcript"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SmallButton onClick={saveMeeting} kind="primary"><Save size={13} /> Save session</SmallButton>
          <Tag tone={listening ? "coral" : "lavender"}>{listening ? "live" : "gated"}</Tag>
        </div>
      </Panel>

      <form onSubmit={saveFollowUp}>
        <Field label="Add a follow-up" right={<SmallButton type="submit"><Plus size={13} /> Add</SmallButton>}>
          <input className="hey-input w-full" value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder="A decision or action item worth keeping…" aria-label="Follow-up" />
        </Field>
      </form>

      {items.length > 0 && (
        <Panel label="Follow-ups">
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-[rgba(255,255,255,.08)] p-3">
                <p className="text-sm leading-6 text-[var(--text-primary)]">{item.text}</p>
                <span className="text-xs text-[var(--text-muted)]">{item.agenda}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}