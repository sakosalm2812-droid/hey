import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Archive, Check, Download, FileUp, Layers3, LoaderCircle, LockKeyhole, Plus, RotateCcw, RotateCw, Search, Trash2, Wrench, X } from "lucide-react";
import { HEY } from "./core/index.js";
import { useAuth } from "./AuthContext.jsx";
import { getAccountScope } from "./core/accountScope.js";
import { spaceMembershipMatchesAccount, spaceMembershipRetryMatches, spacePreviewMatchesAccount, spacesForAccount } from "./spacePageAccount.js";
import { spaceDetailsFromRecord, spaceDetailsMatchAccount } from "./spacePageDetails.js";
import { parseSpacePreferenceDraft, spacePreferencesMatchAccount } from "./spacePagePreferences.js";
import { confirmSpaceLifecycle, prepareSpaceLifecycle, spaceLifecycleFromRecord } from "./spacePageLifecycle.js";
import "./SpacesPage.css";

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function SpaceLifecycleControl({ space, accountId, accountRef, accountIsCurrent, refreshSpaces }) {
  const [preview, setPreview] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const activeScope = `account:${accountId}`;
  const lifecycle = spaceLifecycleFromRecord(space, accountId);
  const controlId = `space-lifecycle-${encodeURIComponent(space.id)}`;

  useEffect(() => {
    setPreview(null);
    setConflict(null);
    setAction("");
    setBusy(false);
    setError("");
    setNotice("");
  }, [accountId, space.id]);

  async function prepare(actionToPrepare = lifecycle?.status === "archived" ? "restore" : "archive") {
    if (!lifecycle || !accountIsCurrent || busy) return;
    setBusy(true);
    setPreview(null);
    setConflict(null);
    setError("");
    setNotice("");
    setAction(actionToPrepare);
    await Promise.resolve();
    if (accountRef.current !== accountId || getAccountScope() !== activeScope) {
      setBusy(false);
      setError("Your account changed. Reload this Space before continuing.");
      return;
    }
    try {
      const result = prepareSpaceLifecycle({ api: HEY.spaces, accountId, accountScope: getAccountScope(), spaceId: space.id, action: actionToPrepare });
      if (accountRef.current !== accountId || getAccountScope() !== activeScope) return;
      if (result.conflict) {
        setConflict(result.conflict);
        refreshSpaces();
      }
      if (result.error) setError(result.error);
      if (result.preview) setPreview({ ...result.preview, accountId });
    } catch {
      if (accountRef.current === accountId && getAccountScope() === activeScope) setError("A current Space status review could not be prepared. Reload and try again.");
    } finally {
      if (accountRef.current === accountId && getAccountScope() === activeScope) setBusy(false);
    }
  }

  async function confirm() {
    if (!preview || preview.accountId !== accountId || !accountIsCurrent || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    await Promise.resolve();
    if (accountRef.current !== accountId || getAccountScope() !== activeScope) {
      setBusy(false);
      setPreview(null);
      setError("Your account changed. This confirmation is no longer valid.");
      return;
    }
    try {
      const result = confirmSpaceLifecycle({ api: HEY.spaces, accountId, accountScope: getAccountScope(), spaceId: space.id, previewId: preview.previewId, action: preview.action });
      if (accountRef.current !== accountId || getAccountScope() !== activeScope) return;
      setPreview(null);
      if (result.conflict) {
        setConflict(result.conflict);
        refreshSpaces();
      }
      if (!result.success) setError(result.error || "The Space status could not be changed. Review the latest status and try again.");
      else {
        refreshSpaces();
        setNotice(`${result.status === "archived" ? "Archived" : "Restored"} “${space.name}”. Private data and permissions were preserved.`);
      }
    } catch {
      if (accountRef.current === accountId && getAccountScope() === activeScope) {
        setPreview(null);
        setError("The Space status could not be changed. Review the latest status and try again.");
      }
    } finally {
      if (accountRef.current === accountId && getAccountScope() === activeScope) setBusy(false);
    }
  }

  if (!lifecycle) return <p className="spaces-page__lifecycle-error" role="alert">Space status is unavailable. Reload your Spaces before changing it.</p>;
  return <div className="spaces-page__lifecycle">
    <span className={`spaces-page__lifecycle-status spaces-page__lifecycle-status--${lifecycle.status}`} role="status">
      {lifecycle.status === "archived" ? "Archived" : "Active"} · revision {lifecycle.revision}
    </span>
    <button type="button" className="spaces-page__secondary" onClick={() => prepare()} disabled={!accountIsCurrent || busy}>
      {busy ? <LoaderCircle size={15} className="spaces-page__spin" aria-hidden="true" /> : lifecycle.status === "archived" ? <RotateCcw size={15} aria-hidden="true" /> : <Archive size={15} aria-hidden="true" />}
      {lifecycle.status === "archived" ? "Restore Space" : "Archive Space"}
    </button>
    {(preview || conflict || error || notice) && <section id={controlId} className="spaces-page__lifecycle-panel" aria-label={`Space archive and restore for ${space.name}`} role="region" aria-live="polite">
      {preview && <>
        <h4 id={`${controlId}-review-title`}>{preview.action === "archive_private_space" ? "Review archiving this Space" : "Review restoring this Space"}</h4>
        <p>{preview.effects?.[0]}</p>
        <p>Private content, saved details, layout, and tool selections are preserved. Access permissions will not change.</p>
        <div className="spaces-page__actions">
          <button type="button" className="spaces-page__secondary" onClick={() => setPreview(null)} disabled={busy}>Cancel</button>
          <button type="button" className="spaces-page__primary" onClick={confirm} disabled={busy || preview.accountId !== accountId || !accountIsCurrent}>
            <Check size={15} aria-hidden="true" /> Confirm {preview.targetStatus === "archived" ? "archive" : "restore"}
          </button>
        </div>
      </>}
      {conflict && <div className="spaces-page__lifecycle-conflict" role="alert">
        <p>This Space is now <strong>{conflict.status}</strong> at lifecycle revision {conflict.revision}. Review the latest status before continuing.</p>
        {conflict.status === (action === "archive" ? "archived" : "active")
          ? <button type="button" className="spaces-page__secondary" onClick={() => { setConflict(null); setError(""); setNotice(`The latest status is already ${conflict.status}.`); }} disabled={busy}>Use latest status</button>
          : <button type="button" className="spaces-page__secondary" onClick={() => prepare(action)} disabled={busy || !accountIsCurrent}><RotateCw size={14} aria-hidden="true" /> Review latest and prepare again</button>}
      </div>}
      {error && !conflict && <p className="spaces-page__membership-error" role="alert">{error}</p>}
      {notice && <p className="spaces-page__notice" role="status"><Check size={15} aria-hidden="true" /> {notice}</p>}
    </section>}
  </div>;
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
  const [retryMembership, setRetryMembership] = useState(null);
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
    setRetryMembership(null);
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
          setRetryMembership({ accountId, accountScope: activeScope, spaceId: space.id, toolName, member, expectedRevision: result.current.revision });
          setError("This Space changed while you were editing. Review its current tool selections before retrying your change.");
        } else {
          setRetryMembership(null);
          setError(result?.error || "Membership could not be updated. Try again.");
        }
        return;
      }
      setRetryMembership(null);
      setMembership({ status: "ready", accountId, layout: result });
      if (result.changed) setNotice(member ? "Tool added to this Space." : "Tool removed from this Space.");
    } catch {
      if (membershipAccountIsCurrent(accountRef, accountId, activeScope)) {
        setRetryMembership(null);
        setError("Membership could not be updated. Try again.");
      }
    }
  }

  function retryConflictedMembership() {
    if (!spaceMembershipRetryMatches(retryMembership, currentLayout, accountId, getAccountScope(), accountRef.current, space.id)) {
      setRetryMembership(null);
      setError("This Space or account changed again. Reload its tools before retrying.");
      loadMembership();
      return;
    }
    toggleMembership(retryMembership.toolName, retryMembership.member);
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
          {membershipError && <div className="spaces-page__message spaces-page__message--error" role="alert"><AlertCircle size={17} aria-hidden="true" /><p>{error || "Tools in this Space could not be loaded."}</p><button type="button" className="spaces-page__secondary" onClick={loadMembership}><RotateCw size={14} aria-hidden="true" /> Reload tools</button></div>}
          {error && retryMembership && currentLayout && <div className="spaces-page__message spaces-page__message--error" role="alert"><p>Your latest selections are shown above. Retry the same change on revision {currentLayout.revision}?</p><button type="button" className="spaces-page__secondary" onClick={retryConflictedMembership} disabled={getAccountScope() !== activeScope}><RotateCw size={14} aria-hidden="true" /> Retry my change</button></div>}
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
          {error && !retryMembership && !membershipError && <p className="spaces-page__membership-error" role="alert">{error}</p>}
          {notice && <p className="spaces-page__notice" role="status"><Check size={15} aria-hidden="true" /> {notice}</p>}
        </section>
      )}
    </div>
  );
}

