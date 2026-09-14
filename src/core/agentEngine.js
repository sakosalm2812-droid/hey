import { publish } from "./eventBus.js";
import { safeStorage } from "../lib/safeStorage.js";

const AGENT_STATES = Object.freeze({
  REGISTERED: "registered",
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  ASSIGNED: "assigned",
  RUNNING: "running",
  RESULT_SUBMITTED: "result_submitted",
  VERIFYING: "verifying",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  PAUSED: "paused",
  RETIRED: "retired",
});

const TEAM_TEMPLATES = Object.freeze({
  RESEARCH: "research",
  BUILD: "build",
  DESIGN: "design",
  LAUNCH: "launch",
  STUDY: "study",
  SECURITY: "security",
  CREATOR: "creator",
  DATA: "data",
});

function generateAgentId() {
  return `agent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateTeamId() {
  return `team_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class AgentEngine {
  constructor() {
    this.agents = new Map();
    this.teams = new Map();
    this.runs = new Map();
    this.verifiers = new Map();
    this.executors = new Map();
    this.healthMetrics = new Map();
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = safeStorage.getItem("hey_agents");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.agents) Object.entries(parsed.agents).forEach(([k, v]) => this.agents.set(k, v));
        if (parsed.teams) Object.entries(parsed.teams).forEach(([k, v]) => this.teams.set(k, v));
      }
    } catch (err) {
      console.warn("Failed to load agents:", err);
    }
  }

  save() {
    try {
      safeStorage.setItem("hey_agents", JSON.stringify({
        agents: Object.fromEntries(this.agents),
        teams: Object.fromEntries(this.teams),
      }));
    } catch (err) {
      console.warn("Failed to save agents:", err);
    }
  }

  registerAgent(manifest) {
    const agentId = manifest.id || generateAgentId();
    const now = new Date().toISOString();
    
    const agent = {
      id: agentId,
      version: manifest.version || "1.0.0",
      name: manifest.name,
      displayName: manifest.displayName || manifest.name,
      category: manifest.category,
      purpose: manifest.purpose,
      scope: manifest.scope,
      inputSchema: manifest.inputSchema,
      outputSchema: manifest.outputSchema,
      allowedTools: manifest.allowedTools || [],
      requiredPermissions: manifest.requiredPermissions || [],
      riskLevel: manifest.riskLevel || "low",
      providerConstraints: manifest.providerConstraints || {},
      contextLimits: manifest.contextLimits || { maxTokens: 4000 },
      timeout: manifest.timeout || 30000,
      retries: manifest.retries || 2,
      verifier: manifest.verifier || null,
      tests: manifest.tests || [],
      health: { successRate: 0, latency: 0, errorRate: 0, verifierRejectionRate: 0, cost: 0 },
      state: AGENT_STATES.REGISTERED,
      dependencies: manifest.dependencies || [],
      owner: manifest.owner || "system",
      createdAt: now,
      updatedAt: now,
    };

    this.agents.set(agentId, agent);
    if (typeof manifest.execute === "function") this.executors.set(agentId, manifest.execute);
    this.healthMetrics.set(agentId, agent.health);
    this.save();
    this.notify("agent_registered", agent);
    return agent;
  }

  setAgentExecutor(agentId, executor) {
    if (!this.agents.has(agentId)) throw new Error(`Agent ${agentId} is not registered.`);
    if (typeof executor !== "function") throw new TypeError("Agent executor must be a function.");
    this.executors.set(agentId, executor);
  }

  getAgent(id) {
    return this.agents.get(id) || null;
  }

  getAllAgents() {
    return Array.from(this.agents.values());
  }

  getAgentsByCategory(category) {
    return this.getAllAgents().filter(a => a.category === category);
  }

  updateAgent(id, updates) {
    const agent = this.agents.get(id);
    if (!agent) return null;

    const updated = { ...agent, ...updates, updatedAt: new Date().toISOString() };
    this.agents.set(id, updated);
    this.save();
    this.notify("agent_updated", updated);
    return updated;
  }

  setAgentState(id, state) {
    const agent = this.agents.get(id);
    if (!agent) return null;

    agent.state = state;
    agent.updatedAt = new Date().toISOString();
    this.agents.set(id, agent);
    this.save();
    this.notify("agent_state_changed", { id, state });
    return agent;
  }

  createTeam(input) {
    const teamId = generateTeamId();
    const now = new Date().toISOString();
    
    const team = {
      id: teamId,
      name: input.name,
      template: input.template,
      purpose: input.purpose,
      agents: input.agents || [],
      planner: input.planner || null,
      integrator: input.integrator || null,
      verifier: input.verifier || null,
      permissions: input.permissions || [],
      budget: input.budget || { maxCost: 100, maxTime: 3600000 },
      qualityGates: input.qualityGates || [],
      maxConcurrentSpecialists: input.maxConcurrentSpecialists || 4,
      state: "active",
      createdAt: now,
      updatedAt: now,
    };

    this.teams.set(teamId, team);
    this.save();
    this.notify("team_created", team);
    return team;
  }

  getTeam(id) {
    return this.teams.get(id) || null;
  }

  getAllTeams() {
    return Array.from(this.teams.values());
  }

  runTeam(teamId, input) {
    const team = this.teams.get(teamId);
    if (!team) return { error: "Team not found" };

    const runId = generateRunId();
    const run = {
      id: runId,
      teamId,
      input,
      state: "planning",
      plannerOutput: null,
      specialistResults: {},
      integratorOutput: null,
      verifierResult: null,
      finalOutput: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      cost: 0,
      health: {},
    };

    this.runs.set(runId, run);
    this.save();
    this.executeTeamRun(runId);
    return run;
  }

  async executeTeamRun(runId) {
    const run = this.runs.get(runId);
    if (!run) return;

    const team = this.teams.get(run.teamId);
    if (!team) return;

    try {
      run.state = "planning";
      this.notify("run_progress", run);
      
      const planner = this.agents.get(team.planner);
      if (planner) {
        run.plannerOutput = await this.executeAgent(planner, run.input);
      }

      run.state = "specialists_running";
      this.notify("run_progress", run);

      for (const agentId of team.agents) {
        if (Object.keys(run.specialistResults).length >= team.maxConcurrentSpecialists) break;
        const agent = this.agents.get(agentId);
        if (agent) {
          run.specialistResults[agentId] = await this.executeAgent(agent, run.input);
        }
      }

      run.state = "integrating";
      this.notify("run_progress", run);

      const integrator = this.agents.get(team.integrator);
      if (integrator) {
        run.integratorOutput = await this.executeAgent(integrator, {
          input: run.input,
          specialistResults: run.specialistResults,
        });
      }

      run.state = "verifying";
      this.notify("run_progress", run);

      const verifier = this.agents.get(team.verifier);
      if (verifier) {
        run.verifierResult = await this.executeAgent(verifier, {
          input: run.input,
          integratorOutput: run.integratorOutput,
        });
        
        if (!run.verifierResult.success || run.verifierResult.output?.accepted !== true) {
          run.state = "rejected";
          run.completedAt = new Date().toISOString();
          this.save();
          this.notify("run_completed", run);
          return;
        }
      }

      run.finalOutput = run.integratorOutput || run.verifierResult;
      run.state = "accepted";
      run.completedAt = new Date().toISOString();
      
      this.save();
      this.notify("run_completed", run);
      publish("agent.team_run_completed", run);
    } catch (error) {
      run.state = "failed";
      run.error = error.message;
      run.completedAt = new Date().toISOString();
      this.save();
      this.notify("run_failed", run);
    }
  }

  async executeAgent(agent, input) {
    const runId = generateRunId();
    const agentRun = {
      id: runId,
      agentId: agent.id,
      input,
      state: AGENT_STATES.RUNNING,
      output: null,
      error: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      cost: 0,
      latency: 0,
    };

    this.runs.set(runId, agentRun);
    
    try {
      const output = await this.callAgent(agent, input);
      agentRun.output = output;
      agentRun.state = AGENT_STATES.RESULT_SUBMITTED;
      agentRun.completedAt = new Date().toISOString();
      agentRun.latency = new Date() - new Date(agentRun.startedAt);
      
      this.updateHealthMetrics(agent.id, true, agentRun.latency, 0);
      return { success: true, output, runId };
    } catch (error) {
      agentRun.error = error.message;
      agentRun.state = AGENT_STATES.REJECTED;
      agentRun.completedAt = new Date().toISOString();
      
      this.updateHealthMetrics(agent.id, false, 0, 0);
      return { success: false, error: error.message, runId };
    }
  }

  async callAgent(agent, input) {
    const executor = this.executors.get(agent.id);
    if (!executor) throw new Error(`No execution provider is configured for agent ${agent.id}.`);

    const result = await executor(input, agent);
    if (!result || result.success !== true || result.verified !== true) {
      throw new Error(`Agent ${agent.id} did not return a verified success result.`);
    }
    return result;
  }

  updateHealthMetrics(agentId, success, latency, cost) {
    const metrics = this.healthMetrics.get(agentId) || { successRate: 0, latency: 0, errorRate: 0, verifierRejectionRate: 0, cost: 0, totalRuns: 0 };
    metrics.totalRuns++;
    
    if (success) {
      metrics.successRate = (metrics.successRate * (metrics.totalRuns - 1) + 1) / metrics.totalRuns;
    } else {
      metrics.successRate = (metrics.successRate * (metrics.totalRuns - 1)) / metrics.totalRuns;
    }
    
    metrics.latency = (metrics.latency * (metrics.totalRuns - 1) + latency) / metrics.totalRuns;
    metrics.cost = (metrics.cost * (metrics.totalRuns - 1) + cost) / metrics.totalRuns;
    metrics.errorRate = 1 - metrics.successRate;
    
    this.healthMetrics.set(agentId, metrics);
    
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.health = metrics;
      this.agents.set(agentId, agent);
    }
    
    this.save();
  }

  getHealthMetrics(agentId) {
    return this.healthMetrics.get(agentId) || null;
  }

  registerVerifier(verifierManifest) {
    const verifierId = `verifier_${Date.now()}`;
    const verifier = {
      id: verifierId,
      ...verifierManifest,
      state: "active",
      createdAt: new Date().toISOString(),
    };
    this.verifiers.set(verifierId, verifier);
    this.save();
    return verifier;
  }

  getVerifier(id) {
    return this.verifiers.get(id) || null;
  }

  getAllVerifiers() {
    return Array.from(this.verifiers.values());
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Agent listener error:", err); }
    });
  }
}

