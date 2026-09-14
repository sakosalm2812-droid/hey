import { useState } from "react";
import { FolderPlus, Inbox } from "lucide-react";
import { Field, Panel, SmallButton, Stat, Tag } from "./primitives.jsx";

export default function OrganizeWB({ workspace }) {
  const { state, patch, log } = workspace;
  const [scrap, setScrap] = useState("");
  const [folderName, setFolderName] = useState("");
  const items = (state.items || []).filter((i) => i.kind === "item");
  const unclaimed = items.filter((i) => !i.folder);
  const folders = state.payload?.folders || [];

  function capture(event) {
    event.preventDefault();
    const text = scrap.trim();
    if (!text) return;
    workspace.addItem({ kind: "item", text, folder: null });
    workspace.log(`Captured scrap: "${text}".`);
    setScrap("");
    patch({ stage: 1 });
  }

  function addFolder(event) {
    event.preventDefault();
    const name = folderName.trim();
    if (!name) return;
    patch({ payload: { ...state.payload, folders: [...folders, { id: crypto.randomUUID?.() || Date.now(), name }] } });
    setFolderName("");
  }

  function move(id, folderId) {
    patch({ items: items.map((i) => (i.id === id ? { ...i, folder: folderId } : i)) });
    log("Item filed.");
  }

  function verifyAll() {
    if (unclaimed.length === 0) {
      patch({ stage: 2 });
      log("Everything has one home.");
    } else {
      log(`${unclaimed.length} item${unclaimed.length === 1 ? "" : "s"} still unclaimed.`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Scraps" value={items.length} tone="var(--lavender)" />
        <Stat label="Unclaimed" value={unclaimed.length} tone={unclaimed.length ? "var(--coral)" : "var(--green-accent)"} />
        <Stat label="Folders" value={folders.length} tone="var(--gold)" />
      </div>

      <form onSubmit={capture}>
        <Field label="Capture a scrap">
          <div className="flex gap-2">
            <input className="hey-input flex-1" value={scrap} onChange={(e) => setScrap(e.target.value)} placeholder="Anything you want to keep — links, notes, ideas…" aria-label="Scrap" />
            <SmallButton kind="primary"><Inbox size={13} /> Capture</SmallButton>
          </div>
        </Field>
      </form>

      <form onSubmit={addFolder}>
        <Field label="New folder">
          <div className="flex gap-2">
            <input className="hey-input flex-1" value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="e.g. Ideas, At work, Ramadan plans" aria-label="Folder name" />
            <SmallButton><FolderPlus size={13} /> Add</SmallButton>
          </div>
        </Field>
      </form>

      {items.length > 0 && (
        <Panel label="Sort queue" right={<SmallButton onClick={verifyAll}>Verify all</SmallButton>}>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[rgba(255,255,255,.08)] p-3">
                <span className="flex-1 min-w-40 text-sm text-[var(--text-primary)]">{item.text}</span>
                <select
                  value={item.folder || ""}
                  onChange={(e) => move(item.id, e.target.value || null)}
                  className="hey-input"
                  style={{ width: 160, fontSize: 12 }}
                  aria-label="Folder for item"
                >
                  <option value="">Unclaimed</option>
                  {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                </select>
                {item.folder && <Tag tone="green">{folders.find((f) => f.id === item.folder)?.name}</Tag>}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <p className="text-xs text-[var(--text-muted)]">Boundary: nothing is silently archived. Sorting is a visible, confirmed step.</p>
    </div>
  );
}