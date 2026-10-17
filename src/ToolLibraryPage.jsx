import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle2, CircleHelp, CircleX, LockKeyhole, Pin, Play, Search, ShieldAlert, Star, Wrench, X } from "lucide-react";
import { HEY } from "./core/index.js";
import { useInterfaceLevel } from "./context/InterfaceLevelContext.jsx";
import { useAuth } from "./AuthContext.jsx";
import { getAccountScope, subscribeAccountScope } from "./core/accountScope.js";
import { getToolLibraryPreferenceView } from "./lib/toolLibraryPreferenceView.js";
import { getPurposePinRecommendations } from "./lib/purposePinRecommendations.js";
import { canGrantPermission } from "./lib/permissionPolicy.js";
import { resolveAccountPlan } from "./lib/accountRecords.js";
import { formatToolLibraryReceipt, isToolLibraryRecordVisible, scopeToolLibraryRecord } from "./lib/toolLibraryReceipts.js";
import { isDictationDiscoveryQuery, searchToolLibraryCatalog } from "./lib/toolLibrarySearch.js";
import { getDictationReadiness } from "./lib/dictationReadiness.js";
import { getToolLibraryLifecycleView } from "./lib/toolLibraryLifecycleView.js";
import { resolveRecentToolEntry } from "./lib/toolLibraryRecentEntry.js";
import { refreshToolLibraryLifecycleSnapshot } from "./lib/toolLibraryLifecycleRefresh.js";
import { getToolLibraryPlatformMatrix, TOOL_LIBRARY_PLATFORMS } from "./lib/toolLibraryPlatformMatrix.js";
import { Link } from "react-router-dom";
import "./ToolLibraryPage.css";

const STATUS_DETAILS = {
  supported: { label: "Available", Icon: Check, className: "tool-library__status--available" },
  permission_required: { label: "Permission required", Icon: LockKeyhole, className: "tool-library__status--permission" },
  restricted: { label: "Restricted", Icon: ShieldAlert, className: "tool-library__status--restricted" },
  unsupported: { label: "Unsupported here", Icon: CircleHelp, className: "tool-library__status--unsupported" },
};

function describeName(name) {
  return name.split(".").map((word) => word.replaceAll(/[_-]/g, " ")).join(" / ");
}

function preferenceFailureMessage(status) {
  if (status === "account_required") return "Your account preference scope is not ready. Reload the Tools catalog after signing in.";
  if (status === "invalid_store") return "Saved tool preferences are invalid and could not be loaded.";
  return "Tool preferences could not be loaded from browser storage.";
}

function isSimpleInputSchema(schema) {
  return schema?.type === "object" && schema.properties && typeof schema.properties === "object" &&
    Object.values(schema.properties).every((property) =>
      ["string", "number", "integer", "boolean"].includes(property?.type) ||
      (Array.isArray(property?.enum) && property.enum.every((value) => value === null || ["string", "number", "boolean"].includes(typeof value))),
    );
}

function initialInputValues(schema) {
  return Object.fromEntries(Object.entries(schema?.properties || {}).map(([name, property]) => [
    name,
    property.type === "boolean" ? false : "",
  ]));
}

function typedInputFromValues(schema, values) {
  if (!schema || !schema.properties || typeof schema.properties !== "object") return {};
  const input = {};
  for (const name of Array.isArray(schema.required) ? schema.required : []) {
    if (values[name] === "" || values[name] === undefined || values[name] === null) {
      throw new TypeError(`${name} is required.`);
    }
  }
  for (const [name, property] of Object.entries(schema.properties)) {
    const value = values[name];
    if (property.enum) {
      if (value === "") continue;
      const enumValue = property.enum[Number(value)];
      if (enumValue === undefined) throw new TypeError(`Choose a valid value for ${name}.`);
      input[name] = enumValue;
    } else if (property.type === "boolean") {
      input[name] = value === true;
    } else if (value !== "") {
      if (property.type === "string") input[name] = String(value);
      else {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue) || (property.type === "integer" && !Number.isInteger(numericValue))) {
          throw new TypeError(`${name} must be a valid ${property.type}.`);
        }
        input[name] = numericValue;
      }
    }
  }
  return input;
}

function safeToolError(value) {
  return (typeof value === "string" && value.trim() ? value : "HEY could not complete this tool run.")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 500);
}

function CapabilityDetails({ capabilities, errors }) {
  return (
    <div className="tool-library__meta-group">
      <h3>Capabilities</h3>
      <ul>
        {capabilities.map((capability, index) => (
          <li key={`${capability.capability || "unknown"}-${index}`}>
            <span>{capability.capability || "Invalid capability declaration"}</span>
            <span className="tool-library__capability-status">{capability.status.replaceAll("_", " ")}</span>
          </li>
        ))}
      </ul>
      {errors.map((message) => <p className="tool-library__capability-error" key={message}>{message}</p>)}
    </div>
  );
}