const EMPTY_SPACE_PREFERENCE_DRAFT = Object.freeze({ favoriteToolIds: "", widgetIds: "", shortcutIds: "" });
const SPACE_PREFERENCE_FIELDS = Object.freeze([
  ["favoriteToolIds", "Favorite tool IDs", "Registered tool IDs to highlight in this Space."],
  ["widgetIds", "Widget IDs", "Saved widget IDs for this Space."],
  ["shortcutIds", "Shortcut IDs", "Saved shortcut IDs for this Space."],
]);

function preferenceDraftFrom(snapshot) {
  return {
    favoriteToolIds: snapshot.favoriteToolIds.join("\n"),
    widgetIds: snapshot.widgetIds.join("\n"),
    shortcutIds: snapshot.shortcutIds.join("\n"),
  };
}

function SpaceDetailsEditor({ space, accountId, accountRef, accountIsCurrent }) {
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState(null);
  const [draft, setDraft] = useState({ name: "", description: "" });
  const [conflict, setConflict] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const activeScope = `account:${accountId}`;
  const editorId = `space-details-${encodeURIComponent(space.id)}`;

  useEffect(() => {
    setExpanded(false);
    setDetails(null);
    setDraft({ name: "", description: "" });
    setConflict(null);
    setLoading(false);
    setSaving(false);
    setError("");
    setNotice("");
  }, [accountId, space.id]);

  function acceptDetails(snapshot, { replaceDraft = true } = {}) {
    setDetails(snapshot);
    if (replaceDraft) setDraft({ name: snapshot.name, description: snapshot.description });
    setConflict(null);
  }

  async function loadDetails() {
    setLoading(true);
    setError("");
    setNotice("");
    setConflict(null);
    await Promise.resolve();
    if (accountRef.current !== accountId || getAccountScope() !== activeScope) {
      setLoading(false);
      setError("Your account changed. Reopen this Space before editing its details.");
      return;
    }
    try {
      const records = HEY.spaces.getPrivateSpaces();
      if (accountRef.current !== accountId || getAccountScope() !== activeScope) return;
      const record = Array.isArray(records) ? records.find((item) => item?.id === space.id && item?.accountScope === activeScope) : null;
      const snapshot = spaceDetailsFromRecord(record, accountId);
      if (!snapshot) {
        setError("Current Space details could not be loaded. Try again.");
        return;
      }
      acceptDetails(snapshot);
    } catch {
      if (accountRef.current === accountId && getAccountScope() === activeScope) setError("Current Space details could not be loaded. Try again.");
    } finally {
      if (accountRef.current === accountId && getAccountScope() === activeScope) setLoading(false);
    }
  }

  async function saveDetails(event) {
    event.preventDefault();
    if (!details || conflict || saving || !accountIsCurrent) return;
    if (!spaceDetailsMatchAccount(details, accountId, getAccountScope(), space.id)) {
      setError("Your account or Space changed. Reload its details before saving.");
      return;
    }
    const patch = {};
    if (draft.name !== details.name) patch.name = draft.name.trim();
    if (draft.description !== details.description) patch.description = draft.description;
    if (!Object.keys(patch).length) {
      setNotice("There are no detail changes to save.");
      setError("");
      return;
    }
    if (!patch.name && Object.hasOwn(patch, "name")) {
      setError("Enter a Space name before saving.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const records = HEY.spaces.getPrivateSpaces();
      if (accountRef.current !== accountId || getAccountScope() !== activeScope) return;
      const record = Array.isArray(records) ? records.find((item) => item?.id === space.id && item?.accountScope === activeScope) : null;
      const latest = spaceDetailsFromRecord(record, accountId);
      if (!latest) {
        setError("Current Space details could not be refreshed. Reload and try again.");
        return;
      }
      if (latest.revision !== details.revision || latest.name !== details.name || latest.description !== details.description) {
        setConflict(latest);
        setError("These Space details changed elsewhere. Review the latest values before saving again.");
        return;
      }
      const result = HEY.spaces.updateDetails({
        accountScope: activeScope,
        spaceId: space.id,
        expectedRevision: latest.revision,
        ...patch,
      });
      if (accountRef.current !== accountId || getAccountScope() !== activeScope) return;
      if (result?.code === "stale_revision" && spaceDetailsMatchAccount(result.current, accountId, getAccountScope(), space.id)) {
        setConflict(result.current);
        setError("These Space details changed while saving. Review the latest values before saving again.");
        return;
      }
      const saved = result?.success === true ? { accountScope: result.accountScope, spaceId: result.spaceId, revision: result.revision, name: result.name, description: result.description } : null;
      if (!spaceDetailsMatchAccount(saved, accountId, getAccountScope(), space.id)) {
        setError(result?.error || "Space details were not saved. Reload and try again.");
        return;
      }
      acceptDetails(saved);
      setNotice(`Saved Space details at revision ${saved.revision}.`);
    } catch {
      if (accountRef.current === accountId && getAccountScope() === activeScope) setError("Space details were not saved. Reload and try again.");
    } finally {
      if (accountRef.current === accountId && getAccountScope() === activeScope) setSaving(false);
    }
  }

  return <div className="spaces-page__details-editor">
    <button type="button" className="spaces-page__membership-toggle" aria-expanded={expanded} aria-controls={editorId} onClick={() => {
      const nextExpanded = !expanded;
      setExpanded(nextExpanded);
      if (nextExpanded && !details && !loading) loadDetails();
    }}>
      {expanded ? "Hide details" : "Edit Space details"}
    </button>
    {expanded && <section id={editorId} className="spaces-page__details-panel" aria-label={`Details for ${space.name}`}>
      <p className="spaces-page__membership-note">Edit this private Space&apos;s name and description. Changes are saved only when you select Save details.</p>
      {loading && <p className="spaces-page__status" role="status"><LoaderCircle size={16} className="spaces-page__spin" aria-hidden="true" /> Loading current Space details…</p>}
      {details && !loading && <form onSubmit={saveDetails}>
        <div className="spaces-page__preference-fields">
          <div className="spaces-page__preference-field"><label htmlFor={`${editorId}-name`}>Space name</label><p id={`${editorId}-name-help`}>A private name for this Space.</p><input id={`${editorId}-name`} aria-describedby={`${editorId}-name-help`} value={draft.name} maxLength={HEY.spaces.limits.maxNameLength} disabled={saving || !accountIsCurrent} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></div>
          <div className="spaces-page__preference-field"><label htmlFor={`${editorId}-description`}>Description</label><p id={`${editorId}-description-help`}>Optional context, up to 240 characters.</p><textarea id={`${editorId}-description`} aria-describedby={`${editorId}-description-help`} value={draft.description} rows={3} maxLength={240} disabled={saving || !accountIsCurrent} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></div>
        </div>
        {conflict && <div className="spaces-page__preference-conflict" role="alert">
          <p>Latest saved revision: {conflict.revision}. Review the current values against your draft before saving again.</p>
          <p><strong>Space name:</strong> {conflict.name}</p><p><strong>Description:</strong> {conflict.description || "None"}</p>
          <div className="spaces-page__actions">
            <button type="button" className="spaces-page__secondary" onClick={() => { acceptDetails(conflict); setError(""); setNotice("Loaded the latest details; your draft was discarded."); }}>Load latest and discard my draft</button>
            <button type="button" className="spaces-page__secondary" onClick={() => { acceptDetails(conflict, { replaceDraft: false }); setError(""); setNotice(`Latest revision ${conflict.revision} loaded. Review your draft and save it when ready.`); }}>Keep my draft and review latest</button>
          </div>
        </div>}
        {error && !conflict && <p className="spaces-page__membership-error" role="alert">{error}</p>}
        {notice && <p className="spaces-page__notice" role="status"><Check size={15} aria-hidden="true" /> {notice}</p>}
        <div className="spaces-page__actions">
          <button type="button" className="spaces-page__secondary" onClick={loadDetails} disabled={saving || loading}>Discard draft and reload</button>
          <button type="submit" className="spaces-page__primary" disabled={saving || loading || Boolean(conflict) || !accountIsCurrent}>
            {saving ? <LoaderCircle size={15} className="spaces-page__spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} Save details
          </button>
        </div>
        <p className="spaces-page__preference-revision">Editing revision {details.revision}</p>
      </form>}
      {!details && !loading && <div className="spaces-page__message spaces-page__message--error" role="alert"><p>{error || "Space details are unavailable."}</p><button type="button" className="spaces-page__secondary" onClick={loadDetails} disabled={!accountIsCurrent}><RotateCw size={14} aria-hidden="true" /> Try again</button></div>}
    </section>}
  </div>;
}

function SpaceSavedPreferences({ space, accountId, accountRef }) {
  const [expanded, setExpanded] = useState(false);
  const [preferences, setPreferences] = useState(null);
  const [draft, setDraft] = useState(EMPTY_SPACE_PREFERENCE_DRAFT);
  const [conflict, setConflict] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const activeScope = `account:${accountId}`;

  useEffect(() => {
    setExpanded(false);
    setPreferences(null);
    setDraft(EMPTY_SPACE_PREFERENCE_DRAFT);
    setConflict(null);
    setLoading(false);
    setSaving(false);
    setError("");
    setNotice("");
  }, [accountId, space.id]);

  function acceptSnapshot(snapshot, { replaceDraft = true } = {}) {
    setPreferences(snapshot);
    if (replaceDraft) setDraft(preferenceDraftFrom(snapshot));
    setConflict(null);
  }

  async function loadPreferences() {
    setLoading(true);
    setError("");
    setNotice("");
    setConflict(null);
    await Promise.resolve();
    if (accountRef.current !== accountId || getAccountScope() !== activeScope) {
      setLoading(false);
      setError("Your account changed. Reopen this Space before editing its saved preferences.");
      return;
    }
    try {
      const result = HEY.spaces.getLayoutPreferences(space.id);
      if (accountRef.current !== accountId || getAccountScope() !== activeScope) return;
      if (!result?.success || !spacePreferencesMatchAccount(result, accountId, getAccountScope(), space.id)) {
        setError(result?.error || "Saved Space preferences could not be loaded. Try again.");
        return;
      }
      acceptSnapshot(result);
    } catch {
      if (accountRef.current === accountId && getAccountScope() === activeScope) setError("Saved Space preferences could not be loaded. Try again.");
    } finally {
      if (accountRef.current === accountId && getAccountScope() === activeScope) setLoading(false);
    }
  }

  function savePreferences(event) {
    event.preventDefault();
    if (!preferences || conflict || saving) return;
    if (accountRef.current !== accountId || getAccountScope() !== activeScope || preferences.accountScope !== activeScope || preferences.spaceId !== space.id) {
      setError("Your account or Space changed. Reload saved preferences before saving.");
      return;
    }
    const parsed = Object.fromEntries(Object.entries(draft).map(([field, value]) => [field, parseSpacePreferenceDraft(value)]));
    const invalid = Object.values(parsed).find((result) => result.error);
    if (invalid) {
      setError(invalid.error);
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = HEY.spaces.updateLayoutPreferences({
        accountScope: activeScope,
        spaceId: space.id,
        expectedRevision: preferences.revision,
        preferences: Object.fromEntries(Object.entries(parsed).map(([field, parsedField]) => [field, parsedField.value])),
      });
      if (accountRef.current !== accountId || getAccountScope() !== activeScope) return;
      if (result?.code === "stale_revision" && spacePreferencesMatchAccount(result.current, accountId, getAccountScope(), space.id)) {
        setConflict(result.current);
        setError("Another tab saved newer preferences. Your draft is still unsaved; compare it with the latest values below.");
        return;
      }
      if (!result?.success || !spacePreferencesMatchAccount(result, accountId, getAccountScope(), space.id)) {
        setError(result?.error || "Preferences were not saved. Reload and try again.");
        return;
      }
      acceptSnapshot(result);
      setNotice(`Saved Space preferences at revision ${result.revision}.`);
    } catch {
      if (accountRef.current === accountId && getAccountScope() === activeScope) setError("Preferences were not saved. Reload and try again.");
    } finally {
      if (accountRef.current === accountId && getAccountScope() === activeScope) setSaving(false);
    }
  }

  const editorId = `space-preferences-${encodeURIComponent(space.id)}`;

  return (
    <div className="spaces-page__saved-preferences">
      <button type="button" className="spaces-page__membership-toggle" aria-expanded={expanded} aria-controls={editorId} onClick={() => {
        const nextExpanded = !expanded;
        setExpanded(nextExpanded);
        if (nextExpanded && !preferences && !loading) loadPreferences();
      }}>
        {expanded ? "Hide saved preferences" : "Edit saved preferences"}
      </button>
      {expanded && <section id={editorId} className="spaces-page__preferences-panel" aria-label={`Saved preferences for ${space.name}`}>
        <p className="spaces-page__membership-note">Edit this Space&apos;s saved IDs, one per line. Saving uses the current revision. Onboarding suggestions never replace these choices.</p>
        {loading && <p className="spaces-page__status" role="status"><LoaderCircle size={16} className="spaces-page__spin" aria-hidden="true" /> Loading saved preferences…</p>}
        {preferences && !loading && <form onSubmit={savePreferences}>
          <div className="spaces-page__preference-fields">
            {SPACE_PREFERENCE_FIELDS.map(([field, label, help]) => {
              const inputId = `${editorId}-${field}`;
              return <div className="spaces-page__preference-field" key={field}>
                <label htmlFor={inputId}>{label}</label>
                <p id={`${inputId}-help`}>{help} Up to {HEY.spaces.limits.maxPreferenceIdsPerCategory} IDs per category.</p>
                <textarea id={inputId} aria-describedby={`${inputId}-help`} value={draft[field]} rows={3} maxLength={HEY.spaces.limits.maxPreferenceIdsPerCategory * (HEY.spaces.limits.maxPreferenceIdLength + 1)} disabled={saving || !accountId} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} />
              </div>;
            })}
          </div>
          {conflict && <div className="spaces-page__preference-conflict" role="alert">
            <p>Latest saved revision: {conflict.revision}. Compare these values with your draft before continuing.</p>
            {SPACE_PREFERENCE_FIELDS.map(([field, label]) => <p key={field}><strong>{label}:</strong> {conflict[field].length ? conflict[field].join(", ") : "None"}</p>)}
            <div className="spaces-page__actions">
              <button type="button" className="spaces-page__secondary" onClick={() => { acceptSnapshot(conflict); setError(""); setNotice("Loaded the latest saved preferences; your draft was discarded."); }}>Load latest and discard my draft</button>
              <button type="button" className="spaces-page__secondary" onClick={() => { acceptSnapshot(conflict, { replaceDraft: false }); setError(""); setNotice(`Latest revision ${conflict.revision} loaded. Review your draft and save it when ready.`); }}>Keep my draft and review latest</button>
            </div>
          </div>}
          {error && !conflict && <p className="spaces-page__membership-error" role="alert">{error}</p>}
          {notice && <p className="spaces-page__notice" role="status"><Check size={15} aria-hidden="true" /> {notice}</p>}
          <div className="spaces-page__actions">
            <button type="button" className="spaces-page__secondary" onClick={loadPreferences} disabled={saving || loading}>Discard draft and reload</button>
            <button type="submit" className="spaces-page__primary" disabled={saving || loading || Boolean(conflict) || getAccountScope() !== activeScope}>
              {saving ? <LoaderCircle size={15} className="spaces-page__spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} Save preferences
            </button>
          </div>
          <p className="spaces-page__preference-revision">Editing revision {preferences.revision}</p>
        </form>}
        {!preferences && !loading && <div className="spaces-page__message spaces-page__message--error" role="alert"><p>{error || "Saved preferences are unavailable."}</p><button type="button" className="spaces-page__secondary" onClick={loadPreferences}><RotateCw size={14} aria-hidden="true" /> Try again</button></div>}
      </section>}
    </div>
  );
}

export default function SpacesPage() {
  const { user } = useAuth();
  const accountId = user?.id || "";
  const accountIsCurrent = Boolean(accountId && getAccountScope() === `account:${accountId}`);
  const accountRef = useRef(accountId);
  useLayoutEffect(() => {
    accountRef.current = accountId;
  }, [accountId]);

  const [spaces, setSpaces] = useState([]);
  const [loadedAccountId, setLoadedAccountId] = useState("");
  const [toolCatalog, setToolCatalog] = useState([]);
  const [toolCatalogAccountId, setToolCatalogAccountId] = useState("");
  const [toolCatalogStatus, setToolCatalogStatus] = useState("loading");
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsAccountId, setSuggestionsAccountId] = useState("");
  const [suggestionsStatus, setSuggestionsStatus] = useState("loading");
  const [suggestionsError, setSuggestionsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [creating, setCreating] = useState(false);
  const [creationPhase, setCreationPhase] = useState("");
  const [notice, setNotice] = useState("");
  const [deletePreview, setDeletePreview] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteErrorSpaceId, setDeleteErrorSpaceId] = useState("");
  const [deletingSpaceId, setDeletingSpaceId] = useState("");
  const [recoveryPreview, setRecoveryPreview] = useState(null);
  const [recoveryError, setRecoveryError] = useState("");
  const [recovering, setRecovering] = useState(false);
  const importFileRef = useRef(null);
  const [importPreview, setImportPreview] = useState(null);
  const [transferError, setTransferError] = useState("");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  const loadOnboardingSuggestions = useCallback(async () => {
    const requestedAccountId = accountId;
    setSuggestionsStatus("loading");
    setSuggestions([]);
    setSuggestionsAccountId("");
    setSuggestionsError("");
    await Promise.resolve();
    if (!requestedAccountId) {
      setSuggestionsStatus("error");
      setSuggestionsError("Sign in to view onboarding Space suggestions.");
      return;
    }
    if (accountRef.current !== requestedAccountId || getAccountScope() !== `account:${requestedAccountId}`) return;
    try {
      const result = HEY.spaces.getOnboardingSuggestions();
      if (accountRef.current !== requestedAccountId || getAccountScope() !== `account:${requestedAccountId}`) return;
      if (result?.error || result?.accountScope !== `account:${requestedAccountId}` || !Array.isArray(result.suggestions)) {
        setSuggestionsStatus("error");
        setSuggestionsAccountId(requestedAccountId);
        setSuggestionsError(result?.error || "Space suggestions could not be loaded. Try again.");
        return;
      }
      const safeSuggestions = result.suggestions.filter((suggestion) =>
        suggestion && typeof suggestion.id === "string" && typeof suggestion.label === "string"
        && suggestion.requiresConfirmation === true && suggestion.permissionsChanged === false
        && suggestion.previewRequest?.accountScope === `account:${requestedAccountId}`
        && typeof suggestion.previewRequest?.prompt === "string"
      );
      setSuggestions(safeSuggestions);
      setSuggestionsAccountId(requestedAccountId);
      setSuggestionsStatus("ready");
    } catch {
      if (accountRef.current === requestedAccountId && getAccountScope() === `account:${requestedAccountId}`) {
        setSuggestionsStatus("error");
        setSuggestionsAccountId(requestedAccountId);
        setSuggestionsError("Space suggestions could not be loaded. Try again.");
      }
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

  function previewSpaceRecovery() {
    if (!accountId || !accountIsCurrent || recovering) return;
    setRecoveryError("");
    setRecoveryPreview(null);
    const requestedScope = `account:${accountId}`;
    const result = HEY.spaces.previewRecovery({ accountScope: requestedScope });
    if (accountRef.current !== accountId || getAccountScope() !== requestedScope) return;
    const safeSpaces = Array.isArray(result?.spaces) ? result.spaces.filter((space) =>
      space && typeof space.id === "string" && typeof space.name === "string"
      && (space.status === "active" || space.status === "archived")
    ) : null;
    if (result?.accountScope !== requestedScope || typeof result?.previewId !== "string" || result.requiresConfirmation !== true || !safeSpaces || safeSpaces.length !== result.spaceCount) {
      setRecoveryError(result?.error || "A valid Space recovery preview could not be prepared.");
      return;
    }
    setRecoveryPreview({ accountId, previewId: result.previewId, spaces: safeSpaces });
  }

  function confirmSpaceRecovery() {
    if (!recoveryPreview || recoveryPreview.accountId !== accountId || !accountIsCurrent || recovering) return;
    const requestedAccountId = accountId;
    const requestedScope = `account:${requestedAccountId}`;
    setRecovering(true);
    setRecoveryError("");
    const result = HEY.spaces.confirmRecovery({ previewId: recoveryPreview.previewId, confirm: true });
    if (accountRef.current !== requestedAccountId || getAccountScope() !== requestedScope) return;
    setRecovering(false);
    setRecoveryPreview(null);
    if (result?.success !== true || result.accountScope !== requestedScope) {
      setRecoveryError(result?.error || "Space recovery could not be completed. Review again and retry.");
      return;
    }
    if (refreshSpaces()) setNotice(`Recovered ${result.spaceCount} private ${result.spaceCount === 1 ? "Space" : "Spaces"} from the last valid snapshot.`);
  }

  async function exportSpacesFile() {
    if (!accountId || !accountIsCurrent || exporting || importing || loadError) return;
    const requestedAccountId = accountId;
    const requestedScope = `account:${requestedAccountId}`;
    setExporting(true);
    setTransferError("");
    try {
      const result = HEY.spaces.export({ accountScope: requestedScope });
      if (accountRef.current !== requestedAccountId || getAccountScope() !== requestedScope) return;
      if (result?.success !== true || result.accountScope !== requestedScope || typeof result.exportJson !== "string") {
        setTransferError(result?.error || "Your private Spaces could not be exported. Try again.");
        return;
      }
      const file = new Blob([result.exportJson], { type: "application/json" });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `hey-private-spaces-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      if (accountRef.current === requestedAccountId && getAccountScope() === requestedScope) {
        setTransferError(error?.message || "Your private Spaces could not be exported. Try again.");
      }
    } finally {
      if (accountRef.current === requestedAccountId && getAccountScope() === requestedScope) setExporting(false);
    }
  }

  async function previewSpaceImport(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !accountId || !accountIsCurrent || importing || exporting || loadError) return;
    const requestedAccountId = accountId;
    const requestedScope = `account:${requestedAccountId}`;
    const maxTransferBytes = HEY.spaces.limits.maxStoredChars + 16_384;
    setImporting(true);
    setTransferError("");
    setImportPreview(null);
    try {
      if (file.size > maxTransferBytes) {
        setTransferError("This file is larger than the supported Space transfer size.");
        return;
      }
      const exportJson = await file.text();
      if (accountRef.current !== requestedAccountId || getAccountScope() !== requestedScope) return;
      const result = HEY.spaces.previewImport({ accountScope: requestedScope, exportJson });
      if (accountRef.current !== requestedAccountId || getAccountScope() !== requestedScope) return;
      const safeSpaces = Array.isArray(result?.spaces) ? result.spaces.filter((space) =>
        space && typeof space.id === "string" && typeof space.name === "string"
        && (space.status === "active" || space.status === "archived")
      ) : null;
      if (result?.accountScope !== requestedScope || typeof result?.previewId !== "string" || result.requiresConfirmation !== true || !safeSpaces || safeSpaces.length !== result.spaceCount) {
        setTransferError(result?.error || "This file could not be previewed as a valid private Space export.");
        return;
      }
      setImportPreview({ accountId: requestedAccountId, previewId: result.previewId, spaces: safeSpaces });
    } catch (error) {
      if (accountRef.current === requestedAccountId && getAccountScope() === requestedScope) {
        setTransferError(error?.message || "This file could not be read. Choose a valid Space export and try again.");
      }
    } finally {
      if (accountRef.current === requestedAccountId && getAccountScope() === requestedScope) setImporting(false);
    }
  }

  function confirmSpaceImport() {
    if (!importPreview || importPreview.accountId !== accountId || !accountIsCurrent || importing || exporting || loadError) return;
    const requestedAccountId = accountId;
    const requestedScope = `account:${requestedAccountId}`;
    setImporting(true);
    setTransferError("");
    const result = HEY.spaces.confirmImport({ previewId: importPreview.previewId, confirm: true });
    if (accountRef.current !== requestedAccountId || getAccountScope() !== requestedScope) return;
    setImporting(false);
    setImportPreview(null);
    if (result?.success !== true || result.accountScope !== requestedScope) {
      setTransferError(result?.error || "The reviewed Spaces could not be imported. Choose the file again to review and retry.");
      return;
    }
    if (refreshSpaces()) setNotice(`Imported ${result.spaceCount} private ${result.spaceCount === 1 ? "Space" : "Spaces"}.`);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    setSpaces([]);
    setToolCatalog([]);
    setToolCatalogAccountId("");
    setToolCatalogStatus("loading");
    setSuggestions([]);
    setSuggestionsAccountId("");
    setSuggestionsStatus("loading");
    setSuggestionsError("");
    setPrompt("");
    setPreview(null);
    setPreviewError("");
    setNotice("");
    setCreating(false);
    setCreationPhase("");
    setDeletePreview(null);
    setDeleteError("");
    setDeleteErrorSpaceId("");
    setDeletingSpaceId("");
    setRecoveryPreview(null);
    setRecoveryError("");
    setRecovering(false);
    setImportPreview(null);
    setTransferError("");
    setImporting(false);
    setExporting(false);

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
    loadOnboardingSuggestions();
    Promise.resolve().then(() => {
      if (!active) return;
      refreshSpaces();
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [accountId, loadOnboardingSuggestions, loadToolCatalog, refreshSpaces]);

  const createPreviewFromRequest = async (previewRequest) => {
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
      const result = HEY.spaces.previewNaturalLanguageCreation(previewRequest);
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

  const createPreview = (event) => {
    event.preventDefault();
    return createPreviewFromRequest({ prompt });
  };

  const previewSuggestion = (suggestion) => {
    if (suggestionsAccountId !== accountId || !accountIsCurrent || !suggestions.includes(suggestion)) return;
    setPrompt(suggestion.previewRequest.prompt);
    return createPreviewFromRequest(suggestion.previewRequest);
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

  const previewSpaceDeletion = async (space) => {
    if (!accountId || accountRef.current !== accountId || getAccountScope() !== `account:${accountId}` || deletingSpaceId) return;
    setDeletePreview(null);
    setDeleteError("");
    setDeleteErrorSpaceId("");
    setDeletingSpaceId(space.id);
    await Promise.resolve();
    if (accountRef.current !== accountId || getAccountScope() !== `account:${accountId}`) {
      return;
    }
    try {
      const layout = HEY.spaces.getLayoutPreferences(space.id);
      if (!spaceMembershipMatchesAccount(layout, accountId, getAccountScope(), space.id)) {
        setDeleteError(layout?.error || "This Space could not be loaded for deletion review. Try again.");
        setDeleteErrorSpaceId(space.id);
        refreshSpaces();
        return;
      }
      const result = HEY.spaces.previewDeletion({ accountScope: `account:${accountId}`, spaceId: space.id, expectedLayoutRevision: layout.revision });
      if (accountRef.current !== accountId || getAccountScope() !== `account:${accountId}`) return;
      if (!result || result.error || result.action !== "delete_private_space" || result.requiresConfirmation !== true || result.permissionsChanged !== false || result.accountScope !== `account:${accountId}` || result.space?.id !== space.id || typeof result.previewId !== "string") {
        setDeleteError(result?.error || "A safe deletion review could not be prepared. Reload this Space and try again.");
        setDeleteErrorSpaceId(space.id);
        refreshSpaces();
        return;
      }
      setDeletePreview({ ...result, accountId });
    } catch {
      if (accountRef.current === accountId && getAccountScope() === `account:${accountId}`) {
        setDeleteError("A safe deletion review could not be prepared. Try again.");
        setDeleteErrorSpaceId(space.id);
      }
    } finally {
      if (accountRef.current === accountId && getAccountScope() === `account:${accountId}`) setDeletingSpaceId("");
    }
  };

  const confirmSpaceDeletion = async () => {
    const pending = deletePreview;
    if (!spacePreviewMatchesAccount(pending, accountId, accountRef.current) || pending.accountScope !== `account:${accountId}` || deletingSpaceId) return;
    setDeletingSpaceId(pending.space.id);
    setDeleteError("");
    await Promise.resolve();
    if (!spacePreviewMatchesAccount(pending, accountId, accountRef.current) || getAccountScope() !== `account:${accountId}` || pending.accountScope !== `account:${accountId}`) {
      return;
    }
    try {
      const result = HEY.spaces.confirmDeletion({ previewId: pending.previewId, confirm: true });
      if (accountRef.current !== accountId || getAccountScope() !== `account:${accountId}`) return;
      if (!result?.success || result.accountScope !== `account:${accountId}` || result.spaceId !== pending.space.id) {
        setDeletePreview(null);
        setDeleteError(result?.error || "The Space was not deleted. Review it again before retrying.");
        setDeleteErrorSpaceId(pending.space.id);
        refreshSpaces();
        return;
      }
      setDeletePreview(null);
      setDeleteError("");
      setDeleteErrorSpaceId("");
      refreshSpaces();
      setNotice(`Deleted “${pending.space.name}”.`);
    } catch {
      if (accountRef.current === accountId && getAccountScope() === `account:${accountId}`) {
        setDeletePreview(null);
        setDeleteError("The Space was not deleted. Review it again before retrying.");
        setDeleteErrorSpaceId(pending.space.id);
        refreshSpaces();
      }
    } finally {
      if (accountRef.current === accountId && getAccountScope() === `account:${accountId}`) setDeletingSpaceId("");
    }
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

      <section className="spaces-page__suggestions" aria-labelledby="space-suggestions-title">
        <div className="spaces-page__suggestions-heading">
          <div><p className="spaces-page__eyebrow">From onboarding</p><h2 id="space-suggestions-title">Suggested Spaces</h2></div>
          <button type="button" className="spaces-page__secondary" onClick={loadOnboardingSuggestions} disabled={!accountIsCurrent || suggestionsStatus === "loading"}>
            <RotateCw size={14} aria-hidden="true" /> Refresh suggestions
          </button>
        </div>
        <p className="spaces-page__hint">Suggestions use your onboarding interests. They never change permissions or create a Space until you review and confirm.</p>
        {suggestionsStatus === "loading" && <p className="spaces-page__status" role="status" aria-live="polite"><LoaderCircle size={16} className="spaces-page__spin" aria-hidden="true" /> Loading Space suggestions…</p>}
        {suggestionsStatus === "error" && suggestionsAccountId === accountId && <div className="spaces-page__message spaces-page__message--error" role="alert"><AlertCircle size={17} aria-hidden="true" /><p>{suggestionsError}</p><button type="button" className="spaces-page__secondary" onClick={loadOnboardingSuggestions} disabled={!accountIsCurrent}><RotateCw size={14} aria-hidden="true" /> Retry</button></div>}
        {suggestionsStatus === "ready" && suggestionsAccountId === accountId && suggestions.length === 0 && <p className="spaces-page__empty-suggestions" role="status">No onboarding suggestions yet. Add interests during onboarding, or describe a Space above.</p>}
        {suggestionsStatus === "ready" && suggestionsAccountId === accountId && suggestions.length > 0 && <ul className="spaces-page__suggestion-list">{suggestions.map((suggestion) => (
          <li className="spaces-page__suggestion" key={suggestion.id}>
            <div><h3>{suggestion.label}</h3><p>Private Space · permissions unchanged</p></div>
            <button type="button" className="spaces-page__secondary" onClick={() => previewSuggestion(suggestion)} disabled={!accountIsCurrent || creating}>
              <Layers3 size={15} aria-hidden="true" /> Preview suggestion
            </button>
          </li>
        ))}</ul>}
      </section>

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
        <section className="spaces-page__transfer" aria-labelledby="space-transfer-title">
          <div className="spaces-page__transfer-copy"><h3 id="space-transfer-title">Move Spaces with a file</h3><p>Export private Spaces to a JSON file, or review a file before importing copies into this account.</p></div>
          <input ref={importFileRef} className="spaces-page__sr-only" type="file" accept=".json,application/json" aria-label="Choose a private Space export file" onChange={previewSpaceImport} />
          <div className="spaces-page__transfer-actions">
            <button type="button" className="spaces-page__secondary" onClick={exportSpacesFile} disabled={!accountIsCurrent || accountDataLoading || Boolean(loadError) || exporting || importing}>
              {exporting ? <LoaderCircle size={15} className="spaces-page__spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />} Export file
            </button>
            <button type="button" className="spaces-page__secondary" onClick={() => importFileRef.current?.click()} disabled={!accountIsCurrent || accountDataLoading || Boolean(loadError) || exporting || importing}>
              {importing ? <LoaderCircle size={15} className="spaces-page__spin" aria-hidden="true" /> : <FileUp size={15} aria-hidden="true" />} Choose file to import
            </button>
          </div>
          {transferError && <p className="spaces-page__transfer-error" role="alert"><AlertCircle size={16} aria-hidden="true" /> {transferError}</p>}
          {!accountDataLoading && importPreview?.accountId === accountId && accountIsCurrent && !loadError && <section className="spaces-page__transfer-review" aria-labelledby="space-import-review-title">
            <h4 id="space-import-review-title">Review imported Spaces</h4>
            <p>{importPreview.spaces.length} private {importPreview.spaces.length === 1 ? "Space" : "Spaces"} will be added as new copies. Your existing Spaces stay in this account, and access permissions will not change.</p>
            <ul>{importPreview.spaces.map((space) => <li key={space.id}><strong>{space.name}</strong><span>{space.status === "archived" ? "Archived" : "Active"}</span></li>)}</ul>
            <div className="spaces-page__actions">
              <button type="button" className="spaces-page__secondary" onClick={() => { setImportPreview(null); setTransferError(""); }} disabled={importing}>Cancel</button>
              <button type="button" className="spaces-page__primary" onClick={confirmSpaceImport} disabled={importing || !accountIsCurrent}>
                {importing ? <LoaderCircle size={15} className="spaces-page__spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} Import reviewed Spaces
              </button>
            </div>
          </section>}
        </section>
        {accountDataLoading && <p className="spaces-page__status" role="status" aria-live="polite"><LoaderCircle size={18} className="spaces-page__spin" aria-hidden="true" /> Loading your Spaces…</p>}
        {!accountDataLoading && loadError && <div className="spaces-page__message spaces-page__message--error" role="alert"><AlertCircle size={19} aria-hidden="true" /><p>{loadError}</p><button type="button" className="spaces-page__secondary" onClick={loadSpaces}><RotateCw size={15} aria-hidden="true" /> Try again</button><button type="button" className="spaces-page__secondary" onClick={previewSpaceRecovery} disabled={!accountIsCurrent || recovering}><RotateCw size={15} aria-hidden="true" /> Review recovery</button></div>}
        {recoveryError && !accountDataLoading && <p className="spaces-page__membership-error" role="alert">{recoveryError}</p>}
        {!accountDataLoading && recoveryPreview?.accountId === accountId && loadError && <section className="spaces-page__recovery-review" aria-labelledby="space-recovery-review-title">
          <h3 id="space-recovery-review-title">Review Space recovery</h3>
          <p>Restore {recoveryPreview.spaces.length} private {recoveryPreview.spaces.length === 1 ? "Space" : "Spaces"} from this account&apos;s last valid snapshot. This replaces the unreadable saved Space data.</p>
          {recoveryPreview.spaces.length > 0 && <ul>{recoveryPreview.spaces.map((space) => <li key={space.id}><strong>{space.name}</strong><span>{space.status === "archived" ? "Archived" : "Active"}</span></li>)}</ul>}
          {recoveryPreview.spaces.length === 0 && <p>The snapshot contains no Spaces. Confirming will restore an empty Space list.</p>}
          <div className="spaces-page__actions">
            <button type="button" className="spaces-page__secondary" onClick={() => { setRecoveryPreview(null); setRecoveryError(""); }} disabled={recovering}>Cancel</button>
            <button type="button" className="spaces-page__secondary" onClick={confirmSpaceRecovery} disabled={recovering || !accountIsCurrent}>
              {recovering ? <LoaderCircle size={15} className="spaces-page__spin" aria-hidden="true" /> : <RotateCw size={15} aria-hidden="true" />} Restore reviewed snapshot
            </button>
          </div>
        </section>}
        {!accountDataLoading && !loadError && currentSpaces.length === 0 && <div className="spaces-page__empty" role="status"><Layers3 size={23} aria-hidden="true" /><div><h3>No Spaces yet</h3><p>Describe a Space above to see a preview before you create it.</p></div></div>}
        {!accountDataLoading && !loadError && currentSpaces.length > 0 && <ul className="spaces-page__list">{currentSpaces.map((space) => <li className="spaces-page__card" key={space.id}>
          <div className="spaces-page__card-icon" aria-hidden="true"><Layers3 size={18} /></div>
          <div className="spaces-page__card-copy"><h3>{space.name}</h3><p>{space.description || "Private Space"}</p></div>
          <span className="spaces-page__private-label"><LockKeyhole size={13} aria-hidden="true" /> Private</span>
          <SpaceLifecycleControl space={space} accountId={accountId} accountRef={accountRef} accountIsCurrent={accountIsCurrent} refreshSpaces={refreshSpaces} />
          <time dateTime={space.createdAt}>{formatDate(space.createdAt)}</time>
          <button type="button" className="spaces-page__delete-button" onClick={() => previewSpaceDeletion(space)} disabled={Boolean(deletingSpaceId) || !accountIsCurrent}>
            {deletingSpaceId === space.id ? <LoaderCircle size={15} className="spaces-page__spin" aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />} Delete Space
          </button>
          {deletePreview?.space?.id === space.id && deletePreview.accountId === accountId && (
            <section className="spaces-page__delete-review" aria-labelledby={`space-delete-title-${encodeURIComponent(space.id)}`}>
              <h4 id={`space-delete-title-${encodeURIComponent(space.id)}`}>Review Space deletion</h4>
              <p>Delete <strong>{deletePreview.space.name}</strong> and its saved layout and tool selections? This cannot be undone.</p>
              <p>Access permissions will not change.</p>
              <div className="spaces-page__actions">
                <button type="button" className="spaces-page__secondary" onClick={() => setDeletePreview(null)} disabled={Boolean(deletingSpaceId)}>Cancel</button>
                <button type="button" className="spaces-page__danger" onClick={confirmSpaceDeletion} disabled={Boolean(deletingSpaceId) || !accountIsCurrent}>
                  {deletingSpaceId === space.id ? <LoaderCircle size={15} className="spaces-page__spin" aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />} Delete permanently
                </button>
              </div>
            </section>
          )}
          {deleteError && deleteErrorSpaceId === space.id && <div className="spaces-page__message spaces-page__message--error" role="alert"><AlertCircle size={17} aria-hidden="true" /><p>{deleteError}</p><button type="button" className="spaces-page__secondary" onClick={() => previewSpaceDeletion(space)} disabled={Boolean(deletingSpaceId)}><RotateCw size={14} aria-hidden="true" /> Review again</button></div>}
          <SpaceToolMembership
            space={space}
            accountId={accountId}
            accountRef={accountRef}
            tools={toolCatalogAccountId === accountId ? toolCatalog : []}
            toolsStatus={toolCatalogAccountId === accountId ? toolCatalogStatus : "loading"}
            retryTools={loadToolCatalog}
          />
          <SpaceDetailsEditor space={space} accountId={accountId} accountRef={accountRef} accountIsCurrent={accountIsCurrent} />
          <SpaceSavedPreferences space={space} accountId={accountId} accountRef={accountRef} />
        </li>)}</ul>}
      </section>
    </section>
  );
}
