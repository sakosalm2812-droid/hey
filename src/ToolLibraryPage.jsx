import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle2, CircleHelp, CircleX, LockKeyhole, Pin, Play, Search, ShieldAlert, Star, Wrench, X } from "lucide-react";
import { HEY } from "./core/index.js";
import { useInterfaceLevel } from "./context/InterfaceLevelContext.jsx";
import { useAuth } from "./AuthContext.jsx";
import { getAccountScope } from "./core/accountScope.js";
import { getToolLibraryPreferenceView } from "./lib/toolLibraryPreferenceView.js";
import { canGrantPermission } from "./lib/permissionPolicy.js";
import { resolveAccountPlan } from "./lib/accountRecords.js";
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
  if (schema?.type !== "object" || !schema.properties || typeof schema.properties !== "object") return false;
  return Object.values(schema.properties).every((property) =>
    ["string", "number", "integer", "boolean"].includes(property?.type) ||
    (Array.isArray(property?.enum) && property.enum.every((value) => value === null || ["string", "number", "boolean"].includes(typeof value))),
  );
}

function initialInputValues(schema) {
  return Object.fromEntries(Object.entries(schema?.properties || {}).map(([name, property]) => [
    name,
    property.type === "boolean" ? false : property.enum ? "" : "",
  ]));
}

