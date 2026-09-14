import { useCallback, useEffect, useMemo, useState } from "react";

const KEY_PREFIX = "hey_mode_workspace";

function emptyWorkspace() {
  return {
    task: "",
    stage: 0,
    items: [],
    checks: [],
    notes: [],
    activity: [],
    payload: {},
  };
}

function load(modeId) {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}_${modeId}`);
    if (!raw) return emptyWorkspace();
    const parsed = JSON.parse(raw);
    return { ...emptyWorkspace(), ...parsed };
  } catch {
    return emptyWorkspace();
  }
}

function persist(modeId, workspace) {
  try {
    localStorage.setItem(`${KEY_PREFIX}_${modeId}`, JSON.stringify(workspace));
  } catch {
    return;
  }
}

/**
 * A per-mode workspace surface with Stages, Checks, Notes, Items, and an
 * activity log — persisted locally per mode id so every surface remembers
 * where you left off. Mirrors how each mode in the document carries its
 * own state machine.
 */
export default function useModeWorkspace(modeId) {
  const [state, setState] = useState(() => load(modeId));

  useEffect(() => {
    persist(modeId, state);
  }, [modeId, state]);

  const patch = useCallback((update) => {
    setState((current) => ({ ...current, ...update }));
  }, []);

  const patchPayload = useCallback((update) => {
    setState((current) => ({ ...current, payload: { ...current.payload, ...update } }));
  }, []);

  const setStage = useCallback((stage) => patch({ stage }), [patch]);

  const log = useCallback((message, kind = "info") => {
    setState((current) => ({
      ...current,
      activity: [
        { id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, message, kind, at: new Date().toISOString() },
        ...current.activity,
      ].slice(0, 200),
    }));
  }, []);

  const addNote = useCallback((text) => {
    if (!text?.trim()) return;
    setState((current) => ({
      ...current,
      notes: [...current.notes, { id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, text: text.trim(), at: new Date().toISOString() }],
    }));
  }, []);

  const addItem = useCallback((item) => {
    setState((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
          at: new Date().toISOString(),
          ...item,
        },
      ],
    }));
  }, []);

  const updateItem = useCallback((id, update) => {
    setState((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, ...update } : item)),
    }));
  }, []);

  const removeItem = useCallback((id) => {
    setState((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== id),
    }));
  }, []);

  const addCheck = useCallback((text) => {
    if (!text?.trim()) return;
    setState((current) => ({
      ...current,
      checks: [...current.checks, { id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, text: text.trim(), result: null }],
    }));
  }, []);

  const setCheckResult = useCallback((id, result) => {
    setState((current) => ({
      ...current,
      checks: current.checks.map((check) => (check.id === id ? { ...check, result } : check)),
    }));
  }, []);

  const reset = useCallback(() => {
    setState(emptyWorkspace());
  }, []);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(`${KEY_PREFIX}_${modeId}`);
    } catch {
      // ignore storage failure
    }
    setState(emptyWorkspace());
  }, [modeId]);

  return useMemo(
    () => ({
      state,
      patch,
      patchPayload,
      setStage,
      log,
      addNote,
      addItem,
      updateItem,
      removeItem,
      addCheck,
      setCheckResult,
      reset,
      clear,
    }),
    [state, patch, patchPayload, setStage, log, addNote, addItem, updateItem, removeItem, addCheck, setCheckResult, reset, clear],
  );
}