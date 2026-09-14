import {
  createPlan,
  getNextStep,
  markStepRunning,
  markStepCompleted,
  markStepFailed,
} from "./planner.js";
import { routeToAgent } from "./agentRouter.js";
import { addConversationMessage } from "./contextManager.js";

const runningTasks = new Map();

const DEFAULT_MAX_RETRIES = 2;
const TASK_TERMINAL_STATES = new Set([
  "completed",
  "blocked",
  "cancelled",
  "failed",
]);

function now() {
  return new Date();
}

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
    name: "ExecutionError",
    stack: null,
  };
}

function createExecutionContext(plan, step) {
  const routing = routeToAgent(step.description);

  return {
    taskId: plan.id,
    goal: plan.goal,
    step,
    agent: routing?.agent ?? null,
    agents: routing?.agents ?? [],
    startedAt: now(),
    signal: plan.abortController?.signal ?? null,
  };
}

function ensureTaskState(plan) {
  if (!plan.status) {
    plan.status = "pending";
  }

  if (!plan.createdAt) {
    plan.createdAt = now();
  }

  plan.updatedAt = now();

  if (!plan.metadata) {
    plan.metadata = {};
  }

  if (!Array.isArray(plan.metadata.executionHistory)) {
    plan.metadata.executionHistory = [];
  }

  if (typeof plan.metadata.retryCount !== "number") {
    plan.metadata.retryCount = 0;
  }

  return plan;
}

function recordExecutionEvent(plan, event) {
  ensureTaskState(plan);

  plan.metadata.executionHistory.push({
    ...event,
    timestamp: now(),
  });

  plan.updatedAt = now();
}

function isCancelled(plan) {
  return (
    plan.status === "cancelled" ||
    plan.abortController?.signal?.aborted === true
  );
}

function isTerminal(plan) {
  return TASK_TERMINAL_STATES.has(plan.status);
}

function resolveExecutor(executor) {
  if (typeof executor !== "function") {
    throw new TypeError(
      "HEY execution requires a valid executor function.",
    );
  }

  return executor;
}

async function verifyStepResult(result, context, verifier) {
  if (typeof verifier === "function") {
    return Boolean(
      await verifier(result, context),
    );
  }

  if (result === undefined) {
    return false;
  }

  if (
    result &&
    typeof result === "object" &&
    "success" in result
  ) {
    return result.success !== false;
  }

  return true;
}

async function executeStep(
  plan,
  step,
  executor,
  options = {},
) {
  if (isCancelled(plan)) {
    plan.status = "cancelled";

    recordExecutionEvent(plan, {
      type: "step_cancelled",
      stepId: step.id,
    });

    return {
      success: false,
      cancelled: true,
      plan,
    };
  }

  markStepRunning(plan, step.id);

  const context = createExecutionContext(
    plan,
    step,
  );

  const maxRetries =
    Number.isInteger(options.maxRetries)
      ? Math.max(0, options.maxRetries)
      : DEFAULT_MAX_RETRIES;

  let attempt = 0;

  while (attempt <= maxRetries) {
    if (isCancelled(plan)) {
      plan.status = "cancelled";

      recordExecutionEvent(plan, {
        type: "step_cancelled",
        stepId: step.id,
        attempt,
      });

      return {
        success: false,
        cancelled: true,
        plan,
      };
    }

    attempt += 1;

    recordExecutionEvent(plan, {
      type: "step_started",
      stepId: step.id,
      attempt,
      agent: context.agent?.name ?? null,
    });

    try {
      const result = await executor({
        ...context,
        attempt,
        retryCount: attempt - 1,
      });

      if (isCancelled(plan)) {
        plan.status = "cancelled";

        recordExecutionEvent(plan, {
          type: "step_cancelled",
          stepId: step.id,
          attempt,
        });

        return {
          success: false,
          cancelled: true,
          plan,
        };
      }

      const verified = await verifyStepResult(
        result,
        context,
        options.verifier,
      );

      if (!verified) {
        throw new Error(
          "Execution completed but verification failed.",
        );
      }

      markStepCompleted(
        plan,
        step.id,
        result,
      );

      recordExecutionEvent(plan, {
        type: "step_completed",
        stepId: step.id,
        attempt,
        verified: true,
      });

      return {
        success: true,
        result,
        verified: true,
        attempt,
        plan,
      };
    } catch (error) {
      const normalized = normalizeError(error);

      markStepFailed(
        plan,
        step.id,
        error,
      );

      recordExecutionEvent(plan, {
        type: "step_failed",
        stepId: step.id,
        attempt,
        error: normalized.message,
      });

      if (attempt > maxRetries) {
        plan.status = "failed";

        return {
          success: false,
          error: normalized.message,
          errorDetails: normalized,
          attempts: attempt,
          plan,
        };
      }

      plan.metadata.retryCount += 1;

      recordExecutionEvent(plan, {
        type: "step_retry",
        stepId: step.id,
        attempt,
        nextAttempt: attempt + 1,
      });

      /*
       * Give the planner a chance to recover the failed step
       * when it exposes a recovery hook.
       */
      if (
        typeof options.recover === "function"
      ) {
        try {
          await options.recover({
            error: normalized,
            context,
            plan,
            step,
            attempt,
          });
        } catch (recoveryError) {
          const recovery = normalizeError(
            recoveryError,
          );

          recordExecutionEvent(plan, {
            type: "recovery_failed",
            stepId: step.id,
            attempt,
            error: recovery.message,
          });
        }
      }
    }
  }

  plan.status = "failed";

  return {
    success: false,
    error: "Execution failed.",
    plan,
  };
}