function ToolCard({
  tool,
  platformCatalogs,
  interfaceLevel,
  user,
  accountId,
  onActivityChanged,
  isFavorite,
  isPinned,
  canManagePreferences,
  onToggleFavorite,
  onTogglePin,
}) {
  const metadata = HEY.tools.get(tool.name)?.metadata || {};
  const inputSchema = metadata.inputSchema;
  const canRun = tool.status === "supported" && isSimpleInputSchema(inputSchema) && tool.permissions.length === 1;
  const permission = tool.permissions[0];
  const [runPanelOpen, setRunPanelOpen] = useState(false);
  const [inputValues, setInputValues] = useState(() => initialInputValues(inputSchema));
  const [pendingRun, setPendingRun] = useState(null);
  const [receiptState, setReceiptState] = useState(null);
  const [activityState, setActivityState] = useState(null);
  const [lifecycleState, setLifecycleState] = useState(null);
  const [refreshingLifecycle, setRefreshingLifecycle] = useState(false);
  const receipt = isToolLibraryRecordVisible(receiptState, accountId, getAccountScope()) ? receiptState : null;
  const activity = isToolLibraryRecordVisible(activityState, accountId, getAccountScope()) ? activityState.items : [];
  const lifecycleRecord = isToolLibraryRecordVisible(lifecycleState, accountId, getAccountScope()) ? lifecycleState : null;
  const lifecycleView = getToolLibraryLifecycleView(lifecycleRecord, accountId, getAccountScope(), tool.status);
  const canStart = lifecycleView.canStart && tool.permissions.length === 1;
  const canRetry = lifecycleView.canRetry && tool.permissions.length === 1;
  const requiresLifecycleConfirmation = tool.requiresConfirmation || ["high", "critical"].includes(String(tool.riskLevel || "").toLowerCase());
  const hasLifecycleControls = lifecycleView.visible && (lifecycleView.startDeclared || lifecycleView.stopDeclared || lifecycleView.retryDeclared || lifecycleView.removeDeclared);
  const [running, setRunning] = useState(false);
  const runLock = useRef(false);
  const refreshRequestRef = useRef(0);
  const controllerRef = useRef(null);
  const status = STATUS_DETAILS[tool.status] || STATUS_DETAILS.unsupported;
  const StatusIcon = status.Icon;
  const capabilityErrors = tool.capabilities
    .filter((capability) => capability.error)
    .map((capability) => capability.error);
  const setReceipt = useCallback((next) => {
    setReceiptState((current) => {
      const value = typeof next === "function" ? next(isToolLibraryRecordVisible(current, accountId, getAccountScope()) ? current : null) : next;
      return value ? scopeToolLibraryRecord(accountId, value) : null;
    });
  }, [accountId]);

  const refreshActivity = useCallback(async () => {
    const request = ++refreshRequestRef.current;
    if (!accountId || getAccountScope() !== `account:${accountId}`) {
      setActivityState(null);
      setLifecycleState(null);
      setRefreshingLifecycle(false);
      return;
    }
    setRefreshingLifecycle(true);
    const snapshot = await refreshToolLibraryLifecycleSnapshot({
      accountId,
      getActiveScope: getAccountScope,
      isCurrentRequest: () => refreshRequestRef.current === request,
      readActivity: () => HEY.tools.lifecycleActivity(tool.name, { user }),
      readLifecycle: () => HEY.tools.lifecycle(tool.name, { user, platform: "web" }),
    });
    if (snapshot.status === "ready") {
      setActivityState(scopeToolLibraryRecord(accountId, { items: snapshot.activity }));
      setLifecycleState(snapshot.lifecycle ? scopeToolLibraryRecord(accountId, snapshot.lifecycle) : null);
    } else if (snapshot.status === "account_changed" && refreshRequestRef.current === request) {
      setActivityState(null);
      setLifecycleState(null);
    }
    if (refreshRequestRef.current === request) setRefreshingLifecycle(false);
  }, [accountId, tool.name, user]);

  useEffect(() => {
    refreshActivity();
  }, [refreshActivity]);

  useEffect(() => {
    const unsubscribe = subscribeAccountScope(() => {
      refreshRequestRef.current += 1;
      controllerRef.current?.abort(new Error("Account scope changed."));
      controllerRef.current = null;
      runLock.current = false;
      setRunning(false);
      setPendingRun(null);
      setReceiptState(null);
      setActivityState(null);
      setLifecycleState(null);
      setRefreshingLifecycle(false);
    });
    return () => {
      refreshRequestRef.current += 1;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!lifecycleView.visible || !["starting", "running", "stopping"].includes(lifecycleView.status)) return undefined;
    const timer = setInterval(refreshActivity, 750);
    return () => clearInterval(timer);
  }, [lifecycleView.visible, lifecycleView.status, lifecycleView.sessionId, refreshActivity]);

  async function invokePlan(run, confirmed = false) {
    if (runLock.current) return;
    if (!accountId || getAccountScope() !== `account:${accountId}`) {
      setReceipt({ status: "denied", message: "Your signed-in account changed. Reload the Tools catalog before running this tool." });
      setPendingRun(null);
      return;
    }
    runLock.current = true;
    setRunning(true);
    setReceipt({ status: "running", message: confirmed ? "Running after your confirmation…" : "Checking access and preparing the run…" });
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const plan = HEY.tools.plan([{ id: run.stepId, toolName: tool.name, input: run.input }]);
      const response = await HEY.tools.executePlan(plan, {
        platform: "web", user, requestId: run.requestId, confirmed, signal: controller.signal,
      });
      if (controllerRef.current !== controller) return;
      if (!accountId || getAccountScope() !== `account:${accountId}`) {
        setReceipt({ status: "denied", message: "Your signed-in account changed while this tool was running. Its result is hidden; check the destination before running it again.", requestId: run.requestId });
        setPendingRun(null);
        return;
      }
      if (!response || typeof response.success !== "boolean" || !Array.isArray(response.results)) {
        setReceipt({ status: "error", message: "HEY could not verify this run. Check the destination before trying again.", requestId: run.requestId });
        setPendingRun(null);
        return;
      }
      const stepReceipt = response.results.length === 1 ? response.results[0] : null;
      if (!stepReceipt || stepReceipt.stepId !== run.stepId || stepReceipt.toolName !== tool.name || stepReceipt.metadata?.requestId !== run.requestId) {
        setReceipt({ status: response.status || "error", message: safeToolError(stepReceipt?.error || response.error || "HEY returned an incomplete run receipt."), requestId: run.requestId });
        setPendingRun(null);
        return;
      }
      if (stepReceipt.requiresConfirmation || stepReceipt.requiresPermission || stepReceipt.status === "permission_required") {
        setReceipt({ status: "confirmation_required", message: safeToolError(stepReceipt.error || "Review the details and confirm before running this action."), requestId: run.requestId });
        setPendingRun(run);
        return;
      }
      if (response.success && response.status === "completed" && response.completed?.[0] === run.stepId && stepReceipt.success && stepReceipt.status === "completed") {
        const verified = stepReceipt.result?.verified === true || stepReceipt.metadata?.verified === true;
        if (!verified) {
          setReceipt({ status: "unverified", message: "The tool returned a result without verification evidence. Review it before treating the action as complete or retrying.", result: stepReceipt.result, requestId: run.requestId });
        } else {
          setReceipt({ status: "completed", message: "HEY completed this tool run.", result: stepReceipt.result, requestId: run.requestId });
          onActivityChanged();
        }
        setPendingRun(null);
        return;
      }
      const denied = ["denied", "restricted", "unsupported", "unsupported_authorization"].includes(stepReceipt.status);
      setReceipt({
        status: denied ? "denied" : stepReceipt.status === "cancelled" ? "cancelled" : "error",
        message: safeToolError(stepReceipt.error || response.error),
        requestId: run.requestId,
        retryable: !denied && stepReceipt.status !== "cancelled" && stepReceipt.metadata?.retryable === true,
        retryRun: !denied && stepReceipt.status !== "cancelled" && stepReceipt.metadata?.retryable === true ? run : null,
      });
      setPendingRun(null);
    } catch (error) {
      if (controllerRef.current !== controller) return;
      setReceipt({ status: controller.signal.aborted ? "cancelled" : "error", message: controller.signal.aborted ? "Cancellation requested. Check the destination if dispatch may have started." : safeToolError(error instanceof Error ? error.message : null), requestId: run.requestId });
      setPendingRun(null);
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        runLock.current = false;
        setRunning(false);
        refreshActivity();
      }
    }
  }

  function submitRun(event) {
    event.preventDefault();
    if (!canRun || !accountId || getAccountScope() !== `account:${accountId}`) {
      setReceipt({ status: "denied", message: "Sign in with an active account before running this tool." });
      return;
    }
    let input;
    try { input = typedInputFromValues(inputSchema, inputValues); }
    catch (error) {
      setReceipt({ status: "error", message: safeToolError(error instanceof Error ? error.message : null) });
      return;
    }
    const run = { input, requestId: crypto.randomUUID(), stepId: `run-${crypto.randomUUID()}` };
    setReceipt(null);
    setPendingRun(run);
    if (!HEY.permissions.has(permission, "account", accountId)) {
      const request = HEY.permissions.request({ permission, scope: "account", riskLevel: tool.riskLevel || "medium", reason: `Run ${tool.name} from the Tool Library.` });
      if (!request || request.error) {
        setReceipt({ status: "error", message: safeToolError(request?.error), requestId: run.requestId });
        setPendingRun(null);
        return;
      }
      setReceipt({ status: "authorization_required", message: `HEY needs account permission “${permission}” before this tool can run.`, requestId: run.requestId });
      return;
    }
    void invokePlan(run);
  }

  function submitLifecycleStart() {
    if (!canStart || !accountId || getAccountScope() !== `account:${accountId}`) {
      setReceipt({ status: "denied", message: "This tool cannot be launched in the current account or platform state." });
      return;
    }
    let input;
    try { input = typedInputFromValues(inputSchema, inputValues); }
    catch (error) {
      setReceipt({ status: "error", message: safeToolError(error instanceof Error ? error.message : null) });
      return;
    }
    const run = { input, requestId: crypto.randomUUID(), stepId: `start-${crypto.randomUUID()}`, action: "start" };
    setReceipt(null);
    setPendingRun(run);
    if (!HEY.permissions.has(permission, "account", accountId)) {
      const request = HEY.permissions.request({ permission, scope: "account", riskLevel: tool.riskLevel || "medium", reason: `Launch ${tool.name} from the Tool Library.` });
      if (!request || request.error) {
        setReceipt({ status: "error", message: safeToolError(request?.error), requestId: run.requestId });
        setPendingRun(null);
        return;
      }
      setReceipt({ status: "authorization_required", message: `HEY needs account permission “${permission}” before this tool can launch.`, requestId: run.requestId });
      return;
    }
    if (requiresLifecycleConfirmation) {
      setReceipt({ status: "confirmation_required", message: "Review the launch details and confirm before starting this tool.", requestId: run.requestId });
      return;
    }
    void startLifecycle(run, false);
  }

  function startLifecycle(run, confirmed) {
    if (runLock.current) return;
    if (!accountId || getAccountScope() !== `account:${accountId}`) {
      setReceipt({ status: "denied", message: "Your signed-in account changed. No tool session was started." });
      setPendingRun(null);
      return;
    }
    const current = HEY.tools.lifecycle(tool.name, { user, platform: "web" });
    if (!current?.success || current.actions?.start !== true || current.readiness === "unavailable") {
      setReceipt({ status: "denied", message: safeToolError(current?.availability?.reason || "This tool is not ready to launch on this platform.") });
      setPendingRun(null);
      refreshActivity();
      return;
    }
    runLock.current = true;
    setRunning(true);
    let response;
    try {
      response = HEY.tools.start(tool.name, run.input, { platform: "web", user, confirmed });
    } finally {
      runLock.current = false;
      setRunning(false);
    }
    if (response?.success && response.status === "starting" && typeof response.sessionId === "string") {
      setReceipt({ status: "starting", message: "HEY started the tool session.", requestId: run.requestId, sessionId: response.sessionId });
      setPendingRun(null);
      refreshActivity();
      onActivityChanged();
      return;
    }
    setReceipt({ status: response?.status || "error", message: safeToolError(response?.error), requestId: run.requestId });
    setPendingRun(null);
    refreshActivity();
  }

  function stopLifecycle() {
    if (!lifecycleView.canStop || !lifecycleView.sessionId || !accountId || getAccountScope() !== `account:${accountId}`) return;
    const response = HEY.tools.stop(tool.name, lifecycleView.sessionId, { user });
    if (response?.success && response.status === "stopping") {
      setReceipt({ status: "stopping", message: "Stop requested. HEY will report the session’s actual final state." });
    } else {
      setReceipt({ status: response?.status || "error", message: safeToolError(response?.error) });
    }
    refreshActivity();
  }

  function removeLifecycleSession() {
    if (!lifecycleView.canRemove || !lifecycleView.sessionId || !accountId || getAccountScope() !== `account:${accountId}`) {
      setReceipt({ status: "denied", message: "This session record is no longer available to remove in the current account." });
      refreshActivity();
      return;
    }
    const response = HEY.tools.remove(tool.name, lifecycleView.sessionId, { user });
    setReceipt(response?.success && response.status === "removed"
      ? { status: "removed", message: "Session record removed. Recent activity remains available." }
      : { status: response?.status || "error", message: safeToolError(response?.error) });
    refreshActivity();
  }

  function submitLifecycleRetry() {
    if (!canRetry || !lifecycleView.sessionId || !accountId || getAccountScope() !== `account:${accountId}`) {
      setReceipt({ status: "denied", message: "This failed session is no longer available to retry in the current account or platform state." });
      refreshActivity();
      return;
    }
    let input;
    try { input = typedInputFromValues(inputSchema, inputValues); }
    catch (error) {
      setReceipt({ status: "error", message: safeToolError(error instanceof Error ? error.message : null) });
      return;
    }
    const run = { input, requestId: crypto.randomUUID(), stepId: `retry-${crypto.randomUUID()}`, action: "retry", failedSessionId: lifecycleView.sessionId };
    setReceipt(null);
    setPendingRun(run);
    if (!HEY.permissions.has(permission, "account", accountId)) {
      const request = HEY.permissions.request({ permission, scope: "account", riskLevel: tool.riskLevel || "medium", reason: `Retry ${tool.name} from the Tool Library.` });
      if (!request || request.error) {
        setReceipt({ status: "error", message: safeToolError(request?.error), requestId: run.requestId });
        setPendingRun(null);
        return;
      }
      setReceipt({ status: "authorization_required", message: `HEY needs account permission “${permission}” before this failed session can be retried.`, requestId: run.requestId });
      return;
    }
    if (requiresLifecycleConfirmation) {
      setReceipt({ status: "confirmation_required", message: "Review the retry details and confirm before starting a new session.", requestId: run.requestId });
      return;
    }
    void retryLifecycle(run, false);
  }

  function retryLifecycle(run, confirmed) {
    if (runLock.current) return;
    if (!accountId || getAccountScope() !== `account:${accountId}`) {
      setReceipt({ status: "denied", message: "Your signed-in account changed. No retry was started." });
      setPendingRun(null);
      return;
    }
    const current = HEY.tools.lifecycle(tool.name, { user, platform: "web" });
    if (!current?.success || current.actions?.retry !== true || !["failed", "failed_after_stop"].includes(current.status) || current.sessionId !== run.failedSessionId || current.readiness === "unavailable") {
      setReceipt({ status: "denied", message: safeToolError(current?.availability?.reason || "This failure is no longer eligible for retry under current policy.") });
      setPendingRun(null);
      refreshActivity();
      return;
    }
    runLock.current = true;
    setRunning(true);
    let response;
    try {
      response = HEY.tools.retry(tool.name, run.input, run.failedSessionId, { platform: "web", user, confirmed });
    } finally {
      runLock.current = false;
      setRunning(false);
    }
    if (response?.success && response.status === "starting" && typeof response.sessionId === "string") {
      setReceipt({ status: "starting", message: "HEY started a new session to retry the failed run.", requestId: run.requestId, sessionId: response.sessionId });
      setPendingRun(null);
      refreshActivity();
      onActivityChanged();
      return;
    }
    setReceipt({ status: response?.status || "error", message: safeToolError(response?.error), requestId: run.requestId });
    setPendingRun(null);
    refreshActivity();
  }

  function allowPermission() {
    if (!pendingRun || !accountId || getAccountScope() !== `account:${accountId}`) {
      setReceipt({ status: "denied", message: "Your signed-in account changed. No permission was granted." });
      setPendingRun(null);
      return;
    }
    const plan = resolveAccountPlan({ plan: user?.plan, entitlements: user?.entitlements });
    if (!canGrantPermission({ plan, permission })) {
      setReceipt({ status: "denied", message: `Your ${plan} plan does not include ${permission}.` });
      setPendingRun(null);
      return;
    }
    const grant = HEY.permissions.grant(permission, "account", { source: "tool_library", tool: tool.name, requestId: pendingRun.requestId });
    if (!grant || grant.status !== "granted") {
      setReceipt({ status: "error", message: "HEY could not save this permission." });
      setPendingRun(null);
      return;
    }
    if (pendingRun.action === "start") {
      if (requiresLifecycleConfirmation) {
        setReceipt({ status: "confirmation_required", message: "Review the launch details and confirm before starting this tool.", requestId: pendingRun.requestId });
      } else {
        startLifecycle(pendingRun, false);
      }
    } else if (pendingRun.action === "retry") {
      if (requiresLifecycleConfirmation) {
        setReceipt({ status: "confirmation_required", message: "Review the retry details and confirm before starting a new session.", requestId: pendingRun.requestId });
      } else {
        void retryLifecycle(pendingRun, false);
      }
    } else {
      void invokePlan(pendingRun);
    }
  }

  function cancelRun() {
    if (!controllerRef.current || controllerRef.current.signal.aborted) return;
    controllerRef.current.abort(new Error("Tool Library run cancelled by the user."));
    setReceipt((current) => ({ ...current, status: "cancelling", message: "Cancellation requested. The handler will report its actual outcome when it settles." }));
  }

  return (
    <article id={`tool-card-${encodeURIComponent(tool.name)}`} className="tool-library__card" aria-labelledby={`tool-${encodeURIComponent(tool.name)}`}>
      <div className="tool-library__card-heading">
        <div className="tool-library__tool-icon" aria-hidden="true"><Wrench size={18} /></div>
        <div className="tool-library__card-actions">
          <span className={`tool-library__status ${status.className}`}>
            <StatusIcon size={14} aria-hidden="true" />
            {status.label}
          </span>
          <button
            type="button"
            className="tool-library__preference-button"
            aria-label={`${isFavorite ? "Remove" : "Add"} ${describeName(tool.name)} ${isFavorite ? "from" : "to"} favorites`}
            aria-pressed={isFavorite}
            disabled={!canManagePreferences}
            onClick={() => onToggleFavorite(tool.name)}
          >
            <Star size={16} aria-hidden="true" fill={isFavorite ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            className="tool-library__preference-button"
            aria-label={`${isPinned ? "Unpin" : "Pin"} ${describeName(tool.name)}`}
            aria-pressed={isPinned}
            disabled={!canManagePreferences}
            onClick={() => onTogglePin(tool.name)}
          >
            <Pin size={16} aria-hidden="true" fill={isPinned ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
      <h2 id={`tool-${encodeURIComponent(tool.name)}`}>{describeName(tool.name)}</h2>
      {interfaceLevel === "advanced" && <p className="tool-library__tool-name">{tool.name}</p>}
      <dl className="tool-library__details">
        <div><dt>Risk</dt><dd>{tool.riskLevel || "Not specified"}</dd></div>
        {interfaceLevel === "advanced" && <div><dt>Lifecycle</dt><dd>{tool.lifecycle}</dd></div>}
        {tool.requiresConfirmation && <div><dt>Confirmation</dt><dd>Required before execution</dd></div>}
      </dl>
      {tool.permissions.length > 0 && (
        <div className="tool-library__meta-group">
          <h3>Permission scope</h3>
          <ul>{tool.permissions.map((permission) => <li key={permission}>{permission}</li>)}</ul>
        </div>
      )}
      {tool.capabilities.length > 0 && (
        interfaceLevel === "advanced"
          ? <CapabilityDetails capabilities={tool.capabilities} errors={capabilityErrors} />
          : (
            <details className="tool-library__advanced-details">
              <summary>Technical capabilities ({tool.capabilities.length})</summary>
              <CapabilityDetails capabilities={tool.capabilities} errors={capabilityErrors} />
            </details>
          )
      )}
      {tool.status === "permission_required" && (
        <p className="tool-library__permission-note" role="note">This tool needs the listed permission before its capability can be used.</p>
      )}
      {tool.status === "restricted" && (
        <p className="tool-library__permission-note" role="note">This tool is restricted by current capability policy.</p>
      )}
      {tool.status === "unsupported" && (
        <p className="tool-library__permission-note" role="note">This tool has no supported capability on the web platform.</p>
      )}
      <details className="tool-library__advanced-details">
        <summary>Platform availability</summary>
        <ul className="tool-library__platform-list">
          {getToolLibraryPlatformMatrix(platformCatalogs, tool.name).map(({ platform, label, status }) => (
            <li key={platform}><span>{label}</span><span className={`tool-library__platform-status tool-library__platform-status--${status}`}>{STATUS_DETAILS[status]?.label || "Unknown"}</span></li>
          ))}
        </ul>
      </details>
      <details className="tool-library__advanced-details">
        <summary>Activity</summary>
        <button type="button" className="tool-library__retry" disabled={refreshingLifecycle || !accountId || getAccountScope() !== `account:${accountId}`} onClick={() => { void refreshActivity(); }}>
          {refreshingLifecycle ? "Refreshing…" : "Refresh activity and session status"}
        </button>
        {activity.length ? <ul className="tool-library__activity-list">{activity.slice(0, 10).map((item) => (
          <li key={`${item.id}-${item.status}-${item.at}`}><span>{item.status.replaceAll("_", " ")}</span><time dateTime={item.at}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.at))}</time></li>
        ))}</ul> : <p className="tool-library__run-help">No Tool Library activity is recorded for this tool on this device.</p>}
      </details>
      {hasLifecycleControls && <details className="tool-library__advanced-details tool-library__lifecycle" open={lifecycleView.status === "starting" || lifecycleView.status === "running" || lifecycleView.status === "stopping" || lifecycleView.canRetry}>
        <summary>Session controls</summary>
        <p className="tool-library__run-help">Status: <strong>{lifecycleView.status.replaceAll("_", " ")}</strong> · Readiness: {lifecycleView.readiness.replaceAll("_", " ")}</p>
        {lifecycleView.canStop && <button type="button" className="tool-library__deny-button" disabled={running || getAccountScope() !== `account:${accountId}`} onClick={stopLifecycle}>Stop session</button>}
        {canRetry && <><p className="tool-library__run-help">This failed session can be retried after HEY rechecks current permissions and platform support.</p><button type="button" className="tool-library__run-button" disabled={!accountId || getAccountScope() !== `account:${accountId}`} onClick={() => { setInputValues(initialInputValues(inputSchema)); setReceipt(null); setPendingRun(null); setRunPanelOpen(true); }}>Configure retry</button></>}
        {lifecycleView.canRemove && <button type="button" className="tool-library__deny-button" disabled={running || getAccountScope() !== `account:${accountId}`} onClick={removeLifecycleSession}>Remove session record</button>}
      </details>}
      {(canRun || canStart) && <div className="tool-library__run-panel">
        {!runPanelOpen ? <button type="button" className="tool-library__run-button" disabled={!accountId || getAccountScope() !== `account:${accountId}`} onClick={() => {
          setInputValues(initialInputValues(inputSchema));
          setReceipt(null);
          setPendingRun(null);
          setRunPanelOpen(true);
        }}><Play size={15} aria-hidden="true" /> {canRun ? "Customize and use" : "Configure and launch"}</button> : <form onSubmit={submitRun}>
          <div className="tool-library__run-heading"><h3>{canRun ? `Run ${describeName(tool.name)}` : `Launch ${describeName(tool.name)}`}</h3><button type="button" className="tool-library__close-run" disabled={running} aria-label={`Close ${describeName(tool.name)} form`} onClick={() => { setRunPanelOpen(false); setPendingRun(null); }}><X size={16} aria-hidden="true" /></button></div>
          <p className="tool-library__run-help">HEY checks current platform support and account permission again before starting this tool.</p>
          {Object.entries(inputSchema?.properties || {}).map(([name, property]) => {
            const fieldId = `tool-run-${encodeURIComponent(tool.name)}-${encodeURIComponent(name)}`;
            const required = inputSchema.required.includes(name);
            return <label className="tool-library__run-field" htmlFor={fieldId} key={name}>
              <span>{name.replaceAll(/[_-]/g, " ")}{required ? " (required)" : ""}</span>
              {property.enum ? <select id={fieldId} required={required} value={inputValues[name]} onChange={(event) => setInputValues((current) => ({ ...current, [name]: event.target.value }))}><option value="">Choose…</option>{property.enum.map((value, index) => <option key={`${typeof value}-${String(value)}-${index}`} value={String(index)}>{String(value)}</option>)}</select>
                : property.type === "boolean" ? <input id={fieldId} type="checkbox" checked={inputValues[name] === true} onChange={(event) => setInputValues((current) => ({ ...current, [name]: event.target.checked }))} />
                  : <input id={fieldId} type={property.type === "string" ? "text" : "number"} step={property.type === "integer" ? "1" : "any"} required={required} value={inputValues[name]} onChange={(event) => setInputValues((current) => ({ ...current, [name]: event.target.value }))} />}
              {property.description && <small>{property.description}</small>}
            </label>;
          })}
          <div className="tool-library__run-actions">{canRun && <button type="submit" className="tool-library__run-button" disabled={running || !accountId || getAccountScope() !== `account:${accountId}`}><Play size={15} aria-hidden="true" /> Run</button>}{canStart && <button type="button" className="tool-library__run-button" disabled={running || !accountId || getAccountScope() !== `account:${accountId}`} onClick={submitLifecycleStart}><Play size={15} aria-hidden="true" /> Start session</button>}{canRetry && <button type="button" className="tool-library__run-button" disabled={running || !accountId || getAccountScope() !== `account:${accountId}`} onClick={submitLifecycleRetry}>Retry failed session</button>}{running && <button type="button" className="tool-library__deny-button" onClick={cancelRun}>Cancel</button>}</div>
        </form>}
        {receipt && <div className={`tool-library__receipt tool-library__receipt--${receipt.status}`} role={["error", "denied"].includes(receipt.status) ? "alert" : "status"} aria-live="polite">
          <div className="tool-library__receipt-heading">{receipt.status === "completed" ? <CheckCircle2 size={16} aria-hidden="true" /> : ["error", "denied"].includes(receipt.status) ? <CircleX size={16} aria-hidden="true" /> : <LockKeyhole size={16} aria-hidden="true" />}<strong>{receipt.status.replaceAll("_", " ")}</strong></div>
          <p>{receipt.message}</p>{receipt.requestId && <small>Receipt {receipt.requestId}</small>}
          {receipt.retryable && receipt.retryRun && !running && <button type="button" className="tool-library__run-button" onClick={() => { const retryRun = { ...receipt.retryRun, requestId: crypto.randomUUID(), stepId: `retry-${crypto.randomUUID()}` }; setReceipt(null); void invokePlan(retryRun); }}>Retry this run</button>}
          {receipt.status === "authorization_required" && pendingRun && <div className="tool-library__run-actions"><button type="button" className="tool-library__run-button" onClick={allowPermission}>Allow account permission</button><button type="button" className="tool-library__deny-button" onClick={() => { setReceipt({ status: "denied", message: "You denied this tool run. HEY did not dispatch it.", requestId: pendingRun.requestId }); setPendingRun(null); }}>Deny</button></div>}
          {receipt.status === "confirmation_required" && pendingRun && <><pre className="tool-library__result">{formatToolLibraryReceipt(pendingRun.input)}</pre><div className="tool-library__run-actions"><button type="button" className="tool-library__run-button" disabled={running} onClick={() => pendingRun.action === "start" ? startLifecycle(pendingRun, true) : pendingRun.action === "retry" ? retryLifecycle(pendingRun, true) : void invokePlan(pendingRun, true)}>Confirm and {pendingRun.action === "start" ? "start" : pendingRun.action === "retry" ? "retry" : "run"}</button><button type="button" className="tool-library__deny-button" disabled={running} onClick={() => { setReceipt({ status: "denied", message: "You denied this tool run. HEY did not dispatch it.", requestId: pendingRun.requestId }); setPendingRun(null); }}>Deny</button></div></>}
          {["completed", "unverified"].includes(receipt.status) && receipt.result !== undefined && <pre className="tool-library__result">{formatToolLibraryReceipt(receipt.result)}</pre>}
        </div>}
      </div>}
    </article>
  );
}

