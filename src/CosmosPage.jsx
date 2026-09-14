import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { springs } from "./lib/heyMotion";
import { Navigate } from "react-router-dom";
import {
  Sparkles,
  Brain,
  FolderKanban,
  Network,
  Search,
  Plus,
  Orbit,
  Database,
  CheckSquare,
} from "lucide-react";

import Sidebar from "./Sidebar";
import PageHeader from "./components/layout/PageHeader";
import CosmosSpace from "./components/cosmos/CosmosSpace";
import { EmptyState, Skeleton } from "./components/ui/StateViews";
import { useAuth } from "./AuthContext.jsx";
import { addMemory, getMemory } from "./lib/heyMemory.js";
import { listRecords } from "./lib/heyRecords.js";
import {
  upsertMemoryNode,
  connectMemoryNodes,
  getMemoryGraph,
} from "./core/memoryGraph.js";

const GRAPH_HUBS = [
  { title: "Projects", type: "project", id: "hub-projects" },
  { title: "Memory", type: "memory", id: "hub-memory" },
  { title: "Knowledge", type: "idea", id: "hub-knowledge" },
];

function nodeTitle(record) {
  const value = String(record?.title || record?.content || record?.category || "");
  const shortened = value.slice(0, 30);
  return shortened || "Memory";
}

