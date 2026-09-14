import { useState } from "react";
import { Play, RotateCw, Terminal, Trash2 } from "lucide-react";
import { Panel, Empty, SmallButton } from "./primitives.jsx";

const SHELL = (code) => `
const console = { log: (...a) => globalThis.__out.log(String(a.map((x) => typeof x === "string" ? x : JSON.stringify(x)).join(" "))) };
try {
${code}
} catch (err) {
  console.log("✕ " + (err && err.message ? err.message : String(err)));
}
`;

export default function CodeWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [running, setRunning] = useState(false);
  const code = state.payload?.code || "";
  const output = state.payload?.output || "";

  function run() {
    setRunning(true);
    log("Running code in the isolated sandbox…");
    const logs = [];
    const sandbox = { __out: { log: (line) => logs.push(line) } };
    try {
      const fn = new Function("globalThis",
        `"use strict"; return (async () => { const globalThis = arguments[0]; ${SHELL(code)} })();`);
      Promise.resolve(fn(sandbox))
        .then(() => {
          patch({ payload: { ...state.payload, output: logs.join("\n") } });
          setRunning(false);
          log("Sandbox finished.");
        })
        .catch((err) => {
          patch({ payload: { ...state.payload, output: logs.concat(["✕ " + (err?.message || String(err))]).join("\n") } });
          setRunning(false);
        });
    } catch (err) {
      patch({ payload: { ...state.payload, output: logs.concat(["✕ " + (err?.message || String(err))]).join("\n") } });
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel label="Source" right={<SmallButton onClick={run} kind="primary"><Play size={13} /> {running ? "Running…" : "Run"}</SmallButton>}>
        <textarea
          className="hey-input w-full"
          rows={14}
          spellCheck={false}
          value={code}
          onChange={(event) => patch({ payload: { ...state.payload, code: event.target.value } })}
          placeholder={"// Write code here. It runs only in this sandbox.\nfunction greet(name) {\n  return \"hello \" + name;\n}\nconsole.log(greet(\"world\"));"}
          aria-label="Code editor"
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, lineHeight: 1.7, background: "rgba(0,0,0,.3)", border: 0, color: "var(--text-primary)" }}
        />
      </Panel>

      <Panel label="Sandbox output" right={output ? <SmallButton onClick={() => patch({ payload: { ...state.payload, output: "" } })}><Trash2 size={13} /> Clear</SmallButton> : <Terminal size={14} color="var(--text-muted)" />}>
        {output ? (
          <pre className="whitespace-pre-wrap rounded-2xl p-4 text-xs leading-6" style={{ background: "rgba(0,0,0,.3)", color: "var(--green-accent)", fontFamily: "ui-monospace, Menlo, monospace" }}>{output}</pre>
        ) : (
          <Empty>Output of your code will appear here. Nothing touches the real machine — the document boundary rule.</Empty>
        )}
      </Panel>

      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <RotateCw size={12} /> Runs inside a scoped sandbox. No filesystem access without explicit permission.
      </div>
    </div>
  );
}