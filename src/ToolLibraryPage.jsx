import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, CircleHelp, LockKeyhole, Search, ShieldAlert, Wrench } from "lucide-react";
import { HEY } from "./core/index.js";
import { useInterfaceLevel } from "./context/InterfaceLevelContext.jsx";
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

function ToolCard({ tool, interfaceLevel }) {
  const status = STATUS_DETAILS[tool.status] || STATUS_DETAILS.unsupported;
  const StatusIcon = status.Icon;
  const capabilityErrors = tool.capabilities
    .filter((capability) => capability.error)
    .map((capability) => capability.error);

  return (
    <article className="tool-library__card" aria-labelledby={`tool-${encodeURIComponent(tool.name)}`}>
      <div className="tool-library__card-heading">
        <div className="tool-library__tool-icon" aria-hidden="true"><Wrench size={18} /></div>
        <span className={`tool-library__status ${status.className}`}>
          <StatusIcon size={14} aria-hidden="true" />
          {status.label}
        </span>
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
  const [tools, setTools] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Let the loading state render before catalog discovery runs.
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      HEY.initialize();
      const catalog = HEY.tools.catalog({ platform: "web" });
      if (!Array.isArray(catalog)) throw new TypeError("Tool catalog returned an invalid response.");
      setTools(catalog);
    } catch {
      setError("The tool catalog could not be loaded. Try again in a moment.");
      setTools([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const filteredTools = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return tools;
    return tools.filter((tool) => `${tool.name} ${tool.permissions.join(" ")} ${tool.capabilities.map((item) => item.capability || "").join(" ")}`.toLowerCase().includes(normalizedQuery));
  }, [query, tools]);

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

      {!loading && !error && tools.length > 0 && filteredTools.length === 0 && (
        <div className="tool-library__message" role="status"><p>No tools match “{query}”. Try a different search.</p></div>
      )}

      {!loading && !error && filteredTools.length > 0 && (
        <div className="tool-library__grid">
          {filteredTools.map((tool) => <ToolCard key={tool.name} tool={tool} interfaceLevel={interfaceLevel} />)}
        </div>
      )}
    </section>
  );
}
