const tasks = new Map();

const TASK_STATUSES = new Set([
  "pending",
  "queued",
  "planning",
  "running",
  "awaiting_confirmation",
  "paused",
  "blocked",
  "completed",
  "failed",
  "cancelled",
]);

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
]);

const PRIORITIES = new Set([
  "low",
  "normal",
  "high",
  "urgent",
]);

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return `task_${globalThis.crypto.randomUUID()}`;
  }

  return `task_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeStatus(status) {
  const normalized = String(status || "pending").trim().toLowerCase();

  if (!TASK_STATUSES.has(normalized)) {
    throw new Error(`Invalid task status: ${status}`);
  }

  return normalized;
}

function normalizePriority(priority) {
  const normalized = String(priority || "normal").trim().toLowerCase();

  if (!PRIORITIES.has(normalized)) {
    throw new Error(`Invalid task priority: ${priority}`);
  }

  return normalized;
}

function normalizeDependencies(dependencies) {
  if (!dependencies) return [];

  if (!Array.isArray(dependencies)) {
    throw new TypeError("Task dependencies must be an array.");
  }

  return [...new Set(
    dependencies
      .map((dependency) => String(dependency).trim())
      .filter(Boolean),
  )];
}

function touch(task) {
  task.updatedAt = new Date();
  return task;
}

export function createTask(description, options = {}) {
  const normalizedDescription = String(description || "").trim();

  if (!normalizedDescription) {
    throw new Error("Task description is required.");
  }

  const id = options.id || createId();

  if (tasks.has(id)) {
    throw new Error(`Task ${id} already exists.`);
  }

  const task = {
    id,
    description: normalizedDescription,

    status: normalizeStatus(options.status),
    priority: normalizePriority(options.priority),

    assignedAgent: options.assignedAgent || null,

    dependencies: normalizeDependencies(options.dependencies),

    workflowId: options.workflowId || null,
    parentTaskId: options.parentTaskId || null,

    input:
      options.input && typeof options.input === "object"
        ? { ...options.input }
        : options.input ?? null,

    output: options.output ?? null,
    error: options.error ?? null,

    progress:
      Number.isFinite(options.progress)
        ? Math.min(100, Math.max(0, options.progress))
        : 0,

    attempts:
      Number.isInteger(options.attempts) && options.attempts >= 0
        ? options.attempts
        : 0,

    maxAttempts:
      Number.isInteger(options.maxAttempts) && options.maxAttempts > 0
        ? options.maxAttempts
        : 3,

    metadata:
      options.metadata && typeof options.metadata === "object"
        ? { ...options.metadata }
        : {},

    createdAt: new Date(),
    updatedAt: new Date(),

    startedAt: null,
    completedAt: null,
    cancelledAt: null,
  };

  tasks.set(task.id, task);

  return task;
}

export function updateTask(taskId, changes = {}) {
  const task = tasks.get(taskId);

  if (!task) return null;

  if (changes.status !== undefined) {
    task.status = normalizeStatus(changes.status);
  }

  if (changes.priority !== undefined) {
    task.priority = normalizePriority(changes.priority);
  }

  if (changes.dependencies !== undefined) {
    task.dependencies = normalizeDependencies(changes.dependencies);
  }

  if (changes.progress !== undefined) {
    if (!Number.isFinite(changes.progress)) {
      throw new TypeError("Task progress must be a finite number.");
    }

    task.progress = Math.min(100, Math.max(0, changes.progress));
  }

  const allowedFields = [
    "description",
    "assignedAgent",
    "workflowId",
    "parentTaskId",
    "input",
    "output",
    "error",
    "attempts",
    "maxAttempts",
    "metadata",
  ];

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(changes, field)) {
      task[field] = changes[field];
    }
  }

  if (task.status === "running" && !task.startedAt) {
    task.startedAt = new Date();
  }

  if (task.status === "completed") {
    task.progress = 100;
    task.completedAt ??= new Date();
  }

  if (task.status === "cancelled") {
    task.cancelledAt ??= new Date();
  }

  touch(task);

  return task;
}

export function startTask(taskId) {
  const task = tasks.get(taskId);

  if (!task) return null;

  if (TERMINAL_STATUSES.has(task.status)) {
    return task;
  }

  task.status = "running";
  task.startedAt ??= new Date();
  task.attempts += 1;

  return touch(task);
}

export function completeTask(taskId, output = null) {
  const task = tasks.get(taskId);

  if (!task) return null;

  task.status = "completed";
  task.progress = 100;
  task.output = output;
  task.error = null;
  task.completedAt = new Date();

  return touch(task);
}

export function failTask(taskId, error) {
  const task = tasks.get(taskId);

  if (!task) return null;

  task.status = "failed";
  task.error =
    error instanceof Error ? error.message : String(error);

  return touch(task);
}

export function cancelTask(taskId, reason = "Task cancelled.") {
  const task = tasks.get(taskId);

  if (!task) return null;

  if (TERMINAL_STATUSES.has(task.status)) {
    return task;
  }

  task.status = "cancelled";
  task.error = reason;
  task.cancelledAt = new Date();

  return touch(task);
}

export function pauseTask(taskId) {
  const task = tasks.get(taskId);

  if (!task) return null;

  if (TERMINAL_STATUSES.has(task.status)) {
    return task;
  }

  task.status = "paused";

  return touch(task);
}

export function blockTask(taskId, reason = "Task blocked.") {
  const task = tasks.get(taskId);

  if (!task) return null;

  if (TERMINAL_STATUSES.has(task.status)) {
    return task;
  }

  task.status = "blocked";
  task.error = reason;

  return touch(task);
}

export function queueTask(taskId) {
  const task = tasks.get(taskId);

  if (!task) return null;

  if (TERMINAL_STATUSES.has(task.status)) {
    return task;
  }

  task.status = "queued";

  return touch(task);
}

export function getTask(taskId) {
  return tasks.get(taskId) || null;
}

export function listTasks(filters = {}) {
  return Array.from(tasks.values()).filter((task) =>
    Object.entries(filters).every(([key, value]) => {
      if (Array.isArray(value)) {
        return value.includes(task[key]);
      }

      return task[key] === value;
    }),
  );
}

export function getTasksByAgent(agentId) {
  return listTasks({ assignedAgent: agentId });
}

export function getTasksByWorkflow(workflowId) {
  return listTasks({ workflowId });
}

export function getPendingTasks() {
  return Array.from(tasks.values()).filter(
    (task) =>
      task.status === "pending" ||
      task.status === "queued" ||
      task.status === "planning",
  );
}

export function getActiveTasks() {
  return Array.from(tasks.values()).filter(
    (task) =>
      task.status === "running" ||
      task.status === "awaiting_confirmation" ||
      task.status === "paused" ||
      task.status === "blocked",
  );
}

export function getTaskProgress(taskId) {
  const task = tasks.get(taskId);

  if (!task) return null;

  return {
    taskId: task.id,
    status: task.status,
    progress: task.progress,
    attempts: task.attempts,
    maxAttempts: task.maxAttempts,
  };
}

export function hasUnresolvedDependencies(taskId) {
  const task = tasks.get(taskId);

  if (!task) return false;

  return task.dependencies.some((dependencyId) => {
    const dependency = tasks.get(dependencyId);

    return !dependency || !TERMINAL_STATUSES.has(dependency.status);
  });
}

export function getNextRunnableTask() {
  const candidates = getPendingTasks()
    .filter((task) => !hasUnresolvedDependencies(task.id))
    .sort((a, b) => {
      const priorityRank = {
        urgent: 4,
        high: 3,
        normal: 2,
        low: 1,
      };

      const priorityDifference =
        priorityRank[b.priority] - priorityRank[a.priority];

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return a.createdAt.getTime() - b.createdAt.getTime();
    });

  return candidates[0] || null;
}

export function removeTask(taskId) {
  return tasks.delete(taskId);
}

export function clearCompletedTasks() {
  let removed = 0;

  for (const [taskId, task] of tasks.entries()) {
    if (TERMINAL_STATUSES.has(task.status)) {
      tasks.delete(taskId);
      removed += 1;
    }
  }

  return removed;
}

export function getTaskStats() {
  const all = Array.from(tasks.values());

  return {
    total: all.length,
    pending: all.filter((task) => task.status === "pending").length,
    queued: all.filter((task) => task.status === "queued").length,
    planning: all.filter((task) => task.status === "planning").length,
    running: all.filter((task) => task.status === "running").length,
    awaitingConfirmation: all.filter(
      (task) => task.status === "awaiting_confirmation",
    ).length,
    paused: all.filter((task) => task.status === "paused").length,
    blocked: all.filter((task) => task.status === "blocked").length,
    completed: all.filter((task) => task.status === "completed").length,
    failed: all.filter((task) => task.status === "failed").length,
    cancelled: all.filter((task) => task.status === "cancelled").length,
  };
}

export function getAllTasks() {
  return Array.from(tasks.values());
}

export function clearTasks() {
  tasks.clear();
}

export default {
  createTask,
  updateTask,
  startTask,
  completeTask,
  failTask,
  cancelTask,
  pauseTask,
  blockTask,
  queueTask,
  getTask,
  listTasks,
  getTasksByAgent,
  getTasksByWorkflow,
  getPendingTasks,
  getActiveTasks,
  getTaskProgress,
  hasUnresolvedDependencies,
  getNextRunnableTask,
  removeTask,
  clearCompletedTasks,
  getTaskStats,
  getAllTasks,
  clearTasks,
};