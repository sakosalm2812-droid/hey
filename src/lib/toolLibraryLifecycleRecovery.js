const VALID_LIFECYCLE_STATUSES = new Set([
  "starting", "running", "stopping", "completed", "completed_after_stop",
  "cancelled", "failed", "failed_after_stop", "registered", "removed",
]);
const ACTIVE_RECEIPT_STATUSES = new Set(["starting", "running", "stopping"]);

/** Reconcile an in-flight lifecycle receipt only with a fresh result for its account and session. */
export function reconcileToolLibraryLifecycleReceipt(receipt, lifecycle, accountId, activeScope) {
  if (typeof accountId !== "string" || !accountId || activeScope !== `account:${accountId}`
    || !receipt || receipt.accountId !== accountId
    || !ACTIVE_RECEIPT_STATUSES.has(receipt.status)
    || typeof receipt.sessionId !== "string" || !receipt.sessionId
    || !lifecycle || lifecycle.success !== true
    || typeof lifecycle.status !== "string" || !VALID_LIFECYCLE_STATUSES.has(lifecycle.status)) {
    return null;
  }

  if (lifecycle.sessionId !== receipt.sessionId) {
    return Object.freeze({
      ...receipt,
      status: "stale_session",
      message: "The session changed before this update could be confirmed. Review the current session before retrying.",
      retryable: false,
      retryRun: null,
    });
  }

  if (receipt.status === lifecycle.status
    || (receipt.status === "stopping" && lifecycle.status === "running")
    || (receipt.status === "running" && lifecycle.status === "starting")) return null;

  const terminalFailure = ["failed", "failed_after_stop", "cancelled"].includes(lifecycle.status);
  const message = terminalFailure
    ? `The session finished with status: ${lifecycle.status.replaceAll("_", " ")}. Review its details before retrying.`
    : `The session status is now: ${lifecycle.status.replaceAll("_", " ")}.`;

  return Object.freeze({
    ...receipt,
    status: lifecycle.status,
    message,
    retryable: false,
    retryRun: null,
  });
}
