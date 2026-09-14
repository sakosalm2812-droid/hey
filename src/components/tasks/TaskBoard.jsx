import { useEffect, useState } from "react";
import { useAuth } from "../../AuthContext.jsx";
import { createRecord, listRecords, updateRecord, deleteRecord } from "../../lib/heyRecords.js";
import TaskCard from "./TaskCard";

export default function TaskBoard({ filter = "All" }){
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("High");
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingPriority, setEditingPriority] = useState("High");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTasks() {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const nextTasks = await listRecords(user.id, "task");
        if (!cancelled) setTasks(nextTasks);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTasks();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const visibleTasks = filter === "All"
    ? tasks
    : tasks.filter((task) => (task.metadata?.priority || "High") === filter);

  async function addTask(event) {
    event.preventDefault();
    if (!title.trim() || !user) return;
    try {
      const task = await createRecord(user.id, "task", {
        title: title.trim(),
        metadata: { priority },
        status: "active",
      });
      setTasks((current) => [task, ...current]);
      setTitle("");
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function toggleTask(task) {
    try {
      const updated = await updateRecord(task.id, {
        status: task.status === "completed" ? "active" : "completed",
      });
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (updateError) {
      setError(updateError.message);
    }
  }

  function startEdit(task) {
    setEditingId(task.id);
    setEditingTitle(task.title || "");
    setEditingPriority(task.metadata?.priority || "High");
    setError("");
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editingTitle.trim()) return;
    try {
      const updated = await updateRecord(editingId, {
        title: editingTitle.trim(),
        metadata: { priority: editingPriority },
      });
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEditingId(null);
    } catch (updateError) {
      setError(updateError.message);
    }
  }

  async function handleDelete(task) {
    if (confirmDeleteId !== task.id) {
      setConfirmDeleteId(task.id);
      setTimeout(() => {
        setConfirmDeleteId((current) => current === task.id ? null : current);
      }, 2600);
      return;
    }

    setConfirmDeleteId(null);
    try {
      await deleteRecord(task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  return (

    <div
      style={{
        display:"flex",

        flexDirection:"column",

        gap:16,
      }}
    >

<form onSubmit={addTask} style={{ display:"flex", gap:10 }}>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a task..."
          aria-label="New task title"
          className="hey-input"
          style={{ flex:1 }}
        />
        <select value={priority} onChange={(event) => setPriority(event.target.value)} className="hey-input" aria-label="New task priority">
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </select>
        <button className="hey-btn-primary" type="submit">Add</button>
      </form>

      {error && <p style={{ color:"var(--coral)" }}>{error}</p>}

      {loading && <p style={{ color:"var(--text-secondary)" }}>Loading tasks...</p>}

      {!loading && visibleTasks.map((task) => (
        editingId === task.id ? (
          <form
            key={task.id}
            onSubmit={saveEdit}
            style={{
              display:"flex",

              gap:10,

              padding:20,

              borderRadius:22,

              background:"rgba(255,255,255,.05)",

              border:"1px solid rgba(255,255,255,.1)",
            }}
          >
            <input
              value={editingTitle}
              onChange={(event) => setEditingTitle(event.target.value)}
              placeholder="Task title"
              aria-label="Edit task title"
              className="hey-input"
              style={{ flex:1 }}
              autoFocus
            />
            <select value={editingPriority} onChange={(event) => setEditingPriority(event.target.value)} className="hey-input" aria-label="Edit task priority">
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
            <button className="hey-btn-primary" type="submit">Save</button>
            <button className="hey-btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
          </form>
        ) : (
          <TaskCard
            key={task.id}
            title={task.title}
            priority={task.metadata?.priority || priority}
            completed={task.status === "completed"}
            onToggle={() => toggleTask(task)}
            onEdit={() => startEdit(task)}
            onDelete={() => handleDelete(task)}
            deleteArmed={confirmDeleteId === task.id}
          />
        )
      ))}

      {!loading && !visibleTasks.length && !error && (
        <p style={{ color:"var(--text-secondary)" }}>
          {tasks.length === 0
            ? "Your task board is ready. Add your first task."
            : "No tasks match this priority filter."}
        </p>
      )}

    </div>

  );

}