import { useCallback, useEffect, useState } from "react";
import PageHeader from "./components/layout/PageHeader";
import HEYCard from "./components/ui/HEYCard";
import MemoryTimeline from "./components/memory/MemoryTimeline";
import { useAuth } from "./AuthContext";
import {
  deleteMemory,
  getMemory,
  searchMemory,
} from "./lib/heyMemory.js";
import { exportMemories } from "./core/memoryEngine.js";
import {
  listInbox,
  approveMemory,
  rejectMemory,
  isAutoApproveEnabled,
  setAutoApproveEnabled,
} from "./core/memoryInbox.js";
import {
  Search,
  Brain,
  Download,
  ShieldCheck,
  Inbox,
  Check,
  X,
  Settings2,
} from "lucide-react";

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const inboxRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 16px",
  borderBottom: "1px solid rgba(255,255,255,.06)",
  fontSize: 14,
};

export default function MemoryPage() {
  const { user } = useAuth();
  const [memories, setMemories] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inbox, setInbox] = useState([]);
  const [autoApprove, setAutoApprove] = useState(() => isAutoApproveEnabled());
  const [message, setMessage] = useState("");

  const userId = user?.id;
  const loadMemories = useCallback(async () => {
    if (!userId) {
      setMemories([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const rows = query.trim()
        ? await searchMemory(userId, query.trim())
        : await getMemory(userId);

      setMemories(rows.map((memory) => ({
        id: memory.id,
        title: memory.category || "Memory",
        category: memory.category || "General",
        date: new Date(memory.created_at).toLocaleDateString(),
        description: memory.memory,
      })));
    } catch (err) {
      console.error("Failed to load memories:", err);
      setError("Could not load memories. Please try again.");
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, [query, userId]);

  const loadInbox = useCallback(() => {
    setInbox(listInbox());
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadMemories();
      loadInbox();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadMemories, loadInbox]);

  function toggleAutoApprove() {
    const next = !autoApprove;
    setAutoApproveEnabled(next);
    setAutoApprove(next);
    setMessage(next ? "New automatic memories will be stored without asking." : "HEY will pause new automatic memories in your inbox for review.");
  }

  async function handleApprove(id) {
    if (!user?.id) return;
    const result = await approveMemory(id, user.id);
    setMessage(result.success
      ? (result.backedUp ? "Memory approved and stored." : "Memory approved locally.")
      : "That memory could not be approved.");
    loadInbox();
    loadMemories();
  }

  function handleReject(id) {
    const result = rejectMemory(id);
    setMessage(result.success ? "Memory discarded." : "That memory could not be discarded.");
    loadInbox();
  }

  async function handleDelete(id) {
    try {
      const deleted = await deleteMemory(id);
      if (deleted) {
        setMemories((current) => current.filter((memory) => memory.id !== id));
      } else {
        setError("Could not delete that memory.");
      }
    } catch (err) {
      console.error("Failed to delete memory:", err);
      setError("Could not delete that memory.");
    }
  }

  function handleExport() {
    const contextExport = exportMemories();
    const payload = {
      app: "HEY",
      source: "Memory page export",
      exportedAt: contextExport.exportedAt,
      records: memories.map((memory) => ({
        id: memory.id,
        category: memory.category,
        content: memory.description,
        storedAt: memory.date,
      })),
      engineMemories: contextExport.memories,
      pendingMemoryInbox: inbox,
    };
    downloadJson(`hey-memory-export-${contextExport.exportedAt.slice(0, 10)}.json`, payload);
  }

  return (
    <div>
      <PageHeader
        title="Memory"
        subtitle="Everything HEY understands about your world."
      />

      <HEYCard
        padding={24}
        style={{
          marginBottom: 28,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <Search
          size={20}
          color="var(--text-secondary)"
        />

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search memories..."
          aria-label="Search memories"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text-primary)",
            fontSize: 16,
          }}
        />

        <button
          type="button"
          onClick={handleExport}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            borderRadius: 14,
            border: "none",
            cursor: "pointer",
            background: "rgba(124,184,124,.12)",
            color: "var(--green-accent)",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <Download size={16} />
          Export JSON
        </button>
      </HEYCard>

      {error && (
        <p style={{ color: "var(--coral, #FF9E7A)", marginBottom: 16 }}>
          {error}
        </p>
      )}

      {message && (
        <p style={{ color: "var(--gold-primary, #F7C96F)", marginBottom: 16, fontSize: 14 }}>
          {message}
        </p>
      )}

      {/* Memory inbox */}
      <HEYCard padding={0} style={{ marginBottom: 28, overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "18px 20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Inbox size={18} color={inbox.length ? "var(--gold-primary)" : "var(--text-secondary)"} />
            <strong style={{ fontSize: 15 }}>
              Memory inbox
            </strong>
            {inbox.length > 0 && (
              <span
                style={{
                  background: "rgba(247,201,111,.16)",
                  color: "var(--gold-primary)",
                  borderRadius: 999,
                  padding: "2px 10px",
                  fontSize: 12,
                }}
              >
                {inbox.length} awaiting review
              </span>
            )}
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <Settings2 size={14} />
            Auto-approve new automatic memories
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={toggleAutoApprove}
              style={{ width: 16, height: 16, accentColor: "#F7C96F", cursor: "pointer" }}
              aria-label="Auto-approve new automatic memories"
            />
          </label>
        </div>

        <p
          style={{
            padding: "12px 20px",
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            borderBottom: "1px solid rgba(255,255,255,.06)",
          }}
        >
          When HEY picks up something it thinks is worth keeping about you, the memory waits here
          for your approval first. Nothing is stored until you say yes.
        </p>

        {inbox.length === 0 ? (
          <p style={{ padding: "18px 20px", fontSize: 14, color: "var(--text-secondary)" }}>
            Nothing pending. HEY will ask before storing automatic memories.
          </p>
        ) : (
          <div>
            {inbox.map((item) => (
              <div key={item.id} style={inboxRowStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.value}
                  </div>
                  <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 3 }}>
                    {item.type} · picked up moments before {new Date(item.createdAt).toLocaleTimeString()}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleApprove(item.id)}
                  aria-label={`Approve memory: ${item.value}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 12,
                    border: "none",
                    cursor: "pointer",
                    background: "rgba(124,184,124,.14)",
                    color: "var(--green-accent)",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <Check size={14} />
                  Approve
                </button>

                <button
                  type="button"
                  onClick={() => handleReject(item.id)}
                  aria-label={`Discard memory: ${item.value}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 12,
                    border: "none",
                    cursor: "pointer",
                    background: "rgba(255,122,138,.1)",
                    color: "var(--coral)",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <X size={14} />
                  Discard
                </button>
              </div>
            ))}
          </div>
        )}
      </HEYCard>

      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Loading memories...</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "280px 1fr",
            gap: 24,
          }}
        >
          <HEYCard>
            <Brain
              color="var(--gold-primary)"
            />

            <h3
              style={{
                marginTop: 16,
                fontSize: 24,
              }}
            >
              Memory Intelligence
            </h3>

            <p
              style={{
                marginTop: 12,
                color: "var(--text-secondary)",
                lineHeight: 1.7,
              }}
            >
              HEY connects your ideas,
              conversations, and experiences
              into meaningful knowledge.
            </p>
          </HEYCard>

          <MemoryTimeline memories={memories} onDelete={handleDelete} />
        </div>
      )}

      <HEYCard
        padding={20}
        style={{
          marginTop: 28,
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
        }}
      >
        <ShieldCheck
          size={20}
          color="var(--green-accent)"
          style={{ marginTop: 2, flexShrink: 0 }}
        />

        <div
          style={{
            fontSize: 13.5,
            color: "var(--text-secondary)",
            lineHeight: 1.7,
          }}
        >
          <strong style={{ color: "var(--text-primary)" }}>
            Everything you remember with HEY stays in your account and is never shared.
          </strong>{" "}
          You can export every stored memory as JSON at any time with Export JSON, and
          remove individual memories from the timeline. Deleting a memory removes it
          everywhere — from your workspace, your search results, and HEY&apos;s knowledge.
          New automatic memories wait in your inbox until you approve them; your explicit
          requests are stored directly.
        </div>
      </HEYCard>
    </div>
  );
}