import { useState } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

import { springs } from "./lib/heyMotion";
import { buzz } from "./lib/heyFeedback";
import {
  Bot,
  Sparkles,
  Search,
  Activity,
  CheckCircle2,
  Plus,
  Layers,
  Crown,
  Wifi,
  WifiOff,
  Hammer,
} from "lucide-react";

import Sidebar from "./Sidebar";
import { agentCategories } from "../agents/agents";
import {
  getAllAgents,
  getActivatedAgentIds,
  setAgentActive,
} from "../agents/agents";

export default function AgentsPage() {
  const [search, setSearch] = useState("");
  const [activated, setActivated] = useState(() => getActivatedAgentIds());
  const [online, setOnline] = useState(() => navigator.onLine);
  const navigate = useNavigate();

  useEffect(() => {
    function handleStatus() {
      setOnline(Boolean(navigator.onLine));
    }

    window.addEventListener("online", handleStatus);
    window.addEventListener("offline", handleStatus);

    return () => {
      window.removeEventListener("online", handleStatus);
      window.removeEventListener("offline", handleStatus);
    };
  }, []);

  function toggleAgent(id) {
    const wasActive = activated.includes(id);
    setAgentActive(id, !wasActive);
    buzz("light");
    setActivated(getActivatedAgentIds());
  }

  const allAgents = getAllAgents();

  const filteredAgents = allAgents.filter((agent) => {
    const query = search.toLowerCase();
    return (
      agent.name.toLowerCase().includes(query) ||
      agent.role.toLowerCase().includes(query) ||
      agent.category.toLowerCase().includes(query) ||
      (agent.capabilities || []).some((capability) =>
        capability.toLowerCase().includes(query),
      )
    );
  });

  const stats = [
    {
      label: "Total Agents",
      value: allAgents.length,
      icon: Bot,
    },
    {
      label: "Activated",
      value: activated.length,
      icon: Activity,
    },
    {
      label: "Categories",
      value: agentCategories.length,
      icon: Layers,
    },
    {
      label: "Network",
      value: online ? "Online" : "Offline",
      icon: online ? Wifi : WifiOff,
    },
  ];

  return (
    <div className="page-with-sidebar">
      <Sidebar />

      <main className="page-content">
        <motion.div
          className="px-8 py-8"
          initial={{
            opacity: 0,
            y: 20,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
        >
          <div className="mb-10 flex items-center justify-between">
            <div>
              <div className="section-label mb-3">
                Intelligence Network
              </div>

              <h1 className="font-heading text-6xl text-[var(--text-primary)]">
                Agents
              </h1>

              <p className="mt-3 text-[var(--text-secondary)]">
                A team of specialized AI minds working together. Activate the
                specialists the brain may route to.
              </p>
            </div>

            <button className="hey-btn-primary flex items-center gap-2" onClick={() => navigate("/forge")}>
              <Plus size={18} />
              Create Agent
            </button>
          </div>


          {/* Stats */}

          <div className="mb-8 grid gap-5 md:grid-cols-4">
            {stats.map((item) => {
              const Icon = item.icon;

              return (
                <motion.div
                  key={item.label}
                  className="glass-card p-6"
                  whileHover={{
                    y: -4,
                    transition: springs.gentle,
                  }}
                >
                  <Icon
                    size={22}
                    color="var(--gold)"
                  />

                  <div className="mt-5 font-heading text-4xl text-[var(--text-primary)]">
                    {item.value}
                  </div>

                  <div className="mt-2 text-sm text-[var(--text-secondary)]">
                    {item.label}
                  </div>
                </motion.div>
              );
            })}
          </div>


          {/* Search */}

          <div className="glass-card mb-8 flex items-center gap-3 p-4">
            <Search
              size={18}
              color="var(--text-secondary)"
            />

            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search agents..."
              aria-label="Search agents"
              className="hey-input flex-1"
            />
          </div>


          {/* Agent Grid */}

          <div className="grid gap-6 xl:grid-cols-3">
            {filteredAgents.map((agent) => {
              const isActive =
                activated.includes(agent.id);

              return (
                <motion.div
                  key={agent.id}
                  className="glass-card p-6"
                  initial={{
                    opacity: 0,
                    y: 20,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  whileHover={{
                    y: -4,
                    transition: springs.gentle,
                  }}
                >
                  <div className="mb-6 flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(124,184,124,0.15)]">
                      <Bot
                        size={25}
                        color="var(--green-accent)"
                      />
                    </div>

                    {isActive ? (
                      <CheckCircle2
                        size={20}
                        color="var(--green-accent)"
                      />
                    ) : (
                      <span className="badge">
                        Standby
                      </span>
                    )}
                  </div>


                  <div className="flex items-center gap-2">
                    <h2 className="font-heading text-2xl text-[var(--text-primary)]">
                      {agent.name}
                    </h2>

                    {agent.pro ? (
                      <Crown
                        size={16}
                        color="var(--gold)"
                      />
                    ) : null}
                  </div>


                  <div className="mt-2 text-sm text-[var(--gold)]">
                    {agent.role}
                  </div>


                  <p className="mt-4 min-h-[80px] leading-7 text-[var(--text-secondary)]">
                    {agent.description}
                  </p>


                  <div className="mt-5 flex flex-wrap gap-2">
                    {agent.capabilities
                      .slice(0, 4)
                      .map((skill) => (
                        <span
                          key={skill}
                          className="badge"
                        >
                          {skill}
                        </span>
                      ))}
                    {agent.custom ? (
                      <span className="badge badge-lavender flex items-center gap-1">
                        <Hammer size={12} />
                        Forged
                      </span>
                    ) : null}
                  </div>


                  <button
                    className="hey-btn-ghost mt-6 flex w-full items-center justify-center gap-2"
                    onClick={() => toggleAgent(agent.id)}
                  >
                    <Sparkles size={16} />
                    {isActive ? "Agent Active" : "Activate Agent"}
                  </button>
                </motion.div>
              );
            })}
          </div>

          {filteredAgents.length === 0 && (
            <div className="glass-card p-10 text-center">
              <p className="text-[var(--text-secondary)]">
                No agents match "{search}".
              </p>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}