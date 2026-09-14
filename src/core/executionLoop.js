import { recordAudit } from "./auditLog.js";

const MAX_ATTEMPTS = 3;

export async function runVerifiedStep(step, executor, observer = async (result) => result, options = {}) {
  if (typeof executor !== "function") throw new TypeError("An executor is required.");
  const maxAttempts = Math.max(1, Math.min(MAX_ATTEMPTS, Number(options.maxAttempts) || MAX_ATTEMPTS));
  const requestId = options.requestId || crypto.randomUUID();
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) return { success: false, result: null, observation: null, verified: false, attempts: attempt - 1, requestId, error: "Execution cancelled.", cancelled: true };
    try {
      const result = await executor({ step, attempt, requestId, signal: options.signal });
      if (result?.success === false) throw new Error(result.error || "The action reported a failure.");
      const observation = await observer(result, { step, attempt, requestId });
      const verified = Boolean(observation?.verified);
      recordAudit({ action: "execution.step", tool: step?.tool || step?.action, status: verified ? "completed" : "needs_verification", requestId, metadata: { attempt, verified, observation } });
      if (verified) return { success: true, result, observation, verified, attempts: attempt, requestId };
      lastError = "The action completed but could not be verified.";
    } catch (error) {
      if (options.signal?.aborted || error?.name === "AbortError") return { success: false, result: null, observation: null, verified: false, attempts: attempt, requestId, error: "Execution cancelled.", cancelled: true };
      lastError = error instanceof Error ? error.message : String(error);
      recordAudit({ action: "execution.step", tool: step?.tool || step?.action, status: "failed", requestId, metadata: { attempt, error: lastError } });
    }
  }

  return { success: false, result: null, observation: null, verified: false, attempts: maxAttempts, requestId, error: lastError };
}

export async function runVerifiedWorkflow(steps = [], executor, options = {}) {
  const results = [];
  for (const step of steps) {
    if (options.signal?.aborted) return { success: false, status: "cancelled", results };
    const result = await runVerifiedStep(step, executor, options.observer, options);
    results.push({ step, ...result });
    if (!result.success) return { success: false, status: result.cancelled ? "cancelled" : "blocked", results };
  }
  return { success: true, status: "completed", results };
}

export default { runVerifiedStep, runVerifiedWorkflow };
