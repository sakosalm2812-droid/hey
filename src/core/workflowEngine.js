import { createPlan } from "./planner.js";
import { recordAudit } from "./auditLog.js";

const WORKFLOW_TERMINAL_STATES = new Set([
  "completed",
  "failed",
  "cancelled",
  "blocked",
]);

const STEP_TERMINAL_STATES = new Set([
  "completed",
  "failed",
  "cancelled",
  "skipped",
]);

function createId(prefix = "id") {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStep(step, index) {
  if (!step || typeof step !== "object") {
    throw new TypeError(`Workflow step ${index + 1} must be an object.`);
  }

  const action =
    typeof step.action === "string" ? step.action.trim() : "";

  if (!action) {
    throw new Error(`Workflow step ${index + 1} is missing an action.`);
  }

  return {
    id: step.id ?? `${index + 1}`,
    title:
      typeof step.title === "string" && step.title.trim()
        ? step.title.trim()
        : action,
    action,
    input:
      step.input && typeof step.input === "object"
        ? { ...step.input }
        : step.input ?? null,
    requiresConfirmation: Boolean(step.requiresConfirmation),
    riskLevel: step.riskLevel ?? "low",
    status: "pending",
    result: null,
    error: null,
    startedAt: null,
    completedAt: null,
  };
}

function normalizeWorkflow(workflow) {
  if (!workflow || typeof workflow !== "object") {
    throw new TypeError("A valid workflow object is required.");
  }

  if (!Array.isArray(workflow.steps)) {
    workflow.steps = [];
  }

  if (!workflow.id) {
    workflow.id = createId("workflow");
  }

  if (!workflow.status) {
    workflow.status = "draft";
  }

  return workflow;
}

function auditWorkflow(action, workflow, metadata = {}) {
  try {
    recordAudit({
      action,
      tool: "workflowEngine",
      status: metadata.status ?? workflow.status,
      metadata: {
        workflowId: workflow.id,
        goal: workflow.goal,
        ...metadata,
      },
    });
  } catch {
    // Auditing must never crash workflow execution.
  }
}

export function createWorkflow(goal, steps = [], options = {}) {
  if (typeof goal !== "string" || !goal.trim()) {
    throw new Error("Workflow goal is required.");
  }

  if (!Array.isArray(steps)) {
    throw new TypeError("Workflow steps must be an array.");
  }

  const workflow = {
    id: createId("workflow"),
    goal: goal.trim(),
    plan: createPlan(goal.trim()),
    steps: steps.map(normalizeStep),
    status: "draft",
    currentStepIndex: -1,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    metadata:
      options.metadata && typeof options.metadata === "object"
        ? { ...options.metadata }
        : {},
    executionCount: 0,
  };

  auditWorkflow("workflow.created", workflow, {
    status: "draft",
    stepCount: workflow.steps.length,
  });

  return workflow;
}

export function getWorkflowProgress(workflow) {
  normalizeWorkflow(workflow);

  const total = workflow.steps.length;

  if (total === 0) {
    return {
      completed: 0,
      failed: 0,
      running: 0,
      pending: 0,
      skipped: 0,
      total: 0,
      percentage: workflow.status === "completed" ? 100 : 0,
    };
  }

  const progress = workflow.steps.reduce(
    (result, step) => {
      if (step.status === "completed") result.completed += 1;
      else if (step.status === "failed") result.failed += 1;
      else if (step.status === "running") result.running += 1;
      else if (step.status === "skipped") result.skipped += 1;
      else result.pending += 1;

      return result;
    },
    {
      completed: 0,
      failed: 0,
      running: 0,
      pending: 0,
      skipped: 0,
      total,
      percentage: 0,
    },
  );

  progress.percentage = Math.round(
    ((progress.completed + progress.skipped) / total) * 100,
  );

  return progress;
}

export function cancelWorkflow(workflow, reason = "Workflow cancelled.") {
  normalizeWorkflow(workflow);

  if (WORKFLOW_TERMINAL_STATES.has(workflow.status)) {
    return workflow;
  }

  workflow.status = "cancelled";
  workflow.cancelledAt = new Date();
  workflow.cancelReason = reason;

  for (const step of workflow.steps) {
    if (!STEP_TERMINAL_STATES.has(step.status)) {
      step.status = "cancelled";
      step.error = reason;
    }
  }

  auditWorkflow("workflow.cancelled", workflow, {
    status: "cancelled",
    reason,
  });

  return workflow;
}

export function resumeWorkflow(workflow) {
  normalizeWorkflow(workflow);

  if (workflow.status === "awaiting_confirmation") {
    workflow.status = "paused";
  }

  if (workflow.status === "blocked") {
    const failedStep = workflow.steps.find(
      (step) => step.status === "failed",
    );

    if (failedStep) {
      failedStep.status = "pending";
      failedStep.error = null;
    }

    workflow.status = "paused";
  }

  return workflow;
}

export async function runWorkflow(workflow, handlers = {}, options = {}) {
  normalizeWorkflow(workflow);

  if (!handlers || typeof handlers !== "object") {
    throw new TypeError("Workflow handlers must be an object.");
  }

  if (WORKFLOW_TERMINAL_STATES.has(workflow.status)) {
    return workflow;
  }

  const maxSteps =
    Number.isInteger(options.maxSteps) && options.maxSteps > 0
      ? options.maxSteps
      : workflow.steps.length;

  const continueOnError = Boolean(options.continueOnError);
  const confirmed = Boolean(options.confirmed);
  const executionContext =
    options.context && typeof options.context === "object"
      ? options.context
      : {};

  workflow.status = "running";
  workflow.startedAt ??= new Date();
  workflow.executionCount += 1;

  auditWorkflow("workflow.started", workflow, {
    status: "running",
  });

  for (
    let index = 0;
    index < workflow.steps.length && index < maxSteps;
    index += 1
  ) {
    const step = workflow.steps[index];

    if (STEP_TERMINAL_STATES.has(step.status)) {
      continue;
    }

    if (typeof options.shouldCancel === "function") {
      const shouldCancel = await options.shouldCancel(workflow, step);

      if (shouldCancel) {
        return cancelWorkflow(workflow, "Workflow cancellation requested.");
      }
    }

    if (step.requiresConfirmation && !confirmed) {
      workflow.status = "awaiting_confirmation";
      workflow.currentStepIndex = index;

      auditWorkflow("workflow.awaiting_confirmation", workflow, {
        status: "awaiting_confirmation",
        stepId: step.id,
        action: step.action,
      });

      return workflow;
    }

    const handler = handlers[step.action];

    if (typeof handler !== "function") {
      step.status = "failed";
      step.error = `No handler registered for ${step.action}.`;
      workflow.currentStepIndex = index;

      auditWorkflow("workflow.step.failed", workflow, {
        status: "failed",
        stepId: step.id,
        action: step.action,
        error: step.error,
      });

      if (!continueOnError) {
        workflow.status = "blocked";

        auditWorkflow("workflow.blocked", workflow, {
          status: "blocked",
          stepId: step.id,
        });

        return workflow;
      }

      continue;
    }

    workflow.currentStepIndex = index;

    step.status = "running";
    step.startedAt = new Date();
    step.error = null;

    auditWorkflow("workflow.step.started", workflow, {
      status: "running",
      stepId: step.id,
      action: step.action,
    });

    try {
      const result = await handler(step, {
        workflow,
        context: executionContext,
        options,
        index,
      });

      step.result = result;
      step.status = "completed";
      step.completedAt = new Date();

      auditWorkflow("workflow.step.completed", workflow, {
        status: "completed",
        stepId: step.id,
        action: step.action,
      });

      if (typeof options.verifyStep === "function") {
        const verification = await options.verifyStep(step, {
          workflow,
          context: executionContext,
          index,
        });

        step.verification = verification;

        if (verification === false) {
          step.status = "failed";
          step.error = "Step verification failed.";

          auditWorkflow("workflow.step.verification_failed", workflow, {
            status: "failed",
            stepId: step.id,
            action: step.action,
          });

          if (!continueOnError) {
            workflow.status = "blocked";
            return workflow;
          }
        }
      }
    } catch (error) {
      step.status = "failed";
      step.error =
        error instanceof Error ? error.message : String(error);
      step.completedAt = new Date();

      auditWorkflow("workflow.step.failed", workflow, {
        status: "failed",
        stepId: step.id,
        action: step.action,
        error: step.error,
      });

      if (!continueOnError) {
        workflow.status = "blocked";

        auditWorkflow("workflow.blocked", workflow, {
          status: "blocked",
          stepId: step.id,
        });

        return workflow;
      }
    }
  }

  const progress = getWorkflowProgress(workflow);

  if (progress.failed > 0 && !continueOnError) {
    workflow.status = "blocked";
    return workflow;
  }

  if (progress.pending > 0) {
    workflow.status = "paused";
    return workflow;
  }

  workflow.status = "completed";
  workflow.completedAt = new Date();

  auditWorkflow("workflow.completed", workflow, {
    status: "completed",
    progress,
  });

  return workflow;
}

export default {
  createWorkflow,
  runWorkflow,
  cancelWorkflow,
  resumeWorkflow,
  getWorkflowProgress,
};