export default function CosmosPage() {
  const { user } = useAuth();
  const [cosmosNodes, setCosmosNodes] = useState([]);
  const [cosmosEdges, setCosmosEdges] = useState([]);
  const [counts, setCounts] = useState({ memories: 0, projects: 0, tasks: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newNodeOpen, setNewNodeOpen] = useState(false);
  const [newNode, setNewNode] = useState("");

  function seedGraph(memories, projects, tasks) {
    GRAPH_HUBS.forEach((hub) => upsertMemoryNode(hub.title, { id: hub.id, type: hub.type }));

    projects.forEach((project) => {
      const node = upsertMemoryNode(nodeTitle(project), { type: "project", tags: ["project"] });
      if (node) connectMemoryNodes({ value: "Projects", id: "hub-projects" }, node, "contains", 0.8);
    });

    memories.forEach((memory) => {
      const node = upsertMemoryNode(nodeTitle(memory), {
        type: "memory",
        tags: [memory.category || "memory"],
      });
      if (node) connectMemoryNodes({ value: "Memory", id: "hub-memory" }, node, "holds", 0.8);
    });

    tasks.forEach((task) => {
      const node = upsertMemoryNode(nodeTitle(task), { type: "task", tags: ["task"] });
      if (node) connectMemoryNodes({ value: "Projects", id: "hub-projects" }, node, "belongs_to", 0.7);
    });

    const byCategory = new Map();
    memories.forEach((memory) => {
      const category = memory.category || "memory";
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category).push(nodeTitle(memory));
    });
    byCategory.forEach((titles) => {
      if (titles.length < 2) return;
      titles.slice(0, 6).forEach((title, index) => {
        const other = titles[index + 1];
        if (other) connectMemoryNodes({ value: title }, { value: other }, "shares_category", 0.45);
      });
    });

    return getMemoryGraph();
  }

  useEffect(() => {
    let cancelled = false;

    async function loadCosmos() {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

try {
          const [memories, projects, tasks] = await Promise.all([
            getMemory(user.id),
            listRecords(user.id, "project"),
            listRecords(user.id, "task"),
          ]);

          if (cancelled) return;

          setCounts({
            memories: memories.length,
            projects: projects.length,
            tasks: tasks.length,
          });

          const graph = seedGraph(memories, projects, tasks);
          const nodeIdByTitle = new Map(graph.nodes.map((graphNode) => [graphNode.value, graphNode.id]));

          setCosmosNodes([
            ...projects.slice(0, 3).map((project, index) => ({
              title: nodeTitle(project),
              id: nodeIdByTitle.get(nodeTitle(project)),
              type: "project",
              icon: FolderKanban,
              x: `${20 + index * 18}%`,
              y: "30%",
              size: 70,
            })),
            ...memories.slice(0, 5).map((memory, index) => ({
              title: nodeTitle(memory),
              id: nodeIdByTitle.get(nodeTitle(memory)),
              type: "memory",
              icon: Brain,
              x: `${15 + (index % 3) * 32}%`,
              y: `${52 + (index % 2) * 20}%`,
              size: 62,
            })),
            ...tasks.slice(0, 3).map((task, index) => ({
              title: nodeTitle(task),
              id: nodeIdByTitle.get(nodeTitle(task)),
              type: "task",
              icon: CheckSquare,
              x: `${62 + index * 12}%`,
              y: `${70 + (index % 2) * 10}%`,
              size: 58,
            })),
          ]);
          setCosmosEdges(graph.edges);
        } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Could not load your Cosmos.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCosmos();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!user) {
    return <Navigate to="/login?next=%2Fcosmos" replace />;
  }

  async function createCosmosNode(event) {
    event.preventDefault();
    if (!user?.id || !newNode.trim()) return;

    setError("");
    try {
      const saved = await addMemory(user.id, newNode.trim(), "cosmos");
      if (saved) {
        const node = upsertMemoryNode(newNode.trim(), { type: "memory", tags: ["cosmos"] });
        if (node) connectMemoryNodes({ value: "Memory", id: "hub-memory" }, node, "holds", 0.8);
        setCosmosNodes((current) => [
          {
            title: newNode.trim(),
            id: node?.id,
            type: "memory",
            icon: Sparkles,
            x: "50%",
            y: "50%",
            size: 64,
          },
          ...current,
        ]);
        setCosmosEdges(getMemoryGraph().edges);
        setCounts((current) => ({ ...current, memories: current.memories + 1 }));
        setNewNode("");
        setNewNodeOpen(false);
      } else {
        setError("That node could not be saved.");
      }
    } catch (saveError) {
      setError(saveError.message || "That node could not be saved.");
    }
  }

const totalNodes = counts.memories + counts.projects + counts.tasks;

  const universeCards = [
    {
      title: "Tasks",
      description: "The tasks you add live here, organizable from your workspace.",
      icon: Sparkles,
      value: counts.tasks,
      label: "Tasks",
    },
    {
      title: "Memories",
      description: "Everything you've asked HEY to remember, stored with your account.",
      icon: Brain,
      value: counts.memories,
      label: "Stored Memories",
    },
    {
      title: "Projects",
      description: "The projects you create, stored and accessible from your workspace.",
      icon: FolderKanban,
      value: counts.projects,
      label: "Projects",
    },
  ];

  return (
    <div className="page-with-sidebar">
      <Sidebar />

      <main className="page-content">
        <motion.div
          className="px-8 py-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <PageHeader
            title="The Cosmos"
            subtitle="Your living universe of knowledge, memories, and ideas."
          />

          {error && <p className="mt-6 text-[var(--coral)]">{error}</p>}

          {loading ? (
            <Skeleton lines={8} />
          ) : (
            <>
              {totalNodes === 0 && (
                <EmptyState
                  icon={<Network size={26} />}
                  title="Your Cosmos is waiting to grow"
                  body="Add your first memory, project, or idea and HEY will start connecting them into a living universe."
                  action={
                    <button className="hey-btn-primary" type="button" onClick={() => setNewNodeOpen(true)}>
                      <Plus size={15} /> Add your first node
                    </button>
                  }
                />
              )}
              <div className="grid gap-6 lg:grid-cols-4">
            <motion.div
              className="glass-card p-5"
              whileHover={{ y: -4, transition: springs.gentle }}
            >
              <div className="flex items-center gap-3">
                <Orbit
                  size={22}
                  color="var(--lavender)"
                />

                <span className="text-[var(--text-primary)]">
                  Universe Status
                </span>
              </div>

              <h3 className="mt-6 font-heading text-3xl text-[var(--text-primary)]">
                {totalNodes} nodes
              </h3>

              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Everything in your Cosmos, stored with your account.
              </p>
            </motion.div>

            <motion.div
              className="glass-card flex items-center gap-4 p-5"
              whileHover={{ y: -4, transition: springs.gentle }}
            >
              <Search
                size={24}
                color="var(--green-accent)"
              />

              <div>
                <div className="text-[var(--text-primary)]">
                  Search
                </div>

                <div className="text-sm text-[var(--text-secondary)]">
                  Find memories from the Memory page
                </div>
              </div>
            </motion.div>

            <motion.div
              className="glass-card flex items-center gap-4 p-5"
              whileHover={{ y: -4, transition: springs.gentle }}
            >
              <Network
                size={24}
                color="var(--gold)"
              />

              <div>
                <div className="text-[var(--text-primary)]">
                  New Node
                </div>

                <div className="text-sm text-[var(--text-secondary)]">
                  Add an idea or memory using the button below
                </div>
              </div>
            </motion.div>

            <motion.div
              className="glass-card flex items-center gap-4 p-5"
              whileHover={{ y: -4, transition: springs.gentle }}
            >
              <Database
                size={24}
                color="var(--coral)"
              />

              <div>
                <div className="text-[var(--text-primary)]">
                  Storage
                </div>

                <div className="text-sm text-[var(--text-secondary)]">
                  Saved to your account's backend
                </div>
              </div>
            </motion.div>
          </div>

          <motion.div
            className="glass-card mt-6 overflow-hidden p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="font-heading text-3xl text-[var(--text-primary)]">
                  Living Galaxy
                </h2>

                <p className="mt-2 text-[var(--text-secondary)]">
                  Every idea, memory, and project becomes a connected star.
                </p>
              </div>

              <button className="hey-btn-primary flex items-center gap-2" onClick={() => setNewNodeOpen((current) => !current)}>
                <Plus size={16} />
                New Node
              </button>
            </div>

            {newNodeOpen && (
              <form onSubmit={createCosmosNode} className="mb-6 flex gap-3">
<input
                  value={newNode}
                  onChange={(event) => setNewNode(event.target.value)}
                  placeholder="Add an idea, memory, or connection..."
                  aria-label="New cosmos node"
                  className="hey-input flex-1"
                  autoFocus
                />
                <button className="hey-btn-primary" type="submit">Save node</button>
              </form>
            )}

            <CosmosSpace
              nodes={cosmosNodes.length ? cosmosNodes : undefined}
              edges={cosmosEdges}
              hubs={GRAPH_HUBS}
            />
          </motion.div>

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {universeCards.map((card) => {
              const Icon = card.icon;

              return (
                <motion.div
                  key={card.title}
                  className="glass-card p-6"
                  whileHover={{ y: -4, transition: springs.gentle }}
                >
                  <Icon
                    size={28}
                    color="var(--gold)"
                  />

                  <h3 className="mt-5 font-heading text-2xl text-[var(--text-primary)]">
                    {card.title}
                  </h3>

                  <p className="mt-3 leading-7 text-[var(--text-secondary)]">
                    {card.description}
                  </p>

                  <div className="mt-6 rounded-2xl bg-[var(--bg-secondary)] p-4">
                    <div className="font-heading text-3xl text-[var(--text-primary)]">
                      {card.value}
                    </div>

                    <div className="mt-1 text-sm text-[var(--text-secondary)]">
                      {card.label}
                    </div>
                  </div>
                </motion.div>
              );
            })}
            </div>
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}
