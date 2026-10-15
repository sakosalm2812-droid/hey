import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, Layers3, LoaderCircle, LockKeyhole, Plus, RotateCw, Search, Wrench, X } from "lucide-react";
import { HEY } from "./core/index.js";
import { useAuth } from "./AuthContext.jsx";
import { getAccountScope } from "./core/accountScope.js";
import { spaceMembershipMatchesAccount, spacePreviewMatchesAccount, spacesForAccount } from "./spacePageAccount.js";
import "./SpacesPage.css";

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function membershipAccountIsCurrent(accountRef, accountId, scope) {
  return accountRef.current === accountId && getAccountScope() === scope;
}

function SpaceToolMembership({ space, accountId, accountRef, tools, toolsStatus, retryTools }) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [membership, setMembership] = useState({ status: "idle", accountId: null, layout: null });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestRef = useRef(0);

  const activeScope = `account:${accountId}`;
  const currentLayout = membership.status === "ready" && membership.accountId === accountId
    ? membership.layout
    : null;
  const filteredTools = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return tools;
    return tools.filter((tool) => `${tool.name} ${tool.description} ${tool.category}`.toLocaleLowerCase().includes(normalizedQuery));
  }, [query, tools]);
  const toolGroups = useMemo(() => {
    const groups = new Map();
    for (const tool of filteredTools) {
      const category = tool.category || "general";
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(tool);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [filteredTools]);

  const loadMembership = useCallback(() => {
    const request = ++requestRef.current;
    setMembership({ status: "loading", accountId, layout: null });
    setError("");
    setNotice("");
    if (!membershipAccountIsCurrent(accountRef, accountId, activeScope)) {
      setMembership({ status: "account_required", accountId: null, layout: null });
      setError("Your account changed. Reopen this Space to load its tools.");
      return;
    }

    try {
      const result = HEY.spaces.getLayoutPreferences(space.id);
      if (requestRef.current !== request || !membershipAccountIsCurrent(accountRef, accountId, activeScope)) return;
      if (!spaceMembershipMatchesAccount(result, accountId, getAccountScope(), space.id)) {
        setMembership({ status: "error", accountId, layout: null });
        setError(result?.error || "Tools in this Space could not be loaded. Try again.");
        return;
      }
      setMembership({ status: "ready", accountId, layout: result });
    } catch {
      if (requestRef.current === request && membershipAccountIsCurrent(accountRef, accountId, activeScope)) {
        setMembership({ status: "error", accountId, layout: null });
        setError("Tools in this Space could not be loaded. Try again.");
      }
    }
  }, [accountId, accountRef, activeScope, space.id]);

  function toggleMembership(toolName, member) {
    if (!currentLayout || !membershipAccountIsCurrent(accountRef, accountId, activeScope)) {
      setError("Your account changed. Reload this Space before updating membership.");
      return;
    }
    setError("");
    setNotice("");
    try {
      const result = HEY.spaces.setToolMembership({
        accountScope: activeScope,
        spaceId: space.id,
        toolName,
        member,
        expectedRevision: currentLayout.revision,
      });
      if (!membershipAccountIsCurrent(accountRef, accountId, activeScope)) return;
      if (!spaceMembershipMatchesAccount(result, accountId, getAccountScope(), space.id)) {
        if (result?.code === "stale_revision" && spaceMembershipMatchesAccount(result.current, accountId, getAccountScope(), space.id)) {
          setMembership({ status: "ready", accountId, layout: result.current });
          setError("This Space changed while you were editing. Its current membership is shown; try again.");
        } else {
          setError(result?.error || "Membership could not be updated. Try again.");
        }
        return;
      }
      setMembership({ status: "ready", accountId, layout: result });
      if (result.changed) setNotice(member ? "Tool added to this Space." : "Tool removed from this Space.");
    } catch {
      if (membershipAccountIsCurrent(accountRef, accountId, activeScope)) setError("Membership could not be updated. Try again.");
    }
  }

  const controlId = `space-tools-${encodeURIComponent(space.id)}`;
  const searchId = `${controlId}-search`;
  const membershipLoading = membership.status === "loading" && membership.accountId === accountId;
  const membershipError = membership.status === "error" || membership.status === "account_required";

  return (
    <div className="spaces-page__membership">
      <button
        type="button"
        className="spaces-page__membership-toggle"
        aria-expanded={expanded}
        aria-controls={controlId}
        onClick={() => {
          const nextExpanded = !expanded;
          setExpanded(nextExpanded);
          if (nextExpanded && (membership.status === "idle" || membership.status === "error" || membership.status === "account_required")) loadMembership();
        }}
      >
        <Wrench size={16} aria-hidden="true" />
        {expanded ? "Hide tools" : `Manage tools${currentLayout ? ` (${currentLayout.toolIds.length})` : ""}`}
      </button>

      {expanded && (
        <section id={controlId} className="spaces-page__membership-panel" aria-label={`Tools in ${space.name}`}>
          <p className="spaces-page__membership-note" role="note">
            Tool membership organizes this Space. It does not grant permission or make a tool executable.
          </p>
          {membershipLoading && <p className="spaces-page__status" role="status"><LoaderCircle size={16} className="spaces-page__spin" aria-hidden="true" /> Loading this Space&apos;s tools…</p>}
          {membershipError && <div className="spaces-page__message spaces-page__message--error" role="alert"><AlertCircle size={17} aria-hidden="true" /><p>{error || "Tools in this Space could not be loaded."}</p><button type="button" className="spaces-page__secondary" onClick={loadMembership}><RotateCw size={14} aria-hidden="true" /> Retry</button></div>}
          {!membershipLoading && !membershipError && toolsStatus === "loading" && <p className="spaces-page__status" role="status"><LoaderCircle size={16} className="spaces-page__spin" aria-hidden="true" /> Loading registered tools…</p>}
          {!membershipLoading && !membershipError && toolsStatus === "error" && <div className="spaces-page__message spaces-page__message--error" role="alert"><AlertCircle size={17} aria-hidden="true" /><p>Registered tools could not be loaded.</p><button type="button" className="spaces-page__secondary" onClick={retryTools}><RotateCw size={14} aria-hidden="true" /> Retry</button></div>}
          {!membershipLoading && !membershipError && toolsStatus === "ready" && tools.length === 0 && <p className="spaces-page__empty-membership" role="status">No registered tools are available to add yet.</p>}
          {currentLayout && toolsStatus === "ready" && tools.length > 0 && (
            <>
              <label className="spaces-page__tool-search" htmlFor={searchId}>
                <Search size={16} aria-hidden="true" />
                <span className="spaces-page__sr-only">Search registered tools for {space.name}</span>
                <input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tools by name or category" />
              </label>
              {toolGroups.length === 0 && <p className="spaces-page__empty-membership" role="status">No registered tools match “{query}”.</p>}
              <div className="spaces-page__tool-categories">
                {toolGroups.map(([category, categoryTools]) => (
                  <fieldset className="spaces-page__tool-category" key={category}>
                    <legend>{category}</legend>
                    {categoryTools.map((tool) => (
                      <label className="spaces-page__tool-option" key={tool.name}>
                        <input
                          type="checkbox"
                          checked={currentLayout.toolIds.includes(tool.name)}
                          disabled={membership.accountId !== accountId}
                          onChange={(event) => toggleMembership(tool.name, event.target.checked)}
                        />
                        <span><strong>{tool.name}</strong><small>{tool.description || "Registered tool"}</small></span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
            </>
          )}
          {error && !membershipError && <p className="spaces-page__membership-error" role="alert">{error}</p>}
          {notice && <p className="spaces-page__notice" role="status"><Check size={15} aria-hidden="true" /> {notice}</p>}
        </section>
      )}
    </div>
  );
}

export default function SpacesPage() {
  const { user } = useAuth();
  const accountId = user?.id || "";
  const accountRef = useRef(accountId);
  useLayoutEffect(() => {
    accountRef.current = accountId;
  }, [accountId]);

  const [spaces, setSpaces] = useState([]);
  const [loadedAccountId, setLoadedAccountId] = useState("");
  const [toolCatalog, setToolCatalog] = useState([]);
  const [toolCatalogAccountId, setToolCatalogAccountId] = useState("");
  const [toolCatalogStatus, setToolCatalogStatus] = useState("loading");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [creating, setCreating] = useState(false);
  const [creationPhase, setCreationPhase] = useState("");
  const [notice, setNotice] = useState("");

  const refreshSpaces = useCallback(() => {
    if (accountRef.current !== accountId) return false;
    try {
      const nextSpaces = HEY.spaces.getPrivateSpaces();
      if (!Array.isArray(nextSpaces)) throw new TypeError("Invalid Spaces response");
      setSpaces(spacesForAccount(nextSpaces, accountId));
      setLoadedAccountId(accountId);
      setLoadError("");
      return true;
    } catch {
      setSpaces([]);
      setLoadedAccountId(accountId);
      setLoadError("Your Spaces could not be loaded. Try again.");
      return false;
    }
  }, [accountId]);

  const loadToolCatalog = useCallback(async () => {
    const requestedAccountId = accountId;
    setToolCatalogStatus("loading");
    setToolCatalogAccountId("");
    setToolCatalog([]);
    await Promise.resolve();
    if (!requestedAccountId || accountRef.current !== requestedAccountId || getAccountScope() !== `account:${requestedAccountId}`) return;
    try {
      const catalog = HEY.tools.catalog({ platform: "web" });
      if (!Array.isArray(catalog)) throw new TypeError("Invalid tool catalog response");
      if (accountRef.current !== requestedAccountId || getAccountScope() !== `account:${requestedAccountId}`) return;
      setToolCatalog(catalog.filter((tool) => tool && typeof tool.name === "string"));
      setToolCatalogAccountId(requestedAccountId);
      setToolCatalogStatus("ready");
    } catch {
      if (accountRef.current === requestedAccountId && getAccountScope() === `account:${requestedAccountId}`) {
        setToolCatalog([]);
        setToolCatalogAccountId(requestedAccountId);
        setToolCatalogStatus("error");
      }
    }
  }, [accountId]);

  const loadSpaces = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    await Promise.resolve();
    if (accountRef.current !== accountId) return;
    refreshSpaces();
    setLoading(false);
  }, [accountId, refreshSpaces]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    setSpaces([]);
    setToolCatalog([]);
    setToolCatalogAccountId("");
    setToolCatalogStatus("loading");
    setPrompt("");
    setPreview(null);
    setPreviewError("");
    setNotice("");
    setCreating(false);
    setCreationPhase("");

    const refreshCurrentAccount = () => {
      if (active) refreshSpaces();
    };
    let unsubscribe = () => {};
    try {
      HEY.initialize();
      unsubscribe = HEY.spaces.subscribe(refreshCurrentAccount);
    } catch {
      // Initial loading below still shows an actionable retry if listing fails.
    }
    loadToolCatalog();
    Promise.resolve().then(() => {
      if (!active) return;
      refreshSpaces();
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [accountId, loadToolCatalog, refreshSpaces]);

  const createPreview = async (event) => {
    event.preventDefault();
    if (!accountId || accountRef.current !== accountId || creating) return;
    setPreview(null);
    setPreviewError("");
    setNotice("");
    setCreating(true);
    setCreationPhase("preview");
    await Promise.resolve();
    if (accountRef.current !== accountId) {
      setCreating(false);
      setCreationPhase("");
      return;
    }
    try {
      const result = HEY.spaces.previewNaturalLanguageCreation({ prompt });
      if (accountRef.current !== accountId) return;
      if (!result || result.error || result.action !== "create_private_space" || result.requiresConfirmation !== true || result.permissionsChanged !== false || result.space?.visibility !== "private" || result.space?.sharing !== "off" || typeof result.previewId !== "string" || typeof result.space?.name !== "string") {
        setPreviewError(result?.error || "A safe preview could not be created. Check the description and try again.");
        return;
      }
      setPreview({ ...result, accountId });
    } catch {
      setPreviewError("A safe preview could not be created. Try again.");
    } finally {
      if (accountRef.current === accountId) {
        setCreating(false);
        setCreationPhase("");
      }
    }
  };

  const confirmPreview = async () => {
    if (!spacePreviewMatchesAccount(preview, accountId, accountRef.current) || creating) return;
    const pending = preview;
    setCreating(true);
    setCreationPhase("confirm");
    setPreviewError("");
    setNotice("");
    await Promise.resolve();
    if (!spacePreviewMatchesAccount(pending, accountId, accountRef.current)) {
      setCreating(false);
      setCreationPhase("");
      setPreview(null);
      return;
    }
    try {
      const result = HEY.spaces.confirmNaturalLanguageCreation({ previewId: pending.previewId, confirm: true });
      if (accountRef.current !== accountId) return;
      if (!result?.success || !result.space?.id || result.space.accountScope !== `account:${accountId}`) {
        setPreviewError(result?.error || "The Space was not created. Review the description and try again.");
        setPreview(null);
        return;
      }
      setPreview(null);
      setPrompt("");
      refreshSpaces();
      setNotice(`Created “${result.space.name}”.`);
    } catch {
      if (accountRef.current === accountId) {
        setPreview(null);
        setPreviewError("The Space could not be created. Create a fresh preview and try again.");
      }
    } finally {
      if (accountRef.current === accountId) {
        setCreating(false);
        setCreationPhase("");
      }
    }
  };

  const cancelPreview = () => {
    setPreview(null);
    setPreviewError("");
    setNotice("");
  };

  const accountDataLoading = loading || loadedAccountId !== accountId;
  const currentSpaces = loadedAccountId === accountId ? spaces : [];

  return (
    <section className="spaces-page" aria-labelledby="spaces-title">
      <header className="spaces-page__header">
        <div>
          <p className="spaces-page__eyebrow">Your private workspace</p>
          <h1 id="spaces-title">Spaces</h1>
          <p className="spaces-page__intro">Create a private Space from a short description. HEY shows exactly what it will create before you confirm.</p>
        </div>
        <span className="spaces-page__privacy"><LockKeyhole size={15} aria-hidden="true" /> Private by default</span>
      </header>

      <form className="spaces-page__create" onSubmit={createPreview}>
        <label htmlFor="space-prompt">What should this Space be for?</label>
        <p id="space-prompt-help" className="spaces-page__hint">For example: “Create a private space called Weekend planning”</p>
        <textarea
          id="space-prompt"
          aria-describedby="space-prompt-help"
          value={prompt}
          onChange={(event) => { setPrompt(event.target.value); setPreview(null); setPreviewError(""); }}
          maxLength={HEY.spaces.limits.maxPromptLength}
          rows={3}
          placeholder="Create a private space called…"
          disabled={creating || !accountId}
          required
        />
        <div className="spaces-page__form-footer">
          <span>{prompt.length}/{HEY.spaces.limits.maxPromptLength}</span>
          <button type="submit" className="spaces-page__primary" disabled={creating || loading || !accountId || !prompt.trim()}>
            {creating ? <LoaderCircle size={17} className="spaces-page__spin" aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
            Preview Space
          </button>
        </div>
      </form>

      {creating && <p className="spaces-page__status" role="status" aria-live="polite">{creationPhase === "confirm" ? "Creating your private Space…" : "Preparing your preview…"}</p>}

      {preview && preview.accountId === accountId && (
        <section className="spaces-page__preview" aria-labelledby="space-preview-title" aria-live="polite">
          <div className="spaces-page__preview-heading">
            <div><p className="spaces-page__eyebrow">Review before creating</p><h2 id="space-preview-title">Space preview</h2></div>
            <button type="button" className="spaces-page__icon-button" onClick={cancelPreview} disabled={creating} aria-label="Cancel Space preview"><X size={18} /></button>
          </div>
          <dl className="spaces-page__preview-details">
            <div><dt>Name</dt><dd>{preview.space.name}</dd></div>
            <div><dt>Visibility</dt><dd>Private</dd></div>
            <div><dt>Sharing</dt><dd>Off</dd></div>
            <div><dt>Permissions</dt><dd>Unchanged</dd></div>
          </dl>
          <p className="spaces-page__effect"><LockKeyhole size={15} aria-hidden="true" /> {preview.effects?.[0] || "Create one private Space in this account"}</p>
          <div className="spaces-page__actions">
            <button type="button" className="spaces-page__secondary" onClick={cancelPreview} disabled={creating}>Cancel</button>
            <button type="button" className="spaces-page__primary" onClick={confirmPreview} disabled={creating || preview.accountId !== accountId}>
              <Check size={17} aria-hidden="true" /> Confirm and create
            </button>
          </div>
        </section>
      )}

      {previewError && <p className="spaces-page__alert" role="alert"><AlertCircle size={17} aria-hidden="true" /> {previewError}</p>}
      {notice && <p className="spaces-page__notice" role="status"><Check size={17} aria-hidden="true" /> {notice}</p>}

      <section className="spaces-page__list-section" aria-labelledby="spaces-list-title">
        <div className="spaces-page__list-heading"><div><h2 id="spaces-list-title">Your Spaces</h2><p>Only Spaces saved to the signed-in account appear here.</p></div>
          {!accountDataLoading && !loadError && <span className="spaces-page__count" aria-live="polite">{currentSpaces.length} {currentSpaces.length === 1 ? "Space" : "Spaces"}</span>}
        </div>
        {accountDataLoading && <p className="spaces-page__status" role="status" aria-live="polite"><LoaderCircle size={18} className="spaces-page__spin" aria-hidden="true" /> Loading your Spaces…</p>}
        {!accountDataLoading && loadError && <div className="spaces-page__message spaces-page__message--error" role="alert"><AlertCircle size={19} aria-hidden="true" /><p>{loadError}</p><button type="button" className="spaces-page__secondary" onClick={loadSpaces}><RotateCw size={15} aria-hidden="true" /> Try again</button></div>}
        {!accountDataLoading && !loadError && currentSpaces.length === 0 && <div className="spaces-page__empty" role="status"><Layers3 size={23} aria-hidden="true" /><div><h3>No Spaces yet</h3><p>Describe a Space above to see a preview before you create it.</p></div></div>}
        {!accountDataLoading && !loadError && currentSpaces.length > 0 && <ul className="spaces-page__list">{currentSpaces.map((space) => <li className="spaces-page__card" key={space.id}>
          <div className="spaces-page__card-icon" aria-hidden="true"><Layers3 size={18} /></div>
          <div className="spaces-page__card-copy"><h3>{space.name}</h3><p>{space.description || "Private Space"}</p></div>
          <span className="spaces-page__private-label"><LockKeyhole size={13} aria-hidden="true" /> Private</span>
          <time dateTime={space.createdAt}>{formatDate(space.createdAt)}</time>
          <SpaceToolMembership
            space={space}
            accountId={accountId}
            accountRef={accountRef}
            tools={toolCatalogAccountId === accountId ? toolCatalog : []}
            toolsStatus={toolCatalogAccountId === accountId ? toolCatalogStatus : "loading"}
            retryTools={loadToolCatalog}
          />
        </li>)}</ul>}
      </section>
    </section>
  );
}
