import { getContext, resetContext } from "./contextManager.js";
import { clearMemoryGraph } from "./memoryGraph.js";
import { clearAuditEntries } from "./auditLog.js";
import { clearPermissions } from "./permissionManager.js";
import { clearSuggestionHistory } from "./proactiveEngine.js";
import { clearActions } from "./actionEngine.js";
import { clearTasks } from "./taskEngine.js";
import { clearSkills } from "./skillEngine.js";
import { listDevices, unregisterDevice } from "./deviceGateway.js";

export function resetAccountState() {
  const workflow = getContext().workflow.activeWorkflow;
  if (workflow) {
    workflow.status = "cancelled";
    for (const step of workflow.steps || []) {
      if (!["completed", "failed", "skipped"].includes(step.status)) step.status = "cancelled";
    }
  }
  clearActions();
  clearTasks();
  clearSkills();
  clearMemoryGraph();
  clearAuditEntries();
  clearPermissions();
  clearSuggestionHistory();
  for (const device of listDevices()) unregisterDevice(device.id);
  resetContext();
}
