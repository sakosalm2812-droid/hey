import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

import { buzz } from "./lib/heyFeedback";
import { press, springs } from "./lib/heyMotion";
import Sidebar from "./Sidebar";
import { useAuth } from "./AuthContext.jsx";
import { createRecord, listRecords } from "./lib/heyRecords.js";
import {
  FolderKanban,
  Plus,
  Users,
  Calendar,
  TrendingUp,
  CircleDot,
  Crown,
} from "lucide-react";

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      setError("");

      try {
        const records = await listRecords(user.id, "project");
        if (cancelled) return;
        setProjects(records.map((record) => ({
          id: record.id,
          name: record.title,
          description: record.content || "New project ready for planning",
          progress: Number(record.metadata?.progress) || 0,
          status: record.metadata?.status || "Planning",
          createdAt: new Date(record.created_at),
        })));
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Could not load your projects.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProjects();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function addProject(event) {
    event.preventDefault();
    const name = projectName.trim();
    if (!name || !user?.id) return;

    try {
        const saved = await createRecord(user.id, "project", {
          title: name,
          content: "New project ready for planning",
          metadata: {
            progress: 0,
            status: "Planning",
            members: 1,
          },
        });
      setProjects((current) => [{
        id: saved.id,
        name: saved.title,
        description: "New project ready for planning",
        progress: 0,
        status: "Planning",
        metadata: { members: 1 },
        createdAt: new Date(saved.created_at),
      }, ...current]);
      setProjectName("");
      setNewProjectOpen(false);
    } catch (saveError) {
      setError(saveError.message || "That project could not be saved.");
    }
  }

  const completed = projects.filter((project) => project.progress >= 100).length;
  const inProgress = projects.length - completed;

  const stats = [
    ["Projects", String(projects.length)],
    ["In Progress", String(inProgress)],
    ["Completed", String(completed)],
  ];

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--bg-primary)",
      }}
    >
      <Sidebar />

      <main
        style={{
          flex: 1,
          marginLeft: 300,
          padding: 40,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 40,
          }}
        >
          <div>
            <div
              style={{
                color: "var(--gold-primary)",
                fontSize: 12,
                letterSpacing: ".18em",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Company
            </div>

            <h1
              style={{
                fontFamily: '"Instrument Serif", serif',
                fontSize: 64,
                fontWeight: 400,
              }}
            >
              Projects
            </h1>

            <p style={{ color: "var(--text-secondary)", marginTop: 10 }}>
              Projects you create here are saved to your account. Each one links to the Forge.
            </p>
          </div>

          <button
            onClick={() => setNewProjectOpen((current) => !current)}
            className="hey-btn-primary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Plus size={18} />
            New Project
          </button>
        </div>

        {error && <p style={{ color: "var(--coral)", marginBottom: 20 }}>{error}</p>}

        {newProjectOpen && (
          <form onSubmit={addProject} className="glass-card" style={{ display: "flex", gap: 10, marginBottom: 30, padding: 18 }}>
            <input value={projectName} onChange={(event) => setProjectName(event.target.value)} className="hey-input" placeholder="Project name" aria-label="New project name" autoFocus />
            <button type="submit" className="hey-btn-primary">Create Project</button>
          </form>
        )}

        {loading ? (
          <p style={{ color: "var(--text-secondary)", marginBottom: 30 }}>Loading your projects...</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 20,
              marginBottom: 30,
            }}
          >
            {stats.map(([label, value]) => (
              <div
                key={label}
                className="glass-card"
                style={{ padding: 24 }}
              >
                <div
                  style={{
                    color: "var(--text-secondary)",
                    marginBottom: 8,
                  }}
                >
                  {label}
                </div>

                <div
                  style={{
                    fontFamily: '"Instrument Serif", serif',
                    fontSize: 38,
                  }}
                >
                  {value}
                </div>
              </div>
            ))}

            <div className="glass-card" style={{ padding: 24 }}>
              <div
                style={{
                  color: "var(--text-secondary)",
                  marginBottom: 8,
                }}
              >
                Average Progress
              </div>

              <div
                style={{
                  fontFamily: '"Instrument Serif", serif',
                  fontSize: 38,
                }}
              >
                {projects.length
                  ? `${Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / projects.length)}%`
                  : "–"}
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(380px,1fr))",
            gap: 22,
          }}
        >
          {projects.map((project) => (
            <motion.div
              key={project.id}
              onClick={() => navigate("/forge")}
              onKeyDown={(event) => { if (event.key === "Enter") navigate("/forge"); }}
              role="button"
              tabIndex={0}
              aria-label={`Open ${project.name} in the Forge`}
              whileHover={{
                y: -4,
                transition: springs.gentle,
              }}
              whileTap={{
                scale: 0.98,
                transition: press,
              }}
              onPointerDown={() => buzz("light")}
              className="glass-card"
              style={{
                padding: 26,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 18,
                }}
              >
                <FolderKanban
                  color="var(--gold-primary)"
                />

                <Crown
                  color="var(--gold-primary)"
                  size={18}
                />
              </div>

              <h2
                style={{
                  fontSize: 26,
                  marginBottom: 8,
                }}
              >
                {project.name}
              </h2>

              <p
                style={{
                  color: "var(--text-secondary)",
                  lineHeight: 1.8,
                  marginBottom: 20,
                }}
              >
                {project.description}
              </p>

              <div
                style={{
                  height: 8,
                  borderRadius: 999,
                  background: "rgba(255,255,255,.06)",
                  overflow: "hidden",
                  marginBottom: 18,
                }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${project.progress}%`,
                  }}
                  transition={springs.gentle}
                  style={{
                    height: "100%",
                    background:
                      "linear-gradient(90deg,var(--green-primary),#6DB58A)",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 18,
                  color: "var(--gold-primary)",
                  fontWeight: 600,
                }}
              >
                <span>{project.progress}%</span>

                <span>{project.status}</span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  color: "var(--text-secondary)",
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  <Users size={14} />
                  {project.metadata?.members ? `${project.metadata.members} Member${project.metadata.members === 1 ? "" : "s"}` : "Solo"}
                </span>

                <span
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  <Calendar size={14} />
                  {project.createdAt.toLocaleDateString()}
                </span>
              </div>

              <div
                style={{
                  marginTop: 18,
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  color: "var(--text-secondary)",
                  fontSize: 13,
                }}
              >
                <CircleDot
                  size={12}
                  color="#6DB58A"
                />
                Tracked locally and in the Forge
              </div>
            </motion.div>
          ))}
        </div>

        {!loading && projects.length === 0 && (
          <div className="glass-card" style={{ marginTop: 24, padding: 24, color: "var(--text-secondary)" }}>
            No projects yet. Create your first project above to start tracking it.
          </div>
        )}

        <div
          className="glass-card"
          style={{
            marginTop: 30,
            padding: 24,
            display: "flex",
            gap: 16,
            alignItems: "center",
          }}
        >
          <TrendingUp
            color="var(--gold-primary)"
          />

          <div>
            <div
              style={{
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              How HEY tracks this
            </div>

            <div
              style={{
                color: "var(--text-secondary)",
                lineHeight: 1.7,
              }}
            >
              Progress is the value stored on each project. It starts at zero and
              is meant to be updated as work completes — HEY does not guess how far
              along a project is.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}