function typedInputFromValues(schema, values) {
  const input = {};
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

function safeResultText(value) {
  try {
    const serialized = JSON.stringify(value, null, 2);
    if (typeof serialized !== "string") return "No result data was returned.";
    return serialized.length > 4_000 ? `${serialized.slice(0, 4_000)}…` : serialized;
  } catch {
    return "HEY received result data that could not be displayed safely.";
  }
}

function safeFailureText(value) {
  if (typeof value !== "string" || !value.trim()) return "HEY could not complete this tool run.";
  return value
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
  interfaceLevel,
  user,
  accountId,
  recentUsedAt,
  isFavorite,
  isPinned,
  canManagePreferences,
  onToggleFavorite,
  onTogglePin,
  onActivityChanged,
}) {
  const inputSchema = tool.inputSchema;
  const canRun = tool.status === "supported" && isSimpleInputSchema(inputSchema) && tool.permissions.length === 1;
  const permission = tool.permissions[0];
  const [runPanelOpen, setRunPanelOpen] = useState(false);
  const [inputValues, setInputValues] = useState(() => initialInputValues(inputSchema));
  const [pendingRun, setPendingRun] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [running, setRunning] = useState(false);
  const runLock = useRef(false);
  const controllerRef = useRef(null);
  const status = STATUS_DETAILS[tool.status] || STATUS_DETAILS.unsupported;
  const StatusIcon = status.Icon;
  const capabilityErrors = tool.capabilities
    .filter((capability) => capability.error)
    .map((capability) => capability.error);

  function appendDecisionAudit(requestId, decision) {
    HEY.audit.record({
      action: "tool.user_decision",
      tool: tool.name,
      riskLevel: tool.riskLevel || "low",
      status: decision,
      requestId,
      metadata: { decision, permission, accountId, actorId: accountId, source: "tool_library" },
    });
  }

  async function invokePlan(run, confirmed) {
    if (runLock.current) return;
    if (!accountId || getAccountScope() !== `account:${accountId}`) {
      appendDecisionAudit(run.requestId, "denied");
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
        platform: "web",
        user,
        requestId: run.requestId,
        confirmed,
        signal: controller.signal,
      });
      if (!response || typeof response !== "object" || typeof response.success !== "boolean" || !Array.isArray(response.results)) {
        setReceipt({ status: "error", message: "HEY could not verify the outcome. Check the destination before retrying.", requestId: run.requestId });
        setPendingRun(null);
        return;
      }
      const stepReceipt = response.results.length === 1 ? response.results[0] : null;
      if (response.status === "cancelled" && response.results.length === 0) {
        setReceipt({ status: "cancelled", message: safeFailureText(response.error || "The run was cancelled before dispatch."), requestId: run.requestId });
        setPendingRun(null);
        return;
      }
      if (!stepReceipt || typeof stepReceipt !== "object" || typeof stepReceipt.success !== "boolean" || typeof stepReceipt.status !== "string" || stepReceipt.stepId !== run.stepId || stepReceipt.toolName !== tool.name || stepReceipt.metadata?.requestId !== run.requestId) {
        setReceipt({ status: response.status === "cancelled" ? "cancelled" : "error", message: "HEY returned an incomplete or mismatched receipt. Check the destination before retrying.", requestId: run.requestId });
        setPendingRun(null);
        return;
      }
      if (stepReceipt.requiresConfirmation || stepReceipt.requiresPermission || stepReceipt.status === "permission_required") {
        setReceipt({ status: "confirmation_required", message: safeFailureText(stepReceipt.error || "Review the target and details below, then confirm before HEY runs it."), requestId: run.requestId });
        setPendingRun(run);
        return;
      }
      if (response.success && response.status === "completed" && response.completed?.length === 1 && response.completed[0] === run.stepId && stepReceipt.success && stepReceipt.status === "completed") {
        const verified = stepReceipt.result?.verified === true || stepReceipt.metadata?.verified === true;
        onActivityChanged();
        if (!verified) {
          setReceipt({ status: "unverified", message: "HEY received a successful tool response, but the result did not include verification evidence. Review it before treating the action as complete or retrying.", result: stepReceipt.result, requestId: run.requestId });
          setPendingRun(null);
          return;
        }
        setReceipt({ status: "completed", message: "HEY completed this tool run.", result: stepReceipt.result, requestId: run.requestId });
        setPendingRun(null);
        return;
      }
      const status = response.status || stepReceipt.status;
      const denied = status === "denied" || status === "restricted" || status === "unsupported";
      setReceipt({
        status: denied ? "denied" : status === "cancelled" ? "cancelled" : "error",
        message: safeFailureText(stepReceipt.error || response.error || (denied ? "HEY denied this tool run." : "HEY could not complete this tool run.")),
        requestId: run.requestId,
      });
      setPendingRun(null);
    } catch (error) {
      setReceipt({ status: controller.signal.aborted ? "cancelled" : "error", message: controller.signal.aborted ? "The run was cancelled. Check the destination before retrying if dispatch had already started." : safeFailureText(error instanceof Error ? error.message : "HEY could not create a valid tool run."), requestId: run.requestId });
      setPendingRun(null);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      runLock.current = false;
      setRunning(false);
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
      setReceipt({ status: "error", message: error instanceof Error ? error.message : "Tool input is invalid." });
      return;
    }
    const run = { input, requestId: crypto.randomUUID(), stepId: `run-${Date.now()}` };
    setReceipt(null);
    setPendingRun(run);
    if (!HEY.permissions.has(permission, "account", accountId)) {
      const request = HEY.permissions.request({
        permission,
        scope: "account",
        riskLevel: tool.riskLevel || "medium",
        reason: `Run ${tool.name} from the Tool Library.`,
      });
      if (!request || request.error) {
        setReceipt({ status: "error", message: request?.error || "HEY could not record the permission request.", requestId: run.requestId });
        setPendingRun(null);
        return;
      }
      setReceipt({ status: "authorization_required", message: `HEY needs account permission “${permission}” before this tool can run.`, requestId: run.requestId });
      return;
    }
    void invokePlan(run, false);
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
      appendDecisionAudit(pendingRun.requestId, "denied");
      setPendingRun(null);
      return;
    }
    const grant = HEY.permissions.grant(permission, "account", { source: "tool_library", tool: tool.name, requestId: pendingRun.requestId });
    if (!grant || grant.status !== "granted") {
      setReceipt({ status: "error", message: "HEY could not save this permission." });
      setPendingRun(null);
      return;
    }
    appendDecisionAudit(pendingRun.requestId, "approved");
    void invokePlan(pendingRun, false);
  }

  function revokePermission() {
    if (!accountId || getAccountScope() !== `account:${accountId}`) {
      setReceipt({ status: "denied", message: "Your signed-in account changed. No permission was revoked." });
      return;
    }
    try {
      const requestId = crypto.randomUUID();
      if (!HEY.permissions.revoke(permission, "account")) {
        setReceipt({ status: "error", message: "HEY could not revoke this permission." });
        return;
      }
      appendDecisionAudit(requestId, "revoked");
      setReceipt({ status: "revoked", message: `Account permission “${permission}” was revoked.`, requestId });
    } catch {
      setReceipt({ status: "error", message: "HEY could not revoke this permission." });
    }
  }

  function denyPendingAction() {
    if (pendingRun) appendDecisionAudit(pendingRun.requestId, "denied");
    setReceipt({ status: "denied", message: "You denied this tool run. HEY did not dispatch it.", requestId: pendingRun?.requestId });
    setPendingRun(null);
  }

  function cancelRun() {
    if (!controllerRef.current) return;
    const requestId = receipt?.requestId || pendingRun?.requestId;
    if (requestId) appendDecisionAudit(requestId, "cancel_requested");
    controllerRef.current.abort(new Error("Tool Library run cancelled by the user."));
    setReceipt({ status: "running", message: "Cancellation requested. HEY is waiting for the execution boundary to report whether dispatch occurred." });
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
      {tool.description && <p className="tool-library__description">{tool.description}</p>}
      {tool.category && <p className="tool-library__category">{tool.category}</p>}
      {interfaceLevel === "advanced" && <p className="tool-library__tool-name">{tool.name}</p>}
      <dl className="tool-library__details">
        <div><dt>Risk</dt><dd>{tool.riskLevel || "Not specified"}</dd></div>
        {interfaceLevel === "advanced" && <div><dt>Registry state</dt><dd>{tool.lifecycle}</dd></div>}
        {interfaceLevel === "advanced" && <div><dt>Lifecycle controls</dt><dd>Not declared for this tool</dd></div>}
        {tool.requiresConfirmation && <div><dt>Confirmation</dt><dd>Required before execution</dd></div>}
      </dl>
      {tool.permissions.length > 0 && (
        <div className="tool-library__meta-group">
          <h3>Permission scope</h3>
          <ul>{tool.permissions.map((permission) => <li key={permission}>{permission}</li>)}</ul>
          {accountId && HEY.permissions.has(permission, "account", accountId) && (
            <button type="button" className="tool-library__deny-button" disabled={!accountId || getAccountScope() !== `account:${accountId}`} onClick={revokePermission}>Revoke account permission</button>
          )}
        </div>
      )}
      {tool.description && (
        <details className="tool-library__advanced-details">
          <summary>Help</summary>
          <p className="tool-library__run-help">{tool.description}</p>
        </details>
      )}
      <details className="tool-library__advanced-details">
        <summary>Activity</summary>
        {recentUsedAt
          ? <p className="tool-library__run-help">Last recorded use on this device: <time dateTime={recentUsedAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(recentUsedAt))}</time>.</p>
          : <p className="tool-library__run-help">No completed use is saved for this tool on this device yet.</p>}
        <p className="tool-library__run-help">Each run also records its authorization and outcome in HEY&apos;s audit history when that service is available.</p>
      </details>
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
      {tool.permissions.length > 1 && (
        <p className="tool-library__permission-note" role="note">This tool lists multiple required permissions. HEY&apos;s current canonical tool execution path cannot authorize all of them together, so it is not runnable here.</p>
      )}
      {canRun && (
        <div className="tool-library__run-panel">
          {!runPanelOpen ? (
            <button type="button" className="tool-library__run-button" onClick={() => {
              setInputValues(initialInputValues(inputSchema));
              setReceipt(null);
              setPendingRun(null);
              setRunPanelOpen(true);
            }}>
               <Play size={15} aria-hidden="true" /> Customize and use
            </button>
          ) : (
            <form onSubmit={submitRun}>
              <div className="tool-library__run-heading">
                <h3>Run {describeName(tool.name)}</h3>
                <button type="button" className="tool-library__close-run" aria-label={`Close ${describeName(tool.name)} run form`} disabled={running} onClick={() => {
                  setRunPanelOpen(false);
                  setPendingRun(null);
                }}><X size={16} aria-hidden="true" /></button>
              </div>
              <p className="tool-library__run-help">HEY validates these inputs and checks permission and capability availability again when you run it.</p>
              {Object.entries(inputSchema.properties).map(([name, property]) => {
                const fieldId = `tool-run-${encodeURIComponent(tool.name)}-${encodeURIComponent(name)}`;
                const required = inputSchema.required.includes(name);
                const fieldLabel = `${name.replaceAll(/[_-]/g, " ")}${required ? " (required)" : ""}`;
                return (
                  <label className="tool-library__run-field" htmlFor={fieldId} key={name}>
                    <span>{fieldLabel}</span>
                    {property.enum ? (
                      <select id={fieldId} required={required} value={inputValues[name]} onChange={(event) => setInputValues((current) => ({ ...current, [name]: event.target.value }))}>
                        <option value="">Choose…</option>
                        {property.enum.map((value, index) => <option key={`${typeof value}-${String(value)}-${index}`} value={String(index)}>{String(value)}</option>)}
                      </select>
                    ) : property.type === "boolean" ? (
                      <input id={fieldId} type="checkbox" checked={inputValues[name] === true} onChange={(event) => setInputValues((current) => ({ ...current, [name]: event.target.checked }))} />
                    ) : (
                      <input id={fieldId} type={property.type === "string" ? "text" : "number"} step={property.type === "integer" ? "1" : "any"} required={required} value={inputValues[name]} onChange={(event) => setInputValues((current) => ({ ...current, [name]: event.target.value }))} />
                    )}
                    {property.description && <small>{property.description}</small>}
                  </label>
                );
              })}
              <div className="tool-library__run-actions">
                <button type="submit" className="tool-library__run-button" disabled={running || !accountId || getAccountScope() !== `account:${accountId}`}>
                  <Play size={15} aria-hidden="true" /> Run
                </button>
                {running && <button type="button" className="tool-library__deny-button" onClick={cancelRun}>Cancel</button>}
              </div>
              {!accountId && <p className="tool-library__run-help" role="note">Sign in before running this tool.</p>}
            </form>
          )}
          {receipt && (
            <div className={`tool-library__receipt tool-library__receipt--${receipt.status}`} role={["error", "denied"].includes(receipt.status) ? "alert" : "status"} aria-live="polite">
              <div className="tool-library__receipt-heading">
                {receipt.status === "completed" ? <CheckCircle2 size={16} aria-hidden="true" /> : ["error", "denied"].includes(receipt.status) ? <CircleX size={16} aria-hidden="true" /> : receipt.status === "unverified" ? <CircleHelp size={16} aria-hidden="true" /> : <LockKeyhole size={16} aria-hidden="true" />}
                <strong>{receipt.status.replaceAll("_", " ")}</strong>
              </div>
              <p>{receipt.message}</p>
              {receipt.requestId && <small>Receipt {receipt.requestId}</small>}
              {receipt.status === "authorization_required" && pendingRun && (
                <div className="tool-library__run-actions">
                  <button type="button" className="tool-library__run-button" onClick={allowPermission}>Allow account permission</button>
                  <button type="button" className="tool-library__deny-button" onClick={denyPendingAction}>Deny</button>
                </div>
              )}
              {receipt.status === "confirmation_required" && pendingRun && (
                <>
                  <p className="tool-library__run-help">Review the exact parameters before allowing this action.</p>
                  <pre className="tool-library__result">{safeResultText(pendingRun.input)}</pre>
                  <div className="tool-library__run-actions">
                    <button type="button" className="tool-library__run-button" disabled={running} onClick={() => void invokePlan(pendingRun, true)}><Check size={15} aria-hidden="true" /> Confirm and run</button>
                    <button type="button" className="tool-library__deny-button" disabled={running} onClick={denyPendingAction}>Deny</button>
                  </div>
                </>
              )}
              {["completed", "unverified"].includes(receipt.status) && receipt.result !== undefined && <pre className="tool-library__result">{safeResultText(receipt.result)}</pre>}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function ToolLibraryPage() {
  const { level: interfaceLevel } = useInterfaceLevel();
  const { user } = useAuth();
  const accountId = user?.id ? String(user.id) : null;
  const [tools, setTools] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState("all");
  const [activeCategory, setActiveCategory] = useState("all");
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

  const loadCatalog = useCallback(async () => {
    const request = ++requestRef.current;
    const requestedAccountId = accountId;
    setLoading(true);
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
      if (requestRef.current !== request) return;
      setTools(catalog.map((entry) => ({
        ...entry,
        inputSchema: HEY.tools.get(entry.name)?.metadata?.inputSchema || null,
      })));
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

  const refreshActivity = useCallback(() => {
    if (!accountId || getAccountScope() !== `account:${accountId}`) {
      setPreferenceState({ status: "account_required", accountId: null, preferences: null });
      return;
    }
    const result = HEY.tools.preferences.load();
    setPreferenceState({
      status: result.success ? "ready" : result.status,
      accountId,
      preferences: result.success ? result.preferences : null,
    });
  }, [accountId]);

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

  const filteredTools = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tools.filter((tool) => {
      const matchesCategory = activeCategory === "all" || tool.category?.toLowerCase() === activeCategory;
      const matchesQuery = !normalizedQuery || `${tool.name} ${tool.description} ${tool.category} ${tool.permissions.join(" ")} ${tool.capabilities.map((item) => item.capability || "").join(" ")}`.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, query, tools]);
  const categories = useMemo(() => [...new Set(tools.map((tool) => tool.category?.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right)), [tools]);

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
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tools or permissions" />
        </label>
        <label className="tool-library__category-filter">
          <span>Category</span>
          <select value={activeCategory} onChange={(event) => setActiveCategory(event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((category) => <option key={category} value={category.toLowerCase()}>{category}</option>)}
          </select>
        </label>
        <p>Platform: <strong>Web</strong></p>
      </div>

      <section className="tool-library__preference-panel" aria-labelledby="tool-library-views-title">
        <div className="tool-library__preference-toolbar">
          <h2 id="tool-library-views-title">Your tool views</h2>
          <div className="tool-library__view-tabs" role="group" aria-label="Filter tools">
            <button type="button" aria-pressed={displayedView === "all"} onClick={() => setActiveView("all")}>All <span>{tools.length}</span></button>
            <button type="button" aria-pressed={displayedView === "favorites"} disabled={!preferenceReady} onClick={() => setActiveView("favorites")}>Favorites <span>{preferences.favorites.length}</span></button>
            <button type="button" aria-pressed={displayedView === "pinned"} disabled={!preferenceReady} onClick={() => setActiveView("pinned")}>Pinned <span>{preferences.pinned.length}</span></button>
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
                  <span>{describeName(entry.name)}</span>
                  <time dateTime={entry.usedAt}>{formatRecentDate(entry.usedAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

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
              interfaceLevel={interfaceLevel}
              user={user}
              accountId={accountId}
              recentUsedAt={preferences.recent.find((entry) => entry.name === tool.name)?.usedAt || null}
              isFavorite={preferences.favorites.includes(tool.name)}
              isPinned={preferences.pinned.includes(tool.name)}
              canManagePreferences={preferenceReady}
              onToggleFavorite={(name) => updatePreference(name, "favorite")}
              onTogglePin={(name) => updatePreference(name, "pinned")}
              onActivityChanged={refreshActivity}
            />
          ))}
        </div>
      )}
    </section>
  );
}
