import { useState } from "react";
import { motion } from "framer-motion";

import { springs } from "./lib/heyMotion";
import {
  Hammer,
  Sparkles,
  Bot,
  Workflow,
  Code2,
  Image,
  FileText,
  Globe,
  Plus,
  Store,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  UserPlus,
} from "lucide-react";

import Sidebar from "./Sidebar";
import PageHeader from "./components/layout/PageHeader";
import AgentTemplate from "./components/forge/AgentTemplate";
import HEY from "./core/index.js";
import { createForgeArtifact } from "./lib/heyAI.js";
import {
  validateForgeArtifact,
  forgeAgentDefinition,
  findExistingAgentForCapability,
  forgeWorkflowDefinition,
} from "./core/forgeEngine.js";
import { saveForgeRun } from "./lib/intelligenceRecords.js";
import {
  registerCustomAgent,
  getAllAgents,
} from "../agents/agents";

const categories = [
  {
    name: "AI Agents",
    icon: Bot,
    description: "Create specialized intelligence systems.",
  },
  {
    name: "Automations",
    icon: Workflow,
    description: "Build workflows that run themselves.",
  },
  {
    name: "Apps",
    icon: Code2,
    description: "Turn ideas into working products.",
  },
  {
    name: "Images",
    icon: Image,
    description: "Generate creative visual systems.",
  },
  {
    name: "Documents",
    icon: FileText,
    description: "Create powerful document tools.",
  },
  {
    name: "Websites",
    icon: Globe,
    description: "Build digital experiences.",
  },
];

const popularTools = [
  "Research Agent",
  "Content Creator",
  "Business Planner",
  "Code Assistant",
  "Study Coach",
];

const WORKFLOW_STORAGE_KEY = "hey_forged_workflows";

