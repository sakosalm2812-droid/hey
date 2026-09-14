import heyPersonality from "./personality.js";
import { analyzeMessage } from "./messageRouter.js";

function createStep(id, title, description, agentId = null) {
  return {
    id,
    title,
    description,
    agentId,
    priority: id === 1 ? "high" : "normal",
    dependencies: id > 1 ? [id - 1] : [],
    status: "pending",
    result: null,
    error: null,
    startedAt: null,
    completedAt: null,
  };
}

function generatePlan(message) {
  const text = message.toLowerCase();
  const steps = [];

  steps.push(
    createStep(
      1,
      "Understand",
      "Understand the user's goal, constraints, context, and desired outcome.",
      "architect"
    )
  );

  if (/\b(research|find|compare|investigate|look up)\b/i.test(text)) {
    steps.push(
      createStep(
        steps.length + 1,
        "Research",
        "Gather and evaluate the information required.",
        "researcher"
      )
    );
  }

  if (/\b(plan|strategy|business|project|decision)\b/i.test(text)) {
    steps.push(
      createStep(
        steps.length + 1,
        "Plan",
        "Determine the best approach and consider tradeoffs.",
        "strategist"
      )
    );
  }

  if (
    /\b(code|build|develop|program|website|app|software|implement)\b/i.test(
      text
    )
  ) {
    steps.push(
      createStep(
        steps.length + 1,
        "Build",
        "Create or modify the required implementation.",
         "builder"
      )
    );

    steps.push(
      createStep(
        steps.length + 1,
        "Test",
        "Test the implementation and identify failures.",
         "tester"
      )
    );

    steps.push(
      createStep(
        steps.length + 1,
        "Fix",
        "Resolve failures discovered during testing.",
         "debugger"
      )
    );
  }

  if (/\b(design|visual|ui|ux|brand)\b/i.test(text)) {
    steps.push(
      createStep(
        steps.length + 1,
        "Design",
        "Develop the requested visual or interface solution.",
        "designer"
      )
    );
  }

  steps.push(
    createStep(
      steps.length + 1,
      "Verify",
      "Verify that the result satisfies the original request.",
      "verifier"
    )
  );

  return steps;
}

export function createPlan(message) {
  const classification = analyzeMessage(message);

  return {
    id: crypto.randomUUID(),
    goal: message,
    type: classification.type,
    mode: classification.mode,
    confidence: classification.confidence,
    personality: heyPersonality,
    steps: generatePlan(message),
    currentStep: 0,
    status: "planned",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function getNextStep(plan) {
  return plan.steps.find(
    (step) => step.status === "pending"
  ) || null;
}

export function markStepRunning(plan, stepId) {
  const step = plan.steps.find(
    (item) => item.id === stepId
  );

  if (!step) return plan;

  step.status = "running";
  step.startedAt = new Date();

  plan.status = "executing";
  plan.updatedAt = new Date();

  return plan;
}

export function markStepCompleted(plan, stepId, result = null) {
  const step = plan.steps.find(
    (item) => item.id === stepId
  );

  if (!step) return plan;

  step.status = "completed";
  step.result = result;
  step.completedAt = new Date();

  plan.currentStep += 1;
  plan.updatedAt = new Date();

  if (!getNextStep(plan)) {
    plan.status = "completed";
  }

  return plan;
}

export function markStepFailed(plan, stepId, error) {
  const step = plan.steps.find(
    (item) => item.id === stepId
  );

  if (!step) return plan;

  step.status = "failed";
  step.error =
    error instanceof Error
      ? error.message
      : String(error);

  plan.status = "blocked";
  plan.updatedAt = new Date();

  return plan;
}

export default {
  createPlan,
  getNextStep,
  markStepRunning,
  markStepCompleted,
  markStepFailed,
};
