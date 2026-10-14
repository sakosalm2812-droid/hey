import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getAccountScope, getAccountStorageKey, subscribeAccountScope } from "../core/accountScope.js";

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

function load(modeId, scope) {
  try {
    const raw = localStorage.getItem(getAccountStorageKey(`${KEY_PREFIX}_${modeId}`, scope));
    if (!raw) return emptyWorkspace();
    const parsed = JSON.parse(raw);
    return { ...emptyWorkspace(), ...parsed };
  } catch {
    return emptyWorkspace();
  }
}

function persist(modeId, workspace, scope) {
  try {
    localStorage.setItem(getAccountStorageKey(`${KEY_PREFIX}_${modeId}`, scope), JSON.stringify(workspace));
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
  const scope = useSyncExternalStore(subscribeAccountScope, getAccountScope, getAccountScope);
  const identity = `${scope}\u0000${modeId}`;
  const [record, setRecord] = useState(() => ({ identity, value: load(modeId, scope) }));

  // Reset synchronously on account or mode changes. This prevents one render of
  // the previous workspace and avoids persisting it under the new identity.
  if (record.identity !== identity) {
    setRecord({ identity, value: load(modeId, scope) });
  }
  const state = record.identity === identity ? record.value : load(modeId, scope);

  const updateState = useCallback((update) => {
    setRecord((current) => {
      const value = current.identity === identity ? current.value : load(modeId, scope);
      return { identity, value: update(value) };
    });
  }, [identity, modeId, scope]);

  useEffect(() => {
    if (record.identity === identity) persist(modeId, record.value, scope);
  }, [identity, modeId, record, scope]);

  const patch = useCallback((update) => {
    updateState((current) => ({ ...current, ...update }));
  }, [updateState]);

  const patchPayload = useCallback((update) => {
    updateState((current) => ({ ...current, payload: { ...current.payload, ...update } }));
  }, [updateState]);

  const setStage = useCallback((stage) => patch({ stage }), [patch]);

  const log = useCallback((message, kind = "info") => {
    updateState((current) => ({
      ...current,
      activity: [
        { id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, message, kind, at: new Date().toISOString() },
        ...current.activity,
      ].slice(0, 200),
    }));
  }, [updateState]);

  const addNote = useCallback((text) => {
    if (!text?.trim()) return;
    updateState((current) => ({
      ...current,
      notes: [...current.notes, { id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, text: text.trim(), at: new Date().toISOString() }],
    }));
  }, [updateState]);

  const addItem = useCallback((item) => {
    updateState((current) => ({
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
  }, [updateState]);

  const updateItem = useCallback((id, update) => {
    updateState((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, ...update } : item)),
    }));
  }, [updateState]);

  const removeItem = useCallback((id) => {
    updateState((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== id),
    }));
  }, [updateState]);

  const addCheck = useCallback((text) => {
    if (!text?.trim()) return;
    updateState((current) => ({
      ...current,
      checks: [...current.checks, { id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, text: text.trim(), result: null }],
    }));
  }, [updateState]);

  const setCheckResult = useCallback((id, result) => {
    updateState((current) => ({
      ...current,
      checks: current.checks.map((check) => (check.id === id ? { ...check, result } : check)),
    }));
  }, [updateState]);

  const reset = useCallback(() => {
    updateState(() => emptyWorkspace());
  }, [updateState]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(getAccountStorageKey(`${KEY_PREFIX}_${modeId}`, scope));
    } catch {
      // ignore storage failure
    }
    updateState(() => emptyWorkspace());
  }, [modeId, scope, updateState]);

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