function loadWorkflows() {
  try {
    const raw = localStorage.getItem(WORKFLOW_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function ForgePage() {
  const [showBuilder, setShowBuilder] = useState(false);
  const [draft, setDraft] = useState("");
  const [forgePlan, setForgePlan] = useState(null);
  const [forgeCategory, setForgeCategory] = useState("Custom creation");
  const [artifact, setArtifact] = useState(null);
  const [selectedFile, setSelectedFile] = useState("");
  const [isForging, setIsForging] = useState(false);
  const [forgeError, setForgeError] = useState("");

  const [studioTab, setStudioTab] = useState("agent");
  const [agentForm, setAgentForm] = useState({
    name: "",
    role: "",
    description: "",
    capabilities: "",
    intents: "",
    keywords: "",
    riskLevel: "low",
  });
  const [workflowForm, setWorkflowForm] = useState({
    name: "",
    steps: [{ agentId: "", action: "" }],
  });
  const [studioResult, setStudioResult] = useState(null);
  const [studioError, setStudioError] = useState("");
  const [workflows, setWorkflows] = useState(loadWorkflows);

  const agentOptions = getAllAgents();

  async function createForgePlan(event) {
    event.preventDefault();
    if (!draft.trim()) return;
    const plan = HEY.process(draft);
    setForgePlan(plan);
    setForgeError("");
    setArtifact(null);
    setIsForging(true);

    try {
      const result = await createForgeArtifact(draft.trim(), forgeCategory, plan.plan);
      const validation = result.validation || validateForgeArtifact(result.artifact);
      setArtifact({ ...result.artifact, validation });
      saveForgeRun(draft.trim(), result.artifact, validation).catch((saveError) => {
        setForgeError(`The artifact was generated but its history could not be saved: ${saveError.message}`);
      });
      setSelectedFile(result.artifact.files?.[0]?.path || "");
    } catch (error) {
      setForgeError(error instanceof Error ? error.message : "Forge could not generate the artifact.");
    } finally {
      setIsForging(false);
    }
  }

  function downloadFile(file) {
    if (!file) return;
    const blob = new Blob([file.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.path.split("/").pop() || "forge-file.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  function updateAgentField(field, value) {
    setAgentForm((current) => ({ ...current, [field]: value }));
  }

  function forgeAgent(event) {
    event.preventDefault();
    setStudioResult(null);
    setStudioError("");

    const capabilities = agentForm.capabilities
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const intents = agentForm.intents
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const keywords = agentForm.keywords
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const definition = forgeAgentDefinition({
      name: agentForm.name,
      role: agentForm.role,
      description: agentForm.description,
      capabilities,
      intents,
      keywords,
      riskLevel: agentForm.riskLevel,
    });

    if (!definition.success) {
      const failed = Object.entries(definition.validation.checks)
        .filter(([, passed]) => !passed)
        .map(([name]) => name);
      setStudioError(
        "The agent did not pass Forge validation: " + failed.join(", ") + ".",
      );
      return;
    }

    const existing = findExistingAgentForCapability(definition.agent.capabilities.join(" "));
    const registration = registerCustomAgent(definition.agent);

    if (!registration.success) {
      setStudioError(registration.reason);
      return;
    }

    setStudioResult({
      kind: "agent",
      message: `${agentForm.name} was validated and added to your network. It is already routeable by the brain.`,
      warning: existing ? `Note: an existing specialist (${existing.name}) already covers part of this capability.` : null,
    });

    setAgentForm({
      name: "",
      role: "",
      description: "",
      capabilities: "",
      intents: "",
      keywords: "",
      riskLevel: "low",
    });
  }

  function updateWorkflowField(field, value) {
    setWorkflowForm((current) => ({ ...current, [field]: value }));
  }

  function updateWorkflowStep(index, field, value) {
    setWorkflowForm((current) => {
      const steps = current.steps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, [field]: value } : step,
      );
      return { ...current, steps };
    });
  }

  function addWorkflowStep() {
    setWorkflowForm((current) => ({
      ...current,
      steps: [...current.steps, { agentId: "", action: "" }],
    }));
  }

  function removeWorkflowStep(index) {
    setWorkflowForm((current) => ({
      ...current,
      steps: current.steps.filter((_, stepIndex) => stepIndex !== index),
    }));
  }

  function forgeWorkflow(event) {
    event.preventDefault();
    setStudioResult(null);
    setStudioError("");

    const result = forgeWorkflowDefinition({
      name: workflowForm.name,
      steps: workflowForm.steps
        .filter((step) => step.agentId && step.action.trim())
        .map((step) => ({ agentId: step.agentId, action: step.action.trim() })),
    });

    if (!result.success) {
      const failed = Object.entries(result.validation.checks)
        .filter(([, passed]) => !passed)
        .map(([name]) => name);
      setStudioError(
        "The workflow did not pass Forge validation: " + failed.join(", ") + ".",
      );
      return;
    }

    const next = [...workflows, result.workflow];
    setWorkflows(next);
    try {
      localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }

    setStudioResult({
      kind: "workflow",
      message: `${workflowForm.name} was validated and saved. It is ready to run when you ask.`,
      steps: result.workflow.steps,
    });

    setWorkflowForm({ name: "", steps: [{ agentId: "", action: "" }] });
  }

  function deleteWorkflow(id) {
    const next = workflows.filter((workflow) => workflow.id !== id);
    setWorkflows(next);
    try {
      localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }

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
            title="The Forge"
            subtitle="Create intelligence that works the way you think."
          />

          {/* Hero */}

          <motion.section
            className="glass-card relative mb-8 overflow-hidden p-10"
            whileHover={{ y: -4, transition: springs.gentle }}
          >
            <div className="absolute right-[-120px] top-[-120px] h-[350px] w-[350px] rounded-full bg-[radial-gradient(circle,rgba(247,201,111,.18),transparent_70%)]" />

            <div className="relative z-10">
              <Hammer
                size={42}
                color="var(--gold)"
              />

              <h1 className="mt-6 font-heading text-5xl text-[var(--text-primary)]">
                Build your own intelligence.
              </h1>

              <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--text-secondary)]">
                The Forge transforms your ideas into custom AI agents,
                automations, apps, and workflows that understand your world.
              </p>

              <button
                className="hey-btn-primary mt-8 flex items-center gap-2"
                type="button"
                onClick={() => setShowBuilder(true)}
              >
                <Plus size={18} />
                Create New
              </button>
            </div>
          </motion.section>

          {showBuilder && (
            <motion.section
              className="glass-card mb-8 p-8"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h2 className="font-heading text-2xl text-[var(--text-primary)]">
                What are we creating?
              </h2>
              <form onSubmit={createForgePlan} className="mt-5 flex gap-3">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Build a website for my project..."
                  aria-label="What are we creating?"
                  className="hey-input flex-1"
                  autoFocus
                />
                <button className="hey-btn-primary" type="submit" disabled={isForging}>
                  {isForging ? "Building..." : "Build it"}
                </button>
              </form>
              {forgeError && <p className="mt-4 text-[var(--coral)]">{forgeError}</p>}
              {forgePlan && (
                <div className="mt-6 rounded-2xl bg-[var(--bg-secondary)] p-5">
                  <p className="text-sm text-[var(--text-secondary)]">
                    HEY prepared a {forgePlan.plan?.steps.length || 0}-step plan{artifact ? " and generated the files." : "."}
                  </p>
                  <ol className="mt-4 space-y-2 text-[var(--text-primary)]">
                    {(forgePlan.plan?.steps || []).map((step) => (
                      <li key={step.id}>{step.id}. {step.title} — {step.agentId}</li>
                    ))}
                  </ol>

                  {artifact && (
                    <div className="mt-6 border-t border-[rgba(255,255,255,.08)] pt-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h3 className="font-heading text-2xl text-[var(--text-primary)]">{artifact.title}</h3>
                          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{artifact.summary}</p>
                        </div>
                        <button type="button" className="hey-btn-ghost" onClick={() => artifact.files?.forEach(downloadFile)}>
                          Download files
                        </button>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
                        <span className={artifact.validation?.valid ? "badge badge-green" : "badge badge-coral"}>
                          {artifact.validation?.valid ? "Forge checks passed" : "Forge needs review"}
                        </span>
                        <span>{artifact.validation?.score || 0}% quality score</span>
                        <span>{artifact.validation?.fileCount || artifact.files?.length || 0} files inspected</span>
                      </div>

                      <div className="mt-5 grid gap-4 lg:grid-cols-[220px_1fr]">
                        <div className="space-y-2">
                          {(artifact.files || []).map((file) => (
                            <button
                              key={file.path}
                              type="button"
                              onClick={() => setSelectedFile(file.path)}
                              className={selectedFile === file.path ? "hey-btn-primary w-full text-left" : "hey-btn-ghost w-full text-left"}
                            >
                              {file.path}
                            </button>
                          ))}
                        </div>
                        <div className="overflow-hidden rounded-2xl border border-[rgba(255,255,255,.08)]">
                          <div className="flex items-center justify-between bg-[rgba(255,255,255,.04)] px-4 py-3 text-xs text-[var(--text-secondary)]">
                            <span>{selectedFile}</span>
                            <button type="button" onClick={() => downloadFile((artifact.files || []).find((file) => file.path === selectedFile))}>Download</button>
                          </div>
                          <pre className="max-h-[420px] overflow-auto p-4 text-xs leading-6 text-[var(--text-primary)]"><code>{(artifact.files || []).find((file) => file.path === selectedFile)?.content || ""}</code></pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.section>
          )}


          {/* Studio: Agents + Workflows */}

          <section className="mb-8">
            <div className="mb-5 flex items-center gap-3">
              <UserPlus
                size={24}
                color="var(--green-accent)"
              />

              <h2 className="font-heading text-3xl text-[var(--text-primary)]">
                Forge Studio
              </h2>

              <p className="ml-3 text-sm text-[var(--text-secondary)]">
                Define a specialist or an automation without code.
              </p>
            </div>

            <div className="glass-card p-6">
              <div className="mb-6 flex gap-2">
                <button
                  type="button"
                  className={studioTab === "agent" ? "hey-btn-primary" : "hey-btn-ghost"}
                  onClick={() => setStudioTab("agent")}
                >
                  Forge an Agent
                </button>
                <button
                  type="button"
                  className={studioTab === "workflow" ? "hey-btn-primary" : "hey-btn-ghost"}
                  onClick={() => setStudioTab("workflow")}
                >
                  Forge a Workflow
                </button>
              </div>

              {studioTab === "agent" ? (
                <form onSubmit={forgeAgent} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <input
                      className="hey-input"
                      placeholder="Name — e.g. Stock Analyst"
                      aria-label="Agent name"
                      value={agentForm.name}
                      onChange={(event) => updateAgentField("name", event.target.value)}
                      required
                    />
                    <input
                      className="hey-input"
                      placeholder="Role — e.g. Market Specialist"
                      aria-label="Agent role"
                      value={agentForm.role}
                      onChange={(event) => updateAgentField("role", event.target.value)}
                      required
                    />
                  </div>
                  <textarea
                    className="hey-input min-h-[84px]"
                    placeholder="Description — what it is responsible for (at least 10 characters)."
                    aria-label="Agent description"
                    value={agentForm.description}
                    onChange={(event) => updateAgentField("description", event.target.value)}
                    required
                  />
                  <div className="grid gap-4 md:grid-cols-3">
                    <input
                      className="hey-input"
                      placeholder="Capabilities, comma separated"
                      aria-label="Agent capabilities"
                      value={agentForm.capabilities}
                      onChange={(event) => updateAgentField("capabilities", event.target.value)}
                      required
                    />
                    <input
                      className="hey-input"
                      placeholder="Intents (optional)"
                      aria-label="Agent intents"
                      value={agentForm.intents}
                      onChange={(event) => updateAgentField("intents", event.target.value)}
                    />
                    <input
                      className="hey-input"
                      placeholder="Keywords (optional)"
                      aria-label="Agent keywords"
                      value={agentForm.keywords}
                      onChange={(event) => updateAgentField("keywords", event.target.value)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                      Risk level
                      <select
                        className="hey-input w-auto"
                        value={agentForm.riskLevel}
                        onChange={(event) => updateAgentField("riskLevel", event.target.value)}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                    <button className="hey-btn-primary flex items-center gap-2" type="submit">
                      <CheckCircle2 size={16} />
                      Validate & Register
                    </button>
                  </div>
                  {studioError && studioTab === "agent" && (
                    <p className="flex items-center gap-2 text-sm text-[var(--coral)]">
                      <AlertTriangle size={15} />
                      {studioError}
                    </p>
                  )}
                </form>
              ) : (
                <form onSubmit={forgeWorkflow} className="space-y-4">
                  <input
                    className="hey-input"
                    placeholder="Workflow name — e.g. Research then summarize"
                    aria-label="Workflow name"
                    value={workflowForm.name}
                    onChange={(event) => updateWorkflowField("name", event.target.value)}
                    required
                  />
                  <div className="space-y-3">
                    {workflowForm.steps.map((step, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <span className="text-xs text-[var(--text-secondary)]">{index + 1}.</span>
                        <select
                          className="hey-input w-56"
                          aria-label={`Step ${index + 1} agent`}
                          value={step.agentId}
                          onChange={(event) => updateWorkflowStep(index, "agentId", event.target.value)}
                        >
                          <option value="">Choose agent…</option>
                          {agentOptions.map((agent) => (
                            <option key={agent.id} value={agent.id}>{agent.name}</option>
                          ))}
                        </select>
                        <input
                          className="hey-input flex-1"
                          placeholder="Action — e.g. summarize the plan"
                          aria-label={`Step ${index + 1} action`}
                          value={step.action}
                          onChange={(event) => updateWorkflowStep(index, "action", event.target.value)}
                        />
                        <button
                          type="button"
                          className="hey-btn-ghost"
                          onClick={() => removeWorkflowStep(index)}
                          aria-label={`Remove step ${index + 1}`}
                          disabled={workflowForm.steps.length === 1}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <button type="button" className="hey-btn-ghost flex items-center gap-2" onClick={addWorkflowStep}>
                      <Plus size={16} />
                      Add step
                    </button>
                    <button className="hey-btn-primary flex items-center gap-2" type="submit">
                      <CheckCircle2 size={16} />
                      Validate & Save
                    </button>
                  </div>
                  {studioError && studioTab === "workflow" && (
                    <p className="flex items-center gap-2 text-sm text-[var(--coral)]">
                      <AlertTriangle size={15} />
                      {studioError}
                    </p>
                  )}
                </form>
              )}

              {studioResult && (
                <div className="mt-6 rounded-2xl bg-[rgba(124,184,124,0.12)] p-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 size={18} color="var(--green-accent)" className="mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm leading-6 text-[var(--text-primary)]">{studioResult.message}</p>
                      {studioResult.warning && (
                        <p className="mt-2 text-sm text-[var(--text-secondary)]">{studioResult.warning}</p>
                      )}
                      {studioResult.steps && (
                        <ol className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
                          {studioResult.steps.map((step, index) => {
                            const agent = getAllAgents().find((item) => item.id === step.agentId);
                            return (
                              <li key={index}>
                                {index + 1}. {agent?.name || step.agentId} — {step.action}
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>


          {/* Saved workflows */}

          {workflows.length > 0 && (
            <section className="mb-8">
              <div className="mb-5 flex items-center gap-3">
                <Workflow size={24} color="var(--lavender)" />
                <h2 className="font-heading text-3xl text-[var(--text-primary)]">
                  Your Forged Workflows
                </h2>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                {workflows.map((workflow) => (
                  <div key={workflow.id} className="glass-card p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-heading text-2xl text-[var(--text-primary)]">{workflow.name}</h3>
                        <p className="mt-2 text-xs text-[var(--text-secondary)]">
                          {workflow.steps.length} steps · forged workflow
                        </p>
                      </div>
                      <button
                        type="button"
                        className="hey-btn-ghost"
                        onClick={() => deleteWorkflow(workflow.id)}
                        aria-label={`Delete ${workflow.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <ol className="mt-4 space-y-1 text-sm text-[var(--text-secondary)]">
                      {workflow.steps.map((step, index) => {
                        const agent = agentOptions.find((item) => item.id === step.agentId);
                        return (
                          <li key={index}>
                            {index + 1}. {agent?.name || step.agentId} — {step.action}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ))}
              </div>
            </section>
          )}


          {/* Categories */}

          <section>
            <div className="mb-5 flex items-center gap-3">
              <Sparkles
                size={24}
                color="var(--gold)"
              />

              <h2 className="font-heading text-3xl text-[var(--text-primary)]">
                Create Anything
              </h2>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {categories.map((category) => {
                const Icon = category.icon;

                return (
                  <motion.div
                    key={category.name}
                    className="glass-card p-6"
                    whileHover={{ y: -5 }}
                    onClick={() => {
                      setDraft(`Create a ${category.name.toLowerCase()}`);
                      setForgeCategory(category.name);
                      setShowBuilder(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setDraft(`Create a ${category.name.toLowerCase()}`);
                        setForgeCategory(category.name);
                        setShowBuilder(true);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Create a ${category.name.toLowerCase()}`}
                  >
                    <Icon
                      size={30}
                      color="var(--green-accent)"
                    />

                    <h3 className="mt-5 font-heading text-xl text-[var(--text-primary)]">
                      {category.name}
                    </h3>

                    <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                      {category.description}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </section>


          {/* Popular Tools */}

          <section className="mt-8">
            <div className="mb-5 flex items-center gap-3">
              <Store
                size={24}
                color="var(--lavender)"
              />

              <h2 className="font-heading text-3xl text-[var(--text-primary)]">
                Popular Creations
              </h2>
            </div>

            <div className="flex flex-wrap gap-3">
              {popularTools.map((tool) => (
                <div
                  key={tool}
                  className="badge badge-lavender"
                >
                  {tool}
                </div>
              ))}
            </div>
          </section>


          {/* Templates */}

          <section className="mt-10">
            <div className="mb-5">
              <h2 className="font-heading text-3xl text-[var(--text-primary)]">
                Agent Templates
              </h2>

              <p className="mt-2 text-[var(--text-secondary)]">
                Start from a foundation and customize it into your own
                intelligence.
              </p>
            </div>

            <AgentTemplate />
          </section>

        </motion.div>
      </main>
    </div>
  );
}