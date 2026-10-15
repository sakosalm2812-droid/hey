import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, Check, Layers3, LoaderCircle, LockKeyhole, Plus, RotateCw, X } from "lucide-react";
import { HEY } from "./core/index.js";
import { useAuth } from "./AuthContext.jsx";
import { spacePreviewMatchesAccount, spacesForAccount } from "./spacePageAccount.js";
import "./SpacesPage.css";

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
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
    Promise.resolve().then(() => {
      if (!active) return;
      refreshSpaces();
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [accountId, refreshSpaces]);

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
        </li>)}</ul>}
      </section>
    </section>
  );
}