export const agentEngine = new AgentEngine();

export function registerAgent(manifest) {
  return agentEngine.registerAgent(manifest);
}

export function getAgent(id) {
  return agentEngine.getAgent(id);
}

export function getAllAgents() {
  return agentEngine.getAllAgents();
}

export function getAgentsByCategory(category) {
  return agentEngine.getAgentsByCategory(category);
}

export function updateAgent(id, updates) {
  return agentEngine.updateAgent(id, updates);
}

export function setAgentState(id, state) {
  return agentEngine.setAgentState(id, state);
}

export function createTeam(input) {
  return agentEngine.createTeam(input);
}

export function getTeam(id) {
  return agentEngine.getTeam(id);
}

export function getAllTeams() {
  return agentEngine.getAllTeams();
}

export function runTeam(teamId, input) {
  return agentEngine.runTeam(teamId, input);
}

export function setAgentExecutor(agentId, executor) {
  return agentEngine.setAgentExecutor(agentId, executor);
}

export function registerVerifier(manifest) {
  return agentEngine.registerVerifier(manifest);
}

export function getVerifier(id) {
  return agentEngine.getVerifier(id);
}

export function getAllVerifiers() {
  return agentEngine.getAllVerifiers();
}

export function subscribeToAgents(listener) {
  return agentEngine.subscribe(listener);
}

export { AGENT_STATES, TEAM_TEMPLATES };

export default agentEngine;