function completePlan(plan) {
  if (!isCancelled(plan)) {
    plan.status = "completed";
    plan.updatedAt = now();

    recordExecutionEvent(plan, {
      type: "task_completed",
    });
  }
}

function blockPlan(plan, reason) {
  if (!isCancelled(plan)) {
    plan.status = "blocked";
    plan.blockReason = reason;
    plan.updatedAt = now();

    recordExecutionEvent(plan, {
      type: "task_blocked",
      reason,
    });
  }
}

export async function executeTask(
  message,
  executor,
  options = {},
) {
  const resolvedExecutor =
    resolveExecutor(executor);

  const plan = ensureTaskState(
    createPlan(message),
  );

  const abortController =
    typeof AbortController !== "undefined"
      ? new AbortController()
      : null;

  if (abortController) {
    plan.abortController =
      abortController;
  }

  runningTasks.set(plan.id, plan);

  addConversationMessage({
    role: "system",
    content:
      "HEY started an autonomous task: " +
      message,
  });

  recordExecutionEvent(plan, {
    type: "task_started",
    goal: plan.goal,
  });

  try {
    while (!isTerminal(plan)) {
      if (isCancelled(plan)) {
        plan.status = "cancelled";
        break;
      }

      const step = getNextStep(plan);

      if (!step) {
        completePlan(plan);
        break;
      }

      /*
       * A planner may explicitly block a task by marking
       * a step as unavailable or blocked.
       */
      if (
        step.status === "blocked" ||
        step.blocked === true
      ) {
        blockPlan(
          plan,
          step.blockReason ||
            "The next execution step is blocked.",
        );
        break;
      }

      const result = await executeStep(
        plan,
        step,
        resolvedExecutor,
        options,
      );

      runningTasks.set(plan.id, plan);

      if (result.cancelled) {
        break;
      }

      if (!result.success) {
        /*
         * A failed execution must never silently become
         * a successful task.
         */
        if (plan.status !== "failed") {
          plan.status = "failed";
        }

        break;
      }

      /*
       * Prevent a malformed planner from creating an
       * infinite execution loop.
       */
      if (
        typeof options.maxSteps === "number" &&
        plan.metadata.executionHistory.filter(
          (event) =>
            event.type === "step_completed",
        ).length >= options.maxSteps
      ) {
        blockPlan(
          plan,
          "Maximum execution step limit reached.",
        );
        break;
      }
    }
  } catch (error) {
    const normalized = normalizeError(error);

    plan.status = isCancelled(plan)
      ? "cancelled"
      : "failed";

    plan.error = normalized.message;

    recordExecutionEvent(plan, {
      type: "task_failed",
      error: normalized.message,
    });
  }

  plan.updatedAt = now();
  runningTasks.set(plan.id, plan);

  const finalMessage =
    plan.status === "completed"
      ? "HEY completed the task: " + message
      : plan.status === "cancelled"
        ? "HEY cancelled the task: " + message
        : plan.status === "blocked"
          ? "HEY blocked the task: " + message
          : "HEY could not complete the task: " +
            message;

  addConversationMessage({
    role: "system",
    content: finalMessage,
  });

  return plan;
}

export function getRunningTask(taskId) {
  return runningTasks.get(taskId) || null;
}

export function getAllRunningTasks() {
  return Array.from(
    runningTasks.values(),
  ).filter(
    (task) => !isTerminal(task),
  );
}

export function stopTask(taskId) {
  const task = runningTasks.get(taskId);

  if (!task || isTerminal(task)) {
    return false;
  }

  if (task.abortController) {
    task.abortController.abort();
  }

  task.status = "cancelled";
  task.updatedAt = now();

  recordExecutionEvent(task, {
    type: "task_cancelled",
  });

  runningTasks.set(taskId, task);

  addConversationMessage({
    role: "system",
    content:
      "HEY cancelled the running task.",
  });

  return true;
}

export function clearCompletedTasks() {
  for (const [taskId, task] of runningTasks) {
    if (isTerminal(task)) {
      runningTasks.delete(taskId);
    }
  }
}

export function getExecutionHistory(taskId) {
  const task = runningTasks.get(taskId);

  if (!task) {
    return [];
  }

  return [
    ...(task.metadata?.executionHistory || []),
  ];
}

export default {
  executeTask,
  getRunningTask,
  getAllRunningTasks,
  stopTask,
  clearCompletedTasks,
  getExecutionHistory,
};