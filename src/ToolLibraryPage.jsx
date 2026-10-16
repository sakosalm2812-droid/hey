import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CircleHelp, LockKeyhole, Pin, Search, ShieldAlert, Star, Wrench } from "lucide-react";
import { HEY } from "./core/index.js";
import { useInterfaceLevel } from "./context/InterfaceLevelContext.jsx";
import { useAuth } from "./AuthContext.jsx";
import { getAccountScope } from "./core/accountScope.js";
import { getToolLibraryPreferenceView } from "./lib/toolLibraryPreferenceView.js";
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
  isFavorite,
  isPinned,
  canManagePreferences,
  onToggleFavorite,
  onTogglePin,
}) {
  const status = STATUS_DETAILS[tool.status] || STATUS_DETAILS.unsupported;
  const StatusIcon = status.Icon;
  const capabilityErrors = tool.capabilities
    .filter((capability) => capability.error)
    .map((capability) => capability.error);

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

  const filteredTools = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return tools;
    return tools.filter((tool) => `${tool.name} ${tool.permissions.join(" ")} ${tool.capabilities.map((item) => item.capability || "").join(" ")}`.toLowerCase().includes(normalizedQuery));
  }, [query, tools]);

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
        <p>Platform: <strong>Web</strong></p>
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