export default function ToolLibraryPage() {
  const { level: interfaceLevel } = useInterfaceLevel();
  const { user } = useAuth();
  const accountId = user?.id ? String(user.id) : null;
  const [tools, setTools] = useState([]);
  const [platformCatalogs, setPlatformCatalogs] = useState({});
  const [query, setQuery] = useState("");
  const [recentToolName, setRecentToolName] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState("all");
  const [preferenceState, setPreferenceState] = useState({ status: "loading", accountId: null, preferences: null });
  const [preferenceError, setPreferenceError] = useState("");
  const requestRef = useRef(0);

  const preferenceView = getToolLibraryPreferenceView({
    accountId,
    activeScope: getAccountScope(),
    state: preferenceState,
  });
  const preferenceStatus = preferenceView.status;
  const preferenceReady = preferenceView.ready;
  const preferenceLoading = preferenceStatus === "loading";
  const preferences = preferenceView.preferences;
  const displayedView = preferenceReady ? activeView : "all";
  const purposeSetup = preferenceReady && accountId && getAccountScope() === `account:${accountId}`
    ? HEY.onboarding.getPurposeSetup()
    : null;
  const purposeSetupAccountScope = purposeSetup ? getAccountScope() : null;
  const purposePinView = !loading && preferenceReady && purposeSetup
    ? getPurposePinRecommendations({
      accountId,
      activeScope: getAccountScope(),
      setupAccountScope: purposeSetupAccountScope,
      setup: purposeSetup,
      catalog: tools,
      pinned: preferences.pinned,
    })
    : null;

  const loadCatalog = useCallback(async () => {
    const request = ++requestRef.current;
    const requestedAccountId = accountId;
    setLoading(true);
    setPlatformCatalogs({});
    setError("");
    setPreferenceError("");
    setPreferenceState({ status: requestedAccountId ? "loading" : "account_required", accountId: requestedAccountId, preferences: null });
    try {
      // Let the loading state render before catalog discovery runs.
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      if (requestRef.current !== request) return;
      HEY.initialize();
      const catalog = HEY.tools.catalog({ platform: "web" });
      if (!Array.isArray(catalog)) throw new TypeError("Tool catalog returned an invalid response.");
      const discoveredCatalogs = { web: catalog };
      for (const { id } of TOOL_LIBRARY_PLATFORMS) {
        if (id === "web") continue;
        try {
          const platformCatalog = HEY.tools.catalog({ platform: id });
          discoveredCatalogs[id] = Array.isArray(platformCatalog) ? platformCatalog : null;
        } catch {
          discoveredCatalogs[id] = null;
        }
      }
      if (requestRef.current !== request) return;
      setPlatformCatalogs(discoveredCatalogs);
      setTools(catalog);
      if (!requestedAccountId || getAccountScope() !== `account:${requestedAccountId}`) {
        setPreferenceState({ status: "account_required", accountId: requestedAccountId, preferences: null });
      } else {
        const result = HEY.tools.preferences.load();
        if (requestRef.current !== request) return;
        setPreferenceState({
          status: result.success ? "ready" : result.status,
          accountId: requestedAccountId,
          preferences: result.success ? result.preferences : null,
        });
      }
    } catch {
      if (requestRef.current !== request) return;
      setError("The tool catalog could not be loaded. Try again in a moment.");
      setTools([]);
      setPlatformCatalogs({});
      setPreferenceState({ status: "unavailable", accountId: requestedAccountId, preferences: null });
    } finally {
      if (requestRef.current === request) setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void loadCatalog();
    return () => {
      requestRef.current += 1;
    };
  }, [loadCatalog]);

  function updatePreference(name, kind) {
    if (!preferenceReady || !accountId || getAccountScope() !== `account:${accountId}`) {
      setPreferenceError("Your account changed. Reload the Tools catalog before changing preferences.");
      return;
    }

    setPreferenceError("");
    try {
      const current = kind === "favorite"
        ? preferences.favorites.includes(name)
        : preferences.pinned.includes(name);
      const result = kind === "favorite"
        ? HEY.tools.preferences.setFavorite(name, !current)
        : HEY.tools.preferences.setPinned(name, !current);

      if (!result?.success) {
        setPreferenceError("Your tool preference could not be saved. Check browser storage and try again.");
        return;
      }
      if (getAccountScope() !== `account:${accountId}`) {
        setPreferenceState({ status: "account_required", accountId: null, preferences: null });
        setPreferenceError("Your account changed before the preference was saved. Reload the Tools catalog.");
        return;
      }
      setPreferenceState({ status: "ready", accountId, preferences: result.preferences });
    } catch {
      setPreferenceError("Your tool preference could not be saved. Check browser storage and try again.");
    }
  }

  function pinPurposeRecommendation(tool) {
    const expectedScope = `account:${accountId || ""}`;
    if (!preferenceReady || purposePinView?.accountScope !== expectedScope || getAccountScope() !== expectedScope
      || !purposePinView.recommendations.some((candidate) => candidate.name === tool.name && candidate.accountScope === expectedScope)) {
      setPreferenceError("Your account changed. Reload Tools before adding this suggested pin.");
      return;
    }
    updatePreference(tool.name, "pinned");
  }

  function openRecentTool(name) {
    const entry = resolveRecentToolEntry({
      name,
      accountId,
      activeScope: getAccountScope(),
      recent: preferences.recent,
      catalog: tools,
    });
    if (!preferenceReady || entry.status !== "ready") {
      setPreferenceError(entry.status === "account_required"
        ? "Your account changed. Reload Tools before opening a recent tool."
        : "This recent tool is no longer available in the current catalog. Reload Tools to refresh it.");
      return;
    }
    setPreferenceError("");
    setActiveView("all");
    setRecentToolName(entry.name);
    setQuery(entry.name);
  }

  function clearRecentToolFocus() {
    if (recentToolName) setQuery("");
    setRecentToolName(null);
  }

  const filteredTools = useMemo(() => {
    if (typeof recentToolName === "string") return tools.filter((tool) => tool.name === recentToolName);
    return searchToolLibraryCatalog(tools, query);
  }, [query, recentToolName, tools]);
  const dictationDiscovery = isDictationDiscoveryQuery(query);
  const [dictationReadiness, setDictationReadiness] = useState({ status: "idle", supported: null, permission: "unknown" });

  useEffect(() => {
    if (!dictationDiscovery) {
      setDictationReadiness({ status: "idle", supported: null, permission: "unknown" });
      return undefined;
    }
    let current = true;
    setDictationReadiness({ status: "checking", supported: null, permission: "unknown" });
    void getDictationReadiness(window).then((readiness) => {
      if (current) setDictationReadiness({ status: "ready", ...readiness });
    });
    return () => { current = false; };
  }, [dictationDiscovery]);

  const visibleTools = !preferenceReady || activeView === "all"
    ? filteredTools
    : filteredTools.filter((tool) => {
      const selected = activeView === "favorites" ? preferences.favorites : preferences.pinned;
      return selected.includes(tool.name);
    });

  const recentEntries = preferences.recent
    .map((entry) => ({ ...entry, tool: tools.find((tool) => tool.name === entry.name) }))
    .filter((entry) => entry.tool);

  function formatRecentDate(value) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }

  function refreshPreferences() {
    if (!accountId || getAccountScope() !== `account:${accountId}`) {
      setPreferenceState({ status: "account_required", accountId: null, preferences: null });
      return;
    }
    const result = HEY.tools.preferences.load();
    setPreferenceState({ status: result.success ? "ready" : result.status, accountId, preferences: result.success ? result.preferences : null });
  }

  return (
    <section className="tool-library" aria-labelledby="tool-library-title">
      <header className="tool-library__header">
        <div>
          <p className="tool-library__eyebrow">HEY workspace</p>
          <h1 id="tool-library-title">Tools</h1>
          <p className="tool-library__intro">
            {interfaceLevel === "advanced"
              ? "Review registered tools, the capabilities they require, and their availability on this platform."
              : "Scan registered tools, the access they need, and whether they are available here."}
          </p>
        </div>
        {!loading && !error && <p className="tool-library__count" aria-live="polite">{tools.length} {tools.length === 1 ? "tool" : "tools"} registered</p>}
      </header>

      <div className="tool-library__toolbar">
        <label className="tool-library__search">
          <Search size={18} aria-hidden="true" />
          <span className="tool-library__sr-only">Search tools, permissions, and capabilities</span>
          <input type="search" value={query} onChange={(event) => { setRecentToolName(null); setQuery(event.target.value); }} placeholder="Search tools or permissions" />
        </label>
        <p>Platform catalog: <strong>Web</strong></p>
      </div>

      <section className="tool-library__preference-panel" aria-labelledby="gesture-tool-card-title">
        <h2 id="gesture-tool-card-title">Gesture Studio</h2>
        <p>Configure camera-based local hand controls, calibrate account profiles, and test supported gestures before enabling safe actions.</p>
        <Link className="tool-library__retry" to="/gestures">Open Gesture Studio</Link>
      </section>

      <section className="tool-library__preference-panel" aria-labelledby="tool-library-views-title">
        <div className="tool-library__preference-toolbar">
          <h2 id="tool-library-views-title">Your tool views</h2>
          <div className="tool-library__view-tabs" role="group" aria-label="Filter tools">
            <button type="button" aria-pressed={displayedView === "all"} onClick={() => { clearRecentToolFocus(); setActiveView("all"); }}>All <span>{tools.length}</span></button>
            <button type="button" aria-pressed={displayedView === "favorites"} disabled={!preferenceReady} onClick={() => { clearRecentToolFocus(); setActiveView("favorites"); }}>Favorites <span>{preferences.favorites.length}</span></button>
            <button type="button" aria-pressed={displayedView === "pinned"} disabled={!preferenceReady} onClick={() => { clearRecentToolFocus(); setActiveView("pinned"); }}>Pinned <span>{preferences.pinned.length}</span></button>
          </div>
        </div>

        {preferenceLoading && <p className="tool-library__preference-status" role="status">Loading account-scoped tool preferences…</p>}
        {!error && !preferenceLoading && !preferenceReady && <p className="tool-library__preference-error" role="alert">{preferenceFailureMessage(preferenceStatus)}</p>}
        {preferenceError && <p className="tool-library__preference-error" role="alert">{preferenceError}</p>}

        <div className="tool-library__recent" aria-labelledby="tool-library-recent-title">
          <h3 id="tool-library-recent-title">Recently used</h3>
          {preferenceReady && recentEntries.length === 0 && <p role="status">Tools you use will appear here.</p>}
          {preferenceReady && recentEntries.length > 0 && (
            <ul>
              {recentEntries.map((entry) => (
                <li key={entry.name}>
                  <button type="button" className="tool-library__recent-open" aria-label={`Show ${describeName(entry.name)} in the catalog`} onClick={() => openRecentTool(entry.name)}>{describeName(entry.name)}</button>
                  <time dateTime={entry.usedAt}>{formatRecentDate(entry.usedAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {purposePinView && purposePinView.purposeSelections.length > 0 && <section className="tool-library__preference-panel tool-library__purpose-pins" aria-labelledby="tool-library-purpose-pins-title">
        <h2 id="tool-library-purpose-pins-title">Suggested pins</h2>
        <p>These suggestions use your selected purpose areas and tools registered for this account’s current platform. Adding a pin saves a shortcut; it does not grant permission or make unsupported tools available. Custom goal text is not interpreted.</p>
        {purposePinView.recommendations.length > 0
          ? <ul>{purposePinView.recommendations.map((tool) => <li key={tool.name}>
            <span><strong>{describeName(tool.name)}</strong><small>{tool.status === "permission_required" ? "Permission required before use" : "Available on this platform"}</small></span>
            <button type="button" className="tool-library__retry" disabled={!preferenceReady || getAccountScope() !== purposePinView.accountScope} onClick={() => pinPurposeRecommendation(tool)} aria-label={`Pin ${describeName(tool.name)}`}>Pin</button>
          </li>)}</ul>
          : <p role="status">No matching tools are currently available or permission-ready on this platform. Nothing was pinned; all tools remain available to browse.</p>}
      </section>}

      {dictationDiscovery && <section className="tool-library__intent-suggestion" aria-labelledby="tool-library-dictation-title">
        <div>
          <h2 id="tool-library-dictation-title">Dictation in Chat</h2>
          <p role="status" aria-live="polite">{dictationReadiness.status !== "ready"
            ? "Checking browser speech recognition and microphone permission status…"
            : dictationReadiness.supported === false
              ? "Speech recognition is not available in this browser. Cross app text insertion is not available in this web app."
              : dictationReadiness.permission === "granted"
                ? "Speech recognition is available and microphone permission is already granted. HEY still asks for consent before capture. Cross app text insertion is not available in this web app."
                : dictationReadiness.permission === "prompt"
                  ? "Speech recognition is available. Microphone permission will be requested after you review and consent in Chat. Cross app text insertion is not available in this web app."
                  : dictationReadiness.permission === "denied"
                    ? "Speech recognition is available, but browser microphone permission is denied. Change the site permission before using dictation. Cross app text insertion is not available in this web app."
                    : "Speech recognition is available, but this browser does not report microphone permission status. Chat checks permission after you review and consent."}</p>
        </div>
        <Link className="tool-library__retry" to="/chat">Open Chat dictation</Link>
      </section>}

      {loading && (
        <div className="tool-library__message" role="status" aria-live="polite">
          <span className="tool-library__spinner" aria-hidden="true" />
          <p>Loading the tool catalog…</p>
        </div>
      )}

      {!loading && error && (
        <div className="tool-library__message tool-library__message--error" role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <p>{error}</p>
          <button type="button" className="tool-library__retry" onClick={loadCatalog}>Try again</button>
        </div>
      )}

      {!loading && !error && tools.length === 0 && (
        <div className="tool-library__message" role="status">
          <Wrench size={22} aria-hidden="true" />
          <div><h2>No tools registered yet</h2><p>Registered tools will appear here with their capability and permission details.</p></div>
        </div>
      )}

      {!loading && !error && tools.length > 0 && visibleTools.length === 0 && (
        <div className="tool-library__message">
          {displayedView === "favorites" && preferences.favorites.length === 0
            ? <><p role="status">No favorites yet. Browse all tools and use the star button to add one.</p><button type="button" className="tool-library__retry" onClick={() => setActiveView("all")}>Browse all tools</button></>
            : displayedView === "pinned" && preferences.pinned.length === 0
              ? <><p role="status">No pinned tools yet. Browse all tools and use the pin button to add one.</p><button type="button" className="tool-library__retry" onClick={() => setActiveView("all")}>Browse all tools</button></>
              : <p role="status">No tools match “{query}”. Try a different search or view.</p>}
        </div>
      )}

      {!loading && !error && visibleTools.length > 0 && (
        <div className="tool-library__grid">
          {visibleTools.map((tool) => (
            <ToolCard
              key={tool.name}
              tool={tool}
              platformCatalogs={platformCatalogs}
              interfaceLevel={interfaceLevel}
              user={user}
              accountId={accountId}
              onActivityChanged={refreshPreferences}
              isFavorite={preferences.favorites.includes(tool.name)}
              isPinned={preferences.pinned.includes(tool.name)}
              canManagePreferences={preferenceReady}
              onToggleFavorite={(name) => updatePreference(name, "favorite")}
              onTogglePin={(name) => updatePreference(name, "pinned")}
            />
          ))}
        </div>
      )}
    </section>
  );
}
